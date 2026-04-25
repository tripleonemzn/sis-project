# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 17:37 WIB
- Current status: Batch 5 Presensi Harian Terpadu selesai, lalu hotfix visibilitas mobile presensi sudah dipublish. Rekap operasional TU menggabungkan siswa + non-siswa, riwayat pribadi non-siswa tersedia di mobile `Absensi Saya`, bantuan manual Sabtu guru duty/non-siswa lewat petugas TU, dan dashboard mobile sekarang menampilkan akses langsung `Scan Presensi`.
- Last completed repo work:
  - Commit: `eaf30237ae3c98718bbaecc4febd0b28af7a3c43`
  - Title: `fix(mobile): surface daily presence scanner on dashboard`
  - Summary: Menambahkan kartu/tombol `Scan Presensi` langsung di dashboard mobile untuk role presensi pribadi, mengganti label siswa dari `Riwayat Kehadiran` menjadi `Presensi Saya`, dan memprioritaskan `staff-own-presence` di aksi cepat staff.
- Worktree expectation: clean setelah commit docs continuity dan push akhir hotfix ini.
- Publish/live status: backend dan web tetap mengikuti kondisi sehat batch 5; hotfix mobile sudah OTA Android `pilot-live`, update group `5477e83f-9b1f-40bc-81fc-8b63ca75ec24`.
- Progress presensi terpadu: 100%. Batch konfigurasi TU, monitor QR bersama, scan siswa, scan multi-role mobile, rekap gabungan TU, riwayat non-siswa, dan assisted manual Sabtu duty sudah selesai.

## Verifikasi Batch Terakhir

- Backend/runtime:
  - `cd backend && npm run build`
  - `cd backend && npm run service:restart`
  - `cd backend && npm run service:health`
  - Health: backend `200`, backend API `200`, PM2 `sis-backend` online setelah reload.
- Frontend web:
  - `cd frontend && npm run build`
  - `cd frontend && npm run deploy`
  - Live check: `https://siskgb2.id/` `200`.
- Mobile:
  - `cd mobile-app && npm run typecheck`
  - `cd mobile-app && npm run audit:parity:check`
  - `cd mobile-app && npm run update:pilot-live:auto`
  - EAS update batch 5: Android `pilot-live`, update group `2a411896-363f-4aa4-bd47-1b89c0e3fa3e`, commit `77ba398d096d76b2fd72d11310254cd73eef0c55`.
  - EAS update hotfix scan mobile: Android `pilot-live`, update group `5477e83f-9b1f-40bc-81fc-8b63ca75ec24`, commit `eaf30237ae3c98718bbaecc4febd0b28af7a3c43`.
  - Push notify update: recipients `3`, sent `3`, failed `0`, stale `0`.
- Hygiene:
  - `git diff --check`

## Langkah Aman Berikutnya

- Jika ada perubahan lanjutan di domain presensi, pertahankan pemisahan tabel student-centric vs non-student (`daily_attendances` vs `daily_user_presences`) dan jangan campur persistence-nya.
- Pertahankan source of truth tahun ajaran aktif: endpoint operasional presensi tetap mengikuti academic year aktif tanpa selector tambahan di UI.
- Jika nanti diminta enhancement lanjutan, area aman berikutnya adalah quality-of-life kecil seperti filter riwayat TU, export rekap, atau audit badge, bukan perubahan besar di kontrak runtime.
- Untuk task web/mobile berikutnya, tetap jalankan verifikasi minimum lalu deploy/publish sesuai policy repo kecuali user minta ditahan.

## Template Update Wajib Saat Ada Pekerjaan Baru

- Objective/task aktif:
- Batch/wave terakhir selesai:
- Progress:
- Area/file yang disentuh:
- Verifikasi yang sudah dijalankan:
- Publish/live status:
- Sisa pekerjaan:
- Blocker/residual risk:
- Langkah aman berikutnya:
- Last updated:
- Commit hash terkait:

## Aturan Isi

- Tulis singkat, faktual, dan jujur.
- Jangan isi asumsi yang tidak bisa diverifikasi dari repo atau hasil kerja sesi berjalan.
- Jika task belum selesai, update file ini sebelum sesi berakhir agar room baru bisa langsung melanjutkan tanpa bergantung pada history chat lama.
