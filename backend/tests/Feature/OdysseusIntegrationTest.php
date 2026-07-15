<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\TestCase;

class OdysseusIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_agent_token_command_creates_a_scoped_read_only_token(): void
    {
        $user = User::factory()->create();

        $exitCode = Artisan::call('orvyn:issue-agent-token', [
            'user' => $user->email,
            '--name' => 'odysseus-readonly',
            '--read-only' => true,
            '--expires' => 30,
        ]);

        $this->assertSame(0, $exitCode);
        $token = $user->tokens()->sole();
        $this->assertSame('odysseus-readonly', $token->name);
        $this->assertSame(['orvyn:read'], $token->abilities);
        $this->assertNotNull($token->expires_at);
        $this->assertStringContainsString('Token agent berhasil dibuat', Artisan::output());
    }

    public function test_read_only_agent_token_can_read_but_cannot_mutate(): void
    {
        $user = User::factory()->create();
        $plainTextToken = $user->createToken('odysseus-readonly', ['orvyn:read'])->plainTextToken;

        $this->withToken($plainTextToken)
            ->getJson('/api/v1/tasks')
            ->assertOk();

        $this->withToken($plainTextToken)
            ->postJson('/api/v1/tasks/smart-parse', ['input' => 'Laporan keamanan besok'])
            ->assertForbidden()
            ->assertJsonPath('required_ability', 'orvyn:write');
    }

    public function test_agent_token_command_can_write_an_mcp_env_without_printing_the_secret(): void
    {
        $user = User::factory()->create();
        $envFile = storage_path('framework/testing/odysseus-'.Str::uuid().'.env');

        try {
            $exitCode = Artisan::call('orvyn:issue-agent-token', [
                'user' => $user->id,
                '--name' => 'odysseus-local',
                '--expires' => 30,
                '--replace' => true,
                '--env-file' => $envFile,
            ]);

            $this->assertSame(0, $exitCode);
            $contents = File::get($envFile);
            preg_match('/^ORVYN_API_TOKEN=(.+)$/m', $contents, $match);
            $plainTextToken = $match[1] ?? '';

            $this->assertNotSame('', $plainTextToken);
            $this->assertNotNull($user->tokens()->where('name', 'odysseus-local')->first());
            $this->assertStringContainsString('ORVYN_API_BASE_URL=http://127.0.0.1:8000/api/v1', $contents);
            $this->assertStringNotContainsString($plainTextToken, Artisan::output());
        } finally {
            File::delete($envFile);
        }
    }

    public function test_read_write_agent_token_can_mutate_student_data(): void
    {
        config(['ai.provider' => 'gemini', 'ai.gemini.api_key' => null]);
        $user = User::factory()->create();
        $plainTextToken = $user->createToken('odysseus', ['orvyn:read', 'orvyn:write'])->plainTextToken;

        $this->withToken($plainTextToken)
            ->postJson('/api/v1/tasks/smart-parse', ['input' => 'Laporan keamanan besok'])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Laporan keamanan besok');

        $this->assertDatabaseHas('tasks', [
            'user_id' => $user->id,
            'title' => 'Laporan keamanan besok',
        ]);
    }
}
