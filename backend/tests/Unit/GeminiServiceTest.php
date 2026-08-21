<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\AI\GeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
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
        $service = new GeminiService;

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

    public function test_api_key_is_sent_only_in_the_header_and_is_not_logged_on_failure(): void
    {
        $apiKey = 'gemini-secret-that-must-never-appear-in-a-url-or-log';
        config([
            'ai.gemini.api_key' => $apiKey,
            'ai.gemini.base_url' => 'https://gemini.test/v1beta',
        ]);
        Log::spy();
        Http::fake([
            'https://gemini.test/*' => Http::response(['error' => 'upstream unavailable'], 503),
        ]);

        $service = new GeminiService;
        $service->parseTask('private task content');

        Http::assertSent(fn ($request) => $request->hasHeader('x-goog-api-key', $apiKey)
            && ! str_contains($request->url(), $apiKey)
            && parse_url($request->url(), PHP_URL_QUERY) === null);
        Log::shouldHaveReceived('warning')
            ->once()
            ->with('Gemini API failed, using fallback parser', ['status' => 503]);
    }
}
