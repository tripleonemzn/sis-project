# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 16:41 WIB
- Current status: Batch 3 Presensi Harian Terpadu selesai. Siswa mobile sekarang bisa scan QR monitor TU langsung dari `Absensi Saya`.
- Last completed repo work:
  - Commit: `56458340eeaf930ed5c99278ae223d110e4b971d`
  - Title: `feat(attendance): let students scan shared monitor qr`
  - Summary: Menambahkan verifier token QR monitor, endpoint konfirmasi scan monitor untuk siswa, pencatatan presensi siswa langsung dari QR monitor, validasi window konfigurasi TU, hitung status telat untuk check-in, dan UI mobile scanner QR monitor sebagai alur utama.
- Worktree expectation: clean setelah commit dan push batch ini.
- Publish/live status: backend reload sehat, web live tetap aktif, OTA Android `pilot-live` berhasil publish, update group `3cab88c0-722c-4f71-88b5-cfbfae03f69c`.
- Progress presensi terpadu: 70%. Konfigurasi TU, monitor QR bersama, dan scan siswa mobile sudah selesai; pencatatan multi-role guru/staff, aturan guru berbasis jadwal mengajar, dan Sabtu duty masih batch berikutnya.

## Verifikasi Batch Terakhir

- Web deploy:
  - Jalur aman yang dipakai: `cd backend && npm run build`, PM2 reload `sis-backend`, `cd backend && npm run service:health`.
  - Tidak ada perubahan frontend web pada batch 3; web live dicek tetap `200`.
  - Health: backend `200`, backend API `200`, `https://siskgb2.id/` `200`, PM2 `sis-backend` online.
- Mobile OTA:
  - `cd mobile-app && npm run update:pilot-live:auto`
  - Safety gate mobile lolos: typecheck dan parity audit.
  - EAS update: Android `pilot-live`, update group `3cab88c0-722c-4f71-88b5-cfbfae03f69c`.
  - Push notify update: recipients `3`, sent `3`, failed `0`, stale `0`.
  - Copy notifikasi OTA mengikuti script existing dan memuat `Silakan perbarui untuk menikmati fitur terbaru.`
- Verifikasi code:
  - `cd backend && npm run build`
  - `cd mobile-app && npm run typecheck`
  - `cd mobile-app && npm run audit:parity:check`

## Langkah Aman Berikutnya

- Untuk task web/mobile berikutnya, jalankan verifikasi minimum lalu deploy web dan/atau publish OTA mobile secara default, kecuali user eksplisit meminta publish ditahan.
- Jangan paksa `prisma db push --accept-data-loss` tanpa arahan eksplisit dan audit schema, karena deploy web sebelumnya menunjukkan warning drop tabel `exam_sitting_slot_proctors`.
- Jika lanjut presensi terpadu, batch berikutnya adalah persistence multi-role guru/staff yang aman karena tabel existing `daily_attendances` dan `daily_presence_events` masih student-centric.
- Jangan simpan presensi guru/staff ke tabel student-centric. Siapkan tabel/kontrak baru yang aman, lalu integrasikan rule guru berbasis jadwal mengajar, staff berbasis konfigurasi TU, eksternal pembina ekskul berbasis jadwal ekskul, dan Sabtu duty.
- Pertahankan source of truth tahun ajaran aktif: endpoint policy presensi memakai tahun ajaran aktif dan tidak menambahkan selector tahun ajaran di layar operasional.

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
