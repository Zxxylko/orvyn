<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FirebaseLoginRequest;
use App\Models\User;
use App\Services\Auth\FirebaseAuthException;
use App\Services\Auth\FirebaseTokenVerifier;
use App\Services\Auth\VerifiedFirebaseUser;
use App\Support\DeviceName;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function firebaseLogin(
        FirebaseLoginRequest $request,
        FirebaseTokenVerifier $verifier,
    ): JsonResponse {
        try {
            $identity = $verifier->verify($request->validated('id_token'));
        } catch (FirebaseAuthException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], $exception->httpStatus());
        }

        $email = Str::lower(trim((string) $identity->email));

        if (! $identity->emailVerified || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return response()->json([
                'message' => 'A verified Firebase email address is required.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = $this->syncFirebaseUser($identity, $email);

        if (! $user) {
            return response()->json([
                'message' => 'This email address is already linked to another account.',
            ], Response::HTTP_CONFLICT);
        }

        $deviceName = DeviceName::fromRequest($request);
        $expiresAt = now()->addMinutes($this->tokenExpirationMinutes());

        if ($this->usesBrowserSession($request)) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();

            return response()->json([
                'data' => [
                    'user' => $user->fresh(),
                    'session' => [
                        'device_name' => $deviceName,
                        'expires_at' => null,
                        'type' => 'cookie',
                    ],
                ],
                'message' => 'Firebase login successful.',
            ]);
        }

        $tokenName = "firebase: {$deviceName}";
        $user->tokens()->where('name', $tokenName)->delete();
        $token = $user->createToken($tokenName, ['*'], $expiresAt)->plainTextToken;

        return response()->json([
            'data' => [
                'token' => $token,
                'user' => $user->fresh(),
                'session' => [
                    'device_name' => $deviceName,
                    'expires_at' => $expiresAt->toIso8601String(),
                ],
            ],
            'message' => 'Firebase login successful.',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $currentToken = $request->user()->currentAccessToken();

        if ($currentToken instanceof PersonalAccessToken) {
            $currentToken->delete();
        } elseif ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Current session logged out successfully.',
        ]);
    }

    public function sessions(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $currentToken = $request->user()->currentAccessToken();
        $currentTokenId = $currentToken instanceof PersonalAccessToken
            ? (int) $currentToken->getKey()
            : null;

        $sessions = $request->user()
            ->tokens()
            ->select(['id', 'name', 'abilities', 'last_used_at', 'expires_at', 'created_at'])
            ->latest('last_used_at')
            ->latest('created_at')
            ->get()
            ->map(fn (PersonalAccessToken $token): array => [
                'id' => (int) $token->getKey(),
                'device_name' => $token->name,
                'abilities' => $token->abilities ?? [],
                'last_used_at' => $token->last_used_at?->toIso8601String(),
                'expires_at' => $token->expires_at?->toIso8601String(),
                'created_at' => $token->created_at?->toIso8601String(),
                'is_current' => (int) $token->getKey() === $currentTokenId,
            ]);

        return response()->json([
            'data' => $sessions,
            'message' => 'Active sessions retrieved successfully.',
        ]);
    }

    public function revokeSession(Request $request, int $id): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $session = $request->user()->tokens()->whereKey($id)->first();

        abort_unless($session, Response::HTTP_NOT_FOUND, 'Session not found.');

        $session->delete();

        return response()->json([
            'message' => 'Session revoked successfully.',
        ]);
    }

    public function logoutAll(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $revokedSessions = $request->user()->tokens()->delete();

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'data' => [
                'revoked_sessions' => $revokedSessions,
            ],
            'message' => 'All sessions logged out successfully.',
        ]);
    }

    private function ensureFullUserSession(Request $request): void
    {
        if (! $request->bearerToken()) {
            return;
        }

        abort_unless(
            $request->user()->tokenCan('*'),
            Response::HTTP_FORBIDDEN,
            'A full user session is required to manage sessions.',
        );
    }

    private function syncFirebaseUser(VerifiedFirebaseUser $identity, string $email): ?User
    {
        return DB::transaction(function () use ($email, $identity): ?User {
            $user = User::where('firebase_uid', $identity->uid)->lockForUpdate()->first();
            $emailOwner = User::where('email', $email)->lockForUpdate()->first();

            if ($user && $emailOwner && ! $user->is($emailOwner)) {
                return null;
            }

            if (! $user && $emailOwner) {
                return null;
            }

            $name = trim((string) $identity->displayName);

            if (! $user) {
                return User::create([
                    'firebase_uid' => $identity->uid,
                    'name' => $name !== '' ? $name : Str::headline(Str::before($email, '@')),
                    'email' => $email,
                    'email_verified_at' => now(),
                    'preferences' => [],
                ]);
            }

            $user->forceFill([
                'firebase_uid' => $identity->uid,
                'name' => $name !== '' ? $name : $user->name,
                'email' => $email,
                'email_verified_at' => now(),
            ])->save();

            return $user;
        });
    }

    private function tokenExpirationMinutes(): int
    {
        return max(1, (int) config('services.auth_tokens.expiration_minutes'));
    }

    private function usesBrowserSession(Request $request): bool
    {
        return $request->hasSession()
            && hash_equals('web', strtolower((string) $request->header('X-Client-Platform')));
    }
}
