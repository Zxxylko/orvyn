<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\AI\GeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeminiServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_generate_briefing_normalizes_model_output_for_ui(): void
    {
        config(['ai.gemini.api_key' => 'test-key']);

        Http::fake([
            '*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                [
                                    'text' => json_encode([
                                        'summary' => ['First priority', 'Second priority'],
                                        'health_metrics' => [
                                            'burnout_risk' => 'extreme',
                                            'workload_balance' => 'too-much',
                                            'stress_level' => 99,
                                            'cognitive_load' => 40,
                                        ],
                                        'recommended_adjustments' => [
                                            ['text' => 'Move overdue work into the first focus block.'],
                                            ['recommendation' => 'Add one recovery break after deep work.'],
                                        ],
                                    ]),
                                ],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $user = User::factory()->create();
        $service = new GeminiService();

        $briefing = $service->generateBriefing($user, [
            'tasks_count' => 4,
            'overdue_count' => 1,
            'upcoming_deadlines' => [],
            'completion_rate' => 20,
            'avg_difficulty' => 3,
        ]);

        $this->assertSame("First priority\n\nSecond priority", $briefing['summary']);
        $this->assertSame('low', $briefing['health_metrics']['burnout_risk']);
        $this->assertSame('balanced', $briefing['health_metrics']['workload_balance']);
        $this->assertSame(10.0, $briefing['health_metrics']['stress_level']);
        $this->assertSame(18.0, $briefing['health_metrics']['cognitive_load']);
        $this->assertSame([
            'Move overdue work into the first focus block.',
            'Add one recovery break after deep work.',
        ], $briefing['recommended_adjustments']);
    }
}
