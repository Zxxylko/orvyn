<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendWhatsAppMessageJob;
use App\Models\WhatsAppConnection;
use App\Services\AI\AIManager;
use App\Services\WhatsApp\WhatsAppGateway;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class WhatsAppConnectionController extends Controller
{
    public function show(Request $request, WhatsAppGateway $gateway, AIManager $ai)
    {
        $connection = $this->connection($request, persist: false);
        $service = $gateway->status();
        if (! $this->isSessionAdmin($request)) {
            $service = Arr::only($service, ['online', 'connected', 'status']);
        }

        return response()->json(['data' => [
            'settings' => $this->serialize($connection),
            'service' => $service,
            'ai' => $ai->health(),
        ]]);
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'phone_number' => ['nullable', 'string', 'max:24', 'regex:/^[+0-9()\-\s]+$/'],
            'enabled' => 'sometimes|boolean',
            'timezone' => 'sometimes|timezone:all',
            'daily_briefing_time' => 'sometimes|date_format:H:i',
            'reminder_lead_minutes' => 'sometimes|integer|min:15|max:10080',
            'reminder_schedule' => 'sometimes|array',
            'reminder_schedule.daily_briefing_time' => 'required_with:reminder_schedule|date_format:H:i',
            'reminder_schedule.deadline_lead_minutes' => 'required_with:reminder_schedule|array|min:1|max:8',
            'reminder_schedule.deadline_lead_minutes.*' => 'integer|distinct|in:30,60,180,360,720,1440,2880,10080',
            'reminder_schedule.progress_checkin_time' => 'required_with:reminder_schedule|date_format:H:i',
            'reminder_schedule.burnout_checkin_time' => 'required_with:reminder_schedule|date_format:H:i',
            'reminder_schedule.habit_checkin_time' => 'required_with:reminder_schedule|date_format:H:i',
            'reminder_schedule.weekly_review_day' => 'required_with:reminder_schedule|integer|between:1,7',
            'reminder_schedule.weekly_review_time' => 'required_with:reminder_schedule|date_format:H:i',
            'features' => 'sometimes|array',
            'features.*' => 'boolean',
            'consent' => 'sometimes|accepted',
        ]);

        $connection = $this->connection($request);
        if (array_key_exists('phone_number', $validated)) {
            $validated['phone_number'] = WhatsAppConnection::normalizePhone($validated['phone_number']);
            if ($validated['phone_number']) {
                $this->assertPhoneAvailable($request, $validated['phone_number']);
            }
            $phoneChanged = $validated['phone_number'] !== $connection->phone_number;
            if ($phoneChanged) {
                $validated = [
                    ...$validated,
                    'enabled' => false,
                    'consent_at' => null,
                    'phone_verified_at' => null,
                    'verification_code_hash' => null,
                    'verification_expires_at' => null,
                    'verification_attempts' => 0,
                ];
            }
        }
        if (($validated['enabled'] ?? false) && ! ($validated['phone_number'] ?? $connection->phone_number)) {
            throw ValidationException::withMessages(['phone_number' => 'Nomor WhatsApp wajib diisi sebelum notifikasi diaktifkan.']);
        }
        if (($validated['enabled'] ?? false) && ! ($validated['phone_verified_at'] ?? $connection->phone_verified_at)) {
            throw ValidationException::withMessages(['phone_number' => 'Verifikasi nomor WhatsApp sebelum mengaktifkan notifikasi.']);
        }
        if (($validated['enabled'] ?? false) && ! $connection->consent_at && ! ($validated['consent'] ?? false)) {
            throw ValidationException::withMessages(['consent' => 'Persetujuan pengguna diperlukan sebelum mengaktifkan pesan WhatsApp.']);
        }
        if ($validated['consent'] ?? false) {
            $validated['consent_at'] = now();
        }

        unset($validated['consent']);
        if (isset($validated['features'])) {
            $validated['features'] = [...WhatsAppConnection::defaultFeatures(), ...$validated['features']];
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
        $connection->update($validated);

        return response()->json(['data' => $this->serialize($connection->fresh()), 'message' => 'Preferensi WhatsApp disimpan.']);
    }

    public function connect(Request $request, WhatsAppGateway $gateway)
    {
        abort_unless($this->isSessionAdmin($request), 403, 'Only a WhatsApp transport administrator may manage the linked session.');

        return response()->json(['data' => $gateway->connect()]);
    }

    public function requestVerification(Request $request, WhatsAppGateway $gateway): JsonResponse
    {
        $validated = $request->validate([
            'phone_number' => ['required', 'string', 'max:24', 'regex:/^[+0-9()\-\s]+$/'],
        ]);
        $phone = WhatsAppConnection::normalizePhone($validated['phone_number']);
        if (! $phone || strlen(preg_replace('/\D+/', '', $phone)) < 8) {
            throw ValidationException::withMessages(['phone_number' => 'Nomor WhatsApp tidak valid.']);
        }
        $this->assertPhoneAvailable($request, $phone);
        if (! RateLimiter::attempt(
            'whatsapp-verification-phone:'.hash('sha256', $phone),
            3,
            static fn (): bool => true,
            3600,
        )) {
            throw ValidationException::withMessages([
                'phone_number' => 'Terlalu banyak kode dikirim ke nomor ini. Coba lagi nanti.',
            ]);
        }

        $connection = $this->connection($request);
        $code = (string) random_int(100000, 999999);
        $expiresAt = now()->addMinutes(max(5, (int) config('whatsapp.verification_ttl_minutes', 10)));
        $phoneChanged = $connection->phone_number !== $phone;

        $connection->forceFill([
            'phone_number' => $phone,
            'enabled' => false,
            'consent_at' => $phoneChanged ? null : $connection->consent_at,
            'phone_verified_at' => null,
            'verification_code_hash' => Hash::make($code),
            'verification_expires_at' => $expiresAt,
            'verification_attempts' => 0,
        ])->save();

        try {
            $gateway->send(
                $phone,
                "Kode verifikasi ORVYN: {$code}\n\nKode berlaku 10 menit. Abaikan pesan ini jika kamu tidak memintanya.",
            );
        } catch (\Throwable) {
            $connection->forceFill([
                'verification_code_hash' => null,
                'verification_expires_at' => null,
            ])->save();

            throw ValidationException::withMessages([
                'phone_number' => 'Kode belum dapat dikirim. Pastikan layanan WhatsApp terhubung lalu coba lagi.',
            ]);
        }

        return response()->json([
            'data' => [
                'settings' => $this->serialize($connection->fresh()),
                'expires_at' => $expiresAt->toIso8601String(),
            ],
            'message' => 'Kode verifikasi telah dikirim ke nomor tersebut.',
        ]);
    }

    public function confirmVerification(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'digits:6'],
        ]);

        $result = DB::transaction(function () use ($request, $validated): array {
            $connection = $request->user()->whatsappConnection()->lockForUpdate()->first();
            if (! $connection || ! $connection->verification_code_hash || ! $connection->verification_expires_at) {
                return ['error' => 'Minta kode verifikasi baru terlebih dahulu.'];
            }

            $maxAttempts = max(1, (int) config('whatsapp.verification_max_attempts', 5));
            if ($connection->verification_expires_at->isPast() || $connection->verification_attempts >= $maxAttempts) {
                $connection->forceFill([
                    'verification_code_hash' => null,
                    'verification_expires_at' => null,
                ])->save();

                return ['error' => 'Kode sudah kedaluwarsa. Minta kode baru.'];
            }

            if (! Hash::check($validated['code'], $connection->verification_code_hash)) {
                $connection->forceFill([
                    'verification_attempts' => $connection->verification_attempts + 1,
                ])->save();

                return ['error' => 'Kode verifikasi tidak cocok.'];
            }

            $connection->forceFill([
                'phone_verified_at' => now(),
                'verification_code_hash' => null,
                'verification_expires_at' => null,
                'verification_attempts' => 0,
            ])->save();

            return ['connection' => $connection->fresh()];
        });

        if (isset($result['error'])) {
            throw ValidationException::withMessages(['code' => $result['error']]);
        }

        /** @var WhatsAppConnection $connection */
        $connection = $result['connection'];

        return response()->json([
            'data' => ['settings' => $this->serialize($connection)],
            'message' => 'Nomor WhatsApp berhasil diverifikasi.',
        ]);
    }

    public function test(Request $request)
    {
        $connection = $this->connection($request);
        if (! $connection->enabled || ! $connection->phone_number || ! $connection->phone_verified_at) {
            throw ValidationException::withMessages(['enabled' => 'Aktifkan WhatsApp dan simpan nomor terlebih dahulu.']);
        }

        SendWhatsAppMessageJob::dispatch(
            $request->user()->id,
            'test',
            '✅ ORVYN berhasil terhubung. Reminder dan assistant WhatsApp siap digunakan.',
            'wa:test:'.$request->user()->id.':'.Str::uuid(),
        );

        return response()->json(['message' => 'Pesan uji masuk antrean.']);
    }

    private function connection(Request $request, bool $persist = true): WhatsAppConnection
    {
        $defaults = [
            'timezone' => config('whatsapp.default_timezone'),
            'daily_briefing_time' => config('whatsapp.default_briefing_time'),
            'reminder_lead_minutes' => config('whatsapp.default_reminder_lead_minutes'),
            'features' => WhatsAppConnection::defaultFeatures(),
        ];
        $relation = $request->user()->whatsappConnection();

        if ($persist) {
            return $relation->firstOrCreate([], $defaults);
        }

        return $relation->first() ?? new WhatsAppConnection([
            'user_id' => $request->user()->id,
            'enabled' => false,
            ...$defaults,
        ]);
    }

    private function serialize(WhatsAppConnection $connection): array
    {
        return [
            'phone_number' => $connection->phone_number,
            'enabled' => $connection->enabled,
            'timezone' => $connection->timezone,
            'daily_briefing_time' => substr((string) $connection->daily_briefing_time, 0, 5),
            'reminder_lead_minutes' => $connection->reminder_lead_minutes,
            'reminder_schedule' => $connection->resolvedReminderSchedule(),
            'features' => [...WhatsAppConnection::defaultFeatures(), ...($connection->features ?? [])],
            'consented' => (bool) $connection->consent_at,
            'verified' => (bool) $connection->phone_verified_at,
            'verification_expires_at' => $connection->verification_expires_at?->toIso8601String(),
            'last_inbound_at' => $connection->last_inbound_at,
            'last_outbound_at' => $connection->last_outbound_at,
        ];
    }

    private function isSessionAdmin(Request $request): bool
    {
        return in_array(
            Str::lower((string) $request->user()?->email),
            config('whatsapp.session_admin_emails', []),
            true,
        );
    }

    private function assertPhoneAvailable(Request $request, string $phone): void
    {
        $alreadyOwned = WhatsAppConnection::query()
            ->where('phone_number', $phone)
            ->where('user_id', '!=', $request->user()->getAuthIdentifier())
            ->exists();

        if ($alreadyOwned) {
            throw ValidationException::withMessages([
                'phone_number' => 'Nomor WhatsApp ini tidak dapat digunakan.',
            ]);
        }
    }
}
