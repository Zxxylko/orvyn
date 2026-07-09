<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Enable pgvector extension only if not SQLite
        if (DB::connection()->getDriverName() !== 'sqlite') {
            DB::statement('CREATE EXTENSION IF NOT EXISTS vector');
        }
        
        Schema::create('task_embeddings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('task_id')->constrained()->cascadeOnDelete();
            $table->text('chunk_content');
            if (DB::connection()->getDriverName() === 'sqlite') {
                $table->text('embedding')->nullable(); // fallback for testing
            }
            $table->timestamp('created_at')->useCurrent();
            
            $table->index('task_id');
        });
        
        // Add vector column using raw SQL (pgvector) if not SQLite
        if (DB::connection()->getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE task_embeddings ADD COLUMN embedding vector(768)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('task_embeddings');
    }
};
