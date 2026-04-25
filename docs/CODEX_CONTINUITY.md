# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 15:24 WIB
- Current status: Source terbaru sudah dideploy ke web live dan OTA mobile `pilot-live`.
- Last completed repo work:
  - Commit: cek commit terbaru dengan `git log -1 --stat --decorate`
  - Title: `docs(status): record latest live deploy`
  - Summary: Mencatat bahwa web live sudah diperbarui dan OTA Android `pilot-live` sudah dipublish untuk commit `b093378`.
- Worktree expectation: clean setelah commit dan push batch ini.
- Publish/live status: web live aktif; OTA Android `pilot-live` berhasil publish, update group `e34faec9-891c-4f2f-ae1a-cb45a2bae5ce`.

## Verifikasi Batch Terakhir

- Web deploy:
  - `bash ./scripts/deploy-web-isolated.sh` sempat dihentikan aman karena `prisma db push` mendeteksi potensi data loss pada `exam_sitting_slot_proctors` berisi 197 rows.
  - Jalur aman yang dipakai: `cd backend && npm run build`, PM2 reload `sis-backend`, `cd frontend && npm run deploy`.
  - Health: backend `200`, backend API `200`, `https://siskgb2.id/` `200`, aset presensi web `200`.
- Mobile OTA:
  - `cd mobile-app && npm run update:pilot-live:auto`
  - Safety gate mobile lolos: typecheck dan parity audit.
  - EAS update: Android `pilot-live`, update group `e34faec9-891c-4f2f-ae1a-cb45a2bae5ce`.
  - Push notify update: recipients `3`, sent `3`, failed `0`, stale `0`.

## Langkah Aman Berikutnya

- Untuk task web/mobile berikutnya, jalankan verifikasi minimum lalu deploy web dan/atau publish OTA mobile secara default, kecuali user eksplisit meminta publish ditahan.
- Jangan paksa `prisma db push --accept-data-loss` tanpa arahan eksplisit dan audit schema, karena deploy web terbaru menunjukkan warning drop tabel `exam_sitting_slot_proctors`.
- Jika lanjut audit presensi, fokus berikutnya adalah uji manual flow end-to-end: staff buka sesi, siswa buat QR, staff scan/confirm, lalu cek realtime update di web dan mobile.

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
