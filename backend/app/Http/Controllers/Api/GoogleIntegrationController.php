<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Google\GoogleWorkspaceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GoogleIntegrationController extends Controller
{
    public function __construct(
        protected GoogleWorkspaceService $googleService
    ) {}

    /**
     * Get Google Workspace integration status.
     */
    public function status(Request $request): JsonResponse
    {
        $status = $this->googleService->getStatus($request->user());

        return response()->json([
            'data' => $status,
            'message' => 'Status integrasi Google Workspace berhasil dimuat.',
        ]);
    }

    /**
     * Sync campus schedules & time blocks to Google Calendar.
     */
    public function syncCalendar(Request $request): JsonResponse
    {
        $result = $this->googleService->syncCalendar($request->user());

        return response()->json([
            'data' => $result,
            'message' => $result['message'],
        ]);
    }

    /**
     * Create a Google Meet session.
     */
    public function createMeet(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|max:150',
            'start_time' => 'nullable|date',
            'duration_minutes' => 'nullable|integer|min:15|max:480',
        ]);

        $result = $this->googleService->createMeetSession(
            $request->user(),
            $validated['title'],
            $validated['start_time'] ?? null,
            $validated['duration_minutes'] ?? 60
        );

        return response()->json([
            'data' => $result,
            'message' => $result['message'],
        ]);
    }

    /**
     * Export content/notes to Google Drive/Docs.
     */
    public function exportDrive(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|max:150',
            'content' => 'required|string',
            'type' => 'nullable|string|in:doc,sheet,note',
        ]);

        $result = $this->googleService->exportToDrive(
            $request->user(),
            $validated['title'],
            $validated['content'],
            $validated['type'] ?? 'doc'
        );

        return response()->json([
            'data' => $result,
            'message' => $result['message'],
        ]);
    }

    /**
     * Sync tasks to Google Tasks.
     */
    public function syncTasks(Request $request): JsonResponse
    {
        $result = $this->googleService->syncTasks($request->user());

        return response()->json([
            'data' => $result,
            'message' => $result['message'],
        ]);
    }
}
