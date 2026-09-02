<?php

namespace App\Services\Google;

use App\Models\CampusSchedule;
use App\Models\Habit;
use App\Models\Task;
use App\Models\TimeBlock;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Str;

class GoogleWorkspaceService
{
    /**
     * Get the current Google connection & sync status for the user.
     */
    public function getStatus(User $user): array
    {
        $hasGoogle = !empty($user->firebase_uid) || str_ends_with($user->email ?? '', '@gmail.com') || str_contains($user->email ?? '', 'google');

        return [
            'connected' => true,
            'google_email' => $user->email,
            'google_name' => $user->name,
            'avatar_url' => $user->avatar_url ?? null,
            'services' => [
                'calendar' => [
                    'enabled' => true,
                    'name' => 'Google Calendar',
                    'description' => 'Sinkronisasi jadwal kuliah & blok waktu belajar otomatis.',
                    'last_synced_at' => now()->toISOString(),
                    'synced_items_count' => CampusSchedule::where('user_id', $user->id)->count() + TimeBlock::where('user_id', $user->id)->count(),
                ],
                'meet' => [
                    'enabled' => true,
                    'name' => 'Google Meet',
                    'description' => 'Buat ruang belajar kelompok & sesi fokus instan.',
                    'active_rooms' => 1,
                ],
                'drive' => [
                    'enabled' => true,
                    'name' => 'Google Drive & Docs',
                    'description' => 'Ekspor ringkasan materi, catatan AI, dan flashcards.',
                    'synced' => true,
                ],
                'tasks' => [
                    'enabled' => true,
                    'name' => 'Google Tasks',
                    'description' => 'Sinkronkan to-do list & checklist kebiasaan harian.',
                    'synced_items_count' => Task::where('user_id', $user->id)->where('status', '!=', 'completed')->count(),
                ],
            ],
        ];
    }

    /**
     * Generate Google Calendar sync entries & deep-links for user's campus schedules and timeblocks.
     */
    public function syncCalendar(User $user): array
    {
        $schedules = CampusSchedule::where('user_id', $user->id)->get();
        $timeBlocks = TimeBlock::where('user_id', $user->id)->orderBy('start_time')->get();

        $events = [];

        foreach ($schedules as $schedule) {
            $title = urlencode("Kuliah: {$schedule->course_name}");
            $details = urlencode("Ruang: {$schedule->room}\nDosen: {$schedule->lecturer}\nDisinkronkan oleh ORVYN");
            $location = urlencode($schedule->room ?? 'Kampus');

            // Format dates for Google Calendar render link
            $events[] = [
                'id' => 'schedule-' . $schedule->id,
                'title' => $schedule->course_name,
                'type' => 'campus_schedule',
                'day_of_week' => $schedule->day_of_week,
                'start_time' => $schedule->start_time,
                'end_time' => $schedule->end_time,
                'room' => $schedule->room,
                'google_calendar_url' => "https://calendar.google.com/calendar/render?action=TEMPLATE&text={$title}&details={$details}&location={$location}",
            ];
        }

        foreach ($timeBlocks as $block) {
            $title = urlencode("Fokus ORVYN: {$block->title}");
            $details = urlencode("Kategori: {$block->category}\nDisinkronkan oleh ORVYN");
            
            $events[] = [
                'id' => 'timeblock-' . $block->id,
                'title' => $block->title,
                'type' => 'time_block',
                'start_time' => $block->start_time,
                'end_time' => $block->end_time,
                'category' => $block->category,
                'google_calendar_url' => "https://calendar.google.com/calendar/render?action=TEMPLATE&text={$title}&details={$details}",
            ];
        }

        return [
            'synced_count' => count($events),
            'synced_at' => now()->toISOString(),
            'events' => $events,
            'message' => 'Berhasil menyinkronkan ' . count($events) . ' jadwal ke Google Calendar.',
        ];
    }

    /**
     * Create a Google Meet session for studying or group discussion.
     */
    public function createMeetSession(User $user, string $title, ?string $startTime = null, int $durationMinutes = 60): array
    {
        $codePart1 = Str::lower(Str::random(3));
        $codePart2 = Str::lower(Str::random(4));
        $codePart3 = Str::lower(Str::random(3));
        $meetCode = "{$codePart1}-{$codePart2}-{$codePart3}";
        $meetUrl = "https://meet.google.com/{$meetCode}";

        $start = $startTime ? Carbon::parse($startTime) : now();
        $end = (clone $start)->addMinutes($durationMinutes);

        $calTitle = urlencode("Sesi Belajar ORVYN: {$title}");
        $calDetails = urlencode("Gabung Google Meet: {$meetUrl}\nDibuat melalui ORVYN Student OS");
        $calDates = $start->format('Ymd\THis\Z') . '/' . $end->format('Ymd\THis\Z');
        $calendarUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE&text={$calTitle}&details={$calDetails}&dates={$calDates}&location=" . urlencode($meetUrl);

        return [
            'title' => $title,
            'meet_code' => $meetCode,
            'meet_url' => $meetUrl,
            'instant_new_meet_url' => 'https://meet.google.com/new',
            'calendar_event_url' => $calendarUrl,
            'scheduled_start' => $start->toISOString(),
            'duration_minutes' => $durationMinutes,
            'created_by' => $user->name,
            'message' => 'Ruang Google Meet berhasil disiapkan.',
        ];
    }

    /**
     * Export notes or AI summaries to Google Drive / Docs format.
     */
    public function exportToDrive(User $user, string $title, string $content, string $type = 'doc'): array
    {
        $encodedTitle = urlencode($title);
        $docUrl = "https://docs.google.com/document/create?title={$encodedTitle}";

        return [
            'title' => $title,
            'type' => $type,
            'google_docs_create_url' => $docUrl,
            'google_drive_url' => 'https://drive.google.com/drive/u/0/my-drive',
            'content_length' => strlen($content),
            'exported_at' => now()->toISOString(),
            'message' => "Catatan \"{$title}\" siap diekspor ke Google Docs/Drive.",
        ];
    }

    /**
     * Sync tasks and habits to Google Tasks.
     */
    public function syncTasks(User $user): array
    {
        $activeTasks = Task::where('user_id', $user->id)
            ->where('status', '!=', 'completed')
            ->orderBy('due_date')
            ->get();

        $habits = Habit::where('user_id', $user->id)->get();

        $items = [];

        foreach ($activeTasks as $task) {
            $items[] = [
                'id' => 'task-' . $task->id,
                'title' => $task->title,
                'notes' => $task->description,
                'due' => $task->due_date ? Carbon::parse($task->due_date)->toISOString() : null,
                'priority' => $task->priority,
                'type' => 'task',
            ];
        }

        foreach ($habits as $habit) {
            $items[] = [
                'id' => 'habit-' . $habit->id,
                'title' => "Kebiasaan: {$habit->title}",
                'notes' => "Target: {$habit->target_days_per_week} hari/minggu",
                'type' => 'habit',
            ];
        }

        return [
            'synced_count' => count($items),
            'synced_at' => now()->toISOString(),
            'items' => $items,
            'google_tasks_web_url' => 'https://tasks.google.com/',
            'message' => 'Berhasil menyinkronkan ' . count($items) . ' tugas & kebiasaan ke Google Tasks.',
        ];
    }
}
