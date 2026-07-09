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
        Schema::table('academic_tasks', function (Blueprint $table) {
            $table->uuid('mirrored_task_id')->nullable()->after('lms_url');
            $table->foreign('mirrored_task_id')->references('id')->on('tasks')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('academic_tasks', function (Blueprint $table) {
            $table->dropForeign(['mirrored_task_id']);
            $table->dropColumn('mirrored_task_id');
        });
    }
};
