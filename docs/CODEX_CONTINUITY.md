# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-25 18:49 WIB
- Current status: Batch 5 Presensi Harian Terpadu dan hotfix QR/scanner tetap selesai. Task aktif baru: audit + dry-run impor absensi historis siswa TKJ (`Jul 2025 - Apr 2026`) dari file Excel di `etc/absensi` ke `daily_attendances` agar bisa terbaca di rapor walas.
- Last completed repo work:
  - Commit: `16419210dd3dec27194a6928c34f1bc35b5c7e52`
  - Title: `fix(presence): stabilize qr monitor and mobile scanner`
  - Summary: Membatasi layout QR monitor bersama web agar maksimal 360px dan memakai grid valid, serta mengganti scanner mobile embedded menjadi modal kamera layar penuh reusable untuk presensi pribadi dan scanner petugas.
- Worktree expectation: clean setelah commit/push batch audit importer historis ini.
- Publish/live status: tidak ada publish baru pada batch ini karena hanya menambah tooling backend audit/importer; publish web dan OTA terakhir tetap sesuai hotfix QR/scanner di atas.
- Progress presensi terpadu operasional: 100%.
- Progress impor historis absensi siswa TKJ: 75%.
  - Selesai: audit workbook, verifikasi aturan blok merah, cek roster DB vs Excel, buat script importer dry-run reusable.
  - Belum selesai: keputusan overwrite 6 existing row konflik pada `XII TKJ 1` tanggal `2026-02-05`, lalu apply impor final ke database jika disetujui.

## Verifikasi Batch Terakhir

- Backend/runtime:
  - `cd backend && npm run build`
  - `cd backend && npm run attendance:import:tkj`
  - Dry-run result utama:
    - candidate rows `47,628`
    - create rows `47,595`
    - compatible existing rows `2` (`LATE` vs Excel `H/PRESENT`, aman dipertahankan)
    - conflicting existing rows `6` (semua di `XII TKJ 1`, tanggal `2026-02-05`)
    - unchanged rows `25`
    - unknown codes `0`
    - blank active cells `0`
    - unmatched Excel students `20`
- Audit workbook:
  - blok merah terbukti aman di-skip sebagai libur/tidak dihitung
  - mismatch roster Excel vs DB aktif = `20` siswa, dan semuanya adalah baris yang memang kosong total di workbook
  - typo kode `I\\` pada `XII TKJ 2 Sep 25 P40` sudah ditangani importer dengan normalisasi kode non-alfabet
- Publish/runtime:
  - tidak ada restart service atau publish baru karena batch ini belum mengubah runtime aplikasi

## Langkah Aman Berikutnya

- Jika user menyetujui impor historis:
  - opsi paling aman adalah `create-only` + pertahankan `2` row `LATE`
  - jika user ingin hasil 1:1 sesuai Excel, jalankan apply dengan overwrite `6` konflik di `XII TKJ 1` tanggal `2026-02-05`
- Script yang disiapkan:
  - `cd backend && npm run attendance:import:tkj` untuk dry-run
  - `cd backend && npm run attendance:import:tkj -- --apply` untuk create missing rows saja
  - `cd backend && npm run attendance:import:tkj -- --apply --allow-overwrite` untuk create + overwrite konflik
- Setelah apply final, wajib:
  - cek ulang total record per kelas/bulan yang terimpor
  - verifikasi rapor walas membaca rekap dari `daily_attendances`
  - update continuity lagi dengan hasil apply final

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
