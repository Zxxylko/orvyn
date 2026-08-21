<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WhatsAppConnection;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsAppSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_verification_code_is_owned_by_the_requesting_user(): void
    {
        config([
            'whatsapp.base_url' => 'http://whatsapp.test',
            'whatsapp.service_token' => 'verification-service-token',
            'whatsapp.verification_ttl_minutes' => 10,
        ]);
        Http::fake([
            'http://whatsapp.test/messages' => Http::response(['id' => 'verification-message'], 201),
        ]);

        $owner = User::factory()->create();
        $attacker = User::factory()->create();
        Sanctum::actingAs($owner);

        $this->postJson('/api/v1/integrations/whatsapp/verification/request', [
            'phone_number' => '0812 3456 7890',
        ])
            ->assertOk()
            ->assertJsonPath('data.settings.phone_number', '+6281234567890')
            ->assertJsonPath('data.settings.verified', false);

        $code = null;
        Http::assertSent(function (ClientRequest $request) use (&$code): bool {
            if ($request->url() !== 'http://whatsapp.test/messages') {
                return false;
            }

            preg_match('/\b(\d{6})\b/', (string) $request['message'], $matches);
            $code = $matches[1] ?? null;

            return $request['phone'] === '+6281234567890' && is_string($code);
        });
        $this->assertMatchesRegularExpression('/^\d{6}$/', (string) $code);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($attacker);
        $this->postJson('/api/v1/integrations/whatsapp/verification/confirm', [
            'code' => $code,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('code');

        $this->assertNull($owner->whatsappConnection()->firstOrFail()->phone_verified_at);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($owner);
        $this->postJson('/api/v1/integrations/whatsapp/verification/confirm', [
            'code' => $code,
        ])
            ->assertOk()
            ->assertJsonPath('data.settings.verified', true);

        $this->assertNotNull($owner->whatsappConnection()->firstOrFail()->phone_verified_at);
        $this->assertDatabaseMissing('whatsapp_connections', [
            'user_id' => $attacker->id,
            'phone_number' => '+6281234567890',
        ]);
    }

    public function test_an_owned_phone_cannot_be_claimed_through_update_or_verification_request(): void
    {
        Http::preventStrayRequests();
        $owner = User::factory()->create();
        $attacker = User::factory()->create();
        WhatsAppConnection::create([
            'user_id' => $owner->id,
            'phone_number' => '+6281234567890',
            'phone_verified_at' => now(),
            'consent_at' => now(),
        ]);
        Sanctum::actingAs($attacker);

        $this->patchJson('/api/v1/integrations/whatsapp', [
            'phone_number' => '0812 3456 7890',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.phone_number.0', 'Nomor WhatsApp ini tidak dapat digunakan.');

        $this->postJson('/api/v1/integrations/whatsapp/verification/request', [
            'phone_number' => '+62 (812) 3456-7890',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.phone_number.0', 'Nomor WhatsApp ini tidak dapat digunakan.');

        $this->assertDatabaseHas('whatsapp_connections', [
            'user_id' => $owner->id,
            'phone_number' => '+6281234567890',
        ]);
        $this->assertDatabaseMissing('whatsapp_connections', [
            'user_id' => $attacker->id,
            'phone_number' => '+6281234567890',
        ]);
        Http::assertNothingSent();
    }

    public function test_only_session_admins_can_view_pairing_secrets_or_connect_the_transport(): void
    {
        config([
            'whatsapp.base_url' => 'http://whatsapp.test',
            'whatsapp.service_token' => 'session-service-token',
            'whatsapp.session_admin_emails' => ['admin@orvyn.app'],
            'ai.provider' => 'gemini',
            'ai.gemini.api_key' => null,
        ]);
        Http::fake([
            'http://whatsapp.test/session/connect' => Http::response([
                'connected' => false,
                'status' => 'connecting',
                'qr' => 'private-connect-qr',
            ]),
            'http://whatsapp.test/session' => Http::response([
                'connected' => false,
                'status' => 'qr',
                'qr' => 'private-status-qr',
                'phone' => '628111111111',
            ]),
        ]);

        $member = User::factory()->create(['email' => 'member@orvyn.app']);
        $admin = User::factory()->create(['email' => 'admin@orvyn.app']);
        Sanctum::actingAs($member);

        $this->getJson('/api/v1/integrations/whatsapp')
            ->assertOk()
            ->assertJsonPath('data.service.status', 'qr')
            ->assertJsonMissingPath('data.service.qr')
            ->assertJsonMissingPath('data.service.phone');

        $this->postJson('/api/v1/integrations/whatsapp/connect')
            ->assertForbidden();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/integrations/whatsapp')
            ->assertOk()
            ->assertJsonPath('data.service.qr', 'private-status-qr')
            ->assertJsonPath('data.service.phone', '628111111111');

        $this->postJson('/api/v1/integrations/whatsapp/connect')
            ->assertOk()
            ->assertJsonPath('data.status', 'connecting');

        Http::assertSentCount(3);
    }

    public function test_webhook_hmac_binds_the_timestamp_and_rejects_stale_requests(): void
    {
        Carbon::setTestNow('2026-07-25 12:00:00 UTC');
        config([
            'whatsapp.webhook_secret' => 'timestamp-bound-webhook-secret',
            'whatsapp.webhook_max_age_seconds' => 300,
        ]);
        $body = json_encode([
            'message_id' => 'timestamp-security-test',
            'phone' => '+6281234567890',
            'message' => 'tugas hari ini',
        ], JSON_UNESCAPED_SLASHES);

        $staleTimestamp = (string) now()->subSeconds(301)->timestamp;
        $staleSignature = hash_hmac('sha256', $staleTimestamp.'.'.$body, config('whatsapp.webhook_secret'));
        $this->postSignedInbound($body, $staleTimestamp, $staleSignature)
            ->assertUnauthorized();

        $signedTimestamp = (string) now()->timestamp;
        $tamperedTimestamp = (string) now()->subSecond()->timestamp;
        $timestampBoundSignature = hash_hmac('sha256', $signedTimestamp.'.'.$body, config('whatsapp.webhook_secret'));
        $this->postSignedInbound($body, $tamperedTimestamp, $timestampBoundSignature)
            ->assertUnauthorized();

        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    private function postSignedInbound(string $body, string $timestamp, string $signature)
    {
        return $this->call('POST', '/api/v1/integrations/whatsapp/inbound', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_ORVYN_SIGNATURE' => $signature,
            'HTTP_X_ORVYN_TIMESTAMP' => $timestamp,
        ], $body);
    }
}
