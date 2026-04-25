# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 16:59 WIB
- Current status: Batch 4 Presensi Harian Terpadu selesai. QR monitor TU yang sama sekarang bisa dipakai siswa, guru, staff, kepsek, dan pembina ekskul eksternal dari mobile `Absensi Saya`.
- Last completed repo work:
  - Commit: `18255791d70e8bc4fb06ad596d0e13840161c83e`
  - Title: `feat(attendance): support staff teacher monitor presence`
  - Summary: Menambahkan tabel `daily_user_presences` dan `daily_user_presence_events`, jalur backend scan QR monitor untuk guru/staff/kepsek/pembina eksternal, aturan guru berbasis jadwal mengajar dan duty, aturan staff/kepsek berbasis konfigurasi TU, pengecualian pembina eksternal berbasis assignment ekskul aktif, serta menu mobile `Presensi Saya` untuk role non-siswa.
- Worktree expectation: clean setelah commit dan push batch ini.
- Publish/live status: migration deploy berhasil, backend reload sehat, web live tetap `200`, OTA Android `pilot-live` berhasil publish, update group `090c5a54-ec52-420b-b107-73a598fa0551`.
- Progress presensi terpadu: 85%. Konfigurasi TU, monitor QR bersama, scan siswa, dan scan multi-role mobile sudah selesai; rekap/monitoring TU untuk data non-siswa, riwayat presensi non-siswa yang lebih lengkap, dan mekanisme manual Sabtu guru duty masih batch berikutnya.

## Verifikasi Batch Terakhir

- Web deploy:
  - Jalur aman yang dipakai: `cd backend && npx prisma migrate deploy`, `cd backend && npx prisma generate`, `cd backend && npm run build`, PM2 reload `sis-backend`, `cd backend && npm run service:health`.
  - Tidak ada perubahan frontend web pada batch 4; web live dicek tetap `200`.
  - Health: backend `200`, backend API `200`, `https://siskgb2.id/` `200`, PM2 `sis-backend` online.
  - `cd backend && npx prisma migrate status` menunjukkan database schema up to date dengan 62 migrations.
- Mobile OTA:
  - `cd mobile-app && npm run update:pilot-live:auto`
  - Safety gate mobile lolos: typecheck dan parity audit.
  - EAS update: Android `pilot-live`, update group `090c5a54-ec52-420b-b107-73a598fa0551`, commit `18255791d70e8bc4fb06ad596d0e13840161c83e`.
  - Push notify update: recipients `3`, sent `3`, failed `0`, stale `0`.
  - Copy notifikasi OTA mengikuti script existing dan memuat `Silakan perbarui untuk menikmati fitur terbaru.`
- Verifikasi code:
  - `cd backend && npm run build`
  - `cd mobile-app && npm run typecheck`
  - `cd mobile-app && npm run audit:parity:check`
  - `git diff --check`

## Langkah Aman Berikutnya

- Untuk task web/mobile berikutnya, jalankan verifikasi minimum lalu deploy web dan/atau publish OTA mobile secara default, kecuali user eksplisit meminta publish ditahan.
- Jangan paksa `prisma db push --accept-data-loss` tanpa arahan eksplisit dan audit schema, karena deploy web sebelumnya menunjukkan warning drop tabel `exam_sitting_slot_proctors`.
- Jika lanjut presensi terpadu, batch berikutnya sebaiknya fokus pada visibility operasional TU: gabungkan event siswa dan non-siswa di monitor/rekap, tambahkan riwayat pribadi non-siswa yang layak, dan buat mekanisme manual Sabtu guru duty sesuai konfigurasi TU.
- Jangan simpan presensi guru/staff ke tabel student-centric. Gunakan `daily_user_presences` dan `daily_user_presence_events` untuk role non-siswa.
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
