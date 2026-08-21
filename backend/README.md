# ORVYN Backend

Laravel 13 API untuk autentikasi, task management, scheduling, briefing, wellness, finance, realtime event, Ollama, push notification, dan orkestrasi WhatsApp.

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

Scheduler menjalankan `notifications:dispatch-whatsapp` dan `notifications:dispatch-push` setiap menit. Keduanya menghormati timezone, feature toggle, jadwal pengguna, dan dedupe key.

## Autentikasi dan privasi

- Demo login hanya untuk development dan menghasilkan Sanctum token yang memiliki nama perangkat serta expiry.
- `POST /api/v1/auth/firebase` memverifikasi Firebase ID token bila `FIREBASE_CREDENTIALS` dikonfigurasi; `FIREBASE_PROJECT_ID` harus sama dengan project client web/mobile.
- Logout, daftar sesi, revoke per perangkat, dan logout-all tersedia di bawah `/api/v1/auth`.
- Ekspor data dan penghapusan akun tersedia di `/api/v1/user/export` serta `DELETE /api/v1/user`. Penghapusan memerlukan `confirmation: "HAPUS AKUN"` dan `id_token` dari login Firebase yang masih baru; identity Firebase dihapus sebelum data ORVYN.
- Scoped token Odysseus tidak dapat mengelola sesi, push token, ekspor, atau penghapusan akun.

## Push notification

Mobile mendaftarkan Expo token melalui `POST /api/v1/push-tokens`. Status, jadwal, feature toggle, dan test delivery tersedia di `/api/v1/push-notifications`.

```env
EXPO_PUSH_ENABLED=true
EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
EXPO_ACCESS_TOKEN=
```

Job menonaktifkan token yang menerima `DeviceNotRegistered` dan mencatat status delivery tanpa mengekspos token pada response API.

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
