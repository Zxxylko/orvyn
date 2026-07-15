# ORVYN Backend

Laravel 13 API untuk autentikasi, task management, scheduling, briefing, wellness, finance, realtime event, Ollama, dan orkestrasi WhatsApp.

## Menjalankan

```bash
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan serve
```

Proses background:

```bash
php artisan queue:work
php artisan schedule:work
php artisan reverb:start
```

Scheduler menjalankan `notifications:dispatch-whatsapp` setiap menit dan menghormati timezone serta preferensi setiap pengguna.

## AI

Provider default adalah Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Gemini opsional sebagai provider atau fallback. Tanpa provider online, parser dan briefing memakai fallback deterministik.

## Verifikasi

```bash
php artisan test
vendor/bin/pint --test
php artisan route:list
php artisan schedule:list
```

Lihat [dokumentasi provider AI](../docs/api-keys.md) dan [WhatsApp Assistant](../docs/whatsapp-assistant.md).

Token agent khusus Odysseus dapat dibuat tanpa memakai token frontend:

```bash
php artisan orvyn:issue-agent-token your@email.com --name=odysseus --expires=90
```

Lihat [panduan Odysseus](../docs/odysseus.md) untuk konfigurasi MCP stdio.
