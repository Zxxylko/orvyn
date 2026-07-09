<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AIMemory extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'ai_memories';

    protected $fillable = [
        'user_id',
        'category',
        'key',
        'value',
        'confidence',
        'reinforcement_count',
    ];

    protected function casts(): array
    {
        return [
            'confidence' => 'float',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Scope by memory category (preference, observation, pattern, insight).
     */
    public function scopeOfCategory($query, string $category)
    {
        return $query->where('category', $category);
    }

    /**
     * Get or create a memory. If it exists, reinforce it.
     */
    public static function remember(string $userId, string $category, string $key, string $value, float $confidence = 0.5): self
    {
        $memory = static::where('user_id', $userId)->where('key', $key)->first();

        if ($memory) {
            // Reinforce existing memory — increase confidence toward 1.0
            $newConfidence = min(1.0, $memory->confidence + (1 - $memory->confidence) * 0.15);
            $memory->update([
                'value' => $value,
                'confidence' => $newConfidence,
                'reinforcement_count' => $memory->reinforcement_count + 1,
            ]);
            return $memory;
        }

        return static::create([
            'user_id' => $userId,
            'category' => $category,
            'key' => $key,
            'value' => $value,
            'confidence' => $confidence,
        ]);
    }
}
