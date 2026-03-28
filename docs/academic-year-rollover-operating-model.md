# Model Operasional Tahun Ajaran dan Promotion

Dokumen ini merinci cara agar konsep promotion siswa, alumni, dan rollover tahun ajaran bisa berjalan aman di production, tetap fleksibel untuk kebutuhan sekolah, dan tetap konsisten antara web dan mobile.

## 1. Kesimpulan Inti

Konsep yang disepakati:

1. Siswa `X` otomatis naik ke kelas `XI` yang sepadan.
2. Siswa `XI` otomatis naik ke kelas `XII` yang sepadan.
3. Siswa `XII` yang lulus berubah menjadi alumni.
4. Penambahan tahun ajaran harus membantu semua sektor, bukan hanya promotion siswa.
5. Sistem harus mendukung clone konfigurasi tahun ajaran sebelumnya secara fleksibel, tetapi tidak semua data boleh otomatis dibawa.

Konsep ini aman untuk production jika sistem memisahkan tiga jenis data:

- data master global
- data operasional per tahun ajaran
- data status akademik aktif siswa

## 2. Aturan Bisnis Yang Disepakati

### 2.1 Promotion siswa aktif

Untuk siswa aktif:

- `X TKJ 1 -> XI TKJ 1`
- `XI TKJ 1 -> XII TKJ 1`
- pola yang sama berlaku untuk seluruh jurusan/rombel lain

Yang berubah otomatis saat promotion:

- `User.classId`
- `User.studentStatus`
- membership akademik siswa di tahun ajaran lama/baru

Yang tidak ikut dipindahkan:

- nilai tahun sebelumnya
- absensi tahun sebelumnya
- izin tahun sebelumnya
- rapor tahun sebelumnya
- dokumen historis tahun sebelumnya

Semua histori itu tetap melekat ke `academicYearId` asal.

### 2.2 Alumni

Untuk siswa `XII` yang lulus:

- `studentStatus -> GRADUATED`
- `classId -> null`
- membership tahun berjalan ditutup dengan status `GRADUATED`
- siswa tetap bisa login jika sekolah mengizinkan
- akses alumni bersifat read-only ke area yang relevan

Alumni tidak dibuatkan membership aktif baru pada tahun ajaran berikutnya.

### 2.3 Tahun ajaran baru

Saat admin membuat tahun ajaran baru, sistem tidak langsung memindahkan siswa. Tahun ajaran baru harus menjadi wadah operasional baru yang disiapkan dulu.

Alur target:

1. admin membuat tahun ajaran baru
2. admin memilih komponen apa yang ingin dicopy dari tahun sebelumnya
3. sistem menyiapkan kelas target XI/XII
4. kurikulum mereview assignment/config tahunan
5. admin menjalankan preview promotion
6. admin menjalankan cutover promotion
7. tahun ajaran baru diaktifkan

## 3. Klasifikasi Data

### 3.1 Data yang tetap master global

Data ini tidak perlu otomatis diduplikasi tiap tahun ajaran:

- jurusan
- mapel
- kategori mapel
- user guru
- user siswa
- user orang tua
- role dan permission dasar

Catatan:

- Mapel dan kategori mapel sebaiknya tetap global agar tidak ada duplikasi master yang sulit dipelihara.
- Kalau suatu saat ada perubahan kurikulum besar, tambahkan versi/config tahunan, bukan menggandakan master tanpa kontrol.

### 3.2 Data yang bersifat tahunan dan boleh di-clone

Data ini idealnya punya fitur `clone from previous year`:

- kelas
- teacher assignment
- KKM
- kalender akademik
- report dates
- exam/program config
- schedule time config
- teaching device / teaching resource config yang memang per tahun
- rule akademik lain yang memang terkait tahun ajaran

Catatan:

- hasil clone harus masuk sebagai `draft`, bukan langsung dianggap final
- operator tetap harus bisa menghapus, mengubah, atau menambah item setelah clone
- `report dates` tetap diposisikan sebagai data tahunan, tetapi implementasi wizard boleh ditunda sampai admin flow-nya matang

### 3.3 Data yang otomatis mengikuti promotion

Data ini tidak perlu diinput ulang manual:

- kelas aktif siswa
- status aktif siswa
- membership siswa pada tahun ajaran baru

Tetapi ada prasyarat:

- kelas target harus sudah ada
- mapping kelas harus valid
- kelas target harus kosong
- source-target year harus jelas

### 3.4 Data yang tidak boleh otomatis ikut

Data ini harus tetap historis:

- absensi lama
- nilai lama
- rapor lama
- ranking lama
- catatan perilaku lama
- dokumen approval/print lama

## 4. Model Target Yang Direkomendasikan

### 4.1 Satu sumber kebenaran historis

Gunakan `student_academic_memberships` sebagai histori akademik per tahun ajaran.

Aturan:

- satu siswa maksimal satu membership per tahun ajaran
- hanya satu membership yang `isCurrent=true`
- membership source year ditutup saat promotion
- membership target year dibuat saat promotion untuk siswa `X` dan `XI`
- siswa `XII` yang lulus tidak dibuatkan membership target baru

### 4.2 Snapshot kompatibilitas

Selama masa transisi, `User.classId` dan `User.studentStatus` tetap dipertahankan.

Fungsi field snapshot ini:

- menjaga modul lama tetap hidup
- menjaga mobile/web lama tidak langsung pecah
- menjadi snapshot aktif siswa saat ini

Tetapi secara desain jangka panjang, histori harus dibaca dari membership, bukan snapshot ini.

### 4.3 Mapping kelas eksplisit

Promotion tidak boleh bertumpu hanya pada `major + level`.

Aturan mapping:

- source class selalu punya satu keputusan eksplisit
- keputusan bisa `PROMOTE` atau `GRADUATE`
- `PROMOTE` harus menunjuk target class
- `GRADUATE` tidak punya target class
- jika banyak source class diarahkan ke satu target class, sistem memberi warning

### 4.4 Status tahun ajaran

Secara operasional, tahun ajaran sebaiknya diperlakukan seperti state machine:

- `DRAFT`
- `PREPARED`
- `PROMOTION_READY`
- `ACTIVE`
- `ARCHIVED`

Walau state ini belum semua ada di schema sekarang, pola operasionalnya perlu mengikuti logika tersebut.

## 5. Wizard Rollover Tahun Ajaran

Target jangka menengah yang paling ideal adalah membuat `Academic Year Rollover Wizard`.

### Langkah 1. Create academic year

Admin membuat tahun ajaran baru:

- nama tahun ajaran
- tanggal semester 1 dan 2
- status default non-aktif

### Langkah 2. Clone yearly setup

Admin memilih apa saja yang dicopy dari tahun sebelumnya.

Pilihan clone yang direkomendasikan:

- kelas target
- teacher assignment
- KKM
- kalender akademik
- exam/program config
- report dates
- schedule time config

Pilihan yang tidak perlu ada di clone:

- siswa di dalam kelas
- histori nilai/absensi
- data transaksi yang sudah berjalan

Catatan implementasi MVP saat ini:

- sudah tersedia untuk `kelas target XI/XII`, `teacher assignment`, `KKM`, `exam grade components`, `exam program configs`, `exam program sessions`, `schedule time config`, dan `academic events`
- `report dates` masih sengaja ditunda sampai admin flow-nya matang dan ada data operasional yang siap di-clone
- kelas `X` intake baru tetap disiapkan lewat alur PPDB/rombel baru

### Langkah 3. Review yearly setup

Sistem harus menampilkan ringkasan:

- kelas yang berhasil dibuat
- assignment yang berhasil dicopy
- config yang masih kosong
- item yang gagal dicopy

### Langkah 4. Prepare promotion

Admin memilih:

- source year
- target year

Sistem menampilkan:

- total siswa aktif
- jumlah naik kelas
- jumlah alumni
- mapping kelas
- blocking issue
- warning

### Langkah 5. Commit promotion

Commit hanya boleh berjalan jika:

- feature flag aktif
- source-target year valid
- mapping lengkap
- kelas target kosong
- backup/snapshot tersedia
- operator sudah konfirmasi

### Langkah 6. Activate new year

Aktivasi tahun ajaran baru boleh:

- otomatis setelah promotion
- atau manual, tergantung kebijakan sekolah

Saya merekomendasikan tetap ada opsi checkbox `activate target year after commit`.

## 6. Aturan Production Safety

### 6.1 Additive first

Semua perubahan schema dan alur harus additive dulu.

Artinya:

- jangan hapus flow lama dulu
- jangan ganti semua pembaca data dalam satu batch
- jangan paksa cutover kalau modul histori belum aman

### 6.2 Feature flag wajib

Promotion v2 harus dikontrol dari server.

Minimal:

- flag default `OFF`
- hanya dinyalakan saat uji staging atau jendela promotion
- bisa dimatikan lagi setelah selesai

### 6.3 Preview before commit

Tidak boleh ada commit langsung tanpa preview.

Preview wajib menampilkan:

- source year
- target year
- total siswa yang diproses
- siswa promote
- siswa graduate
- error
- warning
- mapping kelas

### 6.4 One-channel commit

Walau web dan mobile harus 1:1, commit production hanya boleh dari satu kanal pada satu waktu.

Aturan:

- preview boleh di web dan mobile
- save mapping boleh di salah satu
- commit hanya dilakukan sekali
- setelah commit, semua kanal hanya refresh hasil

### 6.5 Artifact dan audit

Sebelum dan sesudah commit, sistem harus menyimpan artifact:

- snapshot pre-commit
- hasil commit
- snapshot post-commit
- audit result

Artifact harus ditulis ke path yang tidak mengotori repo kerja.

### 6.6 Isolated deploy

Deploy web/backend harus tetap lewat worktree terisolasi.

Tujuan:

- root workspace tetap bersih
- build artifact tidak mengotori repo utama
- deploy lebih konsisten

## 7. Strategi Rollback

### 7.1 Sebelum commit

Rollback paling mudah.

Kalau masih di tahap:

- buat target year
- clone setup
- preview promotion

maka rollback cukup:

- hapus data draft target year yang belum dipakai
- atau nonaktifkan flag dan hentikan rollout

### 7.2 Sesudah commit

Ini fase sensitif.

Minimal yang harus tersedia:

- backup database penuh sebelum cutover
- snapshot artifact pre/post commit
- `runId` promotion yang jelas

Ideal jangka menengah:

- rollback promotion by `runId`

Runner rollback ini nantinya harus bisa:

- mengembalikan `User.classId`
- mengembalikan `User.studentStatus`
- mengembalikan membership source menjadi current
- menghapus/menutup membership target hasil run
- membatalkan aktivasi target year bila perlu

Sebelum rollback by `runId` tersedia, fallback resmi tetap backup database penuh.

## 8. Parity Web dan Mobile

Semua yang menyentuh promotion harus 1:1:

- endpoint
- payload
- summary
- error
- warning
- run history
- commit result

Yang boleh berbeda hanya:

- layout
- komponen visual
- pola interaksi yang khas desktop/mobile

Yang tidak boleh berbeda:

- perhitungan bisnis
- hasil mapping
- validasi
- status akhir

## 9. Rekomendasi Implementasi Bertahap

### Fase 1. Promotion safe baseline

Fokus:

- promotion v2
- alumni
- audit
- feature flag
- cutover tooling

Status saat ini: sebagian besar fondasinya sudah ada.

### Fase 2. Rollback promotion by run

Fokus:

- targeted rollback
- validasi rollback
- artifact rollback

Ini prioritas tinggi sebelum production cutover penuh.

### Fase 3. Year setup clone wizard

Fokus:

- create academic year wizard
- clone yearly config
- prepare target classes
- draft review

### Fase 4. Historical read hardening

Fokus:

- rapor
- absensi
- izin
- dokumen historis
- schedule/histori akademik

### Fase 5. Full rollover experience

Fokus:

- wizard end-to-end
- admin operator guide
- cutover + rollback UX

## 10. Definisi Sukses

Sistem dianggap siap bila:

1. admin bisa membuat tahun ajaran baru tanpa mengganggu tahun aktif
2. config tahunan bisa dicopy dari tahun sebelumnya secara fleksibel
3. siswa `X` dan `XI` otomatis naik ke kelas target yang sesuai
4. siswa `XII` otomatis menjadi alumni
5. histori akademik lama tetap utuh
6. web dan mobile menampilkan hasil yang sama
7. commit promotion punya audit, snapshot, dan rollback plan
8. deploy dan update tidak membuat worktree/workspace kotor

## 11. Keputusan Rekomendasi

Berdasarkan diskusi, keputusan desain yang saya rekomendasikan adalah:

- promotion siswa otomatis: `YA`
- alumni untuk siswa lulus `XII`: `YA`
- mapel dan kategori mapel sebagai master global: `YA`
- clone config tahunan dari tahun sebelumnya: `YA`
- siswa otomatis ikut ke kelas target: `YA`
- nilai/absensi/rapor lama ikut dipindah: `TIDAK`
- commit promotion langsung tanpa preview/audit: `TIDAK`
- menjalankan production cutover tanpa rollback plan: `TIDAK`

Ini adalah model yang paling aman, paling masuk akal secara operasional sekolah, dan paling tahan terhadap risiko production.
