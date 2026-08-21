<?php

namespace App\Services\AI;

use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiService
{
    private string $apiKey;

    private string $baseUrl;

    private array $models;

    public function __construct()
    {
        $this->apiKey = (string) config('ai.gemini.api_key', '');
        $this->baseUrl = (string) config('ai.gemini.base_url', 'https://generativelanguage.googleapis.com/v1beta');
        $this->models = config('ai.gemini.models', []);
    }

    /**
     * Parse natural language input into structured task data
     */
    public function parseTask(string $input): array
    {
        if (empty($this->apiKey)) {
            return $this->fallbackParse($input);
        }

        try {
            $prompt = $this->buildTaskParsePrompt($input);

            $response = $this->client()
                ->post("{$this->baseUrl}/models/{$this->models['flash']}:generateContent", [
                    'contents' => [
                        [
                            'parts' => [
                                ['text' => $prompt],
                            ],
                        ],
                    ],
                    'generationConfig' => [
                        'temperature' => 0.1,
                        'topK' => 1,
                        'topP' => 1,
                        'maxOutputTokens' => 1024,
                    ],
                ]);

            if ($response->successful()) {
                $result = $response->json();
                $text = $result['candidates'][0]['content']['parts'][0]['text'] ?? '';

                // Extract JSON from markdown code blocks if present
                if (preg_match('/```json\s*(.*?)\s*```/s', $text, $matches)) {
                    $text = $matches[1];
                } elseif (preg_match('/```\s*(.*?)\s*```/s', $text, $matches)) {
                    $text = $matches[1];
                }

                $parsed = json_decode($text, true);

                if (json_last_error() === JSON_ERROR_NONE) {
                    return $this->normalizeTaskData($parsed);
                }
            }

            Log::warning('Gemini API failed, using fallback parser', [
                'status' => $response->status(),
            ]);

            return $this->fallbackParse($input);

        } catch (\Throwable $exception) {
            $this->logException('task parsing', $exception);

            return $this->fallbackParse($input);
        }
    }

    /**
     * Generate embedding vector for text
     */
    public function generateEmbedding(string $text): ?array
    {
        if (empty($this->apiKey)) {
            return null;
        }

        try {
            $response = $this->client()
                ->post("{$this->baseUrl}/models/{$this->models['embedding']}:embedContent", [
                    'model' => "models/{$this->models['embedding']}",
                    'content' => [
                        'parts' => [
                            ['text' => $text],
                        ],
                    ],
                ]);

            if ($response->successful()) {
                $result = $response->json();

                return $result['embedding']['values'] ?? null;
            }

            return null;

        } catch (\Throwable $exception) {
            $this->logException('embedding', $exception);

            return null;
        }
    }

    /**
     * Generate daily briefing for a user
     */
    public function generateBriefing(User $user, array $context): array
    {
        if (empty($this->apiKey)) {
            return $this->fallbackBriefing($context);
        }

        try {
            $prompt = $this->buildBriefingPrompt($user, $context);

            $response = $this->client()
                ->post("{$this->baseUrl}/models/{$this->models['flash']}:generateContent", [
                    'contents' => [
                        [
                            'parts' => [
                                ['text' => $prompt],
                            ],
                        ],
                    ],
                    'generationConfig' => [
                        'temperature' => 0.2,
                        'topK' => 1,
                        'topP' => 1,
                        'maxOutputTokens' => 1024,
                        'responseMimeType' => 'application/json',
                    ],
                ]);

            if ($response->successful()) {
                $result = $response->json();
                $text = $result['candidates'][0]['content']['parts'][0]['text'] ?? '';

                // Try to parse JSON response
                if (preg_match('/```json\s*(.*?)\s*```/s', $text, $matches)) {
                    $text = $matches[1];
                }

                $parsed = json_decode($text, true);

                if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
                    return $this->normalizeBriefingData($parsed, $context);
                }

                // If not JSON, treat as plain text summary
                return [
                    'summary' => trim($text) !== '' ? trim($text) : $this->fallbackBriefing($context)['summary'],
                    'health_metrics' => $this->calculateHealthMetrics($context),
                    'recommended_adjustments' => [],
                ];
            }

            Log::warning('Gemini API failed to generate briefing, using fallback', [
                'status' => $response->status(),
            ]);

            return $this->fallbackBriefing($context);

        } catch (\Throwable $exception) {
            $this->logException('briefing', $exception);

            return $this->fallbackBriefing($context);
        }
    }

    /**
     * Build the briefing prompt
     */
    private function buildBriefingPrompt(User $user, array $context): string
    {
        $tasksCount = $context['tasks_count'] ?? 0;
        $overdueCount = $context['overdue_count'] ?? 0;
        $upcomingDeadlines = $context['upcoming_deadlines'] ?? [];
        $todaySchedule = $context['today_schedule'] ?? [];
        $academicDeadlines = $context['academic_deadlines'] ?? [];
        $completionRate = $context['completion_rate'] ?? 0;
        $avgDifficulty = $context['avg_difficulty'] ?? 3;

        $deadlinesList = collect($upcomingDeadlines)
            ->map(fn ($task) => "- {$task['title']} (due {$task['deadline']})")
            ->join("\n");
        $scheduleList = collect($todaySchedule)
            ->map(fn ($block) => "- {$block['start']}-{$block['end']}: {$block['label']} ({$block['type']})")
            ->join("\n");
        $academicList = collect($academicDeadlines)
            ->map(fn ($task) => "- [{$task['course']}] {$task['title']} / {$task['type']} (due {$task['deadline']})")
            ->join("\n");

        return <<<PROMPT
You are an AI productivity coach for a student using ORVYN.

Generate a daily briefing based on their current workload:

**Current Status:**
- Active tasks: {$tasksCount}
- Overdue tasks: {$overdueCount}
- Completion rate (7 days): {$completionRate}%
- Average task difficulty: {$avgDifficulty}/5

**Upcoming Deadlines:**
{$deadlinesList}

**Today's Schedule:**
{$scheduleList}

**Academic LMS Deadlines (7 days):**
{$academicList}

Provide a brief, actionable daily briefing in JSON format:
{
  "summary": "2-3 sentence overview of their day and priorities",
  "health_metrics": {
    "burnout_risk": "low|medium|high",
    "workload_balance": "underloaded|balanced|overloaded",
    "stress_level": 1-10
  },
  "recommended_adjustments": [
    "specific actionable recommendation 1",
    "specific actionable recommendation 2"
  ]
}

Be encouraging but realistic. Focus on what matters most today.
PROMPT;
    }

    /**
     * Calculate health metrics from context
     */
    private function calculateHealthMetrics(array $context): array
    {
        $tasksCount = $context['tasks_count'] ?? 0;
        $overdueCount = $context['overdue_count'] ?? 0;
        $avgDifficulty = $context['avg_difficulty'] ?? 3;

        $burnoutRisk = 'low';
        if ($tasksCount > 15 || $overdueCount > 5) {
            $burnoutRisk = 'high';
        } elseif ($tasksCount > 10 || $overdueCount > 2) {
            $burnoutRisk = 'medium';
        }

        $workloadBalance = 'balanced';
        if ($tasksCount > 12) {
            $workloadBalance = 'overloaded';
        } elseif ($tasksCount < 3) {
            $workloadBalance = 'underloaded';
        }

        $stressLevel = min(10, ($tasksCount * 0.5) + ($overdueCount * 1.5) + ($avgDifficulty * 0.5));

        return [
            'burnout_risk' => $burnoutRisk,
            'workload_balance' => $workloadBalance,
            'stress_level' => round($stressLevel, 1),
            'cognitive_load' => round(min(18, ($tasksCount * 0.75) + ($overdueCount * 2) + $avgDifficulty), 1),
        ];
    }

    /**
     * Normalize model output so the UI always receives the expected shape.
     */
    private function normalizeBriefingData(array $data, array $context): array
    {
        $fallback = $this->fallbackBriefing($context);
        $summary = $data['summary'] ?? $fallback['summary'];
        if (is_array($summary)) {
            $summary = implode("\n\n", array_filter($summary, 'is_scalar'));
        }

        $metrics = is_array($data['health_metrics'] ?? null)
            ? $data['health_metrics']
            : [];

        $calculatedMetrics = $this->calculateHealthMetrics($context);
        $burnoutRisk = $metrics['burnout_risk'] ?? $calculatedMetrics['burnout_risk'];
        if (! in_array($burnoutRisk, ['low', 'medium', 'high'], true)) {
            $burnoutRisk = $calculatedMetrics['burnout_risk'];
        }

        $workloadBalance = $metrics['workload_balance'] ?? $calculatedMetrics['workload_balance'];
        if (! in_array($workloadBalance, ['underloaded', 'balanced', 'overloaded'], true)) {
            $workloadBalance = $calculatedMetrics['workload_balance'];
        }

        $stressLevel = $metrics['stress_level'] ?? $calculatedMetrics['stress_level'];
        $stressLevel = is_numeric($stressLevel) ? max(1, min(10, (float) $stressLevel)) : $calculatedMetrics['stress_level'];

        $cognitiveLoad = $metrics['cognitive_load'] ?? $calculatedMetrics['cognitive_load'];
        $cognitiveLoad = is_numeric($cognitiveLoad) ? max(0, min(18, (float) $cognitiveLoad)) : $calculatedMetrics['cognitive_load'];

        $adjustments = $data['recommended_adjustments'] ?? $fallback['recommended_adjustments'];
        if (! is_array($adjustments)) {
            $adjustments = [$adjustments];
        }

        $adjustments = collect($adjustments)
            ->map(function ($item) {
                if (is_array($item)) {
                    return $item['text'] ?? $item['recommendation'] ?? $item['title'] ?? null;
                }

                return $item;
            })
            ->filter(fn ($item) => is_scalar($item) && trim((string) $item) !== '')
            ->map(fn ($item) => trim((string) $item))
            ->take(4)
            ->values()
            ->all();

        return [
            'summary' => trim((string) $summary) !== '' ? trim((string) $summary) : $fallback['summary'],
            'health_metrics' => [
                'burnout_risk' => $burnoutRisk,
                'workload_balance' => $workloadBalance,
                'stress_level' => round($stressLevel, 1),
                'cognitive_load' => round($cognitiveLoad, 1),
            ],
            'recommended_adjustments' => count($adjustments) > 0 ? $adjustments : $fallback['recommended_adjustments'],
        ];
    }

    /**
     * Fallback briefing when AI is unavailable
     */
    private function fallbackBriefing(array $context): array
    {
        $tasksCount = $context['tasks_count'] ?? 0;
        $overdueCount = $context['overdue_count'] ?? 0;

        $summary = "You have {$tasksCount} active task".($tasksCount === 1 ? '' : 's');
        if ($overdueCount > 0) {
            $summary .= " with {$overdueCount} overdue. Prioritize the overdue work first, then protect one focused block for the next closest deadline.";
        } else {
            $summary .= '. Your workload is manageable today, so use the cleanest focus window for the highest-priority task.';
        }

        return [
            'summary' => $summary,
            'health_metrics' => $this->calculateHealthMetrics($context),
            'recommended_adjustments' => [
                'Review your overdue tasks first',
                'Break large tasks into smaller chunks',
            ],
        ];
    }

    public function deterministicBriefingFallback(array $context): array
    {
        return $this->fallbackBriefing($context);
    }

    /**
     * Build the task parsing prompt
     */
    private function buildTaskParsePrompt(string $input): string
    {
        $nowStr = now()->toDateTimeString();

        return <<<PROMPT
You are a senior task parser for a Computer Science / Informatics student operating system. Parse the following natural language input into structured JSON.

Input: "{$input}"

Extract and return ONLY valid JSON with this exact structure:
{
  "title": "concise task title",
  "description": "optional detailed description or null",
  "deadline": "ISO 8601 datetime or null (infer from relative dates like 'tomorrow', 'Friday', 'next week')",
  "priority": "low|medium|high|critical (default: medium)",
  "duration_minutes": 60,
  "difficulty": 3,
  "category": "coding|theory|admin|personal|health|social|work (default: academics/theory)",
  "tags": ["tag1", "tag2"]
}

Rules for Categories:
- Classify as "coding" if it involves programming, labs, coding, git, web dev, software engineering, databases, databases labs, building, debugging, React, Laravel, Python, C++, etc.
- Classify as "theory" if it involves mathematics, discrete structures, algorithm analysis, complexity proofs, lectures, reading, research, or theoretical assignments.
- Classify as "admin" if it involves academic registration, emails, scheduling, university paperwork, or meetings.
- Fallback to "coding" or "theory" if academic but general.

Rules for Difficulty (1-5 scale):
- 5: Extremely complex, takes high cognitive capacity (e.g. debugging compiler, writing proof from scratch).
- 4: Heavy assignment or lab project.
- 3: Standard workload, average lecture assimilation.
- 2: Short worksheet, basic review, administrative.
- 1: Extremely quick, trivial task (e.g. submit a form, reply to email).

Other Rules:
- If deadline mentions "today", use today's date at 23:59
- If deadline mentions "tomorrow", use tomorrow's date at 23:59
- If deadline mentions a day of week (e.g., "Friday"), use the next occurrence
- If no deadline mentioned, set to null
- Infer priority from words like "urgent", "asap", "important", "high weight"
- Infer duration from phrases like "3 hours", "30 minutes"
- Extract relevant tags from the input
- Return ONLY the JSON object, no markdown, no explanation

Current date: {$nowStr}
PROMPT;
    }

    /**
     * Normalize parsed task data
     */
    private function normalizeTaskData(array $data): array
    {
        return [
            'title' => $data['title'] ?? 'Untitled Task',
            'description' => $data['description'] ?? null,
            'deadline' => $data['deadline'] ?? null,
            'status' => 'pending',
            'priority' => $data['priority'] ?? 'medium',
            'duration_minutes' => $data['duration_minutes'] ?? 60,
            'difficulty' => $data['difficulty'] ?? 3,
            'category' => $data['category'] ?? 'theory',
            'tags' => $data['tags'] ?? [],
            'ai_processed' => true,
        ];
    }

    /**
     * Fallback regex-based parser when AI is unavailable
     */
    private function fallbackParse(string $input): array
    {
        $data = [
            'title' => $input,
            'description' => null,
            'deadline' => null,
            'status' => 'pending',
            'priority' => 'medium',
            'duration_minutes' => 60,
            'difficulty' => 3,
            'category' => 'theory',
            'tags' => [],
            'ai_processed' => false,
        ];

        // Extract priority
        if (preg_match('/(urgent|asap|critical|high priority)/i', $input)) {
            $data['priority'] = 'critical';
        } elseif (preg_match('/(important|high)/i', $input)) {
            $data['priority'] = 'high';
        } elseif (preg_match('/(low priority|low)/i', $input)) {
            $data['priority'] = 'low';
        }

        // Extract duration
        if (preg_match('/(\d+)\s*(hour|hr|h)/i', $input, $matches)) {
            $data['duration_minutes'] = (int) $matches[1] * 60;
        } elseif (preg_match('/(\d+)\s*(minute|min|m)/i', $input, $matches)) {
            $data['duration_minutes'] = (int) $matches[1];
        }

        // Extract Category
        if (preg_match('/(code|coding|programming|lab|debug|react|laravel|python|c\+\+|db|git|software|build)/i', $input)) {
            $data['category'] = 'coding';
            $data['tags'][] = 'CS-Lab';
        } elseif (preg_match('/(math|proof|algorithm|theory|discrete|lecture|discrete|complex|seminar)/i', $input)) {
            $data['category'] = 'theory';
            $data['tags'][] = 'CS-Theory';
        } elseif (preg_match('/(register|email|submit|form|admin|scheduling|syllabus|office hour)/i', $input)) {
            $data['category'] = 'admin';
        }

        // Extract Difficulty
        if (preg_match('/(hard|complex|difficult|tough|heavy|nightmare)/i', $input)) {
            $data['difficulty'] = 5;
        } elseif (preg_match('/(easy|simple|quick|trivial|minor)/i', $input)) {
            $data['difficulty'] = 1;
        } elseif (preg_match('/(medium|moderate)/i', $input)) {
            $data['difficulty'] = 3;
        }

        // Extract deadline (basic)
        if (preg_match('/today/i', $input)) {
            $data['deadline'] = now()->endOfDay()->toDateTimeString();
        } elseif (preg_match('/tomorrow/i', $input)) {
            $data['deadline'] = now()->addDay()->endOfDay()->toDateTimeString();
        } elseif (preg_match('/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i', $input, $matches)) {
            $data['deadline'] = now()->next($matches[1])->endOfDay()->toDateTimeString();
        }

        return $data;
    }

    public function deterministicTaskFallback(string $input): array
    {
        return $this->fallbackParse($input);
    }

    private function client(): PendingRequest
    {
        return Http::acceptJson()
            ->asJson()
            ->withHeaders(['x-goog-api-key' => $this->apiKey])
            ->timeout(30);
    }

    private function logException(string $operation, \Throwable $exception): void
    {
        Log::warning("Gemini {$operation} request failed", [
            'exception' => $exception::class,
            'code' => $exception->getCode(),
        ]);
    }
}
