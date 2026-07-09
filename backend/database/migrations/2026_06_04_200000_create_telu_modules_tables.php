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
        // 1. Academic Tasks Table
        Schema::create('academic_tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('course_name');
            $table->string('task_type'); // 'tp', 'praktikum', 'jurnal', 'tubes', 'exam'
            $table->string('title');
            $table->text('description')->nullable();
            $table->dateTime('deadline')->nullable();
            $table->string('status')->default('todo'); // 'todo', 'in_progress', 'completed'
            $table->string('lms_url')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'deadline']);
        });

        // 2. Living Expenses Table
        Schema::create('living_expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->decimal('amount', 12, 2);
            $table->string('category'); // 'rent', 'food', 'laundry', 'coffee', 'developer_sub', 'other'
            $table->string('description')->nullable();
            $table->date('expense_date');
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->index(['user_id', 'expense_date']);
            $table->index(['user_id', 'category']);
        });

        // 3. Health Logs Table
        Schema::create('health_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->integer('hydration_ml')->default(0);
            $table->integer('caffeine_mg')->default(0);
            $table->integer('screen_time_minutes')->default(0);
            $table->decimal('sleep_hours', 4, 1)->default(0.0);
            $table->date('log_date');
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->unique(['user_id', 'log_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('health_logs');
        Schema::dropIfExists('living_expenses');
        Schema::dropIfExists('academic_tasks');
    }
};
