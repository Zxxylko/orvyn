<?php

use App\Http\Controllers\Api\AcademicTaskController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\BriefingController;
use App\Http\Controllers\Api\CampusScheduleController;
use App\Http\Controllers\Api\DemoAuthController;
use App\Http\Controllers\Api\HabitController;
use App\Http\Controllers\Api\HealthLogController;
use App\Http\Controllers\Api\LivingExpenseController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TimeBlockController;
use App\Http\Controllers\Api\WhatsAppConnectionController;
use App\Http\Controllers\Api\WhatsAppWebhookController;
use App\Http\Middleware\RequireOrvynAbility;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Public routes
    // Route::post('/auth/firebase', [AuthController::class, 'syncFirebaseUser']);
    Route::post('/auth/demo-login', [DemoAuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('/integrations/whatsapp/inbound', [WhatsAppWebhookController::class, 'inbound'])
        ->middleware('throttle:120,1');

    // Protected routes (Sanctum auth for now, Firebase later)
    Route::middleware(['auth:sanctum', RequireOrvynAbility::class, 'throttle:120,1'])->group(function () {
        // User
        Route::get('/user', function (Request $request) {
            return response()->json(['data' => $request->user()]);
        });
        Route::get('/user/me', function (Request $request) {
            return response()->json(['data' => $request->user()]);
        });

        // Tasks
        Route::apiResource('tasks', TaskController::class);
        Route::post('tasks/smart-parse', [TaskController::class, 'smartParse'])->middleware('throttle:20,1');

        // Time Blocks
        Route::apiResource('time-blocks', TimeBlockController::class);
        Route::post('time-blocks/optimize', [TimeBlockController::class, 'optimize'])->middleware('throttle:12,1');

        // Briefing
        Route::get('briefings/today', [BriefingController::class, 'today']);
        Route::get('briefing/today', [BriefingController::class, 'today']);
        Route::post('briefings/generate', [BriefingController::class, 'generate'])->middleware('throttle:10,1');
        Route::post('briefing/generate', [BriefingController::class, 'generate'])->middleware('throttle:10,1');

        // Analytics & Intelligence
        Route::get('analytics/snapshot', [AnalyticsController::class, 'snapshot']);
        Route::get('analytics/peak-hours', [AnalyticsController::class, 'peakHours']);
        Route::get('focus-logs', [AnalyticsController::class, 'indexFocusLogs']);
        Route::post('focus-logs', [AnalyticsController::class, 'storeFocusLog']);
        Route::get('profile', [AnalyticsController::class, 'profile']);
        Route::patch('profile', [AnalyticsController::class, 'updateProfile']);

        // Daily Habits & Streaks
        Route::apiResource('habits', HabitController::class)->except(['show']);
        Route::post('habits/{habit}/check-ins', [HabitController::class, 'checkIn']);
        Route::delete('habits/{habit}/check-ins', [HabitController::class, 'uncheck']);

        // Campus Life Planner
        Route::apiResource('campus-schedules', CampusScheduleController::class)->except(['show']);

        // Tel-U Modules Integration
        Route::apiResource('academic-tasks', AcademicTaskController::class);
        Route::get('finance/summary', [LivingExpenseController::class, 'summary']);
        Route::patch('finance/budget', [LivingExpenseController::class, 'updateBudget']);
        Route::apiResource('finance/expenses', LivingExpenseController::class);
        Route::get('health/snapshot', [HealthLogController::class, 'snapshot']);
        Route::apiResource('health/logs', HealthLogController::class);

        // WhatsApp assistant & notification preferences
        Route::get('integrations/whatsapp', [WhatsAppConnectionController::class, 'show']);
        Route::patch('integrations/whatsapp', [WhatsAppConnectionController::class, 'update']);
        Route::post('integrations/whatsapp/connect', [WhatsAppConnectionController::class, 'connect'])
            ->middleware('throttle:6,1,whatsapp-connect:');
        Route::post('integrations/whatsapp/test', [WhatsAppConnectionController::class, 'test'])
            ->middleware('throttle:6,1,whatsapp-test:');
    });
});
