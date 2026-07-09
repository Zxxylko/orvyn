<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TaskControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_update_and_delete_own_task(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $task = $this->createTaskFor($user);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'status' => 'completed',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');

        $this->deleteJson("/api/v1/tasks/{$task->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Task deleted successfully');

        $this->assertDatabaseMissing('tasks', ['id' => $task->id]);
    }

    public function test_user_cannot_update_or_delete_another_users_task(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        Sanctum::actingAs($otherUser);

        $task = $this->createTaskFor($owner);

        $this->putJson("/api/v1/tasks/{$task->id}", [
            'status' => 'completed',
        ])->assertForbidden();

        $this->deleteJson("/api/v1/tasks/{$task->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('tasks', ['id' => $task->id]);
    }

    private function createTaskFor(User $user): Task
    {
        return Task::create([
            'user_id' => $user->id,
            'title' => 'Controller authorization task',
            'status' => 'pending',
            'priority' => 'medium',
            'duration_minutes' => 60,
            'difficulty' => 3,
            'category' => 'theory',
        ]);
    }
}
