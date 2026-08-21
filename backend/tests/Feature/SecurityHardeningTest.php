<?php

namespace Tests\Feature;

use App\Events\BriefingGenerated;
use App\Events\TaskCreated;
use App\Events\TaskUpdated;
use App\Jobs\GenerateEmbeddingJob;
use App\Models\AcademicTask;
use App\Models\CampusSchedule;
use App\Models\HealthLog;
use App\Models\LivingExpense;
use App\Models\Task;
use App\Models\TimeBlock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Attributes\DeleteWhenMissingModels;
use Illuminate\Support\Facades\Broadcast;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_responses_include_security_headers(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/user/me')
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    }

    public function test_web_login_preflight_allows_the_device_name_header(): void
    {
        $response = $this->call(
            'OPTIONS',
            '/api/v1/auth/demo-login',
            server: [
                'HTTP_ORIGIN' => 'http://127.0.0.1:5173',
                'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
                'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type,x-device-name',
            ],
        );

        $response->assertNoContent();

        $allowedHeaders = strtolower((string) $response->headers->get('Access-Control-Allow-Headers'));

        $this->assertStringContainsString('x-device-name', $allowedHeaders);
    }

    public function test_broadcast_channels_require_sanctum(): void
    {
        $owner = User::factory()->create();

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-App.Models.User.{$owner->id}",
        ])->assertUnauthorized();
    }

    public function test_broadcast_channels_only_authorize_the_owner(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-reverb-key',
            'broadcasting.connections.reverb.secret' => 'test-reverb-secret',
            'broadcasting.connections.reverb.app_id' => 'test-reverb-app',
        ]);
        Broadcast::channel('App.Models.User.{id}', fn ($user, $id) => (string) $user->getAuthIdentifier() === (string) $id);

        $owner = User::factory()->create();
        Sanctum::actingAs($owner);

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => "private-App.Models.User.{$owner->id}",
        ])->assertOk();

        $this->postJson('/broadcasting/auth', [
            'socket_id' => '1234.5678',
            'channel_name' => 'private-App.Models.User.not-the-owner',
        ])->assertForbidden();
    }

    public function test_model_backed_queue_work_is_discarded_when_the_model_was_deleted(): void
    {
        foreach ([GenerateEmbeddingJob::class, TaskCreated::class, TaskUpdated::class, BriefingGenerated::class] as $class) {
            $attributes = (new \ReflectionClass($class))->getAttributes(DeleteWhenMissingModels::class);

            $this->assertNotEmpty($attributes, "{$class} must discard stale model-backed queue work.");
        }
    }

    public function test_academic_task_mirror_uses_scheduler_safe_status(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/academic-tasks', [
            'course_name' => 'Security Engineering',
            'task_type' => 'tp',
            'title' => 'Threat model assignment',
            'status' => 'todo',
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('academic_tasks', [
            'user_id' => $user->id,
            'status' => 'todo',
        ]);

        $this->assertDatabaseHas('tasks', [
            'user_id' => $user->id,
            'title' => '[Security Engineering] Threat model assignment',
            'status' => 'pending',
        ]);
    }

    public function test_unbounded_list_parameters_are_rejected(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/finance/expenses?limit=100000')
            ->assertUnprocessable();

        $this->getJson('/api/v1/health/logs?days=100000')
            ->assertUnprocessable();

        $this->getJson('/api/v1/focus-logs?days=100000')
            ->assertUnprocessable();
    }

    public function test_users_cannot_modify_other_users_finance_or_health_records(): void
    {
        $owner = User::factory()->create();
        $attacker = User::factory()->create();

        $expense = LivingExpense::create([
            'user_id' => $owner->id,
            'amount' => 50000,
            'category' => 'food',
            'expense_date' => today(),
        ]);

        $healthLog = HealthLog::create([
            'user_id' => $owner->id,
            'log_date' => today(),
            'hydration_ml' => 500,
        ]);

        Sanctum::actingAs($attacker);

        $this->putJson("/api/v1/finance/expenses/{$expense->id}", [
            'amount' => 1,
        ])->assertForbidden();

        $this->deleteJson("/api/v1/finance/expenses/{$expense->id}")
            ->assertForbidden();

        $this->putJson("/api/v1/health/logs/{$healthLog->id}", [
            'hydration_ml' => 1,
        ])->assertForbidden();

        $this->deleteJson("/api/v1/health/logs/{$healthLog->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('living_expenses', [
            'id' => $expense->id,
            'amount' => 50000,
        ]);
        $this->assertDatabaseHas('health_logs', [
            'id' => $healthLog->id,
            'hydration_ml' => 500,
        ]);
    }

    public function test_users_can_view_their_own_academic_task_and_health_log(): void
    {
        $user = User::factory()->create();
        $academicTask = AcademicTask::create([
            'user_id' => $user->id,
            'course_name' => 'Mobile Programming',
            'task_type' => 'praktikum',
            'title' => 'React Native parity',
            'status' => 'todo',
        ]);
        $healthLog = HealthLog::create([
            'user_id' => $user->id,
            'log_date' => today(),
            'hydration_ml' => 1200,
        ]);

        Sanctum::actingAs($user);

        $this->getJson("/api/v1/academic-tasks/{$academicTask->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $academicTask->id);

        $this->getJson("/api/v1/health/logs/{$healthLog->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $healthLog->id);
    }

    public function test_users_cannot_view_other_users_academic_task_or_health_log(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $academicTask = AcademicTask::create([
            'user_id' => $owner->id,
            'course_name' => 'Private Course',
            'task_type' => 'exam',
            'title' => 'Private exam',
            'status' => 'todo',
        ]);
        $healthLog = HealthLog::create([
            'user_id' => $owner->id,
            'log_date' => today(),
            'sleep_hours' => 5,
        ]);

        Sanctum::actingAs($viewer);

        $this->getJson("/api/v1/academic-tasks/{$academicTask->id}")
            ->assertForbidden();

        $this->getJson("/api/v1/health/logs/{$healthLog->id}")
            ->assertForbidden();
    }

    public function test_multiword_resources_bind_to_the_requested_owned_model(): void
    {
        $user = User::factory()->create();
        $timeBlock = TimeBlock::create([
            'user_id' => $user->id,
            'label' => 'Deep work',
            'start_time' => now()->addHour(),
            'end_time' => now()->addHours(2),
            'block_type' => 'study',
            'is_locked' => true,
        ]);
        $campusSchedule = CampusSchedule::create([
            'user_id' => $user->id,
            'course_name' => 'Mobile Programming',
            'day_of_week' => 5,
            'start_time' => '09:00',
            'end_time' => '11:00',
            'class_type' => 'lab',
            'commute_minutes' => 30,
            'prep_minutes' => 20,
            'is_active' => true,
        ]);

        Sanctum::actingAs($user);

        $this->getJson("/api/v1/time-blocks/{$timeBlock->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $timeBlock->id);

        $this->putJson("/api/v1/campus-schedules/{$campusSchedule->id}", [
            'course_name' => 'Advanced Mobile Programming',
        ])->assertOk()
            ->assertJsonPath('data.id', $campusSchedule->id)
            ->assertJsonPath('data.course_name', 'Advanced Mobile Programming');
    }

    public function test_focus_logs_cannot_reference_another_users_task(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $privateTask = Task::create([
            'user_id' => $owner->id,
            'title' => 'Private focus target',
            'status' => 'pending',
            'priority' => 'medium',
        ]);

        Sanctum::actingAs($viewer);

        $this->postJson('/api/v1/focus-logs', [
            'task_id' => $privateTask->id,
            'planned_minutes' => 25,
            'actual_minutes' => 20,
            'focus_rating' => 4,
            'completed' => true,
            'session_type' => 'pomodoro',
            'started_at' => now()->subMinutes(20)->toISOString(),
            'ended_at' => now()->toISOString(),
        ])->assertForbidden();

        $this->assertDatabaseCount('focus_logs', 0);
    }

    public function test_focus_logs_only_embed_tasks_owned_by_the_current_user(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $privateTask = Task::create([
            'user_id' => $owner->id,
            'title' => 'Private focus target',
            'status' => 'pending',
            'priority' => 'medium',
        ]);
        $ownTask = Task::create([
            'user_id' => $viewer->id,
            'title' => 'My focus target',
            'status' => 'pending',
            'priority' => 'medium',
        ]);

        $viewer->focusLogs()->create([
            'task_id' => $privateTask->id,
            'planned_minutes' => 25,
            'actual_minutes' => 20,
            'focus_rating' => 4,
            'completed' => true,
            'session_type' => 'pomodoro',
            'started_at' => now()->subHour(),
            'ended_at' => now()->subMinutes(40),
        ]);

        Sanctum::actingAs($viewer);

        $this->postJson('/api/v1/focus-logs', [
            'task_id' => $ownTask->id,
            'planned_minutes' => 25,
            'actual_minutes' => 25,
            'focus_rating' => 5,
            'completed' => true,
            'session_type' => 'pomodoro',
            'started_at' => now()->subMinutes(30),
            'ended_at' => now()->subMinutes(5),
        ])->assertCreated()
            ->assertJsonPath('data.task_id', $ownTask->id);

        $this->getJson('/api/v1/focus-logs')
            ->assertOk()
            ->assertJsonPath('data.0.task.id', $ownTask->id)
            ->assertJsonPath('data.0.task.title', 'My focus target')
            ->assertJsonPath('data.1.task', null)
            ->assertJsonMissing(['title' => 'Private focus target']);
    }
}
