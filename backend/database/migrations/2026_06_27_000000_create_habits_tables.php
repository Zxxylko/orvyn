<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('habits', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('category', 60)->default('health');
            $table->unsignedSmallInteger('target_per_day')->default(1);
            $table->string('unit', 40)->default('session');
            $table->string('color', 30)->default('pink');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['user_id', 'is_active']);
        });

        Schema::create('habit_check_ins', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('habit_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->date('check_in_date');
            $table->unsignedSmallInteger('value')->default(1);
            $table->string('note', 255)->nullable();
            $table->timestamps();

            $table->unique(['habit_id', 'check_in_date']);
            $table->index(['user_id', 'check_in_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('habit_check_ins');
        Schema::dropIfExists('habits');
    }
};
