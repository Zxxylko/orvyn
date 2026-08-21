<?php

namespace App\Support;

use RuntimeException;

class ProductionReadiness
{
    /**
     * @return array<int, string>
     */
    public function errors(): array
    {
        $errors = [];

        $this->require($this->hasStrongApplicationKey(), 'APP_KEY must contain at least 32 random bytes.', $errors);
        $this->require(! config('app.debug'), 'APP_DEBUG must be false.', $errors);
        $this->require($this->isHttpsUrl(config('app.url')), 'APP_URL must use HTTPS.', $errors);
        $this->require(! config('services.demo_login.enabled'), 'DEMO_LOGIN_ENABLED must be false.', $errors);
        $this->require(
            (int) config('services.auth_tokens.expiration_minutes', 0) <= 10080,
            'ORVYN_TOKEN_EXPIRATION_MINUTES must not exceed 10080 (7 days).',
            $errors,
        );

        $this->require(config('database.default') === 'pgsql', 'DB_CONNECTION must be pgsql.', $errors);
        $this->require(config('queue.default') === 'redis', 'QUEUE_CONNECTION must be redis.', $errors);
        $this->require(config('cache.default') === 'redis', 'CACHE_STORE must be redis.', $errors);
        $this->require(config('session.driver') === 'redis', 'SESSION_DRIVER must be redis.', $errors);
        $this->require(filled(config('session.domain')), 'SESSION_DOMAIN must be explicit.', $errors);
        $this->require((bool) config('session.secure'), 'SESSION_SECURE_COOKIE must be true.', $errors);
        $this->require((bool) config('session.http_only'), 'SESSION_HTTP_ONLY must be true.', $errors);
        $this->require((bool) config('session.encrypt'), 'SESSION_ENCRYPT must be true.', $errors);
        $this->require(
            (int) config('session.lifetime', 0) > 0 && (int) config('session.lifetime', 0) <= 1440,
            'SESSION_LIFETIME must be between 1 and 1440 minutes.',
            $errors,
        );
        $this->require(
            in_array(config('session.same_site'), ['lax', 'strict'], true),
            'SESSION_SAME_SITE must be lax or strict.',
            $errors,
        );

        $corsOrigins = config('cors.allowed_origins', []);
        $this->validateOrigins($corsOrigins, 'CORS_ALLOWED_ORIGINS', $errors);
        $this->require((bool) config('cors.supports_credentials'), 'CORS credentials must be enabled.', $errors);
        $reverbOrigins = config('reverb.apps.apps.0.allowed_origins', []);
        $this->validateOrigins($reverbOrigins, 'REVERB_ALLOWED_ORIGINS', $errors);
        $this->require(
            array_diff($reverbOrigins, $corsOrigins) === [],
            'REVERB_ALLOWED_ORIGINS must be a subset of CORS_ALLOWED_ORIGINS.',
            $errors,
        );
        $this->require(
            (int) config('reverb.apps.apps.0.max_connections', 0) > 0,
            'REVERB_APP_MAX_CONNECTIONS must be a positive limit.',
            $errors,
        );
        $this->require(
            (bool) config('reverb.apps.apps.0.rate_limiting.enabled'),
            'REVERB_APP_RATE_LIMITING_ENABLED must be true.',
            $errors,
        );

        $this->validateTrustedProxies(config('security.trusted_proxies', []), $errors);
        $this->validateTrustedHosts(config('security.trusted_hosts', []), $errors);
        $this->validateCookieScope($corsOrigins, $errors);
        $this->validateStatefulDomains($corsOrigins, $errors);

        $logChannel = (string) config('logging.default');
        $this->require(
            in_array($logChannel, ['stderr', 'daily'], true),
            'LOG_CHANNEL must be stderr or daily in production.',
            $errors,
        );
        $this->require(
            strtolower((string) config("logging.channels.{$logChannel}.level")) !== 'debug',
            'LOG_LEVEL must not be debug in production.',
            $errors,
        );

        $databasePassword = (string) config('database.connections.pgsql.password');
        $databaseUrl = (string) config('database.connections.pgsql.url');
        if ($databasePassword === '' && $databaseUrl !== '') {
            $databasePassword = (string) parse_url($databaseUrl, PHP_URL_PASS);
        }
        $this->require(strlen($databasePassword) >= 24, 'PostgreSQL password must contain at least 24 characters.', $errors);
        $this->require(
            strlen((string) config('database.redis.default.password')) >= 24,
            'REDIS_PASSWORD must contain at least 24 characters.',
            $errors,
        );
        $this->require(
            strlen((string) config('reverb.apps.apps.0.secret')) >= 32,
            'REVERB_APP_SECRET must contain at least 32 characters.',
            $errors,
        );

        $firebaseCredentials = trim((string) config('services.firebase.credentials'));
        $firebaseRequired = (bool) config('services.firebase.required_in_production', true);
        if ($firebaseRequired) {
            $this->validateFirebaseConfiguration($firebaseCredentials, $errors);
            $this->require(
                (int) config('services.firebase.reauthentication_max_age_seconds') >= 60
                    && (int) config('services.firebase.reauthentication_max_age_seconds') <= 900,
                'FIREBASE_REAUTH_MAX_AGE_SECONDS must be between 60 and 900.',
                $errors,
            );
        }

        $this->require(
            ! config('ai.cloud_fallback_enabled') || config('ai.cloud_requires_user_consent'),
            'Cloud AI fallback requires AI_CLOUD_REQUIRES_USER_CONSENT=true.',
            $errors,
        );
        $aiProvider = (string) config('ai.provider');
        $this->require(
            in_array($aiProvider, ['ollama', 'gemini'], true),
            'AI_PROVIDER must be ollama or gemini.',
            $errors,
        );
        if ($aiProvider === 'ollama') {
            $this->require(
                $this->isPrivateServiceUrl(config('ai.ollama.base_url')),
                'OLLAMA_BASE_URL must point to a private service URL.',
                $errors,
            );
        }
        if ($aiProvider === 'gemini' || config('ai.cloud_fallback_enabled')) {
            $this->require(
                strlen((string) config('ai.gemini.api_key')) >= 20,
                'GEMINI_API_KEY is required when Gemini can receive requests.',
                $errors,
            );
        }

        if (config('services.expo_push.enabled')) {
            $expoPushUrl = (string) config('services.expo_push.url');
            $this->require(
                $this->isHttpsUrl($expoPushUrl)
                    && strtolower((string) parse_url($expoPushUrl, PHP_URL_HOST)) === 'exp.host',
                'EXPO_PUSH_URL must use the official HTTPS Expo push endpoint.',
                $errors,
            );
            $this->require(
                strlen((string) config('services.expo_push.access_token')) >= 20,
                'EXPO_ACCESS_TOKEN is required when production push delivery is enabled.',
                $errors,
            );
            $this->require(
                (int) config('services.expo_push.timeout') >= 1
                    && (int) config('services.expo_push.timeout') <= 30,
                'EXPO_PUSH_TIMEOUT must be between 1 and 30 seconds.',
                $errors,
            );
        }

        if (config('horizon.dashboard_enabled')) {
            $this->require(config('horizon.admin_emails') !== [], 'HORIZON_ADMIN_EMAILS is required.', $errors);
        }

        if (config('whatsapp.driver') === 'baileys') {
            $serviceToken = (string) config('whatsapp.service_token');
            $webhookSecret = (string) config('whatsapp.webhook_secret');
            $this->require(strlen($serviceToken) >= 32, 'WHATSAPP_SERVICE_TOKEN must contain at least 32 characters.', $errors);
            $this->require(strlen($webhookSecret) >= 32, 'WHATSAPP_WEBHOOK_SECRET must contain at least 32 characters.', $errors);
            $this->require(
                $serviceToken !== '' && ! hash_equals($serviceToken, $webhookSecret),
                'WhatsApp service and webhook secrets must be different.',
                $errors,
            );
            $this->require(
                config('whatsapp.session_admin_emails') !== [],
                'WHATSAPP_SESSION_ADMIN_EMAILS is required for Baileys session management.',
                $errors,
            );
            $this->require(
                (bool) config('whatsapp.baileys_production_acknowledged'),
                'Baileys is an unofficial WhatsApp transport; set WHATSAPP_BAILEYS_PRODUCTION_ACKNOWLEDGED=true only for an accepted private-pilot risk.',
                $errors,
            );
            $this->require(
                $this->isPrivateServiceUrl(config('whatsapp.base_url')),
                'WHATSAPP_SERVICE_URL must point to a private service URL.',
                $errors,
            );
            $this->require(
                (int) config('whatsapp.webhook_max_age_seconds') >= 30
                    && (int) config('whatsapp.webhook_max_age_seconds') <= 300,
                'WHATSAPP_WEBHOOK_MAX_AGE_SECONDS must be between 30 and 300.',
                $errors,
            );
            $this->require(
                (int) config('whatsapp.verification_ttl_minutes') >= 5
                    && (int) config('whatsapp.verification_ttl_minutes') <= 15,
                'WHATSAPP_VERIFICATION_TTL_MINUTES must be between 5 and 15.',
                $errors,
            );
            $this->require(
                (int) config('whatsapp.verification_max_attempts') >= 3
                    && (int) config('whatsapp.verification_max_attempts') <= 5,
                'WHATSAPP_VERIFICATION_MAX_ATTEMPTS must be between 3 and 5.',
                $errors,
            );
        }

        return $errors;
    }

    public function assertSecure(): void
    {
        $errors = $this->errors();
        if ($errors !== []) {
            throw new RuntimeException(
                "Unsafe production configuration:\n - ".implode("\n - ", $errors),
            );
        }
    }

    /**
     * @param  array<int, mixed>  $origins
     * @param  array<int, string>  $errors
     */
    private function validateOrigins(array $origins, string $name, array &$errors): void
    {
        $valid = $origins !== [];
        foreach ($origins as $origin) {
            $origin = (string) $origin;
            $host = parse_url($origin, PHP_URL_HOST);
            if (! $this->isHttpsUrl($origin)
                || ! is_string($host)
                || $host === ''
                || $host === 'localhost'
                || filter_var($host, FILTER_VALIDATE_IP)) {
                $valid = false;
            }
        }

        $this->require($valid, "{$name} must contain only explicit public HTTPS origins.", $errors);
    }

    private function isHttpsUrl(mixed $value): bool
    {
        return is_string($value)
            && filter_var($value, FILTER_VALIDATE_URL)
            && parse_url($value, PHP_URL_SCHEME) === 'https';
    }

    /**
     * @param  array<int, string>  $errors
     */
    private function validateFirebaseConfiguration(string $credentialsPath, array &$errors): void
    {
        $projectId = trim((string) config('services.firebase.project_id'));
        $validProjectId = preg_match('/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/', $projectId) === 1;
        $size = $credentialsPath !== '' && is_file($credentialsPath)
            ? filesize($credentialsPath)
            : false;
        $readable = $credentialsPath !== ''
            && is_file($credentialsPath)
            && is_readable($credentialsPath)
            && is_int($size)
            && $size > 0
            && $size <= 65536;

        $validCredentials = false;
        if ($readable && $validProjectId) {
            $contents = file_get_contents($credentialsPath);
            $credentials = is_string($contents) ? json_decode($contents, true) : null;
            $clientEmail = is_array($credentials) ? (string) ($credentials['client_email'] ?? '') : '';

            $validCredentials = is_array($credentials)
                && ($credentials['type'] ?? null) === 'service_account'
                && hash_equals($projectId, (string) ($credentials['project_id'] ?? ''))
                && str_ends_with($clientEmail, "@{$projectId}.iam.gserviceaccount.com")
                && strlen((string) ($credentials['private_key'] ?? '')) >= 100
                && ($credentials['token_uri'] ?? null) === 'https://oauth2.googleapis.com/token';
        }

        $this->require(
            $readable && $validProjectId && $validCredentials,
            'Firebase credentials must be a valid service account matching FIREBASE_PROJECT_ID.',
            $errors,
        );
    }

    private function hasStrongApplicationKey(): bool
    {
        $key = (string) config('app.key');
        if (str_starts_with($key, 'base64:')) {
            $decoded = base64_decode(substr($key, 7), true);

            return is_string($decoded) && strlen($decoded) >= 32;
        }

        return strlen($key) >= 32;
    }

    private function isPrivateServiceUrl(mixed $value): bool
    {
        if (! is_string($value) || ! filter_var($value, FILTER_VALIDATE_URL)) {
            return false;
        }

        $parts = parse_url($value);
        if (! is_array($parts)
            || ! in_array($parts['scheme'] ?? null, ['http', 'https'], true)
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            return false;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($host === '' || $host === 'localhost') {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
            ) === false;
        }

        return ! str_contains($host, '.');
    }

    /**
     * @param  array<int, mixed>  $origins
     * @param  array<int, string>  $errors
     */
    private function validateCookieScope(array $origins, array &$errors): void
    {
        $cookieDomain = strtolower(ltrim((string) config('session.domain'), '.'));
        $appHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
        $valid = $cookieDomain !== ''
            && str_contains($cookieDomain, '.')
            && ! filter_var($cookieDomain, FILTER_VALIDATE_IP)
            && $this->hostWithinDomain($appHost, $cookieDomain);

        foreach ($origins as $origin) {
            $originHost = strtolower((string) parse_url((string) $origin, PHP_URL_HOST));
            $valid = $valid && $this->hostWithinDomain($originHost, $cookieDomain);
        }

        $this->require(
            $valid,
            'SESSION_DOMAIN must be a shared parent domain of APP_URL and every CORS origin.',
            $errors,
        );
    }

    /**
     * @param  array<int, mixed>  $origins
     * @param  array<int, string>  $errors
     */
    private function validateStatefulDomains(array $origins, array &$errors): void
    {
        $statefulHosts = collect(config('sanctum.stateful', []))
            ->map(static function (mixed $entry): string {
                $entry = strtolower(trim((string) $entry));
                $host = parse_url(
                    str_contains($entry, '://') ? $entry : "https://{$entry}",
                    PHP_URL_HOST,
                );

                return is_string($host) ? $host : '';
            })
            ->filter()
            ->unique()
            ->all();

        $originHosts = collect($origins)
            ->map(fn (mixed $origin): string => strtolower((string) parse_url((string) $origin, PHP_URL_HOST)))
            ->filter()
            ->unique()
            ->all();

        $this->require(
            $originHosts !== [] && array_diff($originHosts, $statefulHosts) === [],
            'SANCTUM_STATEFUL_DOMAINS must include every CORS frontend host.',
            $errors,
        );
    }

    private function hostWithinDomain(string $host, string $domain): bool
    {
        return $host === $domain || str_ends_with($host, ".{$domain}");
    }

    /**
     * @param  array<int, mixed>  $proxies
     * @param  array<int, string>  $errors
     */
    private function validateTrustedProxies(array $proxies, array &$errors): void
    {
        $valid = $proxies !== [];
        foreach ($proxies as $proxy) {
            $proxy = trim((string) $proxy);
            [$address, $prefix] = array_pad(explode('/', $proxy, 2), 2, null);
            $isIp = filter_var($address, FILTER_VALIDATE_IP) !== false;
            $isPrefix = $prefix === null || (
                ctype_digit($prefix)
                && (int) $prefix >= 0
                && (int) $prefix <= (str_contains($address, ':') ? 128 : 32)
            );
            $valid = $valid && $proxy !== '*' && $isIp && $isPrefix;
        }

        $this->require(
            $valid,
            'TRUSTED_PROXIES must contain only explicit IP addresses or CIDR ranges.',
            $errors,
        );
    }

    /**
     * @param  array<int, mixed>  $hosts
     * @param  array<int, string>  $errors
     */
    private function validateTrustedHosts(array $hosts, array &$errors): void
    {
        $appHost = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
        $valid = $hosts !== [];
        $matchesAppHost = false;

        foreach ($hosts as $hostPattern) {
            $hostPattern = trim((string) $hostPattern);
            $isAnchored = str_starts_with($hostPattern, '^') && str_ends_with($hostPattern, '$');
            $hasBroadWildcard = str_contains($hostPattern, '.*') || str_contains($hostPattern, '.+');
            $matches = @preg_match("~{$hostPattern}~uD", $appHost);
            $valid = $valid && $isAnchored && ! $hasBroadWildcard && $matches !== false;
            $matchesAppHost = $matchesAppHost || $matches === 1;
        }

        $this->require(
            $valid && $matchesAppHost,
            'TRUSTED_HOSTS must contain anchored, narrow patterns matching the APP_URL host.',
            $errors,
        );
    }

    /**
     * @param  array<int, string>  $errors
     */
    private function require(bool $condition, string $message, array &$errors): void
    {
        if (! $condition) {
            $errors[] = $message;
        }
    }
}
