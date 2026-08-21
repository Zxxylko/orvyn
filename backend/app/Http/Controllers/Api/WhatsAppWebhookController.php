<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationDelivery;
use App\Models\WhatsAppConnection;
use App\Services\WhatsApp\WhatsAppAssistantService;
use Illuminate\Http\Request;

class WhatsAppWebhookController extends Controller
{
    public function inbound(Request $request, WhatsAppAssistantService $assistant)
    {
        $secret = (string) config('whatsapp.webhook_secret');
        $signature = (string) $request->header('X-Orvyn-Signature');
        $timestamp = (string) $request->header('X-Orvyn-Timestamp');
        $maxAge = max(30, (int) config('whatsapp.webhook_max_age_seconds', 300));
        $timestampValue = ctype_digit($timestamp) ? (int) $timestamp : 0;
        $isFresh = $timestampValue > 0 && abs(now()->timestamp - $timestampValue) <= $maxAge;
        $expected = hash_hmac('sha256', $timestamp.'.'.$request->getContent(), $secret);

        if ($secret === '' || ! $isFresh || ! hash_equals($expected, $signature)) {
            abort(401, 'Invalid webhook signature.');
        }

        $validated = $request->validate([
            'message_id' => 'required|string|max:190',
            'phone' => 'required|string|max:32',
            'message' => 'required|string|max:2000',
            'received_at' => 'nullable|date',
        ]);
        $phone = WhatsAppConnection::normalizePhone($validated['phone']);
        $connection = WhatsAppConnection::with('user')
            ->where('phone_number', $phone)
            ->where('enabled', true)
            ->whereNotNull('phone_verified_at')
            ->first();
        if (! $connection) {
            return response()->json(['reply' => null, 'ignored' => true]);
        }

        $dedupeKey = 'wa:inbound:'.$validated['message_id'];
        $delivery = NotificationDelivery::firstOrCreate(
            ['dedupe_key' => $dedupeKey],
            [
                'user_id' => $connection->user_id,
                'channel' => 'whatsapp',
                'type' => 'inbound',
                'recipient' => $phone,
                'payload' => ['message' => $validated['message']],
                'status' => 'received',
            ],
        );
        if (! $delivery->wasRecentlyCreated) {
            return response()->json(['reply' => null, 'duplicate' => true]);
        }
        $connection->update(['last_inbound_at' => now()]);

        return response()->json(['reply' => $assistant->handle($connection->user, $validated['message'])]);
    }
}
