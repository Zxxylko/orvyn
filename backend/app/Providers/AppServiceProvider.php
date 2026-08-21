<?php

namespace App\Providers;

use App\Support\ProductionReadiness;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if ($this->app->environment('production')) {
            URL::forceScheme('https');

            if (config('security.production_readiness_enforced', true)) {
                $this->app->make(ProductionReadiness::class)->assertSecure();
            }
        }
    }
}
