<?php

namespace App\Services\Notifications;

use App\Models\CampusSchedule;
use App\Models\Task;
use App\Models\User;
use Carbon\CarbonInterface;

class PushMessageComposer
{
    /**
     * @return array{title: string, body: string, data: array<string, mixed>}
     */
    public function dailyBriefing(User $user, string $timezone): array
    {
        [$start, $end] = $this->utcDayBounds(now($timezone));
        $dueToday = $user->tasks()->active()->whereBetween('deadline', [$start, $end])->count();
        $overdue = $user->tasks()->overdue()->count();
        $blocks = $user->timeBlocks()->whereBetween('start_time', [$start, $end])->count();

        return [
            'title' => 'Selamat pagi, '.$this->firstName($user).' 👋',
            'body' => "{$dueToday} deadline hari ini, {$overdue} terlambat, dan {$blocks} blok jadwal.",
            'data' => ['screen' => 'Beranda'],
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, mixed>}
     */
    public function deadlineReminder(Task $task, string $timezone, int $leadMinutes): array
    {
        return [
            'title' => '⏰ Deadline mendekat',
            'body' => "{$task->title} · ".$task->deadline->timezone($timezone)->format('d M, H:i').' · '.$this->leadLabel($leadMinutes),
            'data' => [
                'screen' => 'Tugas',
                'task_id' => $task->id,
            ],
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, mixed>}
     */
    public function weeklyReview(User $user, string $timezone): array
    {
        $now = now($timezone);
        $completed = $user->tasks()->where('status', 'completed')->whereBetween('completed_at', [
            $now->copy()->startOfWeek()->utc(),
            $now->copy()->endOfWeek()->utc(),
        ])->count();
        $focus = $user->focusLogs()->whereBetween('started_at', [
            $now->copy()->startOfWeek()->utc(),
            $now->copy()->endOfWeek()->utc(),
        ])->sum('actual_minutes');

        return [
            'title' => '📊 Review mingguan ORVYN',
            'body' => "{$completed} tugas selesai dan {$focus} menit fokus minggu ini.",
            'data' => ['screen' => 'Hub', 'detail' => 'Briefing'],
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, mixed>}|null
     */
    public function habitCheckIn(User $user, string $timezone): ?array
    {
        $unchecked = $user->habits()
            ->where('is_active', true)
            ->whereDoesntHave('checkIns', fn ($query) => $query->whereDate('check_in_date', now($timezone)->toDateString()))
            ->count();

        if ($unchecked === 0) {
            return null;
        }

        return [
            'title' => '🌙 Check-in kebiasaan',
            'body' => "{$unchecked} habit belum dicatat hari ini. Sedikit progres tetap berarti.",
            'data' => ['screen' => 'Hub', 'detail' => 'Habits'],
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, mixed>}|null
     */
    public function burnoutCheckIn(User $user): ?array
    {
        $active = $user->tasks()->active()->count();
        $overdue = $user->tasks()->overdue()->count();
        if ($active < 10 && $overdue < 3) {
            return null;
        }

        return [
            'title' => '🧠 Jaga energi',
            'body' => "Ada {$active} tugas aktif dan {$overdue} terlambat. Pilih satu fokus utama dulu.",
            'data' => ['screen' => 'Beranda'],
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, mixed>}|null
     */
    public function progressCheckIn(User $user): ?array
    {
        $task = $user->tasks()->where('status', 'in_progress')->orderBy('deadline')->first();
        if (! $task) {
            return null;
        }

        return [
            'title' => '🎯 Check-in progres',
            'body' => "Bagaimana progres {$task->title}? Buka ORVYN untuk memperbaruinya.",
            'data' => ['screen' => 'Tugas', 'task_id' => $task->id],
        ];
    }

    /**
     * @return array{title: string, body: string, data: array<string, mixed>}
     */
    public function campusDeparture(CampusSchedule $schedule): array
    {
        $location = collect([$schedule->building, $schedule->room])
            ->filter()
            ->implode(' · ');
        $locationText = $location !== '' ? " di {$location}" : '';

        return [
            'title' => '🎓 Waktunya bersiap ke kelas',
            'body' => "{$schedule->course_name} mulai ".substr((string) $schedule->start_time, 0, 5)."{$locationText}.",
            'data' => ['screen' => 'Hub', 'detail' => 'Campus'],
        ];
    }

    private function utcDayBounds(CarbonInterface $localDate): array
    {
        return [$localDate->copy()->startOfDay()->utc(), $localDate->copy()->endOfDay()->utc()];
    }

    private function firstName(User $user): string
    {
        return explode(' ', trim($user->name))[0] ?: 'teman';
    }

    private function leadLabel(int $minutes): string
    {
        return match (true) {
            $minutes % 1440 === 0 => ($minutes / 1440).' hari lagi',
            $minutes % 60 === 0 => ($minutes / 60).' jam lagi',
            default => $minutes.' menit lagi',
        };
    }
}
