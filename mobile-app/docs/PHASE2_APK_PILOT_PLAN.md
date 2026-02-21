# Phase 2 Plan: Internal APK Pilot

## Objective
Menyiapkan build APK internal pertama dan menjalankan pilot terbatas untuk validasi lapangan.

## Deliverables
- APK internal siap install.
- Daftar tester dan skenario uji.
- Catatan issue + prioritas perbaikan.
- Keputusan go/no-go untuk batch tester berikutnya.

## Execution Steps
1. Environment Readiness
- Jalankan `npm run check:all`.

2. Build Internal APK
- Login Expo: `npx expo login`
- Build: `npm run build:android:internal:auto`
- Simpan URL artifact build untuk tester.

3. Controlled Distribution
- Bagikan APK hanya ke grup pilot kecil (5-15 user).
- Sertakan instruksi install dan catatan known limitation.

4. Pilot Validation (3-5 hari)
- Uji login/logout/restore session.
- Uji halaman profil/jadwal/nilai/absensi.
- Uji jaringan lambat/offline sementara.
- Catat issue: blocker, major, minor.

5. Stabilization
- Perbaiki blocker + major.
- Rilis ulang APK internal.
- Re-test regresi pada skenario inti.

## Success Criteria
- Tidak ada crash blocker selama pilot.
- Alur auth stabil pada perangkat uji.
- Data mobile konsisten dengan data web untuk akun yang sama.
- Waktu respon halaman inti dapat diterima tester.

## Risks
- Perbedaan perilaku antar perangkat Android.
- Masalah install APK pada device dengan policy ketat.
- Gangguan jaringan yang memengaruhi experience.
