<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\FirebaseTokenVerifier;
use App\Services\Auth\VerifiedFirebaseUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery\MockInterface;
use Symfony\Component\HttpFoundation\Cookie;
use Tests\TestCase;

class WebCookieSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_stateful_web_login_requires_csrf_and_uses_an_invalidatable_cookie_session(): void
    {
        $this->app['env'] = 'local';
        config([
            'sanctum.stateful' => ['localhost'],
            'session.driver' => 'database',
            'session.cookie' => 'orvyn_test_session',
            'session.domain' => null,
            'session.secure' => false,
            'session.http_only' => true,
            'session.same_site' => 'lax',
        ]);

        $this->mock(FirebaseTokenVerifier::class, function (MockInterface $mock): void {
            $mock->shouldReceive('verify')
                ->once()
                ->with('browser-id-token')
                ->andReturn(new VerifiedFirebaseUser(
                    uid: 'browser-firebase-uid',
                    email: 'browser@orvyn.app',
                    emailVerified: true,
                    displayName: 'Browser User',
                ));
        });

        $csrfResponse = $this->withHeader('Origin', 'http://localhost')
            ->get('/sanctum/csrf-cookie')
            ->assertNoContent();

        $xsrfCookie = $csrfResponse->getCookie('XSRF-TOKEN', false);
        $sessionCookie = $csrfResponse->getCookie('orvyn_test_session', false);

        $this->assertInstanceOf(Cookie::class, $xsrfCookie);
        $this->assertInstanceOf(Cookie::class, $sessionCookie);
        $this->assertFalse($xsrfCookie->isHttpOnly());
        $this->assertTrue($sessionCookie->isHttpOnly());

        $loginResponse = $this
            ->withHeaders([
                'Origin' => 'http://localhost',
                'X-Client-Platform' => 'web',
                'X-XSRF-TOKEN' => urldecode($xsrfCookie->getValue()),
            ])
            ->withUnencryptedCookies([
                'XSRF-TOKEN' => $xsrfCookie->getValue(),
                'orvyn_test_session' => $sessionCookie->getValue(),
            ])
            ->postJson('/api/v1/auth/firebase', [
                'id_token' => 'browser-id-token',
            ])
            ->assertOk()
            ->assertJsonPath('data.session.type', 'cookie')
            ->assertJsonPath('data.session.expires_at', null)
            ->assertJsonMissingPath('data.token');

        $authenticatedSession = $loginResponse->getCookie('orvyn_test_session', false);
        $authenticatedXsrf = $loginResponse->getCookie('XSRF-TOKEN', false);

        $this->assertInstanceOf(Cookie::class, $authenticatedSession);
        $this->assertInstanceOf(Cookie::class, $authenticatedXsrf);
        $this->assertNotSame($sessionCookie->getValue(), $authenticatedSession->getValue());

        $user = User::query()->where('email', 'browser@orvyn.app')->firstOrFail();
        $this->assertTrue(
            DB::table('sessions')->where('user_id', $user->id)->exists(),
            'The database session must retain the authenticated UUID user ID.',
        );

        $this->app['auth']->forgetGuards();
        $this->withUnencryptedCookie('orvyn_test_session', $authenticatedSession->getValue())
            ->getJson('/api/v1/user/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'browser@orvyn.app');

        $this->app['auth']->forgetGuards();
        $this->withUnencryptedCookie('orvyn_test_session', $authenticatedSession->getValue())
            ->getJson('/api/v1/auth/sessions')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->app['auth']->forgetGuards();
        $this->withoutHeader('X-XSRF-TOKEN')
            ->withUnencryptedCookie('orvyn_test_session', $authenticatedSession->getValue())
            ->postJson('/api/v1/auth/logout')
            ->assertStatus(419);

        $this->app['auth']->forgetGuards();
        $logoutResponse = $this
            ->withHeader('X-XSRF-TOKEN', urldecode($authenticatedXsrf->getValue()))
            ->withUnencryptedCookies([
                'XSRF-TOKEN' => $authenticatedXsrf->getValue(),
                'orvyn_test_session' => $authenticatedSession->getValue(),
            ])
            ->postJson('/api/v1/auth/logout')
            ->assertOk()
            ->assertJsonPath('message', 'Current session logged out successfully.');

        $invalidatedSession = $logoutResponse->getCookie('orvyn_test_session', false);
        $this->assertInstanceOf(Cookie::class, $invalidatedSession);

        $this->app['auth']->forgetGuards();
        $this->withoutHeader('X-XSRF-TOKEN')
            ->withUnencryptedCookie('orvyn_test_session', $invalidatedSession->getValue())
            ->getJson('/api/v1/user/me')
            ->assertUnauthorized();
    }
}
