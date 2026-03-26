# Blueprint Pengembangan Pendaftaran Publik

## Tujuan

Dokumen ini menjadi acuan tahap awal pengembangan fitur daftar dari login page untuk 3 jalur:

1. Calon siswa baru yang bisa mengikuti tes di aplikasi.
2. Orang tua yang dapat mengelola lebih dari 1 anak dalam 1 akun.
3. Pelamar BKK untuk melamar lowongan kerja.

Dokumen ini sengaja disusun tanpa langsung mengubah schema/code production agar tim punya arah implementasi yang seragam lebih dulu.

## Kondisi Existing

### Yang sudah ada

- Role `PARENT`, `CALON_SISWA`, dan `UMUM` sudah tersedia di schema.
- Relasi orang tua ke banyak anak sudah tersedia secara many-to-many melalui `children` dan `parents`.
- Endpoint publik yang sudah ada:
  - `POST /auth/register-calon-siswa`
  - `POST /auth/register-umum`
- Endpoint admin yang sudah ada:
  - `POST /auth/admin/verify-user`
  - `POST /auth/admin/accept-calon-siswa`
- Lowongan BKK sudah ada sebagai data internal (`JobVacancy` + `IndustryPartner`).

### Masalah utama existing

- Login saat ini memblokir akun yang belum `VERIFIED`, sehingga user yang baru daftar tidak bisa masuk untuk cek status atau langsung tes.
- Web belum punya route register publik yang benar-benar hidup.
- Mobile register yang aktif baru untuk `UMUM`.
- Engine ujian hanya menerima role `STUDENT`, belum `CALON_SISWA`.
- Relasi parent-anak saat ini belum punya metadata seperti `relationType`, `verifiedAt`, `linkedBy`, dan `status`.
- BKK belum punya konsep `JobApplication`, status lamaran, CV, atau review pelamar.

## Prinsip Arsitektur Yang Direkomendasikan

### 1. Pisahkan status akun dan status proses bisnis

Saat ini `verificationStatus` dipakai untuk terlalu banyak hal. Untuk 3 jalur publik, sebaiknya dipisah:

- `accountStatus`: mengatur apakah user boleh login.
- `businessStatus`: status proses domain masing-masing.

Rekomendasi:

- `User.accountStatus`: `ACTIVE`, `BLOCKED`, `PENDING_REVIEW`
- `AdmissionApplication.status`: status PPDB
- `ParentStudentLink.status`: status relasi parent-anak
- `JobApplication.status`: status lamaran kerja

Dengan cara ini:

- akun calon siswa bisa login setelah daftar,
- tetapi status administrasi PPDB tetap bisa `DRAFT` atau `SUBMITTED`,
- dan orang tua/pelamar BKK juga bisa memantau proses tanpa harus menunggu admin membuka login.

### 2. Pertahankan `User` sebagai akun autentikasi, pindahkan logika bisnis ke tabel domain

Jangan menambah semua field proses ke tabel `users`. `users` saat ini sudah sangat padat.

Rekomendasi:

- `users` hanya untuk identitas akun dan informasi umum.
- data proses masuk ke tabel domain baru.

## Rancangan Model Data

### A. Calon Siswa

Tetap gunakan role `CALON_SISWA`, tetapi tambah tabel domain:

#### `AdmissionApplication`

- `id`
- `userId`
- `registrationNo`
- `academicYearId`
- `status`
- `fullName`
- `nisn`
- `nik`
- `birthPlace`
- `birthDate`
- `gender`
- `schoolOrigin`
- `majorChoice1Id`
- `majorChoice2Id`
- `fatherName`
- `motherName`
- `guardianName`
- `phone`
- `email`
- `address`
- `submittedAt`
- `reviewedAt`
- `reviewedBy`
- `notes`
- `createdAt`
- `updatedAt`

#### `AdmissionDocument`

- `id`
- `applicationId`
- `documentType`
- `fileUrl`
- `status`
- `note`
- `uploadedAt`
- `reviewedAt`

#### `AdmissionTest`

- `id`
- `academicYearId`
- `title`
- `description`
- `testType`
- `isActive`
- `durationMinutes`
- `passingScore`
- `questionBankId` atau referensi ke exam packet jika ingin reuse engine
- `createdBy`

#### `AdmissionTestAttempt`

- `id`
- `applicationId`
- `admissionTestId`
- `status`
- `startedAt`
- `submittedAt`
- `score`
- `passed`
- `attemptNo`

#### Status PPDB yang direkomendasikan

- `DRAFT`
- `SUBMITTED`
- `DOCUMENT_REVIEW`
- `TEST_READY`
- `TEST_IN_PROGRESS`
- `TEST_FINISHED`
- `INTERVIEW_READY`
- `ACCEPTED`
- `REJECTED`

### B. Orang Tua

Role tetap `PARENT`, tetapi relasi anak dipindahkan ke tabel join eksplisit.

#### `ParentStudentLink`

- `id`
- `parentUserId`
- `studentUserId`
- `relationType`
- `status`
- `isPrimary`
- `linkedByAdminId`
- `requestedAt`
- `verifiedAt`
- `verificationMethod`
- `proofToken`
- `notes`

#### Kenapa perlu tabel join?

Karena 1 akun parent bisa punya banyak anak, dan 1 siswa secara real bisa terhubung ke:

- ayah,
- ibu,
- wali,
- atau nomor keluarga lain yang diizinkan.

Self-relation existing cukup untuk MVP internal, tetapi kurang untuk self-registration publik.

#### Status relasi yang direkomendasikan

- `PENDING`
- `VERIFIED`
- `REJECTED`
- `REVOKED`

#### `relationType` yang direkomendasikan

- `FATHER`
- `MOTHER`
- `GUARDIAN`
- `FAMILY`

### C. BKK

Untuk tahap awal, role `UMUM` bisa dipertahankan sebagai akun pelamar publik. Jika nanti sekolah ingin membedakan alumni dan pelamar eksternal, baru pertimbangkan role baru `ALUMNI`.

#### `ApplicantProfile`

- `id`
- `userId`
- `fullName`
- `nik`
- `birthPlace`
- `birthDate`
- `phone`
- `email`
- `address`
- `lastEducation`
- `schoolName`
- `graduationYear`
- `summary`
- `cvFileUrl`
- `portfolioFileUrl`
- `photoFileUrl`
- `createdAt`
- `updatedAt`

#### `JobApplication`

- `id`
- `jobVacancyId`
- `applicantUserId`
- `status`
- `coverLetter`
- `cvFileUrl`
- `portfolioFileUrl`
- `submittedAt`
- `reviewedAt`
- `reviewedBy`
- `reviewNotes`

#### Status lamaran yang direkomendasikan

- `DRAFT`
- `SUBMITTED`
- `SCREENING`
- `INTERVIEW`
- `ACCEPTED`
- `REJECTED`
- `WITHDRAWN`

## Rekomendasi Alur Bisnis

### 1. Calon Siswa

1. User memilih "Daftar sebagai Calon Siswa".
2. Sistem membuat akun `CALON_SISWA` dengan `accountStatus=ACTIVE`.
3. User login dan melengkapi form PPDB.
4. User submit berkas.
5. Admin review.
6. Jika lolos dokumen, sistem membuka akses tes.
7. User mengikuti tes PPDB.
8. Admin finalisasi hasil.
9. Jika diterima, admin jalankan proses konversi dari `CALON_SISWA` menjadi `STUDENT`.

### 2. Orang Tua

1. User memilih "Daftar sebagai Orang Tua".
2. Sistem membuat akun `PARENT`.
3. Setelah login, parent menambahkan anak dengan metode verifikasi:
   - NISN + tanggal lahir, atau
   - token undangan dari sekolah.
4. Sistem membuat `ParentStudentLink` berstatus `PENDING`.
5. Admin verifikasi.
6. Setelah `VERIFIED`, parent dapat melihat seluruh anak yang terhubung dalam 1 akun.

### 3. Pelamar BKK

1. User memilih "Daftar untuk BKK".
2. Sistem membuat akun `UMUM`.
3. User login, melengkapi profil pelamar, upload CV/portofolio.
4. User melihat lowongan BKK.
5. User melamar 1 atau lebih lowongan.
6. Petugas BKK memproses status lamaran.

## Tahap Implementasi Yang Direkomendasikan

### Tahap 1 - Fondasi

- Buat halaman register publik yang memilih 3 tipe akun.
- Pisahkan `accountStatus` dari `verificationStatus`.
- Rapikan web/mobile parity untuk role `CALON_SISWA` dan `UMUM`.

### Tahap 2 - Orang Tua

- Tambah `ParentStudentLink`.
- Selesaikan self-registration parent dan linking anak.
- Migrasikan akses parent agar tidak lagi bergantung langsung ke self-relation lama.

### Tahap 3 - Calon Siswa

- Tambah `AdmissionApplication`, `AdmissionDocument`, `AdmissionTest`, `AdmissionTestAttempt`.
- Ubah login policy agar calon siswa bisa masuk setelah daftar.
- Buka akses tes khusus PPDB.

### Tahap 4 - BKK

- Tambah `ApplicantProfile` dan `JobApplication`.
- Buat alur melamar kerja dan review pelamar.
- Integrasikan lowongan existing dengan pelamar.

## Catatan Migrasi

- Jangan hapus relasi `children/parents` di tahap awal.
- Gunakan strategi kompatibel:
  - tabel baru ditambahkan lebih dulu,
  - service baru membaca tabel baru,
  - data lama dimigrasikan bertahap,
  - setelah stabil baru clean-up.

## Output Tahap Ini

Setelah blueprint ini disetujui, tahap implementasi teknis akan dimulai dari:

1. perubahan schema Prisma,
2. perubahan endpoint auth/register,
3. pembuatan halaman register hub web/mobile.
