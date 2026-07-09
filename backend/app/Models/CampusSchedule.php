<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CampusSchedule extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'course_name',
        'course_code',
        'lecturer',
        'building',
        'room',
        'day_of_week',
        'start_time',
        'end_time',
        'class_type',
        'commute_minutes',
        'prep_minutes',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'day_of_week' => 'integer',
            'commute_minutes' => 'integer',
            'prep_minutes' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
