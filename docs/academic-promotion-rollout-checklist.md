# Academic Promotion Rollout Checklist

Checklist ini dipakai untuk rollout fitur promotion kenaikan kelas/alumni dengan aman, terukur, dan tanpa mengganggu production.

## 1. Scope Rilis

- Backend API promotion v2
- UI web admin `Promotion Center`
- UI mobile admin `Promotion Center`
- Migration additive untuk `promotion_runs`, `promotion_run_items`, `promotion_class_mappings`, dan `student_academic_memberships`

## 2. Guardrail Sebelum Staging

- Pastikan branch yang akan dirilis sudah committed.
- Default server-side flag promotion v2 adalah `OFF`.
- Nyalakan hanya saat siap uji di staging atau saat jendela eksekusi production:
  - `ACADEMIC_PROMOTION_V2_ENABLED=true`
- Untuk menghindari edit manual `.env`, gunakan helper:
  - `bash ./scripts/set-academic-promotion-flag.sh --check`
  - `bash ./scripts/set-academic-promotion-flag.sh on --reload`
- Jika target year belum ada, siapkan dulu secara dry-run:
  - `bash ./scripts/prepare-academic-promotion-target.sh --source-year <SOURCE_ID>`
- Jika hasil dry-run sudah benar, baru apply:
  - `bash ./scripts/prepare-academic-promotion-target.sh --source-year <SOURCE_ID> --apply`
- Pastikan worktree clean:
  - `git status --short`
- Pastikan branch sinkron dengan upstream:
  - `bash ./scripts/git-sync-gate.sh`
- Jalankan safety gate web:
  - `bash ./scripts/repo-safety-gate.sh web`
- Atau jalankan preflight staging/production secara terstruktur:
  - `bash ./scripts/run-academic-promotion-preflight.sh --source-year <SOURCE_ID> --target-year <TARGET_ID>`
- Jalankan safety gate mobile:
  - `bash ./scripts/repo-safety-gate.sh mobile`
- Audit promotion untuk pasangan tahun yang akan diuji:
  - `cd backend`
  - `npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID>`
- Jika ingin smoke test otomatis di clone DB terisolasi:
  - `bash ./scripts/smoke-test-academic-promotion-clone.sh`
  - `bash ./scripts/smoke-test-academic-report-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-attendance-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-permission-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-internship-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-ukk-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-proctor-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-exam-sitting-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-exam-restriction-history-clone.sh`
  - `bash ./scripts/smoke-test-academic-finance-history-clone.sh`
  - `bash ./scripts/smoke-test-finance-refund-backfill-clone.sh`

## 3. Deploy ke Staging

### Web / Backend

- Deploy web stack:
  - `bash ./scripts/release-manager.sh web deploy`
- Deploy web sekarang berjalan via worktree terisolasi:
  - `bash ./scripts/deploy-web-isolated.sh`

### Mobile

- Validasi release mobile:
  - `cd mobile-app`
  - `npm run check:release`
- Publish OTA ke staging / pilot:
  - `bash ../scripts/publish-mobile-ota-isolated.sh staging`
  - atau
  - `bash ../scripts/publish-mobile-ota-isolated.sh pilot`

## 4. Checklist Uji Staging

### Persiapan Data

- Tahun sumber dan target berbeda.
- Kelas target untuk XI/XII sudah dibuat lebih dulu.
- Kelas target masih kosong.
- Jurusan dan level kelas target sudah sesuai.

### Uji UI Web dan Mobile

- Web dan mobile menampilkan jumlah siswa aktif yang sama.
- Web dan mobile menampilkan blocking issue yang sama.
- Web dan mobile menampilkan warning yang sama.
- Web dan mobile menampilkan mapping target class yang sama.
- Web dan mobile menampilkan riwayat run yang sama.

### Uji Fungsional

- Simpan mapping dari web, lalu buka mobile: hasil harus identik.
- Simpan mapping dari mobile, lalu buka web: hasil harus identik.
- Commit promotion dari salah satu kanal.
- Pastikan siswa X berpindah ke XI yang benar.
- Pastikan siswa XI berpindah ke XII yang benar.
- Pastikan siswa XII berubah `GRADUATED` dan `classId = null`.
- Jika opsi aktivasi target dinyalakan, pastikan hanya tahun target yang aktif.

### Audit Pasca Commit

- Jalankan audit dengan `runId`:
  - `cd backend`
  - `npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID> --run-id <RUN_ID>`
- Hasil audit harus `PASS`.
- Jika ingin validasi histori report source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-report-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini sekarang memverifikasi `student report`, `class ledger`, `extracurricular report`, `ranking`, dan `final ledger preview` tetap membaca kelas historis source year.
- Jika ingin validasi histori absensi source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-attendance-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi `daily attendance`, `daily recap`, dan `late summary` tetap membaca siswa historis source year.
- Jika ingin validasi histori izin dan BP/BK source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-permission-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi endpoint `permissions`, `BP/BK permissions`, `BP/BK summary recent permissions`, `BP/BK principal high risk`, dashboard administrasi TU, serta input `behavior` dan `counseling` source year tetap aman setelah promotion.
- Jika ingin validasi histori PKL source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-internship-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi list/detail PKL, filter kelas dan search PKL source year, daftar pembimbing/penguji, print surat PKL, dan magic link PKL tetap membaca kelas historis source year.
- Jika ingin validasi histori UKK source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-ukk-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi input UKK source year untuk siswa XII yang sudah jadi alumni tetap aman, daftar assessment examiner tetap membaca `className` historis source year, detail UKK tetap membawa kelas historis, dan input ke target year yang tidak valid ditolak.
- Jika ingin validasi histori proctor source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-proctor-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi detail ruang ujian, submit berita acara, dan rekap `proctor reports` tetap menghitung roster source year yang benar serta menampilkan `className` historis setelah siswa dipromosikan.
- Jika ingin validasi histori exam sitting dan session detail source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-exam-sitting-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi create/update/detail `exam sitting`, update daftar siswa sitting, sinkronisasi room ke `exam schedules`, serta `session detail` tetap membaca kelas historis source year walaupun siswa sudah naik ke tingkat berikutnya.
- Jika ingin validasi histori exam restriction source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-exam-restriction-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi daftar restriction wali kelas source year tetap memuat roster historis, `search` tetap bekerja, dan update manual restriction source year tetap bisa disimpan sesudah siswa dipromosikan.
- Jika ingin validasi histori finance source year tetap aman setelah promotion:
  - `bash ./scripts/smoke-test-academic-finance-history-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi list invoice, filter `classId` dan `gradeLevel`, class recap finance report, detail report, collection queue, payment verification, ledger/payment-refund history, create/list refund, serta create/approve/apply/list reversal dan create/list write-off source year tetap membaca kelas historis source year.
- Jika migration refund academic context baru diterapkan dan ada refund lama yang masih `NULL` pada `academicYearId`:
  - `cd backend && npm run finance:refund-backfill-academic-year --`
  - Tambahkan `--apply` hanya setelah dry-run aman. Opsi `--strict-membership-only` tersedia jika ingin mode backfill yang lebih konservatif.
- Jika ingin validasi refund backdated dan CLI backfill berjalan aman setelah promotion:
  - `bash ./scripts/smoke-test-finance-refund-backfill-clone.sh --source-year-id <SOURCE_ID>`
  - Script ini memverifikasi refund backdated setelah promotion tetap masuk ke source year yang benar, lalu dry-run backfill tidak menulis data, dan mode `--apply` mengisi kembali `academicYearId` refund lama yang di-null-kan secara simulatif.

## 5. Go / No-Go Production

Go jika semua poin berikut terpenuhi:

- Staging audit `PASS`
- Tidak ada blocking issue di workspace promotion
- Parity web-mobile terverifikasi
- Snapshot data siswa sebelum commit sudah dibackup
- Tim operasional tahu pasangan tahun yang akan diproses

No-Go jika salah satu terjadi:

- Ada kelas target yang masih berisi siswa aktif
- Ada mapping ganda ke target class yang sama
- Ada kelas aktif tanpa target mapping padahal masih punya siswa
- Audit pasca-commit gagal

## 6. Prosedur Production

### Sebelum Commit Promotion

- Backup database / snapshot.
- Pastikan env backend sudah mengaktifkan:
  - `ACADEMIC_PROMOTION_V2_ENABLED=true`
- Verifikasi cepat flag:
  - `bash ./scripts/set-academic-promotion-flag.sh --check`
- Jalankan:
  - `bash ./scripts/repo-safety-gate.sh web`
  - `cd backend && npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID>`
- Buka web dan mobile admin, bandingkan workspace promotion.
- Freeze perubahan manual pada data kelas/siswa selama jendela eksekusi.

### Saat Commit

- Gunakan satu kanal admin saja untuk commit, jangan web dan mobile bersamaan.
- Simpan mapping final.
- Screenshot / catat ringkasan preview sebelum commit.
- Jalankan commit promotion.
- Catat `runId` yang dihasilkan.
- Jika ingin jalur CLI yang lebih terstruktur dan menyimpan artifact snapshot:
  - `bash ./scripts/run-academic-promotion-cutover.sh --source-year <SOURCE_ID> --target-year <TARGET_ID> --actor-id <ADMIN_ID> --activate-target --yes`

### Setelah Commit

- Jalankan audit run:
  - `cd backend`
  - `npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID> --run-id <RUN_ID>`
- Jika jendela promotion selesai dan fitur tidak perlu tetap terbuka, matikan lagi flag server:
  - `bash ./scripts/set-academic-promotion-flag.sh off --reload`

## 7. Prosedur Rollback Terkontrol

- Rollback hanya untuk run committed terbaru yang belum pernah di-rollback.
- Pastikan feature flag masih aktif saat rollback dijalankan.
- Gunakan satu kanal saja untuk rollback.
- Jalur CLI terstruktur:
  - `bash ./scripts/run-academic-promotion-rollback.sh --source-year <SOURCE_ID> --target-year <TARGET_ID> --run-id <RUN_ID> --actor-id <ADMIN_ID> --yes`
- Artifact rollback akan ditulis ke `ops/snapshots/academic-promotion-rollback/`
- Verifikasi login admin web dan mobile.
- Verifikasi beberapa akun sampel:
  - 1 siswa X
  - 1 siswa XI
  - 1 siswa XII

## 8. Catatan Operasional

- Commit promotion bersifat write ke data aktif, jadi wajib dilakukan pada jendela operasional yang disepakati.
- Workspace harus clean setelah setiap batch rilis:
  - `git status --short`
- Branch release juga harus sinkron:
  - `git status -sb`
  - `bash ./scripts/git-sync-gate.sh`
- Untuk mobile, gunakan OTA isolated worktree; jangan publish dari tree yang kotor.
- Untuk web, tetap utamakan safety gate sebelum deploy.
