# ORVYN Frontend

React 19 + TypeScript + Vite untuk dashboard ORVYN. UI memakai dark glassmorphism, layout responsif, Framer Motion, dan komponen Radix UI.

## Menjalankan

```bash
cp .env.example .env
npm install
npm run dev
```

Backend default tersedia di `http://127.0.0.1:8000`. Sesuaikan `VITE_API_URL` bila memakai alamat lain.

## Verifikasi

```bash
npm run lint
npm run build
```

Pengaturan WhatsApp berada pada menu akun **Preferensi Sistem → WhatsApp Assistant**. Panel tersebut menampilkan status service, status Ollama, QR pairing, consent, waktu briefing, lead time reminder, dan feature toggle.
