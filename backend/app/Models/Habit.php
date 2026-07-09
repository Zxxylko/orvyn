<?php

namespace App\Models;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Habit extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'name',
        'description',
        'category',
        'target_per_day',
        'unit',
        'color',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'target_per_day' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function checkIns(): HasMany
    {
        return $this->hasMany(HabitCheckIn::class);
    }

    public function streakStats(?CarbonInterface $today = null): array
    {
        $today ??= now();

        $dates = $this->checkIns()
            ->pluck('check_in_date')
            ->map(fn ($date) => Carbon::parse($date)->toDateString())
            ->unique()
            ->values()
            ->all();

        $completed = array_fill_keys($dates, true);
        $checkedInToday = isset($completed[$today->toDateString()]);
        $currentStreak = $this->countBackwardStreak($completed, $today);

        if (! $checkedInToday && $currentStreak === 0) {
            $currentStreak = $this->countBackwardStreak($completed, $today->copy()->subDay());
        }

        return [
            'current_streak' => $currentStreak,
            'longest_streak' => $this->longestStreak($dates),
            'checked_in_today' => $checkedInToday,
        ];
    }

    private function countBackwardStreak(array $completed, CarbonInterface $startDate): int
    {
        $streak = 0;
        $cursor = $startDate->copy();

        while (isset($completed[$cursor->toDateString()])) {
            $streak++;
            $cursor->subDay();
        }

        return $streak;
    }

    private function longestStreak(array $dates): int
    {
        sort($dates);

        $longest = 0;
        $current = 0;
        $previous = null;

        foreach ($dates as $date) {
            $currentDate = Carbon::parse($date)->startOfDay();

            if ($previous && $previous->copy()->addDay()->isSameDay($currentDate)) {
                $current++;
            } else {
                $current = 1;
            }

            $longest = max($longest, $current);
            $previous = $currentDate;
        }

        return $longest;
    }
}
