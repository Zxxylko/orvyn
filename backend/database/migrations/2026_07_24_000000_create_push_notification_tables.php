<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_notification_preferences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->boolean('enabled')->default(true);
            $table->string('timezone', 64)->default('Asia/Jakarta');
            $table->time('daily_briefing_time')->default('07:00');
            $table->unsignedSmallInteger('reminder_lead_minutes')->default(180);
            $table->json('reminder_schedule')->nullable();
            $table->json('features')->nullable();
            $table->timestamps();
        });

        Schema::create('device_push_tokens', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('token', 255)->unique();
            $table->string('platform', 20);
            $table->string('device_name', 120)->nullable();
            $table->string('app_version', 32)->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_push_tokens');
        Schema::dropIfExists('push_notification_preferences');
    }
};
