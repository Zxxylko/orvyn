<?php

namespace App\Console\Commands;

use App\Jobs\SendWhatsAppMessageJob;
use App\Models\NotificationDelivery;
use App\Models\WhatsAppConnection;
use App\Services\WhatsApp\WhatsAppMessageComposer;
use Illuminate\Console\Command;

class DispatchWhatsAppNotifications extends Command
{
    protected $signature = 'notifications:dispatch-whatsapp {--user= : Dispatch only for one user UUID}';

    protected $description = 'Queue due WhatsApp briefings, reminders, check-ins, and weekly reviews';

    public function handle(WhatsAppMessageComposer $composer): int
    {
        WhatsAppConnection::query()
            ->with('user')
            ->where('enabled', true)
            ->whereNotNull('phone_number')
            ->when($this->option('user'), fn ($query, $userId) => $query->where('user_id', $userId))
            ->chunkById(100, function ($connections) use ($composer) {
                foreach ($connections as $connection) {
                    $this->dispatchFor($connection, $composer);
                }
            });

        return self::SUCCESS;
    }

    private function dispatchFor(WhatsAppConnection $connection, WhatsAppMessageComposer $composer): void
    {
        $user = $connection->user;
        $localNow = now($connection->timezone);
        $minute = $localNow->format('H:i');
        $schedule = $connection->resolvedReminderSchedule();
        $date = $localNow->toDateString();

        if ($minute === $schedule['daily_briefing_time'] && $connection->featureEnabled('daily_briefing')) {
            $this->queue($connection, 'daily_briefing', $composer->dailyBriefing($user, $connection->timezone), "wa:daily:{$user->id}:{$date}");
        }

        if ($localNow->isoWeekday() === $schedule['weekly_review_day']
            && $minute === $schedule['weekly_review_time']
            && $connection->featureEnabled('weekly_review')) {
            $this->queue($connection, 'weekly_review', $composer->weeklyReview($user, $connection->timezone), "wa:weekly:{$user->id}:{$localNow->format('o-W')}");
        }

        if ($minute === $schedule['habit_checkin_time'] && $connection->featureEnabled('habit_health')) {
            $this->queue($connection, 'evening_checkin', $composer->eveningCheckIn($user, $connection->timezone), "wa:evening:{$user->id}:{$date}");
        }

        if ($minute === $schedule['burnout_checkin_time'] && $connection->featureEnabled('burnout_checkins')) {
            $message = $composer->burnoutCheckIn($user);
            if ($message) {
                $this->queue($connection, 'burnout_checkin', $message, "wa:burnout:{$user->id}:{$date}");
            }
        }

        if ($minute === $schedule['progress_checkin_time'] && $connection->featureEnabled('progress_checkins')) {
            $message = $composer->progressCheckIn($user);
            if ($message) {
                $this->queue($connection, 'progress_checkin', $message, "wa:progress:{$user->id}:{$date}");
            }
        }

        if ($connection->featureEnabled('deadline_reminders')) {
            $now = now();
            $leadMinutes = collect($schedule['deadline_lead_minutes'])->sort()->values();
            $user->tasks()->active()
                ->whereNotNull('deadline')
                ->whereBetween('deadline', [$now, $now->copy()->addMinutes($leadMinutes->max())])
                ->each(function ($task) use ($connection, $composer, $user, $now, $leadMinutes) {
                    $remainingMinutes = max(1, (int) ceil(($task->deadline->timestamp - $now->timestamp) / 60));
                    $activeLead = $leadMinutes->first(fn ($minutes) => $minutes >= $remainingMinutes);
                    if (! $activeLead) {
                        return;
                    }

                    $key = "wa:deadline:{$user->id}:{$task->id}:{$task->deadline->timestamp}:{$activeLead}";
                    $this->queue(
                        $connection,
                        'deadline_reminder',
                        $composer->deadlineReminder($task, $connection->timezone, $activeLead),
                        $key,
                        ['task_id' => $task->id, 'lead_minutes' => $activeLead],
                    );
                });
        }
    }

    private function queue(WhatsAppConnection $connection, string $type, string $message, string $dedupeKey, array $metadata = []): void
    {
        $delivery = NotificationDelivery::firstOrCreate(
            ['dedupe_key' => $dedupeKey],
            [
                'user_id' => $connection->user_id,
                'channel' => 'whatsapp',
                'type' => $type,
                'recipient' => $connection->phone_number,
                'payload' => ['message' => $message, ...$metadata],
                'status' => 'queued',
            ],
        );

        if ($delivery->wasRecentlyCreated) {
            SendWhatsAppMessageJob::dispatch($connection->user_id, $type, $message, $dedupeKey, $metadata);
        }
    }
}
