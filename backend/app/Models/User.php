<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasApiTokens, HasUuids, Notifiable;

    protected $fillable = [
        'firebase_uid',
        'name',
        'email',
        'email_verified_at',
        'preferences',
    ];

    protected $hidden = [
        'firebase_uid',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'preferences' => 'array',
        ];
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function timeBlocks(): HasMany
    {
        return $this->hasMany(TimeBlock::class);
    }

    public function aiBriefings(): HasMany
    {
        return $this->hasMany(AIBriefing::class);
    }

    /**
     * Alias used by BriefingController.
     */
    public function briefings(): HasMany
    {
        return $this->aiBriefings();
    }

    // ─── Analytics Relations ────────────────────────────────────

    public function studentProfile(): HasOne
    {
        return $this->hasOne(StudentProfile::class);
    }

    public function focusLogs(): HasMany
    {
        return $this->hasMany(FocusLog::class);
    }

    public function habits(): HasMany
    {
        return $this->hasMany(Habit::class);
    }

    public function campusSchedules(): HasMany
    {
        return $this->hasMany(CampusSchedule::class);
    }

    public function aiMemories(): HasMany
    {
        return $this->hasMany(AIMemory::class);
    }

    public function academicTasks(): HasMany
    {
        return $this->hasMany(AcademicTask::class);
    }

    public function livingExpenses(): HasMany
    {
        return $this->hasMany(LivingExpense::class);
    }

    public function healthLogs(): HasMany
    {
        return $this->hasMany(HealthLog::class);
    }

    /**
     * Get or create the student's analytics profile.
     */
    public function getOrCreateProfile(): StudentProfile
    {
        if ($this->relationLoaded('studentProfile') && $this->studentProfile) {
            return $this->studentProfile;
        }

        $profile = $this->studentProfile()->first();
        if ($profile) {
            $this->setRelation('studentProfile', $profile);
            return $profile;
        }

        $profile = $this->studentProfile()->create([]);
        $this->setRelation('studentProfile', $profile);
        return $profile;
    }
}
