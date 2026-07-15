# WhatsApp Assistant

ORVYN menggunakan Laravel sebagai sumber data dan scheduler, Ollama sebagai AI lokal, serta sidecar TypeScript Baileys sebagai transport WhatsApp.

## Kemampuan

- Briefing harian dan reminder deadline per timezone.
- Input tugas dengan bahasa natural.
- Daftar tugas dan jadwal hari ini/besok.
- Quick actions: selesai, mulai, dan tunda.
- Update jadwal kampus, check-in progres, burnout guard, dan weekly review.
- Logging habit, hidrasi, tidur, screen time, kafein, dan pengeluaran.
- Pertanyaan kontekstual seperti `apa prioritas saya?`.

## Jadwal reminder lanjutan

Dialog **WhatsApp Assistant** memisahkan notifikasi otomatis dari perintah chat. Setiap jadwal mengikuti timezone pengguna dan dapat diaktifkan atau dimatikan sendiri-sendiri:

- Briefing harian pada jam pilihan.
- Reminder deadline bertahap, mulai dari 7 hari sampai 30 menit sebelumnya.
- Check-in progres pada jam pilihan.
- Burnout guard pada jam pilihan dan hanya dikirim ketika beban memang tinggi.
- Check-in habit dan kesehatan pada jam pilihan.
- Review mingguan dengan hari dan jam pilihan.

Setiap tahap reminder deadline memiliki dedupe key sendiri. Scheduler boleh berjalan setiap menit tanpa mengirim tahap yang sama dua kali.

## Setup Ollama

```bash
ollama pull qwen3:4b
ollama pull nomic-embed-text
ollama serve
```

Backend menggunakan konfigurasi berikut:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

Jika Ollama tidak tersedia, task parsing dan briefing kembali ke Gemini bila API key tersedia, lalu ke parser deterministik jika kedua provider mati.

## Setup WhatsApp sidecar

Gunakan token dan secret acak yang sama pada `backend/.env` dan `whatsapp-service/.env`:

```env
WHATSAPP_SERVICE_TOKEN=<random-long-token>
WHATSAPP_WEBHOOK_SECRET=<different-random-secret>
```

Jalankan seluruh proses:

```bash
cd whatsapp-service && npm install && npm run dev
cd backend && php artisan queue:work
cd backend && php artisan schedule:work
```

Kemudian buka menu akun **Preferensi Sistem**, isi nomor, berikan consent, simpan, klik **Hubungkan**, dan scan QR.

## Keamanan dan operasi

- Port sidecar tidak boleh diekspos langsung ke internet.
- Laravel → sidecar memakai bearer token.
- Sidecar → webhook Laravel memakai HMAC SHA-256.
- Pesan masuk dan keluar memiliki dedupe key agar aksi tidak dijalankan dua kali.
- Session Baileys berada di `whatsapp-service/sessions/` dan diabaikan Git.
- Gunakan hanya untuk pengguna yang opt-in; hindari broadcast dan spam.
- Untuk produksi publik, implementasikan driver Meta Cloud API di balik `WhatsAppGateway`.

## Contoh chat

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
