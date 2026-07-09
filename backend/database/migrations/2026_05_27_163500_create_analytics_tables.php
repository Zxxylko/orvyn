<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Student Profiles — stores learned multipliers, chronotype, and streaks
        Schema::create('student_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->unique()->constrained()->cascadeOnDelete();

            // Chronotype & scheduling preferences
            $table->string('preferred_chronotype')->default('standard'); // standard | early_bird | night_owl
            $table->integer('preferred_start_hour')->default(9);        // When their productive day starts
            $table->integer('preferred_end_hour')->default(18);         // When their productive day ends
            $table->integer('max_daily_focus_minutes')->default(300);   // Soft cap on deep focus per day

            // Learned Historical Correction Factors (HCF) per category
            $table->float('coding_hcf')->default(1.0);   // Rolling avg of actual/estimated for coding tasks
            $table->float('theory_hcf')->default(1.0);    // Rolling avg for theory tasks
            $table->float('admin_hcf')->default(1.0);     // Rolling avg for admin tasks

            // Productivity streak tracking
            $table->integer('current_streak')->default(0);       // Consecutive days with >= 1 focus log
            $table->integer('longest_streak')->default(0);       // All-time best streak
            $table->date('last_active_date')->nullable();         // Last day with a completed focus session

            // Cached analytics scores (recalculated daily or on-demand)
            $table->float('flow_state_score')->default(50.0);    // FSS 0-100
            $table->float('burnout_risk_index')->default(0.0);   // BRI 0.0-1.0

            $table->timestamps();
        });

        // Focus Logs — individual Pomodoro / focus session records
        Schema::create('focus_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('task_id')->nullable()->constrained()->nullOnDelete();

            $table->integer('planned_minutes');          // How long the session was planned for
            $table->integer('actual_minutes');            // How long the student actually focused
            $table->integer('focus_rating')->default(3);  // Self-reported quality 1-5
            $table->boolean('completed')->default(false); // Did they finish the full session?
            $table->string('session_type')->default('pomodoro'); // pomodoro | deep_work | review

            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'started_at']);
            $table->index(['user_id', 'task_id']);
        });

        // AI Memories — lightweight long-term academic memory for personalization
        Schema::create('ai_memories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();

            $table->string('category');       // preference | observation | pattern | insight
            $table->string('key');            // e.g. "peak_hour", "weak_subject", "study_habit"
            $table->text('value');            // The memory content (text or JSON string)
            $table->float('confidence')->default(0.5); // How confident the AI is (0.0-1.0)
            $table->integer('reinforcement_count')->default(1); // How many times this was observed

            $table->timestamps();

            $table->index(['user_id', 'category']);
            $table->unique(['user_id', 'key']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ai_memories');
        Schema::dropIfExists('focus_logs');
        Schema::dropIfExists('student_profiles');
    }
};
