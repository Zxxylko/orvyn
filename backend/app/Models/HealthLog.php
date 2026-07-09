<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthLog extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'hydration_ml',
        'caffeine_mg',
        'screen_time_minutes',
        'sleep_hours',
        'log_date',
    ];

    protected $casts = [
        'log_date' => 'date',
        'sleep_hours' => 'decimal:1',
        'hydration_ml' => 'integer',
        'caffeine_mg' => 'integer',
        'screen_time_minutes' => 'integer',
    ];

    /**
     * Get the student user who logged this health record.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
