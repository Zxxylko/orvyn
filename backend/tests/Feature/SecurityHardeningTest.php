<?php

namespace Tests\Feature;

use App\Models\HealthLog;
use App\Models\LivingExpense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
