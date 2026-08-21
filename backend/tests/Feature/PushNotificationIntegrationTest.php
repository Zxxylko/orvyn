<?php

namespace Tests\Feature;

use App\Jobs\SendPushNotificationJob;
use App\Models\DevicePushToken;
use App\Models\PushNotificationPreference;
use App\Models\User;
use App\Services\Notifications\ExpoPushGateway;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PushNotificationIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_user_can_register_a_push_device_without_exposing_the_token(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/push-tokens', [
            'token' => self::TOKEN,
            'platform' => 'android',
            'device_name' => 'Pixel Test',
            'app_version' => '1.0.0',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.device.platform', 'android')
            ->assertJsonPath('data.device.device_name', 'Pixel Test')
            ->assertJsonPath('data.settings.enabled', true)
            ->assertJsonMissing(['token' => self::TOKEN]);

        $this->assertDatabaseHas('device_push_tokens', [
            'user_id' => $user->id,
            'token' => self::TOKEN,
            'enabled' => true,
        ]);
        $this->assertDatabaseHas('push_notification_preferences', [
            'user_id' => $user->id,
            'enabled' => true,
        ]);
    }

    public function test_scoped_agent_token_cannot_register_a_push_device(): void
    {
        $user = User::factory()->create();
        $agentToken = $user->createToken('odysseus', ['orvyn:read', 'orvyn:write']);

        $this->withToken($agentToken->plainTextToken)
            ->postJson('/api/v1/push-tokens', [
                'token' => self::TOKEN,
                'platform' => 'android',
            ])
            ->assertForbidden()
            ->assertJsonPath('message', 'A full user session is required to manage push notifications.');

        $this->assertDatabaseCount('device_push_tokens', 0);
    }

    public function test_registering_the_same_device_refreshes_it_instead_of_duplicating_it(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $payload = [
            'token' => self::TOKEN,
            'platform' => 'android',
            'device_name' => 'Pixel Test',
        ];

        $this->postJson('/api/v1/push-tokens', $payload)->assertCreated();
        $this->postJson('/api/v1/push-tokens', [...$payload, 'app_version' => '1.0.1'])->assertOk();

        $this->assertDatabaseCount('device_push_tokens', 1);
        $this->assertDatabaseHas('device_push_tokens', ['app_version' => '1.0.1']);
    }

    public function test_user_can_only_unregister_their_own_push_device(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        DevicePushToken::create([
            'user_id' => $owner->id,
            'token' => self::TOKEN,
            'platform' => 'android',
            'enabled' => true,
        ]);

        Sanctum::actingAs($other);
        $this->deleteJson('/api/v1/push-tokens/current', ['token' => self::TOKEN])->assertOk();
        $this->assertDatabaseHas('device_push_tokens', [
            'user_id' => $owner->id,
            'token' => self::TOKEN,
        ]);

        Sanctum::actingAs($owner);
        $this->deleteJson('/api/v1/push-tokens/current', ['token' => self::TOKEN])->assertOk();
        $this->assertDatabaseCount('device_push_tokens', 0);
    }

    public function test_user_can_configure_an_advanced_push_reminder_schedule(): void
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

        $this->patchJson('/api/v1/push-notifications', [
            'enabled' => true,
            'timezone' => 'Asia/Jakarta',
            'reminder_schedule' => $schedule,
            'features' => ['burnout_checkins' => false],
        ])
            ->assertOk()
            ->assertJsonPath('data.daily_briefing_time', '06:15')
            ->assertJsonPath('data.reminder_schedule.deadline_lead_minutes', [1440, 180, 30])
            ->assertJsonPath('data.features.burnout_checkins', false);
    }

    public function test_push_test_requires_a_registered_device_and_queues_delivery(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/push-notifications/test')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('device');

        DevicePushToken::create([
            'user_id' => $user->id,
            'token' => self::TOKEN,
            'platform' => 'android',
            'enabled' => true,
        ]);

        $this->postJson('/api/v1/push-notifications/test')
            ->assertOk()
            ->assertJsonPath('data.queued', true);

        Queue::assertPushed(
            SendPushNotificationJob::class,
            fn (SendPushNotificationJob $job) => $job->userId === $user->id && $job->type === 'test',
        );
    }

    public function test_scheduler_queues_each_push_reminder_only_once(): void
    {
        Carbon::setTestNow('2026-07-24 00:00:00');
        Queue::fake();
        $user = User::factory()->create();
        DevicePushToken::create([
            'user_id' => $user->id,
            'token' => self::TOKEN,
            'platform' => 'android',
            'enabled' => true,
        ]);
        PushNotificationPreference::create([
            'user_id' => $user->id,
            'enabled' => true,
            'timezone' => 'UTC',
            'daily_briefing_time' => '00:00',
            'features' => PushNotificationPreference::defaultFeatures(),
            'reminder_schedule' => [
                ...PushNotificationPreference::defaultReminderSchedule(),
                'daily_briefing_time' => '00:00',
            ],
        ]);

        Artisan::call('notifications:dispatch-push');
        Artisan::call('notifications:dispatch-push');

        Queue::assertPushed(
            SendPushNotificationJob::class,
            1,
        );
        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'channel' => 'push',
            'type' => 'daily_briefing',
        ]);
    }

    public function test_scheduler_queues_a_campus_departure_reminder_using_commute_and_prep_time(): void
    {
        Carbon::setTestNow('2026-07-24 00:30:00');
        Queue::fake();
        $user = User::factory()->create();
        DevicePushToken::create([
            'user_id' => $user->id,
            'token' => self::TOKEN,
            'platform' => 'android',
            'enabled' => true,
        ]);
        PushNotificationPreference::create([
            'user_id' => $user->id,
            'enabled' => true,
            'timezone' => 'UTC',
            'features' => PushNotificationPreference::defaultFeatures(),
            'reminder_schedule' => PushNotificationPreference::defaultReminderSchedule(),
        ]);
        $schedule = $user->campusSchedules()->create([
            'course_name' => 'Struktur Data',
            'day_of_week' => 5,
            'start_time' => '01:30',
            'end_time' => '03:00',
            'commute_minutes' => 40,
            'prep_minutes' => 20,
            'is_active' => true,
        ]);

        Artisan::call('notifications:dispatch-push');

        Queue::assertPushed(
            SendPushNotificationJob::class,
            fn (SendPushNotificationJob $job) => $job->type === 'campus_departure'
                && $job->data['detail'] === 'Campus',
        );
        $this->assertDatabaseHas('notification_deliveries', [
            'dedupe_key' => "push:campus:{$user->id}:{$schedule->id}:2026-07-24",
            'type' => 'campus_departure',
        ]);
    }

    public function test_push_job_records_a_successful_expo_ticket(): void
    {
        config(['services.expo_push.enabled' => true]);
        Http::fake([
            'https://exp.host/*' => Http::response([
                'data' => [['status' => 'ok', 'id' => 'expo-ticket-1']],
            ]),
        ]);

        $user = User::factory()->create();
        DevicePushToken::create([
            'user_id' => $user->id,
            'token' => self::TOKEN,
            'platform' => 'android',
            'enabled' => true,
        ]);

        $job = new SendPushNotificationJob(
            $user->id,
            'test',
            'ORVYN terhubung',
            'Notifikasi siap.',
            'push:test:job-success',
        );
        $job->handle(app(ExpoPushGateway::class));

        $this->assertDatabaseHas('notification_deliveries', [
            'dedupe_key' => 'push:test:job-success',
            'status' => 'sent',
            'provider_message_id' => 'expo-ticket-1',
        ]);
        Http::assertSentCount(1);
    }

    public function test_push_job_disables_a_device_that_expo_no_longer_recognizes(): void
    {
        config(['services.expo_push.enabled' => true]);
        Http::fake([
            'https://exp.host/*' => Http::response([
                'data' => [[
                    'status' => 'error',
                    'message' => 'The device is not registered.',
                    'details' => ['error' => 'DeviceNotRegistered'],
                ]],
            ]),
        ]);

        $user = User::factory()->create();
        DevicePushToken::create([
            'user_id' => $user->id,
            'token' => self::TOKEN,
            'platform' => 'android',
            'enabled' => true,
        ]);

        $job = new SendPushNotificationJob(
            $user->id,
            'test',
            'ORVYN terhubung',
            'Notifikasi siap.',
            'push:test:job-disabled',
        );

        try {
            $job->handle(app(ExpoPushGateway::class));
        } catch (\RuntimeException) {
            // The queue will retry transient failures, while the invalid token stays disabled.
        }

        $this->assertDatabaseHas('device_push_tokens', [
            'token' => self::TOKEN,
            'enabled' => false,
        ]);
        $this->assertDatabaseHas('notification_deliveries', [
            'dedupe_key' => 'push:test:job-disabled',
            'status' => 'failed',
        ]);
    }
}
