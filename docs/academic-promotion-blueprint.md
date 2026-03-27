# Blueprint Pengembangan Promotion Akademik

## Tujuan

Dokumen ini menjadi acuan implementasi fitur promotion akademik yang aman untuk production, dengan target utama:

1. Siswa kelas `X` naik ke `XI` pada tahun ajaran baru.
2. Siswa kelas `XI` naik ke `XII` pada tahun ajaran baru.
3. Siswa kelas `XII` yang lulus berubah menjadi `GRADUATED` dan diperlakukan sebagai alumni.
4. Histori akademik siswa tetap utuh dan tetap bisa diakses di web maupun mobile.
5. Pengembangan fitur tersedia `1:1` antara web dan mobile untuk role yang sama.
6. Update dan deploy tidak merusak production, tidak memaksa cutover prematur, dan menjaga workspace/worktree tetap aman.

Dokumen ini sengaja disusun tanpa langsung mengubah alur production yang berjalan saat ini. Implementasi harus dilakukan bertahap, additive, dan bisa diuji sebelum cutover.

## Prinsip Wajib

### 1. Zero-downtime data evolution

- Jangan langsung mengganti sumber data lama.
- Tambahkan struktur baru secara additive.
- Pertahankan `User.classId` dan `User.studentStatus` sebagai snapshot compatibility sampai seluruh read-path aman.
- Gunakan dual-write dan fallback read selama masa transisi.

### 2. Promotion bukan update massal buta

- Promotion harus berbasis `preview -> validate -> commit plan -> cutover`.
- Tidak boleh langsung memindahkan `classId` siswa begitu tombol ditekan.
- Mapping kelas sumber ke kelas target harus eksplisit, bukan hanya tebak berdasarkan `majorId-level`.

### 3. Histori akademik adalah sumber kebenaran

- Nilai, rapor, ranking, kehadiran, dan dokumen historis harus dibaca berdasarkan `academicYearId`.
- Status alumni tidak boleh menghilangkan akses ke histori tahun sebelumnya.

### 4. Parity web-mobile wajib

- Flow admin promotion harus ada di web dan mobile.
- Label, status, validasi, urutan langkah, dan hasil ringkasan harus konsisten.
- Jika ada gap platform, perbedaannya hanya boleh pada presentasi UI, bukan pada alur bisnis.

### 5. Production safety first

- Promotion tidak boleh aktif default sebelum semua read-path inti aman.
- Gunakan feature flag.
- Cutover hanya boleh dijalankan setelah preview lolos, backup tersedia, dan target year siap.

## Kondisi Existing Yang Harus Diakomodasi

### Yang sudah ada

- Tahun ajaran aktif sudah dikelola lewat `academic_years`.
- Kelas sudah terkait ke `academicYearId`.
- Siswa sudah punya `studentStatus`.
- Web dan mobile sudah punya konsep alumni untuk pembatasan menu.
- Backend sudah punya endpoint promotion v1: `POST /academic-years/:id/promote`.

### Risiko existing yang ditemukan

- `User.classId` masih menjadi penentu kelas aktif siswa.
- Report service masih mengambil `student.studentClass` saat ini, bukan membership per tahun ajaran.
- Endpoint promotion v1 memetakan target kelas hanya dengan `majorId-level`, sehingga rombel bisa tercampur.
- Web belum punya flow promotion kenaikan kelas.
- Mobile admin juga belum punya flow promotion kenaikan kelas.
- Web class management hanya memuat tahun ajaran aktif saat membuat kelas, sehingga persiapan kelas target tahun baru belum ideal.

## Outcome Yang Ditargetkan

Setelah blueprint ini diimplementasikan, sistem harus mampu melakukan:

1. Menyiapkan tahun ajaran baru dan kelas target tanpa mengganggu tahun ajaran aktif.
2. Menyusun mapping kelas sumber ke kelas target secara eksplisit.
3. Menjalankan preview promotion massal beserta error dan warning.
4. Menyimpan plan promotion tanpa mengubah snapshot siswa yang sedang aktif.
5. Menjalankan cutover saat siap, lalu mengaktifkan target year dan memperbarui snapshot siswa.
6. Menjaga histori rapor, nilai, kehadiran, dan dokumen tetap benar setelah promotion.
7. Membatasi alumni ke menu read-only, tetapi tetap bisa login dan membaca histori.

## Ruang Lingkup

### In Scope

- Promotion akademik massal per tahun ajaran.
- Status alumni untuk siswa lulus.
- Histori membership siswa per tahun ajaran.
- UI admin promotion di web dan mobile.
- Validasi, audit, run history, dan SOP cutover aman.

### Out of Scope

- Refactor total semua modul akademik dalam satu batch.
- Menghapus `User.classId` dan `User.studentStatus` pada fase awal.
- Mengubah role alumni menjadi role baru.
- Rollback otomatis pasca-cutover tingkat database.

## Rancangan Arsitektur Data

### 1. Tabel baru: `student_academic_memberships`

Tabel ini menjadi fondasi histori akademik siswa per tahun ajaran.

Kolom yang direkomendasikan:

- `id`
- `studentId`
- `academicYearId`
- `classId`
- `sourceMembershipId` nullable
- `entryType` enum: `MANUAL`, `NEW_STUDENT`, `PROMOTED`, `RETAINED`, `TRANSFER_IN`
- `lifecycleStatus` enum: `PLANNED`, `ACTIVE`, `COMPLETED`, `CANCELLED`
- `finalDecision` enum nullable: `PROMOTED`, `RETAINED`, `GRADUATED`, `MOVED`, `DROPPED_OUT`
- `isCurrentSnapshot` boolean default `false`
- `startedAt`
- `endedAt` nullable
- `note` nullable
- `createdAt`
- `updatedAt`

Constraint minimum:

- unique `studentId + academicYearId`
- index `academicYearId + classId`
- index `studentId + lifecycleStatus`

Catatan:

- Pada fase awal, tabel ini additive dan belum menggantikan `User.classId`.
- Untuk siswa `XII` yang lulus, record membership tahun berjalan tetap ada dan `finalDecision` diisi `GRADUATED`.
- Alumni tidak perlu punya membership baru untuk tahun ajaran setelah lulus.

### 2. Tabel baru: `promotion_class_mappings`

Tabel ini memastikan mapping kelas sumber ke kelas target selalu eksplisit.

Kolom yang direkomendasikan:

- `id`
- `sourceAcademicYearId`
- `targetAcademicYearId`
- `sourceClassId`
- `targetClassId` nullable
- `promotionAction` enum: `PROMOTE`, `RETAIN`, `GRADUATE`
- `isLocked` boolean default `false`
- `notes` nullable
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

Constraint minimum:

- unique `sourceAcademicYearId + targetAcademicYearId + sourceClassId`

Catatan:

- `GRADUATE` dipakai untuk kelas `XII` agar eksplisit bahwa kelas tersebut tidak butuh target class.
- Banyak source class boleh diarahkan ke satu target class hanya jika memang keputusan sekolah demikian, tetapi sistem harus memberi warning.

### 3. Tabel baru: `promotion_runs`

Tabel ini menyimpan satu eksekusi promotion sebagai entitas audit.

Kolom yang direkomendasikan:

- `id`
- `sourceAcademicYearId`
- `targetAcademicYearId`
- `status` enum: `DRAFT`, `PREVIEWED`, `PLANNED`, `CUTOVER_READY`, `CUTOVER_APPLIED`, `CANCELLED`, `FAILED`
- `requestedBy`
- `previewedAt` nullable
- `plannedAt` nullable
- `cutoverAt` nullable
- `summaryJson`
- `warningsJson`
- `errorsJson`
- `featureVersion` string default `"v2"`
- `createdAt`
- `updatedAt`

### 4. Tabel baru: `promotion_run_items`

Tabel detail hasil evaluasi per siswa pada satu promotion run.

Kolom yang direkomendasikan:

- `id`
- `promotionRunId`
- `studentId`
- `sourceMembershipId` nullable
- `sourceClassId`
- `targetClassId` nullable
- `action` enum: `PROMOTE`, `RETAIN`, `GRADUATE`, `SKIP`
- `resultStatus` enum: `PENDING`, `VALID`, `PLANNED`, `APPLIED`, `FAILED`
- `validationErrorsJson`
- `warningsJson`
- `snapshotJson`
- `createdAt`
- `updatedAt`

Constraint minimum:

- unique `promotionRunId + studentId`

## Kompatibilitas Dengan Schema Existing

Pada fase awal:

- `User.classId` tetap dipakai sebagai snapshot kelas aktif.
- `User.studentStatus` tetap dipakai sebagai snapshot status akademik.
- Semua fitur existing yang belum siap membaca membership tetap jalan.

Target fase lanjut:

- Read-path inti mulai membaca `student_academic_memberships` berdasarkan `academicYearId`.
- `User.classId` dan `User.studentStatus` tetap dipelihara sebagai cache snapshot, bukan sumber kebenaran utama.

## Feature Flag Yang Direkomendasikan

Tambahkan flag berikut:

- `FEATURE_ACADEMIC_MEMBERSHIP_WRITE`
- `FEATURE_ACADEMIC_MEMBERSHIP_READ`
- `FEATURE_ACADEMIC_PROMOTION_V2`
- `FEATURE_ACADEMIC_PROMOTION_CUTOVER`

Aturan aktivasi:

1. Write flag aktif dulu.
2. Read flag aktif bertahap per modul.
3. Promotion v2 aktif untuk admin terbatas.
4. Cutover flag aktif terakhir setelah semua validasi lolos.

## Alur Bisnis Yang Direkomendasikan

### Tahap A. Persiapan Tahun Ajaran Baru

Admin melakukan:

1. Membuat tahun ajaran target.
2. Membuat seluruh kelas target untuk tahun ajaran baru.
3. Menetapkan wali kelas target bila sudah tersedia.
4. Menyusun mapping kelas sumber ke kelas target.

Pada tahap ini:

- Tahun ajaran lama masih tetap aktif.
- Snapshot siswa belum berubah.

### Tahap B. Preview Promotion

Admin memilih:

- source academic year
- target academic year
- optional filters bila dibutuhkan

Sistem menghitung:

- jumlah siswa `X -> XI`
- jumlah siswa `XI -> XII`
- jumlah siswa `XII -> GRADUATED`
- konflik mapping
- siswa tanpa class
- siswa non-`ACTIVE`
- siswa yang sudah punya membership target year
- kelas sumber yang belum dimapping

Output preview harus memisahkan:

- `blocking errors`
- `warnings`
- `ready items`

### Tahap C. Commit Plan

Jika preview lolos:

- sistem membuat `promotion_run`
- sistem membuat `promotion_run_items`
- sistem membuat `student_academic_memberships` target year dengan status `PLANNED` untuk action `PROMOTE` dan `RETAIN`
- sistem belum mengubah `User.classId`
- sistem belum mengubah `User.studentStatus`
- sistem belum mengaktifkan target year

Tujuan tahap ini adalah menyiapkan plan yang bisa diverifikasi ulang tanpa memengaruhi siswa aktif di production.

### Tahap D. Cutover

Cutover dijalankan hanya saat sekolah siap berganti tahun ajaran.

Urutan yang direkomendasikan:

1. Lock promotion run yang dipilih.
2. Validasi ulang source year masih aktif.
3. Validasi target year belum aktif.
4. Validasi tidak ada `promotion_run_items` status `FAILED`.
5. Tandai source memberships sebagai `COMPLETED`.
6. Tandai target planned memberships menjadi `ACTIVE`.
7. Sinkronkan snapshot `User.classId` berdasarkan membership aktif baru.
8. Untuk item `GRADUATE`, set `User.classId = null` dan `User.studentStatus = GRADUATED`.
9. Ubah source `academicYear.isActive = false`.
10. Ubah target `academicYear.isActive = true`.
11. Invalidate cache tahun ajaran aktif dan cache profil pengguna.
12. Simpan audit log cutover.

### Tahap E. Post-Cutover

Setelah cutover:

- siswa aktif melihat kelas baru
- alumni tetap login sebagai `role=STUDENT` dan `studentStatus=GRADUATED`
- modul riwayat membaca data historis berdasarkan `academicYearId`

## Aturan Validasi Promotion

Promotion v2 harus memblokir commit jika:

- target year sama dengan source year
- source year tidak ditemukan
- target year tidak ditemukan
- source year tidak memiliki siswa aktif
- ada kelas sumber tanpa mapping
- ada mapping `PROMOTE` tanpa `targetClassId`
- ada siswa source tanpa membership/source class yang valid
- ada target membership duplikat untuk siswa yang sama

Promotion v2 boleh tetap lanjut tetapi memberi warning jika:

- banyak source class menuju satu target class
- wali kelas target belum diisi
- jumlah siswa target rombel melebihi ambang kebijakan sekolah
- ada siswa `MOVED` atau `DROPPED_OUT` yang tidak ikut diproses

## API Contract Yang Direkomendasikan

### 1. Academic Membership

- `GET /student-memberships?studentId=...`
- `GET /student-memberships/active?studentId=...`
- `GET /student-memberships/by-year?studentId=...&academicYearId=...`

### 2. Promotion Mapping

- `GET /academic-years/:sourceYearId/promotion/mappings?targetAcademicYearId=:id`
- `PUT /academic-years/:sourceYearId/promotion/mappings`
- `POST /academic-years/:sourceYearId/promotion/mappings/autofill`

Payload `PUT` minimum:

```json
{
  "targetAcademicYearId": 12,
  "mappings": [
    {
      "sourceClassId": 101,
      "targetClassId": 201,
      "promotionAction": "PROMOTE"
    },
    {
      "sourceClassId": 131,
      "promotionAction": "GRADUATE"
    }
  ]
}
```

### 3. Preview

- `POST /academic-years/:sourceYearId/promotion/preview`

Payload minimum:

```json
{
  "targetAcademicYearId": 12
}
```

Response minimum:

```json
{
  "summary": {
    "totalStudents": 420,
    "promoteCount": 280,
    "graduateCount": 120,
    "retainCount": 20,
    "skipCount": 0
  },
  "errors": [],
  "warnings": [],
  "items": []
}
```

### 4. Commit Plan

- `POST /academic-years/:sourceYearId/promotion/commit`

Payload minimum:

```json
{
  "targetAcademicYearId": 12,
  "confirmationText": "PROMOTE 2025/2026 -> 2026/2027"
}
```

Hasil:

- membuat `promotion_run`
- membuat `promotion_run_items`
- membuat planned memberships

### 5. Run History

- `GET /promotion-runs`
- `GET /promotion-runs/:id`
- `POST /promotion-runs/:id/cancel-plan`

Catatan:

- `cancel-plan` hanya boleh tersedia sebelum cutover.
- Setelah cutover, rollback tidak otomatis; harus lewat compensating operation.

### 6. Cutover

- `POST /promotion-runs/:id/cutover`

Payload minimum:

```json
{
  "confirmationText": "CUTOVER PROMOTION RUN 18"
}
```

## Integrasi Backend Yang Wajib Diselesaikan

### Wave 1. Data foundation

Area yang akan tersentuh:

- `backend/prisma/schema.prisma`
- migration additive baru
- service/helper membership baru

Tujuan:

- menambah tabel baru
- menambah enum baru
- belum mengubah read-path existing

### Wave 2. Dual-write

Area utama:

- `backend/src/controllers/user.controller.ts`
- `backend/src/controllers/class.controller.ts`
- import script siswa existing

Aturan:

- saat admin memindahkan siswa ke kelas secara manual, update snapshot lama dan membership baru secara konsisten
- write ke tabel baru hanya aktif jika feature flag write aktif

### Wave 3. Read-path kritikal

Modul yang wajib dimigrasikan sebelum cutover:

- `backend/src/services/report.service.ts`
- `backend/src/controllers/permission.controller.ts`
- `backend/src/controllers/auth.controller.ts`
- endpoint yang memberi data `me/profile`
- endpoint student schedule dan attendance berbasis kelas aktif

Aturan:

- lookup kelas siswa untuk modul historis harus berdasarkan `academicYearId`
- lookup kelas aktif siswa untuk modul operasional harus berdasarkan membership `ACTIVE`

### Wave 4. Promotion v2 service

Area utama:

- service baru `promotion.service.ts`
- controller baru atau ekstensi `academicYear.controller.ts`
- audit log

Aturan:

- jangan memakai endpoint promotion v1 untuk UI baru
- endpoint v1 tetap ada sementara, tetapi tidak dipakai lagi oleh web/mobile

### Wave 5. Cutover-safe cache invalidation

Wajib invalidate:

- cache active academic year
- cache `me`
- cache mobile active academic year
- cache query web/mobile yang bergantung pada student active class

## Integrasi Web Yang Direkomendasikan

### Lokasi

Flow sebaiknya ditempatkan di modul akademik admin, bukan di user management.

Rekomendasi:

- halaman baru `Promotion Center`
- entry point dari halaman `Tahun Ajaran`

### Langkah UI Web

1. Pilih source year dan target year.
2. Atur class mapping.
3. Jalankan preview.
4. Tinjau error/warning.
5. Commit plan.
6. Tinjau run detail.
7. Jalankan cutover saat siap.

### Komponen informasi yang wajib ada

- summary cards
- daftar kelas sumber dan target
- warning badge
- blocking error panel
- tabel siswa impacted
- run status timeline
- confirmation modal untuk commit dan cutover

### Catatan parity

Web tidak boleh hanya punya tombol tunggal `Promote`.
Web harus memaksa admin melewati langkah preview dan commit plan.

## Integrasi Mobile Yang Direkomendasikan

### Lokasi

Flow harus masuk ke modul admin academic, bukan disembunyikan sebagai bridge web.

Rekomendasi:

- section baru `Promotion`
- struktur langkah sama dengan web

### Langkah UI Mobile

1. Pilih target year.
2. Buka mapping per kelas.
3. Jalankan preview.
4. Review error/warning.
5. Commit plan.
6. Review run detail.
7. Cutover.

### Komponen informasi yang wajib ada

- summary cards
- filter chips status
- grouped class mapping list
- item count `promote / graduate / retain / skip`
- warning and blocking states
- confirmation bottom sheet/modal

## Standard Parity Web-Mobile

Checklist parity yang wajib dipenuhi:

- Flow langkah web dan mobile identik.
- Label status run identik.
- Payload API identik.
- Error message identik.
- Summary numbers identik.
- Mapping source-target identik.
- Run history identik.
- Cutover confirmation identik.

Perbedaan yang masih diperbolehkan:

- Web memakai table, mobile memakai card list.
- Web bisa menampilkan tabel lebih panjang dalam satu halaman.
- Mobile boleh memakai grouped sheet dan chips untuk navigasi.

## Perubahan Auth dan Profil Yang Direkomendasikan

Endpoint `GET /auth/me` dan hasil login perlu diperkaya secara additive:

- `activeAcademicMembership`
- `latestCompletedMembership`
- `studentClass` tetap dipertahankan sebagai snapshot compatibility
- `studentStatus` tetap dipertahankan sebagai snapshot compatibility

Aturan:

- untuk siswa aktif, `studentClass` mengikuti snapshot membership aktif
- untuk alumni, `studentClass` boleh `null`, tetapi `latestCompletedMembership` wajib tersedia untuk keperluan histori

## Perubahan Read-Path Yang Harus Diprioritaskan

### Wajib sebelum cutover

- rapor siswa
- ledger/rekap kelas
- student schedule
- student class attendance
- student permission request
- homeroom report
- dashboard/menu alumni

### Boleh menyusul setelah cutover awal jika sudah ada fallback aman

- finance labels berbasis kelas
- dokumen PKL yang hanya memakai label kelas sebagai display
- modul monitoring non-kritikal

## Strategi Rollout Bertahap

### Fase 0. Dokumen dan approval

- blueprint disetujui
- scope batch implementasi disepakati
- feature flag diputuskan

### Fase 1. Schema additive

- tambahkan tabel baru
- tidak ada perubahan perilaku user

### Fase 2. Backfill memberships

- generate membership awal dari `User.classId` existing
- jalankan script verifikasi hasil backfill

### Fase 3. Dual-write

- user/class admin flow mulai menulis snapshot dan membership

### Fase 4. Read migration

- modul kritikal pindah ke membership-aware reads
- fallback ke snapshot lama tetap ada bila data baru belum lengkap

### Fase 5. Promotion UI + service

- web dan mobile punya preview dan commit plan
- belum cutover otomatis

### Fase 6. Cutover release

- jalankan di jendela operasional yang disetujui
- backup database tersedia
- smoke test dilakukan segera setelah cutover

### Fase 7. Deprecation

- endpoint promotion v1 dinonaktifkan dari UI
- setelah semua read-path aman, baru pertimbangkan deprecate permanen

## Strategi Testing

### Unit Test

- class mapping validator
- preview summarizer
- cutover guard
- alumni snapshot sync

### Integration Test

- source year with complete mapping
- missing mapping
- duplicate target membership
- X promotion
- XI promotion
- XII graduation
- retain scenario
- re-run idempotency

### Cross-platform QA

Skenario minimal:

1. Preview di web dan mobile menghasilkan angka yang sama.
2. Commit plan di web terbaca sama di mobile.
3. Cutover di web tercermin sama di mobile.
4. Alumni login di web dan mobile tetap bisa membuka histori nilai dan kehadiran.
5. Siswa aktif melihat kelas baru setelah cutover.

## Strategi Release Aman

### Sebelum deploy

- kerja per batch kecil, bukan refactor besar sekaligus
- gunakan feature flag
- gunakan migration additive, bukan destructive
- jalankan:
  - `bash ./scripts/release-manager.sh web check --report`
  - `bash ./scripts/release-manager.sh mobile check`

### Saat deploy web

- gunakan release manager atau `update_all.sh`
- jangan publish jika scope campuran belum dipisahkan

### Saat deploy mobile

- gunakan wrapper isolated worktree yang sudah ada
- publish OTA hanya setelah parity check lolos

### Setelah deploy

- smoke test web admin academic
- smoke test mobile admin academic
- smoke test login student aktif
- smoke test login alumni
- verifikasi `git status --short` tetap bersih

## Standard Kebersihan Workspace/Worktree

Aturan yang direkomendasikan untuk tim:

1. Jangan deploy dari tree campuran tanpa scope gate.
2. Selalu jalankan safety gate sebelum web/mobile release.
3. Gunakan staging scope jika ada perubahan paralel:
   - `bash ./scripts/stage-scope.sh web --dry-run`
   - `bash ./scripts/stage-scope.sh mobile --dry-run`
4. Mobile tetap publish dari isolated worktree.
5. Web sebaiknya mengikuti pola mobile pada fase operasional berikutnya: deploy dari isolated worktree, bukan dari root kerja harian.
6. Tambahkan guard operasional baru agar release gagal jika branch `ahead/behind` remote tanpa persetujuan eksplisit.

## Rekomendasi Batch Implementasi

### Batch 1

- schema additive
- service membership dasar
- backfill script
- belum ada UI production

### Batch 2

- read-path kritikal: report, auth/me, permission, student schedule
- compatibility fallback

### Batch 3

- API preview + commit plan
- web UI
- mobile UI

### Batch 4

- cutover API
- audit log
- QA lengkap

### Batch 5

- deprecate promotion v1 dari UI
- rapikan modul sekunder yang masih memakai snapshot langsung

## Keputusan Desain Yang Direkomendasikan

1. Jangan implement promotion massal langsung dengan `updateMany user.classId`.
2. Jangan auto-map kelas hanya dari `majorId-level`.
3. Jangan ubah snapshot siswa sebelum cutover.
4. Jangan aktifkan target academic year sebelum run siap.
5. Jangan menghapus `User.classId` dan `User.studentStatus` pada fase awal.
6. Jangan membuat perbedaan flow promotion antara web dan mobile.

## Definisi Selesai

Blueprint ini dianggap terealisasi dengan benar jika:

- histori akademik siswa aman sesudah promotion
- alumni tetap login dan hanya melihat menu read-only
- preview, commit plan, dan cutover berjalan lewat run yang terdokumentasi
- web dan mobile memiliki flow admin promotion yang setara
- cutover tidak memutus student flow secara prematur
- release dapat dilakukan dengan guardrail yang jelas dan workspace tetap aman

## Catatan Penutup

Promotion akademik di project ini tidak boleh diperlakukan sebagai CRUD kelas biasa. Karena banyak modul masih memakai snapshot kelas aktif siswa, implementasi yang aman harus memisahkan:

- histori akademik,
- plan promotion,
- snapshot aktif,
- dan cutover operasional.

Dengan pendekatan additive + dual-write + cutover terkontrol, tim bisa membangun fitur ini tanpa merusak production yang sedang berjalan.
