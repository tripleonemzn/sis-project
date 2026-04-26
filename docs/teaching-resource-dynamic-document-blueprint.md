# Blueprint Dokumen Perangkat Ajar Dinamis

Dokumen ini merumuskan arah lanjutan fitur `Program Perangkat Ajar` agar tidak bergantung pada nama dokumen hardcode seperti `CP`, `ATP`, `Matriks Sebaran`, atau istilah kebijakan yang bisa berubah.

Fokus dokumen ini adalah membuat mesin dokumen yang:
- netral terhadap perubahan kebijakan dan istilah
- tetap mudah dipahami Wakakur dan guru
- bisa saling terintegrasi antar-dokumen
- aman untuk web dan mobile
- tidak menambah blast radius backend secara agresif

## 1. Masalah Yang Harus Diselesaikan

Model saat ini masih terlalu dekat ke pola `schema per jenis dokumen`, sehingga berisiko:
- dokumen terasa seperti hardcode walaupun labelnya bisa diubah
- integrasi antar-menu masih lemah karena ikatan utamanya masih pada `programCode`
- user non-teknis dipaksa berpikir seperti penyusun schema, bukan penyusun dokumen operasional
- perubahan kebijakan kurikulum berpotensi membuat developer harus ikut mengubah logika inti

Target model baru:
- nama menu bebas
- struktur dokumen fleksibel
- integrasi berbasis `field`, bukan berbasis nama menu
- builder tetap aman dan bisa dipahami user operasional

## 2. Prinsip Inti

1. Mesin harus generik, bukan generik palsu.
   Mesin tidak boleh mengunci tipe sistem seperti `MATRIKS_SEBARAN` sebagai fondasi utama.

2. Nama dokumen adalah label operasional, bukan tipe teknis.
   Wakakur bebas membuat nama seperti `Matriks Sebaran`, `Distribusi TP`, `Pemetaan Semester`, atau istilah baru lain.

3. Integrasi harus berbasis field terstruktur.
   Dokumen lain membaca `field identity` dari dokumen sumber, bukan membaca nama menunya.

4. Sumber data harus eksplisit.
   Setiap field harus jelas apakah isinya manual, dari sistem, dari dokumen lain, atau hasil pilihan user dari data referensi.

5. Struktur inti dan fleksibilitas user harus dipisahkan.
   Sistem harus bisa mengunci bagian inti yang terintegrasi, sambil tetap memberi ruang bagi guru menambah baris/kolom custom yang aman.

6. Web dan mobile tetap 1:1.
   Terminologi, alur, state, dan arti aksi harus sama di dua platform.

## 3. Model Konseptual

### 3.1 Entitas Utama

1. `Program`
   Menu operasional yang muncul ke guru.
   Contoh:
   - `Capaian Pembelajaran`
   - `Distribusi TP`
   - `Pemetaan Semester`

2. `Document Blueprint`
   Definisi struktur dokumen yang dipakai oleh satu program.
   Blueprint ini bersifat generik dan terdiri dari blok-blok.

3. `Block`
   Unit struktur dokumen.
   Jenis minimal yang disarankan:
   - `HEADER`
   - `CONTEXT`
   - `TABLE`
   - `RICH_TEXT`
   - `SIGNATURE`
   - `NOTE`

4. `Field`
   Unit data paling penting di dalam block.
   Field harus punya identitas sistem yang stabil agar bisa dipakai lintas dokumen.

5. `Binding`
   Aturan bagaimana sebuah field mengambil nilai.

6. `Document Entry`
   Dokumen nyata yang dikerjakan guru berdasarkan blueprint.

### 3.2 Program Bukan Tipe Hardcode

Program harus diperlakukan sebagai:
- `label`
- `route slug`
- `urutan tampil`
- `visibility`
- `blueprint`

Program tidak boleh menjadi penentu tunggal perilaku mesin.

Contoh yang benar:
- program bernama `Distribusi TP Semester Ganjil`
- blueprint-nya berisi block header, context, dan table
- kolom `Tujuan Pembelajaran` di-bind ke field sumber dari dokumen lain

Contoh yang harus dihindari:
- kalau `programCode = MATRIKS_SEBARAN`, maka sistem otomatis menganggap field tertentu wajib ada

## 4. Struktur Blueprint Generik

### 4.1 Metadata Blueprint

Setiap blueprint minimal punya:
- `version`
- `documentTitle`
- `documentShortTitle`
- `description`
- `blocks`
- `teacherRules`
- `printRules`

### 4.2 Struktur Block

Setiap block minimal punya:
- `id`
- `type`
- `label`
- `layout`
- `repeatable`
- `visibilityRules`
- `fields`

### 4.3 Struktur Field

Setiap field minimal punya:
- `id`
- `label`
- `fieldKey`
- `fieldIdentity`
- `dataType`
- `required`
- `readOnly`
- `sourceType`
- `binding`
- `display`
- `teacherEditMode`

Penjelasan:
- `fieldKey`
  Kunci lokal di dalam block.
- `fieldIdentity`
  Identitas sistem yang stabil untuk integrasi lintas dokumen.
  Contoh:
  - `learning_outcome_code`
  - `learning_outcome_text`
  - `subject_name`
  - `class_level`
  - `major_name`
  - `active_semester`
  - `effective_week_selection`
- `dataType`
  Tetap bisa memakai basis existing seperti `TEXT`, `NUMBER`, `BOOLEAN`, `SELECT`, `SEMESTER`, `MONTH`, `WEEK`, `WEEK_GRID`, tetapi ke depan perlu ditambah tipe relasional seperti:
  - `REFERENCE_PICKER`
  - `REFERENCE_MULTI_PICKER`
  - `SYSTEM_VALUE`
  - `DERIVED_VALUE`
- `sourceType`
  Menjelaskan nilai berasal dari mana.

## 5. Jenis Source / Binding

### 5.1 Source Type Minimal

1. `MANUAL`
   Diisi langsung oleh user.

2. `SYSTEM`
   Diambil dari source of truth sistem aktif.
   Contoh:
   - tahun ajaran aktif
   - semester aktif
   - mapel guru
   - tingkat
   - rombel
   - program keahlian
   - nama guru

3. `DOCUMENT_REFERENCE`
   Mengacu ke field dari dokumen lain.

4. `DOCUMENT_SNAPSHOT`
   Menyalin nilai dari dokumen lain saat dipilih/dibuat, lalu nilainya menjadi tetap di dokumen ini.

5. `DERIVED`
   Nilai turunan dari data sistem atau field lain.
   Contoh:
   - nomor urut
   - total jam
   - label semester tampilan

6. `STATIC_OPTION`
   Opsi terbatas yang dikonfigurasi Wakakur.

### 5.2 Binding Rule

Binding minimal harus mendukung:
- `sourceDocumentFieldIdentity`
- `filterByContext`
- `matchBySubject`
- `matchByClassLevel`
- `matchByMajor`
- `matchByActiveSemester`
- `selectionMode`
- `syncMode`

### 5.3 Sync Mode

Setiap binding lintas dokumen harus eksplisit memakai salah satu mode ini:

1. `LIVE_REFERENCE`
   Dokumen target selalu membaca nilai terbaru dari dokumen sumber.
   Dipakai hanya untuk data yang aman berubah.

2. `SNAPSHOT_ON_SELECT`
   Nilai sumber disalin saat user memilih item, lalu tidak ikut berubah otomatis.
   Ini mode default yang paling aman untuk dokumen operasional.

3. `SYSTEM_DYNAMIC`
   Nilai selalu mengikuti source of truth sistem aktif.
   Cocok untuk semester aktif, mapel, tahun ajaran aktif, dan konteks guru.

## 6. Aturan Integrasi Antar-Dokumen

### 6.1 Integrasi Harus Berbasis Field Identity

Contoh yang benar:
- dokumen A mengekspor `learning_outcome_text`
- dokumen B mengimpor `learning_outcome_text`

Contoh yang salah:
- dokumen B mencari data dari menu bernama `ATP`

Dengan model ini, kalau nama dokumen berubah:
- `Capaian Pembelajaran`
- `Target Belajar`
- `Daftar CP Inti`

integrasi tetap aman selama field identity yang dipakai tetap tersedia.

### 6.2 Dokumen Sumber Harus Bisa Mengekspos Field

Setiap blueprint harus bisa menandai field mana yang:
- hanya untuk tampilan internal
- bisa dipakai sebagai referensi oleh dokumen lain
- wajib unik dalam konteks tertentu

Contoh field yang layak diekspos:
- `learning_outcome_code`
- `learning_outcome_text`
- `semester`
- `subject_name`
- `class_level`
- `major_name`

### 6.3 Dokumen Turunan Harus Bisa Memilih Strategi Ambil Data

Dokumen turunan minimal harus bisa memilih:
- `pick from source`
- `auto-fill by context`
- `copy once`

Contoh:
- kolom `Tujuan Pembelajaran` memakai `pick from source`
- kolom `Semester` memakai `auto-fill by context`
- kolom `Judul Header` bisa `manual`

## 7. Contoh Penerapan Pada Kasus User

Misal Wakakur membuat dua dokumen:

1. `Capaian Pembelajaran`
2. `Distribusi Tujuan Pembelajaran`

### 7.1 Dokumen `Capaian Pembelajaran`

Block yang mungkin dipakai:
- `HEADER`
- `CONTEXT`
- `TABLE`

Field yang bisa diekspos:
- `learning_outcome_code`
- `learning_outcome_text`
- `subject_name`
- `class_level`
- `major_name`
- `semester`

### 7.2 Dokumen `Distribusi Tujuan Pembelajaran`

Block yang mungkin dipakai:
- `HEADER`
- `CONTEXT`
- `TABLE`

Kolom tabel:
- `row_number`
  - sourceType: `DERIVED`
  - syncMode: `SYSTEM_DYNAMIC`
- `learning_outcome_text`
  - sourceType: `DOCUMENT_REFERENCE`
  - source document field: `learning_outcome_text`
  - selectionMode: `pick from source`
  - syncMode: `SNAPSHOT_ON_SELECT`
- `teaching_hours`
  - sourceType: `SYSTEM` atau `MANUAL_WITH_SYSTEM_SUGGESTION`
  - catatan: ini bisa tetap editable jika kebutuhan operasionalnya per baris
- `semester`
  - sourceType: `SYSTEM`
  - syncMode: `SYSTEM_DYNAMIC`
- `effective_week_selection`
  - sourceType: `SYSTEM`
  - source of truth: minggu efektif yang disetting Wakakur
  - selectionMode: `pick from filtered options`

Dengan model ini, nama dokumen boleh berubah tanpa memaksa perubahan mesin.

## 8. Rule Edit Guru

Rule edit guru harus dipisah dari struktur inti blueprint.

### 8.1 Rule Yang Disarankan

Per block/field perlu aturan seperti:
- `allowAddRow`
- `allowDeleteRow`
- `allowReorderRow`
- `allowAddCustomColumn`
- `allowEditFieldLabel`
- `allowEditBinding`
- `allowOverrideReadOnlyValue`

### 8.2 Batas Aman Default

Untuk dokumen terintegrasi, default aman:
- guru boleh tambah baris
- guru boleh hapus baris manual miliknya sendiri
- guru boleh tambah kolom custom di area tambahan
- guru tidak boleh mengubah binding field inti
- guru tidak boleh mengubah field identity
- guru tidak boleh menghapus kolom inti yang menjadi dasar integrasi

### 8.3 Area Custom Harus Jelas

Kalau guru diberi fleksibilitas tambahan, sistem harus membedakan:
- `core fields`
- `teacher custom fields`

Tujuannya agar:
- print tetap rapi
- integrasi tidak rusak
- data ekspor masih konsisten

## 9. UX Builder Untuk Wakakur

Wakakur tidak boleh dipaksa menyusun schema mentah.

Alur yang disarankan:

1. Buat menu
   - nama dokumen
   - nama singkat
   - tampil untuk tingkat mana
   - muncul di menu guru atau tidak

2. Susun blok dokumen
   - tambah `Header`
   - tambah `Info Konteks`
   - tambah `Tabel`
   - tambah `Catatan`

3. Atur isi tiap blok
   - isi manual
   - ambil dari sistem
   - ambil dari dokumen lain

4. Atur fleksibilitas guru
   - boleh tambah baris?
   - boleh tambah kolom custom?
   - kolom inti mana yang dikunci?

5. Pratinjau tampilan guru
   - form input
   - tampilan print
   - perilaku saat data sumber tersedia/tidak tersedia

### 9.1 Preset Tetap Boleh, Tapi Bukan Fondasi Mesin

Preset hanya berfungsi sebagai starter agar user tidak mulai dari nol.
Contoh:
- `Mulai dari dokumen daftar capaian`
- `Mulai dari dokumen sebaran`
- `Mulai dari dokumen tabel semester`

Setelah dipilih:
- nama boleh diubah
- label kolom boleh diubah
- struktur bisa disesuaikan
- integrasi tetap berbasis field identity, bukan nama preset

## 10. UX Guru

Di sisi guru, pengalaman harus sederhana:

1. Pilih konteks mengajar
2. Sistem memuat dokumen sesuai blueprint
3. Field sistem terisi otomatis
4. Field referensi menampilkan pilihan data yang relevan
5. Guru melengkapi bagian yang memang perlu diisi
6. Guru bisa tambah baris/kolom sesuai rule yang diizinkan

Jangan paksa guru memahami:
- schema
- binding teknis
- source sheet
- semantic key

Semua istilah teknis harus tetap di area konfigurasi Wakakur/teknisi.

## 11. Dampak Ke Data Model Existing

Model existing saat ini masih dominan:
- `program.code`
- `program.schema.sections`
- `column.valueSource`
- `column.bindingKey`

Agar migrasi aman, arah refactor yang disarankan adalah evolusi bertahap:

### 11.1 Tahap 1

Pertahankan kontrak existing, lalu tambah metadata generik:
- `blocks`
- `fieldIdentity`
- `sourceType`
- `binding.config`
- `teacherRules`

### 11.2 Tahap 2

Tambahkan registry source/binding yang lebih tegas:
- source sistem
- source dokumen lain
- strategi snapshot/reference

### 11.3 Tahap 3

Baru sesudah builder stabil:
- kurangi ketergantungan pada schema bawaan per `programCode`
- pindahkan preset ke layer starter UX, bukan ke logika inti backend

## 12. Guardrail Teknis

Karena project ini production aktif, implementasi wajib menjaga hal berikut:

1. Jangan membuat query lintas dokumen tanpa batas.
   Semua reference picker harus scoped minimal oleh:
   - tahun ajaran aktif
   - guru/mapel/konteks assignment
   - semester jika relevan

2. Jangan auto-refetch agresif.
   Data referensi cukup diambil saat form dibuka, konteks berubah, atau user meminta refresh sadar.

3. Jangan overwrite form guru saat sedang mengisi.
   Jika source dokumen berubah dari luar, tampilkan sinyal `muat ulang referensi`, bukan auto-merge diam-diam.

4. Gunakan snapshot sebagai default dokumen operasional.
   Ini mengurangi kebingungan jika dokumen sumber diedit belakangan.

5. Invalidasi query harus scoped.
   Jangan invalidate semua dokumen perangkat ajar hanya karena satu field referensi berubah.

## 13. Parity Web-Mobile

Aturan parity yang wajib dijaga:
- nama menu sama
- istilah sumber data sama
- aturan field inti vs custom sama
- perilaku tambah baris/kolom sama
- preview/print meaning sama
- status dokumen sama

Jika web memakai dropdown referensi, mobile juga harus memakai dropdown/select yang setara, bukan chip improvisasi.

## 14. Tahapan Implementasi Yang Aman

### Batch A - Blueprint Engine
- rumuskan model blok, field identity, source type, sync mode
- tambahkan metadata baru tanpa mematahkan dokumen existing

### Batch B - Source Registry
- buat daftar source sistem yang resmi
- buat mekanisme dokumen sumber mengekspos field referensi

### Batch C - Reference Picker
- guru bisa memilih data dari dokumen sumber secara scoped
- mode default `SNAPSHOT_ON_SELECT`

### Batch D - Wakakur Builder V2
- editor blok sederhana
- pengaturan rule guru
- preview guru

### Batch E - Preset Starter
- sediakan starter opsional yang mudah dipakai
- preset tidak menjadi hard dependency engine

## 15. Keputusan Desain Yang Direkomendasikan

1. `Program` tetap ada sebagai entitas menu.
2. `Template hardcode` tidak menjadi fondasi inti.
3. `Preset starter` boleh ada sebagai akselerator UX.
4. `Field identity` menjadi basis integrasi lintas dokumen.
5. `Snapshot on select` menjadi default untuk referensi dokumen operasional.
6. `Teacher custom area` harus dipisahkan dari `core integrated area`.

## 16. Ringkasan Eksekutif

Arah fitur yang disepakati adalah:
- bukan template hardcode per nama dokumen
- bukan schema mentah yang membingungkan user
- tetapi builder dokumen generik berbasis blok
- dengan field identity yang stabil
- binding ke sistem atau dokumen lain yang eksplisit
- dan fleksibilitas guru yang aman, bukan bebas tanpa pagar

Dengan model ini:
- kebijakan dan istilah bisa berubah
- nama menu bisa berubah
- urutan dokumen bisa berubah
- tetapi mesin inti tetap bertahan dan integrasi tetap konsisten
