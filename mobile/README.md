# ORVYN Mobile

Mobile client untuk ORVYN berbasis Expo SDK 57, React Native, dan TypeScript. Backend Laravel tetap menjadi sumber data dan satu-satunya service yang diakses langsung oleh aplikasi.

## Fitur

- Login produksi Google, serta Sign in with Apple pada iOS, melalui Firebase ID-token exchange; login demo/token manual hanya tersedia jika sengaja diaktifkan pada build non-production.
- Token terenkripsi melalui Expo SecureStore (Keychain/Keystore).
- Session logout direvoke di backend; push token perangkat dilepas secara best-effort saat logout.
- Penghapusan akun tersedia di dalam aplikasi, meminta autentikasi Firebase baru, lalu menghapus identitas login dan data ORVYN.
- Cache baca terpisah per user, fallback data terakhir, dan indikator koneksi global saat offline.
- Push notification native untuk deadline, briefing, habit, progres, burnout, review mingguan, dan waktu berangkat kelas.
- Dashboard reaktif: flow score, tugas terlambat, progres, beban, fokus, streak, dan habit.
- Tugas lengkap: smart input melalui Ollama, buat manual, detail/edit, filter, complete/reopen, dan hapus.
- Jadwal mingguan: CRUD time block, tautkan tugas, kunci blok, serta optimasi AI.
- Focus timer 15/25/45 menit dengan pause/resume, rating, riwayat, dan sinkronisasi focus log.
- Briefing AI harian berisi workload, rekomendasi, timeline, kesehatan, dan ringkasan finansial.
- Modul Akademik dan Kampus untuk tugas kuliah, LMS, kelas, ruang, dosen, perjalanan, dan persiapan.
- Modul Keuangan dan Kesehatan untuk budget, transaksi, hidrasi, kafein, tidur, screen time, dan alert.
- Habit harian dengan check-in, streak, edit, aktif/nonaktif, dan hapus.
- Pengaturan WhatsApp lengkap: status service/Ollama, QR, consent, timezone, jadwal reminder, feature toggle, dan tes pesan.
- Navigasi lima tab `Beranda`, `Tugas`, `Jadwal`, `Hub`, dan `Akun` yang mengikuti dark theme ORVYN.

WhatsApp, Ollama, PostgreSQL, queue, scheduler, dan Odysseus MCP tetap berjalan di server. Mobile tidak boleh mengakses port `3100`, `11434`, database, atau MCP secara langsung.

Login produksi memakai `react-native-nitro-google-signin`, integrasi native modern yang didokumentasikan Expo dan menggunakan Android Credential Manager. Paket ini dikecualikan dari pemeriksaan metadata React Native Directory karena metadata direktorinya belum menandai dukungan New Architecture; kompatibilitas aktual tetap diverifikasi lewat export lintas-platform dan EAS native build.

## Menjalankan lokal

Persyaratan utama Expo SDK 57 adalah Node.js 22.13 atau lebih baru.

```bash
cd /Users/zaidan/Coding/orvyn/mobile
cp .env.example .env.local
npm install
npm start
```

Untuk memeriksa UI/cache lewat Expo Go tanpa Android Studio/Xcode, jalankan:

```bash
npm run start:device
```

Pastikan HP dan Mac berada di Wi-Fi yang sama. Scan QR yang muncul di terminal, sedangkan backend harus dijalankan dengan `--host=0.0.0.0`.

Expo Go hanya cocok untuk UI/cache, local notification, serta login diagnostik yang diaktifkan eksplisit. Login Google dan remote push membutuhkan development/preview build ORVYN karena menggunakan modul native.

Jalankan proses berikut di tiga terminal terpisah:

```bash
cd /Users/zaidan/Coding/orvyn/backend
php artisan serve --host=0.0.0.0 --port=8000
```

```bash
cd /Users/zaidan/Coding/orvyn/backend
php artisan queue:work
```

```bash
cd /Users/zaidan/Coding/orvyn/backend
php artisan schedule:work
```

### API URL

Simulator iOS atau Expo Web:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
```

Android Emulator:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
```

HP fisik harus berada pada Wi-Fi yang sama dan menggunakan IP LAN Mac:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/api/v1
```

`127.0.0.1` pada HP menunjuk ke HP itu sendiri, bukan Mac. Pastikan firewall mengizinkan port backend. Untuk preview/production gunakan API HTTPS.

`.env.local` hanya untuk development lokal dan tidak ikut Git. Jika IP Wi-Fi Mac berubah, perbarui nilainya sebelum menjalankan `npm run start:device`.

Build `development` dan `preview` mengizinkan HTTP lokal agar dapat terhubung ke backend Mac di jaringan yang sama. Build `production` menonaktifkan cleartext traffic dan wajib memakai endpoint publik HTTPS `/api/v1`. Aturan ini dikontrol oleh `EXPO_PUBLIC_ORVYN_BUILD_ENV` di `eas.json` dan `app.config.ts`.

## Verifikasi

```bash
npm run typecheck
npm run doctor
npx expo export --platform all
```

## Deployment dengan EAS

1. Buat project Expo dan hubungkan konfigurasi:

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   npx eas-cli@latest update:configure
   ```

   Login dan pembuatan project ini memerlukan akun Expo. `update:configure` akan menambahkan `owner`, `extra.eas.projectId`, dan `updates.url` yang benar; jangan menebak UUID tersebut secara manual.

2. Isi EAS Environment Variables berikut untuk profile production:

   ```text
   EXPO_PUBLIC_API_URL
   EXPO_PUBLIC_FIREBASE_API_KEY
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
   EXPO_PUBLIC_FIREBASE_PROJECT_ID
   EXPO_PUBLIC_FIREBASE_APP_ID
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
   GOOGLE_SERVICES_JSON
   ```

   Simpan `GOOGLE_SERVICES_JSON` sebagai EAS Environment Variable bertipe **File** untuk production. File tersebut harus berasal dari aplikasi Android Firebase `app.orvyn.mobile`, memuat OAuth client untuk SHA-1 signing release, dan memuat Web OAuth client yang sama dengan `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

   Buat OAuth client Google Web, Android (`app.orvyn.mobile` + SHA-1), dan iOS (`app.orvyn.mobile`) di project yang sama. Web client dan iOS client harus berbeda. Aktifkan Sign in with Apple untuk bundle ID yang sama di Apple Developer dan Firebase Authentication. Nilai `EXPO_PUBLIC_*` serta `google-services.json` bukan kredensial server, tetapi tetap batasi API key dan origin OAuth ke aplikasi/domain resmi. Jangan pernah memasukkan `APP_KEY`, password database, token WhatsApp, MCP token, Ollama credential, atau service-account key ke aplikasi.

   Build production akan berhenti otomatis bila konfigurasi login tidak lengkap/tidak valid, endpoint bukan HTTPS publik, atau mode demo/token manual diaktifkan.

3. Buat APK Android yang dapat langsung dipasang:

   ```bash
   npm run build:android:apk
   ```

4. Build bertahap untuk pengujian dan store:

   ```bash
   npm run build:preview
   npm run build:production
   ```

   Untuk mengirim perubahan JavaScript/aset ke APK preview yang sudah terpasang:

   ```bash
   npm run update:preview -- --message "Deskripsi perubahan"
   ```

   Profil `development-simulator` membuat aplikasi iOS Simulator tanpa Apple Developer Account. Xcode lengkap tetap diperlukan untuk menjalankan Simulator di Mac:

   ```bash
   npm run build:ios:simulator
   ```

5. Submit setelah pengujian:

   ```bash
   npx eas-cli@latest submit --profile production --platform android
   npx eas-cli@latest submit --profile production --platform ios
   ```

Gunakan EAS Update hanya untuk perubahan JavaScript/aset yang kompatibel dengan native runtime. Versi ini menambahkan `expo-notifications`, `expo-device`, `expo-network`, dan AsyncStorage, sehingga APK/IPA lama wajib dibangun ulang. EAS Update saja tidak cukup.

## Sebelum production

- Aktifkan provider Google dan Apple di Firebase Authentication, pasang OAuth client Android/iOS beserta SHA-1 signing, unggah `GOOGLE_SERVICES_JSON` sebagai EAS File variable, serta gunakan service-account project yang sama pada backend.
- Konfigurasikan kredensial FCM/APNs di EAS dan uji push pada binary release.
- Publikasikan Privacy Policy serta isi Apple App Privacy dan Google Play Data Safety. Endpoint ekspor/penghapusan akun sudah tersedia.
- Gunakan domain API HTTPS dan pisahkan dev, staging, serta production.
- Isi seluruh environment EAS production di atas; profile production tidak menyediakan fallback lokal.
