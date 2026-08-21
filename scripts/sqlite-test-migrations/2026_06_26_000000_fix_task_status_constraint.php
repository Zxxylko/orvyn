<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('tasks')->where('status', 'todo')->update(['status' => 'pending']);

        Schema::table('tasks', function (Blueprint $table) {
            $table->string('status')->default('pending')->change();
        });
    }

    public function down(): void
    {
        DB::table('tasks')->where('status', 'pending')->update(['status' => 'todo']);

        Schema::table('tasks', function (Blueprint $table) {
            $table->string('status')->default('todo')->change();
        });
    }
};
