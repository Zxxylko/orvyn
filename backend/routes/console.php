<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('tasks:repair-statuses {--dry-run : Show what would change without updating data}', function () {
    $validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    $legacyStatusMap = [
        'todo' => 'pending',
        'archived' => 'cancelled',
    ];

    $this->info('Checking task statuses...');

    $totalChanged = 0;
    foreach ($legacyStatusMap as $from => $to) {
        $count = DB::table('tasks')->where('status', $from)->count();
        $this->line("{$from} -> {$to}: {$count}");

        if ($count > 0 && ! $this->option('dry-run')) {
            DB::table('tasks')->where('status', $from)->update(['status' => $to]);
        }

        $totalChanged += $count;
    }

    $invalidStatuses = DB::table('tasks')
        ->select('status', DB::raw('COUNT(*) as aggregate'))
        ->whereNotIn('status', $validStatuses)
        ->groupBy('status')
        ->pluck('aggregate', 'status');

    if ($invalidStatuses->isNotEmpty()) {
        $this->warn('Invalid statuses still need manual review:');
        foreach ($invalidStatuses as $status => $count) {
            $this->line("{$status}: {$count}");
        }
    }

    if ($this->option('dry-run')) {
        $this->info("Dry run complete. {$totalChanged} task(s) would be updated.");
        return self::SUCCESS;
    }

    $this->info("Repair complete. {$totalChanged} task(s) updated.");

    return $invalidStatuses->isEmpty() ? self::SUCCESS : self::FAILURE;
})->purpose('Repair legacy task statuses after the pending/cancelled status migration');
