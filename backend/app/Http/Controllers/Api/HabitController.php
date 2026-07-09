<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Habit;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class HabitController extends Controller
{
    public function index()
    {
        $habits = Auth::user()
            ->habits()
            ->with(['checkIns' => fn ($query) => $query
                ->where('check_in_date', '>=', now()->subDays(13)->toDateString())
                ->orderBy('check_in_date')])
            ->orderByDesc('is_active')
            ->orderBy('created_at')
            ->get()
            ->map(fn (Habit $habit) => $this->serializeHabit($habit));

        return response()->json([
            'data' => $habits,
            'message' => 'Habits retrieved successfully',
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'description' => 'nullable|string|max:1000',
            'category' => 'nullable|string|max:60',
            'target_per_day' => 'nullable|integer|min:1|max:99',
            'unit' => 'nullable|string|max:40',
            'color' => 'nullable|string|max:30',
        ]);

        $habit = Auth::user()->habits()->create([
            ...$validated,
            'category' => $validated['category'] ?? 'health',
            'target_per_day' => $validated['target_per_day'] ?? 1,
            'unit' => $validated['unit'] ?? 'session',
            'color' => $validated['color'] ?? 'pink',
        ]);

        return response()->json([
            'data' => $this->serializeHabit($habit->load('checkIns')),
            'message' => 'Habit created successfully',
        ], 201);
    }

    public function update(Request $request, Habit $habit)
    {
        $this->authorizeHabit($habit);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:120',
            'description' => 'nullable|string|max:1000',
            'category' => 'sometimes|string|max:60',
            'target_per_day' => 'sometimes|integer|min:1|max:99',
            'unit' => 'sometimes|string|max:40',
            'color' => 'sometimes|string|max:30',
            'is_active' => 'sometimes|boolean',
        ]);

        $habit->update($validated);

        return response()->json([
            'data' => $this->serializeHabit($habit->fresh()->load('checkIns')),
            'message' => 'Habit updated successfully',
        ]);
    }

    public function destroy(Habit $habit)
    {
        $this->authorizeHabit($habit);
        $habit->delete();

        return response()->json([
            'message' => 'Habit deleted successfully',
        ]);
    }

    public function checkIn(Request $request, Habit $habit)
    {
        $this->authorizeHabit($habit);

        $validated = $request->validate([
            'date' => 'nullable|date',
            'value' => 'nullable|integer|min:1|max:99',
            'note' => 'nullable|string|max:255',
        ]);

        $date = Carbon::parse($validated['date'] ?? now())->toDateString();

        $habit->checkIns()->updateOrCreate(
            ['check_in_date' => $date],
            [
                'user_id' => Auth::id(),
                'value' => $validated['value'] ?? $habit->target_per_day,
                'note' => $validated['note'] ?? null,
            ]
        );

        return response()->json([
            'data' => $this->serializeHabit($habit->fresh()->load('checkIns')),
            'message' => 'Habit checked in successfully',
        ]);
    }

    public function uncheck(Request $request, Habit $habit)
    {
        $this->authorizeHabit($habit);

        $validated = $request->validate([
            'date' => 'nullable|date',
        ]);

        $date = Carbon::parse($validated['date'] ?? now())->toDateString();
        $habit->checkIns()->where('check_in_date', $date)->delete();

        return response()->json([
            'data' => $this->serializeHabit($habit->fresh()->load('checkIns')),
            'message' => 'Habit check-in removed successfully',
        ]);
    }

    private function serializeHabit(Habit $habit): array
    {
        $stats = $habit->streakStats();

        return [
            'id' => $habit->id,
            'user_id' => $habit->user_id,
            'name' => $habit->name,
            'description' => $habit->description,
            'category' => $habit->category,
            'target_per_day' => $habit->target_per_day,
            'unit' => $habit->unit,
            'color' => $habit->color,
            'is_active' => $habit->is_active,
            'current_streak' => $stats['current_streak'],
            'longest_streak' => $stats['longest_streak'],
            'checked_in_today' => $stats['checked_in_today'],
            'check_ins' => $habit->checkIns
                ->sortBy('check_in_date')
                ->map(fn ($checkIn) => [
                    'id' => $checkIn->id,
                    'check_in_date' => $checkIn->check_in_date->toDateString(),
                    'value' => $checkIn->value,
                    'note' => $checkIn->note,
                ])
                ->values(),
            'created_at' => $habit->created_at,
            'updated_at' => $habit->updated_at,
        ];
    }

    private function authorizeHabit(Habit $habit): void
    {
        abort_unless($habit->user_id === Auth::id(), 403);
    }
}
