<?php

namespace Tests\Feature;

use App\Models\Habit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HabitControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_check_in_and_build_daily_streak(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $habitId = $this->postJson('/api/v1/habits', [
            'name' => 'Lari setiap hari',
            'category' => 'health',
            'unit' => 'run',
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Lari setiap hari')
            ->json('data.id');

        $this->postJson("/api/v1/habits/{$habitId}/check-ins", [
            'date' => now()->subDay()->toDateString(),
        ])->assertOk();

        $this->postJson("/api/v1/habits/{$habitId}/check-ins", [
            'date' => now()->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('data.current_streak', 2)
            ->assertJsonPath('data.longest_streak', 2)
            ->assertJsonPath('data.checked_in_today', true);

        $this->assertDatabaseHas('habit_check_ins', [
            'habit_id' => $habitId,
            'check_in_date' => now()->toDateString(),
        ]);
    }

    public function test_user_cannot_check_in_another_users_habit(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $habit = Habit::create([
            'user_id' => $owner->id,
            'name' => 'Private habit',
        ]);

        Sanctum::actingAs($otherUser);

        $this->postJson("/api/v1/habits/{$habit->id}/check-ins")
            ->assertForbidden();
    }
}
