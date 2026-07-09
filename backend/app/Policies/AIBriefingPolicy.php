<?php

namespace App\Policies;

use App\Models\AIBriefing;
use App\Models\User;

class AIBriefingPolicy
{
    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, AIBriefing $briefing): bool
    {
        return $user->id === $briefing->user_id;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return true;
    }
}
