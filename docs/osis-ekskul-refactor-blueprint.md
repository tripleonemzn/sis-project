# Blueprint Refactor OSIS + Pembina Ekskul

## Tujuan

Dokumen ini menjadi acuan refactor untuk 2 keputusan domain:

1. Guru aktif yang membina ekstrakurikuler tidak perlu dibuatkan role terpisah.
2. OSIS tidak diposisikan sebagai ekstrakurikuler, tetapi sebagai organisasi siswa resmi di dalam sekolah.

Tambahan keputusan penting:

3. OSIS tetap memiliki nilai dari pembina, seperti ekskul, tetapi sumber data dan alur bisnisnya dipisahkan dari domain ekstrakurikuler.

## Keputusan Final

### 1. Guru aktif sebagai pembina ekskul

- Identitas utama guru internal tetap `TEACHER`.
- Hak akses pembina ekskul untuk guru internal ditentukan oleh assignment ekskul aktif, bukan oleh role `EXTRACURRICULAR_TUTOR`.
- Menu pembina ekskul muncul sebagai menu tambahan di sidebar guru yang memiliki assignment aktif.
- Satu guru dapat membina lebih dari satu ekskul pada tahun ajaran yang sama.

### 2. Role `EXTRACURRICULAR_TUTOR`

- Role `EXTRACURRICULAR_TUTOR` tidak lagi menjadi jalur utama pembina ekskul internal.
- Role ini hanya dipertahankan sebagai mode kompatibilitas atau untuk pembina eksternal non-guru jika sekolah memang membutuhkannya.
- Semua fitur pembina ekskul baru harus dirancang dengan source of truth utama: assignment guru aktif.

### 3. OSIS dipisah dari ekskul

- OSIS bukan bagian dari `Ekstrakurikuler`.
- OSIS memiliki domain sendiri karena mempunyai:
  - periode kepengurusan,
  - struktur organisasi,
  - jabatan,
  - bidang/divisi,
  - anggota pengurus,
  - pembina OSIS,
  - program kerja OSIS,
  - inventaris OSIS,
  - pemilihan OSIS.

### 4. Nilai OSIS

- OSIS tetap memiliki nilai dari pembina.
- Nilai OSIS masuk ke rapor non-akademik, tetapi tidak dicampur sebagai enrollment ekskul.
- Di UI rapor, OSIS dan ekskul dapat tampil dalam satu keluarga "Non Akademik", tetapi tetap berbeda sumber data.

## Masalah Existing yang Harus Dihilangkan

### Pembina ekskul

- Fitur pembina ekskul masih banyak terikat ke role `EXTRACURRICULAR_TUTOR`.
- Admin assignment pembina masih mengambil user dengan filter role tutor.
- Web/mobile/sidebar/login redirect masih menganggap pembina ekskul sebagai akun terpisah.

### Multi ekskul

- Model data sudah memungkinkan satu user membina banyak ekskul.
- Namun beberapa UI masih cenderung mengunci ke assignment pertama, sehingga pengalaman multi-ekskul belum konsisten.

### OSIS

- Akses OSIS masih sebagian bergantung pada role tutor.
- Status "OSIS" masih dideteksi dari nama yang mengandung kata `OSIS`.
- Pendekatan ini rawan bentrok, rapuh, dan tidak bisa dipakai sebagai source of truth domain.

## Arsitektur Target

## A. Domain Ekstrakurikuler

### Prinsip

- Ekstrakurikuler hanya untuk kegiatan minat, bakat, latihan, pembinaan, nilai, dan absensi ekskul.
- Siswa tetap memilih ekskul seperti biasa.
- OSIS tidak memakan slot ekskul siswa.

### Model yang dipertahankan

- `Ekstrakurikuler`
- `EkstrakurikulerEnrollment`
- `EkstrakurikulerTutorAssignment`
- `EkstrakurikulerGradeTemplate`
- `EkstrakurikulerAttendanceConfig`
- `EkstrakurikulerAttendanceWeek`
- `EkstrakurikulerAttendanceEntry`

### Catatan penting

- Walaupun nama tabel masih memakai kata `Tutor`, secara bisnis tabel ini menjadi assignment pembina ekskul untuk user apa pun yang sah.
- Pada tahap akhir, rename tabel/model boleh dilakukan jika dibutuhkan, tetapi tidak wajib pada batch pertama.

### Source of truth akses pembina ekskul

- Untuk guru internal:
  - role harus `TEACHER`
  - punya assignment aktif pada `EkstrakurikulerTutorAssignment`
- Untuk pembina eksternal:
  - role boleh `EXTRACURRICULAR_TUTOR`
  - tetap harus punya assignment aktif

### Aturan menu guru

Jika user `TEACHER` punya minimal satu assignment aktif pada tahun ajaran aktif, munculkan grup:

- `PEMBINA EKSKUL`
  - Ringkasan pembinaan
  - Anggota & Nilai
  - Absensi
  - Program Kerja Ekskul
  - Inventaris Ekskul

### Aturan duty `PEMBINA_EKSKUL`

- Duty `PEMBINA_EKSKUL` tidak lagi menjadi input manual utama untuk menentukan apakah guru adalah pembina ekskul.
- Duty ini menjadi:
  - duty turunan yang dikelola sistem, atau
  - compatibility flag legacy untuk modul program kerja/anggaran sampai refactor penuh selesai.
- Sidebar pembina ekskul tidak boleh hanya mengandalkan duty ini.
- Sidebar harus mengecek assignment aktif.

## B. Domain OSIS

### Prinsip

- OSIS menjadi domain organisasi siswa, bukan sub-jenis ekstrakurikuler.
- Hak akses utama OSIS ada pada `PEMBINA_OSIS` dan jalur monitoring kesiswaan.

### Model target yang disarankan

- `OsisManagementPeriod`
  - `id`
  - `academicYearId`
  - `title`
  - `startAt`
  - `endAt`
  - `status`

- `OsisAdvisorAssignment`
  - `id`
  - `teacherId`
  - `academicYearId`
  - `isActive`
  - `roleTitle`

- `OsisDivision`
  - `id`
  - `periodId`
  - `name`
  - `code`
  - `displayOrder`

- `OsisPosition`
  - `id`
  - `periodId`
  - `divisionId`
  - `name`
  - `code`
  - `positionLevel`
  - `displayOrder`

- `OsisMembership`
  - `id`
  - `periodId`
  - `studentId`
  - `divisionId`
  - `positionId`
  - `joinedAt`
  - `endedAt`
  - `isActive`

- `OsisGradeTemplate`
  - `id`
  - `academicYearId`
  - `semester`
  - `reportSlot`
  - `predicate`
  - `description`

- `OsisAssessment`
  - `id`
  - `membershipId`
  - `academicYearId`
  - `semester`
  - `reportSlot`
  - `grade`
  - `description`
  - `gradedByTeacherId`
  - `gradedAt`

### Relasi dengan pemilihan OSIS

Model existing pemilihan OSIS tetap dipertahankan:

- `OsisElectionPeriod`
- `OsisElectionCandidate`
- `OsisElectionVote`

Namun ke depan relasinya diposisikan seperti ini:

- `OsisElectionPeriod` mengelola proses pemilihan.
- `OsisManagementPeriod` mengelola kepengurusan resmi.
- Hasil pemilihan dapat dipakai sebagai input pembentukan `OsisMembership`, tetapi tidak wajib dipaksa 1 tabel.

### Kenapa tidak memakai `EkstrakurikulerEnrollment`

Karena OSIS memiliki sifat:

- satu siswa bisa menjadi pengurus OSIS dan tetap ikut ekskul,
- ada jabatan dan divisi,
- ada periode kepengurusan,
- tidak cocok dimodelkan sebagai pilihan ekskul biasa.

## C. Nilai Non Akademik

### Prinsip umum

Nilai non-akademik di rapor terdiri dari minimal 2 sumber:

- Nilai ekstrakurikuler
- Nilai organisasi siswa OSIS

### Bentuk tampilan rapor yang disarankan

Opsi terbaik:

- keluarga besar: `Aktivitas Non Akademik`
- sub-seksi:
  - `Ekstrakurikuler`
  - `OSIS`

Dengan begitu:

- secara UI tetap terasa satu rumpun,
- tetapi secara domain tetap terpisah.

### Rubrik nilai OSIS

Rubrik nilai OSIS mengikuti pola ekskul agar konsisten:

- `SB`
- `B`
- `C`
- `K`

Deskripsi nilai OSIS boleh menonjolkan:

- kedisiplinan,
- tanggung jawab organisasi,
- kepemimpinan,
- kerja sama tim,
- kontribusi pada program kerja,
- keaktifan dalam bidang/divisi.

### Slot rapor

Nilai OSIS memakai slot rapor non-akademik yang sama family dengan ekskul:

- `SBTS`
- `SAS`
- `SAT`

Tetapi tabel penyimpanannya tetap berbeda.

### Read model rapor

Pada layer service/report, buat read model gabungan:

- `NonAcademicActivityReportRow`
  - `sourceType`: `EXTRACURRICULAR` | `OSIS`
  - `sourceName`
  - `grade`
  - `description`
  - `positionName?`
  - `divisionName?`

Dengan pendekatan ini:

- report wali kelas bisa membaca 2 domain berbeda,
- controller rapor tidak perlu lagi mengasumsikan semua nilai non-akademik berasal dari `EkstrakurikulerEnrollment`.

## Permission Matrix

### ADMIN

- Mengelola master ekskul.
- Mengelola assignment pembina ekskul.
- Mengelola periode/manajemen OSIS bila diperlukan.
- Mengelola data guru.

### TEACHER

- Menu dasar guru selalu tersedia.
- Jika punya assignment ekskul aktif:
  - mendapat menu `PEMBINA EKSKUL`
- Jika punya duty `PEMBINA_OSIS`:
  - mendapat menu `OSIS`

### TEACHER + assignment ekskul aktif

- Melihat ekskul yang dibina
- Mengelola anggota ekskul
- Input nilai ekskul
- Input absensi ekskul
- Kelola inventaris ekskul yang terkait
- Kelola program kerja ekskul
- Ajukan alat ekskul

### TEACHER + duty `PEMBINA_OSIS`

- Melihat dashboard OSIS
- Mengelola struktur kepengurusan
- Mengelola divisi dan jabatan
- Mengelola anggota/pengurus OSIS
- Input nilai OSIS
- Kelola program kerja OSIS
- Kelola inventaris OSIS
- Kelola pemilihan OSIS

### WAKASEK KESISWAAN / SEKRETARIS KESISWAAN

- Monitoring ekskul
- Monitoring OSIS
- Approval alat ekskul
- Approval program kerja ekskul
- Monitoring program kerja OSIS
- Monitoring nilai non-akademik yang terkait kesiswaan

### PRINCIPAL

- Read/monitoring dan approval sesuai alur existing sekolah

### EXTRACURRICULAR_TUTOR

- Dipertahankan hanya bila sekolah memakai pembina eksternal non-guru
- Wajib tetap berbasis assignment aktif
- Tidak boleh lagi menjadi jalur utama pembina OSIS

## Desain Menu Target

### Sidebar Guru

- Dashboard
- Email
- Jadwal Mengajar
- Kelas & Mapel
- Presensi Siswa
- Materi & Tugas
- Input Nilai
- Rapor Mapel

Tambahan kondisional:

- `WALI KELAS`
- `PEMBINA EKSKUL`
  - Dashboard Pembina
  - Anggota & Nilai
  - Absensi
  - Program Kerja Ekskul
  - Inventaris Ekskul
- `OSIS`
  - Dashboard OSIS
  - Struktur Pengurus
  - Divisi & Jabatan
  - Nilai OSIS
  - Program Kerja OSIS
  - Inventaris OSIS
  - Pemilihan OSIS

### Sidebar Wakasek Kesiswaan

- Kelola Kesiswaan
- Monitoring Ekskul
- Monitoring OSIS
- Persetujuan Alat Ekskul
- Laporan Kesiswaan

## Strategi API

## Batch 1: kompatibilitas cepat

### Pembina ekskul

- Endpoint `/tutor/*` tetap hidup untuk kompatibilitas.
- Tambah capability agar `TEACHER` dengan assignment aktif dapat mengakses jalur tersebut.
- Secara bertahap siapkan alias baru, misalnya:
  - `/teacher/extracurricular-advisor/assignments`
  - `/teacher/extracurricular-advisor/members`
  - `/teacher/extracurricular-advisor/grades`
  - `/teacher/extracurricular-advisor/attendance`
  - `/teacher/extracurricular-advisor/inventory`

### OSIS

- Endpoint `/osis/*` tetap dipakai untuk domain pemilihan.
- Tambah endpoint domain organisasi:
  - `/osis/management-periods`
  - `/osis/divisions`
  - `/osis/positions`
  - `/osis/memberships`
  - `/osis/assessments`

## Strategi Migrasi

## Fase 1: stabilisasi pembina ekskul pada guru aktif

- Ubah admin assignment pembina agar sumber user utama adalah `TEACHER`.
- Jika sekolah masih butuh pembina eksternal, izinkan juga `EXTRACURRICULAR_TUTOR`.
- Tambahkan capability check berbasis assignment aktif.
- Sidebar guru menampilkan menu pembina ekskul jika assignment aktif ada.
- Web/mobile route pembina ekskul mulai menerima `TEACHER`.
- Perbaiki halaman pembina agar benar-benar mendukung multi-assignment, bukan assignment pertama saja.

## Fase 2: pisahkan OSIS dari ekskul

- Buat tabel/domain OSIS terpisah.
- Migrasikan data OSIS yang sebelumnya disamarkan sebagai ekskul.
- Hapus seluruh logika yang membaca OSIS dari nama ekskul.
- Jadikan `PEMBINA_OSIS` satu-satunya jalur pembina OSIS internal.

## Fase 3: integrasi rapor non-akademik

- Buat read model gabungan non-akademik di service report.
- Tampilkan `Ekstrakurikuler` dan `OSIS` sebagai 2 seksi di rapor/homeroom.
- Pastikan nilai OSIS mengikuti semester dan slot rapor yang sama family dengan ekskul.

## Fase 4: clean-up legacy

- Deprecate route/guard lama yang mengunci pembina internal ke role tutor.
- Rapikan redirect login dan mobile menu.
- Evaluasi apakah role `EXTRACURRICULAR_TUTOR` tetap dipertahankan untuk kasus pembina eksternal.

## Acceptance Criteria

### Pembina ekskul

- Guru aktif dapat membina satu atau lebih ekskul tanpa perubahan role akun.
- Menu pembina ekskul muncul otomatis di akun guru yang punya assignment aktif.
- Guru dapat berpindah ekskul binaan dari selector atau konteks assignment.
- Modul pembina tidak terkunci ke role tutor.

### OSIS

- OSIS tidak muncul sebagai pilihan ekskul siswa.
- OSIS memiliki data kepengurusan, jabatan, divisi, dan pembina sendiri.
- `PEMBINA_OSIS` tidak bercampur dengan `PEMBINA_EKSKUL`.
- Tidak ada permission penting yang lagi-lagi ditentukan oleh nama ekskul berisi kata `OSIS`.

### Nilai rapor

- Nilai ekskul tetap berjalan.
- Nilai OSIS dapat diinput pembina.
- Wali kelas dapat melihat keduanya pada laporan non-akademik.
- Siswa bisa menjadi pengurus OSIS sekaligus tetap memiliki ekskul biasa.

## Rekomendasi Implementasi Teknis

Urutan implementasi paling aman:

1. Selesaikan dulu refactor pembina ekskul pada guru aktif tanpa mengubah domain OSIS.
2. Setelah pembina ekskul stabil, baru pisahkan OSIS ke domain sendiri.
3. Setelah domain OSIS matang, integrasikan ke read model rapor.
4. Baru setelah itu lakukan clean-up role tutor internal dan compatibility layer.

## Catatan Praktis untuk Eksekusi

- Jangan langsung menghapus role `EXTRACURRICULAR_TUTOR` pada batch pertama.
- Jangan langsung rename tabel `EkstrakurikulerTutorAssignment` pada batch pertama.
- Fokus awal adalah memindahkan source of truth akses dari `role` ke `assignment`.
- Untuk OSIS, jangan gunakan flag berbasis nama. Gunakan tabel/domain eksplisit.

## Ringkasan Satu Kalimat

Target akhir sistem adalah:

- pembina ekskul internal = guru aktif berbasis assignment,
- OSIS = organisasi siswa terpisah dari ekskul,
- nilai OSIS tetap masuk rapor non-akademik tanpa mencampur domain OSIS ke tabel ekskul.
