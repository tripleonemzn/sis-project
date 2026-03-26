# Rancangan API Pendaftaran Publik

Dokumen ini memetakan endpoint yang perlu disiapkan agar 3 jalur pendaftaran bisa berjalan end-to-end.

## Prinsip Umum

- Endpoint publik hanya untuk register awal.
- Setelah akun terbentuk, user login dan mengakses prosesnya dari dashboard masing-masing.
- Login tidak lagi diblokir hanya karena proses bisnis belum selesai.
- Semua response mengikuti pola `ApiResponse`.

## A. Auth dan Register Hub

### Endpoint baru

#### `POST /auth/register-parent`

Tujuan:

- membuat akun `PARENT`

Payload minimal:

- `name`
- `username`
- `password`
- `confirmPassword`
- `phone`
- `email`

Response:

- data user `PARENT`
- `accountStatus`
- pesan login lanjutan

#### `POST /auth/register-bkk`

Tujuan:

- membuat akun `UMUM` untuk pelamar BKK

Payload minimal:

- `name`
- `username`
- `password`
- `confirmPassword`
- `phone`
- `email`

Catatan:

- endpoint ini secara bisnis menggantikan pemakaian `register-umum` yang sekarang terlalu generik.

#### `POST /auth/register-calon-siswa`

Status:

- endpoint existing tetap dipakai, tetapi payload perlu diperluas bertahap.

Payload minimal rekomendasi:

- `nisn`
- `name`
- `password`
- `confirmPassword`
- `phone`
- `email`

### Endpoint existing yang perlu disesuaikan

#### `POST /auth/login`

Perubahan rekomendasi:

- login mengecek `accountStatus`, bukan `verificationStatus`.
- user `CALON_SISWA`, `PARENT`, dan `UMUM` boleh login jika `accountStatus=ACTIVE`.

#### `GET /auth/me`

Perubahan rekomendasi:

- kirim status domain ringkas:
  - `admissionStatus`
  - `linkedChildrenCount`
  - `applicantProfileCompleted`

## B. Modul Calon Siswa

### Dashboard dan profil

#### `GET /admissions/me`

Mengambil 1 aplikasi PPDB milik user login.

#### `PUT /admissions/me`

Menyimpan draft data PPDB.

#### `POST /admissions/me/submit`

Submit final form PPDB.

#### `POST /admissions/me/documents`

Upload dokumen PPDB.

#### `PATCH /admissions/me/documents/:id`

Replace/update file dokumen.

### Tes PPDB

#### `GET /admissions/me/test`

Mengambil status tes PPDB:

- ada jadwal atau tidak
- sudah mulai atau belum
- hasil jika sudah selesai

#### `POST /admissions/me/test/start`

Memulai tes PPDB.

#### `POST /admissions/me/test/answers`

Menyimpan jawaban per halaman atau submit akhir.

#### `POST /admissions/me/test/finish`

Final submit tes.

### Endpoint admin

#### `GET /admissions`

List aplikasi PPDB untuk admin.

Filter:

- `status`
- `academicYearId`
- `majorChoiceId`
- `search`

#### `GET /admissions/:id`

Detail aplikasi.

#### `PATCH /admissions/:id/status`

Update status aplikasi.

#### `POST /admissions/:id/accept`

Menerima calon siswa dan mengonversi menjadi `STUDENT`.

Catatan:

- endpoint ini pada akhirnya menggantikan pemakaian `adminAcceptCalonSiswa` yang sekarang terlalu sempit.

## C. Modul Orang Tua

### Self-linking anak

#### `POST /parents/me/link-student/request`

Payload:

- `nisn`
- `birthDate` atau `token`

Output:

- request link `PENDING`

#### `GET /parents/me/link-requests`

List request link milik parent.

#### `DELETE /parents/me/link-requests/:id`

Batalkan request yang masih `PENDING`.

### Data anak parent

#### `GET /parents/me/children`

List anak yang sudah `VERIFIED`.

#### `GET /parents/me/children/:studentId`

Detail ringkas anak.

#### `GET /parents/me/children/:studentId/attendance`

Absensi anak.

#### `GET /parents/me/children/:studentId/report-card`

Rapor anak.

#### `GET /parents/me/children/:studentId/finance`

Tagihan dan pembayaran anak.

### Endpoint admin

#### `GET /parent-links`

List seluruh request parent-anak.

#### `PATCH /parent-links/:id/status`

Set `VERIFIED` atau `REJECTED`.

#### `DELETE /parent-links/:id`

Cabut relasi.

## D. Modul BKK

### Pelamar

#### `GET /bkk/applicant-profile/me`

Ambil profil pelamar.

#### `PUT /bkk/applicant-profile/me`

Simpan profil pelamar.

#### `POST /bkk/applicant-profile/me/cv`

Upload CV.

#### `POST /bkk/applicant-profile/me/portfolio`

Upload portofolio.

### Lowongan

#### `GET /bkk/vacancies`

List lowongan yang aktif.

Filter:

- `search`
- `company`
- `status=open`

#### `GET /bkk/vacancies/:id`

Detail lowongan.

### Lamaran

#### `POST /bkk/applications`

Payload:

- `jobVacancyId`
- `coverLetter`
- file opsional jika ingin override dokumen profil

#### `GET /bkk/applications/me`

List lamaran saya.

#### `GET /bkk/applications/me/:id`

Detail lamaran saya.

#### `PATCH /bkk/applications/me/:id/withdraw`

Tarik lamaran.

### Endpoint petugas BKK/admin

#### `GET /bkk/applications`

List semua pelamar.

Filter:

- `jobVacancyId`
- `status`
- `search`

#### `GET /bkk/applications/:id`

Detail lamaran.

#### `PATCH /bkk/applications/:id/status`

Status:

- `SCREENING`
- `INTERVIEW`
- `ACCEPTED`
- `REJECTED`

## E. Kompatibilitas Dengan Endpoint Existing

### Tetap dipertahankan sementara

- `POST /auth/register-calon-siswa`
- `POST /auth/register-umum`
- `POST /auth/admin/verify-user`
- `POST /auth/admin/accept-calon-siswa`

### Rencana transisi

Tahap awal:

- endpoint existing tetap hidup,
- UI baru mulai memakai endpoint baru.

Tahap menengah:

- endpoint lama jadi wrapper ke service baru.

Tahap akhir:

- endpoint lama dipensiunkan setelah seluruh UI berpindah.

## F. Auth Rules Yang Direkomendasikan

### Publik

- `POST /auth/register-calon-siswa`
- `POST /auth/register-parent`
- `POST /auth/register-bkk`

### Login wajib akun aktif

- role `CALON_SISWA`
- role `PARENT`
- role `UMUM`
- role existing internal

### Role guard domain

- modul admissions hanya untuk `CALON_SISWA` dan admin terkait
- modul parent-linking hanya untuk `PARENT`
- modul BKK pelamar hanya untuk `UMUM` dan petugas BKK/admin

## Output Tahap Ini

Dokumen ini siap dijadikan dasar implementasi controller, routes, service, dan validasi Zod pada tahap coding berikutnya.
