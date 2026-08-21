<?php

return [
    'driver' => env('WHATSAPP_DRIVER', 'baileys'),
    'baileys_production_acknowledged' => env('WHATSAPP_BAILEYS_PRODUCTION_ACKNOWLEDGED', false),
    'base_url' => rtrim(env('WHATSAPP_SERVICE_URL', 'http://127.0.0.1:3100'), '/'),
    'service_token' => env('WHATSAPP_SERVICE_TOKEN'),
    'webhook_secret' => env('WHATSAPP_WEBHOOK_SECRET'),
    'webhook_max_age_seconds' => (int) env('WHATSAPP_WEBHOOK_MAX_AGE_SECONDS', 300),
    'session_admin_emails' => array_values(array_filter(array_map(
        'trim',
        explode(',', strtolower((string) env('WHATSAPP_SESSION_ADMIN_EMAILS', ''))),
    ))),
    'verification_ttl_minutes' => (int) env('WHATSAPP_VERIFICATION_TTL_MINUTES', 10),
    'verification_max_attempts' => (int) env('WHATSAPP_VERIFICATION_MAX_ATTEMPTS', 5),
    'timeout' => (int) env('WHATSAPP_TIMEOUT', 10),
    'default_timezone' => env('WHATSAPP_DEFAULT_TIMEZONE', 'Asia/Jakarta'),
    'default_briefing_time' => env('WHATSAPP_DEFAULT_BRIEFING_TIME', '07:00'),
    'default_reminder_lead_minutes' => (int) env('WHATSAPP_DEFAULT_REMINDER_LEAD_MINUTES', 180),
];
