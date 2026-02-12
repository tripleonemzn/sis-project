# Modul AKADEMIK – Deskripsi & Integrasi Sub-menu

Modul **AKADEMIK** mengelola seluruh proses akademik harian: kalender, jadwal, batas KKM, absensi, hingga laporan/rapor.  
Di sidebar admin, submenu AKADEMIK berisi:

- Kalender Akademik
- Jadwal Pelajaran
- Data KKM
- Rekap Absensi
- Laporan / Rapor

Di bawah ini penjelasan tujuan masing‑masing dan integrasinya dengan modul lain.

---

## 1. Kalender Akademik

**Tujuan:**

- Menyimpan dan menampilkan agenda besar sekolah selama 1 tahun ajaran:
  - Awal & akhir tahun ajaran.
  - Libur nasional / libur sekolah.
  - Ulangan harian, PTS, PAS/PAT, ujian sekolah, kegiatan penting lain.
- Menjadi referensi global untuk semua fitur lain yang butuh informasi tanggal akademik.

**Integrasi:**

- **Master Data – Tahun Ajaran**
  - Setiap event kalender terkait dengan tahun ajaran aktif dari menu `MASTER DATA → Tahun Ajaran`.
  - Perubahan tahun ajaran akan mengubah rentang tanggal yang ditampilkan di kalender.

- **Jadwal Pelajaran**
  - Jadwal tidak dibuat di tanggal yang ditandai sebagai libur besar (opsional: sistem bisa memberi peringatan).

- **UJIAN & CBT**
  - Sesi ujian (Bank Soal / CBT) sebaiknya disesuaikan dengan event kalender (misal PTS, PAS).

- **Laporan / Rapor**
-  - Tanggal pembagian rapor / akhir penilaian bisa ditandai di kalender agar semua pihak melihat timeline yang sama.

---

## 2. Jadwal Pelajaran

**Tujuan:**

- Mengatur dan menyimpan jadwal mengajar harian:
  - Jam ke‑berapa.
  - Hari.
  - Kelas.
  - Mata pelajaran.
  - Guru pengampu.
- Menjadi sumber kebenaran untuk:
  - Jadwal guru (di dashboard guru).
  - Jadwal siswa (di dashboard siswa).
  - Sumber data absensi (per pertemuan).

**Integrasi:**

- **Master Data – Kelas & Mata Pelajaran**
  - Setiap entri jadwal wajib referensi ke:
    - Data kelas dari `MASTER DATA → Kelas`.
    - Data mapel dari `MASTER DATA → Mata Pelajaran`.
  - Jika ada perubahan nama kelas/mapel, jadwal akan tetap terhubung lewat ID.

- **User Management – Guru & Siswa**
  - Guru yang digunakan di jadwal berasal dari `Kelola Guru`.
  - Siswa melihat jadwal berdasarkan kelas yang terhubung di `Kelola Siswa`.

- **Assignment Guru**
  - Idealnya jadwal mengacu ke penugasan guru (guru mana mengampu mapel tertentu di kelas tertentu).
  - Dengan begitu tidak ada jadwal yang melanggar penugasan resmi.

- **Rekap Absensi**
  - Absensi diambil berdasarkan jadwal hari itu (kelas, mapel, jam).
  - Setiap pertemuan jadwal bisa punya record absensi tersendiri.

- **Laporan / Rapor**
-  - Penilaian per mapel di rapor mengikuti struktur jadwal (kelas, mapel, guru).

---

## 3. Data KKM

**Tujuan:**

- Menyimpan **Kriteria Ketuntasan Minimal (KKM)** untuk setiap kombinasi:
  - Tahun ajaran.
  - Kelas atau kelompok kelas.
  - Mata pelajaran.
- Menjadi acuan lintas modul untuk menentukan apakah nilai siswa sudah tuntas atau belum.

**Integrasi:**

- **Master Data – Mata Pelajaran, Kelas, Tahun Ajaran**
  - KKM selalu melekat pada:
    - Mapel dari `MASTER DATA → Mata Pelajaran`.
    - Kelas / jenjang dari `MASTER DATA → Kelas`.
    - Tahun ajaran aktif.

- **Input Nilai (Guru)**
  - Saat guru menginput nilai, sistem bisa:
    - Menandai otomatis apakah nilai ≥ KKM (tuntas) atau < KKM (belum tuntas).
    - Menunjukkan KKM di layar guru sebagai referensi.

- **Laporan / Rapor**
-  - Rapor menampilkan nilai akhir bersama status tuntas/belum tuntas berdasarkan KKM.
  - Jika KKM berubah di tengah tahun, kebijakan sistem perlu diatur (gunakan snapshot saat penilaian atau mengikuti KKM terbaru).

---

## 4. Rekap Absensi

**Tujuan:**

- Mengelola dan merekap **kehadiran siswa**:
  - Hadir.
  - Sakit.
  - Izin.
  - Alpha.
- Menyediakan ringkasan absensi per:
  - Siswa.
  - Kelas.
  - Tanggal / rentang tanggal.
  - Mapel (jika absensi per jam pelajaran).

**Integrasi:**

- **Jadwal Pelajaran**
  - Absensi harian biasanya diikat ke jadwal:
    - Kelas + mapel + jam + guru.
  - Guru mengisi absensi dari jadwal mengajar mereka.

- **User Management – Siswa & Orang Tua**
  - Data absensi terkait langsung ke akun siswa dari `Kelola Siswa`.
  - Orang tua (akun `PARENT`) bisa melihat rekap absensi anak di dashboard orang tua.

- **Kalender Akademik**
  - Hari yang ditandai libur di kalender sebaiknya otomatis tidak menuntut absensi.

- **Laporan / Rapor**
-  - Rekap absensi (jumlah sakit/izin/alpha) ditarik ke rapor semester.
  - Nilai sikap atau catatan wali kelas bisa memanfaatkan statistik absensi ini.

---

## 5. Laporan / Rapor

**Tujuan:**

- Menghasilkan **rapor siswa** per semester/tahun ajaran:
  - Nilai pengetahuan, keterampilan (jika dipakai), dan sikap per mapel.
  - Keterangan tuntas / belum tuntas berdasarkan KKM.
  - Rekap absensi.
  - Catatan wali kelas / kepsek.
- Menjadi output utama yang biasa dicetak atau dibagikan ke orang tua.

**Integrasi:**

- **User Management – Siswa, Guru, Orang Tua**
  - Siswa: rapor ditampilkan sesuai akun siswa dan kelasnya.
  - Guru: input nilai per mapel yang akan dikonsumsi modul rapor.
  - Orang Tua: dapat melihat rapor anak melalui akun parent.

- **Master Data – Kelas, Mata Pelajaran, Tahun Ajaran**
  - Struktur rapor mengikuti:
    - Daftar mapel.
    - Kelas/kompetensi keahlian.
    - Tahun ajaran & semester yang aktif.

- **Data KKM**
  - Menentukan status tuntas/belum tuntas di setiap baris rapor.
  - Bisa dipakai untuk memberi highlight mapel yang perlu remedial.

- **Rekap Absensi**
  - Menyisipkan total hadir, sakit, izin, alpha selama periode rapor.

- **Kalender Akademik**
  - Menentukan periode penilaian (tanggal awal/akhir) dan tanggal pembagian rapor.

---

## 6. Alur Integrasi Tingkat Tinggi

Secara garis besar, hubungan antar submenu AKADEMIK dan modul lain:

1. **MASTER DATA** mendefinisikan struktur dasar:
   - Tahun ajaran, kelas, kompetensi keahlian, mata pelajaran.
2. **USER MANAGEMENT** menyediakan entitas pengguna:
   - Siswa, guru, orang tua, wali kelas.
3. **AKADEMIK** memanfaatkan keduanya:
   - Kalender Akademik → timeline global.
   - Jadwal Pelajaran → hubungan guru–kelas–mapel–jam.
   - Data KKM → standar minimal per mapel/kelas.
   - Rekap Absensi → kehadiran per siswa (berdasarkan jadwal).
   - Laporan / Rapor → menggabungkan nilai + KKM + absensi + data master.
4. **UJIAN & CBT** bisa mengambil jadwal & kalender dari AKADEMIK untuk:
   - Menentukan kapan sesi ujian berlangsung.
   - Menghubungkan nilai hasil ujian dengan nilai rapor.

Dengan struktur ini, setiap perubahan di master data atau user akan tercermin konsisten di seluruh modul AKADEMIK dan laporan akhir siswa.

