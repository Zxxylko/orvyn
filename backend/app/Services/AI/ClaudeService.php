<?php

namespace App\Services\AI;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ClaudeService
{
    private string $apiKey;
    private string $baseUrl;
    private string $model;

    public function __construct()
    {
        $this->apiKey = config('ai.claude.api_key');
        $this->baseUrl = config('ai.claude.base_url');
        $this->model = config('ai.claude.model');
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
            
            $response = Http::timeout(30)
                ->withHeaders([
                    'x-api-key' => $this->apiKey,
                    'anthropic-version' => '2023-06-01',
                    'content-type' => 'application/json',
                ])
                ->post("{$this->baseUrl}/messages", [
                    'model' => $this->model,
                    'max_tokens' => 1024,
                    'messages' => [
                        [
                            'role' => 'user',
                            'content' => $prompt
                        ]
                    ]
                ]);

            if ($response->successful()) {
                $result = $response->json();
                $text = $result['content'][0]['text'] ?? '';
                
                // Try to parse JSON response
                if (preg_match('/```json\s*(.*?)\s*```/s', $text, $matches)) {
                    $text = $matches[1];
                }
                
                $parsed = json_decode($text, true);
                
                if (json_last_error() === JSON_ERROR_NONE && isset($parsed['summary'])) {
                    return $parsed;
                }
                
                // If not JSON, treat as plain text summary
                return [
                    'summary' => $text,
                    'health_metrics' => $this->calculateHealthMetrics($context),
                    'recommended_adjustments' => []
                ];
            }

            Log::warning('Claude API failed, using fallback briefing', [
                'status' => $response->status()
            ]);

            return $this->fallbackBriefing($context);

        } catch (\Exception $e) {
            Log::error('Claude API error', ['error' => $e->getMessage()]);
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
        $completionRate = $context['completion_rate'] ?? 0;
        $avgDifficulty = $context['avg_difficulty'] ?? 3;

        $deadlinesList = collect($upcomingDeadlines)
            ->map(fn($task) => "- {$task['title']} (due {$task['deadline']})")
            ->join("\n");

        return <<<PROMPT
You are an AI productivity coach for {$user->name}, a student using ORVYN.

Generate a daily briefing based on their current workload:

**Current Status:**
- Active tasks: {$tasksCount}
- Overdue tasks: {$overdueCount}
- Completion rate (7 days): {$completionRate}%
- Average task difficulty: {$avgDifficulty}/5

**Upcoming Deadlines:**
{$deadlinesList}

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
        ];
    }

    /**
     * Fallback briefing when AI is unavailable
     */
    private function fallbackBriefing(array $context): array
    {
        $tasksCount = $context['tasks_count'] ?? 0;
        $overdueCount = $context['overdue_count'] ?? 0;

        $summary = "You have {$tasksCount} active tasks";
        if ($overdueCount > 0) {
            $summary .= " with {$overdueCount} overdue. Focus on catching up today.";
        } else {
            $summary .= ". Stay focused and tackle your priorities.";
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
}
