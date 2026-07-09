<?php

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RepairTaskStatusesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_repairs_legacy_task_statuses(): void
    {
        $this->allowLegacyStatusesForTest();

        $user = User::factory()->create();

        Task::create([
            'user_id' => $user->id,
            'title' => 'Legacy todo task',
            'status' => 'todo',
            'priority' => 'medium',
            'duration_minutes' => 60,
            'difficulty' => 3,
            'category' => 'theory',
        ]);

        Task::create([
            'user_id' => $user->id,
            'title' => 'Legacy archived task',
            'status' => 'archived',
            'priority' => 'medium',
            'duration_minutes' => 60,
            'difficulty' => 3,
            'category' => 'theory',
        ]);

        $exitCode = Artisan::call('tasks:repair-statuses');

        $this->assertSame(0, $exitCode);
        $this->assertDatabaseMissing('tasks', ['status' => 'todo']);
        $this->assertDatabaseMissing('tasks', ['status' => 'archived']);
        $this->assertDatabaseCountForStatus('pending', 1);
        $this->assertDatabaseCountForStatus('cancelled', 1);
    }

    public function test_dry_run_reports_without_changing_data(): void
    {
        $this->allowLegacyStatusesForTest();

        $user = User::factory()->create();

        Task::create([
            'user_id' => $user->id,
            'title' => 'Legacy todo task',
            'status' => 'todo',
            'priority' => 'medium',
            'duration_minutes' => 60,
            'difficulty' => 3,
            'category' => 'theory',
        ]);

        $exitCode = Artisan::call('tasks:repair-statuses --dry-run');

        $this->assertSame(0, $exitCode);
        $this->assertDatabaseHas('tasks', ['status' => 'todo']);
        $this->assertStringContainsString('Dry run complete. 1 task(s) would be updated.', Artisan::output());
    }

    private function allowLegacyStatusesForTest(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check');
        DB::statement("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'pending', 'in_progress', 'completed', 'archived', 'cancelled'))");
    }

    private function assertDatabaseCountForStatus(string $status, int $count): void
    {
        $this->assertSame($count, DB::table('tasks')->where('status', $status)->count());
    }
}
