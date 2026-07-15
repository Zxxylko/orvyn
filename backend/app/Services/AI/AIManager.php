<?php

namespace App\Services\AI;

use App\Models\User;

class AIManager
{
    public function __construct(
        private OllamaService $ollama,
        private GeminiService $gemini,
    ) {}

    public function parseTask(string $input): array
    {
        if ($this->usesOllama()) {
            return $this->ollama->parseTask($input) ?? $this->gemini->parseTask($input);
        }

        return $this->gemini->parseTask($input);
    }

    public function generateBriefing(User $user, array $context): array
    {
        if ($this->usesOllama()) {
            return $this->ollama->generateBriefing($user, $context) ?? $this->gemini->generateBriefing($user, $context);
        }

        return $this->gemini->generateBriefing($user, $context);
    }

    public function generateEmbedding(string $text): ?array
    {
        if ($this->usesOllama()) {
            return $this->ollama->generateEmbedding($text) ?? $this->gemini->generateEmbedding($text);
        }

        return $this->gemini->generateEmbedding($text);
    }

    public function interpretWhatsApp(string $message, array $context = []): ?array
    {
        return $this->usesOllama() ? $this->ollama->interpretWhatsApp($message, $context) : null;
    }

    public function answer(string $question, array $context): ?string
    {
        return $this->usesOllama() ? $this->ollama->answer($question, $context) : null;
    }

    public function health(): array
    {
        if ($this->usesOllama()) {
            return $this->ollama->health();
        }

        return [
            'provider' => 'gemini',
            'online' => filled(config('ai.gemini.api_key')),
            'model' => config('ai.gemini.models.flash'),
        ];
    }

    private function usesOllama(): bool
    {
        return config('ai.provider', 'ollama') === 'ollama';
    }
}
