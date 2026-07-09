<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FocusLog extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'task_id',
        'planned_minutes',
        'actual_minutes',
        'focus_rating',
        'completed',
        'session_type',
        'started_at',
        'ended_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'completed' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * Scope: logs from the last N days.
     */
    public function scopeRecentDays($query, int $days = 30)
    {
        return $query->where('started_at', '>=', now()->subDays($days));
    }

    /**
     * Scope: completed focus sessions only.
     */
    public function scopeCompleted($query)
    {
        return $query->where('completed', true);
    }

    /**
     * Get the hour of day when this session started (0-23).
     */
    public function getStartHourAttribute(): int
    {
        return $this->started_at?->hour ?? 0;
    }
}
