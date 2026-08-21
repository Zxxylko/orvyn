# Operasional ORVYN

Dokumen ini berisi prosedur harian yang aman untuk menjalankan, memantau, dan
merawat ORVYN. Semua perintah dijalankan dari root repository.

## Menjalankan layanan lokal

```bash
./scripts/orvyn start
```

Tambahkan Metro hanya ketika sedang mengembangkan aplikasi mobile:

```bash
./scripts/orvyn start --with-expo
```

Perintah lain yang tersedia:

```bash
./scripts/orvyn status
./scripts/orvyn logs
./scripts/orvyn logs backend
./scripts/orvyn restart
./scripts/orvyn stop
```

Log runtime disimpan di `.orvyn/logs/` dan tidak dilacak oleh Git.

## Pemeriksaan operasional

Gunakan pemeriksaan gabungan untuk melihat layanan, database aktif, jumlah
failed jobs, dan backup terakhir:

```bash
./scripts/orvyn-maintenance status
```

Perintah ini tidak mengubah data.

## Backup database

Backup otomatis mendeteksi koneksi database Laravel:

```bash
./scripts/orvyn-maintenance backup
```

- SQLite dibackup memakai mekanisme online backup dari `sqlite3`.
- PostgreSQL dibackup dalam custom format memakai `pg_dump`.
- Password PostgreSQL tidak ditulis ke output atau nama proses. Skrip memakai
  file kredensial sementara berizin terbatas dan menghapusnya saat selesai.
- File backup dan checksum SHA-256 disimpan di `.orvyn/backups/`.
- Direktori `.orvyn/` diabaikan Git. Skrip menolak direktori tujuan di dalam
  repository jika direktori tersebut tidak diabaikan Git.

Tujuan di luar repository dapat ditentukan secara eksplisit:

```bash
./scripts/orvyn-maintenance backup --output-dir /path/aman/orvyn-backups
```

Simpan salinan backup di media terpisah dan terlindungi. Backup lokal pada
mesin yang sama tidak cukup untuk pemulihan bencana.

### Memeriksa checksum

macOS:

```bash
cd /path/aman/orvyn-backups
shasum -a 256 -c nama-backup.dump.sha256
```

Linux:

```bash
cd /path/aman/orvyn-backups
sha256sum -c nama-backup.dump.sha256
```

Lakukan pemulihan ke database uji terlebih dahulu. Jangan menimpa database
aktif sebelum layanan dihentikan dan backup terbaru telah diverifikasi.

## Membersihkan failed jobs

Mode default hanya menampilkan simulasi dan tidak menghapus apa pun:

```bash
./scripts/orvyn-maintenance prune-failed
```

Default retensi adalah 168 jam atau 7 hari. Retensi lain dapat diperiksa:

```bash
./scripts/orvyn-maintenance prune-failed --hours 720
```

Penghapusan hanya berjalan jika `--execute` diberikan secara eksplisit:

```bash
./scripts/orvyn-maintenance prune-failed --hours 720 --execute
```

Periksa penyebab failed jobs dan pastikan job baru berjalan normal sebelum
membersihkan riwayatnya. Jangan menjalankan ulang semua failed jobs lama secara
massal karena sebagian dapat merujuk pada data yang sudah dihapus.

## Continuous Integration

Workflow `.github/workflows/ci.yml` berjalan pada pull request, push ke
`main`/`master`, dan pemicu manual. Pemeriksaannya dipisahkan agar kegagalan
mudah dilacak:

| Job | Pemeriksaan |
| --- | --- |
| Backend | Composer validation/audit, Pint, dan Laravel tests dengan PHP 8.3 + SQLite |
| Backend PostgreSQL | Migrasi dan Laravel tests dengan PostgreSQL 17 + pgvector |
| Secret scan | Gitleaks terpin dan terverifikasi checksum untuk pohon release |
| Frontend | ESLint, production build, dan dependency audit |
| Mobile | TypeScript, Expo Doctor, export Android/iOS/web, dan high-severity audit |
| WhatsApp | TypeScript check, build, dan dependency audit |
| MCP | Syntax check, tests, dan dependency audit |

Semua paket JavaScript dipasang dengan `npm ci` berdasarkan lockfile. CI tidak
memerlukan token produksi, kredensial WhatsApp, atau koneksi Ollama.

Backend memakai SQLite in-memory untuk jalur cepat dan PostgreSQL 17 + pgvector
untuk memverifikasi jalur database produksi. Skrip
`scripts/prepare-sqlite-tests` hanya menyesuaikan cache provider Laravel yang
dihasilkan Composer, sehingga migrasi ekstensi PostgreSQL milik dependency
pgvector tidak dijalankan pada SQLite. Source aplikasi dan dependency tidak
diubah.

## Jadwal maintenance yang disarankan

- Harian: periksa status layanan dan error terbaru.
- Sebelum perubahan besar: buat backup database.
- Mingguan: verifikasi satu checksum backup dan ruang penyimpanan.
- Bulanan: review failed jobs, kemudian prune hanya setelah simulasi diperiksa.
- Berkala: uji proses pemulihan pada database non-produksi.
