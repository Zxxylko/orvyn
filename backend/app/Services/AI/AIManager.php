<?php

namespace App\Services\AI;

use App\Models\User;

class AIManager
{
    public function __construct(
        private OllamaService $ollama,
        private GeminiService $gemini,
    ) {}

    public function parseTask(string $input, ?User $user = null): array
    {
        if ($this->usesOllama()) {
            $parsed = $this->ollama->parseTask($input);
            if ($parsed !== null) {
                return $parsed;
            }

            return $this->cloudFallbackEnabled() && $this->cloudProcessingAllowed($user)
                ? $this->gemini->parseTask($input)
                : $this->gemini->deterministicTaskFallback($input);
        }

        return $this->cloudProcessingAllowed($user)
            ? $this->gemini->parseTask($input)
            : $this->gemini->deterministicTaskFallback($input);
    }

    public function generateBriefing(User $user, array $context): array
    {
        if ($this->usesOllama()) {
            $briefing = $this->ollama->generateBriefing($user, $context);
            if ($briefing !== null) {
                return $briefing;
            }

            return $this->cloudFallbackEnabled() && $this->cloudProcessingAllowed($user)
                ? $this->gemini->generateBriefing($user, $context)
                : $this->gemini->deterministicBriefingFallback($context);
        }

        return $this->cloudProcessingAllowed($user)
            ? $this->gemini->generateBriefing($user, $context)
            : $this->gemini->deterministicBriefingFallback($context);
    }

    public function generateEmbedding(string $text, ?User $user = null): ?array
    {
        if ($this->usesOllama()) {
            $embedding = $this->ollama->generateEmbedding($text);

            return $embedding ?? ($this->cloudFallbackEnabled() && $this->cloudProcessingAllowed($user)
                ? $this->gemini->generateEmbedding($text)
                : null);
        }

        return $this->cloudProcessingAllowed($user)
            ? $this->gemini->generateEmbedding($text)
            : null;
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

    private function cloudFallbackEnabled(): bool
    {
        return (bool) config('ai.cloud_fallback_enabled', false);
    }

    private function cloudProcessingAllowed(?User $user): bool
    {
        if (! config('ai.cloud_requires_user_consent', true)) {
            return true;
        }

        return $user?->allowsCloudAI() ?? false;
    }
}
