# Kesepakatan Final Operasional Tahun Ajaran, Promotion, dan Arsip

Dokumen ini menjadi rujukan utama dari hasil diskusi panjang mengenai:

- pergantian tahun ajaran
- clone komponen tahunan
- promotion kenaikan kelas
- kelulusan `XII -> alumni`
- tunggakan lintas tahun
- akses arsip lintas role, duty, dan ownership historis

Tujuan dokumen ini adalah menyatukan cara pandang bisnis dan teknis agar implementasi berikutnya tetap konsisten, aman untuk production, dan tidak keluar dari logika operasional sekolah yang sudah berjalan.

## 1. Ringkasan Kesepakatan Final

Kesepakatan inti yang dipakai sebagai acuan:

1. Pergantian tahun ajaran harus terasa sebagai kelanjutan alami sekolah, bukan seperti membuat sistem baru setiap tahun.
2. Siswa tidak di-clone sebagai user baru. Yang berubah adalah konteks akademiknya pada tahun ajaran baru.
3. Siswa `X` dan `XI` naik ke kelas target yang sepadan melalui promotion.
4. Siswa `XII` yang lulus berubah menjadi alumni.
5. Tahun ajaran lama tetap bisa diakses sebagai arsip.
6. Data global seperti user, role, duty, jurusan, mapel, dan kategori mapel tidak diduplikasi per tahun.
7. Data tahunan seperti kelas, wali kelas, assignment guru, KKM, report dates, exam config, dan rule akademik lain dibawa sebagai draft editable.
8. Tunggakan keuangan lama tidak diduplikasi ke tahun baru, tetapi tetap menempel ke siswa sebagai kewajiban lintas tahun.
9. Akses arsip tidak boleh hanya ditentukan dari role saat ini. Harus mempertimbangkan juga duty dan ownership historis pada tahun ajaran terkait.

## 2. Mental Model Yang Dipakai

Secara operasional, sistem dibagi menjadi lima lapisan:

### 2.1 Identitas global

Lapisan ini tidak ikut berubah hanya karena ganti tahun ajaran:

- user guru
- user siswa
- user orang tua
- role user
- additional duties
- jurusan
- mapel master
- kategori mapel master

Implikasi:

- guru tetap guru yang sama
- wali kelas, wakakur, bendahara, BP/BK, dan duty lain tetap melekat pada user yang sama
- siswa tetap siswa yang sama
- orang tua tetap tertaut ke anak yang sama

### 2.2 Konteks tahunan

Lapisan ini dibentuk ulang untuk setiap tahun ajaran baru, tetapi idealnya bisa di-carry-forward dari tahun sebelumnya:

- kelas
- wali kelas per kelas
- teacher assignment
- KKM
- report dates
- exam program / exam session / komponen nilai ujian
- schedule time config
- academic events
- konfigurasi akademik lain yang memang year-scoped

### 2.3 Lifecycle siswa

Lapisan ini menentukan status akademik aktif siswa:

- `X -> XI`
- `XI -> XII`
- `XII -> alumni`
- histori membership tahun lama tetap utuh

### 2.4 Histori akademik

Lapisan ini harus tetap melekat ke `academicYearId` asal dan tidak ikut dipindahkan:

- nilai
- rapor
- absensi
- izin
- behavior / counseling
- ranking
- restriction ujian
- dokumen akademik historis

### 2.5 Kewajiban lintas tahun

Lapisan ini tidak pindah tahun, tetapi tetap harus terlihat dan bisa dioperasikan:

- invoice lama
- tunggakan lama
- pembayaran atas tagihan lama
- write-off / reversal / refund atas transaksi lama

## 3. Aturan Final Per Domain

### 3.1 Persist global

Data berikut tidak perlu di-clone per tahun ajaran:

- akun user
- role user
- additional duties
- relasi parent-student
- jurusan
- mapel
- kategori mapel

Aturan:

- guru tidak perlu dibuat ulang setiap tahun
- duty guru tidak perlu dibuat ulang setiap tahun
- siswa tidak perlu dibuat ulang setiap tahun
- alumni tetap user yang sama dengan status akademik yang berubah

### 3.2 Clone default sebagai draft

Data berikut dibawa default dari tahun sebelumnya, tetapi wajib editable sebelum tahun ajaran target diaktifkan:

- kelas target
- wali kelas target
- teacher assignment
- KKM
- report dates
- exam config
- academic events
- schedule time config
- konfigurasi akademik tahunan lain

Aturan final:

- carry-forward harus bersifat default, bukan paksa
- operator tetap bisa mengubah, menghapus, atau menambah item sebelum aktivasi
- hasil clone tidak boleh menimpa data target yang sudah ada tanpa persetujuan eksplisit

Contoh:

- `X TKJ 1` pada tahun lama harus menyiapkan `XI TKJ 1` pada tahun baru
- wali kelas `X TKJ 1` secara default dibawa menjadi wali kelas `XI TKJ 1`
- jika sekolah ingin mengganti wali kelas, admin cukup mengedit draft target year

### 3.3 Auto-promote

Data berikut bergerak melalui promotion:

- membership siswa pada tahun ajaran baru
- `User.classId` sebagai snapshot aktif
- `User.studentStatus` sebagai snapshot aktif

Aturan final:

- `X` naik ke `XI`
- `XI` naik ke `XII`
- `XII` yang lulus menjadi `GRADUATED`
- promotion harus berbasis mapping eksplisit source class ke target class
- target class harus sudah siap lebih dulu

### 3.4 Carry-forward visibility

Data berikut tidak di-copy, tetapi tetap ikut terbawa secara bisnis:

- tunggakan lama
- invoice lama
- riwayat pembayaran lama
- kredit / refund / reversal / write-off yang terkait transaksi lama

Aturan final:

- tagihan lama tetap milik tahun ajaran lama
- siswa di tahun ajaran baru tetap terlihat memiliki outstanding jika tagihan lama belum selesai
- dashboard keuangan harus bisa membaca kewajiban lintas tahun tanpa membuat invoice duplikat

### 3.5 Harus reset / tidak boleh ikut terbawa otomatis

Data berikut tidak boleh dibawa mentah ke tahun baru:

- nilai
- absensi
- izin
- counseling
- behavior
- rapor
- ranking
- restriction ujian
- president / ketua kelas
- catatan wali kelas yang sifatnya final untuk tahun lama

Catatan:

- `wali kelas` dibawa default karena itu struktur operasional
- `ketua kelas` sebaiknya tidak dibawa default karena biasanya dipilih ulang

## 4. Alur Operasional Yang Disepakati

Flow final yang diinginkan:

1. Admin membuat tahun ajaran baru.
2. Admin atau kurikulum menjalankan `Year Setup Clone Wizard`.
3. Sistem menyiapkan draft target year dengan carry-forward komponen tahunan.
4. Operator mereview hasil clone, termasuk wali kelas dan assignment guru.
5. Admin menjalankan `Promotion Center`.
6. Sistem menampilkan preview siswa naik, siswa lulus, mapping kelas, dan warning.
7. Admin melakukan commit promotion.
8. Tahun ajaran target diaktifkan setelah hasil review dianggap benar.
9. Tahun ajaran lama berubah fungsi menjadi arsip.

Prinsip utama:

- setup tahunan dan promotion adalah dua langkah sistem yang terpisah
- tetapi untuk operator, pengalaman pemakaiannya harus terasa sebagai satu alur besar pergantian tahun ajaran

## 5. Aturan Khusus Yang Menyempurnakan Keinginan Awal

Berikut pelurusan final dari hasil diskusi:

### 5.1 Tentang siswa

Yang benar bukan `clone siswa`, melainkan:

- user siswa tetap sama
- status akademik aktif siswa yang berpindah
- membership akademik yang berubah
- kelas aktif yang berubah

Jadi, sistem tidak menciptakan siswa baru saat tahun ajaran berganti.

### 5.2 Tentang guru

Guru harus dianggap sebagai entitas global yang tetap sama.

Yang tetap melekat:

- role guru
- additional duties
- akses dasar sebagai guru

Yang dibawa default sebagai draft tahunan:

- wali kelas
- teacher assignments
- penugasan-penugasan tahunan lain yang memang punya konteks `academicYearId`

### 5.3 Tentang wali kelas

Kesepakatan final:

- wali kelas source class dibawa default ke kelas target yang sepadan
- tetapi harus editable sebelum target year aktif
- akses arsip wali kelas ke tahun lama tetap ada jika dia memang wali pada tahun itu

### 5.4 Tentang alumni

Kesepakatan final:

- `XII` yang lulus berubah menjadi alumni
- alumni tidak punya membership aktif di tahun baru
- alumni tetap boleh mengakses histori dirinya sendiri secara read-only

### 5.5 Tentang tunggakan

Kesepakatan final:

- tunggakan lama tidak disalin menjadi invoice tahun baru
- outstanding lama tetap menempel ke siswa
- staff finance tetap bisa memproses pelunasan, write-off, reversal, atau refund terhadap tagihan lama

## 6. Model Arsip Tahun Ajaran

Tahun ajaran lama harus tetap dapat diakses sebagai arsip. Namun aksesnya perlu diatur lebih ketat dari tahun aktif.

Status operasional yang direkomendasikan:

- `DRAFT`
- `ACTIVE`
- `ARCHIVED_OPEN`
- `ARCHIVED_LOCKED`

Penjelasan:

- `ARCHIVED_OPEN`: arsip tersedia, default read-only, correction window terbatas masih bisa dibuka untuk modul tertentu
- `ARCHIVED_LOCKED`: arsip final, read-only penuh kecuali override khusus yang tercatat audit

Walau state ini belum semua ada di schema saat ini, policy operasional harus mengikuti model ini.

## 7. Prinsip Permission Arsip

Akses arsip harus memakai tiga faktor:

1. role global user
2. additional duty global user
3. historical ownership pada tahun ajaran itu

`Historical ownership` artinya user memang punya keterlibatan sah pada data tahun itu, misalnya:

- wali kelas pada kelas tersebut
- guru pengampu pada mapel/kelas tersebut
- examiner/proctor pada ujian tersebut
- tutor ekskul pada program tersebut
- siswa pemilik data
- orang tua dari siswa pemilik data

Prinsip final:

- arsip tidak boleh terbuka hanya karena seseorang punya role umum
- arsip boleh dibuka jika role dan kepemilikannya memang relevan
- edit arsip harus jauh lebih terbatas daripada baca arsip

## 8. Matrix Akses Arsip Per Role

| Role / Aktor | Boleh akses arsip | Cakupan | Hak edit |
| --- | --- | --- | --- |
| `ADMIN` | Ya | Semua modul lintas tahun | Correction terbatas dengan audit |
| `PRINCIPAL` | Ya | Seluruh ringkasan, laporan final, dan detail strategis | Tidak untuk edit massal |
| `TEACHER` biasa | Ya | Hanya kelas/mapel/ujian/penugasan yang pernah ditangani pada tahun itu | Umumnya read-only |
| `TEACHER + WALI_KELAS` | Ya | Arsip kelas yang pernah diwalikan, termasuk izin/behavior/rapor kelas | Correction terbatas dalam window |
| `TEACHER + WAKASEK_KURIKULUM / SEKRETARIS_KURIKULUM` | Ya | Seluruh arsip akademik | Correction akademik terbatas dengan audit |
| `TEACHER + BP_BK` | Ya | Arsip izin, behavior, counseling, summary BK | Correction terbatas dengan audit |
| `STAFF FINANCE / BENDAHARA / HEAD TU` | Ya | Seluruh arsip finance lintas tahun | Operasional finance historis tetap boleh |
| `STAFF ADMINISTRASI` | Ya | Arsip administratif, surat, data siswa, dokumen TU | Tidak boleh edit nilai/rapor |
| `EXAMINER` | Ya | Hanya arsip UKK/ujian yang pernah ditangani | Read-only |
| `EXTRACURRICULAR_TUTOR` | Ya | Hanya arsip ekskul yang pernah dibina | Read-only |
| `STUDENT` | Ya | Hanya data arsip dirinya sendiri | Read-only |
| `PARENT` | Ya | Hanya data arsip anak yang terhubung | Read-only |
| `STUDENT (GRADUATED / alumni)` | Ya | Hanya data arsip dirinya sendiri | Read-only |
| `CALON_SISWA / UMUM` | Tidak | Tidak perlu akses arsip akademik | Tidak ada |

## 9. Matrix Akses Arsip Per Modul

| Modul | Siapa yang boleh baca | Siapa yang boleh edit |
| --- | --- | --- |
| Nilai / Rapor | Admin, Principal, Kurikulum, wali kelas historis, guru pengampu historis, siswa/alumni sendiri, orang tua terkait | Admin atau kurikulum dalam correction window ber-audit |
| Absensi | Admin, Principal, wali kelas historis, guru terkait, siswa/alumni sendiri, orang tua terkait | Admin atau pihak akademik terbatas dalam correction window |
| Izin / BP-BK / Behavior | Admin, Principal, BP/BK, wali kelas historis, siswa sendiri, orang tua terkait | Admin atau BP/BK terbatas dan ber-audit |
| Keuangan | Admin, finance, Head TU, Principal, siswa/alumni sendiri, orang tua terkait | Finance flows tetap aktif untuk tagihan historis |
| Ujian / UKK / Proctor | Admin, kurikulum, examiner/proctor historis, Principal, siswa sendiri | Kurikulum terbatas dan ber-audit |
| Kelas / roster historis | Admin, Principal, kurikulum, wali kelas historis | Tidak untuk edit rutin |
| Surat / dokumen TU | Admin, staff administrasi, Head TU, Principal, siswa/orang tua sesuai haknya | Staff administrasi terbatas |

## 10. Rule Final Untuk Tahun Arsip

Ketika tahun ajaran menjadi arsip:

- data historis tetap bisa dibuka
- default seluruh modul akademik menjadi read-only
- dashboard dan filter tahun ajaran tetap harus bisa memilih tahun arsip
- menu siswa/alumni tetap bisa menampilkan histori diri sendiri
- finance tetap boleh mengelola kewajiban historis
- perubahan arsip hanya boleh lewat jalur correction yang tercatat audit

## 11. Rule Final Untuk Web dan Mobile

Web dan mobile wajib menjaga parity 1:1 untuk:

- label dan istilah utama
- summary angka
- warning / blocking issue
- urutan flow setup year dan promotion
- hasil commit / rollback
- status arsip yang ditampilkan ke user

Yang boleh berbeda hanya:

- layout
- responsivitas
- gaya presentasi komponen

Yang tidak boleh berbeda:

- aturan bisnis
- permission
- hasil API
- arti status

## 12. Implikasi Implementasi Dari Kesepakatan Final

Beberapa bagian sudah sesuai dengan model ini, tetapi ada bagian yang masih harus ditindaklanjuti agar implementasi betul-betul sama dengan kesepakatan akhir.

### 12.1 Yang sudah sejalan

- promotion siswa aktif dan alumni
- clone banyak komponen tahunan
- hardening histori lintas domain utama
- rollback promotion
- guardrail staging / cutover / audit / readiness
- akses alumni read-only dasar

### 12.2 Yang masih perlu disempurnakan

1. Carry-forward wali kelas default pada kelas target harus dijadikan perilaku baku, bukan dibiarkan kosong.
2. Wizard setup tahun ajaran dan promotion perlu dibingkai sebagai satu journey operator yang lebih natural.
3. Policy permission arsip perlu dikodifikasi resmi di backend, bukan hanya mengandalkan role atau duty global.
4. Historical ownership perlu menjadi bagian eksplisit dari pengecekan akses arsip.
5. Correction window untuk arsip perlu diatur sebagai policy yang konsisten per modul.
6. Visibility tunggakan lintas tahun perlu terus dipastikan konsisten di seluruh surface user yang relevan.

## 13. Prinsip Keamanan Production

Semua implementasi lanjutan dari dokumen ini harus mengikuti guardrail berikut:

- additive schema dulu
- feature flag dulu
- preview sebelum commit
- rollback tersedia sebelum cutover
- perubahan arsip harus ter-audit
- deploy harus memakai jalur aman dan worktree bersih
- web dan mobile harus bergerak 1:1 untuk feature admin yang sama

## 14. Kesimpulan Final

Model final yang disepakati adalah:

- identitas user, role, dan duty tetap global
- setup tahunan dibawa default sebagai draft editable
- siswa aktif auto-promote
- `XII` lulus menjadi alumni
- histori tahun lama tetap utuh
- tunggakan lama tetap menempel lintas tahun tanpa duplikasi invoice
- tahun lama tetap bisa diakses sebagai arsip
- akses arsip ditentukan oleh role, duty, dan ownership historis
- arsip default read-only, kecuali correction flow terbatas dan ber-audit

Dokumen ini menjadi patokan final untuk keputusan pengembangan lanjutan agar arah bisnis, UX operator, dan keamanan production tetap konsisten.
