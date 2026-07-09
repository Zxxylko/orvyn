<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AI\GeminiService;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

class BriefingController extends Controller
{
    public function __construct(
        private GeminiService $geminiService
    ) {}

    /**
     * Get today's daily briefing.
     */
    public function today()
    {
        $user = Auth::user();
        $briefing = $user->briefings()->today()->first();

        if (!$briefing) {
            // Auto-generate if none exists yet today
            return $this->generate();
        }

        return response()->json([
            'data' => $this->briefingPayload($briefing, $this->buildContext($user)),
            'message' => 'Today\'s briefing retrieved successfully'
        ]);
    }

    /**
     * Generate today's daily briefing.
     */
    public function generate()
    {
        $user = Auth::user();

        // Check if briefing already exists to avoid duplicate work (unless they force it, which is fine)
        $briefing = $user->briefings()->today()->first();

        // 1. Gather context
        $context = $this->buildContext($user);

        // 2. Call GeminiService to get briefing data
        $briefingData = $this->geminiService->generateBriefing($user, $context);

        // 3. Save or update briefing for today
        if ($briefing) {
            $briefing->update([
                'summary_content' => $briefingData['summary'] ?? '',
                'health_metrics' => $briefingData['health_metrics'] ?? [],
                'recommended_adjustments' => $briefingData['recommended_adjustments'] ?? [],
            ]);
        } else {
            $briefing = $user->briefings()->create([
                'briefing_date' => today(),
                'summary_content' => $briefingData['summary'] ?? '',
                'health_metrics' => $briefingData['health_metrics'] ?? [],
                'recommended_adjustments' => $briefingData['recommended_adjustments'] ?? [],
            ]);
        }

        return response()->json([
            'data' => $this->briefingPayload($briefing->fresh(), $context),
            'message' => 'Today\'s briefing generated successfully'
        ]);
    }

    private function buildContext(User $user): array
    {
        $activeTasks = $user->tasks()->whereIn('status', ['pending', 'in_progress'])->get();
        $overdueTasks = $user->tasks()->overdue()->get();
        
        // Tasks completed in the last 7 days
        $completedLast7Days = $user->tasks()
            ->where('status', 'completed')
            ->where('completed_at', '>=', now()->subDays(7))
            ->get();
            
        $activeCount = $activeTasks->count();
        $overdueCount = $overdueTasks->count();
        $completedCount = $completedLast7Days->count();
        
        $totalCreated7Days = $activeCount + $completedCount;
        $completionRate = $totalCreated7Days > 0 ? round(($completedCount / $totalCreated7Days) * 100) : 0;
        
        $avgDifficulty = $activeTasks->avg('difficulty') ?? 3;

        // Map upcoming deadlines (due in the next 3 days)
        $upcomingDeadlines = $user->tasks()
            ->whereIn('status', ['pending', 'in_progress'])
            ->whereNotNull('deadline')
            ->where('deadline', '<=', now()->addDays(3))
            ->orderBy('deadline', 'asc')
            ->get()
            ->map(fn($task) => [
                'title' => $task->title,
                'deadline' => $task->deadline ? $task->deadline->toDateTimeString() : null
            ])
            ->toArray();

        $todaySchedule = $user->timeBlocks()
            ->whereBetween('start_time', [now()->startOfDay(), now()->endOfDay()])
            ->orderBy('start_time', 'asc')
            ->get()
            ->map(fn($block) => [
                'label' => $block->label,
                'type' => $block->block_type,
                'start' => $block->start_time ? $block->start_time->format('H:i') : null,
                'end' => $block->end_time ? $block->end_time->format('H:i') : null,
            ])
            ->toArray();

        $healthToday = $user->healthLogs()
            ->whereDate('log_date', today())
            ->first();

        $monthlySpend = $user->livingExpenses()
            ->whereBetween('expense_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
            ->sum('amount');

        $academicDeadlines = $user->academicTasks()
            ->whereIn('status', ['todo', 'in_progress'])
            ->whereNotNull('deadline')
            ->where('deadline', '<=', now()->addDays(7))
            ->orderBy('deadline', 'asc')
            ->limit(6)
            ->get()
            ->map(fn($task) => [
                'course' => $task->course_name,
                'title' => $task->title,
                'type' => $task->task_type,
                'deadline' => $task->deadline ? $task->deadline->toDateTimeString() : null,
            ])
            ->toArray();

        return [
            'tasks_count' => $activeCount,
            'overdue_count' => $overdueCount,
            'upcoming_deadlines' => $upcomingDeadlines,
            'completion_rate' => $completionRate,
            'avg_difficulty' => $avgDifficulty,
            'today_schedule' => $todaySchedule,
            'health_today' => $healthToday ? [
                'hydration_ml' => $healthToday->hydration_ml,
                'caffeine_mg' => $healthToday->caffeine_mg,
                'screen_time_minutes' => $healthToday->screen_time_minutes,
                'sleep_hours' => (float) $healthToday->sleep_hours,
            ] : null,
            'monthly_spend' => (float) $monthlySpend,
            'academic_deadlines' => $academicDeadlines,
        ];
    }

    private function briefingPayload($briefing, array $context): array
    {
        return [
            ...$briefing->toArray(),
            'context' => $context,
        ];
    }
}
