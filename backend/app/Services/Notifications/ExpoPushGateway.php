<?php

namespace App\Services\Notifications;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class ExpoPushGateway
{
    /**
     * @param  array<int, array<string, mixed>>  $messages
     * @return array<int, array<string, mixed>>
     */
    public function send(array $messages): array
    {
        if (! config('services.expo_push.enabled')) {
            throw new RuntimeException('Expo push delivery is disabled.');
        }

        if ($messages === []) {
            return [];
        }

        $tickets = [];
        foreach (array_chunk($messages, 100) as $chunk) {
            $response = $this->request()->post(
                (string) config('services.expo_push.url'),
                $chunk,
            );

            if (! $response->successful()) {
                throw new RuntimeException(
                    'Expo push service rejected the request (HTTP '.$response->status().').',
                );
            }

            $data = $response->json('data');
            if (! is_array($data)) {
                throw new RuntimeException('Expo push service returned an invalid response.');
            }

            $tickets = [...$tickets, ...$data];
        }

        return $tickets;
    }

    private function request(): PendingRequest
    {
        $request = Http::acceptJson()
            ->asJson()
            ->timeout((int) config('services.expo_push.timeout', 15))
            ->retry(2, 500, throw: false);

        $accessToken = config('services.expo_push.access_token');

        return filled($accessToken)
            ? $request->withToken((string) $accessToken)
            : $request;
    }
}
