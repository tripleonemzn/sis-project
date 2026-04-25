# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 15:16 WIB
- Current status: Batch perapihan presensi harian self-scan selesai.
- Last completed repo work:
  - Commit: cek commit terbaru dengan `git log -1 --stat --decorate`
  - Title: `fix(attendance): tighten daily presence self-scan parity`
  - Summary: Merapikan parity UI presensi harian self-scan dengan countdown QR mobile siswa yang ikut berdetak, istilah mobile staff `Bantu Petugas`, dan penghapusan teks tahun ajaran aktif yang redundan di workspace staff.
- Worktree expectation: clean setelah commit dan push batch ini.
- Publish/live status: belum dipublish OTA/deploy live dari batch ini; source siap setelah commit/push dan verifikasi lolos.

## Verifikasi Batch Terakhir

- `cd backend && npm run build`
- `cd frontend && npm run build`
- `cd mobile-app && npm run typecheck`
- `cd mobile-app && npm run audit:parity:check`

## Langkah Aman Berikutnya

- Jika user meminta tester langsung mencoba hasil UI ini, jalankan workflow publish/deploy existing untuk web/mobile sesuai channel yang dipakai.
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
