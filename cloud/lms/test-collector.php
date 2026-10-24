<?php
require __DIR__.'/bootstrap.php';

use App\Services\Lms\LmsResults;
use Illuminate\Support\Facades\Http;

$functions = ['core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents', 'gradereport_user_get_grade_items', 'mod_assign_get_submission_status', 'mod_quiz_get_user_attempts'];
Http::preventStrayRequests();
Http::fake(function ($request) use ($functions) {
    $data = match ($request['wsfunction']) {
        'core_webservice_get_site_info' => ['userid'=>42,'siteurl'=>'https://lms.telkomuniversity.ac.id','functions'=>array_map(fn ($name)=>['name'=>$name],$functions)],
        'core_enrol_get_users_courses' => [['id'=>9,'shortname'=>'TEST','fullname'=>'Test course']],
        'core_course_get_contents' => [['modules'=>[['id'=>12,'instance'=>13,'modname'=>'assign','name'=>'Test assignment']]]],
        'gradereport_user_get_grade_items' => ['usergrades'=>[['userid'=>42,'gradeitems'=>[['id'=>15,'itemtype'=>'mod','itemmodule'=>'assign','iteminstance'=>13,'graderaw'=>0,'grademax'=>100]]]]],
        'mod_assign_get_submission_status' => ['lastattempt'=>['submission'=>['status'=>'submitted']]],
        default => throw new RuntimeException('Unexpected function'),
    };
    return Http::response($data);
});
$result=(new LmsResults)->collectForCalendar(str_repeat('b',32),'https://lms.telkomuniversity.ac.id/calendar/export_execute.php?userid=42');
if ($result['state']!=='connected'||count($result['assessments'])!==1||$result['assessments'][0]['grade']!==0.0||$result['assessments'][0]['submission_status']!=='submitted'||!isset($result['checked_at'])) throw new RuntimeException('Standalone collector mismatch');
if (class_exists('App\Models\LmsConnection',false)) throw new RuntimeException('Collector loaded application model');
echo "Standalone collector: passed; no Laravel application, database or APP_KEY required.\n";
