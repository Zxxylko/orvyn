<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SessionUserIdMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_fresh_schema_uses_uuid_compatible_session_user_ids(): void
    {
        $user = User::factory()->create();

        $this->assertSessionUserIdAcceptsUuids($user);
    }

    public function test_forward_migration_makes_legacy_integer_column_uuid_compatible_without_deleting_users(): void
    {
        $user = User::factory()->create();

        Schema::table('sessions', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
        });
        Schema::table('sessions', function (Blueprint $table) {
            $table->dropColumn('user_id');
        });
        Schema::table('sessions', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->index();
        });
        DB::table('sessions')->insert([
            'id' => 'legacy-anonymous-session',
            'user_id' => null,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'migration-regression-test',
            'payload' => 'legacy',
            'last_activity' => now()->timestamp,
        ]);

        $migration = require database_path(
            'migrations/2026_07_25_010000_fix_sessions_user_id_for_uuid_users.php',
        );
        $migration->up();
        $migration->up();

        $this->assertDatabaseHas('users', ['id' => $user->id]);
        if (DB::getDriverName() !== 'sqlite') {
            $this->assertDatabaseCount('sessions', 0);
        }
        $this->assertSessionUserIdAcceptsUuids($user);
    }

    private function assertSessionUserIdAcceptsUuids(User $user): void
    {
        $type = strtolower(Schema::getColumnType('sessions', 'user_id'));

        if (DB::getDriverName() === 'pgsql') {
            $this->assertSame('uuid', $type);

            return;
        }

        if (DB::getDriverName() === 'sqlite') {
            DB::table('sessions')->insert([
                'id' => 'uuid-compatibility-session',
                'user_id' => $user->id,
                'ip_address' => '127.0.0.1',
                'user_agent' => 'uuid-compatibility-test',
                'payload' => 'uuid-compatible',
                'last_activity' => now()->timestamp,
            ]);

            $this->assertDatabaseHas('sessions', [
                'id' => 'uuid-compatibility-session',
                'user_id' => $user->id,
            ]);

            return;
        }

        $this->assertContains(
            $type,
            ['uuid', 'char', 'varchar', 'string', 'text', 'uniqueidentifier'],
        );
    }
}
