<?php

namespace App\Services\WhatsApp;

use App\Models\Task;
use App\Models\User;
use Carbon\CarbonInterface;

class WhatsAppMessageComposer
{
    public function dailyBriefing(User $user, string $timezone): string
    {
        [$start, $end] = $this->utcDayBounds(now($timezone));
        $tasks = $user->tasks()->active()->whereBetween('deadline', [$start, $end])->orderBy('deadline')->get();
        $overdue = $user->tasks()->overdue()->count();
        $scheduleCount = $user->timeBlocks()->whereBetween('start_time', [$start, $end])->count();

        $lines = ["Selamat pagi, {$this->firstName($user)} 👋", '', 'Ringkasan ORVYN hari ini:'];
        if ($tasks->isEmpty()) {
            $lines[] = '• Tidak ada deadline hari ini.';
        } else {
            foreach ($tasks->take(6) as $index => $task) {
                $lines[] = ($index + 1).". {$task->title} — ".$task->deadline->timezone($timezone)->format('H:i');
            }
        }
        $lines[] = "• {$overdue} tugas terlambat • {$scheduleCount} blok jadwal";
        $lines[] = '';
        $lines[] = 'Balas *tugas hari ini*, *jadwal*, atau *menu* untuk aksi cepat.';

        return implode("\n", $lines);
    }

    public function deadlineReminder(Task $task, string $timezone, ?int $leadMinutes = null): string
    {
        $stage = match (true) {
            ! $leadMinutes => null,
            $leadMinutes % 1440 === 0 => ($leadMinutes / 1440).' hari sebelumnya',
            $leadMinutes % 60 === 0 => ($leadMinutes / 60).' jam sebelumnya',
            default => $leadMinutes.' menit sebelumnya',
        };
        $stageLine = $stage ? "\nTahap reminder: *{$stage}*" : '';

        return "⏰ Deadline mendekat\n\n*{$task->title}*\nBatas: {$task->deadline->timezone($timezone)->format('d M, H:i')}{$stageLine}\nPrioritas: {$task->priority}\n\nBalas *selesai {$task->id}* atau *tunda {$task->id} 1 jam*.";
    }

    public function weeklyReview(User $user, string $timezone): string
    {
        $now = now($timezone);
        $completed = $user->tasks()->where('status', 'completed')->whereBetween('completed_at', [
            $now->copy()->startOfWeek()->utc(), $now->copy()->endOfWeek()->utc(),
        ])->count();
        $focus = $user->focusLogs()->whereBetween('started_at', [
            $now->copy()->startOfWeek()->utc(), $now->copy()->endOfWeek()->utc(),
        ])->sum('actual_minutes');
        $overdue = $user->tasks()->overdue()->count();

        return "📊 *Review Mingguan ORVYN*\n\n✅ {$completed} tugas selesai\n🎯 {$focus} menit fokus\n⚠️ {$overdue} tugas masih terlambat\n\nBalas *tugas minggu ini* untuk menyusun langkah berikutnya.";
    }

    public function burnoutCheckIn(User $user): ?string
    {
        $active = $user->tasks()->active()->count();
        $overdue = $user->tasks()->overdue()->count();
        if ($active < 10 && $overdue < 3) {
            return null;
        }

        return "🧠 *Check-in energi*\n\nKamu punya {$active} tugas aktif dan {$overdue} terlambat. Jangan paksa semuanya sekaligus.\n\nBalas *apa prioritas saya?* untuk memilih satu fokus utama sekarang.";
    }

    public function eveningCheckIn(User $user, string $timezone): string
    {
        $unchecked = $user->habits()->where('is_active', true)->whereDoesntHave('checkIns', fn ($query) => $query->whereDate('check_in_date', now($timezone)->toDateString()))->count();

        return "🌙 *Check-in sore*\n\nMasih ada {$unchecked} habit yang belum dicatat hari ini. Kamu juga bisa balas *minum 500ml*, *tidur 7 jam*, atau *habit olahraga selesai*.";
    }

    public function progressCheckIn(User $user): ?string
    {
        $task = $user->tasks()->where('status', 'in_progress')->orderBy('deadline')->first();
        if (! $task) {
            return null;
        }

        return "🎯 *Check-in progres*\n\nBagaimana progres *{$task->title}*?\n\nBalas *selesai {$task->id}* jika sudah beres, atau *tunda {$task->id} 1 jam* jika perlu waktu tambahan.";
    }

    private function utcDayBounds(CarbonInterface $localDate): array
    {
        return [$localDate->copy()->startOfDay()->utc(), $localDate->copy()->endOfDay()->utc()];
    }

    private function firstName(User $user): string
    {
        return explode(' ', trim($user->name))[0] ?: 'teman';
    }
}
