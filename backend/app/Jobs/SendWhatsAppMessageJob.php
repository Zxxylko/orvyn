<?php

namespace App\Jobs;

use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\WhatsApp\WhatsAppGateway;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendWhatsAppMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public array $backoff = [30, 120, 300];

    public function __construct(
        public string $userId,
        public string $type,
        public string $message,
        public string $dedupeKey,
        public array $metadata = [],
    ) {}

    public function handle(WhatsAppGateway $gateway): void
    {
        $user = User::find($this->userId);
        $connection = $user?->whatsappConnection;
        if (! $user || ! $connection?->enabled || ! $connection->phone_number) {
            return;
        }

        $delivery = NotificationDelivery::firstOrCreate(
            ['dedupe_key' => $this->dedupeKey],
            [
                'user_id' => $user->id,
                'channel' => 'whatsapp',
                'type' => $this->type,
                'recipient' => $connection->phone_number,
                'payload' => ['message' => $this->message, ...$this->metadata],
                'status' => 'queued',
            ],
        );

        if ($delivery->status === 'sent') {
            return;
        }

        try {
            $delivery->update(['status' => 'sending', 'attempts' => $delivery->attempts + 1, 'error' => null]);
            $result = $gateway->send($connection->phone_number, $this->message);
            $delivery->update([
                'status' => 'sent',
                'provider_message_id' => data_get($result, 'id'),
                'sent_at' => now(),
                'failed_at' => null,
            ]);
            $connection->update(['last_outbound_at' => now()]);
        } catch (\Throwable $exception) {
            $delivery->update([
                'status' => 'failed',
                'failed_at' => now(),
                'error' => mb_substr($exception->getMessage(), 0, 2000),
            ]);
            throw $exception;
        }
    }
}
