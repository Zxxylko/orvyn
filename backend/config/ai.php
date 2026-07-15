<?php

return [
    'provider' => env('AI_PROVIDER', 'ollama'),

    'ollama' => [
        'base_url' => rtrim(env('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'), '/'),
        'model' => env('OLLAMA_MODEL', 'qwen3:4b'),
        'embedding_model' => env('OLLAMA_EMBEDDING_MODEL', 'nomic-embed-text'),
        'timeout' => (int) env('OLLAMA_TIMEOUT', 60),
    ],

    /*
    |--------------------------------------------------------------------------
    | AI Service Configuration
    |--------------------------------------------------------------------------
    |
    | Configuration for AI services (Gemini, Claude, OpenClaw)
    |
    */

    'gemini' => [
        'api_key' => env('GEMINI_API_KEY'),
        'base_url' => 'https://generativelanguage.googleapis.com/v1beta',
        'models' => [
            'flash' => 'gemini-2.5-flash',
            'embedding' => 'text-embedding-004',
        ],
        'timeout' => 30,
    ],

    'claude' => [
        'api_key' => env('CLAUDE_API_KEY'),
        'base_url' => 'https://api.anthropic.com/v1',
        'model' => 'claude-3-5-sonnet-20241022',
        'timeout' => 30,
    ],

    'openclaw' => [
        'enabled' => env('OPENCLAW_ENABLED', false),
        'host' => env('OPENCLAW_HOST', 'http://localhost:3000'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Fallback Configuration
    |--------------------------------------------------------------------------
    |
    | Enable fallback to regex-based parsing when AI services are unavailable
    |
    */

    'enable_fallback' => env('AI_ENABLE_FALLBACK', true),
];
