# ORVYN

ORVYN adalah *student operating system* untuk mengelola tugas, jadwal belajar, kegiatan kampus, habit, kesehatan, keuangan, fokus, dan risiko burnout dalam satu tempat. Laravel menjadi sumber data utama, Ollama menyediakan AI lokal, dan WhatsApp dapat digunakan sebagai reminder serta remote control dua arah.

Proyek ini menyediakan tiga antarmuka:

- Dashboard web React untuk penggunaan lengkap di laptop.
- Aplikasi mobile Expo untuk Android dan iOS.
- WhatsApp Assistant untuk input cepat, reminder, dan status harian.

Odysseus bersifat opsional dan terhubung melalui MCP. ORVYN tetap berjalan penuh saat Odysseus offline.

## Status proyek

Siap digunakan untuk development lokal:

- Laravel API, PostgreSQL/SQLite, queue, dan scheduler.
- Realtime dashboard melalui Laravel Reverb.
- Web React + Vite.
- Mobile Expo SDK 57 dengan cache offline, status koneksi, dan push notification native.
- Sesi perangkat, logout server-side, ekspor data, dan penghapusan akun.
- Ollama dengan `qwen3:4b` dan `nomic-embed-text`.
- WhatsApp sidecar Baileys dengan session lokal.
- MCP server untuk Odysseus.
- GitHub Actions CI serta tool backup dan maintenance lokal.

Yang masih harus disiapkan sebelum production publik:

- VPS Linux yang sudah di-hardening, domain/DNS, dan firewall provider/host.
- Firebase project/client, `GOOGLE_SERVICES_JSON` EAS File variable, serta
  kredensial push Android/iOS.
- Environment EAS `production`, Privacy Policy publik, dan monitoring/alerting.
- Target backup SFTP off-site beserta uji restore terisolasi.
- Pairing WhatsApp; untuk produk publik, pertimbangkan driver resmi seperti Meta Cloud API.

Paket deployment production satu-VPS sudah tersedia di
[`deploy/README.md`](./deploy/README.md). Status ini tidak berarti instance
publik sudah aktif: deploy nyata tetap membutuhkan seluruh infrastruktur dan
kredensial eksternal di atas serta harus lolos preflight, scan, backup, dan
smoke test pada host Linux target.

## Fitur

### Produktivitas

- CRUD tugas, deadline, prioritas, kategori, tag, estimasi durasi, dan status.
- Smart task input dengan bahasa natural.
- Papan prioritas, pencarian, filter, dan urutan tugas.
- Kalender dan time block yang dapat dikunci atau ditautkan ke tugas.
- Optimasi jadwal dan briefing harian.
- Focus timer, focus log, rating sesi, streak, dan peak productivity hours.
- Flow score, workload, cognitive load, dan burnout indicator.

### Kehidupan mahasiswa

- Academic tracker untuk tugas kuliah, praktikum, ujian, dan LMS.
- Jadwal kampus, ruang, dosen, waktu perjalanan, dan persiapan.
- Habit harian, check-in, streak, edit, aktif/nonaktif, dan hapus.
- Budget bulanan dan pencatatan pengeluaran.
- Hidrasi, tidur, kafein, screen time, dan health alert.
- Pengingat berangkat kuliah berdasarkan waktu kelas, perjalanan, dan persiapan.

### AI dan integrasi

- Ollama sebagai AI lokal utama.
- Gemini opsional sebagai fallback provider.
- Parser deterministik ketika provider AI tidak tersedia.
- Reminder deadline bertahap dan briefing melalui WhatsApp.
- Push notification native untuk briefing, deadline, habit, burnout, progres, review mingguan, dan keberangkatan kelas.
- Perintah WhatsApp dua arah untuk tugas, habit, kesehatan, dan keuangan.
- Cache baca per pengguna agar data terakhir tetap terlihat saat HP offline.
- Realtime event melalui Laravel Reverb.
- MCP tools dengan scoped Sanctum token untuk Odysseus.
- Firebase ID-token login opsional, sesi perangkat, dan token kedaluwarsa.

## Arsitektur

```text
React Web ─────────┐
Expo Mobile ───────┼──> Laravel API + Sanctum ──> SQLite/PostgreSQL
Odysseus ─> MCP ───┘              │
                                  ├──> Queue worker
                                  ├──> Scheduler
                                  ├──> Laravel Reverb
                                  ├──> Ollama / Gemini / fallback
                                  ├──> Expo Push Service ──> Android/iOS
                                  └──> WhatsApp sidecar ──> WhatsApp
                                             │
                                             └── HMAC webhook ──> Laravel
```

Mobile dan web hanya berbicara dengan Laravel API. Mobile tidak boleh mengakses database, Ollama, MCP, atau port WhatsApp secara langsung.

## Struktur folder

```text
orvyn/
├── backend/              # Laravel API, database, queue, scheduler, Reverb, tests
├── frontend/             # React 19 + TypeScript + Vite dashboard
├── mobile/               # Expo SDK 57 untuk Android, iOS, dan web
├── whatsapp-service/     # Transport WhatsApp TypeScript + Baileys
├── mcp-server/           # MCP stdio server untuk Odysseus/agent
├── scripts/              # Runtime, backup, maintenance, dan rotasi secret
├── .github/workflows/    # Continuous Integration
├── docs/                 # Panduan integrasi yang lebih terperinci
└── README.md
```

## Port lokal

| Layanan | Port | Akses |
|---|---:|---|
| PostgreSQL | `5432` | localhost |
| Laravel API | `8000` | LAN untuk mobile |
| React/Vite | `5173` | localhost/LAN |
| Laravel Reverb | `8080` | localhost/LAN |
| Expo/Metro | `8081` | hanya development mobile |
| Ollama | `11434` | localhost |
| WhatsApp sidecar | `3100` | localhost saja |
| MCP server | stdio | tidak menggunakan port publik |

## Prasyarat

- macOS atau Linux.
- PHP `8.3+`.
- Composer `2+`.
- Node.js `22.13+` dan npm.
- SQLite untuk setup termudah, atau PostgreSQL + pgvector.
- Ollama bila ingin memakai AI lokal.
- `tmux` direkomendasikan agar pengelola service dapat menjaga proses tetap hidup.
- Akun Expo/EAS hanya diperlukan untuk build atau update mobile cloud.
- Xcode/Android Studio hanya diperlukan untuk simulator atau native build lokal.

Versi yang sedang dipakai pada mesin development dapat diperiksa dengan:

```bash
php --version
composer --version
node --version
npm --version
```

## Quick start

### 1. Siapkan environment

Jalankan dari root proyek:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp mobile/.env.example mobile/.env.local
cp whatsapp-service/.env.example whatsapp-service/.env
cp mcp-server/.env.example mcp-server/.env
```

Semua `.env` lokal diabaikan Git. Jangan memasukkan token atau secret asli ke file contoh.

### 2. Install dependency

```bash
cd backend
composer install
php artisan key:generate
php -r "file_exists('database/database.sqlite') || touch('database/database.sqlite');"
php artisan migrate

cd ../frontend
npm install

cd ../mobile
npm install

cd ../whatsapp-service
npm install

cd ../mcp-server
npm install

cd ..
```

Backend fresh clone memakai SQLite secara default. Untuk PostgreSQL, ubah konfigurasi database di `backend/.env`, aktifkan pgvector, lalu jalankan migrasi.

### 3. Buat dan sinkronkan secret lokal

```bash
./scripts/rotate-local-secrets
```

Perintah ini:

- Membuat token Laravel → WhatsApp sidecar.
- Membuat secret HMAC sidecar → Laravel.
- Membuat secret Reverb.
- Menyamakan `VITE_REVERB_APP_KEY` dengan backend.
- Tidak mencetak secret ke terminal.

Jalankan lagi bila secret pernah masuk Git, log, screenshot, atau chat.

### 4. Siapkan Ollama

```bash
ollama pull qwen3:4b
ollama pull nomic-embed-text
ollama serve
```

Jika aplikasi Ollama sudah berjalan, `ollama serve` tidak perlu dijalankan lagi.

### 5. Jalankan ORVYN

```bash
./scripts/orvyn start
```

Perintah tersebut menyalakan:

- Laravel API
- Queue worker
- Scheduler
- Laravel Reverb
- WhatsApp sidecar
- React/Vite
- Ollama bila belum aktif dan binary tersedia

Lihat status:

```bash
./scripts/orvyn status
```

Buka web:

```text
http://127.0.0.1:5173
```

Untuk development Expo/Metro:

```bash
./scripts/orvyn restart --with-expo
```

APK preview yang sudah terpasang tidak membutuhkan Metro port `8081`; aplikasi tersebut hanya membutuhkan Laravel API yang dapat dijangkau melalui Wi-Fi.

### 6. Menghentikan service

```bash
./scripts/orvyn stop
```

Perintah operasional:

| Perintah | Fungsi |
|---|---|
| `./scripts/orvyn start` | Menyalakan backend, worker, scheduler, Reverb, WhatsApp, Ollama, dan web |
| `./scripts/orvyn start --with-expo` | Menyalakan stack ditambah Expo/Metro |
| `./scripts/orvyn restart` | Restart stack |
| `./scripts/orvyn status` | Menampilkan status port dan proses |
| `./scripts/orvyn logs` | Menampilkan ringkasan semua log |
| `./scripts/orvyn logs whatsapp` | Mengikuti log service tertentu |
| `./scripts/orvyn stop` | Menghentikan proses yang dikelola ORVYN |
| `./scripts/orvyn-maintenance status` | Status runtime, database, failed jobs, dan backup |
| `./scripts/orvyn-maintenance backup` | Backup SQLite/PostgreSQL + checksum |
| `./scripts/orvyn-maintenance prune-failed` | Simulasi aman pembersihan failed jobs |

Log lokal berada di `.orvyn/logs/` dan tidak ikut Git.

## Login

### Login demo

Tidak ada password demo. Klik **Masuk sebagai Mahasiswa Demo** pada web atau mobile.

Backend membuat akun berikut bila belum ada:

```text
Nama: Demo Student
Email: demo@orvyn.app
Password: tidak ada
```

Endpoint yang dipakai:

```text
POST /api/v1/auth/demo-login
```

Demo login membuat Sanctum session yang memiliki nama perangkat dan masa berlaku. Data contoh hanya dibuat saat akun demo masih kosong. Wajib dimatikan pada production:

```env
DEMO_LOGIN_ENABLED=false
```

### Login token

Web dan mobile juga menerima Laravel Sanctum token. Gunakan token hanya pada perangkat yang dipercaya dan jangan menaruh token di README, screenshot, atau file tracked.

Setiap login web/mobile mengirim nama perangkat. Menu **Profil → Akun & keamanan** di web dapat:

- Melihat sesi aktif tanpa mengekspos token.
- Memutus sesi perangkat lain.
- Keluar dari semua perangkat.
- Mengunduh data akun.
- Menghapus akun dengan konfirmasi eksplisit.

### Login Firebase untuk production

Backend dapat memverifikasi Firebase ID token secara fail-closed:

```text
POST /api/v1/auth/firebase
X-Device-Name: Pixel 9

{"id_token":"<firebase-id-token>"}
```

Konfigurasikan path service account di backend:

```env
FIREBASE_CREDENTIALS=/run/secrets/firebase-service-account.json
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_REAUTH_MAX_AGE_SECONDS=300
```

Service account harus berasal dari project yang sama dengan client web/mobile; pemeriksaan produksi membandingkan `project_id` file dengan `FIREBASE_PROJECT_ID`. Email dan nama hanya diambil dari identitas Firebase yang sudah diverifikasi, bukan dari body request. UI Google/Apple/email pada client masih memerlukan Firebase project config milik deployment Anda; jangan memasukkan service-account JSON ke bundle web/mobile atau Git.

## Konfigurasi environment

### Backend

Konfigurasi minimal `backend/.env`:

```env
APP_NAME=ORVYN
APP_ENV=local
APP_URL=http://127.0.0.1:8000
APP_DEBUG=true
DEMO_LOGIN_ENABLED=true
ORVYN_TOKEN_EXPIRATION_MINUTES=43200
FIREBASE_CREDENTIALS=
FIREBASE_PROJECT_ID=
FIREBASE_REAUTH_MAX_AGE_SECONDS=300

DB_CONNECTION=sqlite
QUEUE_CONNECTION=database
CACHE_STORE=database
SESSION_DRIVER=database

BROADCAST_CONNECTION=reverb
REVERB_APP_ID=orvyn-local
REVERB_APP_KEY=orvyn-reverb-key
REVERB_APP_SECRET=<generated-secret>
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_TIMEOUT=60

WHATSAPP_SERVICE_URL=http://127.0.0.1:3100
WHATSAPP_SERVICE_TOKEN=<generated-secret>
WHATSAPP_WEBHOOK_SECRET=<different-generated-secret>
WHATSAPP_DEFAULT_TIMEZONE=Asia/Jakarta

EXPO_PUSH_ENABLED=true
EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
EXPO_ACCESS_TOKEN=
```

Untuk web dari perangkat lain di LAN, tambahkan origin Vite LAN ke `CORS_ALLOWED_ORIGINS`.

### Frontend web

```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_APP_NAME=ORVYN
VITE_REVERB_APP_KEY=orvyn-reverb-key
VITE_REVERB_PORT=8080
VITE_REVERB_SCHEME=ws
```

`VITE_BROADCAST_AUTH_ENDPOINT` opsional. Default-nya adalah `/broadcasting/auth` pada origin `VITE_API_URL`.

### Mobile

Simulator iOS atau Expo web:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
```

Android Emulator:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
```

HP fisik:

```env
EXPO_PUBLIC_API_URL=http://<IP-LAN-MAC>:8000/api/v1
```

Cari IP LAN Mac:

```bash
ipconfig getifaddr en0
```

Laravel harus dijalankan menggunakan `--host=0.0.0.0`; pengelola `./scripts/orvyn` sudah mengaturnya. HP dan Mac harus berada pada Wi-Fi yang sama.

Mobile menyimpan cache baca terpisah per pengguna. Saat jaringan terputus, dashboard dan daftar utama menampilkan data terakhir dengan indikator **OFFLINE**; mutasi tidak disimpan diam-diam atau diantrekan, sehingga tidak ada perubahan semu.

Push notification memerlukan perangkat fisik/development build dan binary baru. Expo Go Android tidak mendukung remote push pada SDK modern.

### WhatsApp sidecar

```env
HOST=127.0.0.1
PORT=3100
ORVYN_API_URL=http://127.0.0.1:8000
WHATSAPP_SERVICE_TOKEN=<same-as-backend>
WHATSAPP_WEBHOOK_SECRET=<same-as-backend>
WHATSAPP_SESSION_PATH=./sessions/main
WHATSAPP_AUTO_CONNECT=true
LOG_LEVEL=info
BAILEYS_LOG_LEVEL=silent
```

Port `3100` tidak boleh diekspos ke internet. `BAILEYS_LOG_LEVEL=silent` mencegah metadata JID/nomor masuk ke log; aktifkan log internal hanya saat debugging lokal.

### MCP/Odysseus

```env
ORVYN_API_BASE_URL=http://127.0.0.1:8000/api/v1
ORVYN_API_TOKEN=<scoped-sanctum-token>
ORVYN_API_TIMEOUT_MS=30000
```

Jangan menjalankan `source mcp-server/.env`; Sanctum token dapat mengandung karakter `|`. Jalankan MCP melalui Node/npm agar dotenv membaca nilainya dengan aman.

## Menggunakan web dan mobile

Setelah login:

1. Tambahkan tugas dari input pintar atau form manual.
2. Isi deadline, durasi, prioritas, kategori, dan tag.
3. Susun time block pada menu **Jadwal Belajar**.
4. Jalankan focus timer dan simpan rating sesi.
5. Gunakan **Student Hub** untuk akademik, kampus, keuangan, kesehatan, habit, briefing, dan WhatsApp.
6. Periksa halaman **Akun** di mobile untuk status jaringan, Laravel, WhatsApp, dan Ollama.
7. Buka **Profil → Akun & keamanan** di web untuk sesi perangkat, ekspor data, atau privasi akun.

Semua client memakai akun dan data Laravel yang sama, sehingga perubahan web, mobile, WhatsApp, dan Odysseus tetap sinkron.

## WhatsApp Assistant

### Menghubungkan

1. Pastikan backend, queue, scheduler, dan sidecar aktif.
2. Login ke ORVYN.
3. Buka pengaturan **WhatsApp Assistant**.
4. Isi nomor telepon yang akan mengirim perintah.
5. Berikan consent dan aktifkan integrasi.
6. Klik **Hubungkan** lalu scan QR bila session belum tersedia.
7. Atur timezone, jadwal briefing, tahap reminder, dan feature toggle.
8. Kirim `Menu` ke chat nomor sendiri atau dari nomor yang terdaftar untuk memastikan ORVYN membalas.

### Contoh perintah

```text
tambah tugas laporan keamanan besok prioritas tinggi
tugas hari ini
jadwal besok
selesai 1
tunda 1 2 jam
pengeluaran 25k makan siang
habit olahraga selesai
minum 500ml
tidur 7 jam
review mingguan
apa prioritas saya?
```

Reminder otomatis memerlukan queue worker dan scheduler. Scheduler berjalan setiap menit dan setiap tahap reminder memiliki dedupe key agar tidak dikirim dua kali.

Baileys bukan API resmi WhatsApp. Hindari spam, broadcast, dan penggunaan tanpa opt-in. Untuk production publik, implementasikan Meta Cloud API di balik gateway Laravel.

Sidecar memakai Baileys v7 dan menerima pemetaan PN/LID WhatsApp. Sinkronisasi riwayat penuh tetap dimatikan, tetapi sinkronisasi metadata awal tidak boleh dimatikan karena diperlukan agar nomor pengirim dikenali dengan benar.

Panduan lengkap: [docs/whatsapp-assistant.md](./docs/whatsapp-assistant.md).

## Push notification mobile

Saat user sudah login dan memberi izin notifikasi, aplikasi mobile:

1. Membuat Expo push token menggunakan EAS project ID.
2. Mendaftarkan token ke `POST /api/v1/push-tokens`.
3. Menyimpan token per perangkat tanpa pernah mengirimkannya kembali pada endpoint status.
4. Menghapus registrasi perangkat secara best-effort sebelum logout.

Scheduler Laravel menjalankan `notifications:dispatch-push` setiap menit. Delivery memakai dedupe key sehingga satu tahap reminder tidak dikirim dua kali. Preferensi tersedia melalui:

```text
GET   /api/v1/push-notifications
PATCH /api/v1/push-notifications
POST  /api/v1/push-notifications/test
```

Android memakai channel `orvyn-reminders`. Untuk produksi, aktifkan keamanan push pada project Expo dan simpan `EXPO_ACCESS_TOKEN` hanya sebagai secret server. Jangan menaruhnya dalam variable `EXPO_PUBLIC_*`.

Karena `expo-notifications`, `expo-device`, `expo-network`, dan AsyncStorage menambah native dependency/plugin, APK/IPA lama harus dibangun ulang:

```bash
cd mobile
npm run build:android:apk
```

## AI lokal

Provider default:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Urutan fallback:

1. Ollama.
2. Gemini bila `GEMINI_API_KEY` tersedia.
3. Parser/briefing deterministik untuk fitur yang mendukung fallback.

Periksa model:

```bash
ollama list
curl http://127.0.0.1:11434/api/tags
```

Detail provider: [docs/api-keys.md](./docs/api-keys.md).

## Realtime

Realtime web menggunakan private channel per user:

```text
private-App.Models.User.<uuid>
```

Endpoint autentikasi:

```text
POST /broadcasting/auth
Authorization: Bearer <sanctum-token>
```

Route menggunakan middleware `auth:sanctum`, dan channel hanya mengizinkan UUID pemilik. Reverb, queue worker, backend, dan frontend harus aktif.

## Odysseus dan MCP

ORVYN tidak membutuhkan Odysseus untuk berjalan. Untuk menambahkannya:

```bash
cd backend
php artisan orvyn:issue-agent-token your@email.com \
  --name=odysseus-local \
  --expires=90 \
  --replace \
  --env-file=/Users/zaidan/Coding/orvyn/mcp-server/.env
```

Tambahkan `--read-only` bila agent hanya boleh membaca data.

Verifikasi:

```bash
cd mcp-server
npm run check
npm test
npm run smoke
```

MCP berjalan melalui stdio dan tidak boleh diekspos sebagai service publik hanya untuk mempermudah koneksi.

Panduan lengkap: [docs/odysseus.md](./docs/odysseus.md) dan [mcp-server/README.md](./mcp-server/README.md).

## Pengujian

### Backend

```bash
cd backend
php artisan test
vendor/bin/pint --test
php artisan route:list
php artisan schedule:list
```

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

### Mobile

```bash
cd mobile
npm run typecheck
npm run doctor
npx expo export --platform all
```

Gunakan `npx expo install --check` untuk memastikan package cocok dengan SDK 57. Jangan menjalankan `npm audit fix --force` secara buta karena dapat menurunkan versi Expo ke SDK yang tidak kompatibel.

### WhatsApp sidecar

```bash
cd whatsapp-service
npm run check
npm run build
```

### MCP

```bash
cd mcp-server
npm run check
npm test
npm run smoke
npm audit --omit=dev
```

GitHub Actions menjalankan backend, frontend, mobile, WhatsApp, dan MCP secara terpisah pada pull request serta push ke `main`/`master`. Detail pemeriksaan dan maintenance ada di [docs/operations.md](./docs/operations.md).

## Deployment

### Mobile dengan EAS

Konfigurasi profile berada di `mobile/eas.json`.

```bash
cd mobile
npx eas-cli@latest login
npm run build:android:apk
npm run build:preview
npm run build:production
```

EAS environment `production` wajib sudah berisi nilai proyek yang nyata dan
saling cocok:

```text
EXPO_PUBLIC_ORVYN_BUILD_ENV=production
EXPO_PUBLIC_API_URL=https://<domain-production>/api/v1
EXPO_PUBLIC_FIREBASE_API_KEY=<Firebase public API key>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<project-id>
EXPO_PUBLIC_FIREBASE_APP_ID=1:<project-number>:web:<app-id>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web OAuth client>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS OAuth client yang berbeda>
EXPO_PUBLIC_DEMO_LOGIN_ENABLED=false
EXPO_PUBLIC_MANUAL_TOKEN_LOGIN_ENABLED=false
GOOGLE_SERVICES_JSON=<EAS File variable>
```

`GOOGLE_SERVICES_JSON` harus berupa EAS Environment Variable bertipe **File**
dari aplikasi Firebase Android `app.orvyn.mobile`. File tersebut harus memuat
OAuth client untuk SHA-1 signing release dan Web OAuth client yang sama dengan
nilai di atas. Jangan menyimpan file itu di Git atau memasukkannya ke image
server.

Selain environment variable, konfigurasikan kredensial FCM Android, APNs/iOS,
sertifikat/provisioning signing, serta kredensial submission Play Store/App
Store pada akun EAS yang benar. Build production menolak HTTP cleartext dan
konfigurasi Firebase/OAuth yang tidak cocok. Keberadaan nama environment saja
tidak membuktikan push/login bekerja: jalankan build `production` terbaru dan
uji login Google/Apple, registrasi token, serta push nyata pada perangkat fisik
Android dan iOS sebelum rilis.

Environment development/preview tetap harus memakai API yang memang dapat
dijangkau perangkat atau simulator; jangan menyalin secret server ke variabel
`EXPO_PUBLIC_*`.

EAS Update hanya untuk perubahan JavaScript/aset yang kompatibel dengan binary:

```bash
npm run update:preview -- --message "Deskripsi perubahan"
```

Perubahan native dependency, permission, plugin Expo, icon/splash native, atau SDK membutuhkan binary baru. Perubahan push/offline pada versi ini termasuk perubahan native, jadi jangan mengirimnya hanya lewat EAS Update ke APK lama. Naikkan app version/runtime dengan disiplin agar update tidak dikirim ke binary yang tidak kompatibel.

### Web

```bash
cd frontend
npm run build
```

Hasil statis berada di `frontend/dist/`. Atur `VITE_API_URL`, `VITE_REVERB_*`, HTTPS, CORS, dan fallback SPA pada hosting.

### Backend

Gunakan jalur production resmi di
[`deploy/README.md`](./deploy/README.md) dan ringkasannya di
[`docs/production-deployment.md`](./docs/production-deployment.md). Paket
tersebut menyediakan Caddy/TLS, PostgreSQL+pgvector, Redis, PHP-FPM, Horizon,
scheduler, Reverb, Ollama, WhatsApp sidecar, secret berbasis file, backup
restic off-site, scan image wajib, smoke test, dan rollback image-only.

Jangan menjalankan migrasi atau server development secara manual untuk
production. Jalankan skrip fail-closed berikut dari checkout yang bersih:

```bash
/opt/orvyn/deploy/scripts/preflight.sh \
  --env-file /etc/orvyn/.env.production

/opt/orvyn/deploy/scripts/deploy.sh \
  --env-file /etc/orvyn/.env.production
```

Detail pembuatan secret, inisialisasi restic, firewall, timer backup, restore
drill, dan rollback wajib diikuti dari panduan production sebelum menerima
traffic pengguna.

## Troubleshooting

### Aplikasi HP tidak dapat masuk dashboard

1. Jalankan `./scripts/orvyn status`.
2. Pastikan Laravel port `8000` online.
3. Pastikan `mobile/.env.local` memakai IP LAN Mac, bukan `127.0.0.1`.
4. Jalankan Laravel dengan host `0.0.0.0`.
5. Pastikan HP dan Mac berada pada Wi-Fi yang sama.
6. Izinkan PHP melalui macOS Firewall.
7. Bila IP Wi-Fi berubah, perbarui `.env.local` dan EAS preview.

### `cURL error 7` ke port `3100`

WhatsApp sidecar belum aktif atau URL salah:

```bash
./scripts/orvyn status
./scripts/orvyn logs whatsapp
curl http://127.0.0.1:3100/health
```

### WhatsApp online tetapi tidak membalas

- Pastikan session berstatus `connected`.
- Nomor pengirim harus sama dengan nomor yang disimpan pada integrasi pengguna.
- Integrasi harus aktif dan memiliki consent.
- Secret backend dan sidecar harus sama.
- Periksa log backend serta `whatsapp`.
- Chat ke nomor sendiri didukung; kirim `Menu` sebagai pemeriksaan paling sederhana.
- Bila session lama terus gagal mendekripsi pesan, lepaskan ORVYN dari **Perangkat tertaut** WhatsApp dan scan QR baru. Folder `whatsapp-service/sessions/` jangan disalin atau dibagikan.

Rotasi ulang bila perlu:

```bash
./scripts/rotate-local-secrets
./scripts/orvyn restart
```

### Reminder tidak terkirim

- Queue worker dan scheduler harus online.
- Periksa timezone, feature toggle, waktu briefing, dan lead time.
- Periksa failed jobs:

  ```bash
  cd backend
  php artisan queue:failed
  ```

- Retry hanya job yang sudah diperiksa:

  ```bash
  php artisan queue:retry <job-uuid>
  ```

Jangan langsung menjalankan `queue:retry all`; job realtime atau reminder lama dapat sudah tidak relevan.

### Push notification mobile tidak masuk

- Pastikan aplikasi adalah development/preview/production build baru, bukan Expo Go Android atau APK lama.
- Izinkan notifikasi pada pengaturan sistem HP.
- Pastikan queue worker dan scheduler online.
- Pastikan `EXPO_PUSH_ENABLED=true`.
- Buka aplikasi ketika online agar token perangkat didaftarkan.
- Cek `GET /api/v1/push-notifications` dan kirim `POST /api/v1/push-notifications/test`.
- Untuk Android/iOS production, pastikan kredensial FCM/APNs sudah dikonfigurasi pada EAS.

Error `DeviceNotRegistered` otomatis menonaktifkan token lama agar queue tidak terus mengirim ke instalasi yang sudah tidak valid.

### Mobile menampilkan mode offline

Cache hanya dipakai untuk request baca yang sudah pernah berhasil. Sambungkan jaringan untuk login pertama dan untuk menyimpan perubahan. ORVYN sengaja tidak mengantre mutasi saat offline agar aplikasi tidak menampilkan perubahan yang belum benar-benar tersimpan di server.

### Ollama offline

```bash
ollama serve
ollama list
curl http://127.0.0.1:11434/api/tags
```

Pastikan `qwen3:4b` dan `nomic-embed-text` sudah tersedia.

### Realtime tidak tersambung

```bash
./scripts/orvyn status
./scripts/orvyn logs reverb
```

Pastikan:

- Reverb port `8080` online.
- `BROADCAST_CONNECTION=reverb`.
- `REVERB_APP_KEY` sama dengan `VITE_REVERB_APP_KEY`.
- Frontend memakai `/broadcasting/auth`, bukan `/api/v1/broadcasting/auth`.
- Sanctum token masih valid.

### MCP tidak melihat task

- Token mungkin berasal dari user lain.
- Token mungkin expired.
- Ability mungkin hanya `orvyn:read` untuk operasi mutasi.
- Jalankan `npm run smoke` dari `mcp-server`.

### Status service terlihat mati

```bash
./scripts/orvyn status
./scripts/orvyn logs
./scripts/orvyn restart
```

Pengelola memakai `tmux` bila tersedia. Daftar session:

```bash
tmux list-sessions
```

## Keamanan

- Jangan commit `.env`, Sanctum token, API key, session WhatsApp, atau database production.
- Jalankan `./scripts/rotate-local-secrets` setelah clone pertama dan setiap kali secret diduga bocor.
- Gunakan secret berbeda untuk service token dan webhook HMAC.
- Simpan WhatsApp sidecar dan Ollama pada localhost/private network.
- Batasi CORS ke origin yang benar.
- Gunakan HTTPS untuk API production.
- Set `APP_DEBUG=false` dan `DEMO_LOGIN_ENABLED=false` pada production.
- Simpan Firebase service-account dan `EXPO_ACCESS_TOKEN` sebagai server secret, bukan file tracked.
- Gunakan scoped, expiring, dan sebisa mungkin read-only token untuk agent.
- Review mutating MCP tool sebelum mengizinkan agent berjalan autonomously.
- Jangan memasukkan secret ke `EXPO_PUBLIC_*` atau `VITE_*`; keduanya menjadi bagian bundle client.
- Uji ekspor/penghapusan akun dan publikasikan Privacy Policy sebelum membuka pendaftaran umum.
- Buat backup terverifikasi dan simpan salinan di media/host berbeda.

## Dokumentasi lanjutan

- [Backend](./backend/README.md)
- [Frontend](./frontend/README.md)
- [Mobile](./mobile/README.md)
- [WhatsApp Assistant](./docs/whatsapp-assistant.md)
- [Provider AI](./docs/api-keys.md)
- [Operasional, backup, failed jobs, dan CI](./docs/operations.md)
- [Deployment production](./deploy/README.md)
- [Odysseus](./docs/odysseus.md)
- [MCP Server](./mcp-server/README.md)

## Lisensi

Belum ada file `LICENSE` pada repository. Tentukan lisensi proyek sebelum distribusi publik dan samakan metadata package/backend dengan keputusan tersebut.
