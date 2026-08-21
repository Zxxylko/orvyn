<?php

namespace App\Services\Auth;

final readonly class VerifiedFirebaseUser
{
    public function __construct(
        public string $uid,
        public ?string $email,
        public bool $emailVerified,
        public ?string $displayName,
    ) {}
}
