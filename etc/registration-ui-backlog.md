# Backlog UI Pendaftaran Publik

Dokumen ini memecah kebutuhan UI web dan mobile untuk 3 jalur pendaftaran.

## Sasaran Tahap Eksekusi

- Semua entry pendaftaran dimulai dari login page.
- Web dan mobile punya alur yang setara.
- Tidak ada role publik yang jatuh kembali ke `/login` hanya karena route belum tersedia.

## Tahap 1 - Register Hub

### Web

- Tambah route `/register`
- Halaman memilih 3 kartu:
  - `Daftar Calon Siswa`
  - `Daftar Orang Tua`
  - `Daftar BKK`
- CTA kembali ke login

### Mobile

- Ubah halaman register existing menjadi hub 3 pilihan
- Link dari welcome dan login diarahkan ke register hub, bukan langsung form umum

### Komponen yang dibutuhkan

- `RegisterTypeCard`
- `PublicRegisterLayout`
- `RegisterGuard`

## Tahap 2 - Form Register Per Tipe

### A. Calon Siswa

#### Web

- `/register/candidate`
- field:
  - nama lengkap
  - NISN
  - no HP
  - email
  - password
  - konfirmasi password

#### Mobile

- `/register/candidate`
- field sama dengan web

#### Setelah submit

- arahkan ke login
- tampilkan info:
  - akun berhasil dibuat
  - silakan login untuk melengkapi data PPDB

### B. Orang Tua

#### Web

- `/register/parent`
- field:
  - nama lengkap
  - username
  - no HP
  - email
  - password
  - konfirmasi password

#### Mobile

- `/register/parent`
- field sama

### C. BKK

#### Web

- `/register/bkk`
- field:
  - nama lengkap
  - username
  - no HP
  - email
  - password
  - konfirmasi password

#### Mobile

- `/register/bkk`
- field sama

## Tahap 3 - Dashboard Publik Setelah Login

### A. Calon Siswa

#### Web

- `/candidate/dashboard`
- `/candidate/application`
- `/candidate/documents`
- `/candidate/test`
- `/candidate/result`

#### Mobile

- parity dengan web

#### Widget utama

- status aplikasi
- progress kelengkapan data
- status dokumen
- jadwal tes
- tombol mulai tes

### B. Orang Tua

#### Web

- `/parent/link-student`
- `/parent/children`
- `/parent/attendance`
- `/parent/finance`
- `/parent/report-card`

#### Mobile

- route parent existing dipertahankan,
- tambahkan halaman khusus linking anak

#### Widget utama

- daftar anak terhubung
- status request link
- tombol tambah anak
- filter per anak

### C. BKK

#### Web

- `/bkk/dashboard`
- `/bkk/profile`
- `/bkk/vacancies`
- `/bkk/vacancies/:id`
- `/bkk/applications`

#### Mobile

- `/public/information` dan `/public/registration` existing diganti menjadi:
  - dashboard pelamar
  - profil pelamar
  - daftar lowongan
  - status lamaran

#### Widget utama

- progres kelengkapan profil
- lowongan terbaru
- lamaran saya
- status proses

## Tahap 4 - UI Admin/Internal

### Admin Umum

- tab verifikasi akun publik
- tab aplikasi PPDB
- tab request parent-anak
- tab pelamar BKK

### PPDB/Admin Kesiswaan

- list calon siswa
- review berkas
- hasil tes
- final acceptance

### Petugas BKK/Humas

- list lowongan
- list lamaran
- detail pelamar
- update status lamaran

## Gap Existing Yang Harus Ditutup Di UI

- web login sudah punya CTA daftar, tetapi route publik belum ada
- web belum mengenali role `CALON_SISWA` dan `UMUM`
- mobile register sekarang baru mengarah ke `registerUmum`
- layar candidate/public yang ada masih bersifat placeholder

## Prioritas Backlog Yang Disarankan

### Sprint 1

- register hub web/mobile
- form register 3 tipe
- auth redirect untuk role publik

### Sprint 2

- dashboard parent + linking anak
- adaptasi web role typing untuk `CALON_SISWA` dan `UMUM`

### Sprint 3

- dashboard calon siswa
- form aplikasi PPDB
- upload dokumen

### Sprint 4

- tes PPDB
- hasil tes
- panel admin PPDB

### Sprint 5

- profil pelamar BKK
- daftar lowongan BKK
- submit lamaran
- panel review BKK

## Definition of Done UI

- web dan mobile parity untuk alur inti
- tidak ada route publik yang dead-end
- role publik tidak redirect salah
- semua form punya label, id, name, dan autocomplete
- zero error dan zero warning di console

## Output Tahap Ini

Dokumen ini siap dipakai sebagai backlog task implementasi frontend web dan mobile per sprint.
