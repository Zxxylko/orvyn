<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class HealthLogController extends Controller
{
    /**
     * Get recent health logs.
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'days' => 'sometimes|integer|min:1|max:90',
        ]);

        $days = $validated['days'] ?? 7;
        $logs = Auth::user()->healthLogs()
            ->where('log_date', '>=', now()->subDays($days)->toDateString())
            ->orderBy('log_date', 'asc')
            ->get();

        return response()->json([
            'data' => $logs,
        ]);
    }

    /**
     * Display a single health log owned by the current user.
     */
    public function show(HealthLog $healthLog)
    {
        if ($healthLog->user_id !== Auth::id()) {
            abort(403, 'Unauthorized action.');
        }

        return response()->json([
            'data' => $healthLog,
        ]);
    }

    /**
     * Store or update health metrics for a specific date (usually today).
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'log_date' => 'required|date',
            'hydration_ml' => 'sometimes|integer|min:0|max:10000',
            'caffeine_mg' => 'sometimes|integer|min:0|max:2000',
            'screen_time_minutes' => 'sometimes|integer|min:0|max:1440',
            'sleep_hours' => 'sometimes|numeric|min:0|max:24',
        ]);

        $user = Auth::user();
        $date = Carbon::parse($validated['log_date'])->toDateString();

        // Find or create daily log
        $log = $user->healthLogs()->firstOrNew(['log_date' => $date]);
        $isNew = ! $log->exists;

        // Accumulate hydration or caffeine, or set values
        if (isset($validated['hydration_ml'])) {
            $log->hydration_ml = $request->boolean('accumulate')
                ? ($log->hydration_ml + $validated['hydration_ml'])
                : $validated['hydration_ml'];
        }
        if (isset($validated['caffeine_mg'])) {
            $log->caffeine_mg = $request->boolean('accumulate')
                ? ($log->caffeine_mg + $validated['caffeine_mg'])
                : $validated['caffeine_mg'];
        }
        if (isset($validated['screen_time_minutes'])) {
            $log->screen_time_minutes = $request->boolean('accumulate')
                ? ($log->screen_time_minutes + $validated['screen_time_minutes'])
                : $validated['screen_time_minutes'];
        }
        if (isset($validated['sleep_hours'])) {
            $log->sleep_hours = $validated['sleep_hours'];
        }

        $log->save();

        return response()->json([
            'data' => $log,
            'message' => $isNew ? 'Daily wellness metrics initialized.' : 'Daily wellness metrics updated successfully.',
        ], $isNew ? 201 : 200);
    }

    /**
     * Update a specific health log entry.
     */
    public function update(Request $request, HealthLog $healthLog)
    {
        if ($healthLog->user_id !== Auth::id()) {
            abort(403, 'Unauthorized action.');
        }

        $validated = $request->validate([
            'hydration_ml' => 'sometimes|integer|min:0|max:10000',
            'caffeine_mg' => 'sometimes|integer|min:0|max:2000',
            'screen_time_minutes' => 'sometimes|integer|min:0|max:1440',
            'sleep_hours' => 'sometimes|numeric|min:0|max:24',
            'log_date' => 'sometimes|required|date',
        ]);

        // If date is changing, make sure there is no unique constraint violation
        if (isset($validated['log_date']) && $validated['log_date'] !== $healthLog->log_date) {
            $date = Carbon::parse($validated['log_date'])->toDateString();
            $exists = Auth::user()->healthLogs()
                ->where('log_date', $date)
                ->where('id', '!=', $healthLog->id)
                ->exists();
            if ($exists) {
                return response()->json(['message' => 'A health log already exists for this date.'], 422);
            }
            $validated['log_date'] = $date;
        }

        $healthLog->update($validated);

        return response()->json([
            'data' => $healthLog,
            'message' => 'Wellness log entry updated successfully.',
        ]);
    }

    /**
     * Delete a specific health log entry.
     */
    public function destroy(HealthLog $healthLog)
    {
        if ($healthLog->user_id !== Auth::id()) {
            abort(403, 'Unauthorized action.');
        }

        $healthLog->delete();

        return response()->json([
            'message' => 'Wellness log entry deleted.',
        ]);
    }

    /**
     * Get health indicators and alerts for today.
     */
    public function snapshot()
    {
        $user = Auth::user();
        $today = now()->toDateString();

        $log = $user->healthLogs()->where('log_date', $today)->first();

        $hydration = $log ? $log->hydration_ml : 0;
        $caffeine = $log ? $log->caffeine_mg : 0;
        $screenTime = $log ? $log->screen_time_minutes : 0;
        $sleep = $log ? (float) $log->sleep_hours : 0.0;

        $alerts = [];

        // Hydration alerts
        if ($hydration < 1200) {
            $alerts[] = [
                'type' => 'warning',
                'category' => 'hydration',
                'message' => 'Hidrasi sangat rendah. Minum air putih sekarang untuk menjaga konsentrasi ngoding.',
            ];
        } elseif ($hydration < 2000) {
            $alerts[] = [
                'type' => 'info',
                'category' => 'hydration',
                'message' => 'Hampir mencapai target. Minum 2-3 gelas air lagi untuk mencapai hidrasi optimal 2L.',
            ];
        }

        // Caffeine alerts
        if ($caffeine > 400) {
            $alerts[] = [
                'type' => 'danger',
                'category' => 'caffeine',
                'message' => 'Konsumsi kafein berlebih (>400mg). Kurangi asupan kopi hari ini agar jantung tidak berdebar.',
            ];
        } elseif ($caffeine > 200 && now()->hour >= 17) {
            $alerts[] = [
                'type' => 'warning',
                'category' => 'caffeine',
                'message' => 'Kafein dikonsumsi sore hari. Ini berpotensi mengganggu jam tidur malam Anda.',
            ];
        }

        // Sleep alerts
        if ($sleep > 0 && $sleep < 6.0) {
            $alerts[] = [
                'type' => 'warning',
                'category' => 'sleep',
                'message' => 'Waktu tidur Anda tadi malam kurang dari 6 jam. Waspadai penurunan fokus saat menganalisis algoritma.',
            ];
        }

        // Screen time alerts
        if ($screenTime > 480) {
            $alerts[] = [
                'type' => 'warning',
                'category' => 'screentime',
                'message' => 'Screen time melampaui 8 jam. Terapkan istirahat 5 menit setiap kali Pomodoro selesai.',
            ];
        }

        return response()->json([
            'data' => [
                'hydration_ml' => $hydration,
                'caffeine_mg' => $caffeine,
                'screen_time_minutes' => $screenTime,
                'sleep_hours' => $sleep,
                'alerts' => $alerts,
            ],
        ]);
    }
}
