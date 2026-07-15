<?php

namespace App\Services\WhatsApp;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class WhatsAppGateway
{
    public function send(string $phone, string $message): array
    {
        $response = $this->client()->post($this->url('/messages'), [
            'phone' => $phone,
            'message' => $message,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('WhatsApp service rejected the message (HTTP '.$response->status().').');
        }

        return $response->json();
    }

    public function status(): array
    {
        if (! $this->configured()) {
            return ['online' => false, 'connected' => false, 'status' => 'not_configured', 'qr' => null];
        }

        try {
            $response = $this->client(3)->get($this->url('/session'));

            return $response->successful()
                ? ['online' => true, ...$response->json()]
                : ['online' => false, 'connected' => false, 'status' => 'unavailable', 'qr' => null];
        } catch (\Throwable) {
            return ['online' => false, 'connected' => false, 'status' => 'unavailable', 'qr' => null];
        }
    }

    public function connect(): array
    {
        $response = $this->client()->post($this->url('/session/connect'));
        if (! $response->successful()) {
            throw new RuntimeException('Tidak dapat memulai sesi WhatsApp.');
        }

        return $response->json();
    }

    public function configured(): bool
    {
        return filled(config('whatsapp.base_url')) && filled(config('whatsapp.service_token'));
    }

    private function client(?int $timeout = null): PendingRequest
    {
        if (! $this->configured()) {
            throw new RuntimeException('WhatsApp service belum dikonfigurasi.');
        }

        return Http::acceptJson()
            ->asJson()
            ->withToken((string) config('whatsapp.service_token'))
            ->timeout($timeout ?? (int) config('whatsapp.timeout', 10));
    }

    private function url(string $path): string
    {
        return config('whatsapp.base_url').$path;
    }
}
