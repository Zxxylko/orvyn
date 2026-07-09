<?php

namespace Tests\Feature;

use App\Models\LivingExpense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinanceBudgetTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_update_monthly_budget_and_summary_uses_it(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        LivingExpense::create([
            'user_id' => $user->id,
            'amount' => 500000,
            'category' => 'food',
            'expense_date' => today(),
        ]);

        $this->patchJson('/api/v1/finance/budget', [
            'monthly_limit' => 3000000,
        ])
            ->assertOk()
            ->assertJsonPath('data.monthly_limit', 3000000);

        $this->getJson('/api/v1/finance/summary')
            ->assertOk()
            ->assertJsonPath('data.monthly_limit', 3000000)
            ->assertJsonPath('data.remaining_budget', 2500000);
    }

    public function test_monthly_budget_requires_reasonable_bounds(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/v1/finance/budget', [
            'monthly_limit' => 1000,
        ])->assertUnprocessable();
    }
}
