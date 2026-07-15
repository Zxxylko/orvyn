<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendWhatsAppMessageJob;
use App\Models\WhatsAppConnection;
use App\Services\AI\AIManager;
use App\Services\WhatsApp\WhatsAppGateway;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class WhatsAppConnectionController extends Controller
{
    public function show(Request $request, WhatsAppGateway $gateway, AIManager $ai)
    {
        $connection = $this->connection($request, persist: false);

        return response()->json(['data' => [
            'settings' => $this->serialize($connection),
            'service' => $gateway->status(),
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
        }
        if (($validated['enabled'] ?? false) && ! ($validated['phone_number'] ?? $connection->phone_number)) {
            throw ValidationException::withMessages(['phone_number' => 'Nomor WhatsApp wajib diisi sebelum notifikasi diaktifkan.']);
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

    public function connect(WhatsAppGateway $gateway)
    {
        return response()->json(['data' => $gateway->connect()]);
    }

    public function test(Request $request)
    {
        $connection = $this->connection($request);
        if (! $connection->enabled || ! $connection->phone_number) {
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
            'last_inbound_at' => $connection->last_inbound_at,
            'last_outbound_at' => $connection->last_outbound_at,
        ];
    }
}
