# SIS-Project Demo Walkthrough Script

Dokumen ini adalah panduan presentasi (script demo) untuk memamerkan fitur unggulan aplikasi SIS-Project kepada calon klien (Sekolah/Yayasan) atau pembeli.

**Durasi Estimasi:** 15-20 Menit
**Target Audience:** Kepala Sekolah, Ketua Yayasan, Tim IT Sekolah, Wakasek.

---

## 1. Persiapan (Pre-Demo Setup)

Sebelum melakukan demo, pastikan database telah di-reset dan diisi dengan data dummy yang "cantik" agar presentasi berjalan mulus.

**Cara Reset & Seeding Data Demo:**
Jalankan perintah berikut di terminal server/backend:
```bash
cd /var/www/sis-project/backend
npx ts-node prisma/seed_demo.ts
```

**User Accounts untuk Login:**
| Role | Username | Password | Konteks Demo |
|---|---|---|---|
| **Admin** | `admin` | `P@ssw0rd` | Pengaturan Sistem, User Management |
| **Guru** | `guru01` | `P@ssw0rd` | Input Nilai, Absensi, Buat Soal Ujian |
| **Siswa** | `siswa01` | `P@ssw0rd` | Ujian Online (CBT), Lihat Nilai, Jadwal |
| **Ortu** | `ortu01` | `P@ssw0rd` | Monitoring Absensi & Tagihan (Mobile) |
| **Sarpras** | `sarpras` | `P@ssw0rd` | Manajemen Aset & Inventaris |

---

## 2. Skenario Demo (Flow)

### A. Opening (1 Menit)
"Aplikasi ini bukan sekadar SIS biasa, melainkan **School ERP** yang mengintegrasikan Akademik, Keuangan, Aset, dan Kepegawaian dalam satu platform real-time."

### B. Role Admin: Dashboard & Overview (2 Menit)
*Login sebagai `admin`*
1.  **Dashboard**: Tunjukkan grafik statistik siswa, guru, dan status server.
2.  **User Management**: Tunjukkan betapa mudahnya mencari dan mengedit data siswa/guru.
3.  **Akademik**: Tunjukkan menu Tahun Ajaran Aktif dan Manajemen Kelas.

### C. Role Guru: Teaching & Assessment (4 Menit)
*Login sebagai `guru01`*
1.  **Jadwal Mengajar**: Tampilkan jadwal hari ini.
2.  **Absensi Siswa**:
    *   Masuk ke menu Absensi.
    *   Lakukan absensi cepat (Hadir/Sakit/Alpha).
    *   *Highlight*: "Data ini langsung terkirim notifikasinya ke HP Orang Tua."
3.  **Bank Soal & Ujian (CBT)**:
    *   Masuk ke menu **Ujian/CBT**.
    *   Tunjukkan fitur **Bank Soal** (dukung gambar, rumus matematika/LaTeX).
    *   Buat **Paket Ujian** baru atau edit yang sudah ada.
    *   Tunjukkan fitur **Analisis Butir Soal** (Tingkat Kesukaran, Daya Beda) - *Killer Feature!*

### D. Role Siswa: The Student Experience (3 Menit)
*Login sebagai `siswa01` (bisa di Incognito window atau HP)*
1.  **Dashboard Siswa**: Jadwal hari ini, Tugas belum dikerjakan.
2.  **Ujian Online (CBT)**:
    *   Masuk ke menu Ujian.
    *   Kerjakan ujian simulasi.
    *   Tunjukkan UI yang bersih, *countdown timer*, dan navigasi soal.
    *   Submit ujian dan lihat nilai langsung keluar (jika diizinkan).
3.  **Lihat Raport**: Tampilkan hasil studi semester lalu.

### E. Role Sarpras: Asset Management (2 Menit)
*Login sebagai `sarpras` (Wakasek Sarpras)*
1.  **Inventaris Ruangan**:
    *   Pilih Ruangan (misal: Lab Komputer).
    *   Lihat daftar barang (PC, Kursi, AC).
    *   Tunjukkan fitur **Scan QR Code** (jika demo via HP) untuk audit aset.
2.  **Peminjaman Barang**: Demo alur peminjaman proyektor/buku.

### F. Role Keuangan & Budgeting (3 Menit)
*Login sebagai `admin` atau Role Keuangan*
1.  **E-Budgeting**:
    *   Tunjukkan alur pengajuan anggaran (RAB) dari unit kerja.
    *   Approval berjenjang (Kepala Sekolah -> Yayasan).
2.  **LPJ Digital**: Upload bukti transaksi/nota langsung di sistem.

### G. Mobile App (Android) (3 Menit)
*Buka Emulator atau Mirroring HP*
1.  **Notifikasi Real-time**: Tunjukkan notifikasi "Anak Anda telah hadir di sekolah".
2.  **Tagihan SPP**: Menu pembayaran dan history pembayaran.
3.  **Berita Sekolah**: Pengumuman/Artikel terbaru dari sekolah.

---

## 3. Key Selling Points (Wajib Disebutkan)

1.  **Single Sign-On (SSO) & Integrated Database**: Tidak ada data ganda antara bagian Kurikulum, Kesiswaan, dan Keuangan.
2.  **Real-time Updates**: Perubahan jadwal atau pengumuman langsung muncul di HP siswa/ortu detik itu juga.
3.  **Offline-First CBT**: Modul ujian dirancang tahan banting meskipun koneksi internet siswa tidak stabil.
4.  **Paperless Office**: E-Raport, E-Budgeting, E-Inventory mengurangi penggunaan kertas hingga 80%.

---

## 4. Closing
"Dengan investasi ini, Bapak/Ibu tidak hanya membeli software, tapi membeli **Efisiensi Operasional** dan **Modernisasi Reputasi Sekolah**."
