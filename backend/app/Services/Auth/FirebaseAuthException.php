<?php

namespace App\Services\Auth;

use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

final class FirebaseAuthException extends RuntimeException
{
    private function __construct(
        string $message,
        private readonly int $httpStatus,
    ) {
        parent::__construct($message);
    }

    public static function notConfigured(): self
    {
        return new self(
            'Firebase authentication is not configured.',
            Response::HTTP_SERVICE_UNAVAILABLE,
        );
    }

    public static function invalidToken(): self
    {
        return new self(
            'The Firebase ID token is invalid, expired, or revoked.',
            Response::HTTP_UNAUTHORIZED,
        );
    }

    public static function unavailable(): self
    {
        return new self(
            'Firebase authentication is temporarily unavailable.',
            Response::HTTP_SERVICE_UNAVAILABLE,
        );
    }

    public static function reauthenticationRequired(): self
    {
        return new self(
            'A recent Firebase sign-in is required to delete this account.',
            Response::HTTP_UNAUTHORIZED,
        );
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }
}
