<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoAuthControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_login_returns_a_valid_token_and_seeded_user(): void
    {
        $response = $this->postJson('/api/v1/auth/demo-login')
            ->assertOk()
            ->assertJsonPath('data.user.email', 'demo@orvyn.app')
            ->assertJsonPath('message', 'Demo login successful');

        $token = $response->json('data.token');
        $this->assertIsString($token);
        $this->assertNotEmpty($token);

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/user/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'demo@orvyn.app');

        $this->assertDatabaseHas('tasks', [
            'title' => 'Finish Praktikum Basis Data report',
        ]);
        $this->assertDatabaseHas('habits', [
            'name' => 'Lari setiap hari',
        ]);
        $this->assertDatabaseHas('campus_schedules', [
            'course_name' => 'Struktur Data',
        ]);
    }

    public function test_demo_login_can_be_disabled(): void
    {
        config(['services.demo_login.enabled' => false]);

        $this->postJson('/api/v1/auth/demo-login')
            ->assertForbidden();
    }
}
