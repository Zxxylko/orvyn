<?php

namespace App\Services\Lms;

use Carbon\CarbonImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Psr\Http\Message\ResponseInterface;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;
use Throwable;

class LmsCalendar
{
    public const HOST = 'lms.telkomuniversity.ac.id';

    private const MAX_BYTES = 4 * 1024 * 1024;

    public function validateUrl(string $url): string
    {
        $parts = parse_url(trim($url));
        if (! is_array($parts)
            || ($parts['scheme'] ?? '') !== 'https'
            || ($parts['host'] ?? '') !== self::HOST
            || ($parts['path'] ?? '') !== '/calendar/export_execute.php'
            || (isset($parts['port']) && $parts['port'] !== 443)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
            throw new LmsSyncException('Gunakan URL kalender HTTPS dari LMS Telkom University.');
        }

        parse_str($parts['query'] ?? '', $query);
        $allowed = ['username', 'userid', 'authtoken', 'preset_what', 'preset_time'];
        if (array_diff(array_keys($query), $allowed)
            || count(array_filter($query, fn ($value) => ! is_string($value))) > 0
            || ! is_string($query['authtoken'] ?? null)
            || ! preg_match('/^[a-zA-Z0-9]{20,128}$/D', $query['authtoken'])
            || ! is_string($query['username'] ?? $query['userid'] ?? null)
            || trim($query['username'] ?? $query['userid']) === ''
            || ($query['preset_what'] ?? '') !== 'all'
            || ($query['preset_time'] ?? '') !== 'recentupcoming') {
            throw new LmsSyncException('Di LMS pilih All events dan Recent and next 60 days, lalu Get calendar URL.');
        }

        return 'https://'.self::HOST.'/calendar/export_execute.php?'.http_build_query($query);
    }

    public function fetch(string $url): array
    {
        $url = $this->validateUrl($url);
        try {
            $response = Http::accept('text/calendar')
                ->withUserAgent('ORVYN-LMS/1.0')
                ->connectTimeout(5)->timeout(20)
                ->withoutRedirecting()
                ->withOptions([
                    'on_headers' => function (ResponseInterface $response): void {
                        if ((int) $response->getHeaderLine('Content-Length') > self::MAX_BYTES) {
                            throw new LmsSyncException('Kalender LMS terlalu besar.');
                        }
                    },
                    'progress' => function ($total, $downloaded): void {
                        if ($downloaded > self::MAX_BYTES) {
                            throw new LmsSyncException('Kalender LMS terlalu besar.');
                        }
                    },
                ])->get($url);
        } catch (Throwable) {
            throw new LmsSyncException('LMS belum dapat dijangkau. Sinkronisasi akan dicoba kembali.');
        }

        if (in_array($response->status(), [301, 302, 303, 307, 308, 401, 403], true)) {
            throw new LmsSyncException('Akses kalender ditolak. Hubungkan ulang dengan URL kalender terbaru dari LMS.');
        }
        if (! $response->successful()) {
            throw new LmsSyncException('LMS sedang tidak tersedia. Sinkronisasi akan dicoba kembali.');
        }

        return $this->parse($response->body());
    }

    /** Parse the actual Moodle export: one stable UID for each deadline; opening events are excluded. */
    public function parse(string $ics): array
    {
        if (strlen($ics) > self::MAX_BYTES || ! str_starts_with(ltrim($ics), 'BEGIN:VCALENDAR')
            || ! str_ends_with(rtrim($ics), 'END:VCALENDAR')) {
            throw new LmsSyncException('LMS tidak mengirim kalender yang valid. Periksa URL kalender di LMS.');
        }

        try {
            $calendar = Reader::read($ics);
            if (! $calendar instanceof VCalendar || count($calendar->select('VEVENT')) > 2000) {
                throw new LmsSyncException('Format atau ukuran kalender tidak didukung.');
            }
            $deadlines = [];
            foreach ($calendar->select('VEVENT') as $event) {
                $summary = trim((string) $event->SUMMARY);
                // Opening dates are not deadlines. Ignore personal/calendar-only events too.
                if (! preg_match('/\s+(closes|is due|ditutup|jatuh tempo)\s*$/iu', $summary, $suffix)) {
                    continue;
                }
                $uid = trim((string) $event->UID);
                if ($uid === '' || strlen($uid) > 255 || ! isset($event->DTSTART) || isset($event->RRULE)) {
                    throw new LmsSyncException('Ada deadline LMS yang formatnya tidak didukung.');
                }
                if (strtoupper((string) $event->STATUS) === 'CANCELLED') {
                    continue;
                }
                $deadline = CarbonImmutable::instance($event->DTSTART->getDateTime(new DateTimeZone('Asia/Jakarta')))->utc();
                $title = trim(mb_substr($summary, 0, mb_strlen($summary) - mb_strlen($suffix[0])));
                $course = (new LmsCourseCatalog)->resolve((string) $event->CATEGORIES);
                $description = trim(html_entity_decode(strip_tags((string) $event->DESCRIPTION), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                $link = 'https://'.self::HOST.'/calendar/view.php?view=day&time='.$deadline->timestamp;
                // Some Moodle versions include a module URL; only keep a safe LMS link.
                $eventUrl = trim((string) $event->URL);
                if (preg_match('~^https://lms\.telkomuniversity\.ac\.id/mod/(assign|quiz)/view\.php\?id=\d+$~D', $eventUrl)) {
                    $link = $eventUrl;
                }
                $deadlines[$uid] = [
                    'lms_uid' => $uid,
                    ...$course,
                    'title' => Str::limit(strip_tags($title), 255, ''),
                    'description' => Str::limit($description, 20000, ''),
                    'task_type' => in_array(mb_strtolower($suffix[1]), ['closes', 'ditutup'], true) ? 'quiz' : 'assignment',
                    'deadline' => $deadline,
                    // DTSTAMP is export time; LAST-MODIFIED may be a deadline edit.
                    // Neither is evidence of creation. Use CREATED only when supplied.
                    'lms_created_at' => isset($event->CREATED)
                        ? CarbonImmutable::instance($event->CREATED->getDateTime(new DateTimeZone('Asia/Jakarta')))->utc()
                        : null,
                    'lms_url' => $link,
                ];
            }

            return array_values($deadlines);
        } catch (LmsSyncException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new LmsSyncException('Kalender LMS tidak dapat dibaca. Data tugas sebelumnya tetap tersimpan.');
        }
    }
}
