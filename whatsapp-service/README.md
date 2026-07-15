# ORVYN WhatsApp Service

Sidecar TypeScript berbasis Baileys untuk pesan WhatsApp dua arah. Service ini hanya boleh diakses backend Laravel; jangan mengekspos port `3100` langsung ke internet.

## Menjalankan

```bash
cp .env.example .env
npm install
npm run dev
```

Samakan `WHATSAPP_SERVICE_TOKEN` dan `WHATSAPP_WEBHOOK_SECRET` dengan `backend/.env`. Buka **Preferensi Sistem → WhatsApp Assistant** di aplikasi, klik **Hubungkan**, lalu scan QR.

Backend Laravel harus menjalankan queue worker dan scheduler:

```bash
php artisan queue:work
php artisan schedule:work
```

Baileys bukan API resmi WhatsApp. Gunakan opt-in, hindari spam/bulk messaging, dan gunakan Meta Cloud API ketika ORVYN masuk produksi publik.
