<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campus_schedules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('course_name');
            $table->string('course_code', 30)->nullable();
            $table->string('lecturer')->nullable();
            $table->string('building', 80)->nullable();
            $table->string('room', 80)->nullable();
            $table->unsignedTinyInteger('day_of_week');
            $table->time('start_time');
            $table->time('end_time');
            $table->enum('class_type', ['lecture', 'lab', 'project', 'exam', 'seminar'])->default('lecture');
            $table->unsignedSmallInteger('commute_minutes')->default(35);
            $table->unsignedSmallInteger('prep_minutes')->default(20);
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['user_id', 'day_of_week', 'start_time']);
            $table->index(['user_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campus_schedules');
    }
};
