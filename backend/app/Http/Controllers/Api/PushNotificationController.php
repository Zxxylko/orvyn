<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendPushNotificationJob;
use App\Models\DevicePushToken;
use App\Models\PushNotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class PushNotificationController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $preference = $request->user()->pushNotificationPreference;
        $tokens = $request->user()->devicePushTokens()
            ->latest('last_seen_at')
            ->get();

        return response()->json([
            'data' => [
                'settings' => $this->serializePreference($preference),
                'devices' => $tokens->map(fn (DevicePushToken $token) => $this->serializeToken($token)),
                'provider' => [
                    'enabled' => (bool) config('services.expo_push.enabled'),
                    'ready' => (bool) config('services.expo_push.enabled') && $tokens->where('enabled', true)->isNotEmpty(),
                ],
            ],
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $validated = $request->validate([
            'token' => ['required', 'string', 'max:255', 'regex:/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/'],
            'platform' => ['required', Rule::in(['android', 'ios'])],
            'device_name' => ['nullable', 'string', 'max:120'],
            'app_version' => ['nullable', 'string', 'max:32'],
        ]);

        [$token, $preference] = DB::transaction(function () use ($request, $validated) {
            $token = DevicePushToken::query()->updateOrCreate(
                ['token' => $validated['token']],
                [
                    'user_id' => $request->user()->id,
                    'platform' => $validated['platform'],
                    'device_name' => $validated['device_name'] ?? null,
                    'app_version' => $validated['app_version'] ?? null,
                    'enabled' => true,
                    'last_seen_at' => now(),
                    'last_error' => null,
                ],
            );

            $preference = $request->user()->pushNotificationPreference()->firstOrCreate(
                [],
                [
                    'enabled' => true,
                    'timezone' => config('whatsapp.default_timezone', 'Asia/Jakarta'),
                    'features' => PushNotificationPreference::defaultFeatures(),
                    'reminder_schedule' => PushNotificationPreference::defaultReminderSchedule(),
                ],
            );

            return [$token, $preference];
        });

        return response()->json([
            'data' => [
                'device' => $this->serializeToken($token),
                'settings' => $this->serializePreference($preference),
            ],
            'message' => 'Perangkat siap menerima notifikasi ORVYN.',
        ], $token->wasRecentlyCreated ? 201 : 200);
    }

    public function unregister(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $validated = $request->validate([
            'token' => ['required', 'string', 'max:255'],
        ]);

        $request->user()->devicePushTokens()
            ->where('token', $validated['token'])
            ->delete();

        return response()->json([
            'data' => null,
            'message' => 'Notifikasi untuk perangkat ini dinonaktifkan.',
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $validated = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'timezone' => ['sometimes', 'timezone'],
            'daily_briefing_time' => ['sometimes', 'date_format:H:i'],
            'reminder_lead_minutes' => ['sometimes', 'integer', 'min:15', 'max:10080'],
            'reminder_schedule' => ['sometimes', 'array'],
            'reminder_schedule.daily_briefing_time' => ['required_with:reminder_schedule', 'date_format:H:i'],
            'reminder_schedule.deadline_lead_minutes' => ['required_with:reminder_schedule', 'array', 'min:1', 'max:8'],
            'reminder_schedule.deadline_lead_minutes.*' => ['integer', 'distinct', Rule::in([30, 60, 180, 360, 720, 1440, 2880, 10080])],
            'reminder_schedule.progress_checkin_time' => ['required_with:reminder_schedule', 'date_format:H:i'],
            'reminder_schedule.burnout_checkin_time' => ['required_with:reminder_schedule', 'date_format:H:i'],
            'reminder_schedule.habit_checkin_time' => ['required_with:reminder_schedule', 'date_format:H:i'],
            'reminder_schedule.weekly_review_day' => ['required_with:reminder_schedule', 'integer', 'between:1,7'],
            'reminder_schedule.weekly_review_time' => ['required_with:reminder_schedule', 'date_format:H:i'],
            'features' => ['sometimes', 'array'],
            'features.daily_briefing' => ['sometimes', 'boolean'],
            'features.deadline_reminders' => ['sometimes', 'boolean'],
            'features.progress_checkins' => ['sometimes', 'boolean'],
            'features.burnout_checkins' => ['sometimes', 'boolean'],
            'features.habit_health' => ['sometimes', 'boolean'],
            'features.campus_departure_reminders' => ['sometimes', 'boolean'],
            'features.weekly_review' => ['sometimes', 'boolean'],
        ]);

        $preference = $request->user()->pushNotificationPreference()->firstOrCreate(
            [],
            [
                'features' => PushNotificationPreference::defaultFeatures(),
                'reminder_schedule' => PushNotificationPreference::defaultReminderSchedule(),
            ],
        );

        if (isset($validated['features'])) {
            $validated['features'] = [
                ...PushNotificationPreference::defaultFeatures(),
                ...($preference->features ?? []),
                ...$validated['features'],
            ];
        }

        if (isset($validated['reminder_schedule'])) {
            $validated['reminder_schedule']['deadline_lead_minutes'] = collect($validated['reminder_schedule']['deadline_lead_minutes'])
                ->map(fn ($minutes) => (int) $minutes)
                ->unique()
                ->sortDesc()
                ->values()
                ->all();
            $validated['daily_briefing_time'] = $validated['reminder_schedule']['daily_briefing_time'];
            $validated['reminder_lead_minutes'] = max($validated['reminder_schedule']['deadline_lead_minutes']);
        }

        $preference->update($validated);

        return response()->json([
            'data' => $this->serializePreference($preference->fresh()),
            'message' => 'Preferensi notifikasi disimpan.',
        ]);
    }

    public function test(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $activeTokens = $request->user()->devicePushTokens()->where('enabled', true)->count();
        if ($activeTokens === 0) {
            throw ValidationException::withMessages([
                'device' => 'Belum ada perangkat aktif untuk menerima push notification.',
            ]);
        }

        SendPushNotificationJob::dispatch(
            $request->user()->id,
            'test',
            'ORVYN terhubung',
            'Push notification untuk perangkat ini sudah siap digunakan.',
            'push:test:'.$request->user()->id.':'.now()->timestamp,
            ['screen' => 'Beranda'],
        );

        return response()->json([
            'data' => ['queued' => true, 'devices' => $activeTokens],
            'message' => 'Notifikasi uji masuk antrean.',
        ]);
    }

    private function serializePreference(?PushNotificationPreference $preference): array
    {
        if (! $preference) {
            return [
                'enabled' => false,
                'timezone' => config('whatsapp.default_timezone', 'Asia/Jakarta'),
                'daily_briefing_time' => '07:00',
                'reminder_lead_minutes' => 180,
                'reminder_schedule' => PushNotificationPreference::defaultReminderSchedule(),
                'features' => PushNotificationPreference::defaultFeatures(),
            ];
        }

        return [
            'enabled' => $preference->enabled,
            'timezone' => $preference->timezone,
            'daily_briefing_time' => substr((string) $preference->daily_briefing_time, 0, 5),
            'reminder_lead_minutes' => $preference->reminder_lead_minutes,
            'reminder_schedule' => $preference->resolvedReminderSchedule(),
            'features' => [
                ...PushNotificationPreference::defaultFeatures(),
                ...($preference->features ?? []),
            ],
        ];
    }

    private function serializeToken(DevicePushToken $token): array
    {
        return [
            'id' => $token->id,
            'token_hint' => $token->maskedToken(),
            'platform' => $token->platform,
            'device_name' => $token->device_name,
            'app_version' => $token->app_version,
            'enabled' => $token->enabled,
            'last_seen_at' => $token->last_seen_at,
            'has_error' => filled($token->last_error),
        ];
    }

    private function ensureFullUserSession(Request $request): void
    {
        if (! $request->bearerToken()) {
            return;
        }

        abort_unless(
            $request->user()->tokenCan('*'),
            Response::HTTP_FORBIDDEN,
            'A full user session is required to manage push notifications.',
        );
    }
}
