<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicTask;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AcademicTaskController extends Controller
{
    /**
     * Display a listing of academic tasks.
     */
    public function index()
    {
        $tasks = Auth::user()->academicTasks()
            ->orderBy('deadline', 'asc')
            ->get();

        return response()->json([
            'data' => $tasks,
        ]);
    }

    /**
     * Display a single academic task owned by the current user.
     */
    public function show(AcademicTask $academicTask)
    {
        $this->authorizeOwnership('view', $academicTask);

        return response()->json([
            'data' => $academicTask,
        ]);
    }

    /**
     * Store a newly created academic task and mirror to scheduling tasks.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'course_name' => 'required|string|max:100',
            'task_type' => 'required|string|in:tp,praktikum,jurnal,tubes,exam',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'deadline' => 'nullable|date',
            'status' => 'sometimes|string|in:todo,in_progress,completed',
            'lms_url' => 'nullable|url',
        ]);

        $user = Auth::user();
        $academicTask = $user->academicTasks()->create($validated);

        // Mirror to scheduling tasks queue so AI optimizer registers it
        $priority = match ($validated['task_type']) {
            'exam', 'tubes' => 'critical',
            'praktikum' => 'high',
            default => 'medium',
        };

        $duration = match ($validated['task_type']) {
            'tubes' => 180,
            'exam', 'praktikum' => 120,
            default => 60, // TP/jurnal
        };

        $difficulty = match ($validated['task_type']) {
            'tubes', 'exam' => 4,
            'praktikum' => 3,
            default => 2,
        };

        $category = match ($validated['task_type']) {
            'praktikum', 'tubes' => 'coding',
            default => 'theory',
        };

        // Create mirrored task
        $mirroredTask = $user->tasks()->create([
            'title' => '['.$validated['course_name'].'] '.$validated['title'],
            'description' => ($validated['description'] ?? '')."\n\nSynced from Tel-U Academic Tracker. LMS: ".($validated['lms_url'] ?? 'Not provided'),
            'deadline' => $validated['deadline'] ?? null,
            'priority' => $priority,
            'duration_minutes' => $duration,
            'difficulty' => $difficulty,
            'category' => $category,
            'status' => $this->toSchedulerStatus($validated['status'] ?? 'todo'),
        ]);

        // Link the mirrored task to the academic task
        $academicTask->update([
            'mirrored_task_id' => $mirroredTask->id,
        ]);

        return response()->json([
            'data' => $academicTask,
            'message' => 'Academic task registered and synchronized with AI Scheduler.',
        ], 201);
    }

    /**
     * Update an academic task.
     */
    public function update(Request $request, AcademicTask $academicTask)
    {
        $this->authorizeOwnership('update', $academicTask);

        $validated = $request->validate([
            'course_name' => 'sometimes|required|string|max:100',
            'task_type' => 'sometimes|required|string|in:tp,praktikum,jurnal,tubes,exam',
            'title' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'deadline' => 'nullable|date',
            'status' => 'sometimes|required|string|in:todo,in_progress,completed',
            'lms_url' => 'nullable|url',
        ]);

        $oldTitle = '['.$academicTask->course_name.'] '.$academicTask->title;
        $academicTask->update($validated);

        // Update mirrored task if status or details changed
        $user = Auth::user();
        $mirrored = $academicTask->mirrored_task_id
            ? $user->tasks()->where('id', $academicTask->mirrored_task_id)->first()
            : $user->tasks()->where('title', $oldTitle)->first();

        if ($mirrored) {
            // Update mirrored_task_id on academicTask if it was empty (legacy upgrade)
            if (! $academicTask->mirrored_task_id) {
                $academicTask->update(['mirrored_task_id' => $mirrored->id]);
            }

            $updateData = [];
            if (isset($validated['title']) || isset($validated['course_name'])) {
                $cName = $validated['course_name'] ?? $academicTask->course_name;
                $tTitle = $validated['title'] ?? $academicTask->title;
                $updateData['title'] = '['.$cName.'] '.$tTitle;
            }
            if (isset($validated['deadline'])) {
                $updateData['deadline'] = $validated['deadline'];
            }
            if (isset($validated['status'])) {
                $updateData['status'] = $this->toSchedulerStatus($validated['status']);
                if ($validated['status'] === 'completed') {
                    $updateData['completed_at'] = now();
                }
            }
            if (isset($validated['description']) || isset($validated['lms_url'])) {
                $desc = $validated['description'] ?? $academicTask->description;
                $url = $validated['lms_url'] ?? $academicTask->lms_url;
                $updateData['description'] = ($desc ?? '')."\n\nSynced from Tel-U Academic Tracker. LMS: ".($url ?? 'Not provided');
            }

            $mirrored->update($updateData);
        }

        return response()->json([
            'data' => $academicTask,
            'message' => 'Academic task updated.',
        ]);
    }

    /**
     * Delete an academic task.
     */
    public function destroy(AcademicTask $academicTask)
    {
        $this->authorizeOwnership('delete', $academicTask);

        $user = Auth::user();
        $oldTitle = '['.$academicTask->course_name.'] '.$academicTask->title;

        // Delete mirrored task
        if ($academicTask->mirrored_task_id) {
            $user->tasks()->where('id', $academicTask->mirrored_task_id)->delete();
        } else {
            $user->tasks()->where('title', $oldTitle)->delete();
        }

        $academicTask->delete();

        return response()->json([
            'message' => 'Academic task deleted.',
        ]);
    }

    /**
     * Authorize user ownership inline for quick execution.
     */
    protected function authorizeOwnership($ability, $model)
    {
        if ($model->user_id !== Auth::id()) {
            abort(403, 'Unauthorized action.');
        }
    }

    private function toSchedulerStatus(string $academicStatus): string
    {
        return match ($academicStatus) {
            'todo' => 'pending',
            'in_progress' => 'in_progress',
            'completed' => 'completed',
            default => 'pending',
        };
    }
}
