<?php

namespace App\Console\Commands;

use App\Jobs\SendPushNotificationJob;
use App\Models\NotificationDelivery;
use App\Models\PushNotificationPreference;
use App\Services\Notifications\PushMessageComposer;
use Illuminate\Console\Command;

class DispatchPushNotifications extends Command
{
    protected $signature = 'notifications:dispatch-push {--user= : Dispatch only for one user UUID}';

    protected $description = 'Queue due mobile briefings, reminders, check-ins, and weekly reviews';

    public function handle(PushMessageComposer $composer): int
    {
        if (! config('services.expo_push.enabled')) {
            return self::SUCCESS;
        }

        PushNotificationPreference::query()
            ->with('user')
            ->where('enabled', true)
            ->whereHas('user.devicePushTokens', fn ($query) => $query->where('enabled', true))
            ->when($this->option('user'), fn ($query, $userId) => $query->where('user_id', $userId))
            ->chunkById(100, function ($preferences) use ($composer) {
                foreach ($preferences as $preference) {
                    $this->dispatchFor($preference, $composer);
                }
            });

        return self::SUCCESS;
    }

    private function dispatchFor(PushNotificationPreference $preference, PushMessageComposer $composer): void
    {
        $user = $preference->user;
        $localNow = now($preference->timezone);
        $minute = $localNow->format('H:i');
        $schedule = $preference->resolvedReminderSchedule();
        $date = $localNow->toDateString();

        if ($minute === $schedule['daily_briefing_time'] && $preference->featureEnabled('daily_briefing')) {
            $this->queue(
                $preference,
                'daily_briefing',
                $composer->dailyBriefing($user, $preference->timezone),
                "push:daily:{$user->id}:{$date}",
            );
        }

        if ($localNow->isoWeekday() === $schedule['weekly_review_day']
            && $minute === $schedule['weekly_review_time']
            && $preference->featureEnabled('weekly_review')) {
            $this->queue(
                $preference,
                'weekly_review',
                $composer->weeklyReview($user, $preference->timezone),
                "push:weekly:{$user->id}:{$localNow->format('o-W')}",
            );
        }

        if ($minute === $schedule['habit_checkin_time'] && $preference->featureEnabled('habit_health')) {
            $message = $composer->habitCheckIn($user, $preference->timezone);
            if ($message) {
                $this->queue($preference, 'evening_checkin', $message, "push:evening:{$user->id}:{$date}");
            }
        }

        if ($minute === $schedule['burnout_checkin_time'] && $preference->featureEnabled('burnout_checkins')) {
            $message = $composer->burnoutCheckIn($user);
            if ($message) {
                $this->queue($preference, 'burnout_checkin', $message, "push:burnout:{$user->id}:{$date}");
            }
        }

        if ($minute === $schedule['progress_checkin_time'] && $preference->featureEnabled('progress_checkins')) {
            $message = $composer->progressCheckIn($user);
            if ($message) {
                $this->queue($preference, 'progress_checkin', $message, "push:progress:{$user->id}:{$date}");
            }
        }

        if ($preference->featureEnabled('campus_departure_reminders')) {
            $user->campusSchedules()
                ->where('is_active', true)
                ->where('day_of_week', $localNow->isoWeekday())
                ->each(function ($campusSchedule) use ($preference, $composer, $date, $localNow, $user) {
                    $departureAt = $localNow->copy()
                        ->setTimeFromTimeString(substr((string) $campusSchedule->start_time, 0, 5))
                        ->subMinutes((int) $campusSchedule->commute_minutes + (int) $campusSchedule->prep_minutes);

                    if ($localNow->format('H:i') !== $departureAt->format('H:i')) {
                        return;
                    }

                    $this->queue(
                        $preference,
                        'campus_departure',
                        $composer->campusDeparture($campusSchedule),
                        "push:campus:{$user->id}:{$campusSchedule->id}:{$date}",
                    );
                });
        }

        if (! $preference->featureEnabled('deadline_reminders')) {
            return;
        }

        $now = now();
        $leadMinutes = collect($schedule['deadline_lead_minutes'])->sort()->values();
        if ($leadMinutes->isEmpty()) {
            return;
        }

        $user->tasks()->active()
            ->whereNotNull('deadline')
            ->whereBetween('deadline', [$now, $now->copy()->addMinutes($leadMinutes->max())])
            ->each(function ($task) use ($preference, $composer, $user, $now, $leadMinutes) {
                $remainingMinutes = max(1, (int) ceil(($task->deadline->timestamp - $now->timestamp) / 60));
                $activeLead = $leadMinutes->first(fn ($minutes) => $minutes >= $remainingMinutes);
                if (! $activeLead) {
                    return;
                }

                $this->queue(
                    $preference,
                    'deadline_reminder',
                    $composer->deadlineReminder($task, $preference->timezone, $activeLead),
                    "push:deadline:{$user->id}:{$task->id}:{$task->deadline->timestamp}:{$activeLead}",
                );
            });
    }

    /**
     * @param  array{title: string, body: string, data: array<string, mixed>}  $message
     */
    private function queue(
        PushNotificationPreference $preference,
        string $type,
        array $message,
        string $dedupeKey,
    ): void {
        $delivery = NotificationDelivery::firstOrCreate(
            ['dedupe_key' => $dedupeKey],
            [
                'user_id' => $preference->user_id,
                'channel' => 'push',
                'type' => $type,
                'payload' => $message,
                'status' => 'queued',
            ],
        );

        if ($delivery->wasRecentlyCreated) {
            SendPushNotificationJob::dispatch(
                $preference->user_id,
                $type,
                $message['title'],
                $message['body'],
                $dedupeKey,
                $message['data'],
            );
        }
    }
}
