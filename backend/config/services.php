<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'demo_login' => [
        'enabled' => env('DEMO_LOGIN_ENABLED', false),
    ],

    'auth_tokens' => [
        'expiration_minutes' => env('ORVYN_TOKEN_EXPIRATION_MINUTES', 60 * 24 * 30),
    ],

    'firebase' => [
        'credentials' => env('FIREBASE_CREDENTIALS'),
        'project_id' => env('FIREBASE_PROJECT_ID'),
        'required_in_production' => env('FIREBASE_AUTH_REQUIRED', true),
        'reauthentication_max_age_seconds' => (int) env('FIREBASE_REAUTH_MAX_AGE_SECONDS', 300),
    ],

    'expo_push' => [
        'enabled' => env('EXPO_PUSH_ENABLED', true),
        'url' => env('EXPO_PUSH_URL', 'https://exp.host/--/api/v2/push/send'),
        'access_token' => env('EXPO_ACCESS_TOKEN'),
        'timeout' => (int) env('EXPO_PUSH_TIMEOUT', 15),
    ],

];
