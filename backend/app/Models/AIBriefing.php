<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AIBriefing extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'ai_briefings';

    protected $fillable = [
        'user_id',
        'briefing_date',
        'summary_content',
        'health_metrics',
        'recommended_adjustments',
    ];

    protected function casts(): array
    {
        return [
            'briefing_date' => 'date',
            'health_metrics' => 'array',
            'recommended_adjustments' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeToday($query)
    {
        return $query->where('briefing_date', today());
    }
}
