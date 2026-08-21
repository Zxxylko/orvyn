<?php

namespace App\Http\Controllers\Api;

use App\Events\TaskCreated;
use App\Events\TaskDeleted;
use App\Events\TaskUpdated;
use App\Http\Controllers\Controller;
use App\Jobs\GenerateEmbeddingJob;
use App\Models\Task;
use App\Services\AI\AIManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TaskController extends Controller
{
    public function __construct(
        private AIManager $ai
    ) {}

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $query = Auth::user()->tasks();

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter active tasks
        if ($request->boolean('active')) {
            $query->active();
        }

        // Filter overdue tasks
        if ($request->boolean('overdue')) {
            $query->overdue();
        }

        $tasks = $query->orderBy('deadline', 'asc')
            ->orderBy('priority', 'desc')
            ->get();

        return response()->json([
            'data' => $tasks,
            'message' => 'Tasks retrieved successfully',
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'deadline' => 'nullable|date',
            'status' => 'nullable|in:pending,in_progress,completed,cancelled',
            'priority' => 'nullable|in:low,medium,high,critical',
            'duration_minutes' => 'nullable|integer|min:1',
            'difficulty' => 'nullable|integer|min:1|max:5',
            'category' => 'nullable|string|max:80',
            'tags' => 'nullable|array|max:12',
            'tags.*' => 'string|max:40',
        ]);

        $validated['status'] ??= 'pending';
        $task = Auth::user()->tasks()->create($validated);

        // Dispatch background embedding job
        GenerateEmbeddingJob::dispatch($task);

        // Broadcast real-time creation
        broadcast(new TaskCreated($task));

        return response()->json([
            'data' => $task,
            'message' => 'Task created successfully',
        ], 201);
    }

    /**
     * Smart parse natural language input into a task
     */
    public function smartParse(Request $request)
    {
        $validated = $request->validate([
            'input' => 'required|string|max:500',
        ]);

        $parsed = $this->ai->parseTask($validated['input'], $request->user());

        $parsed['status'] ??= 'pending';
        $task = Auth::user()->tasks()->create($parsed);

        // Dispatch background embedding job
        GenerateEmbeddingJob::dispatch($task);

        // Broadcast real-time creation
        broadcast(new TaskCreated($task));

        return response()->json([
            'data' => $task,
            'message' => 'Task parsed and created successfully',
            'ai_processed' => $parsed['ai_processed'],
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Task $task)
    {
        $this->authorize('view', $task);

        return response()->json([
            'data' => $task->load('embeddings', 'timeBlocks'),
            'message' => 'Task retrieved successfully',
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Task $task)
    {
        $this->authorize('update', $task);

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'deadline' => 'nullable|date',
            'status' => 'sometimes|in:pending,in_progress,completed,cancelled',
            'priority' => 'sometimes|in:low,medium,high,critical',
            'duration_minutes' => 'nullable|integer|min:1',
            'difficulty' => 'nullable|integer|min:1|max:5',
            'category' => 'nullable|string|max:80',
            'tags' => 'nullable|array|max:12',
            'tags.*' => 'string|max:40',
        ]);

        // Set completed_at when status changes to completed
        if (isset($validated['status']) && $validated['status'] === 'completed' && $task->status !== 'completed') {
            $validated['completed_at'] = now();
        }

        $task->update($validated);

        // Broadcast real-time update
        broadcast(new TaskUpdated($task));

        return response()->json([
            'data' => $task,
            'message' => 'Task updated successfully',
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Task $task)
    {
        $this->authorize('delete', $task);

        $taskId = $task->id;
        $userId = $task->user_id;

        $task->delete();

        // Broadcast real-time deletion
        broadcast(new TaskDeleted($taskId, $userId));

        return response()->json([
            'message' => 'Task deleted successfully',
        ]);
    }
}
