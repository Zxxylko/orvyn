<?php

namespace Tests\Feature;

use App\Jobs\GenerateEmbeddingJob;
use App\Jobs\SendWhatsAppMessageJob;
use App\Models\NotificationDelivery;
use App\Models\Task;
use App\Models\User;
use App\Models\WhatsAppConnection;
use App\Services\AI\AIManager;
use App\Services\WhatsApp\WhatsAppGateway;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsAppIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_user_can_enable_whatsapp_with_explicit_consent(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/v1/integrations/whatsapp', [
            'phone_number' => '0812 3456 7890',
            'enabled' => true,
            'consent' => true,
            'timezone' => 'Asia/Jakarta',
            'daily_briefing_time' => '06:30',
            'reminder_lead_minutes' => 180,
            'features' => ['daily_briefing' => true, 'finance_logging' => false],
        ])
            ->assertOk()
            ->assertJsonPath('data.phone_number', '+6281234567890')
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.consented', true)
            ->assertJsonPath('data.features.finance_logging', false);

        $this->assertDatabaseHas('whatsapp_connections', [
            'user_id' => $user->id,
            'phone_number' => '+6281234567890',
            'enabled' => true,
        ]);
    }

    public function test_reading_whatsapp_status_does_not_create_preferences(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/integrations/whatsapp')
            ->assertOk()
            ->assertJsonPath('data.settings.enabled', false)
            ->assertJsonPath('data.settings.timezone', 'Asia/Jakarta');

        $this->assertDatabaseCount('whatsapp_connections', 0);
    }

    public function test_user_can_save_an_advanced_reminder_schedule(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $schedule = [
            'daily_briefing_time' => '06:15',
            'deadline_lead_minutes' => [1440, 180, 30],
            'progress_checkin_time' => '13:30',
            'burnout_checkin_time' => '16:45',
            'habit_checkin_time' => '20:15',
            'weekly_review_day' => 6,
            'weekly_review_time' => '19:30',
        ];

        $this->patchJson('/api/v1/integrations/whatsapp', [
            'reminder_schedule' => $schedule,
        ])
            ->assertOk()
            ->assertJsonPath('data.daily_briefing_time', '06:15')
            ->assertJsonPath('data.reminder_lead_minutes', 1440)
            ->assertJsonPath('data.reminder_schedule.deadline_lead_minutes', [1440, 180, 30])
            ->assertJsonPath('data.reminder_schedule.weekly_review_day', 6)
            ->assertJsonPath('data.reminder_schedule.weekly_review_time', '19:30');

        $connection = $user->whatsappConnection()->firstOrFail();
        $this->assertEquals($schedule, $connection->reminder_schedule);
    }

    public function test_whatsapp_cannot_be_enabled_without_consent(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/v1/integrations/whatsapp', [
            'phone_number' => '081234567890',
            'enabled' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors('consent');
    }

    public function test_dashboard_traffic_does_not_exhaust_whatsapp_test_limit(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        WhatsAppConnection::create([
            'user_id' => $user->id,
            'phone_number' => '+6281234567890',
            'enabled' => true,
            'consent_at' => now(),
        ]);
        Sanctum::actingAs($user);

        for ($request = 0; $request < 10; $request++) {
            $this->getJson('/api/v1/tasks')->assertOk();
        }

        $this->postJson('/api/v1/integrations/whatsapp/test')
            ->assertOk()
            ->assertJsonPath('message', 'Pesan uji masuk antrean.');

        Queue::assertPushed(SendWhatsAppMessageJob::class, fn (SendWhatsAppMessageJob $job) => $job->userId === $user->id
            && $job->type === 'test');
    }

    public function test_signed_inbound_message_can_create_a_task_and_is_deduplicated(): void
    {
        config([
            'whatsapp.webhook_secret' => 'test-webhook-secret-long-enough',
            'ai.provider' => 'gemini',
            'ai.gemini.api_key' => null,
        ]);
        $user = User::factory()->create();
        WhatsAppConnection::create([
            'user_id' => $user->id,
            'phone_number' => '+6281234567890',
            'enabled' => true,
            'consent_at' => now(),
            'features' => WhatsAppConnection::defaultFeatures(),
        ]);

        $body = json_encode([
            'message_id' => 'wamid-test-1',
            'phone' => '+6281234567890',
            'message' => 'tambah tugas laporan keamanan besok',
            'received_at' => now()->toIso8601String(),
        ], JSON_UNESCAPED_SLASHES);
        $signature = hash_hmac('sha256', $body, config('whatsapp.webhook_secret'));

        $this->call('POST', '/api/v1/integrations/whatsapp/inbound', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_ORVYN_SIGNATURE' => $signature,
        ], $body)
            ->assertOk()
            ->assertJsonPath('duplicate', null);

        $this->assertDatabaseHas('tasks', [
            'user_id' => $user->id,
            'title' => 'laporan keamanan besok',
        ]);

        $this->call('POST', '/api/v1/integrations/whatsapp/inbound', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_ORVYN_SIGNATURE' => $signature,
        ], $body)->assertOk()->assertJsonPath('duplicate', true);

        $this->assertSame(1, Task::where('user_id', $user->id)->count());
    }

    public function test_inbound_message_rejects_an_invalid_signature(): void
    {
        config(['whatsapp.webhook_secret' => 'test-webhook-secret-long-enough']);

        $this->withHeader('X-Orvyn-Signature', 'invalid')
            ->postJson('/api/v1/integrations/whatsapp/inbound', [
                'message_id' => 'wamid-invalid',
                'phone' => '+6281234567890',
                'message' => 'tugas hari ini',
            ])
            ->assertUnauthorized();

        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    public function test_scheduler_queues_daily_briefing_at_users_local_time(): void
    {
        Carbon::setTestNow('2026-07-13 00:00:00');
        Queue::fake();
        $user = User::factory()->create();
        WhatsAppConnection::create([
            'user_id' => $user->id,
            'phone_number' => '+6281234567890',
            'enabled' => true,
            'consent_at' => now(),
            'timezone' => 'UTC',
            'daily_briefing_time' => '00:00',
            'features' => WhatsAppConnection::defaultFeatures(),
        ]);

        Artisan::call('notifications:dispatch-whatsapp');

        Queue::assertPushed(SendWhatsAppMessageJob::class, fn ($job) => $job->userId === $user->id && $job->type === 'daily_briefing'
        );
    }

    public function test_scheduler_only_queues_one_reminder_per_task_deadline(): void
    {
        Carbon::setTestNow('2026-07-13 00:00:00');
        Queue::fake();
        $user = User::factory()->create();
        WhatsAppConnection::create([
            'user_id' => $user->id,
            'phone_number' => '+6281234567890',
            'enabled' => true,
            'consent_at' => now(),
            'timezone' => 'UTC',
            'daily_briefing_time' => '07:00',
            'reminder_lead_minutes' => 180,
            'features' => WhatsAppConnection::defaultFeatures(),
        ]);
        $user->tasks()->create([
            'title' => 'Kirim laporan',
            'deadline' => now()->addHour(),
        ]);

        Artisan::call('notifications:dispatch-whatsapp');
        Artisan::call('notifications:dispatch-whatsapp');

        $reminders = Queue::pushed(SendWhatsAppMessageJob::class)
            ->filter(fn ($job) => $job->type === 'deadline_reminder');
        $this->assertCount(1, $reminders);
        $this->assertDatabaseCount('notification_deliveries', 1);
    }

    public function test_scheduler_queues_each_configured_deadline_stage_once(): void
    {
        Carbon::setTestNow('2026-07-13 00:00:00');
        Queue::fake();
        $user = User::factory()->create();
        WhatsAppConnection::create([
            'user_id' => $user->id,
            'phone_number' => '+6281234567890',
            'enabled' => true,
            'consent_at' => now(),
            'timezone' => 'UTC',
            'features' => WhatsAppConnection::defaultFeatures(),
            'reminder_schedule' => [
                ...WhatsAppConnection::defaultReminderSchedule(),
                'daily_briefing_time' => '07:00',
                'deadline_lead_minutes' => [180, 60],
            ],
        ]);
        $user->tasks()->create([
            'title' => 'Presentasi akhir',
            'deadline' => now()->addHours(3),
        ]);

        Artisan::call('notifications:dispatch-whatsapp');
        $this->assertSame([180], NotificationDelivery::where('type', 'deadline_reminder')->pluck('payload')->pluck('lead_minutes')->all());

        Carbon::setTestNow('2026-07-13 02:00:00');
        Artisan::call('notifications:dispatch-whatsapp');
        Artisan::call('notifications:dispatch-whatsapp');

        $this->assertSame(
            [180, 60],
            NotificationDelivery::where('type', 'deadline_reminder')->orderBy('created_at')->pluck('payload')->pluck('lead_minutes')->all(),
        );
        $this->assertCount(
            2,
            Queue::pushed(SendWhatsAppMessageJob::class)->filter(fn ($job) => $job->type === 'deadline_reminder'),
        );
    }

    public function test_outbound_job_records_delivery_and_calls_sidecar(): void
    {
        config([
            'whatsapp.base_url' => 'http://whatsapp.test',
            'whatsapp.service_token' => 'test-service-token-long-enough',
        ]);
        Http::fake(['http://whatsapp.test/messages' => Http::response(['id' => 'provider-123'], 201)]);
        $user = User::factory()->create();
        WhatsAppConnection::create([
            'user_id' => $user->id,
            'phone_number' => '+6281234567890',
            'enabled' => true,
            'consent_at' => now(),
        ]);

        $job = new SendWhatsAppMessageJob($user->id, 'test', 'Halo dari ORVYN', 'wa:test:delivery');
        $job->handle(app(WhatsAppGateway::class));

        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'dedupe_key' => 'wa:test:delivery',
            'status' => 'sent',
            'provider_message_id' => 'provider-123',
        ]);
        Http::assertSent(fn ($request) => $request->url() === 'http://whatsapp.test/messages'
            && $request['phone'] === '+6281234567890');
    }

    public function test_ollama_is_used_for_structured_task_parsing(): void
    {
        config(['ai.provider' => 'ollama', 'ai.ollama.base_url' => 'http://ollama.test']);
        Http::fake(['http://ollama.test/api/chat' => Http::response([
            'message' => ['content' => json_encode([
                'title' => 'Susun laporan AI',
                'description' => null,
                'deadline' => null,
                'priority' => 'high',
                'duration_minutes' => 90,
                'difficulty' => 4,
                'category' => 'theory',
                'tags' => ['laporan'],
            ])],
        ])]);

        $parsed = app(AIManager::class)->parseTask('laporan AI prioritas tinggi');

        $this->assertSame('Susun laporan AI', $parsed['title']);
        $this->assertSame('high', $parsed['priority']);
        $this->assertTrue($parsed['ai_processed']);
    }

    public function test_ollama_embedding_is_stored_as_a_numeric_vector(): void
    {
        config(['ai.provider' => 'ollama', 'ai.ollama.base_url' => 'http://ollama.test']);
        Http::fake(['http://ollama.test/api/embed' => Http::response([
            'embeddings' => [array_fill(0, 768, 0.25)],
        ])]);
        $task = User::factory()->create()->tasks()->create(['title' => 'Laporan keamanan']);

        (new GenerateEmbeddingJob($task))->handle(app(AIManager::class));

        $stored = json_decode((string) DB::table('task_embeddings')->value('embedding'), true);
        $this->assertCount(768, $stored);
        $this->assertSame(0.25, $stored[0]);
    }
}
