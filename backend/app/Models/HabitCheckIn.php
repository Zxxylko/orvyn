<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HabitCheckIn extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'habit_id',
        'user_id',
        'check_in_date',
        'value',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'check_in_date' => 'date',
            'value' => 'integer',
        ];
    }

    public function habit(): BelongsTo
    {
        return $this->belongsTo(Habit::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
