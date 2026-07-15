<?php

namespace App\Services\AI;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OllamaService
{
    public function parseTask(string $input): ?array
    {
        $schema = [
            'type' => 'object',
            'properties' => [
                'title' => ['type' => 'string'],
                'description' => ['type' => ['string', 'null']],
                'deadline' => ['type' => ['string', 'null']],
                'priority' => ['type' => 'string', 'enum' => ['low', 'medium', 'high', 'critical']],
                'duration_minutes' => ['type' => 'integer'],
                'difficulty' => ['type' => 'integer'],
                'category' => ['type' => 'string'],
                'tags' => ['type' => 'array', 'items' => ['type' => 'string']],
            ],
            'required' => ['title', 'priority', 'duration_minutes', 'difficulty', 'category', 'tags'],
        ];

        $data = $this->structured(
            'Kamu adalah task parser ORVYN. Ubah pesan menjadi data tugas yang ringkas. Gunakan ISO 8601 untuk deadline. Hari ini '.now()->toIso8601String().'.',
            $input,
            $schema,
        );

        if (! $data) {
            return null;
        }

        $deadline = null;
        if (is_string($data['deadline'] ?? null) && trim($data['deadline']) !== '') {
            try {
                $deadline = Carbon::parse($data['deadline'])->toIso8601String();
            } catch (\Throwable) {
                $deadline = null;
            }
        }

        return [
            'title' => trim((string) ($data['title'] ?? $input)) ?: $input,
            'description' => $data['description'] ?? null,
            'deadline' => $deadline,
            'status' => 'pending',
            'priority' => in_array($data['priority'] ?? null, ['low', 'medium', 'high', 'critical'], true) ? $data['priority'] : 'medium',
            'duration_minutes' => max(1, min(1440, (int) ($data['duration_minutes'] ?? 60))),
            'difficulty' => max(1, min(5, (int) ($data['difficulty'] ?? 3))),
            'category' => trim((string) ($data['category'] ?? 'theory')) ?: 'theory',
            'tags' => array_slice(array_values(array_filter($data['tags'] ?? [], 'is_string')), 0, 12),
            'ai_processed' => true,
        ];
    }

    public function generateBriefing(User $user, array $context): ?array
    {
        $schema = [
            'type' => 'object',
            'properties' => [
                'summary' => ['type' => 'string'],
                'health_metrics' => [
                    'type' => 'object',
                    'properties' => [
                        'burnout_risk' => ['type' => 'string', 'enum' => ['low', 'medium', 'high']],
                        'workload_balance' => ['type' => 'string', 'enum' => ['underloaded', 'balanced', 'overloaded']],
                        'stress_level' => ['type' => 'number'],
                        'cognitive_load' => ['type' => 'number'],
                    ],
                    'required' => ['burnout_risk', 'workload_balance', 'stress_level'],
                ],
                'recommended_adjustments' => ['type' => 'array', 'items' => ['type' => 'string']],
            ],
            'required' => ['summary', 'health_metrics', 'recommended_adjustments'],
        ];

        $data = $this->structured(
            "Kamu adalah productivity coach ORVYN untuk {$user->name}. Jawab ringkas dalam Bahasa Indonesia, empatik, dan action-oriented.",
            'Buat briefing harian dari konteks berikut: '.json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $schema,
        );

        if (! $data) {
            return null;
        }

        $summary = trim((string) ($data['summary'] ?? ''));
        if ($summary === '') {
            return null;
        }

        $metrics = is_array($data['health_metrics'] ?? null) ? $data['health_metrics'] : [];
        $active = (int) ($context['tasks_count'] ?? 0);
        $overdue = (int) ($context['overdue_count'] ?? 0);
        $fallbackRisk = $active > 15 || $overdue > 5 ? 'high' : ($active > 10 || $overdue > 2 ? 'medium' : 'low');
        $fallbackBalance = $active > 12 ? 'overloaded' : ($active < 3 ? 'underloaded' : 'balanced');

        return [
            'summary' => $summary,
            'health_metrics' => [
                'burnout_risk' => in_array($metrics['burnout_risk'] ?? null, ['low', 'medium', 'high'], true) ? $metrics['burnout_risk'] : $fallbackRisk,
                'workload_balance' => in_array($metrics['workload_balance'] ?? null, ['underloaded', 'balanced', 'overloaded'], true) ? $metrics['workload_balance'] : $fallbackBalance,
                'stress_level' => max(1, min(10, (float) ($metrics['stress_level'] ?? 3))),
                'cognitive_load' => max(0, min(18, (float) ($metrics['cognitive_load'] ?? min(18, $active + ($overdue * 2))))),
            ],
            'recommended_adjustments' => array_slice(array_values(array_filter($data['recommended_adjustments'] ?? [], 'is_string')), 0, 4),
        ];
    }

    public function interpretWhatsApp(string $message, array $context = []): ?array
    {
        $actions = [
            'create_task', 'list_tasks', 'show_schedule', 'complete_task', 'snooze_task',
            'progress_update', 'log_expense', 'check_habit', 'log_health', 'weekly_review',
            'burnout_check', 'ask_assistant', 'help',
        ];
        $schema = [
            'type' => 'object',
            'properties' => [
                'action' => ['type' => 'string', 'enum' => $actions],
                'target' => ['type' => ['string', 'null']],
                'value' => ['type' => ['number', 'null']],
                'unit' => ['type' => ['string', 'null']],
                'date' => ['type' => ['string', 'null']],
                'category' => ['type' => ['string', 'null']],
                'confidence' => ['type' => 'number'],
            ],
            'required' => ['action', 'confidence'],
        ];

        return $this->structured(
            'Kamu adalah intent router WhatsApp ORVYN. Pilih tepat satu aksi. Jangan mengarang ID atau data. Pesan natural yang meminta pencatatan pekerjaan adalah create_task.',
            "Pesan: {$message}\nKonteks: ".json_encode($context, JSON_UNESCAPED_UNICODE),
            $schema,
        );
    }

    public function answer(string $question, array $context): ?string
    {
        $response = $this->request([
            'model' => config('ai.ollama.model'),
            'stream' => false,
            'messages' => [
                ['role' => 'system', 'content' => 'Kamu adalah asisten ORVYN. Jawab Bahasa Indonesia maksimal 700 karakter. Gunakan hanya konteks yang diberikan dan jangan mengklaim telah melakukan aksi.'],
                ['role' => 'user', 'content' => "Pertanyaan: {$question}\nKonteks: ".json_encode($context, JSON_UNESCAPED_UNICODE)],
            ],
            'options' => ['temperature' => 0.2],
        ]);

        $content = trim((string) data_get($response, 'message.content', ''));

        return $content !== '' ? $content : null;
    }

    public function generateEmbedding(string $text): ?array
    {
        try {
            $response = Http::timeout((int) config('ai.ollama.timeout', 60))
                ->post(config('ai.ollama.base_url').'/api/embed', [
                    'model' => config('ai.ollama.embedding_model'),
                    'input' => $text,
                ]);

            if (! $response->successful()) {
                return null;
            }

            $embedding = $response->json('embeddings.0');

            return is_array($embedding) && count($embedding) === 768 ? $embedding : null;
        } catch (\Throwable $exception) {
            Log::notice('Ollama embedding unavailable', ['error' => $exception->getMessage()]);

            return null;
        }
    }

    public function health(): array
    {
        try {
            $response = Http::timeout(3)->get(config('ai.ollama.base_url').'/api/tags');

            return [
                'provider' => 'ollama',
                'online' => $response->successful(),
                'model' => config('ai.ollama.model'),
            ];
        } catch (\Throwable) {
            return ['provider' => 'ollama', 'online' => false, 'model' => config('ai.ollama.model')];
        }
    }

    private function structured(string $system, string $prompt, array $schema): ?array
    {
        $response = $this->request([
            'model' => config('ai.ollama.model'),
            'stream' => false,
            'format' => $schema,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $prompt],
            ],
            'options' => ['temperature' => 0.1],
        ]);

        $content = data_get($response, 'message.content');
        if (! is_string($content)) {
            return null;
        }

        $decoded = json_decode($content, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function request(array $payload): ?array
    {
        try {
            $response = Http::timeout((int) config('ai.ollama.timeout', 60))
                ->post(config('ai.ollama.base_url').'/api/chat', $payload);

            if (! $response->successful()) {
                Log::notice('Ollama request failed', ['status' => $response->status()]);

                return null;
            }

            return $response->json();
        } catch (\Throwable $exception) {
            Log::notice('Ollama unavailable; using ORVYN fallback', ['error' => $exception->getMessage()]);

            return null;
        }
    }
}
