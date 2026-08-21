<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\DeviceName;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class DemoAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        abort_unless(config('services.demo_login.enabled'), 403, 'Demo login is disabled.');

        $user = User::firstOrCreate(
            ['email' => 'demo@orvyn.app'],
            [
                'firebase_uid' => 'demo_'.Str::random(20),
                'name' => 'Demo Student',
                'email_verified_at' => now(),
                'preferences' => [
                    'theme' => 'dark',
                    'notifications_enabled' => true,
                ],
            ]
        );

        $this->seedDemoData($user);

        $deviceName = DeviceName::fromRequest($request);
        $expiresAt = now()->addMinutes(
            max(1, (int) config('services.auth_tokens.expiration_minutes'))
        );

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
                'message' => 'Demo login successful',
            ]);
        }

        $tokenName = "demo-login: {$deviceName}";
        $user->tokens()->whereIn('name', [$tokenName, 'demo-login'])->delete();
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
            'message' => 'Demo login successful',
        ]);
    }

    private function usesBrowserSession(Request $request): bool
    {
        return $request->hasSession()
            && hash_equals('web', strtolower((string) $request->header('X-Client-Platform')));
    }

    private function seedDemoData(User $user): void
    {
        if ($user->tasks()->count() === 0) {
            $user->tasks()->createMany([
                [
                    'title' => 'Review Struktur Data graph traversal',
                    'description' => 'BFS, DFS, shortest path, and implementation notes.',
                    'deadline' => now()->addDays(2),
                    'priority' => 'high',
                    'duration_minutes' => 120,
                    'difficulty' => 4,
                    'category' => 'academics',
                    'tags' => ['informatika', 'struktur-data'],
                    'status' => 'pending',
                ],
                [
                    'title' => 'Finish Praktikum Basis Data report',
                    'description' => 'Normalize schema, add query screenshots, and submit to LMS.',
                    'deadline' => now()->addDay(),
                    'priority' => 'critical',
                    'duration_minutes' => 150,
                    'difficulty' => 4,
                    'category' => 'academics',
                    'tags' => ['praktikum', 'basis-data'],
                    'status' => 'in_progress',
                ],
                [
                    'title' => 'Push tubes checkpoint to GitHub',
                    'description' => 'Commit working branch and write a short progress note.',
                    'deadline' => now()->addDays(3),
                    'priority' => 'medium',
                    'duration_minutes' => 45,
                    'difficulty' => 2,
                    'category' => 'academics',
                    'tags' => ['tubes', 'github'],
                    'status' => 'pending',
                ],
            ]);
        }

        if ($user->habits()->count() === 0) {
            $running = $user->habits()->create([
                'name' => 'Lari setiap hari',
                'category' => 'health',
                'target_per_day' => 1,
                'unit' => 'run',
                'color' => 'pink',
            ]);

            $running->checkIns()->createMany([
                [
                    'user_id' => $user->id,
                    'check_in_date' => now()->subDays(2)->toDateString(),
                    'value' => 1,
                ],
                [
                    'user_id' => $user->id,
                    'check_in_date' => now()->subDay()->toDateString(),
                    'value' => 1,
                ],
            ]);
        }

        if ($user->campusSchedules()->count() === 0) {
            $user->campusSchedules()->createMany([
                [
                    'course_name' => 'Struktur Data',
                    'course_code' => 'CII2A3',
                    'lecturer' => 'Dosen Informatika',
                    'building' => 'TULT',
                    'room' => '0901',
                    'day_of_week' => 1,
                    'start_time' => '08:30',
                    'end_time' => '10:30',
                    'class_type' => 'lecture',
                    'commute_minutes' => 35,
                    'prep_minutes' => 20,
                ],
                [
                    'course_name' => 'Praktikum Basis Data',
                    'course_code' => 'CII2B4',
                    'lecturer' => 'Asisten Lab',
                    'building' => 'FIF Lab',
                    'room' => 'Lab DB',
                    'day_of_week' => 3,
                    'start_time' => '13:00',
                    'end_time' => '15:30',
                    'class_type' => 'lab',
                    'commute_minutes' => 40,
                    'prep_minutes' => 25,
                ],
                [
                    'course_name' => 'Tubes Software Engineering',
                    'course_code' => 'CII3C3',
                    'lecturer' => 'Project Mentor',
                    'building' => 'GKU',
                    'room' => 'Ruang Diskusi',
                    'day_of_week' => 5,
                    'start_time' => '09:30',
                    'end_time' => '11:00',
                    'class_type' => 'project',
                    'commute_minutes' => 35,
                    'prep_minutes' => 15,
                ],
            ]);
        }
    }
}
