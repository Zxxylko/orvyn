<?php

namespace Tests\Unit;

use App\Support\ProductionReadiness;
use Tests\TestCase;

class ProductionReadinessTest extends TestCase
{
    public function test_a_complete_secure_production_configuration_passes_the_validator_and_command(): void
    {
        $this->applySecureProductionConfig();

        $this->assertSame([], app(ProductionReadiness::class)->errors());
        $this->artisan('orvyn:production-check')
            ->expectsOutput('Production configuration passed all enforced security checks.')
            ->assertSuccessful();
    }

    public function test_the_validator_rejects_unsafe_origins_cookies_cloud_fallback_and_shared_secrets(): void
    {
        $this->applySecureProductionConfig();
        config([
            'session.secure' => false,
            'cors.allowed_origins' => ['*'],
            'reverb.apps.apps.0.allowed_origins' => ['http://localhost:5173'],
            'ai.cloud_fallback_enabled' => true,
            'ai.cloud_requires_user_consent' => false,
            'services.firebase.project_id' => 'different-project',
            'services.firebase.reauthentication_max_age_seconds' => 30,
            'whatsapp.service_token' => str_repeat('s', 40),
            'whatsapp.webhook_secret' => str_repeat('s', 40),
        ]);

        $errors = app(ProductionReadiness::class)->errors();

        $this->assertContains('SESSION_SECURE_COOKIE must be true.', $errors);
        $this->assertContains('CORS_ALLOWED_ORIGINS must contain only explicit public HTTPS origins.', $errors);
        $this->assertContains('REVERB_ALLOWED_ORIGINS must contain only explicit public HTTPS origins.', $errors);
        $this->assertContains('Cloud AI fallback requires AI_CLOUD_REQUIRES_USER_CONSENT=true.', $errors);
        $this->assertContains('Firebase credentials must be a valid service account matching FIREBASE_PROJECT_ID.', $errors);
        $this->assertContains('FIREBASE_REAUTH_MAX_AGE_SECONDS must be between 60 and 900.', $errors);
        $this->assertContains('WhatsApp service and webhook secrets must be different.', $errors);
        $this->artisan('orvyn:production-check')
            ->expectsOutput('Production configuration is not ready.')
            ->assertFailed();
    }

    private function applySecureProductionConfig(): void
    {
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('k', 32)),
            'app.debug' => false,
            'app.url' => 'https://api.orvyn.example',
            'services.demo_login.enabled' => false,
            'services.auth_tokens.expiration_minutes' => 1440,
            'services.firebase.credentials' => base_path('tests/Fixtures/firebase-service-account.json'),
            'services.firebase.project_id' => 'orvyn-test',
            'services.firebase.required_in_production' => true,
            'services.firebase.reauthentication_max_age_seconds' => 300,
            'services.expo_push.enabled' => true,
            'services.expo_push.url' => 'https://exp.host/--/api/v2/push/send',
            'services.expo_push.access_token' => str_repeat('p', 40),
            'services.expo_push.timeout' => 15,
            'database.default' => 'pgsql',
            'database.connections.pgsql.password' => str_repeat('d', 32),
            'database.connections.pgsql.url' => null,
            'database.redis.default.password' => str_repeat('r', 32),
            'database.redis.cache.password' => str_repeat('r', 32),
            'queue.default' => 'redis',
            'cache.default' => 'redis',
            'session.driver' => 'redis',
            'session.domain' => '.orvyn.example',
            'session.secure' => true,
            'session.http_only' => true,
            'session.encrypt' => true,
            'session.lifetime' => 120,
            'session.same_site' => 'lax',
            'cors.allowed_origins' => ['https://app.orvyn.example'],
            'cors.supports_credentials' => true,
            'sanctum.stateful' => ['app.orvyn.example'],
            'reverb.apps.apps.0.allowed_origins' => ['https://app.orvyn.example'],
            'reverb.apps.apps.0.max_connections' => 500,
            'reverb.apps.apps.0.rate_limiting.enabled' => true,
            'reverb.apps.apps.0.secret' => str_repeat('v', 40),
            'security.trusted_proxies' => ['10.0.0.10'],
            'security.trusted_hosts' => ['^api\.orvyn\.example$'],
            'logging.default' => 'stderr',
            'logging.channels.stderr.level' => 'warning',
            'ai.cloud_fallback_enabled' => true,
            'ai.cloud_requires_user_consent' => true,
            'ai.provider' => 'ollama',
            'ai.ollama.base_url' => 'http://ollama:11434',
            'ai.gemini.api_key' => str_repeat('g', 40),
            'horizon.dashboard_enabled' => true,
            'horizon.admin_emails' => ['admin@orvyn.example'],
            'whatsapp.driver' => 'baileys',
            'whatsapp.baileys_production_acknowledged' => true,
            'whatsapp.base_url' => 'http://whatsapp:3100',
            'whatsapp.service_token' => str_repeat('s', 40),
            'whatsapp.webhook_secret' => str_repeat('w', 40),
            'whatsapp.session_admin_emails' => ['admin@orvyn.example'],
            'whatsapp.webhook_max_age_seconds' => 300,
            'whatsapp.verification_ttl_minutes' => 10,
            'whatsapp.verification_max_attempts' => 5,
        ]);
    }
}
