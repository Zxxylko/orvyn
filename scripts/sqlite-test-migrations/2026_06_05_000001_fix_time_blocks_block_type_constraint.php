<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('time_blocks', function (Blueprint $table) {
            $table->string('block_type')->default('task')->change();
        });
    }

    public function down(): void
    {
        Schema::table('time_blocks', function (Blueprint $table) {
            $table->enum('block_type', ['deep_work', 'lecture', 'sleep', 'break', 'routine'])
                ->default('deep_work')
                ->change();
        });
    }
};
