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
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
            DB::statement("ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'pending'");
        } elseif ($driver === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY status ENUM('todo', 'pending', 'in_progress', 'completed', 'archived', 'cancelled') NOT NULL DEFAULT 'pending'");
        }

        // Update existing tasks with status 'todo' to 'pending'
        DB::table('tasks')->where('status', 'todo')->update(['status' => 'pending']);

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY status ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending'");
        }

        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
            DB::statement("ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'todo'");
        } elseif ($driver === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY status ENUM('todo', 'pending', 'in_progress', 'completed', 'archived', 'cancelled') NOT NULL DEFAULT 'todo'");
        }

        // Update tasks back to 'todo'
        DB::table('tasks')->where('status', 'pending')->update(['status' => 'todo']);

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE tasks MODIFY status ENUM('todo', 'in_progress', 'completed', 'archived') NOT NULL DEFAULT 'todo'");
        }

        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'in_progress', 'completed', 'archived'))");
        }
    }
};
