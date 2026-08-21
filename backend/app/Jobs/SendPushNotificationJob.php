<?php

namespace App\Jobs;

use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Notifications\ExpoPushGateway;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use RuntimeException;

class SendPushNotificationJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public array $backoff = [30, 120, 300];

    public int $uniqueFor = 3600;

    /**
     * @param  array<string, mixed>  $data
     */
    public function __construct(
        public string $userId,
        public string $type,
        public string $title,
        public string $body,
        public string $dedupeKey,
        public array $data = [],
    ) {}

    public function uniqueId(): string
    {
        return $this->dedupeKey;
    }

    public function handle(ExpoPushGateway $gateway): void
    {
        $user = User::find($this->userId);
        if (! $user) {
            return;
        }

        $delivery = NotificationDelivery::firstOrCreate(
            ['dedupe_key' => $this->dedupeKey],
            [
                'user_id' => $user->id,
                'channel' => 'push',
                'type' => $this->type,
                'payload' => [
                    'title' => $this->title,
                    'body' => $this->body,
                    'data' => $this->data,
                ],
                'status' => 'queued',
            ],
        );

        if ($delivery->status === 'sent') {
            return;
        }

        $tokens = $user->devicePushTokens()->where('enabled', true)->get();
        if ($tokens->isEmpty()) {
            $delivery->update([
                'status' => 'skipped',
                'error' => 'No active push tokens.',
            ]);

            return;
        }

        try {
            $delivery->update([
                'status' => 'sending',
                'attempts' => $delivery->attempts + 1,
                'error' => null,
            ]);

            $messages = $tokens->map(fn ($token) => [
                'to' => $token->token,
                'title' => $this->title,
                'body' => $this->body,
                'data' => $this->data,
                'sound' => 'default',
                'channelId' => 'orvyn-reminders',
                'priority' => 'high',
            ])->all();

            $tickets = $gateway->send($messages);
            $successCount = 0;
            $providerId = null;
            $errors = [];

            foreach ($tokens->values() as $index => $token) {
                $ticket = $tickets[$index] ?? [];
                if (data_get($ticket, 'status') === 'ok') {
                    $successCount++;
                    $providerId ??= data_get($ticket, 'id');
                    $token->update(['last_error' => null]);

                    continue;
                }

                $message = (string) (data_get($ticket, 'message') ?: 'Unknown Expo push error.');
                $errorCode = (string) data_get($ticket, 'details.error');
                $token->update([
                    'enabled' => $errorCode !== 'DeviceNotRegistered',
                    'last_error' => mb_substr(trim($errorCode.' '.$message), 0, 2000),
                ]);
                $errors[] = trim($errorCode.' '.$message);
            }

            if ($successCount === 0) {
                throw new RuntimeException(implode('; ', array_unique($errors)) ?: 'Expo rejected every push token.');
            }

            $delivery->update([
                'status' => 'sent',
                'provider_message_id' => $providerId,
                'sent_at' => now(),
                'failed_at' => null,
                'error' => $errors === [] ? null : mb_substr(implode('; ', array_unique($errors)), 0, 2000),
            ]);
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
