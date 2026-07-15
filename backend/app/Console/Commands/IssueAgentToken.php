<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

class IssueAgentToken extends Command
{
    protected $signature = 'orvyn:issue-agent-token
        {user : UUID atau email pengguna ORVYN}
        {--name=odysseus : Nama token}
        {--read-only : Hanya izinkan operasi baca}
        {--expires=90 : Masa berlaku dalam hari; gunakan 0 tanpa kedaluwarsa}
        {--replace : Hapus token lama milik pengguna dengan nama yang sama}
        {--env-file= : Simpan konfigurasi MCP ke file .env tanpa menampilkan token}
        {--api-base-url=http://127.0.0.1:8000/api/v1 : Base URL API untuk --env-file}';

    protected $description = 'Create a scoped Sanctum token for Odysseus or another ORVYN agent';

    public function handle(): int
    {
        $identifier = (string) $this->argument('user');
        $user = Str::isUuid($identifier)
            ? User::find($identifier)
            : User::where('email', $identifier)->first();

        if (! $user) {
            $this->error('Pengguna ORVYN tidak ditemukan. Gunakan UUID atau email yang valid.');

            return self::FAILURE;
        }

        $name = trim((string) $this->option('name'));
        $expiresInDays = filter_var($this->option('expires'), FILTER_VALIDATE_INT);
        if ($name === '' || mb_strlen($name) > 120) {
            $this->error('Nama token wajib diisi dan maksimal 120 karakter.');

            return self::FAILURE;
        }
        if ($expiresInDays === false || $expiresInDays < 0 || $expiresInDays > 3650) {
            $this->error('Nilai --expires harus antara 0 dan 3650 hari.');

            return self::FAILURE;
        }

        $envFile = trim((string) $this->option('env-file'));
        $apiBaseUrl = rtrim(trim((string) $this->option('api-base-url')), '/');
        if ($envFile !== '' && ! filter_var($apiBaseUrl, FILTER_VALIDATE_URL)) {
            $this->error('Nilai --api-base-url harus berupa URL HTTP atau HTTPS yang valid.');

            return self::FAILURE;
        }
        if ($envFile !== '' && ! in_array(parse_url($apiBaseUrl, PHP_URL_SCHEME), ['http', 'https'], true)) {
            $this->error('Nilai --api-base-url hanya boleh memakai skema HTTP atau HTTPS.');

            return self::FAILURE;
        }

        $abilities = $this->option('read-only')
            ? ['orvyn:read']
            : ['orvyn:read', 'orvyn:write'];
        $expiresAt = $expiresInDays === 0 ? null : now()->addDays($expiresInDays);
        if ($this->option('replace')) {
            $user->tokens()->where('name', $name)->delete();
        }
        $token = $user->createToken($name, $abilities, $expiresAt);

        if ($envFile !== '') {
            try {
                File::ensureDirectoryExists(dirname($envFile));
                File::put($envFile, implode("\n", [
                    "ORVYN_API_BASE_URL={$apiBaseUrl}",
                    "ORVYN_API_TOKEN={$token->plainTextToken}",
                    'ORVYN_API_TIMEOUT_MS=30000',
                    '',
                ]), true);
                @chmod($envFile, 0600);
            } catch (Throwable $error) {
                $token->accessToken->delete();
                $this->error('Gagal menulis file konfigurasi MCP: '.$error->getMessage());

                return self::FAILURE;
            }

            $this->newLine();
            $this->info('Token agent berhasil dibuat dan disimpan tanpa menampilkan secret.');
            $this->line('Environment file: '.$envFile);
            $this->newLine();
            $this->table(['User', 'Abilities', 'Expires'], [[
                $user->email,
                implode(', ', $abilities),
                $expiresAt?->toIso8601String() ?? 'never',
            ]]);

            return self::SUCCESS;
        }

        $this->newLine();
        $this->info('Token agent berhasil dibuat. Salin sekarang; token tidak dapat ditampilkan lagi.');
        $this->line($token->plainTextToken);
        $this->newLine();
        $this->table(['User', 'Abilities', 'Expires'], [[
            $user->email,
            implode(', ', $abilities),
            $expiresAt?->toIso8601String() ?? 'never',
        ]]);

        return self::SUCCESS;
    }
}
