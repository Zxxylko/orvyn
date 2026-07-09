<?php

namespace Tests\Feature;

use App\Models\CampusSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CampusScheduleControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_and_list_campus_schedule(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/campus-schedules', [
            'course_name' => 'Struktur Data',
            'course_code' => 'CII2A3',
            'building' => 'TULT',
            'room' => '0901',
            'day_of_week' => 1,
            'start_time' => '08:30',
            'end_time' => '10:30',
            'class_type' => 'lab',
            'commute_minutes' => 35,
            'prep_minutes' => 20,
        ])
            ->assertCreated()
            ->assertJsonPath('data.course_name', 'Struktur Data')
            ->assertJsonPath('data.start_time', '08:30');

        $this->getJson('/api/v1/campus-schedules?day_of_week=1&active=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.room', '0901');
    }

    public function test_user_cannot_update_or_delete_another_users_schedule(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $schedule = CampusSchedule::create([
            'user_id' => $owner->id,
            'course_name' => 'Basis Data',
            'day_of_week' => 2,
            'start_time' => '13:00',
            'end_time' => '15:00',
        ]);

        Sanctum::actingAs($otherUser);

        $this->putJson("/api/v1/campus-schedules/{$schedule->id}", [
            'course_name' => 'Changed',
        ])->assertForbidden();

        $this->deleteJson("/api/v1/campus-schedules/{$schedule->id}")
            ->assertForbidden();
    }
}
