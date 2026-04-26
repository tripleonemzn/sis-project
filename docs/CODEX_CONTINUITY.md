# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-26 00:18 WIB
- Current status: Batch 5 Presensi Harian Terpadu dan hotfix QR/scanner tetap selesai. Impor historis absensi siswa TKJ (`Jul 2025 - Apr 2026`) dari file Excel di `etc/absensi` ke `daily_attendances` sudah selesai dan tervalidasi match dengan data harian workbook untuk siswa yang aktif di DB.
- Last completed repo work:
  - Commit: `16419210dd3dec27194a6928c34f1bc35b5c7e52`
  - Title: `fix(presence): stabilize qr monitor and mobile scanner`
  - Summary: Membatasi layout QR monitor bersama web agar maksimal 360px dan memakai grid valid, serta mengganti scanner mobile embedded menjadi modal kamera layar penuh reusable untuk presensi pribadi dan scanner petugas.
- Worktree expectation: clean setelah commit/push finalisasi impor historis ini.
- Publish/live status: tidak ada publish baru pada batch ini karena hanya menambah tooling backend audit/importer; publish web dan OTA terakhir tetap sesuai hotfix QR/scanner di atas.
- Progress presensi terpadu operasional: 100%.
- Progress impor historis absensi siswa TKJ: 100%.
  - Selesai: audit workbook, verifikasi aturan blok merah, cek roster DB vs Excel, buat script importer reusable, apply impor final ke database, dan verifikasi pasca-impor.
  - Catatan: `20` siswa di workbook yang tidak ada di roster aktif DB tetap tidak diimpor; semuanya memang baris yang kosong total pada data harian.

## Verifikasi Batch Terakhir

- Backend/runtime:
  - `cd backend && npm run build`
  - `cd backend && npm run attendance:import:tkj`
  - `cd backend && npm run attendance:import:tkj -- --apply --allow-overwrite`
  - Dry-run/final verification result:
    - candidate rows `47,628`
    - apply created `47,595` row baru
    - apply overwrite `8` row existing agar match Excel (`2` late -> present, `6` conflict di `XII TKJ 1` tanggal `2026-02-05`)
    - post-import dry-run: `createRows 0`, `conflictingExistingRows 0`, `unchangedRows 47,628`
    - unknown codes `0`
    - blank active cells `0`
    - unmatched Excel students `20`
- Audit workbook:
  - blok merah terbukti aman di-skip sebagai libur/tidak dihitung
  - mismatch roster Excel vs DB aktif = `20` siswa, dan semuanya adalah baris yang memang kosong total di workbook
  - typo kode `I\\` pada `XII TKJ 2 Sep 25 P40` sudah ditangani importer dengan normalisasi kode non-alfabet
- Verifikasi distribusi data:
  - audit per kelas-per-bulan menunjukkan `expectedByMonth` = `actualByMonth` untuk seluruh `XI/XII TKJ 1-4` pada `Jul 2025 - Apr 2026`
- Publish/runtime:
  - tidak ada restart service atau publish baru karena batch ini belum mengubah runtime aplikasi

## Langkah Aman Berikutnya

- Data historis TKJ sekarang sudah siap dipakai oleh rapor walas karena source `daily_attendances` sudah terisi untuk `Jul 2025 - Apr 2026`.
- Jika user melanjutkan impor jurusan/tingkat lain, gunakan script yang sama sebagai baseline, lalu audit dulu roster aktif DB vs workbook sebelum apply.
- Script yang disiapkan:
  - `cd backend && npm run attendance:import:tkj` untuk dry-run
  - `cd backend && npm run attendance:import:tkj -- --apply` untuk create missing rows saja
  - `cd backend && npm run attendance:import:tkj -- --apply --allow-overwrite` untuk create + overwrite agar penuh mengikuti Excel

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
