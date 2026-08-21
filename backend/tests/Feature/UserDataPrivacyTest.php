<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\FirebaseAuthException;
use App\Services\Auth\FirebaseTokenVerifier;
use App\Services\Auth\VerifiedFirebaseUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery\MockInterface;
use Tests\TestCase;

class UserDataPrivacyTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_export_only_their_own_data_without_private_identifiers(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $user->tasks()->create(['title' => 'Tugas milik saya']);
        $other->tasks()->create(['title' => 'Tugas milik orang lain']);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/user/export')
            ->assertOk()
            ->assertHeader('Content-Disposition')
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.tasks.0.title', 'Tugas milik saya')
            ->assertJsonMissing(['title' => 'Tugas milik orang lain'])
            ->assertJsonMissingPath('data.user.firebase_uid');
    }

    public function test_account_deletion_requires_an_explicit_confirmation_phrase(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/v1/user', ['confirmation' => 'hapus'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('confirmation');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_scoped_agent_token_cannot_export_or_delete_account_data(): void
    {
        $user = User::factory()->create();
        $agentToken = $user->createToken('odysseus', ['orvyn:read', 'orvyn:write']);

        $this->withToken($agentToken->plainTextToken)
            ->getJson('/api/v1/user/export')
            ->assertForbidden();

        $this->withToken($agentToken->plainTextToken)
            ->deleteJson('/api/v1/user', ['confirmation' => 'HAPUS AKUN'])
            ->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_account_deletion_requires_a_fresh_firebase_id_token(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('verifyFresh');
            $mock->shouldNotReceive('deleteIdentity');
        });

        $this->deleteJson('/api/v1/user', [
            'confirmation' => 'HAPUS AKUN',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('id_token');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_account_deletion_rejects_an_invalid_or_expired_firebase_token(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verifyFresh')
                ->once()
                ->with('invalid-or-expired-token')
                ->andThrow(FirebaseAuthException::invalidToken());
            $mock->shouldNotReceive('deleteIdentity');
        });

        $this->deleteJson('/api/v1/user', [
            'confirmation' => 'HAPUS AKUN',
            'id_token' => 'invalid-or-expired-token',
        ])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'The Firebase ID token is invalid, expired, or revoked.');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_account_deletion_rejects_a_token_owned_by_another_firebase_user(): void
    {
        $user = User::factory()->create(['firebase_uid' => 'authenticated-firebase-uid']);
        Sanctum::actingAs($user);
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verifyFresh')
                ->once()
                ->with('other-users-fresh-token')
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'different-firebase-uid',
                    email: 'other@orvyn.app',
                    emailVerified: true,
                    displayName: 'Other User',
                ));
            $mock->shouldNotReceive('deleteIdentity');
        });

        $this->deleteJson('/api/v1/user', [
            'confirmation' => 'HAPUS AKUN',
            'id_token' => 'other-users-fresh-token',
        ])
            ->assertForbidden()
            ->assertJsonPath('message', 'Firebase identity does not match the authenticated account.');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_account_deletion_fails_closed_when_firebase_identity_deletion_fails(): void
    {
        $user = User::factory()->create(['firebase_uid' => 'provider-failure-firebase-uid']);
        $task = $user->tasks()->create(['title' => 'Must survive provider failure']);
        Sanctum::actingAs($user);
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verifyFresh')
                ->once()
                ->with('valid-fresh-token')
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'provider-failure-firebase-uid',
                    email: 'owner@orvyn.app',
                    emailVerified: true,
                    displayName: 'Owner',
                ));
            $mock->shouldReceive('deleteIdentity')
                ->once()
                ->with('provider-failure-firebase-uid')
                ->andThrow(FirebaseAuthException::unavailable());
        });

        $this->deleteJson('/api/v1/user', [
            'confirmation' => 'HAPUS AKUN',
            'id_token' => 'valid-fresh-token',
        ])
            ->assertServiceUnavailable()
            ->assertJsonPath('message', 'Firebase authentication is temporarily unavailable.');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertDatabaseHas('tasks', ['id' => $task->id]);
    }

    public function test_user_can_delete_their_account_and_related_data(): void
    {
        $user = User::factory()->create(['firebase_uid' => 'deletable-firebase-uid']);
        $user->tasks()->create(['title' => 'Data yang akan dihapus']);
        $user->createToken('phone');
        Sanctum::actingAs($user);
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('verifyFresh')
                ->once()
                ->with('fresh-owner-token')
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'deletable-firebase-uid',
                    email: $user->email,
                    emailVerified: true,
                    displayName: $user->name,
                ));
            $mock->shouldReceive('deleteIdentity')
                ->once()
                ->with('deletable-firebase-uid')
                ->andReturnUsing(function () use ($user): void {
                    $this->assertDatabaseHas('users', ['id' => $user->id]);
                });
        });

        $this->deleteJson('/api/v1/user', [
            'confirmation' => 'HAPUS AKUN',
            'id_token' => 'fresh-owner-token',
        ])
            ->assertOk()
            ->assertJsonPath('data', null);

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('tasks', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_explicitly_enabled_non_production_demo_account_can_be_deleted_without_firebase(): void
    {
        config(['services.demo_login.enabled' => true]);
        $user = User::factory()->create(['firebase_uid' => 'demo_local-test-user']);
        Sanctum::actingAs($user);
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('verifyFresh');
            $mock->shouldNotReceive('deleteIdentity');
        });

        $this->deleteJson('/api/v1/user', [
            'confirmation' => 'HAPUS AKUN',
        ])->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }

    public function test_demo_account_bypass_is_never_available_in_production(): void
    {
        $this->app['env'] = 'production';
        config(['services.demo_login.enabled' => true]);
        $user = User::factory()->create(['firebase_uid' => 'demo_production-user']);
        Sanctum::actingAs($user);
        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldNotReceive('verifyFresh');
            $mock->shouldNotReceive('deleteIdentity');
        });

        $this->deleteJson('/api/v1/user', [
            'confirmation' => 'HAPUS AKUN',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('id_token');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }
}
