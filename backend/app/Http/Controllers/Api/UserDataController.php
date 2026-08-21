<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Auth\FirebaseAuthException;
use App\Services\Auth\FirebaseTokenVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class UserDataController extends Controller
{
    public function export(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $user = $request->user()->load([
            'tasks',
            'timeBlocks',
            'aiBriefings',
            'studentProfile',
            'focusLogs',
            'habits.checkIns',
            'campusSchedules',
            'academicTasks',
            'livingExpenses',
            'healthLogs',
            'whatsappConnection',
            'pushNotificationPreference',
        ]);

        return response()->json([
            'data' => [
                'format_version' => 1,
                'exported_at' => now()->toIso8601String(),
                'user' => $user->only([
                    'id',
                    'name',
                    'email',
                    'email_verified_at',
                    'preferences',
                    'created_at',
                    'updated_at',
                ]),
                'tasks' => $user->tasks,
                'time_blocks' => $user->timeBlocks,
                'briefings' => $user->aiBriefings,
                'student_profile' => $user->studentProfile,
                'focus_logs' => $user->focusLogs,
                'habits' => $user->habits,
                'campus_schedules' => $user->campusSchedules,
                'academic_tasks' => $user->academicTasks,
                'living_expenses' => $user->livingExpenses,
                'health_logs' => $user->healthLogs,
                'whatsapp_settings' => $user->whatsappConnection,
                'push_notification_settings' => $user->pushNotificationPreference,
            ],
            'message' => 'Ekspor data ORVYN berhasil dibuat.',
        ], headers: [
            'Content-Disposition' => 'attachment; filename="orvyn-data-'.now()->format('Y-m-d').'.json"',
        ]);
    }

    public function destroy(Request $request, FirebaseTokenVerifier $firebase): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $user = $request->user();
        $demoDeletion = $this->allowsLocalDemoDeletion($user);
        $validated = $request->validate([
            'confirmation' => ['required', Rule::in(['HAPUS AKUN'])],
            'id_token' => [$demoDeletion ? 'nullable' : 'required', 'string', 'max:8192'],
        ], [
            'confirmation.in' => 'Ketik HAPUS AKUN untuk mengonfirmasi penghapusan permanen.',
            'id_token.required' => 'Masuk ulang dengan Firebase sebelum menghapus akun.',
        ]);

        if (! $demoDeletion) {
            try {
                $identity = $firebase->verifyFresh($validated['id_token']);
            } catch (FirebaseAuthException $exception) {
                return response()->json([
                    'message' => $exception->getMessage(),
                ], $exception->httpStatus());
            }

            if (! hash_equals((string) $user->firebase_uid, $identity->uid)) {
                return response()->json([
                    'message' => 'Firebase identity does not match the authenticated account.',
                ], Response::HTTP_FORBIDDEN);
            }

            try {
                $firebase->deleteIdentity((string) $user->firebase_uid);
            } catch (FirebaseAuthException $exception) {
                return response()->json([
                    'message' => $exception->getMessage(),
                ], $exception->httpStatus());
            }
        }

        DB::transaction(function () use ($user) {
            $user->tokens()->delete();
            $user->delete();
        });

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'data' => null,
            'message' => 'Akun dan data ORVYN telah dihapus permanen.',
        ]);
    }

    public function updatePrivacyPreferences(Request $request): JsonResponse
    {
        $this->ensureFullUserSession($request);

        $validated = $request->validate([
            'ai_cloud_processing_consent' => ['required', 'boolean'],
        ]);
        $user = $request->user();
        $preferences = $user->preferences ?? [];
        $preferences['ai_cloud_processing_consent'] = $validated['ai_cloud_processing_consent'];
        $preferences['ai_cloud_processing_consented_at'] = $validated['ai_cloud_processing_consent']
            ? now()->toIso8601String()
            : null;
        $user->forceFill(['preferences' => $preferences])->save();

        return response()->json([
            'data' => [
                'ai_cloud_processing_consent' => $validated['ai_cloud_processing_consent'],
                'ai_cloud_processing_consented_at' => $preferences['ai_cloud_processing_consented_at'],
            ],
            'message' => 'Preferensi privasi AI diperbarui.',
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
            'A full user session is required to manage account data.',
        );
    }

    private function allowsLocalDemoDeletion(User $user): bool
    {
        return ! app()->environment('production')
            && (bool) config('services.demo_login.enabled')
            && Str::startsWith((string) $user->firebase_uid, 'demo_');
    }
}
