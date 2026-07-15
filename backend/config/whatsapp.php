<?php

return [
    'driver' => env('WHATSAPP_DRIVER', 'baileys'),
    'base_url' => rtrim(env('WHATSAPP_SERVICE_URL', 'http://127.0.0.1:3100'), '/'),
    'service_token' => env('WHATSAPP_SERVICE_TOKEN'),
    'webhook_secret' => env('WHATSAPP_WEBHOOK_SECRET'),
    'timeout' => (int) env('WHATSAPP_TIMEOUT', 10),
    'default_timezone' => env('WHATSAPP_DEFAULT_TIMEZONE', 'Asia/Jakarta'),
    'default_briefing_time' => env('WHATSAPP_DEFAULT_BRIEFING_TIME', '07:00'),
    'default_reminder_lead_minutes' => (int) env('WHATSAPP_DEFAULT_REMINDER_LEAD_MINUTES', 180),
];
