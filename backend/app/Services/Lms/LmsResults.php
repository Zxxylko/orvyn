<?php

namespace App\Services\Lms;

use App\Models\LmsConnection;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/** Only the current student's results. No submission, attempt or grading writes. */
class LmsResults
{
    private const FUNCTIONS = [
        'core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents',
        'gradereport_user_get_grade_items', 'mod_assign_get_submission_status', 'mod_quiz_get_user_attempts',
    ];

    private int $calls = 0;

    private float $started = 0;

    public function call(string $token, string $function, array $args = []): array
    {
        if (! in_array($function, self::FUNCTIONS, true)) {
            throw new LmsSyncException('Fungsi LMS ini tidak diizinkan oleh konektor baca.');
        }
        if (++$this->calls > 200 || ($this->started && microtime(true) - $this->started > 100)) {
            throw new LmsSyncException('Batas pemeriksaan LMS tercapai. Data terakhir tetap tersimpan.');
        }
        try {
            $response = Http::asForm()->connectTimeout(5)->timeout(12)->withoutRedirecting()
                ->post('https://'.LmsCalendar::HOST.'/webservice/rest/server.php', [
                    ...$args, 'wstoken' => $token, 'wsfunction' => $function, 'moodlewsrestformat' => 'json',
                ]);
            $data = $response->json();
            if (! $response->successful() || strlen($response->body()) > 5 * 1024 * 1024 || ! is_array($data)) {
                throw new LmsSyncException('API LMS belum dapat dijangkau.');
            }
            if (isset($data['exception']) || isset($data['errorcode'])) {
                throw new LmsSyncException(in_array($data['errorcode'] ?? '', ['invalidtoken', 'accessexception', 'wsaccessuserexpired'], true)
                    ? 'Akses API LMS tidak berlaku atau tidak diizinkan. Sambungkan kembali akun LMS.'
                    : 'LMS belum mengizinkan pembacaan data ini.');
            }

            return $data;
        } catch (LmsSyncException $error) {
            throw $error;
        } catch (\Throwable) {
            // Provider errors may contain a request body/token. Never forward them.
            throw new LmsSyncException('API LMS belum dapat dijangkau. Data terakhir tetap tersimpan.');
        }
    }

    public function verify(string $token, LmsConnection $connection): array
    {
        return $this->verifyForCalendar($token, $connection->calendar_url);
    }

    public function verifyForCalendar(string $token, string $calendarUrl): array
    {
        if (! preg_match('/^[A-Za-z0-9_-]{32,128}$/D', $token)) {
            throw new LmsSyncException('Format token API tidak valid.');
        }
        $site = $this->call($token, 'core_webservice_get_site_info');
        parse_str(parse_url($calendarUrl, PHP_URL_QUERY) ?: '', $calendar);
        if (! isset($calendar['userid'], $site['userid']) || (string) $calendar['userid'] !== (string) $site['userid']
            || rtrim($site['siteurl'] ?? '', '/') !== 'https://'.LmsCalendar::HOST) {
            throw new LmsSyncException('Akun atau situs API berbeda dari pemilik kalender LMS.');
        }
        $functions = array_column($site['functions'] ?? [], 'name');
        foreach (self::FUNCTIONS as $required) {
            if (! in_array($required, $functions, true)) {
                throw new LmsSyncException('Token akun ini belum mengizinkan pembacaan mata kuliah dan gradebook.');
            }
        }

        return ['userid' => (int) $site['userid'], 'functions' => $functions];
    }

    public function collect(string $token, LmsConnection $connection): array
    {
        return $this->collectForCalendar($token, $connection->calendar_url);
    }

    public function collectForCalendar(string $token, string $calendarUrl): array
    {
        $this->calls = 0;
        $this->started = microtime(true);
        $site = $this->verifyForCalendar($token, $calendarUrl);
        $courses = $this->call($token, 'core_enrol_get_users_courses', ['userid' => $site['userid']]);
        if (count($courses) > 30) {
            throw new LmsSyncException('Lebih dari 30 mata kuliah perlu dipilih sebelum sinkronisasi nilai.');
        }
        $rows = [];
        $checked = [];
        $failed = 0;
        $statusErrors = 0;
        foreach ($courses as $course) {
            try {
                $sections = $this->call($token, 'core_course_get_contents', ['courseid' => $course['id'], 'options' => [['name' => 'excludecontents', 'value' => 1]]]);
                $book = $this->call($token, 'gradereport_user_get_grade_items', ['courseid' => $course['id'], 'userid' => $site['userid']]);
                $users = $book['usergrades'] ?? [];
                if (count($users) !== 1 || (int) ($users[0]['userid'] ?? 0) !== $site['userid']) {
                    throw new LmsSyncException('Gradebook tidak cocok dengan akun yang dipasangkan.');
                }
                $items = $users[0]['gradeitems'] ?? [];
                $modules = array_merge([], ...array_map(fn ($s) => $s['modules'] ?? [], $sections));
                if (count($items) > 200 || count($modules) > 500) {
                    throw new LmsSyncException('Mata kuliah melebihi batas pemeriksaan.');
                }
                $courseRows = [];
                foreach ($modules as $module) {
                    if (! in_array($module['modname'] ?? '', ['assign', 'quiz'], true) || ($module['uservisible'] ?? true) === false) {
                        continue;
                    }
                    $matching = array_values(array_filter($items, fn ($g) => ($g['itemtype'] ?? '') === 'mod'
                        && ($g['itemmodule'] ?? '') === $module['modname'] && (int) ($g['iteminstance'] ?? 0) === (int) ($module['instance'] ?? 0)));
                    $grade = count($matching) === 1 ? $matching[0] : null;
                    $row = $this->row($course, $module, $grade);
                    try {
                        if ($module['modname'] === 'assign' && in_array('mod_assign_get_submission_status', $site['functions'], true)) {
                            $result = $this->call($token, 'mod_assign_get_submission_status', ['assignid' => $module['instance'], 'userid' => $site['userid']]);
                            if (! empty($result['warnings'])) {
                                throw new LmsSyncException('Status belum terverifikasi.');
                            }
                            $attempt = $result['lastattempt'] ?? [];
                            $submission = $attempt['teamsubmission'] ?? $attempt['submission'] ?? null;
                            if (isset($submission['status'])) {
                                $row['submission_status'] = match ($submission['status']) {
                                    'submitted' => 'submitted', 'draft' => 'draft', 'new', 'reopened' => 'not_submitted', default => 'unknown'
                                };
                                $row['submitted_at'] = $row['submission_status'] === 'submitted' ? $this->stamp($submission['timemodified'] ?? null) : null;
                            }
                        } elseif ($module['modname'] === 'quiz' && in_array('mod_quiz_get_user_attempts', $site['functions'], true)) {
                            $result = $this->call($token, 'mod_quiz_get_user_attempts', ['quizid' => $module['instance'], 'userid' => $site['userid'], 'status' => 'all', 'includepreviews' => false]);
                            if (! empty($result['warnings']) || ! isset($result['attempts'])) {
                                throw new LmsSyncException('Percobaan kuis belum terverifikasi.');
                            }
                            $attempts = array_values(array_filter($result['attempts'], fn ($a) => ! ($a['preview'] ?? false)));
                            // An unfinished retake must not be presented as a finished current attempt.
                            usort($attempts, fn ($a, $b) => ($b['attempt'] ?? 0) <=> ($a['attempt'] ?? 0));
                            $latest = $attempts[0] ?? null;
                            $row['submission_status'] = ! $latest ? 'not_submitted' : match ($latest['state'] ?? '') {
                                'finished' => 'finished', 'inprogress', 'overdue' => 'in_progress', 'abandoned' => 'not_submitted', default => 'unknown'
                            };
                            $row['submitted_at'] = $row['submission_status'] === 'finished' ? $this->stamp($latest['timefinish'] ?? null) : null;
                        }
                    } catch (LmsSyncException) {
                        $row['submission_status'] = 'unknown';
                        $statusErrors++;
                    }
                    $courseRows[] = $row;
                }
                foreach ($items as $item) {
                    if (($item['itemtype'] ?? '') === 'manual') {
                        $courseRows[] = $this->row($course, null, $item);
                    }
                }
                $rows = [...$rows, ...$courseRows];
                $checked[] = (int) $course['id'];
            } catch (LmsSyncException) {
                $failed++;
            }
        }
        if (count($rows) > 1000) {
            throw new LmsSyncException('Data penilaian melebihi batas akun.');
        }

        return ['state' => $failed || $statusErrors ? 'partial' : 'connected', 'checked_at' => CarbonImmutable::now()->toIso8601String(), 'assessments' => $rows,
            'checked_courses' => $checked, 'failed_courses' => $failed, 'requests' => $this->calls];
    }

    private function row(array $course, ?array $module, ?array $grade): array
    {
        $hidden = ! empty($grade['gradeishidden']) || ! empty($grade['hidden']) || ! empty($grade['gradehiddenbydate']);
        $raw = $grade['graderaw'] ?? null;
        $catalog = (new LmsCourseCatalog)->resolve($course['shortname'] ?? '');
        $name = $course['fullname'] ?? $catalog['course_name'];
        if ($name === ($course['shortname'] ?? null)) {
            $name = $catalog['course_name'];
        }
        $numeric = ! $hidden && is_numeric($raw) && is_finite((float) $raw);

        return ['key' => $module ? 'activity-'.$course['id'].'-'.$module['id'] : 'grade-'.$course['id'].'-'.$grade['id'],
            'course_id' => (int) $course['id'], 'course_name' => $this->text($name, 160), 'course_code' => $this->text($course['shortname'] ?? '', 100),
            'module_id' => $module ? (int) $module['id'] : null, 'grade_item_id' => isset($grade['id']) ? (int) $grade['id'] : null,
            'kind' => $module ? ($module['modname'] === 'assign' ? 'assignment' : 'quiz') : 'manual',
            'title' => $this->text($module['name'] ?? $grade['itemname'] ?? 'Penilaian', 255),
            'url' => $module ? 'https://'.LmsCalendar::HOST.'/mod/'.$module['modname'].'/view.php?id='.(int) $module['id'] : null,
            'submission_status' => 'unknown', 'grading_status' => $hidden ? 'hidden' : ($numeric ? 'graded' : 'ungraded'),
            'grade' => $numeric ? (float) $raw : null, 'grade_max' => isset($grade['grademax']) && is_numeric($grade['grademax']) ? (float) $grade['grademax'] : null,
            'grade_display' => $hidden ? null : ($grade ? $this->text($grade['gradeformatted'] ?? '', 100) : null),
            'submitted_at' => null, 'graded_at' => $hidden ? null : $this->stamp($grade['gradedategraded'] ?? null),
            'checked_at' => CarbonImmutable::now()->toIso8601String()];
    }

    private function text(string $text, int $max): string
    {
        return Str::limit(trim(html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8')), $max, '');
    }

    private function stamp(mixed $time): ?string
    {
        return is_numeric($time) && $time > 0 ? CarbonImmutable::createFromTimestampUTC((int) $time)->toIso8601String() : null;
    }
}
