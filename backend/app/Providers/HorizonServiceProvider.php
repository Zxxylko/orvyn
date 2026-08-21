<?php

namespace App\Providers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Laravel\Horizon\Horizon;
use Laravel\Horizon\HorizonApplicationServiceProvider;

class HorizonServiceProvider extends HorizonApplicationServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        parent::boot();

        // Horizon::routeSmsNotificationsTo('15556667777');
        // Horizon::routeMailNotificationsTo('example@example.com');
        // Horizon::routeSlackNotificationsTo('slack-webhook-url', '#channel');
    }

    /**
     * Register the Horizon gate.
     *
     * This gate determines who can access Horizon in non-local environments.
     */
    protected function gate(): void
    {
        Gate::define('viewHorizon', function ($user = null) {
            return $user && in_array($user->email, config('horizon.admin_emails', []), true);
        });
    }

    /**
     * Never bypass authorization merely because APP_ENV is local. A local
     * server may still be reachable from an untrusted Wi-Fi network.
     */
    protected function authorization(): void
    {
        $this->gate();

        Horizon::auth(function (Request $request): bool {
            if (! config('horizon.dashboard_enabled', false)) {
                return false;
            }

            return Gate::check('viewHorizon', [$request->user()]);
        });
    }
}
