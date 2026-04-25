# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 16:04 WIB
- Current status: Batch 1 Presensi Harian Terpadu selesai, source terbaru sudah dideploy ke web live dan OTA mobile `pilot-live`.
- Last completed repo work:
  - Commit: `624ce83b286bf054bc5e822e7e9a7c681a52a997`
  - Title: `feat(attendance): add daily presence time policy config`
  - Summary: Menambahkan konfigurasi jam presensi harian dari TU untuk web/mobile, endpoint policy presensi aktif, realtime cache scoped, dan guard agar konfigurasi jam pelajaran Wakakur tidak menimpa policy presensi.
- Worktree expectation: clean setelah commit dan push batch ini.
- Publish/live status: web live aktif; OTA Android `pilot-live` berhasil publish, update group `01cf19ed-137a-4ecf-936a-af8ffabe7626`.
- Progress presensi terpadu: 35%. Fondasi konfigurasi TU selesai; QR monitor bersama, scan user mobile, pencatatan multi-role guru/staff, dan aturan guru berbasis jadwal mengajar masih batch berikutnya.

## Verifikasi Batch Terakhir

- Web deploy:
  - Jalur aman yang dipakai: `cd backend && npm run build`, PM2 reload `sis-backend`, `cd frontend && npm run deploy`.
  - Health: backend `200`, backend API `200`, `https://siskgb2.id/` `200`, PM2 `sis-backend` online.
- Mobile OTA:
  - `cd mobile-app && npm run update:pilot-live:auto`
  - Safety gate mobile lolos: typecheck dan parity audit.
  - EAS update: Android `pilot-live`, update group `01cf19ed-137a-4ecf-936a-af8ffabe7626`.
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
- Jika lanjut presensi terpadu, batch berikutnya adalah QR monitor TU otomatis dan scan dari mobile user; pastikan desain persistence multi-role aman dulu karena tabel existing `daily_attendances` dan `daily_presence_events` masih student-centric.
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
