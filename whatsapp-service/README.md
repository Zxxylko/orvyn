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

Perintah dari chat ke nomor WhatsApp sendiri didukung. Setelah status terhubung, kirim `Menu` ke chat diri sendiri untuk memeriksa balasan ORVYN. Baileys v7 memerlukan sinkronisasi metadata awal untuk pemetaan PN/LID; ORVYN tetap menonaktifkan sinkronisasi riwayat penuh.

Folder `sessions/` berisi kredensial perangkat dan wajib tetap privat. Log internal Baileys dibuat `silent` secara default agar JID/nomor tidak bocor ke log. Jika session lama terus menghasilkan kegagalan dekripsi, putuskan perangkat ORVYN dari **Perangkat tertaut** WhatsApp lalu hubungkan ulang lewat QR. Nomor WhatsApp khusus lebih stabil daripada akun pribadi dengan riwayat grup yang besar.

Baileys bukan API resmi WhatsApp. Gunakan opt-in, hindari spam/bulk messaging, dan gunakan Meta Cloud API ketika ORVYN masuk produksi publik.
