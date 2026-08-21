<?php

namespace App\Console\Commands;

use App\Support\ProductionReadiness;
use Illuminate\Console\Command;

class CheckProductionReadiness extends Command
{
    protected $signature = 'orvyn:production-check';

    protected $description = 'Fail when the effective production configuration is unsafe';

    public function handle(ProductionReadiness $readiness): int
    {
        $errors = $readiness->errors();
        if ($errors !== []) {
            $this->error('Production configuration is not ready.');
            foreach ($errors as $error) {
                $this->line(" - {$error}");
            }

            return self::FAILURE;
        }

        $this->info('Production configuration passed all enforced security checks.');

        return self::SUCCESS;
    }
}
