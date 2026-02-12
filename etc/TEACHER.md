# Spesifikasi Role GURU

Dokumen ini menjelaskan secara rinci apa saja yang harus dibangun untuk **role Guru** pada sistem, dengan fokus utama pada:

- Struktur dan isi **sidebar menu** untuk Guru
- Penjelasan fungsi tiap menu
- Aturan visibilitas khusus untuk **Guru Wali Kelas**, **Guru Kelas Training**, dan **Guru dengan Tugas Tambahan** (Wakasek, Sekretaris Wakasek, Kepala Lab, Kepala Kompetensi, dll)

Dokumen ini dimaksudkan sebagai acuan teknis agar sistem dapat mengimplementasikan role Guru secara konsisten.

---

## 1. Aturan Umum Role Guru

- Role: `guru`
- Login: menggunakan akun guru yang sudah terdaftar di sistem (username KGB2Gxxx (xxx=kode guru) dan password default smkskgb2).
- Setelah login, guru diarahkan ke **Dashboard Guru**.
- Sidebar menampilkan menu-menu yang sesuai dengan:
- - Hak akses dasar guru.
- - Status apakah guru tersebut adalah **Wali Kelas**.
- - Status apakah guru tersebut memiliki **Kelas Training**.
- - Status apakah guru tersebut memiliki **Tugas Tambahan** yang ditetapkan admin (Wakasek, Sekretaris Wakasek, Kepala Lab, Kepala Kompetensi, dll).

### 1.1. Aturan Visibilitas Menu

- Menu dasar (core) Guru selalu tampil untuk semua user dengan role `guru`.
- Menu khusus **Wali Kelas** hanya tampil jika:
  - Guru memiliki atribut/flag `is_wali_kelas = true` dan
  - Sudah terhubung ke minimal satu kelas sebagai wali kelas.
- Menu khusus **Kelas Training** hanya tampil jika:
  - Guru memiliki atribut/flag `has_training_class = true` atau
  - Terdapat relasi guru dengan minimal satu kelas yang bertipe `training`.
- Menu khusus **Tugas Tambahan** hanya tampil jika:
  - Admin memberikan penugasan tambahan ke guru tersebut (misalnya sebagai Wakasek, Sekretaris Wakasek, Kepala Lab, Kepala Kompetensi, dll).
  - Di data guru tersimpan minimal satu item tugas tambahan yang masih aktif pada tahun ajaran berjalan.
- Jika guru **bukan** wali kelas, **tidak** mengampu kelas training, dan **tidak** memiliki tugas tambahan:
  - Hanya menu **Umum Guru** yang tampil, tanpa grup menu Wali Kelas, Kelas Training, dan Tugas Tambahan.
- Visibilitas menu dihitung setelah login dan saat terjadi perubahan hak akses (misal: guru baru diangkat menjadi wali kelas, mendapatkan kelas training, atau mendapatkan tugas tambahan baru).

---

## 2. Sidebar Menu Utama Guru (Umum, untuk Semua Guru)

Bagian ini menjelaskan menu yang **selalu tersedia** untuk semua guru, terlepas dari status wali kelas maupun kelas training.

### 2.1. Dashboard

- **Nama menu:** Dashboard
- **Tujuan:** Menjadi ringkasan aktivitas dan informasi penting untuk guru.
- **Isi/fungsi utama:**
  - Ringkasan jadwal mengajar hari ini.
  - Ringkasan kelas yang diampu (jumlah kelas, jumlah siswa).
  - Notifikasi penting (pengumuman sekolah, pesan dari admin, batas input nilai, dsb).
  - Shortcut ke menu penting (Presensi, Penilaian, Rapor).

### 2.2. Jadwal Mengajar

- **Nama menu:** Jadwal Mengajar
- **Tujuan:** Menampilkan jadwal mengajar guru per hari, mingguan, dan per semester.
- **Isi/fungsi utama:**
  - Daftar jadwal mengajar berdasarkan:
    - Hari
    - Jam pelajaran
    - Kelas
    - Mata pelajaran
  - Filter berdasarkan hari, kelas, dan mata pelajaran.
  - Indikasi jadwal yang sedang berlangsung (current session).
  - Akses cepat ke:
    - Presensi untuk sesi tersebut.
    - Input nilai untuk kelas dan mapel terkait.

### 2.3. Kelas & Mata Pelajaran

- **Nama menu:** Kelas & Mata Pelajaran
- **Tujuan:** Memudahkan guru melihat daftar kelas dan mata pelajaran yang diampu.
- **Isi/fungsi utama:**
  - Daftar semua kelas yang diampu guru untuk tahun ajaran berjalan.
  - Di dalam tiap kelas:
    - Daftar mata pelajaran yang diampu guru tersebut.
    - Jumlah siswa per kelas.
  - Aksi:
    - Masuk ke halaman detail kelas (presensi, nilai, materi, tugas).

### 2.4. Presensi Siswa

- **Nama menu:** Presensi
- **Tujuan:** Mengelola kehadiran siswa per pertemuan/pelajaran.
- **Isi/fungsi utama:**
  - Pilih:
    - Kelas
    - Mata pelajaran
    - Tanggal/pertemuan
  - Tampilkan daftar siswa di kelas tersebut.
  - Input status kehadiran (Hadir, Sakit, Izin, Alpha, dll).
  - Simpan presensi per pertemuan.
  - Rekap presensi per:
    - Siswa
    - Kelas
    - Rentang tanggal
  - Aksi tambahan:
    - Edit presensi yang sudah tersimpan (sesuai aturan).
    - Unduh/ekspor rekap presensi (jika diperlukan di sistem).

### 2.5. Penilaian & Nilai Akhir

- **Nama menu:** Penilaian
- **Tujuan:** Menginput dan mengelola nilai siswa untuk setiap mata pelajaran yang diampu guru.
- **Isi/fungsi utama:**
  - Pilih:
    - Kelas
    - Mata pelajaran
    - Jenis penilaian (Tugas, Ulangan Harian, UTS, UAS, Praktik, Proyek, dll).
  - Input nilai per siswa.
  - Mengatur bobot nilai per jenis penilaian (jika diizinkan oleh sistem).
  - Menghitung nilai akhir berdasarkan rumus yang telah ditentukan sistem.
  - Menampilkan:
    - Nilai per komponen.
    - Nilai akhir per siswa dalam mata pelajaran tersebut.
  - Aksi tambahan:
    - Edit nilai (dengan pencatatan histori perubahan jika ada).
    - Impor nilai dari template (opsional, jika ada).
    - Ekspor nilai ke format tertentu (opsional).

### 2.6. Rapor Mata Pelajaran (Level Guru Mapel)

- **Nama menu:** Rapor Mapel
- **Tujuan:** Menampilkan rekap nilai rapor per mata pelajaran yang diampu guru, di tiap kelas.
- **Isi/fungsi utama:**
  - Pilih:
    - Kelas
    - Mata pelajaran
    - Periode/semester
  - Menampilkan daftar siswa dan nilai rapor akhir mapel tersebut.
  - Menambahkan catatan singkat (deskripsi nilai, deskripsi kompetensi) per siswa.
  - Menandai siswa yang nilainya belum lengkap.
  - Aksi:
    - Konfirmasi bahwa input nilai mapel untuk kelas tersebut sudah selesai (lock per mapel, jika ada mekanisme).

### 2.7. Materi & Tugas

- **Nama menu:** Materi & Tugas
- **Tujuan:** Mengelola materi pembelajaran dan tugas untuk siswa.
- **Isi/fungsi utama:**
  - Daftar materi per:
    - Kelas
    - Mata pelajaran
  - Upload/kelola materi (file, link, teks).
  - Membuat tugas/assignment:
    - Judul tugas
    - Deskripsi
    - Tanggal mulai & deadline
    - Kelas dan mapel yang dituju
  - Memantau status pengumpulan tugas:
    - Sudah mengumpulkan / belum
    - Nilai tugas (bisa terhubung dengan menu Penilaian).

### 2.8. Komunikasi & Pengumuman

- **Nama menu:** Komunikasi
- **Tujuan:** Menjadi pusat komunikasi guru dengan siswa/orang tua (jika sistem mendukung) dan internal antar guru/wali.
- **Isi/fungsi utama:**
  - Melihat pengumuman dari sekolah atau admin.
  - Mengirim pengumuman ke:
    - Kelas tertentu
    - Siswa tertentu (opsional, jika ada).
  - Melihat pesan yang masuk untuk guru (misalnya dari wali murid, siswa, atau admin).

### 2.9. Profil & Pengaturan Akun

- **Nama menu:** Profil
- **Tujuan:** Mengelola data pribadi dan pengaturan akun guru.
- **Isi/fungsi utama:**
  - Menampilkan data profil guru:
    - Nama
    - NIP/NIK
    - Mata pelajaran utama
    - Kontak (email/telepon, jika ada)
  - Mengubah foto profil (opsional).
  - Ganti password.
  - Pengaturan dasar lain yang berkaitan dengan akun guru.

### 2.10. Bantuan / Panduan

- **Nama menu:** Bantuan
- **Tujuan:** Menyediakan panduan penggunaan sistem untuk guru.
- **Isi/fungsi utama:**
  - FAQ seputar penggunaan fitur guru.
  - Panduan langkah demi langkah (video/pdf/link) jika disediakan.

---

## 3. Menu Khusus Wali Kelas

Menu di bagian ini **hanya muncul jika guru adalah Wali Kelas**. Jika tidak, seluruh grup menu ini **disembunyikan** dari sidebar.

### 3.1. Aturan Visibilitas Menu Wali Kelas

- Menu Wali Kelas aktif jika:
  - `is_wali_kelas = true`
  - Guru memiliki minimal satu kelas binaan pada tahun ajaran aktif.
- Jika kondisi di atas tidak terpenuhi:
  - Seluruh menu Wali Kelas tidak ditampilkan di sidebar.

### 3.2. Data Siswa Kelas Binaan

- **Nama menu:** Siswa Kelas Binaan
- **Tujuan:** Mengelola dan memantau data siswa di kelas yang menjadi tanggung jawab wali kelas.
- **Isi/fungsi utama:**
  - Pilih kelas binaan (jika wali mengampu lebih dari satu kelas).
  - Menampilkan daftar siswa di kelas tersebut:
    - Nama
    - NIS/NISN
    - Status aktif/nonaktif
  - Aksi:
    - Lihat detail profil siswa (data pribadi, riwayat presensi, riwayat nilai ringkas).

### 3.3. Rekap Presensi Kelas

- **Nama menu:** Rekap Presensi Kelas
- **Tujuan:** Memberikan tampilan presensi kelas secara menyeluruh untuk wali kelas.
- **Isi/fungsi utama:**
  - Pilih kelas binaan.
  - Rekap presensi per siswa untuk rentang waktu tertentu (harian, mingguan, bulanan, per semester).
  - Statistik presensi:
    - Jumlah hadir, sakit, izin, alpha per siswa.
  - Aksi:
    - Cetak/unduh rekap presensi kelas.

### 3.4. Catatan Perilaku & Konseling

- **Nama menu:** Catatan Perilaku
- **Tujuan:** Mencatat perilaku siswa, masalah kedisiplinan, dan tindak lanjut konseling.
- **Isi/fungsi utama:**
  - Pilih siswa di kelas binaan.
  - Tambah catatan:
    - Jenis kejadian (positif/negatif).
    - Deskripsi singkat.
    - Tanggal kejadian.
    - Tindak lanjut/keterangan konseling.
  - Menampilkan riwayat catatan perilaku per siswa.

### 3.5. Persetujuan Izin / Surat Keterangan

- **Nama menu:** Persetujuan Izin
- **Tujuan:** Mengelola permohonan izin siswa yang perlu disetujui wali kelas.
- **Isi/fungsi utama:**
  - Daftar permohonan izin siswa (misalnya izin tidak hadir, pulang awal, dsb).
  - Detail permohonan:
    - Nama siswa
    - Tanggal
    - Alasan
    - Lampiran (jika ada).
  - Aksi:
    - Setujui atau tolak permohonan.
    - Catat keterangan tambahan.

### 3.6. Monitoring Nilai & Kenaikan Kelas

- **Nama menu:** Monitoring Nilai Kelas
- **Tujuan:** Memberikan gambaran menyeluruh nilai siswa di kelas wali, lintas mata pelajaran.
- **Isi/fungsi utama:**
  - Rekap nilai rapor semua mapel per siswa.
  - Indikator siswa yang:
    - Nilainya di bawah KKM.
    - Memiliki masalah kehadiran yang mempengaruhi kenaikan kelas.
  - Aksi:
    - Tandai rekomendasi kenaikan/tinggal kelas (jika sistem mendukung).

### 3.7. Rapor Kelas (Level Wali Kelas)

- **Nama menu:** Rapor Kelas
- **Tujuan:** Mengelola dan melakukan finalisasi rapor untuk seluruh siswa di kelas binaan.
- **Isi/fungsi utama:**
  - Memeriksa kelengkapan nilai setiap mapel (status sudah/ belum diisi guru mapel).
  - Menginput:
    - Nilai sikap dan catatan wali kelas.
    - Deskripsi perkembangan siswa.
  - Finalisasi rapor kelas:
    - Menandai bahwa rapor siap dicetak.
  - Aksi tambahan:
    - Cetak/unduh rapor per siswa atau per kelas (jika sistem mendukung).

---

## 4. Menu Khusus Kelas Training

Menu di bagian ini **hanya muncul jika guru mengampu Kelas Training**. Jika tidak, seluruh grup menu ini **disembunyikan**.

### 4.1. Aturan Visibilitas Menu Kelas Training

- Menu Kelas Training aktif jika:
  - Guru memiliki relasi ke minimal satu kelas bertipe `training`, atau
  - Flag `has_training_class = true`.
- Jika kondisi ini tidak terpenuhi:
  - Seluruh menu Kelas Training tidak ditampilkan di sidebar.

### 4.2. Daftar Kelas Training

- **Nama menu:** Kelas Training
- **Tujuan:** Menampilkan kelas-kelas training yang diampu guru.
- **Isi/fungsi utama:**
  - Daftar kelas training:
    - Nama kelas training
    - Periode/gelombang
    - Jumlah peserta
  - Aksi:
    - Masuk ke detail kelas training (presensi, nilai, materi, tugas).

### 4.3. Presensi Kelas Training

- **Nama menu:** Presensi Training
- **Tujuan:** Mengelola kehadiran peserta pada kelas training.
- **Isi/fungsi utama:**
  - Pilih kelas training dan sesi pertemuan.
  - Tampilkan daftar peserta.
  - Input status kehadiran per peserta.
  - Rekap kehadiran per kelas training dan per peserta.

### 4.4. Penilaian Kelas Training

- **Nama menu:** Nilai Training
- **Tujuan:** Menginput dan memantau nilai peserta untuk kelas training.
- **Isi/fungsi utama:**
  - Pilih kelas training dan komponen penilaian.
  - Input nilai per peserta.
  - Rekap nilai akhir per peserta.

### 4.5. Materi & Tugas Kelas Training

- **Nama menu:** Materi Training
- **Tujuan:** Mengelola materi dan tugas khusus untuk kelas training.
- **Isi/fungsi utama:**
  - Upload dan atur materi training.
  - Membuat tugas/latihan untuk peserta training.
  - Melihat status pengumpulan tugas peserta.

### 4.6. Laporan Hasil Training

- **Nama menu:** Laporan Training
- **Tujuan:** Menyediakan laporan hasil akhir kelas training.
- **Isi/fungsi utama:**
  - Rekap nilai dan kehadiran peserta.
  - Penandaan peserta lulus/tidak lulus (jika konsep kelulusan ada).
  - Ekspor laporan hasil training (opsional).

---

## 5. Menu Khusus Tugas Tambahan

Menu di bagian ini **hanya muncul jika guru memiliki Tugas Tambahan** yang diberikan oleh admin. Contoh tugas tambahan: Wakasek, Sekretaris Wakasek, Kepala Lab, Kepala Kompetensi, dan jenis tugas tambahan lainnya yang akan ditambahkan kemudian.

### 5.1. Aturan Visibilitas Menu Tugas Tambahan

- Data guru memiliki struktur/relasi tugas tambahan, misalnya:
  - Daftar role tambahan: `extra_roles = [wakasek, sekretaris_wakasek, kepala_lab, kepala_kompetensi, ...]`
  - Atau tabel relasi `guru_tugas_tambahan` yang menyimpan tipe tugas, periode aktif, dan unit/ruang lingkupnya.
- Untuk setiap jenis tugas tambahan:
  - Jika guru terdaftar sebagai pemegang tugas tersebut dan statusnya aktif, maka grup menu untuk tugas tersebut dimunculkan di sidebar.
  - Jika tidak aktif atau tidak ada penugasan, grup menu **tidak ditampilkan sama sekali**.
- Perubahan penugasan oleh admin (menambah/menghapus tugas tambahan) harus langsung mempengaruhi visibilitas menu setelah guru login ulang atau setelah refresh hak akses.

### 5.2. Wakil Kepala Sekolah (Wakasek)

Jika guru diberi tugas tambahan sebagai **Wakil Kepala Sekolah**, maka akan muncul grup menu khusus Wakasek, contohnya:

- **Nama grup menu:** Wakasek
- **Contoh sub-menu dan fungsinya:**
  - **Monitoring Kinerja Guru**
    - Melihat ringkasan kehadiran guru (datang, izin, tugas luar).
    - Melihat status pengisian nilai mapel oleh setiap guru.
    - Indikator guru yang terlambat mengisi nilai atau rapor.
  - **Persetujuan Jadwal & Kegiatan**
    - Melihat daftar pengajuan kegiatan (ekstrakurikuler, lomba, kegiatan kelas) yang membutuhkan persetujuan Wakasek.
    - Menyetujui/menolak pengajuan dengan catatan.
  - **Rekap Laporan Akademik**
    - Melihat rekap hasil belajar per kelas, per tingkat, atau per kompetensi.
    - Mengunduh laporan ringkasan untuk keperluan rapat/manajerial.

### 5.3. Sekretaris Wakasek

Jika guru diberi tugas tambahan sebagai **Sekretaris Wakasek**, maka akan muncul grup menu khusus Sekretaris Wakasek, misalnya:

- **Nama grup menu:** Sekretaris Wakasek
- **Contoh sub-menu dan fungsinya:**
  - **Manajemen Dokumen Akademik**
    - Mengelola dokumen-dokumen resmi terkait akademik (format rapor, surat keputusan, jadwal resmi).
    - Mengunggah, mengarsipkan, dan mengatur versi dokumen.
  - **Notulen & Agenda Rapat**
    - Menjadwalkan agenda rapat akademik.
    - Menyimpan notulen rapat dan daftar hadir peserta rapat.
  - **Distribusi Informasi**
    - Mengirim pengumuman penting ke guru atau wali kelas sesuai instruksi Wakasek.

### 5.4. Kepala Laboratorium (Kepala Lab)

Jika guru diberi tugas tambahan sebagai **Kepala Lab**, akan muncul grup menu untuk mengelola laboratorium:

- **Nama grup menu:** Kepala Lab
- **Contoh sub-menu dan fungsinya:**
  - **Inventaris Lab**
    - Melihat dan memperbarui daftar peralatan dan bahan di laboratorium.
    - Menandai kondisi barang (baik, rusak, hilang).
  - **Jadwal Penggunaan Lab**
    - Mengatur jadwal pemakaian lab oleh kelas-kelas.
    - Menyetujui atau menolak permohonan penggunaan lab dari guru lain.
  - **Laporan Insiden dan Perawatan**
    - Mencatat insiden yang terjadi di lab (kerusakan, kecelakaan kecil, dll).
    - Mengajukan permintaan perbaikan atau pengadaan alat baru.

### 5.5. Kepala Kompetensi (Kepala Program Keahlian)

Jika guru diberi tugas tambahan sebagai **Kepala Kompetensi** (Kepala Program Keahlian), akan muncul grup menu khusus kompetensi:

- **Nama grup menu:** Kepala Kompetensi
- **Contoh sub-menu dan fungsinya:**
  - **Manajemen Kelas Kompetensi**
    - Melihat seluruh kelas di bawah kompetensi/program keahlian tertentu.
    - Memantau distribusi guru mapel produktif di kelas tersebut.
  - **Monitoring Praktik Industri / PKL**
    - Melihat penempatan siswa PKL di dunia industri.
    - Memantau status laporan PKL dan penilaian dari industri.
  - **Kerjasama Industri**
    - Mencatat dan memantau mitra industri untuk program keahlian.
    - Menyimpan jadwal kunjungan industri, MoU, dan kegiatan kolaborasi lainnya.

### 5.6. Tugas Tambahan Lainnya

- Sistem harus dibuat fleksibel untuk jenis tugas tambahan baru di masa depan.
- Untuk setiap tipe tugas tambahan baru:
  - Dapat didefinisikan grup menu baru dengan sub-menu khusus.
  - Visibilitas tetap mengikuti pola yang sama:
    - Hanya tampil jika guru memiliki tugas tambahan tersebut dan statusnya aktif.

---

## 6. Ringkasan Teknis untuk Implementasi

- Sidebar untuk role `guru` dibagi menjadi:
  - **Menu Umum Guru** (selalu tampil).
  - **Grup Menu Wali Kelas** (conditional, hanya jika guru adalah wali kelas).
  - **Grup Menu Kelas Training** (conditional, hanya jika guru memiliki kelas training).
  - **Grup Menu Tugas Tambahan** (conditional, hanya jika guru memiliki minimal satu tugas tambahan aktif).
- Mekanisme penentuan visibilitas:
  - Berdasarkan atribut/flag di data guru (misal: `is_wali_kelas`, `has_training_class`) atau relasi guru terhadap kelas.
  - Berdasarkan relasi/tabel tugas tambahan guru (misal: `guru_tugas_tambahan` atau `extra_roles` yang aktif per tahun ajaran).
  - Menu yang tidak relevan **tidak hanya disabled**, tetapi **benar-benar tidak ditampilkan** di sidebar.
- Setiap menu sebaiknya terhubung ke halaman/fungsi yang sudah dijelaskan di atas sehingga alur kerja guru menjadi jelas:
  - Dari melihat jadwal → melakukan presensi → mengisi nilai → menghasilkan rapor atau laporan → menjalankan tugas tambahan manajerial (jika ada).

Dokumen ini dapat digunakan sebagai referensi utama ketika membangun UI, routing, dan logika hak akses untuk role Guru, termasuk mekanisme Tugas Tambahan yang diberikan oleh admin.
