# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-26 15:16 WIB
- Current status: Batch 1 penyempurnaan `Program Perangkat Ajar` sedang berjalan aman. Pondasi backend/perilaku guru belum diubah; batch ini hanya merapikan UI web Wakakur agar pengaturan program tidak langsung membuka semua level schema teknis sekaligus.
- Last completed repo work:
  - Commit: `a08a113`
  - Title: `feat(curriculum): simplify teaching resource program editor`
  - Summary: Menyederhanakan modal `Tambah/Edit Program Perangkat Ajar` di sisi Wakakur web dengan pola `Mode Sederhana` dan `Mode Lanjutan`, menambah pembacaan arah dokumen + ringkasan template, dan tetap menjaga schema editor detail lama sebagai jalur aman lanjutan.
- Task aktif:
  - Objective: menyederhanakan pengalaman Wakakur saat menambah/mengedit `Program Perangkat Ajar` tanpa mengorbankan fleksibilitas dinamis untuk batch engine berikutnya.
  - Batch terakhir selesai: Batch 1 UI simplification Wakakur web.
  - Progress keseluruhan roadmap perangkat ajar dinamis: `20%`.
  - Area/file disentuh:
    - `frontend/src/pages/teacher/wakasek/curriculum/TeachingResourceProgramManagementPage.tsx`
  - Ringkasan hasil batch:
    - modal `Tambah/Edit Program Perangkat Ajar` sekarang dibagi ke `Mode Sederhana` dan `Mode Lanjutan`
    - mode sederhana menampilkan `Identitas Program`, `Mode Konfigurasi`, `Arah Dokumen & Metadata`, dan `Ringkasan Template Guru`
    - schema editor detail `section & kolom` tetap utuh, tetapi hanya muncul saat `Mode Lanjutan` dibuka
    - ada inferensi pola dokumen berbasis struktur schema saat ini (`Analisis Bertingkat`, `Distribusi Waktu`, `Matriks Grid`, `Narasi + Tabel`, `Kustom Fleksibel`) untuk membantu Wakakur memahami arah template tanpa harus membaca key kolom satu-satu
    - tidak ada perubahan kontrak backend, migrasi data, atau perubahan runtime di sisi guru/mobile pada batch ini
- Worktree expectation: clean setelah commit/push finalisasi batch UI Wakakur ini.
- Publish/live status: frontend web sudah live untuk batch UI Wakakur ini. Backend dan OTA mobile tidak terdampak.
- Progress presensi terpadu operasional: 100%.
- Progress impor historis absensi siswa TKJ: 100%.
  - Selesai: audit workbook, verifikasi aturan blok merah, cek roster DB vs Excel, buat script importer reusable, apply impor final ke database, dan verifikasi pasca-impor.
  - Catatan: `20` siswa di workbook yang tidak ada di roster aktif DB tetap tidak diimpor; semuanya memang baris yang kosong total pada data harian.
- Progress impor historis absensi siswa AK/MP: 100%.
  - Selesai: audit folder `etc/absensi/AK&MP`, dry-run, apply final, dan verifikasi pasca-impor.
  - Catatan roster mismatch:
    - `6` siswa ada di workbook tetapi tidak ada di roster aktif DB, sehingga tidak diimpor: `Fairuz Ghaissani`, `Dania Razaika`, `Desty Kuswanto`, `Niza Nur Irawati`, `Carens Mezaluna`, `Razka Yulia Ayu Priani`
    - `1` siswa ada di DB tetapi tidak ada di workbook: `Bima Sakti Saputra` (`X MP 1`)
  - Catatan data harian:
    - ada `2` blank active cells pada workbook sumber: `Rendi Amanda` (`X MP 1`, `Sep 25`, `V35`) dan `Puspita Dwi Aryani` (`XII AK 1`, `Feb 26`, `P29`)

## Verifikasi Batch Terakhir

- Backend/runtime:
  - `cd backend && npm run build`
  - `cd backend && npm run attendance:import:tkj`
  - `cd backend && npm run attendance:import:tkj -- --apply --allow-overwrite`
  - Verifikasi TKJ:
    - candidate rows `47,628`
    - apply created `47,595` row baru
    - apply overwrite `8` row existing agar match Excel (`2` late -> present, `6` conflict di `XII TKJ 1` tanggal `2026-02-05`)
    - post-import dry-run: `createRows 0`, `conflictingExistingRows 0`, `unchangedRows 47,628`
    - unknown codes `0`
    - blank active cells `0`
    - unmatched Excel students `20`
  - Verifikasi AK/MP:
    - `cd backend && npm run attendance:import:tkj -- --base-dir "/var/www/sis-project/etc/absensi/AK&MP"`
    - `cd backend && npm run attendance:import:tkj -- --base-dir "/var/www/sis-project/etc/absensi/AK&MP" --apply --allow-overwrite`
    - candidate rows `101,245`
    - apply created `101,245` row baru
    - post-import dry-run: `createRows 0`, `conflictingExistingRows 0`, `unchangedRows 101,245`
    - unknown codes `0`
    - blank active cells `2`
    - unmatched Excel students `6`
    - db students missing from workbook `1`
- Audit workbook:
  - blok merah terbukti aman di-skip sebagai libur/tidak dihitung
  - mismatch roster Excel vs DB aktif = `20` siswa, dan semuanya adalah baris yang memang kosong total di workbook
  - typo kode `I\\` pada `XII TKJ 2 Sep 25 P40` sudah ditangani importer dengan normalisasi kode non-alfabet
- Verifikasi distribusi data:
  - audit per kelas-per-bulan menunjukkan `expectedByMonth` = `actualByMonth` untuk seluruh `XI/XII TKJ 1-4` pada `Jul 2025 - Apr 2026`
  - audit per kelas untuk AK/MP menunjukkan total record DB sama dengan candidate row workbook untuk seluruh kelas `X/XI/XII AK 1-2` dan `X/XI/XII MP 1-4` yang tersedia
- Publish/runtime:
  - tidak ada restart service atau publish baru karena batch ini belum mengubah runtime aplikasi
- Verifikasi pilot QR rapor SBTS:
  - backend:
    - `cd backend && npm run build`
    - `cd backend && npm run service:restart`
    - `cd backend && npm run service:health`
    - sample public verification `GET /api/public/report-cards/verify/:token` berhasil `200`
  - frontend:
    - `cd frontend && npm run build`
    - `cd frontend && npm run deploy`
    - route publik `https://siskgb2.id/verify/report-card/:token` merespons `200`
  - implementasi:
    - endpoint rapor siswa `/api/reports/student` sekarang menyisipkan payload `footer.legality` khusus konteks `SBTS`
    - cetak rapor SBTS di web sekarang menampilkan QR verifikasi pada blok tanda tangan wali kelas
    - halaman verifikasi publik baru tersedia di `/verify/report-card/:token`
- Verifikasi follow-up bugfix SBTS setelah QR:
  - audit source of truth nilai:
    - `git log -1 --stat --decorate` pada commit QR menunjukkan perubahan hanya di area legality/verification, tidak menyentuh formula nilai rapor
    - `cd backend && node -r ./node_modules/ts-node/register ...reportService.getStudentReport(1483, 4, 'ODD', 'SBTS', 'SBTS')...`
    - hasil sample siswa `Ajeng Rahman` (`X MP 1`) tetap menunjukkan nilai sumber normal: `Bahasa Indonesia SBTS 78`, `Matematika SBTS 78`, `Dasar-dasar Manajemen Perkantoran SBTS 90`
    - kesimpulan: QR tidak mengubah perhitungan nilai SBTS; issue yang terlihat user bukan berasal dari commit QR
  - build/runtime:
    - `cd backend && npm run build`
    - `cd backend && npm run service:restart`
    - `cd backend && npm run service:health`
    - `cd frontend && npm run build`
    - `cd frontend && npm run deploy`
    - `curl -I https://siskgb2.id/` merespons `200`
  - verifikasi angka desimal:
    - payload SBTS midterm di `report.service.ts` kini menormalisasi `col2Score` dengan `normalizeRoundedFinalScore(...)`
    - renderer print SBTS di frontend kini memformat semua angka tampilan maksimal 2 digit desimal
    - scan sample report siswa yang sama menunjukkan tidak ada lagi score dengan desimal lebih dari 2 digit (`excessive: []`)
  - verifikasi performa print:
    - service `reportService.getStudentReport(...)` untuk sample siswa terukur sekitar `135ms`
    - bottleneck frontend sebelumnya berasal dari `setTimeout(..., 500)` sebelum `print()`
    - alur print sekarang menunggu aset yang benar-benar diperlukan (`fonts/images`) lalu langsung `print()`, tanpa delay statis 500ms
  - verifikasi format tampilan final:
    - renderer print SBTS kini selalu memakai `toFixed(2)` untuk seluruh score yang tercetak
    - contoh target format: `78` menjadi `78.00`
- Verifikasi batch UI Wakakur `Program Perangkat Ajar`:
  - `cd frontend && npm run build`
  - `cd frontend && npm run deploy`
  - `curl -I https://siskgb2.id/` merespons `200`
  - sanity check perubahan:
    - batch ini frontend-only; tidak ada perubahan API payload `teaching-resources/programs`
    - modal editor tetap menyimpan schema yang sama seperti sebelumnya; perubahan hanya pada cara menampilkan dan membungkus konfigurasi agar lebih mudah dipahami
    - mode lanjutan masih memuat seluruh editor schema detail lama sehingga blast radius perilaku tetap kecil

## Langkah Aman Berikutnya

- Lanjutkan Batch 2 perangkat ajar dengan fokus aman berikut:
  - audit apakah Wakakur membutuhkan `visual preset starter` yang benar-benar mengubah struktur schema lokal, atau cukup membaca `arah dokumen` seperti batch 1
  - jika lanjut implementasi engine, mulai dari kontrak ringan yang tidak merusak program existing: tambahkan konsep `engine type` secara kompatibel dulu, baru susul renderer/authoring guru
  - prioritas berikutnya paling sehat adalah `grouped-analysis` dan `time-distribution`, karena dua pola ini paling dekat dengan kebutuhan nyata user untuk analisis capaian, prota, promes, dan sebaran waktu
- Jika room baru diminta melanjutkan fitur ini, cek dulu tampilan live halaman `Program Perangkat Ajar` dan pastikan mode sederhana sudah terasa lebih mudah dipakai sebelum menambah kompleksitas batch berikutnya.
- Data historis TKJ + AK/MP sekarang sudah siap dipakai oleh rapor walas karena source `daily_attendances` sudah terisi untuk `Jul 2025 - Apr 2026`.
- Jika user melanjutkan impor jurusan/tingkat lain, gunakan script yang sama sebagai baseline, lalu audit dulu roster aktif DB vs workbook sebelum apply.
- Jika user ingin melanjutkan uji SBTS, langkah paling aman sekarang adalah minta user cetak ulang rapor SBTS nyata setelah bugfix decimal/print live, lalu cocokkan angka dan rasa respons print.
- Jika user puas dengan pilot SBTS, langkah lanjutan paling aman adalah memperluas pola QR yang sama ke SAS/SAT/rapor akhir tanpa mengganti kontrak dasar verifikasi publik.
- Script yang disiapkan:
  - `cd backend && npm run attendance:import:tkj` untuk dry-run
  - `cd backend && npm run attendance:import:tkj -- --apply` untuk create missing rows saja
  - `cd backend && npm run attendance:import:tkj -- --apply --allow-overwrite` untuk create + overwrite agar penuh mengikuti Excel
  - untuk folder lain: tambah `--base-dir "/path/ke/folder"` saat menjalankan script yang sama

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
