<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScheduleOptimizationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_optimizer_creates_time_block_for_pending_task(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-26 08:00:00'));

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $task = Task::create([
            'user_id' => $user->id,
            'title' => 'Finish scheduler regression test',
            'deadline' => now()->addDay(),
            'status' => 'pending',
            'priority' => 'high',
            'duration_minutes' => 45,
            'difficulty' => 2,
            'category' => 'admin',
        ]);

        $response = $this->postJson('/api/v1/time-blocks/optimize');

        $response->assertOk()
            ->assertJsonPath('data.0.task_id', $task->id);

        $this->assertDatabaseHas('time_blocks', [
            'user_id' => $user->id,
            'task_id' => $task->id,
            'block_type' => 'task',
            'is_locked' => false,
        ]);
    }
}
