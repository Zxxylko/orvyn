<?php

namespace Tests\Unit;

use App\Services\Auth\FirebaseAuthException;
use App\Services\Auth\FirebaseTokenVerifier;
use Carbon\Carbon;
use Kreait\Firebase\Auth\UserRecord;
use Kreait\Firebase\Contract\Auth;
use Lcobucci\JWT\Token\DataSet;
use Lcobucci\JWT\UnencryptedToken;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class FirebaseTokenVerifierTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_fresh_verification_accepts_a_recent_auth_time_and_returns_the_firebase_identity(): void
    {
        Carbon::setTestNow('2026-07-25 12:00:00 UTC');
        config(['services.firebase.reauthentication_max_age_seconds' => 300]);
        $auth = Mockery::mock(Auth::class);
        $token = $this->tokenWithClaims([
            'sub' => 'fresh-firebase-uid',
            'auth_time' => now()->subSeconds(60)->timestamp,
        ]);
        $auth->shouldReceive('verifyIdToken')
            ->once()
            ->with('fresh-sensitive-token', true)
            ->andReturn($token);
        $auth->shouldReceive('getUser')
            ->once()
            ->with('fresh-firebase-uid')
            ->andReturn($this->firebaseUser('fresh-firebase-uid'));

        $identity = $this->verifierUsing($auth)->verifyFresh('fresh-sensitive-token');

        $this->assertSame('fresh-firebase-uid', $identity->uid);
        $this->assertSame('fresh@orvyn.app', $identity->email);
    }

    public function test_fresh_verification_rejects_an_old_auth_time_without_looking_up_the_user(): void
    {
        Carbon::setTestNow('2026-07-25 12:00:00 UTC');
        config(['services.firebase.reauthentication_max_age_seconds' => 300]);
        $auth = Mockery::mock(Auth::class);
        $token = $this->tokenWithClaims([
            'sub' => 'stale-firebase-uid',
            'auth_time' => now()->subSeconds(301)->timestamp,
        ]);
        $auth->shouldReceive('verifyIdToken')
            ->once()
            ->with('stale-sensitive-token', true)
            ->andReturn($token);
        $auth->shouldNotReceive('getUser');

        try {
            $this->verifierUsing($auth)->verifyFresh('stale-sensitive-token');
            $this->fail('A stale Firebase authentication time must be rejected.');
        } catch (FirebaseAuthException $exception) {
            $this->assertSame(401, $exception->httpStatus());
            $this->assertSame('A recent Firebase sign-in is required to delete this account.', $exception->getMessage());
            $this->assertStringNotContainsString('stale-sensitive-token', $exception->getMessage());
        }
    }

    public function test_identity_deletion_maps_provider_failures_without_exposing_sensitive_values(): void
    {
        $auth = Mockery::mock(Auth::class);
        $auth->shouldReceive('deleteUser')
            ->once()
            ->with('firebase-uid')
            ->andThrow(new RuntimeException('provider details that must stay internal'));

        try {
            $this->verifierUsing($auth)->deleteIdentity('firebase-uid');
            $this->fail('A Firebase provider failure must stop account deletion.');
        } catch (FirebaseAuthException $exception) {
            $this->assertSame(503, $exception->httpStatus());
            $this->assertSame('Firebase authentication is temporarily unavailable.', $exception->getMessage());
            $this->assertStringNotContainsString('provider details', $exception->getMessage());
        }
    }

    private function verifierUsing(Auth $auth): FirebaseTokenVerifier
    {
        return new class($auth) extends FirebaseTokenVerifier
        {
            public function __construct(private readonly Auth $auth) {}

            protected function firebaseAuth(): Auth
            {
                return $this->auth;
            }
        };
    }

    private function tokenWithClaims(array $claims): UnencryptedToken
    {
        $token = Mockery::mock(UnencryptedToken::class);
        $token->shouldReceive('claims')
            ->twice()
            ->andReturn(new DataSet($claims, 'encoded-claims'));

        return $token;
    }

    private function firebaseUser(string $uid): UserRecord
    {
        return UserRecord::fromResponseData([
            'localId' => $uid,
            'email' => 'fresh@orvyn.app',
            'emailVerified' => true,
            'displayName' => 'Fresh User',
            'createdAt' => '0',
        ]);
    }
}
