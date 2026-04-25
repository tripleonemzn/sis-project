# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 16:27 WIB
- Current status: Batch 2 Presensi Harian Terpadu selesai. Monitor QR bersama untuk staff administrasi sudah live di web dan OTA mobile `pilot-live`.
- Last completed repo work:
  - Commit: `6833ccda811b457d77dff514749a43f5534bad06`
  - Title: `feat(attendance): add shared daily presence qr monitor`
  - Summary: Menambahkan payload monitor QR bersama pada session scan mandiri, tab `Monitor QR` di web/mobile staff administrasi, auto-refresh ringan saat monitor aktif, dan tetap menjaga flow scan petugas lama tetap aman.
- Worktree expectation: clean setelah commit dan push batch ini.
- Publish/live status: backend reload sehat, web live aktif, OTA Android `pilot-live` berhasil publish, update group `1e178bf8-171d-4bda-8056-f9a9946ead17`.
- Progress presensi terpadu: 55%. Fondasi konfigurasi TU dan monitor QR bersama sudah selesai; scan user mobile, pencatatan multi-role guru/staff, dan aturan guru berbasis jadwal mengajar masih batch berikutnya.

## Verifikasi Batch Terakhir

- Web deploy:
  - Jalur aman yang dipakai: `cd backend && npm run build`, `cd frontend && npm run build`, PM2 reload `sis-backend`, `cd backend && npm run service:health`, `cd frontend && npm run deploy`.
  - Health: backend `200`, backend API `200`, `https://siskgb2.id/` `200`, PM2 `sis-backend` online.
- Mobile OTA:
  - `cd mobile-app && npm run update:pilot-live:auto`
  - Safety gate mobile lolos: typecheck dan parity audit.
  - EAS update: Android `pilot-live`, update group `1e178bf8-171d-4bda-8056-f9a9946ead17`.
  - Push notify update: recipients `3`, sent `3`, failed `0`, stale `0`.
  - Copy notifikasi OTA mengikuti script existing dan memuat `Silakan perbarui untuk menikmati fitur terbaru.`
- Verifikasi code:
  - `cd backend && npm run build`
  - `cd frontend && npm run build`
  - `cd mobile-app && npm run typecheck`
  - `cd mobile-app && npm run audit:parity:check`

## Langkah Aman Berikutnya

- Untuk task web/mobile berikutnya, jalankan verifikasi minimum lalu deploy web dan/atau publish OTA mobile secara default, kecuali user eksplisit meminta publish ditahan.
- Jangan paksa `prisma db push --accept-data-loss` tanpa arahan eksplisit dan audit schema, karena deploy web sebelumnya menunjukkan warning drop tabel `exam_sitting_slot_proctors`.
- Jika lanjut presensi terpadu, batch berikutnya adalah scan dari mobile user terhadap QR monitor bersama, lalu desain persistence multi-role guru/staff yang aman karena tabel existing `daily_attendances` dan `daily_presence_events` masih student-centric.
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
