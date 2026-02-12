# Konsep Penilaian (Role Guru Mapel)

Dokumen ini menjelaskan alur kerja dan logika sistem untuk fitur **Input Nilai** yang dilakukan oleh Guru Mata Pelajaran. Sistem dirancang untuk mengakomodasi Kurikulum Merdeka dan K13 secara fleksibel.

## 1. Struktur & Komponen Penilaian

Setiap mata pelajaran di kelas tertentu memiliki struktur penilaian yang harus diseting oleh Guru Mapel sebelum input nilai.

### 1.1. Perencanaan Penilaian (Bobot & Kategori)
Guru harus mendefinisikan bobot untuk perhitungan Nilai Akhir (NA).
- **Formatif (Harian/Proses)**: Nilai tugas, kuis, ulangan harian.
  - Bisa dipecah berdasarkan *Tujuan Pembelajaran (TP)* atau *Materi*.
- **Sumatif Tengah Semester (STS/PTS)**: Opsional, tergantung kebijakan sekolah.
- **Sumatif Akhir Semester (SAS/PAS/PAT)**: Ujian akhir.
- **Nilai Keterampilan (Praktik/Proyek)**: Jika dipisah (mode K13).
- **Khusus Kelas XII (Semester Genap)**:
  - **Ujian Sekolah (US)**: Komponen khusus kelulusan.
  - Terdiri dari: **US Praktik / UKK** (50%) dan **US Teori** (50%).
  - Nilai US berdiri sendiri sebagai nilai ijazah/kelulusan, terpisah dari Nilai Rapor Semester.

**Integrasi**: 
- Setting ini menentukan kolom apa saja yang muncul di form input nilai.

### 1.2. Input Nilai
Proses memasukkan angka atau predikat ke dalam sistem.

#### A. Input Manual (Web Form)
- Tampilan berbentuk tabel grid (Siswa x Komponen Nilai).
- Fitur *Auto-save* per cell atau tombol *Simpan* di akhir.
- Validasi range nilai (0-100).

#### B. Import Excel
- Guru mengunduh **Template Nilai** (file .xlsx yang sudah berisi Nama Siswa dan kolom penilaian sesuai perencanaan).
- Guru mengisi offline, lalu upload kembali.
- **Integrasi**: Sistem memparsing file excel dan mengisi database nilai.

#### C. Tarik Nilai dari Modul Ujian (CBT)
- Jika Guru mengadakan ulangan harian atau ujian semester menggunakan **Modul Ujian (CBT)** di aplikasi ini.
- Tombol **"Ambil dari Hasil Ujian"**.
- **Integrasi**: Mengambil nilai akhir siswa dari tabel hasil ujian (`exam_results`) dan memasukkannya ke kolom nilai yang sesuai (misal: Nilai UH 1 diambil dari Ujian Blok 1).

## 2. Pengolahan & Kalkulasi

### 2.1. Hitung Nilai Akhir (NA) & Nilai US
Sistem otomatis menghitung NA berdasarkan rumus bobot yang diset di awal.
- Rumus Contoh (Non-XII): `NA = (Rata2 Formatif * 60%) + (STS * 20%) + (SAS * 20%)`.
- Rumus Kelas XII (Nilai US):
  - `Nilai US = (Rata2 UKK/Praktik * 50%) + (Rata2 US Teori * 50%)`.
- Nilai Akhir ini yang akan dikirim ke Wali Kelas.

### 2.2. Deskripsi Capaian (Otomatisasi)
- Sistem menghasilkan deskripsi naratif untuk Rapor (Capaian Kompetensi).
- **Logika**: 
  - Jika nilai TP1 > 90 → "Sangat menguasai [Materi TP1]".
  - Jika nilai TP3 < 70 → "Perlu bimbingan dalam [Materi TP3]".
- Guru bisa mengedit deskripsi hasil generate ini manual.

## 3. Integrasi & Output Data

Setelah nilai diinput dan "Dikunci" (Submit/Finalize) oleh Guru Mapel, data akan mengalir ke berbagai bagian sistem:

### 3.1. Ke Wali Kelas (Leger) -> *Integrasi Utama*
- Nilai Akhir Mapel masuk ke **Leger Wali Kelas**.
- Status di dashboard Wali Kelas berubah dari "Belum Input" menjadi "Sudah Input".
- Data ini menjadi bahan baku Rapor Akademik.

### 3.2. Ke Portal Siswa & Orang Tua
- **Real-time (Opsional)**: Orang tua bisa melihat nilai ulangan harian segera setelah diinput (untuk monitoring).
- **Rapor**: Nilai akhir tampil di menu Rapor Digital Siswa setelah Wali Kelas mempublish rapor.

### 3.3. Ke Dashboard Kurikulum/Kepala Sekolah
- Monitoring ketercapaian target kurikulum.
- Grafik sebaran nilai siswa per mapel.
- Identifikasi siswa yang butuh remedial massal.

## 4. Remedial & Pengayaan
- Jika nilai siswa di bawah KKM/KKTP (Kriteria Ketercapaian Tujuan Pembelajaran).
- Fitur input **Nilai Remedial**.
- Logika: Apakah nilai remedial menggantikan nilai asli, atau dirata-rata, atau diambil batas KKM (sesuai setting sekolah).

---

## Ringkasan Alur Data
1. **Guru Mapel** set bobot & rencana penilaian.
2. **Guru Mapel** input nilai (Manual / Import / Tarik CBT).
3. **Sistem** hitung Nilai Akhir & Generate Deskripsi.
4. **Guru Mapel** klik "Kirim Nilai".
5. **Database** update tabel `student_grades`.
6. **Wali Kelas** menerima data di Leger & Rapor.
