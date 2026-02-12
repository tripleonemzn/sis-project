# Konsep Manajemen Ujian (CBT & Bank Soal)

Dokumen ini menjelaskan fitur lengkap modul **Ujian / CBT (Computer Based Test)** yang terintegrasi dalam sistem. Modul ini digunakan untuk pelaksanaan Ulangan Harian, PTS, PAS, hingga Ujian Sekolah.

## 1. Bank Soal (Question Bank)

Gudang penyimpanan soal yang dikelola oleh Guru Mapel. Soal bersifat *reusable* (bisa dipakai berulang kali di ujian berbeda).

### 1.1. Manajemen Soal
- **Grouping**: Soal dikelompokkan berdasarkan Mata Pelajaran, Jenjang Kelas, dan Topik/Kompetensi Dasar.
- **Tipe Soal**:
  1. **Pilihan Ganda (PG)**: Satu jawaban benar.
  2. **Pilihan Ganda Kompleks (PGK)**: Lebih dari satu jawaban benar (Checkbox).
  3. **Menjodohkan (Matching)**: Pasangan premis dan jawaban.
  4. **Isian Singkat**: Jawaban pendek text match.
  5. **Uraian / Essay**: Jawaban panjang (koreksi manual).
- **Media**: Support gambar, audio (listening), dan rumus matematika (LaTeX/MathJax) di soal maupun opsi jawaban.

### 1.2. Import & Export
- **Import Word/Excel**: Guru bisa upload template soal massal agar tidak input satu-satu.
- **Copy Bank Soal**: Guru bisa menyalin bank soal tahun lalu untuk dimodifikasi.

---

## 2. Pembuatan Jadwal & Paket Ujian

Setelah bank soal siap, admin atau guru membuat sesi ujian.

### 2.1. Setting Ujian
- **Nama Ujian**: Misal "PTS Matematika Kelas X".
- **Mode Soal**: 
  - *Acak Soal*: Urutan nomor beda tiap siswa.
  - *Acak Opsi*: Urutan jawaban A/B/C/D diacak.
- **Komposisi Soal**: Bisa mengambil X soal dari Bank Soal A, dan Y soal dari Bank Soal B (proporsi tingkat kesulitan).
- **Durasi & Waktu**: Tanggal mulai, jam mulai, durasi pengerjaan (menit).

### 2.2. Target Peserta
- **Assign Kelas**: Memilih kelas mana saja yang berhak ikut ujian ini.
- **Token Ujian**: 
  - *Statis*: Token tetap.
  - *Dinamis*: Token berubah tiap 15 menit (untuk keamanan).

### 2.3. Keamanan (Security)
- **Exambrowser Mode**: Jika diaktifkan, ujian hanya bisa dibuka lewat aplikasi khusus yang mengunci layar (mencegah alt-tab/buka google).
- **Block Copy-Paste**: Mencegah klik kanan di soal.

---

## 3. Pelaksanaan Ujian (Siswa)

- **Login Peserta**: Siswa login dan memasukkan Token.
- **Interface Pengerjaan**:
  - Navigasi nomor soal.
  - Penanda soal ragu-ragu.
  - Timer mundur.
  - Auto-save jawaban jika koneksi putus nyambung.
- **Selesai**: Siswa klik tombol "Selesai", nilai langsung muncul (opsional, bisa di-hidden).

---

## 4. Monitoring & Proctoring (Pengawas)

Halaman untuk guru/pengawas saat ujian berlangsung.

### Fitur Real-time:
- **Status Peserta**: Melihat siapa yang *Belum Login*, *Sedang Mengerjakan*, atau *Selesai*.
- **Force Finish**: Menghentikan paksa ujian siswa (misal ketahuan curang atau waktu habis tapi lupa submit).
- **Reset Login**: Mengizinkan siswa login ulang jika terjadi error device/logout tiba-tiba.
- **Log Aktivitas**: Mencatat jika siswa mencoba keluar dari browser ujian.

---

## 5. Koreksi & Hasil Ujian

### 5.1. Koreksi Otomatis & Manual
- **PG/Isian**: Langsung dinilai oleh sistem detik itu juga.
- **Essay**: Guru masuk ke menu *Koreksi Essay*, memberikan skor manual, dan sistem menjumlahkan totalnya.

### 5.2. Analisis Butir Soal (Item Analysis)
- Statistik tingkat kesukaran soal (berapa % siswa menjawab benar).
- Analisis daya beda soal.
- Rekap jawaban siswa (Distribusi pilihan jawaban A, B, C, D, E).

### 5.3. Integrasi Nilai (PENTING)
- **Tombol "Push to Gradebook"**: Hasil nilai ujian **dikirim otomatis** ke modul `input_nilai`.
- Guru tidak perlu menyalin nilai ujian satu per satu ke buku nilai.
- Pilihan target kolom: Nilai ini mau dimasukkan sebagai UH1, UH2, atau UTS?

---

## Ringkasan Alur
1. **Guru** buat Bank Soal.
2. **Guru/Admin** buat Jadwal Ujian & set Token.
3. **Siswa** mengerjakan ujian (CBT).
4. **Sistem** koreksi otomatis (PG).
5. **Guru** koreksi manual (Essay) jika ada.
6. **Guru** analisa hasil & kirim nilai ke rapor/buku nilai.
