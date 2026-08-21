<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendWhatsAppMessageJob;
use App\Models\CampusSchedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CampusScheduleController extends Controller
{
    public function index(Request $request)
    {
        $query = Auth::user()
            ->campusSchedules()
            ->orderBy('day_of_week')
            ->orderBy('start_time');

        if ($request->has('day_of_week')) {
            $query->where('day_of_week', $request->integer('day_of_week'));
        }

        if ($request->has('active')) {
            $query->where('is_active', $request->boolean('active'));
        }

        return response()->json([
            'data' => $query->get()->map(fn (CampusSchedule $schedule) => $this->serializeSchedule($schedule)),
            'message' => 'Campus schedules retrieved successfully',
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateSchedule($request);
        $schedule = Auth::user()->campusSchedules()->create([
            ...$validated,
            'class_type' => $validated['class_type'] ?? 'lecture',
            'commute_minutes' => $validated['commute_minutes'] ?? 35,
            'prep_minutes' => $validated['prep_minutes'] ?? 20,
            'is_active' => $validated['is_active'] ?? true,
        ]);
        $this->notifyChange($schedule, 'ditambahkan');

        return response()->json([
            'data' => $this->serializeSchedule($schedule),
            'message' => 'Campus schedule created successfully',
        ], 201);
    }

    public function update(Request $request, CampusSchedule $campusSchedule)
    {
        $this->authorizeSchedule($campusSchedule);

        $validated = $this->validateSchedule($request, true);
        $campusSchedule->update($validated);
        $this->notifyChange($campusSchedule->fresh(), 'diperbarui');

        return response()->json([
            'data' => $this->serializeSchedule($campusSchedule->fresh()),
            'message' => 'Campus schedule updated successfully',
        ]);
    }

    public function destroy(CampusSchedule $campusSchedule)
    {
        $this->authorizeSchedule($campusSchedule);
        $this->notifyChange($campusSchedule, 'dihapus');
        $campusSchedule->delete();

        return response()->json([
            'message' => 'Campus schedule deleted successfully',
        ]);
    }

    private function validateSchedule(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'course_name' => "{$required}|string|max:160",
            'course_code' => 'nullable|string|max:30',
            'lecturer' => 'nullable|string|max:160',
            'building' => 'nullable|string|max:80',
            'room' => 'nullable|string|max:80',
            'day_of_week' => "{$required}|integer|min:0|max:6",
            'start_time' => "{$required}|date_format:H:i",
            'end_time' => "{$required}|date_format:H:i|after:start_time",
            'class_type' => 'sometimes|in:lecture,lab,project,exam,seminar',
            'commute_minutes' => 'sometimes|integer|min:0|max:180',
            'prep_minutes' => 'sometimes|integer|min:0|max:180',
            'notes' => 'nullable|string|max:1000',
            'is_active' => 'sometimes|boolean',
        ]);
    }

    private function serializeSchedule(CampusSchedule $schedule): array
    {
        return [
            'id' => $schedule->id,
            'user_id' => $schedule->user_id,
            'course_name' => $schedule->course_name,
            'course_code' => $schedule->course_code,
            'lecturer' => $schedule->lecturer,
            'building' => $schedule->building,
            'room' => $schedule->room,
            'day_of_week' => $schedule->day_of_week,
            'start_time' => substr((string) $schedule->start_time, 0, 5),
            'end_time' => substr((string) $schedule->end_time, 0, 5),
            'class_type' => $schedule->class_type,
            'commute_minutes' => $schedule->commute_minutes,
            'prep_minutes' => $schedule->prep_minutes,
            'notes' => $schedule->notes,
            'is_active' => $schedule->is_active,
            'created_at' => $schedule->created_at,
            'updated_at' => $schedule->updated_at,
        ];
    }

    private function authorizeSchedule(CampusSchedule $schedule): void
    {
        abort_unless($schedule->user_id === Auth::id(), 403);
    }

    private function notifyChange(CampusSchedule $schedule, string $action): void
    {
        $user = Auth::user();
        if (! $user->whatsappConnection?->enabled
            || ! $user->whatsappConnection->phone_verified_at
            || ! $user->whatsappConnection->featureEnabled('campus_updates')) {
            return;
        }

        $message = "🎓 Jadwal kampus {$action}\n\n*{$schedule->course_name}*\n".
            substr((string) $schedule->start_time, 0, 5).'-'.substr((string) $schedule->end_time, 0, 5).
            ($schedule->room ? " · {$schedule->room}" : '');

        SendWhatsAppMessageJob::dispatch(
            $user->id,
            'campus_update',
            $message,
            'wa:campus:'.$user->id.':'.$schedule->id.':'.$action.':'.now()->timestamp,
        );
    }
}
