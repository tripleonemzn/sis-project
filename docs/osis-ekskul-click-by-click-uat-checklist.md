# OSIS & Pembina Ekskul Click-By-Click UAT Checklist

Checklist ini dipakai untuk uji UI setelah refactor:

- guru aktif sebagai pembina ekskul
- multi assignment pembina ekskul
- pemisahan domain OSIS dari ekskul
- nilai OSIS
- parity web dan mobile

Dokumen ini fokus pada langkah klik, bukan detail teknis backend.

## Aturan Main

- Gunakan `staging`, bukan `production`.
- Pastikan tahun ajaran aktif sudah benar.
- Uji web dan mobile memakai data yang sama.
- Jika ada mismatch, catat:
  - role
  - username
  - halaman
  - langkah terakhir

## Data Uji Minimum

Siapkan minimal:

- `1 ADMIN`
- `1 guru aktif` dengan assignment ke `2 ekskul non-OSIS`
- `1 guru aktif` dengan duty `PEMBINA_OSIS`
- `1 tutor eksternal` untuk ekskul biasa
- `1 tutor eksternal` dengan assignment `OSIS`
- `1 ekskul non-OSIS A`
- `1 ekskul non-OSIS B`
- `1 item kategori OSIS`
- minimal `2 siswa` anggota ekskul
- minimal `2 siswa` pengurus OSIS
- `1 wali kelas`

## 1. Admin Web: Guru Aktif Sebagai Pembina Ekskul

- Login sebagai `ADMIN`.
- Buka `User Management > Kelola Guru`.
- Tambah atau edit guru.
- Masuk tab `Data Kepegawaian`.
- Pastikan `Tugas Tambahan` memuat:
  - `Pembina Ekstrakurikuler`
  - `Pembina OSIS`
- Buka `Master Data > Ekstrakurikuler`.
- Assign guru aktif ke ekskul A.
- Assign guru aktif yang sama ke ekskul B.
- Pastikan sumber pembina memuat:
  - `Guru Aktif`
  - `Tutor Eksternal`

## 2. Guru Web: Pembina Ekskul Multi Assignment

- Login sebagai guru pembina ekskul.
- Pastikan sidebar memunculkan grup `PEMBINA EKSKUL`.
- Buka dashboard pembina.
- Pastikan 2 ekskul tampil.
- Buka `Anggota & Nilai`.
- Pindah antar ekskul.
- Pastikan anggota dan nilai berubah sesuai ekskul yang dipilih.
- Buka `Program Kerja`.
- Pastikan duty aktif `PEMBINA_EKSKUL`.
- Buka `Inventaris Ekskul`.
- Pastikan data inventaris sesuai assignment.

## 3. Guru Mobile: Pembina Ekskul Multi Assignment

- Login mobile dengan akun guru yang sama.
- Pastikan menu `Pembina Ekskul` muncul.
- Bandingkan dengan web:
  - anggota dan nilai
  - program kerja
  - inventaris
- Pastikan jalur kerja web dan mobile 1:1.

## 4. Admin Web: OSIS Sebagai Domain Terpisah

- Login sebagai `ADMIN`.
- Buka `Master Data > Ekstrakurikuler`.
- Pastikan OSIS berkategori `OSIS`.
- Pastikan ekskul biasa berkategori `EXTRACURRICULAR`.
- Assign guru pembina OSIS ke item `OSIS`.
- Jika ada tutor eksternal OSIS, assign juga ke item `OSIS`.

## 5. Guru Web: Struktur dan Nilai OSIS

- Login sebagai guru dengan duty `PEMBINA_OSIS`.
- Pastikan sidebar memunculkan grup `PEMBINA OSIS`.
- Buka `Struktur & Nilai`.
- Buat atau edit:
  - periode
  - divisi
  - jabatan
  - keanggotaan
- Input nilai OSIS untuk minimal 1 pengurus.
- Refresh halaman.
- Pastikan struktur dan nilai tetap terbaca.
- Buka `Inventaris OSIS`.
- Pastikan data inventaris OSIS bisa diakses dari jalur guru.

## 6. Guru Mobile: Struktur dan Nilai OSIS

- Login mobile dengan akun pembina OSIS yang sama.
- Pastikan menu OSIS muncul.
- Buka `Struktur & Nilai OSIS`.
- Pastikan entry point sama dengan web.
- Jika halaman memakai web fallback, judul dan tujuan modul tetap benar.
- Buka `Inventaris OSIS`.
- Pastikan menu dan tujuan modul sama dengan web.

## 7. Pemilihan OSIS

### Guru Pembina OSIS

- Login sebagai pembina OSIS.
- Buka `Pemilihan OSIS`.
- Jika periode aktif ada, pastikan `Pemungutan Suara` muncul.

### Tutor Eksternal OSIS

- Login sebagai tutor eksternal dengan assignment `OSIS`.
- Pastikan menu `PEMBINA OSIS` muncul.
- Jika ada periode aktif, pastikan `Pemungutan Suara` muncul.

### Tutor Eksternal Non-OSIS

- Login sebagai tutor eksternal yang hanya membina ekskul biasa.
- Pastikan:
  - menu `PEMBINA OSIS` tidak muncul
  - menu `Pemungutan Suara OSIS` tidak muncul
  - akses vote OSIS tidak bisa dipakai sebagai voter

## 8. Rapor Non-Akademik

- Login sebagai wali kelas di web.
- Buka rapor siswa yang ikut ekskul dan menjadi pengurus OSIS.
- Pastikan section ekskul dan OSIS tampil terpisah.
- Login mobile dengan akun wali kelas yang sama.
- Pastikan hasilnya sama dengan web.

## 9. GO / NO-GO

Tandai `GO` hanya jika semua ini benar:

- guru aktif bisa membina lebih dari 1 ekskul tanpa role tutor internal
- tutor eksternal tetap bisa dipakai untuk kasus non-guru
- OSIS tampil sebagai domain terpisah dari ekskul
- nilai OSIS tersimpan dan terbaca di rapor non-akademik
- tutor non-OSIS tidak bisa vote OSIS
- web dan mobile menampilkan menu dan akses yang konsisten

Tandai `NO-GO` jika salah satu ini masih terjadi:

- guru aktif harus diubah role untuk bisa membina ekskul
- OSIS masih muncul sebagai ekskul biasa
- nilai OSIS tidak muncul di rapor
- tutor non-OSIS masih bisa vote OSIS
- web dan mobile menunjukkan menu yang berbeda untuk role yang sama
