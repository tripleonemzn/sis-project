# Academic Promotion Click-By-Click UAT Checklist

Checklist ini dibuat untuk membantu admin melakukan uji `staging UAT` fitur:

- `Year Setup Clone Wizard`
- `Promotion Center`
- audit pasca-commit
- keputusan `go / no-go production`

Dokumen ini sengaja dibuat sederhana dan berorientasi klik, bukan teknis backend.

## Aturan Main Sebelum Mulai

- Gunakan environment `staging`, bukan `production`.
- Login sebagai user `ADMIN`.
- Pastikan feature flag rollover dan promotion sudah `ON`.
- Pastikan source year dan target year sudah diketahui.
- Saat mulai `commit promotion`, gunakan satu perangkat saja:
  - hanya web
  - atau hanya mobile
- Jangan commit dari web dan mobile bersamaan.

## Data Yang Harus Dicatat Sebelum UAT

Isi dulu data ini supaya tim tidak bingung saat uji:

- `Source Year`
  - contoh: `2025/2026`
- `Source Year ID`
  - contoh: `4`
- `Target Year`
  - contoh: `2026/2027`
- `Target Year ID`
- `Admin Penguji`
- `Tanggal UAT`

## 1. Checklist Web: Year Setup Clone Wizard

Tujuan tahap ini: menyiapkan tahun ajaran baru tanpa memindahkan siswa.

### A. Buka Halaman

- Login ke web admin.
- Buka menu `Akademik`.
- Buka halaman `Tahun Ajaran`.
- Cari section `Year Setup Clone Wizard`.

### B. Pilih Tahun

- Pilih `Source Year`.
- Pilih `Target Year`, atau buat draft target year bila belum ada.
- Pastikan target year yang dipilih masih `inactive`.

### C. Cek Preview

Periksa apakah angka preview masuk akal untuk:

- `Class Preparation`
- `Teacher Assignments`
- `Report Dates`
- `KKM`
- `Exam Grade Components`
- `Exam Program Configs`
- `Exam Program Sessions`
- `Schedule Time Config`
- `Academic Events`

### D. Hasil Yang Harus Benar

- Tidak ada error merah yang blocking.
- Jika ada warning, catat dulu.
- Jumlah `create` terlihat wajar.
- Tidak ada item yang terlihat ganda atau aneh.

### E. Apply

- Klik tombol `Apply` atau tombol clone yang setara.
- Tunggu sampai selesai.
- Setelah selesai, refresh halaman.

### F. Verifikasi Setelah Apply

- Target year tetap `inactive`.
- Preview berubah:
  - item yang berhasil di-clone idealnya menjadi `0 create` atau `existing`
- Tidak ada data siswa yang berpindah.
- Tidak ada kelas source year yang berubah isinya.

## 2. Checklist Mobile: Year Setup Clone Wizard

Tujuan tahap ini: memastikan mobile 1:1 dengan web.

### A. Buka Halaman

- Login ke mobile admin.
- Buka menu `Akademik`.
- Buka section `Year Setup Clone Wizard`.

### B. Bandingkan Dengan Web

Pastikan mobile menampilkan hal yang sama dengan web:

- source year sama
- target year sama
- summary angka sama
- error sama
- warning sama
- hasil apply sama

### C. Kriteria Lulus

- Jika web menunjukkan `0 create` setelah apply, mobile juga harus menunjukkan hasil yang sama.
- Jika mobile masih menunjukkan angka berbeda, `STOP` dan tandai `No-Go`.

## 3. Checklist Web: Promotion Center

Tujuan tahap ini: memeriksa simulasi promotion sebelum commit.

### A. Buka Halaman

- Di web admin, tetap di area `Akademik`.
- Buka section `Promotion Center`.

### B. Pilih Tahun

- Pilih `Source Year`.
- Pilih `Target Year`.

### C. Cek Summary

Pastikan data summary terlihat masuk akal:

- total classes
- total students
- promoted students
- graduated students
- configured promote classes

### D. Cek Mapping Kelas

Periksa beberapa sampel mapping:

- `X TKJ 1 -> XI TKJ 1`
- `XI TKJ 1 -> XII TKJ 1`
- `XII AK 1 -> GRADUATE`

Perhatikan:

- jurusan harus sama
- level harus naik benar
- kelas target tidak boleh sudah berisi siswa aktif

### E. Cek Warning dan Error

- Jika ada error blocking, `STOP`.
- Jika ada mapping kosong padahal kelas sumber punya siswa, `STOP`.
- Jika satu target class dipakai lebih dari satu source class, `STOP`.

### F. Simpan Mapping

- Klik `Save Mapping`.
- Tunggu notifikasi sukses.
- Refresh halaman.
- Pastikan mapping tetap tersimpan.

## 4. Checklist Mobile: Promotion Center

Tujuan tahap ini: memastikan parity mobile 1:1.

### A. Buka Halaman

- Login ke mobile admin.
- Buka menu `Akademik`.
- Buka section `Promotion Center`.

### B. Bandingkan Dengan Web

Pastikan semua ini sama dengan web:

- total students
- promoted students
- graduated students
- daftar warning
- daftar error
- daftar mapping
- run history

### C. Uji Sinkronisasi

Lakukan dua uji kecil:

- Simpan mapping dari web, lalu buka mobile dan cek hasilnya sama.
- Simpan mapping dari mobile, lalu buka web dan cek hasilnya sama.

Kalau tidak sinkron, `STOP`.

## 5. Checklist Commit Promotion di Staging

Tahap ini hanya dilakukan jika wizard dan preview promotion sudah benar.

### A. Sebelum Klik Commit

- Pastikan semua pihak tahu ini masih `staging`.
- Pastikan hanya satu kanal yang akan dipakai:
  - web saja
  - atau mobile saja
- Catat summary terakhir:
  - total students
  - promoted students
  - graduated students

### B. Commit

- Klik tombol `Commit Promotion`.
- Jika ada konfirmasi, baca ulang pasangan `source -> target`.
- Klik konfirmasi hanya jika sudah yakin.

### C. Catat Hasil

- Catat `Run ID`.
- Catat jam commit.
- Catat siapa yang melakukan commit.

## 6. Checklist Verifikasi Setelah Commit

Setelah commit berhasil, lakukan verifikasi manual.

### A. Sampel Siswa

Cek minimal:

- 1 siswa kelas `X`
- 1 siswa kelas `XI`
- 1 siswa kelas `XII`

### B. Hasil Yang Harus Benar

Untuk siswa `X`:

- status tetap `ACTIVE`
- kelas aktif berubah ke `XI`

Untuk siswa `XI`:

- status tetap `ACTIVE`
- kelas aktif berubah ke `XII`

Untuk siswa `XII`:

- status berubah `GRADUATED`
- `classId` aktif kosong

### C. Tahun Ajaran

- Jika opsi aktivasi target dipilih:
  - target year harus aktif
  - source year tidak aktif lagi

## 7. Checklist Audit Setelah Commit

Tahap ini dilakukan oleh tim teknis, tetapi admin cukup mencatat hasilnya.

Command audit:

```bash
cd backend
npm run promotion:audit -- --source-year <SOURCE_ID> --target-year <TARGET_ID> --run-id <RUN_ID>
```

Hasil yang harus dicatat:

- `PASS`
- atau `FAIL`

Kalau `FAIL`, langsung tandai `No-Go`.

## 8. Checklist Rollback Jika Diperlukan

Rollback hanya dilakukan jika staging menunjukkan hasil salah atau tidak sesuai harapan.

### A. Kapan Rollback

Lakukan rollback jika:

- mapping hasil commit salah
- siswa masuk ke kelas target yang salah
- ada data penting yang tidak sinkron
- audit gagal

### B. Jalankan Rollback

Command:

```bash
bash ./scripts/run-academic-promotion-rollback.sh --source-year <SOURCE_ID> --target-year <TARGET_ID> --run-id <RUN_ID> --actor-id <ADMIN_ID> --yes
```

### C. Cek Hasil Rollback

Pastikan:

- siswa `X` kembali ke kelas asal
- siswa `XI` kembali ke kelas asal
- siswa `XII` kembali dari alumni ke kelas asal
- source year aktif kembali jika sebelumnya memang source yang aktif

## 9. Form Keputusan Go / No-Go

Isi form sederhana ini setelah UAT:

### Go Jika Semua `YA`

- Year Setup Clone Wizard di web `YA`
- Year Setup Clone Wizard di mobile `YA`
- Promotion Center di web `YA`
- Promotion Center di mobile `YA`
- parity web/mobile `YA`
- commit staging sukses `YA`
- audit pasca-commit `PASS`
- rollback test siap atau sudah terverifikasi `YA`

### No-Go Jika Ada Satu Saja `TIDAK`

- ada error blocking
- ada mismatch web vs mobile
- audit gagal
- hasil commit tidak sesuai
- rollback belum aman

## 10. Catatan Hasil UAT

Gunakan template singkat ini:

- `Tanggal UAT`:
- `Penguji Web`:
- `Penguji Mobile`:
- `Source Year`:
- `Target Year`:
- `Run ID`:
- `Audit Result`:
- `Keputusan`:
  - `GO`
  - atau `NO-GO`
- `Catatan Masalah`:

## 11. Langkah Setelah UAT

Jika hasilnya `GO`:

- jadwalkan jendela production
- siapkan backup database
- siapkan admin operator
- gunakan satu kanal saat commit production

Jika hasilnya `NO-GO`:

- jangan lanjut production
- perbaiki temuan dulu
- ulangi UAT dari awal
