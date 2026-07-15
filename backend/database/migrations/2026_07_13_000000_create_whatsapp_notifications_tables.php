<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_connections', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('phone_number', 24)->nullable()->unique();
            $table->boolean('enabled')->default(false);
            $table->string('timezone', 64)->default('Asia/Jakarta');
            $table->time('daily_briefing_time')->default('07:00');
            $table->unsignedSmallInteger('reminder_lead_minutes')->default(180);
            $table->json('features')->nullable();
            $table->timestamp('consent_at')->nullable();
            $table->timestamp('last_inbound_at')->nullable();
            $table->timestamp('last_outbound_at')->nullable();
            $table->timestamps();
        });

        Schema::create('notification_deliveries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('channel', 24)->default('whatsapp');
            $table->string('type', 60);
            $table->string('dedupe_key', 190)->unique();
            $table->string('recipient', 32)->nullable();
            $table->json('payload')->nullable();
            $table->string('status', 24)->default('queued');
            $table->string('provider_message_id', 190)->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->text('error')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'channel', 'created_at']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_deliveries');
        Schema::dropIfExists('whatsapp_connections');
    }
};
