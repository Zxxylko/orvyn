<?php

namespace Database\Seeders;

use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DemoSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create demo user
        $user = User::firstOrCreate(
            ['email' => 'demo@orvyn.app'],
            [
                'id' => Str::uuid(),
                'firebase_uid' => 'demo_' . Str::random(20),
                'name' => 'Demo Student',
                'email_verified_at' => now(),
                'preferences' => [
                    'theme' => 'dark',
                    'notifications_enabled' => true,
                ],
            ]
        );

        // Create API token for testing
        $token = $user->createToken('demo-token')->plainTextToken;

        // Create demo tasks
        $tasks = [
            [
                'title' => 'Complete OS Lab Assignment',
                'description' => 'Implement process scheduling algorithms',
                'deadline' => now()->addDays(3),
                'priority' => 'high',
                'duration_minutes' => 180,
                'difficulty' => 4,
                'category' => 'academics',
                'tags' => ['operating-systems', 'lab', 'programming'],
                'status' => 'in_progress',
            ],
            [
                'title' => 'Study for Data Structures Midterm',
                'description' => 'Review trees, graphs, and dynamic programming',
                'deadline' => now()->addDays(5),
                'priority' => 'critical',
                'duration_minutes' => 240,
                'difficulty' => 5,
                'category' => 'academics',
                'tags' => ['data-structures', 'exam', 'study'],
                'status' => 'pending',
            ],
            [
                'title' => 'Web Dev Project - Frontend',
                'description' => 'Build React components for dashboard',
                'deadline' => now()->addWeek(),
                'priority' => 'medium',
                'duration_minutes' => 120,
                'difficulty' => 3,
                'category' => 'academics',
                'tags' => ['web-development', 'react', 'project'],
                'status' => 'pending',
            ],
            [
                'title' => 'Gym Session',
                'description' => 'Leg day workout',
                'deadline' => now()->addDay(),
                'priority' => 'low',
                'duration_minutes' => 60,
                'difficulty' => 2,
                'category' => 'health',
                'tags' => ['fitness', 'health'],
                'status' => 'pending',
            ],
            [
                'title' => 'Team Meeting - Capstone Project',
                'description' => 'Discuss project milestones and deliverables',
                'deadline' => now()->addDays(2),
                'priority' => 'medium',
                'duration_minutes' => 90,
                'difficulty' => 2,
                'category' => 'academics',
                'tags' => ['meeting', 'capstone', 'teamwork'],
                'status' => 'pending',
            ],
        ];

        foreach ($tasks as $taskData) {
            $user->tasks()->create(array_merge($taskData, [
                'id' => Str::uuid(),
                'ai_processed' => false,
            ]));
        }

        $this->command->info('Demo data seeded successfully!');
        $this->command->info('Demo User Email: demo@orvyn.app');
        $this->command->info('API Token: ' . $token);
        $this->command->info('');
        $this->command->info('Test the API:');
        $this->command->info('curl -H "Authorization: Bearer ' . $token . '" http://localhost:8000/api/v1/tasks');
    }
}
