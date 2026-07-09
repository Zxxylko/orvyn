<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcademicTask extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'course_name',
        'task_type',
        'title',
        'description',
        'deadline',
        'status',
        'lms_url',
        'mirrored_task_id',
    ];

    protected $casts = [
        'deadline' => 'datetime',
    ];

    /**
     * Get the student user who owns this task.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
