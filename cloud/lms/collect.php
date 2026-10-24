<?php
// This standalone reader needs neither Laravel's APP_KEY nor a local database.
ini_set('display_errors', '0');
require __DIR__.'/bootstrap.php';

use App\Services\Lms\LmsCalendar;
use App\Services\Lms\LmsResults;
use App\Services\Lms\LmsSyncException;
use Illuminate\Support\Facades\Http;

$diagnostics = ['http_statuses'=>[]];
Http::globalResponseMiddleware(function ($response) use (&$diagnostics) {
    $status=(string)$response->getStatusCode();
    $diagnostics['http_statuses'][$status]=($diagnostics['http_statuses'][$status]??0)+1;
    if ($status === '403') {
        foreach (['Server','Content-Type','CF-Mitigated','X-Mitmproxy-Blocked-Reason'] as $header) {
            $value=$response->getHeaderLine($header);
            if (preg_match('/^[A-Za-z0-9 .;=\/_-]{1,100}$/D',$value)) $diagnostics['denial_headers'][$header]=$value;
        }
    }
    return $response;
});
function failureCode(Throwable $error): string {
    if ($error instanceof LmsSyncException) return $error->getMessage();
    if (preg_match('/Call to undefined function ([A-Za-z0-9_\\\\]+)\(\)/', $error->getMessage(), $match)) return 'missing_function:'.$match[1];
    return 'collector_runtime:'.get_class($error);
}

try {
    $config = json_decode(getenv('ORVYN_LMS_CONFIG') ?: '', true, 16, JSON_THROW_ON_ERROR);
    $url = (new LmsCalendar)->validateUrl($config['calendar_url']);
    try {
        $tasks = (new LmsCalendar)->fetch($url);
        $calendar = ['status' => ['connected' => true], 'tasks' => $tasks];
    } catch (Throwable $error) {
        $diagnostics['calendar_error']=failureCode($error);
        $calendar = ['status' => ['connected' => false], 'tasks' => []];
    }
    try {
        $results = (new LmsResults)->collectForCalendar($config['api_token'], $url);
    } catch (Throwable $error) {
        $diagnostics['assessment_error']=failureCode($error);
        $results = ['state' => 'error', 'assessments' => []];
    }
    echo json_encode(['calendar' => $calendar, 'results' => $results, 'diagnostics'=>$diagnostics], JSON_THROW_ON_ERROR);
} catch (Throwable) {
    echo json_encode(['calendar' => ['status' => ['connected' => false], 'tasks' => []], 'results' => ['state' => 'error', 'assessments' => []]]);
}
