<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\AI\AIManager;
use App\Services\AI\GeminiService;
use App\Services\AI\OllamaService;
use Mockery;
use Tests\TestCase;

class AIManagerSecurityTest extends TestCase
{
    public function test_cloud_fallback_never_receives_user_data_without_explicit_consent(): void
    {
        config([
            'ai.provider' => 'ollama',
            'ai.cloud_fallback_enabled' => true,
            'ai.cloud_requires_user_consent' => true,
        ]);
        $user = User::factory()->make([
            'preferences' => ['ai_cloud_processing_consent' => false],
        ]);
        $taskFallback = ['title' => 'Local deterministic task'];
        $briefingFallback = ['summary' => 'Local deterministic briefing'];

        $ollama = Mockery::mock(OllamaService::class);
        $ollama->shouldReceive('parseTask')->once()->with('private task')->andReturnNull();
        $ollama->shouldReceive('generateBriefing')->once()->with($user, ['private' => 'context'])->andReturnNull();
        $ollama->shouldReceive('generateEmbedding')->once()->with('private embedding')->andReturnNull();

        $gemini = Mockery::mock(GeminiService::class);
        $gemini->shouldNotReceive('parseTask');
        $gemini->shouldNotReceive('generateBriefing');
        $gemini->shouldNotReceive('generateEmbedding');
        $gemini->shouldReceive('deterministicTaskFallback')
            ->once()
            ->with('private task')
            ->andReturn($taskFallback);
        $gemini->shouldReceive('deterministicBriefingFallback')
            ->once()
            ->with(['private' => 'context'])
            ->andReturn($briefingFallback);

        $manager = new AIManager($ollama, $gemini);

        $this->assertSame($taskFallback, $manager->parseTask('private task', $user));
        $this->assertSame($briefingFallback, $manager->generateBriefing($user, ['private' => 'context']));
        $this->assertNull($manager->generateEmbedding('private embedding', $user));
    }

    public function test_cloud_fallback_is_available_after_the_user_explicitly_consents(): void
    {
        config([
            'ai.provider' => 'ollama',
            'ai.cloud_fallback_enabled' => true,
            'ai.cloud_requires_user_consent' => true,
        ]);
        $user = User::factory()->make([
            'preferences' => ['ai_cloud_processing_consent' => true],
        ]);
        $cloudResult = ['title' => 'Cloud result'];

        $ollama = Mockery::mock(OllamaService::class);
        $ollama->shouldReceive('parseTask')->once()->with('consented task')->andReturnNull();

        $gemini = Mockery::mock(GeminiService::class);
        $gemini->shouldReceive('parseTask')
            ->once()
            ->with('consented task')
            ->andReturn($cloudResult);
        $gemini->shouldNotReceive('deterministicTaskFallback');

        $manager = new AIManager($ollama, $gemini);

        $this->assertSame($cloudResult, $manager->parseTask('consented task', $user));
    }
}
