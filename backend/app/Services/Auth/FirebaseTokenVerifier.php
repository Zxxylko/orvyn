<?php

namespace App\Services\Auth;

use DateTimeInterface;
use Kreait\Firebase\Auth\UserRecord;
use Kreait\Firebase\Contract\Auth;
use Kreait\Firebase\Exception\Auth\FailedToVerifyToken;
use Kreait\Firebase\Exception\Auth\RevokedIdToken;
use Kreait\Firebase\Exception\Auth\UserDisabled;
use Kreait\Firebase\Exception\Auth\UserNotFound;
use Kreait\Firebase\Factory;
use SensitiveParameter;
use Throwable;

class FirebaseTokenVerifier
{
    public function verify(#[SensitiveParameter] string $idToken): VerifiedFirebaseUser
    {
        return $this->verifyToken($idToken, requireFreshAuthentication: false);
    }

    public function verifyFresh(#[SensitiveParameter] string $idToken): VerifiedFirebaseUser
    {
        return $this->verifyToken($idToken, requireFreshAuthentication: true);
    }

    public function deleteIdentity(string $uid): void
    {
        $auth = $this->firebaseAuth();

        try {
            $auth->deleteUser($uid);
        } catch (Throwable) {
            throw FirebaseAuthException::unavailable();
        }
    }

    private function verifyToken(
        #[SensitiveParameter] string $idToken,
        bool $requireFreshAuthentication,
    ): VerifiedFirebaseUser {
        $auth = $this->firebaseAuth();

        try {
            $verifiedToken = $auth->verifyIdToken($idToken, true);
            $uid = $verifiedToken->claims()->get('sub');

            if (! is_string($uid) || trim($uid) === '') {
                throw FirebaseAuthException::invalidToken();
            }
            if ($requireFreshAuthentication && ! $this->hasFreshAuthentication(
                $verifiedToken->claims()->get('auth_time'),
            )) {
                throw FirebaseAuthException::reauthenticationRequired();
            }
        } catch (FirebaseAuthException $exception) {
            throw $exception;
        } catch (FailedToVerifyToken|RevokedIdToken) {
            throw FirebaseAuthException::invalidToken();
        } catch (Throwable) {
            throw FirebaseAuthException::unavailable();
        }

        try {
            $firebaseUser = $auth->getUser($uid);
        } catch (UserDisabled|UserNotFound) {
            throw FirebaseAuthException::invalidToken();
        } catch (Throwable) {
            throw FirebaseAuthException::unavailable();
        }

        if ($firebaseUser->disabled) {
            throw FirebaseAuthException::invalidToken();
        }

        return $this->identityFrom($firebaseUser);
    }

    protected function firebaseAuth(): Auth
    {
        $credentials = trim((string) config('services.firebase.credentials'));

        if ($credentials === '') {
            throw FirebaseAuthException::notConfigured();
        }

        $credentialsPath = str_starts_with($credentials, DIRECTORY_SEPARATOR)
            ? $credentials
            : base_path($credentials);

        if (! is_file($credentialsPath) || ! is_readable($credentialsPath)) {
            throw FirebaseAuthException::notConfigured();
        }

        try {
            return (new Factory)
                ->withServiceAccount($credentialsPath)
                ->createAuth();
        } catch (Throwable) {
            throw FirebaseAuthException::notConfigured();
        }
    }

    private function identityFrom(UserRecord $user): VerifiedFirebaseUser
    {
        return new VerifiedFirebaseUser(
            uid: $user->uid,
            email: $user->email,
            emailVerified: $user->emailVerified,
            displayName: $user->displayName,
        );
    }

    private function hasFreshAuthentication(mixed $authTime): bool
    {
        $authenticatedAt = match (true) {
            $authTime instanceof DateTimeInterface => $authTime->getTimestamp(),
            is_int($authTime) => $authTime,
            is_string($authTime) && ctype_digit($authTime) => (int) $authTime,
            default => 0,
        };
        $maxAge = max(
            60,
            min(900, (int) config('services.firebase.reauthentication_max_age_seconds', 300)),
        );
        $age = now()->timestamp - $authenticatedAt;

        return $authenticatedAt > 0 && $age >= -60 && $age <= $maxAge;
    }
}
