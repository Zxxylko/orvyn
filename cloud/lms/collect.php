<?php
// This standalone reader needs neither Laravel's APP_KEY nor a local database.
ini_set('display_errors', '0');
require __DIR__.'/bootstrap.php';

use App\Services\Lms\LmsCalendar;
use App\Services\Lms\LmsResults;

try {
    $config = json_decode(getenv('ORVYN_LMS_CONFIG') ?: '', true, 16, JSON_THROW_ON_ERROR);
    $url = (new LmsCalendar)->validateUrl($config['calendar_url']);
    try {
        $tasks = (new LmsCalendar)->fetch($url);
        $calendar = ['status' => ['connected' => true], 'tasks' => $tasks];
    } catch (Throwable) {
        $calendar = ['status' => ['connected' => false], 'tasks' => []];
    }
    try {
        $results = (new LmsResults)->collectForCalendar($config['api_token'], $url);
    } catch (Throwable) {
        $results = ['state' => 'error', 'assessments' => []];
    }
    echo json_encode(['calendar' => $calendar, 'results' => $results], JSON_THROW_ON_ERROR);
} catch (Throwable) {
    echo json_encode(['calendar' => ['status' => ['connected' => false], 'tasks' => []], 'results' => ['state' => 'error', 'assessments' => []]]);
}
