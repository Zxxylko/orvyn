<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppConnection extends Model
{
    use HasUuids;

    protected $table = 'whatsapp_connections';

    protected $fillable = [
        'user_id', 'phone_number', 'enabled', 'timezone', 'daily_briefing_time',
        'reminder_lead_minutes', 'reminder_schedule', 'features', 'consent_at',
        'last_inbound_at', 'last_outbound_at', 'phone_verified_at',
        'verification_code_hash', 'verification_expires_at', 'verification_attempts',
    ];

    protected $hidden = [
        'verification_code_hash',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'reminder_lead_minutes' => 'integer',
            'reminder_schedule' => 'array',
            'features' => 'array',
            'consent_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'verification_expires_at' => 'datetime',
            'verification_attempts' => 'integer',
            'last_inbound_at' => 'datetime',
            'last_outbound_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function featureEnabled(string $feature): bool
    {
        return (bool) data_get($this->features ?: self::defaultFeatures(), $feature, false);
    }

    public static function defaultFeatures(): array
    {
        return [
            'daily_briefing' => true,
            'deadline_reminders' => true,
            'task_capture' => true,
            'quick_actions' => true,
            'campus_updates' => true,
            'progress_checkins' => true,
            'burnout_checkins' => true,
            'habit_health' => true,
            'finance_logging' => true,
            'weekly_review' => true,
        ];
    }

    public function resolvedReminderSchedule(): array
    {
        $defaults = self::defaultReminderSchedule(
            $this->reminder_lead_minutes ?: 180,
            substr((string) ($this->daily_briefing_time ?: '07:00'), 0, 5),
        );
        $schedule = [...$defaults, ...($this->reminder_schedule ?? [])];
        $schedule['deadline_lead_minutes'] = collect($schedule['deadline_lead_minutes'] ?? [])
            ->map(fn ($minutes) => (int) $minutes)
            ->filter(fn ($minutes) => $minutes > 0)
            ->unique()
            ->sortDesc()
            ->values()
            ->all();

        return $schedule;
    }

    public static function defaultReminderSchedule(int $deadlineLeadMinutes = 180, string $briefingTime = '07:00'): array
    {
        return [
            'daily_briefing_time' => $briefingTime,
            'deadline_lead_minutes' => [$deadlineLeadMinutes],
            'progress_checkin_time' => '14:00',
            'burnout_checkin_time' => '16:00',
            'habit_checkin_time' => '18:00',
            'weekly_review_day' => 7,
            'weekly_review_time' => '19:00',
        ];
    }

    public static function normalizePhone(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone);
        if (str_starts_with($digits, '0')) {
            $digits = '62'.substr($digits, 1);
        }

        return $digits !== '' ? '+'.$digits : null;
    }
}
