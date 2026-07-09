<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LivingExpense extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'amount',
        'category',
        'description',
        'expense_date',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'amount' => 'decimal:2',
    ];

    /**
     * Get the student user who logged this expense.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
