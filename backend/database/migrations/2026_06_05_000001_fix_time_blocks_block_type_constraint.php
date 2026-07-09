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
        // Drop the old constraint
        DB::statement('ALTER TABLE time_blocks DROP CONSTRAINT IF EXISTS time_blocks_block_type_check');

        // Add the new check constraint for pgsql
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE time_blocks ADD CONSTRAINT time_blocks_block_type_check CHECK (block_type IN ('task', 'break', 'class', 'personal', 'study'))");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('ALTER TABLE time_blocks DROP CONSTRAINT IF EXISTS time_blocks_block_type_check');
        
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE time_blocks ADD CONSTRAINT time_blocks_block_type_check CHECK (block_type IN ('deep_work', 'lecture', 'sleep', 'break', 'routine'))");
        }
    }
};
