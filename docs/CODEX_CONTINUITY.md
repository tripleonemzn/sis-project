# Codex Continuity Handoff

Dokumen ini adalah source of truth progres kerja antar-room chat untuk project ini.
Setiap room baru yang diminta `baca AGENTS.md` atau `lanjutkan` wajib membaca file ini setelah membaca `AGENTS.md`, lalu mencocokkan isinya dengan `git status --short` dan commit terbaru.

## Status Saat Ini

- Last updated: 2026-04-26 20:18 WIB
- Current status: Batch 3 penyempurnaan `Program Perangkat Ajar` selesai, sudah live di web, dan OTA mobile tester sudah dipublish. Backend/DB tidak diubah; batch ini menyamakan jalur authoring guru web-mobile agar schema starter dari Wakakur terisi lebih konsisten saat dipakai guru.
- Last completed repo work:
  - Commit: `7139eb6`
  - Title: `feat(mobile): support dynamic teaching resource schema values`
  - Companion commit: `c8b75e7` (`feat(curriculum): hydrate teaching resource web editor`)
  - Summary: Web guru kini menormalisasi/hydrate schema saat editor berubah dan saat save, sedangkan mobile guru kini membaca metadata kolom schema lebih lengkap (`dataType`, `valueSource`, `semanticKey`, `bindingKey`, `readOnly`, `options`) serta mengisi nilai `SYSTEM_*`/`BOUND` secara generik.
- Task aktif:
  - Objective: menyederhanakan pengalaman Wakakur saat menambah/mengedit `Program Perangkat Ajar` tanpa mengorbankan fleksibilitas dinamis untuk batch engine berikutnya.
  - Batch terakhir selesai: Batch 3 kompatibilitas authoring guru web-mobile.
  - Progress keseluruhan roadmap perangkat ajar dinamis: `50%`.
  - Area/file disentuh:
    - `frontend/src/pages/teacher/learning-resources/LearningResourceGenerator.tsx`
    - `mobile-app/src/features/learningResources/TeacherLearningResourceProgramScreen.tsx`
    - `mobile-app/src/features/learningResources/teachingResourceProgramApi.ts`
  - Ringkasan hasil batch:
    - web guru meng-hydrate nilai sistem/bound saat section berubah, baris baru ditambah, editor `/new` dibuka, dan saat payload disimpan
    - editor `/new` web menunggu assignment guru selesai dimuat sebelum auto-fill konteks, sehingga judul/konteks dokumen tidak mudah kosong
    - mobile guru kini memahami metadata kolom schema yang sama dengan web untuk kebutuhan starter dinamis
    - mobile guru mengisi `SYSTEM_ACTIVE_YEAR`, `SYSTEM_SEMESTER`, `SYSTEM_SUBJECT`, `SYSTEM_CLASS_LEVEL`, `SYSTEM_CLASS_NAME`, `SYSTEM_SKILL_PROGRAM`, `SYSTEM_TEACHER_NAME`, `SYSTEM_PLACE_DATE`, dan `BOUND` dengan pola generik
    - kolom mobile yang dikelola sistem/read-only tidak bisa diedit manual, agar konteks operasional tetap mengikuti source of truth
    - tidak ada perubahan kontrak backend, migrasi data, polling, realtime, atau query baru
- Worktree expectation: clean setelah commit/push finalisasi Batch 3.
- Publish/live status: frontend web sudah live. OTA mobile tester `pilot-live` sudah dipublish dengan update group `37a2ee8b-6356-49c9-a3d7-74bd0340617b`; push notify update berhasil `recipients=3, sent=3`.
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
- Verifikasi Batch 2 UI Wakakur `Program Perangkat Ajar`:
  - `cd frontend && npm run build`
  - `git diff --check`
  - `cd frontend && npm run deploy`
  - `curl -I https://siskgb2.id/` merespons `200`
  - sanity check perubahan:
    - batch ini frontend-only; tidak ada perubahan API payload `teaching-resources/programs`
    - starter template hanya mengganti schema draft lokal di modal sebelum disimpan oleh Wakakur
    - schema starter tetap memakai struktur `sections` dan `columns` yang sudah ada, sehingga kompatibel dengan editor lama
    - mode lanjutan masih memuat seluruh editor schema detail lama sehingga blast radius perilaku tetap kecil
- Verifikasi Batch 3 authoring guru web-mobile `Program Perangkat Ajar`:
  - `cd frontend && npm run build`
  - `cd mobile-app && npm run typecheck`
  - `cd mobile-app && npm run audit:parity:check`
  - `git diff --check`
  - `cd frontend && npm run deploy`
  - `curl -I https://siskgb2.id/` merespons `200`
  - `cd mobile-app && npm run check:ota:testers`
  - `cd mobile-app && npm run update:testers -- "Penyempurnaan Perangkat Ajar: schema starter kini lebih konsisten di web dan mobile. Silakan perbarui untuk menikmati fitur terbaru."`
  - OTA result:
    - channel `pilot-live`
    - runtime `0.2.2`
    - update group `37a2ee8b-6356-49c9-a3d7-74bd0340617b`
    - Android update ID `019dc9f1-2675-7071-898d-180bbe59fb47`
    - commit `7139eb6c814fffa4d4456793782c78a0753f3329`
    - push notify `recipients=3, sent=3, failed=0, stale=0`
  - sanity check perubahan:
    - batch ini tidak menambah endpoint, polling, websocket, query berat, atau invalidate global baru
    - semua perubahan tetap memakai schema/program API existing
    - web/mobile sama-sama mengikuti tahun ajaran aktif dan assignment guru sebagai source of truth konteks dokumen

## Langkah Aman Berikutnya

- Lanjutkan Batch 4 perangkat ajar dengan fokus aman berikut:
  - uji manual live jalur Wakakur membuat starter `Analisis Bertingkat` dan `Distribusi Waktu`, lalu guru membuat dokumen dari program tersebut di web dan mobile
  - audit hasil print/renderer web terhadap schema starter, terutama apakah kolom `MONTH`, `WEEK`, `WEEK_GRID`, dan konteks dokumen tampil cukup rapi
  - jika perlu engine type, mulai dari metadata kompatibel tanpa migrasi dan tanpa mengubah program existing
  - jangan menyentuh backend sebelum ada kebutuhan nyata dari uji manual renderer/authoring
- Jika room baru diminta melanjutkan fitur ini, mulai dari cek live halaman Wakakur `Program Perangkat Ajar`, lalu cek halaman guru web/mobile untuk program hasil starter sebelum menambah kompleksitas engine.
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
