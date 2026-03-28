# Academic Year Rollover Rollout Checklist

Checklist ini dipakai untuk menyiapkan tahun ajaran baru secara aman sebelum promotion dijalankan.

## 1. Scope MVP Wizard

Wizard yang sudah diimplementasikan saat ini mencakup:

- membuat atau memakai draft `AcademicYear` target yang nonaktif
- clone kelas target promotion `XI/XII` dari source `X/XI`
- clone `teacher_assignments` yang belum ada di target
- clone `subject_kkms` untuk target year dengan fallback aman dari data global/source year
- clone `exam_grade_components`
- clone `exam_program_configs`
- clone `exam_program_sessions`
- clone `schedule_time_config` jika target belum punya
- clone `academic_events` dengan pergeseran tanggal relatif ke awal semester 1

Belum dicakup di MVP ini:

- kelas `X` untuk intake baru
- mapel dan kategori mapel karena tetap master global
- histori siswa, nilai, absensi, rapor, dan dokumen lama
- `report_dates` karena admin flow-nya belum matang dan data existing saat ini masih kosong

## 2. Guardrail Sebelum Uji

- Pastikan branch clean dan sinkron:
  - `git status --short`
  - `git status -sb`
  - `bash ./scripts/git-sync-gate.sh`
- Build scope terkait:
  - `cd backend && npm run build`
  - `cd frontend && npm run build`
  - `cd mobile-app && npm run typecheck`
- Feature flag default server-side adalah `OFF`.
- Untuk cek/toggle flag rollover:
  - `bash ./scripts/set-academic-rollover-flag.sh --check`
  - `bash ./scripts/set-academic-rollover-flag.sh on --reload`

## 3. Smoke Test Aman di Clone DB

- Jalankan smoke test clone DB:
  - `bash ./scripts/smoke-test-academic-year-rollover-clone.sh`
- Opsi yang tersedia:
  - `--source-year-id <ID>`
  - `--target-name "<NAME>"`
  - `--keep-clone`

Smoke test ini memverifikasi:

- draft target year dibuat/reuse dengan aman
- preview dan hasil apply selaras
- apply pertama membuat data sesuai preview, termasuk KKM dan konfigurasi ujian
- apply kedua idempotent dan tidak membuat duplikasi baru
- status year target tetap nonaktif
- data siswa source year tidak berubah

## 4. Checklist Uji UI Web dan Mobile

- Nyalakan flag rollover di staging:
  - `ACADEMIC_YEAR_ROLLOVER_ENABLED=true`
- Deploy backend/web dan update mobile sesuai jalur rilis normal.
- Login sebagai `ADMIN`.
- Buka `Year Setup Clone Wizard` di web dan mobile.
- Pastikan web dan mobile menampilkan:
  - daftar source year yang sama
  - daftar target year yang sama
  - summary component yang sama untuk kelas, assignment, KKM, komponen nilai, program ujian, sesi, jam jadwal, dan kalender
  - error dan warning yang sama
  - hasil apply yang sama

## 5. Checklist Fungsional

- Buat draft target year dari wizard.
- Pastikan target year baru masih `inactive`.
- Jalankan preview untuk pasangan source-target.
- Jika ada conflict kelas target, perbaiki dulu sebelum apply.
- Apply wizard dari satu kanal saja.
- Refresh web dan mobile lalu pastikan item `createCount` turun ke `0` untuk komponen yang berhasil di-clone.
- Setelah setup tahunan selesai, baru lanjut ke `Promotion Center`.

## 6. Go / No-Go

Go jika:

- smoke test clone DB `PASS`
- tidak ada blocking issue di workspace rollover
- target year masih nonaktif saat setup tahunan selesai
- parity web/mobile terverifikasi

No-Go jika:

- target class name bentrok tetapi level/jurusannya salah
- target class existing sudah terisi siswa aktif dan belum direview
- apply kedua masih membuat data baru
- ada indikasi data siswa source year berubah setelah wizard apply
