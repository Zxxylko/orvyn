<?php

namespace Tests\Feature;

use App\Models\LivingExpense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinanceExpenseCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_manage_own_expenses(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $createdId = $this->postJson('/api/v1/finance/expenses', [
            'amount' => 25000,
            'category' => 'food',
            'description' => 'Makan siang',
            'expense_date' => today()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('data.amount', '25000.00')
            ->assertJsonPath('data.category', 'food')
            ->json('data.id');

        $this->getJson('/api/v1/finance/expenses')
            ->assertOk()
            ->assertJsonPath('data.0.id', $createdId);

        $this->getJson("/api/v1/finance/expenses/{$createdId}")
            ->assertOk()
            ->assertJsonPath('data.description', 'Makan siang');

        $this->putJson("/api/v1/finance/expenses/{$createdId}", [
            'amount' => 36000,
            'category' => 'coffee',
            'description' => 'Ngopi tugas besar',
            'expense_date' => today()->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('data.amount', '36000.00')
            ->assertJsonPath('data.category', 'coffee');

        $this->deleteJson("/api/v1/finance/expenses/{$createdId}")
            ->assertOk();

        $this->assertDatabaseMissing('living_expenses', [
            'id' => $createdId,
        ]);
    }

    public function test_user_cannot_view_other_user_expense(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $expense = LivingExpense::create([
            'user_id' => $owner->id,
            'amount' => 50000,
            'category' => 'food',
            'description' => 'Private expense',
            'expense_date' => today(),
        ]);

        Sanctum::actingAs($viewer);

        $this->getJson("/api/v1/finance/expenses/{$expense->id}")
            ->assertForbidden();
    }
}
