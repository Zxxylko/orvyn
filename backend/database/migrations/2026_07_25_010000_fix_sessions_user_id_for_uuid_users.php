<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('sessions')) {
            $this->createSessionsTable();

            return;
        }

        if (! Schema::hasColumn('sessions', 'user_id')) {
            DB::table('sessions')->delete();

            Schema::table('sessions', function (Blueprint $table) {
                $table->uuid('user_id')->nullable()->index();
            });

            return;
        }

        if ($this->hasUuidCompatibleUserId()) {
            return;
        }

        // Existing session records are disposable and may contain an
        // authenticated UUID that cannot be represented by the legacy bigint.
        DB::table('sessions')->delete();

        Schema::table('sessions', function (Blueprint $table) {
            $table->dropColumn('user_id');
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->index();
        });
    }

    /**
     * The UUID-compatible schema must not be reverted to an integer because
     * users have always used UUID primary keys.
     */
    public function down(): void
    {
        //
    }

    private function createSessionsTable(): void
    {
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->uuid('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    private function hasUuidCompatibleUserId(): bool
    {
        // SQLite uses dynamic typing for normal (non-STRICT) tables, so even
        // an INTEGER-affinity column safely stores UUID text. Rebuilding that
        // column is unnecessary and can leave schema-dump indexes stale.
        if (DB::getDriverName() === 'sqlite') {
            return true;
        }

        return in_array(
            strtolower(Schema::getColumnType('sessions', 'user_id')),
            ['uuid', 'char', 'varchar', 'string', 'text', 'uniqueidentifier'],
            true,
        );
    }
};
