<?php

namespace App\Services\WhatsApp;

use App\Events\TaskUpdated;
use App\Jobs\GenerateEmbeddingJob;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\AIManager;
use Carbon\Carbon;
use Illuminate\Support\Str;

class WhatsAppAssistantService
{
    public function __construct(
        private AIManager $ai,
        private WhatsAppMessageComposer $composer,
    ) {}

    public function handle(User $user, string $message): string
    {
        $message = trim($message);
        if ($message === '') {
            return $this->help();
        }

        $intent = $this->ruleIntent($message) ?? $this->ai->interpretWhatsApp($message, $this->intentContext($user));
        $action = $intent['action'] ?? 'ask_assistant';
        if (in_array($action, ['complete_task', 'snooze_task', 'progress_update'], true)
            && ! $user->whatsappConnection?->featureEnabled('quick_actions')) {
            return 'Quick action dari WhatsApp sedang dinonaktifkan di Preferensi Sistem.';
        }

        return match ($action) {
            'create_task' => $this->createTask($user, $message),
            'list_tasks' => $this->listTasks($user, $intent['date'] ?? $this->dateHint($message)),
            'show_schedule' => $this->showSchedule($user, $intent['date'] ?? $this->dateHint($message)),
            'complete_task' => $this->completeTask($user, (string) ($intent['target'] ?? '')),
            'snooze_task' => $this->snoozeTask($user, (string) ($intent['target'] ?? ''), (float) ($intent['value'] ?? 1), (string) ($intent['unit'] ?? 'jam')),
            'progress_update' => $this->progressUpdate($user, (string) ($intent['target'] ?? '')),
            'log_expense' => $this->logExpense($user, $message, $intent),
            'check_habit' => $this->checkHabit($user, (string) ($intent['target'] ?? $message)),
            'log_health' => $this->logHealth($user, $message, $intent),
            'weekly_review' => $this->composer->weeklyReview($user, $this->timezone($user)),
            'burnout_check' => $this->composer->burnoutCheckIn($user) ?? '✅ Bebanmu masih dalam rentang aman. Pertahankan jeda dan fokus pada satu tugas terpenting.',
            'help' => $this->help(),
            default => $this->answer($user, $message),
        };
    }

    private function ruleIntent(string $message): ?array
    {
        $lower = Str::lower($message);

        if (preg_match('/^(menu|help|bantuan|fitur)\b/u', $lower)) {
            return ['action' => 'help'];
        }
        if (preg_match('/^(review mingguan|ringkasan minggu|weekly review)\b/u', $lower)) {
            return ['action' => 'weekly_review'];
        }
        if (preg_match('/^(burnout|stres|cek energi|capek)\b/u', $lower)) {
            return ['action' => 'burnout_check'];
        }
        if (preg_match('/^(tugas|deadline)(?:\s+(hari ini|besok|minggu ini))?/u', $lower, $match)) {
            return ['action' => 'list_tasks', 'date' => $match[2] ?? 'hari ini'];
        }
        if (preg_match('/^jadwal(?:\s+(hari ini|besok))?/u', $lower, $match)) {
            return ['action' => 'show_schedule', 'date' => $match[1] ?? 'hari ini'];
        }
        if (preg_match('/^(?:selesai|done)\s+(.+)/u', $lower, $match)) {
            return ['action' => 'complete_task', 'target' => trim($match[1])];
        }
        if (preg_match('/^(?:mulai|kerjakan|progress)\s+(.+)/u', $lower, $match)) {
            return ['action' => 'progress_update', 'target' => trim($match[1])];
        }
        if (preg_match('/^(?:tunda|snooze)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(menit|jam|hari)$/u', $lower, $match)) {
            return ['action' => 'snooze_task', 'target' => trim($match[1]), 'value' => (float) str_replace(',', '.', $match[2]), 'unit' => $match[3]];
        }
        if (preg_match('/^(?:tambah|buat|catat)(?:kan)?\s+(?:tugas\s+)?(.+)/u', $lower)) {
            return ['action' => 'create_task'];
        }
        if (preg_match('/^(?:pengeluaran|keluar|catat pengeluaran)\b/u', $lower)) {
            return ['action' => 'log_expense'];
        }
        if (preg_match('/^(?:habit|kebiasaan)\s+(.+?)(?:\s+(?:selesai|done))$/u', $lower, $match)) {
            return ['action' => 'check_habit', 'target' => trim($match[1])];
        }
        if (preg_match('/^(?:minum|tidur|kopi|kafein|screen time)\b/u', $lower)) {
            return ['action' => 'log_health'];
        }

        return null;
    }

    private function createTask(User $user, string $message): string
    {
        if (! $user->whatsappConnection?->featureEnabled('task_capture')) {
            return 'Input tugas dari WhatsApp sedang dinonaktifkan di Preferensi Sistem.';
        }

        $clean = preg_replace('/^(?:tambah|buat|catat)(?:kan)?\s+(?:tugas\s+)?/iu', '', $message) ?: $message;
        $parsed = $this->ai->parseTask($clean);
        $task = $user->tasks()->create($parsed);
        GenerateEmbeddingJob::dispatch($task);

        $deadline = $task->deadline?->timezone($this->timezone($user))->format('d M, H:i') ?? 'belum ditentukan';

        return "✅ Tugas dibuat\n\n*{$task->title}*\nDeadline: {$deadline}\nPrioritas: {$task->priority}\nID: ".substr($task->id, 0, 8);
    }

    private function listTasks(User $user, ?string $hint): string
    {
        $timezone = $this->timezone($user);
        $local = $this->resolveDate($hint, $timezone);
        $query = $user->tasks()->active()->orderBy('deadline')->orderByDesc('priority');

        if (Str::contains(Str::lower((string) $hint), 'minggu')) {
            $query->whereBetween('deadline', [$local->copy()->startOfWeek()->utc(), $local->copy()->endOfWeek()->utc()]);
            $label = 'minggu ini';
        } else {
            $query->whereBetween('deadline', [$local->copy()->startOfDay()->utc(), $local->copy()->endOfDay()->utc()]);
            $label = $local->isTomorrow() ? 'besok' : 'hari ini';
        }

        $tasks = $query->limit(10)->get();
        if ($tasks->isEmpty()) {
            return "🎉 Tidak ada tugas dengan deadline {$label}.";
        }

        $lines = ["📋 *Tugas {$label}*", ''];
        foreach ($tasks as $index => $task) {
            $time = $task->deadline?->timezone($timezone)->format('d M H:i') ?? '-';
            $lines[] = ($index + 1).". {$task->title} — {$time}";
        }
        $lines[] = '';
        $lines[] = 'Balas *selesai 1* atau *tunda 1 2 jam*.';

        return implode("\n", $lines);
    }

    private function showSchedule(User $user, ?string $hint): string
    {
        $timezone = $this->timezone($user);
        $date = $this->resolveDate($hint, $timezone);
        $blocks = $user->timeBlocks()
            ->whereBetween('start_time', [$date->copy()->startOfDay()->utc(), $date->copy()->endOfDay()->utc()])
            ->orderBy('start_time')->get();
        $classes = $user->campusSchedules()->where('is_active', true)->where('day_of_week', $date->dayOfWeek)->orderBy('start_time')->get();

        if ($blocks->isEmpty() && $classes->isEmpty()) {
            return '📅 Belum ada jadwal untuk '.$date->translatedFormat('l, d M').'.';
        }

        $lines = ['📅 *Jadwal '.$date->translatedFormat('l, d M').'*', ''];
        foreach ($classes as $class) {
            $lines[] = '🎓 '.substr($class->start_time, 0, 5)." {$class->course_name}".($class->room ? " · {$class->room}" : '');
        }
        foreach ($blocks as $block) {
            $lines[] = '⏱ '.$block->start_time->timezone($timezone)->format('H:i')." {$block->label}";
        }

        return implode("\n", $lines);
    }

    private function completeTask(User $user, string $target): string
    {
        $task = $this->resolveTask($user, $target);
        if (! $task) {
            return "Tugas *{$target}* tidak ditemukan. Coba balas *tugas hari ini* lalu gunakan nomor urutnya.";
        }

        $task->update(['status' => 'completed', 'completed_at' => now()]);
        broadcast(new TaskUpdated($task));

        return "🎉 Mantap! *{$task->title}* ditandai selesai.";
    }

    private function snoozeTask(User $user, string $target, float $value, string $unit): string
    {
        $task = $this->resolveTask($user, $target);
        if (! $task) {
            return "Tugas *{$target}* tidak ditemukan.";
        }

        $minutes = match ($unit) {
            'menit' => (int) $value,
            'hari' => (int) round($value * 1440),
            default => (int) round($value * 60),
        };
        $deadline = ($task->deadline ?: now())->addMinutes(max(1, $minutes));
        $task->update(['deadline' => $deadline]);
        broadcast(new TaskUpdated($task));

        return "⏳ *{$task->title}* ditunda ke ".$deadline->timezone($this->timezone($user))->format('d M, H:i').'.';
    }

    private function progressUpdate(User $user, string $target): string
    {
        $task = $this->resolveTask($user, $target);
        if (! $task) {
            return "Tugas *{$target}* tidak ditemukan.";
        }
        $task->update(['status' => 'in_progress']);
        broadcast(new TaskUpdated($task));

        return "🎯 *{$task->title}* sekarang berstatus sedang dikerjakan. Fokus satu langkah kecil dulu.";
    }

    private function logExpense(User $user, string $message, array $intent): string
    {
        if (! $user->whatsappConnection?->featureEnabled('finance_logging')) {
            return 'Pencatatan keuangan dari WhatsApp sedang dinonaktifkan.';
        }

        $amount = (float) ($intent['value'] ?? $this->parseMoney($message));
        if ($amount <= 0) {
            return 'Nominal belum terbaca. Contoh: *pengeluaran 25k makan siang*.';
        }
        $lower = Str::lower($message);
        $category = match (true) {
            Str::contains($lower, ['kopi', 'ngopi']) => 'coffee',
            Str::contains($lower, ['makan', 'nasi', 'jajan']) => 'food',
            Str::contains($lower, ['laundry', 'cuci']) => 'laundry',
            Str::contains($lower, ['kost', 'kontrakan', 'sewa']) => 'rent',
            Str::contains($lower, ['subscription', 'langganan', 'saas']) => 'developer_sub',
            default => 'other',
        };

        $user->livingExpenses()->create([
            'amount' => $amount,
            'category' => $category,
            'description' => Str::limit($message, 255, ''),
            'expense_date' => now($this->timezone($user))->toDateString(),
        ]);

        return '💸 Pengeluaran *Rp '.number_format($amount, 0, ',', '.')."* tercatat di kategori {$category}.";
    }

    private function checkHabit(User $user, string $target): string
    {
        if (! $user->whatsappConnection?->featureEnabled('habit_health')) {
            return 'Pencatatan habit dari WhatsApp sedang dinonaktifkan.';
        }
        $target = preg_replace('/^(?:habit|kebiasaan)\s+/iu', '', $target);
        $target = preg_replace('/\s+(?:selesai|done)$/iu', '', (string) $target);
        $habit = $user->habits()->where('is_active', true)->whereRaw('LOWER(name) LIKE ?', ['%'.Str::lower(trim((string) $target)).'%'])->first();
        if (! $habit) {
            return "Habit *{$target}* tidak ditemukan.";
        }
        $habit->checkIns()->updateOrCreate(
            ['check_in_date' => now($this->timezone($user))->toDateString()],
            ['user_id' => $user->id, 'value' => $habit->target_per_day],
        );

        return "🔥 Habit *{$habit->name}* selesai dicatat. Streak tetap jalan!";
    }

    private function logHealth(User $user, string $message, array $intent): string
    {
        if (! $user->whatsappConnection?->featureEnabled('habit_health')) {
            return 'Pencatatan kesehatan dari WhatsApp sedang dinonaktifkan.';
        }
        $lower = Str::lower($message);
        preg_match('/(\d+(?:[.,]\d+)?)/', $lower, $match);
        $value = (float) ($intent['value'] ?? str_replace(',', '.', $match[1] ?? '0'));
        if ($value <= 0) {
            return 'Nilainya belum terbaca. Contoh: *minum 500ml* atau *tidur 7 jam*.';
        }

        $log = $user->healthLogs()->firstOrNew(['log_date' => now($this->timezone($user))->toDateString()]);
        if (Str::contains($lower, ['minum', 'air', 'hidrasi'])) {
            $log->hydration_ml = (int) $log->hydration_ml + (int) $value;
            $label = "{$value}ml air";
        } elseif (Str::contains($lower, ['tidur'])) {
            $log->sleep_hours = $value;
            $label = "{$value} jam tidur";
        } elseif (Str::contains($lower, ['kopi', 'kafein'])) {
            $log->caffeine_mg = (int) $log->caffeine_mg + (int) $value;
            $label = "{$value}mg kafein";
        } else {
            $log->screen_time_minutes = (int) $value;
            $label = "{$value} menit screen time";
        }
        $log->save();

        return "🌱 {$label} berhasil dicatat di Health Guard.";
    }

    private function answer(User $user, string $question): string
    {
        $context = [
            'active_tasks' => $user->tasks()->active()->orderBy('deadline')->limit(8)->get(['title', 'deadline', 'priority'])->toArray(),
            'overdue_count' => $user->tasks()->overdue()->count(),
            'today_schedule' => $this->scheduleContext($user),
        ];

        return $this->ai->answer($question, $context)
            ?? 'Aku belum yakin dengan maksudnya. Balas *menu* untuk melihat perintah yang tersedia.';
    }

    private function resolveTask(User $user, string $target): ?Task
    {
        $target = trim($target);
        $tasks = $user->tasks()->active()->orderBy('deadline')->orderByDesc('priority')->get();
        if (ctype_digit($target)) {
            return $tasks->get(max(0, (int) $target - 1));
        }

        return $tasks->first(fn (Task $task) => str_starts_with($task->id, $target))
            ?? $tasks->first(fn (Task $task) => Str::contains(Str::lower($task->title), Str::lower($target)));
    }

    private function intentContext(User $user): array
    {
        return ['active_tasks' => $user->tasks()->active()->limit(10)->pluck('title')->all(), 'timezone' => $this->timezone($user)];
    }

    private function scheduleContext(User $user): array
    {
        $timezone = $this->timezone($user);
        $today = now($timezone);

        return $user->timeBlocks()->whereBetween('start_time', [$today->copy()->startOfDay()->utc(), $today->copy()->endOfDay()->utc()])->get(['label', 'start_time', 'end_time'])->toArray();
    }

    private function resolveDate(?string $hint, string $timezone): Carbon
    {
        return Str::contains(Str::lower((string) $hint), 'besok') ? now($timezone)->addDay() : now($timezone);
    }

    private function dateHint(string $message): string
    {
        return Str::contains(Str::lower($message), 'besok') ? 'besok' : (Str::contains(Str::lower($message), 'minggu') ? 'minggu ini' : 'hari ini');
    }

    private function parseMoney(string $message): float
    {
        if (! preg_match('/(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?/iu', $message, $match)) {
            return 0;
        }
        $value = (float) str_replace(',', '.', $match[1]);

        return $value * match (Str::lower($match[2] ?? '')) {
            'rb', 'ribu', 'k' => 1000, 'jt', 'juta' => 1000000, default => 1
        };
    }

    private function timezone(User $user): string
    {
        return $user->whatsappConnection?->timezone ?: config('whatsapp.default_timezone');
    }

    private function help(): string
    {
        return "🤖 *ORVYN WhatsApp Assistant*\n\n• tambah tugas laporan AI besok\n• tugas hari ini / jadwal besok\n• selesai 1 / tunda 1 2 jam\n• mulai 1\n• pengeluaran 25k makan\n• habit olahraga selesai\n• minum 500ml / tidur 7 jam\n• review mingguan\n• apa prioritas saya?";
    }
}
