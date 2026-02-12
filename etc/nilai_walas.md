# Konsep Penilaian Wali Kelas & Rapor

Dokumen ini menjelaskan fitur-fitur penilaian dari sudut pandang **Wali Kelas**. Wali kelas bertugas sebagai agregator (pengumpul) data dari berbagai sumber untuk disajikan menjadi Laporan Hasil Belajar (Rapor).

## 1. Leger Nilai (Master Sheet)

Leger adalah tabel induk yang memuat seluruh nilai siswa dalam satu kelas untuk semua mata pelajaran.

### Fungsi & Fitur:
- **Tampilan Grid Besar**: Baris = Siswa, Kolom = Mata Pelajaran.
- **Monitoring Input**: Wali kelas bisa melihat mapel mana yang *kosong* atau *belum lengkap*.
- **Integrasi Otomatis**:
  - Data nilai **otomatis terisi** saat Guru Mapel melakukan "Kirim Nilai" di modul `input_nilai`.
  - Wali kelas **tidak menginput** nilai mapel akademik secara manual (kecuali override/darurat dengan hak akses khusus).
- **Kolom Khusus Kelas XII**:
  - Leger kelas XII memiliki kolom tambahan **Nilai US** (Ujian Sekolah).
  - Nilai US ini hasil kalkulasi otomatis (50% Praktik + 50% Teori) dari input guru mapel.
- **Kalkulasi**: Menghitung Total Nilai, Rata-rata, dan Peringkat (jika diaktifkan).
- **Ekspor**: Download Leger ke Excel/PDF untuk arsip sekolah.

## 2. Peringkat (Ranking)

Sistem menghitung peringkat siswa di kelas secara otomatis.
- **Logika**: Berdasarkan *Rata-rata Nilai Akhir* atau *Total Nilai* dari Leger.
- **Filter**: Peringkat Paralel (Satu angkatan) vs Peringkat Kelas.
- **Integrasi**: Hasil peringkat bisa ditampilkan di Rapor (opsional, tergantung kebijakan sekolah) atau hanya untuk konsumsi internal Wali Kelas.

## 3. Data Nilai Non-Akademik (Ekstra & Sikap)

Wali kelas bertanggung jawab melengkapi data ini agar rapor lengkap.

### 3.1. Nilai Ekstrakurikuler
- **Sumber Data**:
  - **Otomatis**: Jika Pembina Ekskul memiliki akses input nilai, data masuk otomatis.
  - **Manual Walas**: Wali kelas menginput manual berdasarkan laporan dari pelatih ekskul.
- **Komponen**: Nama Ekskul, Predikat (A/B/C), Deskripsi Kegiatan.

### 3.2. Nilai Sikap & Karakter (P5)
- **Sikap Spiritual & Sosial**: Input predikat dan deskripsi.
- **Integrasi**: Bisa mengambil referensi dari menu *Catatan Perilaku* atau *Buku Kasus* siswa.

### 3.3. Ketidakhadiran (Absensi)
- **Integrasi Otomatis**: Angka Sakit/Izin/Alpha diambil dari rekapitulasi **Menu Presensi Harian** selama satu semester.
- **Override**: Wali kelas bisa mengoreksi jumlah jika ada dispensasi offline.

## 4. Jenis-Jenis Rapor

Sistem mendukung pencetakan berbagai jenis laporan hasil belajar.

### 4.1. Rapor 1 (Rapor Tengah Semester / Bayangan)
- **Tujuan**: Laporan progres di pertengahan semester.
- **Isi**: Nilai Pengetahuan/Formatif saja, atau Nilai UTS. Biasanya belum ada deskripsi panjang.
- **Sumber Data**: Kolom nilai Formatif/STS dari Guru Mapel.

### 4.2. Rapor 2 (Rapor Akhir Semester / Kenaikan Kelas)
- **Tujuan**: Laporan resmi akhir semester.
- **Isi Lengkap**:
  - Nilai Akademik & Deskripsi Capaian.
  - Nilai Ekskul.
  - Absensi.
  - Catatan Wali Kelas (Saran/Motivasi).
  - Status Kenaikan Kelas / Kelulusan (di Semester Genap).
- **Fitur**: "Lock Rapor" (agar tidak berubah saat dicetak) & "Publish Rapor" (agar muncul di akun ortu).

### 4.3. Rapor P5 (Proyek Penguatan Profil Pelajar Pancasila)
Rapor khusus Kurikulum Merdeka yang terpisah dari rapor akademik.
- **Konsep**: Menilai *Dimensi*, *Elemen*, dan *Sub-elemen* Profil Pelajar Pancasila, bukan mapel.
- **Input**: Dilakukan oleh **Koordinator P5** atau **Fasilitator Projek**.
- **Peran Walas**: Memantau kelengkapan input nilai P5 siswa di kelasnya dan mencetak rapor P5.
- **Output**: Lembar deskripsi pencapaian projek (misal: Tema "Gaya Hidup Berkelanjutan").

## Ringkasan Integrasi Data Wali Kelas

| Komponen Rapor | Sumber Data (Input Oleh) | Integrasi Sistem |
| :--- | :--- | :--- |
| **Nilai Mapel** | Guru Mata Pelajaran | Otomatis via modul `input_nilai` |
| **Deskripsi Mapel** | Guru Mata Pelajaran | Otomatis generate + Edit Guru |
| **Absensi** | Guru Piket / Guru Mapel | Agregasi dari modul `Presensi` |
| **Ekstrakurikuler** | Pembina Ekskul / Walas | Tarik data Ekskul Siswa |
| **Sikap/Perilaku** | Guru BK / Walas | Modul `Catatan Perilaku` |
| **Prestasi** | Kesiswaan / Walas | Modul `Data Prestasi` |
| **Nilai P5** | Koordinator Projek | Modul `Projek P5` |

Wali kelas bertindak sebagai **Manager** yang memverifikasi semua data di atas sudah masuk sebelum tombol **"Cetak Rapor"** ditekan.
