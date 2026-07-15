# ORVYN

Student operating system untuk mengelola tugas, jadwal, akademik, habit, kesehatan, keuangan, dan risiko burnout dalam satu aplikasi. AI lokal Ollama membantu parsing tugas dan briefing; WhatsApp dapat dipakai sebagai reminder serta remote control dua arah.

## Fitur utama

- Smart task input, task matrix, detail tugas, focus timer, dan time blocking.
- Briefing harian berbasis beban kerja, deadline, jadwal, serta sinyal kesehatan.
- Kalender, jadwal kampus, academic tracker, habit, health guard, dan finance tracker.
- Realtime update melalui Laravel Reverb.
- WhatsApp Assistant untuk reminder, input tugas, quick actions, review mingguan, dan pencatatan singkat.
- Ollama sebagai provider AI default dengan fallback deterministik saat model tidak tersedia.

## Stack

- Backend: PHP 8.3, Laravel 13, Sanctum, Horizon, Reverb, SQLite atau PostgreSQL + pgvector.
- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS 4, Framer Motion.
- AI lokal: Ollama (`qwen3:4b` dan `nomic-embed-text`).
- WhatsApp: sidecar TypeScript berbasis Baileys.
- Agent workspace opsional: Odysseus melalui ORVYN MCP server.

## Struktur proyek

```text
orvyn/
├── backend/              # Laravel API, queue, scheduler, database, dan tests
├── frontend/             # React + Vite
├── whatsapp-service/     # Transport WhatsApp TypeScript
├── mcp-server/           # MCP integration server
├── docs/                 # Panduan setup dan operasi
├── .kiro/specs/          # Product requirements dan design specs
└── README.md
```

## Menjalankan aplikasi

Prasyarat: PHP 8.3+, Composer, Node.js 20+, dan Ollama bila ingin memakai AI lokal.

### Backend

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan serve
```

Jalankan queue dan scheduler di terminal terpisah:

```bash
cd backend
php artisan queue:work
php artisan schedule:work
```

Untuk akun demo:

```bash
cd backend
php artisan db:seed --class=DemoSeeder
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Buka `http://localhost:5173`, lalu masuk menggunakan token hasil seeder.

## AI lokal dengan Ollama

```bash
ollama pull qwen3:4b
ollama pull nomic-embed-text
ollama serve
```

Konfigurasi default backend:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Task parsing dan briefing tetap memiliki fallback saat Ollama offline. Detailnya ada di [panduan WhatsApp Assistant](./docs/whatsapp-assistant.md).

## WhatsApp Assistant

```bash
cd whatsapp-service
cp .env.example .env
npm install
npm run dev
```

Samakan `WHATSAPP_SERVICE_TOKEN` dan `WHATSAPP_WEBHOOK_SECRET` pada `backend/.env` serta `whatsapp-service/.env`. Setelah backend, queue, scheduler, dan sidecar aktif, buka **Preferensi Sistem → WhatsApp Assistant** untuk memberikan consent dan scan QR.

Baileys bukan API resmi WhatsApp. Jangan mengekspos port sidecar ke internet, hindari broadcast/spam, dan gunakan Meta Cloud API untuk produksi publik.

## Verifikasi

```bash
cd backend && php artisan test
cd frontend && npm run lint && npm run build
cd whatsapp-service && npm run check && npm run build
```

## Dokumentasi

- [WhatsApp Assistant dan Ollama](./docs/whatsapp-assistant.md)
- [Integrasi Odysseus](./docs/odysseus.md)
- [Konfigurasi provider AI](./docs/api-keys.md)
- [MCP server](./mcp-server/README.md)

## Lisensi

Proprietary — ORVYN.
