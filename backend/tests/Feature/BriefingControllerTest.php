<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BriefingControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_today_generates_safe_fallback_briefing_without_gemini_key(): void
    {
        config(['ai.gemini.api_key' => null]);

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        Task::create([
            'user_id' => $user->id,
            'title' => 'Finish AI briefing test',
            'deadline' => now()->addDay(),
            'status' => 'pending',
            'priority' => 'high',
            'duration_minutes' => 60,
            'difficulty' => 3,
            'category' => 'theory',
        ]);

        $response = $this->getJson('/api/v1/briefing/today');

        $response->assertOk()
            ->assertJsonPath('data.health_metrics.burnout_risk', 'low')
            ->assertJsonPath('data.health_metrics.workload_balance', 'underloaded')
            ->assertJsonCount(2, 'data.recommended_adjustments');

        $this->assertDatabaseHas('ai_briefings', [
            'user_id' => $user->id,
            'briefing_date' => today()->toDateString(),
        ]);
    }
}
