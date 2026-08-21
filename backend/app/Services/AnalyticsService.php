<?php

namespace App\Services;

use App\Models\AIMemory;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class AnalyticsService
{
    // ─── Category Multipliers (Planning Fallacy CBM) ──────────────
    private const CATEGORY_MULTIPLIERS = [
        'coding' => 1.35,
        'theory' => 1.20,
        'admin' => 1.00,
    ];

    // ─── Difficulty Multipliers ───────────────────────────────────
    private const DIFFICULTY_MULTIPLIERS = [
        1 => 1.00,
        2 => 1.00,
        3 => 1.05,
        4 => 1.15,
        5 => 1.30,
    ];

    // ─── Burnout Risk Index Weights ───────────────────────────────
    private const BRI_WEIGHT_CLM = 0.40;

    private const BRI_WEIGHT_OVERDUE = 0.25;

    private const BRI_WEIGHT_REST = 0.20;

    private const BRI_WEIGHT_LATE = 0.15;

    private const BRI_CLM_MAX = 18.0;

    private const BRI_OVERDUE_MAX = 5;

    // ─── Flow State Score Weights ─────────────────────────────────
    private const FSS_WEIGHT_FOCUS = 0.40;

    private const FSS_WEIGHT_INTEGRITY = 0.35;

    private const FSS_WEIGHT_STREAK = 0.25;

    // ─── Cognitive Limits ─────────────────────────────────────────
    private const MAX_CONTINUOUS_FOCUS_MINUTES = 90;

    private const RECHARGE_BREAK_MINUTES = 20;

    private const MIN_CODING_BLOCK_MINUTES = 60;

    private const DEFAULT_DAILY_FOCUS_CAP = 300;

    // ═══════════════════════════════════════════════════════════════
    //  WORKLOAD ESTIMATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Calculate the intelligent estimated duration for a task,
     * factoring in category multiplier, difficulty, and the
     * student's personal Historical Correction Factor.
     */
    public function estimateDuration(User $user, int $baseDuration, string $category, int $difficulty): int
    {
        $profile = $user->getOrCreateProfile();

        // 1. Static category multiplier
        $categoryM = self::CATEGORY_MULTIPLIERS[$category] ?? 1.15;

        // 2. Difficulty multiplier
        $difficultyM = self::DIFFICULTY_MULTIPLIERS[$difficulty] ?? 1.05;

        // 3. Personalized Historical Correction Factor
        $hcf = $profile->getHcfForCategory($category);

        // 4. Calculate and round to nearest 15 minutes
        $estimated = $baseDuration * $categoryM * $difficultyM * $hcf;
        $rounded = (int) ceil($estimated / 15) * 15;

        // 5. Enforce minimum block sizes
        if ($category === 'coding') {
            $rounded = max(self::MIN_CODING_BLOCK_MINUTES, $rounded);
        } else {
            $rounded = max(30, $rounded);
        }

        return $rounded;
    }

    /**
     * Update the student's HCF for a category based on a completed task.
     * Uses exponential moving average for smooth learning.
     */
    public function updateHcf(User $user, string $category, int $estimatedMinutes, int $actualMinutes): void
    {
        if ($estimatedMinutes <= 0) {
            return;
        }

        $profile = $user->getOrCreateProfile();
        $ratio = $actualMinutes / $estimatedMinutes;

        // Exponential moving average with alpha = 0.2 (recent tasks matter more)
        $alpha = 0.20;
        $currentHcf = $profile->getHcfForCategory($category);
        $newHcf = round($currentHcf * (1 - $alpha) + $ratio * $alpha, 3);

        // Clamp between 0.5 and 3.0 to avoid extreme drift
        $newHcf = max(0.5, min(3.0, $newHcf));

        $field = match ($category) {
            'coding' => 'coding_hcf',
            'theory' => 'theory_hcf',
            'admin' => 'admin_hcf',
            default => null,
        };

        if ($field) {
            $profile->update([$field => $newHcf]);

            // Store as AI memory for briefing context
            AIMemory::remember(
                $user->id,
                'pattern',
                "hcf_{$category}",
                "Student's {$category} tasks typically take {$newHcf}x the estimated time.",
                min(1.0, 0.3 + ($profile->fresh()->{$field.'_hcf'} ?? 0) * 0.1)
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  BURNOUT RISK INDEX (BRI)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Calculate the multi-factor Burnout Risk Index for today.
     *
     * BRI = w_clm * (CLM/18) + w_overdue * (overdue/5) + w_rest * (1 - breakRatio) + w_late * lateNightDensity
     *
     * Returns a float between 0.0 (healthy) and 1.0 (critical).
     */
    public function calculateBRI(User $user): float
    {
        $today = now()->toDateString();

        // ─── Factor 1: Cognitive Load Metric (CLM) ────────────────
        $todayBlocks = $user->timeBlocks()
            ->whereDate('start_time', $today)
            ->with('task')
            ->get();

        $clm = 0;
        $focusMinutes = 0;
        $breakMinutes = 0;
        $lateNightMinutes = 0;
        $totalScheduledMinutes = 0;

        foreach ($todayBlocks as $block) {
            $start = Carbon::parse($block->start_time);
            $end = Carbon::parse($block->end_time);
            $durationHours = $start->diffInMinutes($end) / 60;
            $durationMins = $start->diffInMinutes($end);
            $totalScheduledMinutes += $durationMins;

            $difficulty = $block->task?->difficulty ?? 2;

            if ($block->block_type === 'break') {
                $breakMinutes += $durationMins;
            } else {
                $clm += ($durationHours * $difficulty);
                $focusMinutes += $durationMins;
            }

            // Late-night detection: any scheduling between 23:00 and 07:00
            if ($start->hour >= 23 || $start->hour < 7) {
                $lateNightMinutes += $durationMins;
            }
        }

        $clmScore = min(1.0, $clm / self::BRI_CLM_MAX);

        // ─── Factor 2: Overdue task pressure ──────────────────────
        $overdueCount = $user->tasks()
            ->whereIn('status', ['pending', 'in_progress'])
            ->where('deadline', '<', now())
            ->count();
        $overdueScore = min(1.0, $overdueCount / self::BRI_OVERDUE_MAX);

        // ─── Factor 3: Rest deficit ───────────────────────────────
        $breakRatio = ($focusMinutes > 0) ? ($breakMinutes / $focusMinutes) : 0.25;
        $restDeficit = max(0, 1.0 - ($breakRatio / 0.20)); // 20% is the healthy baseline

        // ─── Factor 4: Late-night density ─────────────────────────
        $lateNightDensity = ($totalScheduledMinutes > 0)
            ? ($lateNightMinutes / $totalScheduledMinutes)
            : 0;

        // ─── Weighted composite ───────────────────────────────────
        $bri = (self::BRI_WEIGHT_CLM * $clmScore)
             + (self::BRI_WEIGHT_OVERDUE * $overdueScore)
             + (self::BRI_WEIGHT_REST * $restDeficit)
             + (self::BRI_WEIGHT_LATE * $lateNightDensity);

        $bri = round(min(1.0, max(0.0, $bri)), 3);

        // Persist to profile
        $profile = $user->getOrCreateProfile();
        $profile->update(['burnout_risk_index' => $bri]);

        return $bri;
    }

    /**
     * Get the human-readable burnout risk level.
     */
    public function getBurnoutLevel(float $bri): string
    {
        if ($bri > 0.75) {
            return 'high';
        }
        if ($bri > 0.40) {
            return 'medium';
        }

        return 'low';
    }

    // ═══════════════════════════════════════════════════════════════
    //  FLOW STATE SCORE (FSS)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Calculate the positive Flow State Score (0-100).
     *
     * FSS = 0.40 * focusRatio + 0.35 * scheduleIntegrity + 0.25 * streakScore
     */
    public function calculateFSS(User $user): float
    {
        $profile = $user->getOrCreateProfile();

        // ─── Focus Ratio (last 7 days) ────────────────────────────
        $recentLogs = $user->focusLogs()->recentDays(7)->get();
        $totalPlanned = $recentLogs->sum('planned_minutes') ?: 1;
        $totalActual = $recentLogs->sum('actual_minutes');
        $focusRatio = min(1.0, $totalActual / $totalPlanned);

        // ─── Schedule Integrity (last 7 days) ─────────────────────
        // Ratio of time blocks that were completed without rescheduling
        $weekBlocks = $user->timeBlocks()
            ->where('start_time', '>=', now()->subDays(7))
            ->where('start_time', '<', now())
            ->where('block_type', 'task')
            ->count();

        $completedTasks7d = $user->tasks()
            ->where('status', 'completed')
            ->where('completed_at', '>=', now()->subDays(7))
            ->count();

        $scheduleIntegrity = ($weekBlocks > 0)
            ? min(1.0, $completedTasks7d / max(1, $weekBlocks))
            : 0.5; // Default to 50% if no history

        // ─── Streak Score (logarithmic) ───────────────────────────
        $streak = $profile->current_streak;
        // Log scale: 1 day = 0.15, 3 days = 0.48, 7 days = 0.85, 14 days = 1.0
        $streakScore = min(1.0, log($streak + 1, 15));

        // ─── Weighted composite ───────────────────────────────────
        $fss = (self::FSS_WEIGHT_FOCUS * $focusRatio
              + self::FSS_WEIGHT_INTEGRITY * $scheduleIntegrity
              + self::FSS_WEIGHT_STREAK * $streakScore) * 100;

        $fss = round(min(100, max(0, $fss)), 1);

        // Persist
        $profile->update(['flow_state_score' => $fss]);

        return $fss;
    }

    // ═══════════════════════════════════════════════════════════════
    //  STREAK MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Update the student's focus streak after a completed session.
     */
    public function updateStreak(User $user): void
    {
        $profile = $user->getOrCreateProfile();
        $today = now()->toDateString();
        $yesterday = now()->subDay()->toDateString();

        if ($profile->last_active_date?->toDateString() === $today) {
            // Already active today, no change needed
            return;
        }

        if ($profile->last_active_date?->toDateString() === $yesterday) {
            // Consecutive day — extend the streak
            $newStreak = $profile->current_streak + 1;
        } else {
            // Streak broken — reset to 1
            $newStreak = 1;
        }

        $profile->update([
            'current_streak' => $newStreak,
            'longest_streak' => max($profile->longest_streak, $newStreak),
            'last_active_date' => $today,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PEAK HOUR ANALYSIS (CHRONOTYPE DETECTION)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Analyze the student's focus logs to detect their peak productivity hours.
     * Returns an array of hours sorted by productivity score (descending).
     */
    public function analyzePeakHours(User $user): array
    {
        $logs = $user->focusLogs()
            ->recentDays(30)
            ->completed()
            ->get();

        if ($logs->isEmpty()) {
            // Return default standard chronotype
            return [
                'peak_hours' => [9, 10, 11, 12],
                'chronotype' => 'standard',
                'confidence' => 0.0,
            ];
        }

        // Build productivity-per-hour heatmap
        $heatmap = array_fill(0, 24, 0);

        foreach ($logs as $log) {
            $hour = $log->start_hour;
            $score = $log->actual_minutes * $log->focus_rating;
            $heatmap[$hour] += $score;
        }

        // Sort hours by score descending
        arsort($heatmap);

        // Only select hours that have a non-zero productivity score, up to 4
        $peakHours = [];
        foreach ($heatmap as $hour => $score) {
            if ($score > 0) {
                $peakHours[] = $hour;
            }
            if (count($peakHours) === 4) {
                break;
            }
        }

        if (empty($peakHours)) {
            $peakHours = [9, 10, 11, 12];
        }

        sort($peakHours);

        // Detect chronotype
        $avgPeak = count($peakHours) > 0 ? array_sum($peakHours) / count($peakHours) : 12;
        $chronotype = 'standard';
        if ($avgPeak < 10) {
            $chronotype = 'early_bird';
        } elseif ($avgPeak >= 18) {
            $chronotype = 'night_owl';
        }

        // Calculate confidence based on volume of data
        $confidence = min(1.0, $logs->count() / 30); // Full confidence after 30 sessions

        // Store chronotype as AI memory
        AIMemory::remember(
            $user->id,
            'pattern',
            'chronotype',
            "Student appears to be a {$chronotype} with peak hours around ".implode(', ', $peakHours).'.',
            $confidence
        );

        // Update profile
        $profile = $user->getOrCreateProfile();
        $profile->update(['preferred_chronotype' => $chronotype]);

        return [
            'peak_hours' => $peakHours,
            'chronotype' => $chronotype,
            'confidence' => round($confidence, 2),
            'heatmap' => $heatmap,
        ];
    }

    // ═══════════════════════════════════════════════════════════════
    //  COMPREHENSIVE ANALYTICS SNAPSHOT
    // ═══════════════════════════════════════════════════════════════

    /**
     * Generate a full analytics snapshot for the student.
     * Used by the Daily Briefing and Dashboard widgets.
     */
    public function getSnapshot(User $user): array
    {
        $profile = $user->getOrCreateProfile();

        $bri = $this->calculateBRI($user);
        $fss = $this->calculateFSS($user);
        $peakAnalysis = $this->analyzePeakHours($user);

        // Task stats
        $activeTasks = $user->tasks()->whereIn('status', ['pending', 'in_progress'])->count();
        $overdueTasks = $user->tasks()->overdue()->count();
        $completedThisWeek = $user->tasks()
            ->where('status', 'completed')
            ->where('completed_at', '>=', now()->startOfWeek())
            ->count();

        // Focus stats (this week)
        $weekLogs = $user->focusLogs()->where('started_at', '>=', now()->startOfWeek())->get();
        $totalFocusMinutes = $weekLogs->sum('actual_minutes');
        $avgRating = round($weekLogs->avg('focus_rating') ?? 3, 1);

        return [
            'burnout_risk_index' => $bri,
            'burnout_level' => $this->getBurnoutLevel($bri),
            'flow_state_score' => $fss,
            'current_streak' => $profile->current_streak,
            'longest_streak' => $profile->longest_streak,
            'chronotype' => $peakAnalysis['chronotype'],
            'peak_hours' => $peakAnalysis['peak_hours'],
            'active_tasks' => $activeTasks,
            'overdue_tasks' => $overdueTasks,
            'completed_this_week' => $completedThisWeek,
            'focus_minutes_this_week' => $totalFocusMinutes,
            'avg_focus_rating' => $avgRating,
            'hcf' => [
                'coding' => $profile->coding_hcf,
                'theory' => $profile->theory_hcf,
                'admin' => $profile->admin_hcf,
            ],
        ];
    }
}
