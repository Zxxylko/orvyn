# Konfigurasi provider AI

ORVYN memakai Ollama sebagai provider default. Tidak ada API key yang wajib untuk task parsing, briefing, WhatsApp intent, pertanyaan kontekstual, atau embedding.

## Ollama lokal

Install Ollama, lalu siapkan model:

```bash
ollama pull qwen3:4b
ollama pull nomic-embed-text
ollama serve
```

Atur `backend/.env`:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_TIMEOUT=60
AI_ENABLE_FALLBACK=true
```

Pastikan service terbaca:

```bash
curl http://127.0.0.1:11434/api/tags
```

Panel **Preferensi Sistem → WhatsApp Assistant** juga menampilkan status Ollama dan model yang dipakai.

## Fallback

Jika Ollama sedang offline:

1. ORVYN memakai Gemini bila `GEMINI_API_KEY` tersedia.
2. Tanpa Gemini, task parsing dan briefing memakai fallback deterministik bawaan.
3. Embedding dan jawaban AI kontekstual dilewati sampai provider kembali online.

Gemini bersifat opsional:

```env
GEMINI_API_KEY=
```

Untuk menjalankan Gemini sebagai provider utama:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
```

## Database vector

- SQLite menyimpan embedding sebagai JSON untuk pengembangan dan test.
- PostgreSQL memerlukan ekstensi pgvector dengan dimensi 768.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Keamanan

- Jangan commit `.env`, token, API key, atau file session WhatsApp.
- Bind Ollama dan WhatsApp sidecar ke localhost pada mesin pengembangan.
- Gunakan secret berbeda untuk `WHATSAPP_SERVICE_TOKEN` dan `WHATSAPP_WEBHOOK_SECRET`.
- Ganti secret segera bila pernah masuk log, screenshot, atau Git history.
