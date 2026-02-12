**ATURAN KERJA TRAE AI**

# SIMPAN DI MEMORI KAMU SECARA PERMANEN!!!
1. SELALU GUNAKAN BAHASA INDONESIA!
2. SETIAP PEMBUATAN HALAMAN BARU WAJIB MENGIKUTI HALAMAN YANG SUDAH JADI, MULAI DARI DESSAIN UI, JENIS FONT, UKURAN FONT, WARNA, DLL DENGAN STANDAR YANG SUDAH DI TERAPKAN DAN DILARANG KERAS MEMBUAT KOSEP BARU DALAM PEMBUATAN HALAMAN
3. PASTIKAN SEMUA FILE SALING TERINTEGRASI SESUAI DENGAN INTEGRASINYA
4. DALAM PEMBUATAN HALAMAN BARU PASTIKAN TIDAK ADA ERROR BAIK DI TAB PROBLEMS, MAUPUN ERROR DAN WARNING DI CONSOL BROWSER DAN SERTAKAN LABEL, AUTOCOMPLTE, DLL AGAR TIDAK MENIMBULKAN WARNING DI CONSOL BROWSER
5. HARUS BEKERJA DENGAN CEPAT DAN TELITI!
6. SELALU JAGA KONSISTENSI DENGAN KODE YANG SUDAH ADA
7. kamu diberikan akses root, sehingga kamu bisa melakukan apapun di dalam project ini
8. Trae AI adalah Programmer Expert, jadi kamu harus mengikuti standar kode yang sudah ada! dan selalu patuh pada aturan yang sudah ditetapkan
9. tidak usah mengecek/analisis file berulang-ulang kali, cukup 1 kali lalu periksa integrasinya kemana saja, setelah itu langsung eksekusi
10. jika ada error, periksa errornya dan perbaiki errornya, jangan lupa simpan file setelah perbaikan
11. jika ada warning, periksa warnanya dan perbaiki warnanya, jangan lupa simpan file setelah perbaikan
12. jika ada error/warning di console browser, periksa errornya dan perbaiki errornya, jangan lupa simpan file setelah perbaikan
13. pastikan zero mistake, tapi jangan berlebihan pengecekan filenya!!
14. setelah melakukan perbaikan, WAJIB jalankan script: `/var/www/sis-project/update_all.sh` agar semua services (Backend & Frontend) up to date! pastikan user bisa cek dari sisi UI nya!

# STANDAR TERMINOLOGI & DROPDOWN UI
1. Label Dropdown: Gunakan format "Pilih [Entitas]" (tanpa prefix "--" atau suffix "...").
2. Semester: Tampilkan "Ganjil"/"Genap" (bukan "Semester Ganjil").
3. Istilah: Gunakan "Mata Pelajaran" (bukan "Mapel").
4. Default: Dropdown Tahun Ajaran wajib auto-select tahun aktif.

# STANDAR BREADCRUMB UI
1. Kesesuaian Sidebar: Breadcrumb WAJIB mengikuti struktur dan penamaan yang sama persis dengan Sidebar Menu.
2. Format: "GROUP MENU > Nama Menu" (Contoh: AKADEMIK > Input Nilai).
3. Root Path: Halaman utama dashboard (root) harus berlabel "Dashboard".
4. Konsistensi Role: Aturan ini berlaku untuk SEMUA role (Admin, Guru, Siswa, dll).
5. Halaman Create/Edit: Gunakan format "GROUP MENU > Nama Menu > Action" (Contoh: UJIAN > Bank Soal > Buat Baru).

# STANDAR PENGEMBANGAN FITUR CETAK (PRINT)
1. **Isolasi Wajib**: Fitur cetak (Print/Download PDF) WAJIB menggunakan teknik isolasi (seperti *Hidden Iframe* atau *New Window*) untuk merender dokumen.
2. **Hindari CSS Global**: DILARANG merender konten cetak langsung di halaman utama yang bercampur dengan layout aplikasi (Sidebar, Navbar, dll) karena rentan konflik CSS (misal: `overflow: hidden`, `height: 100vh`).
3. **Dedicated Component**: Buat komponen khusus untuk dokumen cetak (misal: `DocumentName.tsx`) yang terpisah dari logika halaman, agar bisa dirender bersih di dalam iframe/portal.
4. **UX**: Gunakan *Iframe Portal* agar user tetap di halaman yang sama (tidak membuka tab baru) namun hasil cetak tetap bersih.

# STANDAR FORMAT SURAT PENGANTAR PKL (FIXED)
1. **Indentasi Body**: Konten surat (Kepada Yth s.d. Penutup) WAJIB indent 95px agar sejajar lurus dengan titik dua pada header Nomor/Lampiran.
2. **Paragraf**: Paragraf pembuka ("Dengan hormat") dan penutup ("Demikian") menggunakan `text-align: justify` TANPA `text-indent` (Hapus tab/indentasi baris pertama).
3. **Tanda Tangan (Signature)**:
   - Tambahkan teks "Hormat Kami," di atas "Kepala Sekolah".
   - Teks "Kepala Sekolah" TANPA tanda koma (,).
   - Jarak antara Nama Kepala Sekolah dan NUPTK harus rapat (`margin-bottom: 0` pada nama, `margin-top: 0` pada NUPTK).
   - Data Kepala Sekolah (Nama & NUPTK) WAJIB diambil dinamis dari user dengan role `PRINCIPAL`.
   - Gunakan label **NUPTK** (Bukan NIP).
4. **Footer Contact Person**:
   - Posisi WAJIB rata kiri sejajar dengan label "Nomor" (Margin Left: 0 / Default).
   - DILARANG mengikuti indentasi body (95px).
