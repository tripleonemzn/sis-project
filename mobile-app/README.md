# SIS Mobile App

Aplikasi mobile terpisah untuk Android/iOS, dibuat tanpa mengganggu `frontend/` dan `backend` production.

## Tujuan
- Reuse API backend yang sudah ada.
- Scope awal fokus MVP (login + dashboard ringkas + halaman inti read-only).
- Tidak ada perubahan breaking ke aplikasi web.

## Stack
- React Native
- Expo
- TypeScript
- TanStack Query
- React Hook Form + Zod
- Expo Secure Store

## Aturan Kerja
- Semua pekerjaan mobile ada di folder `mobile-app/`.
- Endpoint baru bersifat additive (`/api/mobile/*` atau endpoint existing yang kompatibel).
- Jangan mengubah perilaku endpoint web yang sudah production.

## Quick Start
1. Salin env:
   - `cp .env.example .env`
2. Install dependency:
   - `npm install`
3. Jalankan:
   - `npm run start`

## Validation
- `npm run doctor`
- `npm run typecheck`
- `npm run readiness`
- `npm run release:check`
- `npm run check:all`
- `npm run check:release`

## Versioning
- Bump patch + increment Android/iOS build number:
  - `npm run version:bump:patch`
- Bump minor:
  - `npm run version:bump:minor`
- Bump major:
  - `npm run version:bump:major`

## Internal APK Build (Android)
1. Login Expo:
   - `npx expo login`
2. Jalankan alur otomatis:
   - `npm run build:android:internal:auto`
3. Atau build manual:
   - `npm run build:android:internal`
   - `npm run build:android:internal:live` (khusus tester channel `pilot-live`)
   - `npm run build:android:tester` (alias untuk tester `pilot-live`)
4. Siapkan release note + checksum:
   - `npm run release:prepare -- /path/to/app.apk https://expo.dev/artifacts/...`
5. Install cepat ke device QA via ADB:
   - `npm run qa:install:adb -- /path/to/app.apk`

## OTA Update (Tanpa Install Ulang)
- Build profile menentukan channel OTA:
  - `internal` -> `pilot` (stabil)
  - `internal-live` -> `pilot-live` (real-time testing)
- Publish update code JS/UI/logic ke tester real-time (`pilot-live`):
  - `npm run update:pilot-live -- "Pesan update cepat"`
  - `npm run update:pilot-live:auto` (pesan otomatis timestamp + git ref)
- Publish update tester dengan channel yang benar secara otomatis:
  - `npm run check:ota:testers`
  - `npm run update:testers -- "Pesan uji fitur"`
- Publish update code JS/UI/logic ke tester stabil (`pilot`):
  - `npm run update:pilot -- "Pesan rilis update pilot"`
- Publish ke staging:
  - `npm run update:staging -- "Pesan rilis update staging"`
- Publish ke production:
  - `npm run update:production -- "Pesan rilis update production"`
- Audit seluruh channel Android yang reachable untuk runtime saat ini:
  - `npm run check:ota:all`
- Catatan:
  - OTA hanya untuk perubahan JS/UI/logic.
  - Perubahan native dependency tetap butuh build APK/AAB baru.
  - Perangkat akan menerima update dari channel sesuai APK yang terpasang.
  - App akan cek update saat startup, saat app kembali aktif, dan periodik di background.
  - Untuk ujicoba fitur harian, standarkan tester ke APK `internal-live` -> channel `pilot-live`.
  - Jika `appVersion` berubah, tester perlu install APK tester terbaru sekali agar runtime baru bisa menerima OTA lagi.
  - Jika sebuah channel tidak punya binary dengan runtime yang cocok, helper `update:testers` akan melewatinya dan menampilkan warning yang jelas.

## Pilot Docs
- `docs/DAY10_QA_CHECKLIST.md`
- `docs/ANDROID_INTERNAL_RELEASE.md`
- `docs/PHASE2_APK_PILOT_PLAN.md`
- `docs/PILOT_TESTER_ONBOARDING.md`
- `docs/PARITY_MATRIX_TEMPLATE.md`
- `docs/PARITY_MATRIX_BATCH01_STUDENT_TEACHER.md`
- `docs/MOBILE_UI_UX_GUIDELINES.md`

## Offline Fallback
- Halaman Profil, Jadwal, Nilai, dan Absensi menyimpan cache data terakhir.
- Saat API gagal, aplikasi otomatis menampilkan cache + indikator "Mode Offline".
- Cache offline memiliki TTL 24 jam.
- Snapshot cache per fitur dibatasi maksimal 6.
- Cleanup cache expired + prune snapshot dijalankan saat rehydrate session.
- Cache dapat dibersihkan manual dari menu Diagnostics (`Clear Local Cache`).
- Diagnostics menampilkan `Sync Status` (timestamp sync terakhir per fitur).
- Diagnostics dapat mengekspor report (share) berisi ringkasan build/API/sync/events untuk tim QA/dev.
- Sebelum export, tester bisa pilih severity (`BLOCKER/MAJOR/MINOR`) + isi ringkasan issue.
