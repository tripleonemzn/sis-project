# UJIAN & CBT – Rencana Implementasi Modul

Dokumen ini menjelaskan secara rinci apa saja yang akan dikerjakan pada modul **UJIAN & CBT** di sistem ini, dengan mengacu pada skema dan pola yang sudah ada di project (frontend React + Vite, backend Express + Prisma, role‑based access, serta pola halaman admin yang sudah berjalan seperti Tahun Ajaran, Kompetensi Keahlian, Kelas, dan Rapor).

Fokus utama modul:

- Menyediakan **Bank Soal** terstruktur yang dapat digunakan berulang untuk berbagai ujian.
- Mengelola **Sesi Ujian CBT** (penjadwalan, peserta, pengaturan teknis ujian).
- Mencatat dan mengolah **hasil ujian** untuk kemudian terintegrasi dengan modul nilai/rapor.

Di bawah ini adalah rincian pekerjaan per bagian.

---

## 1. Integrasi Navigasi & Struktur Routing

Mengacu pada konfigurasi menu di:

- Sidebar: group **UJIAN & CBT** dengan children:
  - `/admin/question-bank`
  - `/admin/exam-sessions`
- Breadcrumbs mapping di `DashboardLayout` untuk:
  - `question-bank` → label *Bank Soal*
  - `exam-sessions` → label *Sesi Ujian*

**Pekerjaan:**

- Menambahkan rute baru di frontend (`App.tsx`) untuk admin:
  - `path="question-bank"` → `QuestionBankPage`
  - `path="exam-sessions"` → `ExamSessionsPage`
- Memastikan rute hanya bisa diakses oleh role **ADMIN** (menggunakan `RoleRoute` seperti rute admin lain).
- Menyelaraskan label halaman dan breadcrumbs agar konsisten dengan Sidebar dan mapping di `DashboardLayout`.
- Memastikan klik menu di sidebar:
  - *UJIAN & CBT → Bank Soal* membawa ke `/admin/question-bank`.
  - *UJIAN & CBT → Sesi Ujian* membawa ke `/admin/exam-sessions`.

---

## 2. Halaman Bank Soal (`/admin/question-bank`)

### 2.1. Tujuan & Ruang Lingkup

Halaman ini akan menjadi pusat pengelolaan **paket bank soal** yang nantinya digunakan oleh sesi ujian:

- Menyimpan metadata bank soal.
- Menyimpan daftar soal (pilihan ganda, pilihan ganda kompleks (jawaban benar lebih dari 1, BENAR/SALAH)).
- Mendukung pengelompokan berdasarkan mapel, tingkat kelas, dan kompetensi keahlian.

### 2.2. Desain UI & Pola Komponen

Mengacu pada pola halaman admin lainnya (mis. Tahun Ajaran, Kompetensi Keahlian, Kelas):

- Layout:
  - Menggunakan `DashboardLayout` sebagai wrapper.
  - Header halaman dengan:
    - Judul: **Bank Soal**
    - Deskripsi singkat fungsi halaman.
    - Tombol aksi utama: **Tambah Bank Soal**.
- Konten utama:
  - **Filter bar** di atas tabel:
    - Dropdown Mata Pelajaran (menggunakan data dari modul `subjects`).
    - Dropdown Kelas / Tingkat (mengacu ke modul `classes` / `training-classes` jika relevan).
    - Dropdown Kompetensi Keahlian (mengacu ke `majors`).
    - Input pencarian teks (kode/nama bank soal).
  - **Tabel data**:
    - Kolom standar:
      - KODE BANK SOAL
      - NAMA BANK SOAL
      - MATA PELAJARAN
      - KELAS / TINGKAT
      - KOMPETENSI KEAHLIAN
      - JUMLAH SOAL
      - STATUS (Aktif / Draft / Arsip)
      - AKSI
    - Mendukung:
      - Pagination (menggunakan `useQuery` + parameter `page` & `limit` seperti halaman lain).
      - Sorting sederhana (opsional, minimal berdasarkan nama/kode).
  - **Aksi baris (AKSI)**:
    - Lihat detail bank soal.
    - Ubah.
    - Duplikat (opsional, untuk membuat versi baru dari bank soal yang ada).
    - Arsip / Nonaktifkan.

### 2.3. Form Tambah / Ubah Bank Soal

Form akan mengikuti pola:

- `react-hook-form` + `zod` resolver untuk validasi.
- Tampilan modal atau halaman slide‑over, konsisten dengan form admin lain.

Field utama:

- Informasi umum:
  - Kode bank soal (unik).
  - Nama bank soal.
  - Mata pelajaran (relasi ke `subjects`).
  - Kelas/tingkat utama (bisa terkait ke `classes` atau minimal daftar tingkat).
  - Kompetensi keahlian (relasi ke `majors`).
  - KKM khusus (opsional / override terhadap KKM di modul KKM).
  - Deskripsi singkat.
  - Status (Draft / Aktif).
- Pengaturan pola soal:
  - Jenis soal yang diizinkan (pilihan ganda, pilihan ganda kompleks (jawaban benar lebih dari 1, BENAR/SALAH)).
  - Level kesulitan (Mudah / Sedang / Sulit).

### 2.4. Manajemen Soal di Dalam Bank Soal

Di dalam detail satu bank soal:

- Tabel daftar soal:
  - NO SOAL
  - PERTANYAAN
  - JENIS SOAL
  - LEVEL KESULITAN
  - BOBOT NILAI
  - STATUS (Aktif / Nonaktif)
  - AKSI (Edit / Hapus / Duplikat)
- Form tambah/ubah soal:
  - Pertanyaan (teks, opsi dukungan rich text sederhana jika memungkinkan).
  - Jenis soal:
    - PG:
      - Minimal 2 pilihan.
      - Penanda jawaban benar.
    - Isian singkat:
      - Jawaban benar (bisa beberapa varian).
    - Esai:
      - Kunci jawaban / poin penilaian (deskripsi).
  - Bobot nilai per soal.
  - Kategori / indikator kompetensi (opsional, untuk mapping ke KD/CP).
- Dukungan:
  - Re‑ordering soal (opsional).
  - Duplikasi soal.

### 2.5. Integrasi Backend – Bank Soal

Mengacu pada pola backend yang sudah ada (Express + Prisma, endpoint REST di `/api/...`):

- Rencana endpoint:
  - `GET /api/question-banks` → list bank soal (dengan filter & pagination).
  - `POST /api/question-banks` → buat bank soal baru.
  - `GET /api/question-banks/:id` → detail bank soal (termasuk metadata).
  - `PUT /api/question-banks/:id` → update metadata bank soal.
  - `DELETE /api/question-banks/:id` → hapus/arsip bank soal.
  - `GET /api/question-banks/:id/questions` → list soal dalam bank tertentu.
  - `POST /api/question-banks/:id/questions` → tambah soal.
  - `PUT /api/question-questions/:questionId` → update soal.
  - `DELETE /api/question-questions/:questionId` → hapus soal.
- Model data (tingkat konsep, di Prisma):
  - `QuestionBank`:
    - id, code, name, subjectId, majorId, gradeLevel, minScore, description, status, timestamps.
  - `Question`:
    - id, questionBankId, type, text, difficulty, weight, isActive, timestamps.
  - `QuestionChoice`:
    - id, questionId, label (A/B/C...), text, isCorrect.

---

## 3. Halaman Sesi Ujian (`/admin/exam-sessions`)

### 3.1. Tujuan & Ruang Lingkup

Halaman ini digunakan untuk mengelola **sesi ujian CBT**:

- Membuat jadwal ujian dengan menghubungkan ke **bank soal**.
- Menentukan peserta ujian (kelas/kelompok/individu).
- Mengatur durasi, token akses, dan aturan pengerjaan.
- Memantau status pelaksanaan ujian.

### 3.2. Desain UI & Pola Komponen

Mengacu pola halaman admin lain:

- Header:
  - Judul: **Sesi Ujian**
  - Deskripsi singkat.
  - Tombol **Buat Sesi Ujian**.
- Tabel daftar sesi:
  - Kolom:
    - KODE SESI
    - NAMA SESI
    - BANK SOAL
    - TAHUN AJARAN
    - KELAS / KELOMPOK
    - JADWAL (Tanggal & jam mulai/selesai)
    - STATUS (Draft / Terjadwal / Berlangsung / Selesai / Dibatalkan)
    - AKSI (Detail / Ubah / Tutup sesi / Hapus)
- Filter:
  - Tahun ajaran (mengacu ke `academic-years`).
  - Bank soal.
  - Status sesi.

### 3.3. Form Buat / Ubah Sesi Ujian

Form akan berisi:

- Informasi utama:
  - Kode sesi (unik).
  - Nama sesi ujian.
  - Tahun ajaran (relasi ke `academic-years`).
  - Bank soal yang digunakan (relasi ke `QuestionBank`).
  - Jenis ujian (PH/PTS/PAS/TRYOUT/dll – opsional).
- Pengaturan jadwal:
  - Tanggal dan jam mulai.
  - Tanggal dan jam akhir.
  - Durasi ujian dalam menit (opsional jika ingin override rentang waktu).
- Peserta:
  - Pilih berdasarkan:
    - Kelas.
    - Kompetensi keahlian.
    - Siswa tertentu (daftar dari modul siswa).
  - Menampilkan rekap jumlah peserta yang terpilih.
- Pengaturan teknis:
  - Token ujian (opsional; auto generate).
  - Batasan:
    - Satu device per siswa (konsep; implementasi awal bisa sederhana dulu).
    - Izinkan lanjut jika koneksi terputus (resume).
  - Mode penilaian:
    - Opsi: auto‑scoring untuk PG dan isian singkat; esai butuh penilaian manual.

### 3.4. Detail Sesi & Monitoring

Pada halaman detail sesi:

- Ringkasan:
  - Informasi umum sesi.
  - Statistik cepat:
    - Jumlah peserta.
    - Berapa yang sudah mulai / selesai.
    - Rata‑rata nilai (setelah selesai).
- Tabel peserta:
  - Nama siswa.
  - Kelas.
  - Status pengerjaan (Belum mulai / Sedang mengerjakan / Selesai).
  - Waktu mulai & selesai.
  - Skor.
- Aksi:
  - Buka daftar jawaban siswa (untuk penilaian esai).
  - Ekspor hasil ke Excel (mengacu ke penggunaan `exceljs` yang sudah ada di backend).

### 3.5. Integrasi Backend – Sesi Ujian

Rencana endpoint:

- `GET /api/exam-sessions` → list sesi ujian (filter & pagination).
- `POST /api/exam-sessions` → buat sesi ujian baru.
- `GET /api/exam-sessions/:id` → detail sesi.
- `PUT /api/exam-sessions/:id` → update sesi.
- `DELETE /api/exam-sessions/:id` → hapus/batalkan.
- `GET /api/exam-sessions/:id/participants` → daftar peserta & status.
- `POST /api/exam-sessions/:id/publish` → mengubah status dari Draft ke Terjadwal/Berlangsung sesuai waktu.

Model data konsep:

- `ExamSession`:
  - id, code, name, academicYearId, questionBankId, startAt, endAt, durationMinutes, status, token, description, timestamps.
- `ExamParticipant`:
  - id, examSessionId, studentId, classId, status, startAt, endAt, score, timestamps.

---

## 4. Integrasi ke Role TEACHER & STUDENT (Tahap Lanjutan)

Meskipun fokus awal ada di menu admin, modul UJIAN & CBT perlu mengalir ke:

- Dashboard guru (`/teacher`):
  - Melihat daftar sesi ujian yang diampu.
  - Mengakses rekap hasil ujian siswa.
  - Melakukan penilaian manual untuk soal esai.
- Dashboard siswa (`/student`):
  - Melihat daftar ujian aktif/terjadwal untuk dirinya.
  - Mengakses halaman pengerjaan ujian CBT.

Rencana umum:

- Menambah endpoint untuk siswa/guru:
  - `GET /api/students/me/exams` → daftar ujian untuk siswa yang sedang login.
  - `GET /api/teachers/me/exams` → daftar ujian yang diampu guru.
  - `POST /api/exams/:sessionId/start` → mulai ujian (siswa).
  - `POST /api/exams/:sessionId/submit` → kirim jawaban.
  - `GET /api/exams/:sessionId/results` → hasil ujian (guru/admin).
- Halaman CBT siswa:
  - Layout full‑screen, fokus ke soal.
  - Navigasi antar soal (daftar nomor soal).
  - Timer di sisi atas.
  - Tombol Simpan & Kirim Ujian.

---

## 5. Pengelolaan Nilai & Integrasi dengan Modul Rapor

Karena project sudah memiliki modul **Laporan / Rapor**, hasil dari UJIAN & CBT perlu terhubung (minimal secara konseptual di tahap awal):

- Menyimpan nilai ujian per siswa di tabel yang dapat:
  - Diambil kembali saat rekap nilai akhir.
  - Digunakan sebagai salah satu komponen penilaian (misal PTS/PAS).
- Menyediakan endpoint helper:
  - `GET /api/exam-sessions/:id/scores` → rekap nilai per siswa untuk satu sesi.
  - `GET /api/students/:id/exams` → riwayat nilai ujian per siswa.
- Di sisi UI admin/guru:
  - Tombol *Ekspor nilai ujian* ke Excel.
  - Opsional: integrasi ke modul penilaian rapor sebagai sumber nilai tertentu.

---

## 6. Keamanan, Hak Akses, dan Logging

Mengacu pada pola otentikasi & otorisasi yang sudah ada:

- Hanya **ADMIN** (dan nanti mungkin **TEACHER** tertentu) yang boleh:
  - Mengelola Bank Soal.
  - Mengelola Sesi Ujian.
- **STUDENT**:
  - Hanya bisa mengakses ujian yang memang menjadi haknya (berdasarkan kelas / daftar peserta).
  - Tidak bisa mengakses metadata bank soal secara langsung.
- Penambahan middleware backend:
  - Cek role pada setiap endpoint baru (ADMIN/TEACHER/STUDENT).
- Logging:
  - Mencatat aktivitas penting:
    - Pembuatan / pengubahan bank soal.
    - Penerbitan sesi ujian.
    - Pengiriman jawaban ujian oleh siswa.

---

## 7. Tahapan Implementasi

Urutan kerja agar sejalan dengan struktur existing:

1. **Frontend – Routing & Skeleton Halaman**
   - Tambahkan rute `/admin/question-bank` dan `/admin/exam-sessions` di `App.tsx`.
   - Buat komponen halaman kosong `QuestionBankPage` dan `ExamSessionsPage` dengan layout mengikuti halaman admin lain.
2. **Backend – Model & Endpoint Dasar**
   - Definisikan model Prisma `QuestionBank`, `Question`, `QuestionChoice`, `ExamSession`, `ExamParticipant`.
   - Tambahkan endpoint CRUD dasar untuk Bank Soal dan Sesi Ujian.
3. **Frontend – List & Form**
   - Implementasi tabel list + filter + pagination untuk Bank Soal dan Sesi Ujian (menggunakan `react-query` dan service API mirip halaman master data lain).
   - Implementasi form tambah/ubah dengan `react-hook-form` + `zod`.
4. **Frontend – Manajemen Soal & Peserta**
   - Halaman/detail bank soal untuk mengelola daftar soal.
   - Halaman/detail sesi ujian untuk mengelola peserta & monitoring.
5. **Alur CBT Siswa & Guru**
   - Implementasi halaman pengerjaan ujian untuk siswa.
   - Implementasi halaman rekap hasil dan penilaian esai untuk guru.
6. **Integrasi Rapor & Ekspor**
   - Pengikatan nilai ujian ke modul rapor (minimal sebagai data pendukung).
   - Fitur ekspor nilai ke Excel.

Dengan dokumen ini, modul **UJIAN & CBT** memiliki scope dan rencana kerja yang jelas, tetap konsisten dengan pola data, UI, dan arsitektur yang sudah ada di project.

