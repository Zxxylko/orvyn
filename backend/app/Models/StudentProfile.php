<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentProfile extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'user_id',
        'preferred_chronotype',
        'preferred_start_hour',
        'preferred_end_hour',
        'max_daily_focus_minutes',
        'coding_hcf',
        'theory_hcf',
        'admin_hcf',
        'current_streak',
        'longest_streak',
        'last_active_date',
        'flow_state_score',
        'burnout_risk_index',
    ];

    protected $attributes = [
        'preferred_chronotype' => 'standard',
        'preferred_start_hour' => 9,
        'preferred_end_hour' => 18,
        'max_daily_focus_minutes' => 300,
        'coding_hcf' => 1.0,
        'theory_hcf' => 1.0,
        'admin_hcf' => 1.0,
        'current_streak' => 0,
        'longest_streak' => 0,
        'flow_state_score' => 50.0,
        'burnout_risk_index' => 0.0,
    ];

    protected function casts(): array
    {
        return [
            'last_active_date' => 'date',
            'coding_hcf' => 'float',
            'theory_hcf' => 'float',
            'admin_hcf' => 'float',
            'flow_state_score' => 'float',
            'burnout_risk_index' => 'float',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the HCF multiplier for a given task category.
     */
    public function getHcfForCategory(string $category): float
    {
        return match ($category) {
            'coding' => $this->coding_hcf,
            'theory' => $this->theory_hcf,
            'admin' => $this->admin_hcf,
            default => 1.0,
        };
    }

    /**
     * Get the productive scheduling window for this student.
     */
    public function getScheduleWindow(): array
    {
        return [
            'start' => $this->preferred_start_hour,
            'end' => $this->preferred_end_hour,
        ];
    }
}
