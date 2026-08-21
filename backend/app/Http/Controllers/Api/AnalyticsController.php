<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AnalyticsController extends Controller
{
    public function __construct(
        private AnalyticsService $analytics
    ) {}

    // ─── Analytics Snapshot (Dashboard + Briefing) ────────────────

    /**
     * GET /api/v1/analytics/snapshot
     * Returns the full analytics snapshot for the authenticated student.
     */
    public function snapshot()
    {
        $user = Auth::user();
        $data = $this->analytics->getSnapshot($user);

        return response()->json([
            'data' => $data,
        ]);
    }

    // ─── Focus Sessions ──────────────────────────────────────────

    /**
     * POST /api/v1/focus-logs
     * Record a completed focus/Pomodoro session.
     */
    public function storeFocusLog(Request $request)
    {
        $validated = $request->validate([
            'task_id' => 'nullable|uuid|exists:tasks,id',
            'planned_minutes' => 'required|integer|min:1|max:240',
            'actual_minutes' => 'required|integer|min:1|max:480',
            'focus_rating' => 'required|integer|min:1|max:5',
            'completed' => 'required|boolean',
            'session_type' => 'sometimes|string|in:pomodoro,deep_work,review',
            'started_at' => 'required|date',
            'ended_at' => 'nullable|date|after:started_at',
        ]);

        $user = Auth::user();

        if (! empty($validated['task_id']) && ! $user->tasks()->whereKey($validated['task_id'])->exists()) {
            return response()->json([
                'message' => 'Invalid task ID provided.',
            ], 403);
        }

        $log = $user->focusLogs()->create($validated);

        // Update the student's streak
        $this->analytics->updateStreak($user);

        // If the session was linked to a task, update HCF
        if ($log->task_id && $log->completed) {
            $task = $log->task;
            if ($task) {
                $this->analytics->updateHcf(
                    $user,
                    $task->category ?? 'theory',
                    $log->planned_minutes,
                    $log->actual_minutes
                );
            }
        }

        return response()->json([
            'data' => $log,
            'message' => 'Focus session logged successfully.',
        ], 201);
    }

    /**
     * GET /api/v1/focus-logs
     * List recent focus logs for the authenticated student.
     */
    public function indexFocusLogs(Request $request)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'days' => 'sometimes|integer|min:1|max:90',
        ]);
        $days = $validated['days'] ?? 30;

        $logs = $user->focusLogs()
            ->with(['task' => fn ($query) => $query
                ->where('user_id', $user->id)
                ->select('id', 'title', 'category')])
            ->recentDays($days)
            ->orderByDesc('started_at')
            ->limit(100)
            ->get();

        return response()->json([
            'data' => $logs,
        ]);
    }

    // ─── Student Profile ─────────────────────────────────────────

    /**
     * GET /api/v1/profile
     * Get the student's analytics profile.
     */
    public function profile()
    {
        $user = Auth::user();
        $profile = $user->getOrCreateProfile();

        return response()->json([
            'data' => $profile,
        ]);
    }

    /**
     * PATCH /api/v1/profile
     * Update the student's scheduling preferences.
     */
    public function updateProfile(Request $request)
    {
        $validated = $request->validate([
            'preferred_start_hour' => 'sometimes|integer|min:0|max:23',
            'preferred_end_hour' => 'sometimes|integer|min:0|max:23',
            'max_daily_focus_minutes' => 'sometimes|integer|min:60|max:720',
        ]);

        $user = Auth::user();
        $profile = $user->getOrCreateProfile();
        $profile->update($validated);

        return response()->json([
            'data' => $profile->fresh(),
            'message' => 'Profile updated.',
        ]);
    }

    // ─── Peak Hours / Chronotype ─────────────────────────────────

    /**
     * GET /api/v1/analytics/peak-hours
     * Analyze and return the student's peak productivity hours.
     */
    public function peakHours()
    {
        $user = Auth::user();
        $analysis = $this->analytics->analyzePeakHours($user);

        return response()->json([
            'data' => $analysis,
        ]);
    }
}
