# Android Internal Release (APK)

## Tujuan
Distribusi aplikasi internal untuk pilot tanpa publish ke Play Store.

## Prasyarat
- Node.js LTS
- Akun Expo/EAS
- `mobile-app/.env` terisi
- `app.json` sudah berisi package Android (`id.siskgb2.mobile`)

## Setup Sekali
1. Login Expo
```bash
npx expo login
```

2. Install dependency
```bash
npm install
```

3. Validasi project
```bash
npm run check:release
```

## Build APK Internal
```bash
npm run build:android:internal:auto
```

Alternatif manual:
```bash
npm run build:android:internal
```

Hasil:
- EAS akan menghasilkan URL download APK internal.
- Bagikan URL hanya ke tester pilot.

## Distribusi Aman
- Aktifkan grup tester terbatas.
- Cantumkan checksum SHA-256 APK di catatan rilis internal.
- Simpan changelog per build.
- Gunakan helper release note:
```bash
npm run release:prepare -- /path/to/app.apk https://expo.dev/artifacts/...
```

## Validasi Setelah Install
1. Login dengan akun uji.
2. Cek alur sesi (login/logout/restore).
3. Cek halaman profil, jadwal, nilai, absensi.
4. Cek kondisi internet lambat/offline.
5. Jika testing via kabel USB + debugging:
```bash
npm run qa:install:adb -- /path/to/app.apk
```

## Jika Gagal Build
- Jalankan `npm run doctor` dan perbaiki isu.
- Pastikan env variabel dan package id valid.
- Pastikan akun EAS memiliki izin build.
