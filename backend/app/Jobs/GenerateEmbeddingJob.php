<?php

namespace App\Jobs;

use App\Models\Task;
use App\Services\AI\GeminiService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class GenerateEmbeddingJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct(
        protected Task $task
    ) {}

    /**
     * Execute the job.
     */
    public function handle(GeminiService $geminiService): void
    {
        $content = $this->task->title . "\n" . ($this->task->description ?? '');
        
        $embedding = $geminiService->generateEmbedding($content);

        if ($embedding) {
            // Store embedding
            DB::table('task_embeddings')->updateOrInsert(
                ['task_id' => $this->task->id],
                [
                    'id' => \Illuminate\Support\Str::uuid(),
                    'chunk_content' => $content,
                    'embedding' => DB::raw("'" . json_encode($embedding) . "'::vector"),
                    'created_at' => now(),
                ]
            );
            
            Log::info("Generated and stored embedding for task: {$this->task->id}");
        } else {
            Log::warning("Could not generate embedding for task: {$this->task->id} (API key might be empty)");
        }
    }
}
