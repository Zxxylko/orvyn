<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TimeBlock;
use App\Models\Task;
use App\Services\AnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class TimeBlockController extends Controller
{
    public function __construct(
        private AnalyticsService $analytics
    ) {}
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $query = Auth::user()->timeBlocks()->with('task');

        // Optional filtering by start and end date/time
        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('start_time', [
                Carbon::parse($request->start_date)->startOfDay(),
                Carbon::parse($request->end_date)->endOfDay()
            ]);
        }

        $timeBlocks = $query->orderBy('start_time', 'asc')->get();

        return response()->json([
            'data' => $timeBlocks,
            'message' => 'Time blocks retrieved successfully'
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'label' => 'required|string|max:255',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
            'task_id' => 'nullable|uuid|exists:tasks,id',
            'is_locked' => 'nullable|boolean',
            'block_type' => 'nullable|string|in:task,break,class,personal,study',
        ]);

        // If task_id is provided, verify it belongs to this user
        if (!empty($validated['task_id'])) {
            $task = Auth::user()->tasks()->find($validated['task_id']);
            if (!$task) {
                return response()->json(['message' => 'Invalid task ID provided.'], 403);
            }
        }

        $timeBlock = Auth::user()->timeBlocks()->create($validated);

        return response()->json([
            'data' => $timeBlock->load('task'),
            'message' => 'Time block created successfully'
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(TimeBlock $timeBlock)
    {
        $this->authorize('view', $timeBlock);

        return response()->json([
            'data' => $timeBlock->load('task'),
            'message' => 'Time block retrieved successfully'
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, TimeBlock $timeBlock)
    {
        $this->authorize('update', $timeBlock);

        $validated = $request->validate([
            'label' => 'sometimes|required|string|max:255',
            'start_time' => 'sometimes|required|date',
            'end_time' => 'sometimes|required|date|after:start_time',
            'task_id' => 'nullable|uuid|exists:tasks,id',
            'is_locked' => 'nullable|boolean',
            'block_type' => 'nullable|string|in:task,break,class,personal,study',
        ]);

        if (isset($validated['task_id']) && !empty($validated['task_id'])) {
            $task = Auth::user()->tasks()->find($validated['task_id']);
            if (!$task) {
                return response()->json(['message' => 'Invalid task ID provided.'], 403);
            }
        }

        $timeBlock->update($validated);

        return response()->json([
            'data' => $timeBlock->load('task'),
            'message' => 'Time block updated successfully'
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(TimeBlock $timeBlock)
    {
        $this->authorize('delete', $timeBlock);

        $timeBlock->delete();

        return response()->json([
            'message' => 'Time block deleted successfully'
        ]);
    }

    /**
     * Optimize user's schedule. Auto-schedules pending tasks into available gaps.
     */
    public function optimize(Request $request)
    {
        $user = Auth::user();

        // 1. Get user's active, pending/in_progress tasks
        $tasks = $user->tasks()
            ->whereIn('status', ['pending', 'in_progress'])
            ->orderBy('deadline', 'asc')
            ->orderBy('priority', 'desc')
            ->get();

        if ($tasks->isEmpty()) {
            return response()->json([
                'message' => 'No tasks to schedule. Create some tasks first!',
                'data' => []
            ]);
        }

        // 2. Fetch existing time blocks for the next 7 days
        $startRange = now()->startOfDay();
        $endRange = now()->addDays(7)->endOfDay();

        // Delete any existing auto-generated (unlocked) blocks in this range to avoid double scheduling
        $user->timeBlocks()
            ->whereBetween('start_time', [$startRange, $endRange])
            ->where('is_locked', false)
            ->whereIn('block_type', ['task', 'break'])
            ->delete();

        // Fetch remaining fixed (locked or manual class/personal) blocks
        $fixedBlocks = $user->timeBlocks()
            ->whereBetween('start_time', [$startRange, $endRange])
            ->orderBy('start_time', 'asc')
            ->get();

        // Initializing daily metrics
        $dailyClm = [];
        $dailyStudyMinutes = [];
        $lastScheduledEnd = [];

        // Pre-calculate fixed blocks' impact on CLM & scheduling limits
        for ($dayOffset = 0; $dayOffset < 7; $dayOffset++) {
            $dayStr = now()->addDays($dayOffset)->toDateString();
            $dailyClm[$dayStr] = 0;
            $dailyStudyMinutes[$dayStr] = 0;
            $lastScheduledEnd[$dayStr] = null;

            foreach ($fixedBlocks as $fixed) {
                if (Carbon::parse($fixed->start_time)->toDateString() === $dayStr) {
                    $durationHours = Carbon::parse($fixed->start_time)->diffInMinutes(Carbon::parse($fixed->end_time)) / 60;
                    $difficulty = 2; // Default baseline difficulty for fixed activities
                    if ($fixed->block_type === 'class') {
                        $difficulty = 3;
                    }
                    $dailyClm[$dayStr] += ($durationHours * $difficulty);
                    
                    if ($fixed->block_type === 'task' || $fixed->block_type === 'study') {
                        $dailyStudyMinutes[$dayStr] += ($durationHours * 60);
                    }
                }
            }
        }

        $newBlocks = [];

        // Get the student's profile for personalized scheduling
        $profile = $user->getOrCreateProfile();
        $dailyFocusCap = $profile->max_daily_focus_minutes;

        foreach ($tasks as $task) {
            // Use AnalyticsService for personalized duration estimation (includes HCF)
            $category = $task->category ?? 'theory';
            $difficulty = $task->difficulty ?? 3;
            $baseDuration = $task->duration_minutes ?? 60;

            $bufferedDuration = $this->analytics->estimateDuration($user, $baseDuration, $category, $difficulty);

            // Define circadian rhythm windows based on task cognitive load
            $preferredWindow = 'late';
            if ($difficulty >= 4 || $category === 'coding') {
                $preferredWindow = 'morning'; // mornings for deep focus
            } elseif ($difficulty <= 2 || $category === 'admin') {
                $preferredWindow = 'afternoon'; // light administrative time
            }

            $scheduled = false;

            // Try scheduling across the next 7 days
            for ($dayOffset = 0; $dayOffset < 7 && !$scheduled; $dayOffset++) {
                $date = now()->addDays($dayOffset);
                $dayStr = $date->toDateString();

                // Enforce Daily Cognitive Load Limit (CLM) to prevent burnout
                if ($dailyClm[$dayStr] >= 18) {
                    continue; // Skip this day, user is fully loaded!
                }

                // Define Carbon datetime objects for the day's boundaries
                $morningStart = Carbon::create($date->year, $date->month, $date->day, 9, 0, 0);
                $morningEnd = Carbon::create($date->year, $date->month, $date->day, 13, 0, 0);
                
                $afternoonStart = Carbon::create($date->year, $date->month, $date->day, 13, 0, 0);
                $afternoonEnd = Carbon::create($date->year, $date->month, $date->day, 15, 0, 0);
                
                $lateStart = Carbon::create($date->year, $date->month, $date->day, 15, 0, 0);
                $lateEnd = Carbon::create($date->year, $date->month, $date->day, 18, 0, 0);

                // Build a list of windows to try in order of preference
                $windows = [];
                if ($preferredWindow === 'morning') {
                    $windows = [
                        ['start' => $morningStart, 'end' => $morningEnd, 'label' => 'Morning Deep Work'],
                        ['start' => $lateStart, 'end' => $lateEnd, 'label' => 'Late Afternoon Work'],
                        ['start' => $afternoonStart, 'end' => $afternoonEnd, 'label' => 'Afternoon Fillers']
                    ];
                } elseif ($preferredWindow === 'afternoon') {
                    $windows = [
                        ['start' => $afternoonStart, 'end' => $afternoonEnd, 'label' => 'Afternoon Fillers'],
                        ['start' => $lateStart, 'end' => $lateEnd, 'label' => 'Late Afternoon Work'],
                        ['start' => $morningStart, 'end' => $morningEnd, 'label' => 'Morning Deep Work']
                    ];
                } else {
                    $windows = [
                        ['start' => $lateStart, 'end' => $lateEnd, 'label' => 'Late Afternoon Work'],
                        ['start' => $morningStart, 'end' => $morningEnd, 'label' => 'Morning Deep Work'],
                        ['start' => $afternoonStart, 'end' => $afternoonEnd, 'label' => 'Afternoon Fillers']
                    ];
                }

                foreach ($windows as $window) {
                    if ($scheduled) break;

                    $slotStart = $window['start']->copy();
                    $windowEnd = $window['end']->copy();

                    // Adjust for past times if scheduling for today
                    if ($slotStart->isPast()) {
                        if (now()->gt($windowEnd)) {
                            continue;
                        }
                        $slotStart = now()->ceilMinutes(15);
                        if ($slotStart->lt($window['start'])) {
                            $slotStart = $window['start']->copy();
                        }
                    }

                    while ($slotStart->copy()->addMinutes($bufferedDuration)->lte($windowEnd) && !$scheduled) {
                        $potentialEnd = $slotStart->copy()->addMinutes($bufferedDuration);
                        $overlap = false;

                        // Enforce 15-minute transitional context buffers between scheduled items
                        if ($lastScheduledEnd[$dayStr] !== null) {
                            $bufferDiff = Carbon::parse($lastScheduledEnd[$dayStr])->diffInMinutes($slotStart);
                            if ($bufferDiff < 15) {
                                $slotStart = Carbon::parse($lastScheduledEnd[$dayStr])->copy()->addMinutes(15);
                                continue;
                            }
                        }

                        // Check overlap with fixed blocks
                        foreach ($fixedBlocks as $fixed) {
                            $fixedStart = Carbon::parse($fixed->start_time);
                            $fixedEnd = Carbon::parse($fixed->end_time)->copy()->addMinutes(15); // Add buffer after fixed blocks too

                            if ($slotStart->lt($fixedEnd) && $potentialEnd->gt($fixedStart)) {
                                $overlap = true;
                                $slotStart = $fixedEnd->copy()->ceilMinutes(15);
                                break;
                            }
                        }

                        // Check overlap with newly scheduled blocks
                        if (!$overlap) {
                            foreach ($newBlocks as $newB) {
                                $newStart = Carbon::parse($newB['start_time']);
                                $newEnd = Carbon::parse($newB['end_time'])->copy()->addMinutes(15); // Enforce buffer

                                if ($slotStart->lt($newEnd) && $potentialEnd->gt($newStart)) {
                                    $overlap = true;
                                    $slotStart = $newEnd->copy()->ceilMinutes(15);
                                    break;
                                }
                            }
                        }

                        if (!$overlap) {
                            // Check if a Recharge Break needs to be auto-injected
                            // Enforce 20-minute breaks after 90 minutes of continuous study or 120 cumulative study minutes
                            if ($dailyStudyMinutes[$dayStr] >= 90) {
                                // Inject break block
                                $breakStart = $slotStart->copy();
                                $breakEnd = $breakStart->copy()->addMinutes(20);

                                $newBlocks[] = [
                                    'user_id' => $user->id,
                                    'task_id' => null,
                                    'label' => 'Auto Recharge Break',
                                    'start_time' => $breakStart->toDateTimeString(),
                                    'end_time' => $breakEnd->toDateTimeString(),
                                    'is_locked' => false,
                                    'block_type' => 'break',
                                ];

                                $dailyStudyMinutes[$dayStr] = 0; // Reset continuous timer
                                $slotStart = $breakEnd->copy()->addMinutes(15); // Advance slot past break and buffer
                                continue;
                            }

                            // Safe to schedule!
                            $newBlockData = [
                                'user_id' => $user->id,
                                'task_id' => $task->id,
                                'label' => 'Focus: ' . $task->title,
                                'start_time' => $slotStart->toDateTimeString(),
                                'end_time' => $potentialEnd->toDateTimeString(),
                                'is_locked' => false,
                                'block_type' => 'task',
                            ];

                            $newBlocks[] = $newBlockData;
                            
                            // Update tracking metrics
                            $taskClm = ($bufferedDuration / 60) * $difficulty;
                            $dailyClm[$dayStr] += $taskClm;
                            $dailyStudyMinutes[$dayStr] += $bufferedDuration;
                            $lastScheduledEnd[$dayStr] = $potentialEnd->toDateTimeString();

                            $scheduled = true;
                        }
                    }
                }
            }
        }

        // Insert new blocks into database
        $createdBlocks = [];
        foreach ($newBlocks as $blockData) {
            $createdBlocks[] = TimeBlock::create($blockData);
        }

        // Broadcast real-time schedule update event to Reverb/Echo
        try {
            // Optional Reverb broadcast if you have a TimeBlocksOptimized event
            // broadcast(new TimeBlocksOptimized($user));
        } catch (\Exception $e) {
            // Silently log or ignore broadcasting errors
        }

        return response()->json([
            'data' => TimeBlock::whereIn('id', collect($createdBlocks)->pluck('id'))->with('task')->get(),
            'message' => 'Cognitive Schedule Optimized! Scheduled ' . count($createdBlocks) . ' tasks with Planning Fallacy safety buffers.'
        ]);
    }
}
