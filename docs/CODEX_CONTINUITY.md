# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 15:20 WIB
- Current status: Policy kerja diperbarui agar perubahan web/mobile default langsung deploy/publish live untuk ujicoba, kecuali user eksplisit meminta jangan deploy/publish dulu.
- Last completed repo work:
  - Commit: cek commit terbaru dengan `git log -1 --stat --decorate`
  - Title: `docs(policy): default to live web and mobile publish`
  - Summary: Memperjelas `AGENTS.md` bahwa deploy web dan publish OTA mobile adalah default penyelesaian task UI setelah verifikasi lolos.
- Worktree expectation: clean setelah commit dan push batch ini.
- Publish/live status: perubahan policy dokumen saja; tidak membutuhkan deploy web atau OTA mobile.

## Verifikasi Batch Terakhir

- Review diff `AGENTS.md` dan `docs/CODEX_CONTINUITY.md`
- Tidak ada build/typecheck yang diperlukan karena perubahan hanya policy dokumentasi.

## Langkah Aman Berikutnya

- Untuk task web/mobile berikutnya, jalankan verifikasi minimum lalu deploy web dan/atau publish OTA mobile secara default, kecuali user eksplisit meminta publish ditahan.
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
