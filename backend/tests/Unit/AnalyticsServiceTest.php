<?php

namespace Tests\Unit;

use App\Models\FocusLog;
use App\Models\Task;
use App\Models\TimeBlock;
use App\Models\User;
use App\Services\AnalyticsService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AnalyticsServiceTest extends TestCase
{
    use RefreshDatabase;

    private AnalyticsService $analyticsService;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->analyticsService = new AnalyticsService;

        // Create user
        $this->user = User::factory()->create();
    }

    /**
     * Test estimation duration math factoring category and difficulty multipliers.
     */
    public function test_estimate_duration_calculates_correctly(): void
    {
        // 1. Default multipliers (HCF = 1.0)
        // theory base: 60 * 1.20 (category) * 1.05 (difficulty 3) * 1.0 (HCF) = 75.6 -> ceil to 15m = 90
        $duration = $this->analyticsService->estimateDuration($this->user, 60, 'theory', 3);
        $this->assertEquals(90, $duration);

        // 2. Coding minimum limit enforcement
        // coding base: 30 * 1.35 (category) * 1.00 (difficulty 2) * 1.0 (HCF) = 40.5 -> ceil to 15m = 45 -> but coding minimum is 60m
        $duration = $this->analyticsService->estimateDuration($this->user, 30, 'coding', 2);
        $this->assertEquals(60, $duration);

        // 3. Personalized HCF influence
        $profile = $this->user->getOrCreateProfile();
        $profile->update(['coding_hcf' => 1.50]); // Student takes 1.5x longer

        // coding base: 60 * 1.35 * 1.05 * 1.50 = 127.575 -> ceil to 15m = 135
        $duration = $this->analyticsService->estimateDuration($this->user, 60, 'coding', 3);
        $this->assertEquals(135, $duration);
    }

    /**
     * Test learning and updating of Historical Correction Factor (HCF).
     */
    public function test_update_hcf_uses_moving_average_and_clamps(): void
    {
        $profile = $this->user->getOrCreateProfile();

        // Initial HCF is 1.0
        $this->assertEquals(1.0, $profile->coding_hcf);

        // First task: estimated 60m, actual took 90m (ratio 1.5)
        // EMA: 1.0 * 0.8 + 1.5 * 0.2 = 0.8 + 0.3 = 1.1
        $this->analyticsService->updateHcf($this->user, 'coding', 60, 90);

        $profile->refresh();
        $this->assertEquals(1.1, $profile->coding_hcf);

        // Test boundary clamping (HCF should never exceed 3.0)
        $profile->update(['coding_hcf' => 2.9]);
        $this->analyticsService->updateHcf($this->user, 'coding', 30, 150); // ratio 5.0

        $profile->refresh();
        $this->assertEquals(3.0, $profile->coding_hcf); // Clamped at 3.0
    }

    /**
     * Test Burnout Risk Index (BRI) calculation for different workload profiles.
     */
    public function test_calculate_bri_detects_risk(): void
    {
        $today = now()->toDateString();

        // SCENARIO 1: Healthy day
        // 2 hours of difficulty 3 tasks (6 points = CLM 0.33)
        // 30 minutes of break (Break Ratio = 25%, above 20% baseline)
        // 0 overdue tasks, no late-night hours
        $task1 = Task::create([
            'id' => Str::uuid(),
            'user_id' => $this->user->id,
            'title' => 'Healthy Task 1',
            'difficulty' => 3,
            'status' => 'pending',
            'priority' => 'medium',
            'category' => 'theory',
            'duration_minutes' => 60,
        ]);

        TimeBlock::create([
            'id' => Str::uuid(),
            'user_id' => $this->user->id,
            'label' => 'Healthy Task 1 Block',
            'start_time' => Carbon::parse("$today 09:00:00"),
            'end_time' => Carbon::parse("$today 11:00:00"),
            'block_type' => 'task',
            'task_id' => $task1->id,
        ]);
        TimeBlock::create([
            'id' => Str::uuid(),
            'user_id' => $this->user->id,
            'label' => 'Short Recharge Break',
            'start_time' => Carbon::parse("$today 11:00:00"),
            'end_time' => Carbon::parse("$today 11:30:00"),
            'block_type' => 'break',
        ]);

        $briHealthy = $this->analyticsService->calculateBRI($this->user);
        $this->assertLessThan(0.40, $briHealthy);
        $this->assertEquals('low', $this->analyticsService->getBurnoutLevel($briHealthy));

        // SCENARIO 2: High Burnout Risk Day
        // Add 5 overdue tasks
        for ($i = 0; $i < 5; $i++) {
            Task::create([
                'id' => Str::uuid(),
                'user_id' => $this->user->id,
                'title' => "Overdue Task $i",
                'status' => 'pending',
                'priority' => 'high',
                'category' => 'theory',
                'difficulty' => 3,
                'deadline' => now()->subDays(2),
                'duration_minutes' => 60,
            ]);
        }

        // Add 4 hours of late-night study (difficulty 5)
        $task2 = Task::create([
            'id' => Str::uuid(),
            'user_id' => $this->user->id,
            'title' => 'Late Night Coding Session',
            'difficulty' => 5,
            'status' => 'pending',
            'priority' => 'critical',
            'category' => 'coding',
            'duration_minutes' => 240,
        ]);

        TimeBlock::create([
            'id' => Str::uuid(),
            'user_id' => $this->user->id,
            'label' => 'Late Night Session Block',
            'start_time' => Carbon::parse("$today 23:00:00"),
            'end_time' => Carbon::parse("$today 23:00:00")->addHours(4),
            'block_type' => 'task',
            'task_id' => $task2->id,
        ]);

        $briHigh = $this->analyticsService->calculateBRI($this->user);
        $this->assertGreaterThan(0.70, $briHigh);
        $this->assertEquals('high', $this->analyticsService->getBurnoutLevel($briHigh));
    }

    /**
     * Test Flow State Score (FSS) compilation and streak consistency.
     */
    public function test_calculate_fss_and_streaks(): void
    {
        $profile = $this->user->getOrCreateProfile();

        // 1. Base case: no history
        $fssBase = $this->analyticsService->calculateFSS($this->user);
        $this->assertGreaterThanOrEqual(0, $fssBase);

        // 2. High achievement case: 5-day streak, completed focus logs
        $profile->update([
            'current_streak' => 5,
            'last_active_date' => now()->subDay()->toDateString(),
        ]);

        // Log completed Pomodoro sessions
        for ($i = 1; $i <= 3; $i++) {
            FocusLog::create([
                'user_id' => $this->user->id,
                'planned_minutes' => 25,
                'actual_minutes' => 25,
                'focus_rating' => 5,
                'completed' => true,
                'started_at' => now()->subDays($i),
            ]);
        }

        $fssHigh = $this->analyticsService->calculateFSS($this->user);
        $this->assertGreaterThan($fssBase, $fssHigh);
    }

    /**
     * Test streak calculations based on activity timestamps.
     */
    public function test_streak_increases_on_consecutive_activity(): void
    {
        $profile = $this->user->getOrCreateProfile();

        // Day 1
        $profile->update([
            'current_streak' => 1,
            'last_active_date' => now()->subDay()->toDateString(),
        ]);

        // Simulate activity today
        $this->analyticsService->updateStreak($this->user);

        $profile->refresh();
        $this->assertEquals(2, $profile->current_streak);
        $this->assertEquals(2, $profile->longest_streak);

        // Simulating activity again today shouldn't increase it double
        $this->analyticsService->updateStreak($this->user);
        $profile->refresh();
        $this->assertEquals(2, $profile->current_streak);
    }

    /**
     * Test chronotype detection via historical focus log heatmap.
     */
    public function test_chronotype_shifts_to_night_owl_on_evening_focus(): void
    {
        // Log 5 completed evening focus sessions (8 PM - 10 PM)
        for ($i = 0; $i < 5; $i++) {
            FocusLog::create([
                'user_id' => $this->user->id,
                'planned_minutes' => 60,
                'actual_minutes' => 60,
                'focus_rating' => 5,
                'completed' => true,
                'started_at' => now()->subDays($i)->setTime(20, 0), // 8 PM
                'ended_at' => now()->subDays($i)->setTime(21, 0),
            ]);
        }

        $analysis = $this->analyticsService->analyzePeakHours($this->user);

        $this->assertEquals('night_owl', $analysis['chronotype']);
        $this->assertContains(20, $analysis['peak_hours']);

        $profile = $this->user->refresh()->getOrCreateProfile();
        $this->assertEquals('night_owl', $profile->preferred_chronotype);
    }
}
