<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireOrvynAbility
{
    public function handle(Request $request, Closure $next): Response
    {
        // Stateful first-party requests are already protected by Sanctum's
        // session/CSRF boundary. Ability scopes apply to bearer tokens such as
        // the dedicated token used by Odysseus.
        if (! $request->bearerToken()) {
            return $next($request);
        }

        $ability = $request->isMethodSafe() ? 'orvyn:read' : 'orvyn:write';

        if (! $request->user()?->tokenCan($ability)) {
            return new JsonResponse([
                'message' => 'Token tidak memiliki izin untuk operasi ini.',
                'required_ability' => $ability,
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
