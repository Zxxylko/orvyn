<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\FirebaseAuthException;
use App\Services\Auth\FirebaseTokenVerifier;
use App\Services\Auth\VerifiedFirebaseUser;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class AuthSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_session_endpoints_require_authentication(): void
    {
        $this->getJson('/api/v1/auth/sessions')->assertUnauthorized();
        $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
        $this->postJson('/api/v1/auth/logout-all')->assertUnauthorized();
        $this->deleteJson('/api/v1/auth/sessions/1')->assertUnauthorized();
    }

    public function test_logout_revokes_only_the_current_token(): void
    {
        $user = User::factory()->create();
        $currentToken = $user->createToken('Current phone');
        $otherToken = $user->createToken('Laptop');

        $this->withToken($currentToken->plainTextToken)
            ->postJson('/api/v1/auth/logout')
            ->assertOk()
            ->assertJsonPath('message', 'Current session logged out successfully.');

        $this->assertDatabaseMissing('personal_access_tokens', [
            'id' => $currentToken->accessToken->id,
        ]);
        $this->assertDatabaseHas('personal_access_tokens', [
            'id' => $otherToken->accessToken->id,
        ]);

        $this->app['auth']->forgetGuards();

        $this->withToken($currentToken->plainTextToken)
            ->getJson('/api/v1/user/me')
            ->assertUnauthorized();
    }

    public function test_sessions_only_return_the_authenticated_users_safe_metadata(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $currentToken = $user->createToken('Zaidan Phone', ['*'], now()->addDay());
        $laptopToken = $user->createToken('MacBook', ['*'], now()->addWeek());
        $foreignToken = $otherUser->createToken('Other user phone');

        $response = $this->withToken($currentToken->plainTextToken)
            ->getJson('/api/v1/auth/sessions')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('message', 'Active sessions retrieved successfully.');

        $sessions = collect($response->json('data'));
        $currentSession = $sessions->firstWhere('id', $currentToken->accessToken->id);

        $this->assertNotNull($currentSession);
        $this->assertSame('Zaidan Phone', $currentSession['device_name']);
        $this->assertTrue($currentSession['is_current']);
        $this->assertFalse($sessions->firstWhere('id', $laptopToken->accessToken->id)['is_current']);
        $this->assertNull($sessions->firstWhere('id', $foreignToken->accessToken->id));

        foreach ($sessions as $session) {
            $this->assertArrayNotHasKey('token', $session);
        }

        $this->assertStringNotContainsString($currentToken->plainTextToken, $response->getContent());
        $this->assertStringNotContainsString($currentToken->accessToken->token, $response->getContent());
    }

    public function test_a_user_can_revoke_an_owned_session_but_not_another_users_session(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $currentToken = $user->createToken('Current phone');
        $ownedToken = $user->createToken('Old laptop');
        $foreignToken = $otherUser->createToken('Other user phone');

        $this->withToken($currentToken->plainTextToken)
            ->deleteJson("/api/v1/auth/sessions/{$foreignToken->accessToken->id}")
            ->assertNotFound()
            ->assertJsonPath('message', 'Session not found.');

        $this->assertDatabaseHas('personal_access_tokens', [
            'id' => $foreignToken->accessToken->id,
        ]);

        $this->withToken($currentToken->plainTextToken)
            ->deleteJson("/api/v1/auth/sessions/{$ownedToken->accessToken->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Session revoked successfully.');

        $this->assertDatabaseMissing('personal_access_tokens', [
            'id' => $ownedToken->accessToken->id,
        ]);
    }

    public function test_logout_all_revokes_every_token_owned_by_the_user_only(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $currentToken = $user->createToken('Current phone');
        $user->createToken('Laptop');
        $foreignToken = $otherUser->createToken('Other user phone');

        $this->withToken($currentToken->plainTextToken)
            ->postJson('/api/v1/auth/logout-all')
            ->assertOk()
            ->assertJsonPath('data.revoked_sessions', 2)
            ->assertJsonPath('message', 'All sessions logged out successfully.');

        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertDatabaseHas('personal_access_tokens', [
            'id' => $foreignToken->accessToken->id,
        ]);
    }

    public function test_scoped_agent_tokens_cannot_manage_all_user_sessions(): void
    {
        $user = User::factory()->create();
        $agentToken = $user->createToken('odysseus', ['orvyn:read', 'orvyn:write']);

        $this->withToken($agentToken->plainTextToken)
            ->getJson('/api/v1/auth/sessions')
            ->assertForbidden()
            ->assertJsonPath('message', 'A full user session is required to manage sessions.');

        $this->withToken($agentToken->plainTextToken)
            ->postJson('/api/v1/auth/logout-all')
            ->assertForbidden();

        $this->assertDatabaseHas('personal_access_tokens', [
            'id' => $agentToken->accessToken->id,
        ]);
    }

    public function test_a_read_only_agent_token_can_still_logout_itself(): void
    {
        $user = User::factory()->create();
        $agentToken = $user->createToken('odysseus-readonly', ['orvyn:read']);

        $this->withToken($agentToken->plainTextToken)
            ->postJson('/api/v1/auth/logout')
            ->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', [
            'id' => $agentToken->accessToken->id,
        ]);
    }

    public function test_demo_login_sanitizes_the_device_name_and_sets_configured_expiration(): void
    {
        $now = CarbonImmutable::parse('2026-07-24 03:00:00', 'UTC');
        $this->travelTo($now);
        config([
            'services.demo_login.enabled' => true,
            'services.auth_tokens.expiration_minutes' => 90,
        ]);

        $response = $this->withHeader('X-Device-Name', "  <b>Zaidan's 📱 Phone</b>  ")
            ->postJson('/api/v1/auth/demo-login')
            ->assertOk()
            ->assertJsonPath('data.session.device_name', "Zaidan's Phone")
            ->assertJsonPath('data.session.expires_at', $now->addMinutes(90)->toIso8601String());

        $this->assertDatabaseHas('personal_access_tokens', [
            'name' => "demo-login: Zaidan's Phone",
            'expires_at' => $now->addMinutes(90)->utc()->format('Y-m-d H:i:s'),
        ]);

        $this->app['auth']->forgetGuards();

        $this->withToken($response->json('data.token'))
            ->getJson('/api/v1/user/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'demo@orvyn.app');
    }

    public function test_firebase_login_fails_closed_when_credentials_are_not_configured(): void
    {
        config(['services.firebase.credentials' => null]);

        $this->postJson('/api/v1/auth/firebase', [
            'id_token' => 'untrusted-token',
        ])->assertServiceUnavailable()
            ->assertJsonPath('message', 'Firebase authentication is not configured.');

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_firebase_login_uses_only_the_verified_identity_and_issues_a_device_session(): void
    {
        $now = CarbonImmutable::parse('2026-07-24 03:00:00', 'UTC');
        $this->travelTo($now);
        config(['services.auth_tokens.expiration_minutes' => 120]);

        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verify')
                ->once()
                ->with('verified-id-token')
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'firebase-verified-uid',
                    email: 'verified@orvyn.app',
                    emailVerified: true,
                    displayName: 'Verified Student',
                ));
        });

        $response = $this->withHeader('X-Device-Name', '  <b>Pixel 📱 9</b> ')
            ->postJson('/api/v1/auth/firebase', [
                'id_token' => 'verified-id-token',
                'email' => 'attacker@example.com',
                'name' => 'Spoofed Name',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.email', 'verified@orvyn.app')
            ->assertJsonPath('data.user.name', 'Verified Student')
            ->assertJsonPath('data.session.device_name', 'Pixel 9')
            ->assertJsonPath('data.session.expires_at', $now->addMinutes(120)->toIso8601String())
            ->assertJsonPath('message', 'Firebase login successful.');

        $this->assertDatabaseHas('users', [
            'firebase_uid' => 'firebase-verified-uid',
            'email' => 'verified@orvyn.app',
            'name' => 'Verified Student',
        ]);
        $this->assertDatabaseMissing('users', [
            'email' => 'attacker@example.com',
        ]);
        $this->assertDatabaseHas('personal_access_tokens', [
            'name' => 'firebase: Pixel 9',
            'expires_at' => $now->addMinutes(120)->format('Y-m-d H:i:s'),
        ]);

        $this->app['auth']->forgetGuards();

        $this->withToken($response->json('data.token'))
            ->getJson('/api/v1/user/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'verified@orvyn.app');
    }

    public function test_firebase_login_rejects_invalid_tokens_and_unverified_email_accounts(): void
    {
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verify')
                ->once()
                ->with('invalid-token')
                ->andThrow(FirebaseAuthException::invalidToken());
        });

        $this->postJson('/api/v1/auth/firebase', [
            'id_token' => 'invalid-token',
        ])->assertUnauthorized()
            ->assertJsonPath('message', 'The Firebase ID token is invalid, expired, or revoked.');

        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verify')
                ->once()
                ->with('unverified-token')
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'firebase-unverified-uid',
                    email: 'unverified@orvyn.app',
                    emailVerified: false,
                    displayName: 'Unverified Student',
                ));
        });

        $this->postJson('/api/v1/auth/firebase', [
            'id_token' => 'unverified-token',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'A verified Firebase email address is required.');

        $this->assertDatabaseCount('users', 0);
    }

    public function test_firebase_login_updates_the_user_matching_the_verified_uid(): void
    {
        $user = User::factory()->create([
            'firebase_uid' => 'existing-firebase-uid',
            'email' => 'old-email@orvyn.app',
            'name' => 'Old Name',
        ]);

        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verify')
                ->once()
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'existing-firebase-uid',
                    email: 'new-email@orvyn.app',
                    emailVerified: true,
                    displayName: 'Updated Name',
                ));
        });

        $this->postJson('/api/v1/auth/firebase', [
            'id_token' => 'valid-updated-profile',
        ])->assertOk()
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.email', 'new-email@orvyn.app')
            ->assertJsonPath('data.user.name', 'Updated Name');

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'firebase_uid' => 'existing-firebase-uid',
            'email' => 'new-email@orvyn.app',
            'name' => 'Updated Name',
        ]);
    }

    public function test_firebase_login_does_not_relink_an_email_owned_by_another_uid(): void
    {
        $existingUser = User::factory()->create([
            'firebase_uid' => 'original-firebase-uid',
            'email' => 'owned@orvyn.app',
        ]);

        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verify')
                ->once()
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'different-firebase-uid',
                    email: 'owned@orvyn.app',
                    emailVerified: true,
                    displayName: 'Different User',
                ));
        });

        $this->postJson('/api/v1/auth/firebase', [
            'id_token' => 'valid-but-conflicting-profile',
        ])->assertConflict()
            ->assertJsonPath('message', 'This email address is already linked to another account.');

        $this->assertDatabaseHas('users', [
            'id' => $existingUser->id,
            'firebase_uid' => 'original-firebase-uid',
        ]);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
