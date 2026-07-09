<?php

namespace App\Policies;

use App\Models\TimeBlock;
use App\Models\User;

class TimeBlockPolicy
{
    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, TimeBlock $timeBlock): bool
    {
        return $user->id === $timeBlock->user_id;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return true;
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, TimeBlock $timeBlock): bool
    {
        return $user->id === $timeBlock->user_id;
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, TimeBlock $timeBlock): bool
    {
        return $user->id === $timeBlock->user_id;
    }
}
