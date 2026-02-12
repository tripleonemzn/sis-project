# PEDOMAN PENGEMBANGAN UTAMA (WAJIB DIPATUHI DAN CATAT DIINGATANMU!)

Sebelum memulai implementasi, tanamkan prinsip-prinsip berikut sebagai standar kualitas kode Anda:

1.  **Konsistensi Desain Mutlak**:
    - Jangan membuat konsep desain baru secara sembarangan.
    - Gunakan kembali komponen UI yang sudah ada (reusable components).
    - Pastikan tampilan halaman baru selaras dengan _Look & Feel_ aplikasi yang sudah berjalan.

2.  **Zero Console Errors**:
    - Pastikan tidak ada error merah di console browser saat runtime.
    - Tangani setiap potensi _uncaught exception_ atau _undefined state_.

3.  **Kepatuhan Aksesibilitas & Warning**:
    - Setiap elemen input (Search box, Form field, Select) **WAJIB** memiliki label yang jelas (`aria-label`, `htmlFor`, atau `placeholder` yang deskriptif).
    - Hilangkan semua warning kuning di console (seperti `missing key` di map, `invalid DOM nesting`, dll).

4.  **Integrasi End-to-End**:
    - Pastikan rute baru terdaftar dengan benar di routing system.
    - Verifikasi koneksi antar file dan modul berjalan mulus (import/export valid).
    - Jangan biarkan ada fitur yang "menggantung" atau tidak terhubung ke navigasi utama.

5.  **Verifikasi UI & Deployment (Wajib Testable)**:
    - **UI Testing Priority**: Semua fitur wajib bisa diuji langsung dari UI Browser. Jangan hanya mengandalkan asumsi kode berjalan.
    - **Environment Refresh**: Jika perubahan memerlukan update konfigurasi server (Nginx/PM2) atau build ulang asset static, **LAKUKAN SEGERA**. Pastikan environment test selalu up-to-date agar pengujian valid dan tidak bias karena cache/config lama.

---

# Prompt Pengembangan Modul Ujian (CBT) Baru

Gunakan prompt ini untuk memerintahkan AI (Trae/Cursor/Windsurf) membangun ulang fitur Ujian dengan arsitektur yang lebih solid dan fitur editor soal yang lengkap.

---

**Role:** Senior Fullstack Developer (Next.js/React + Node.js/Express + Prisma PostgreSQL).
**Context:**
Kita akan membangun ulang modul **UJIAN** untuk aplikasi sekolah dengan **REFERENSI UTAMA** adalah repository project ini: `https://github.com/vaizaky/sis-kgb2.git`.

**Tugas Anda:**

1.  **Analisis Codebase Lama**: Pelajari struktur database (Prisma), komponen UI (Frontend), dan Authentication Flow yang ada di repo `sis-kgb2` tersebut.
2.  **Pertahankan Style**: Pastikan kode baru mengikuti gaya penulisan dan struktur folder yang sudah ada di repo ini.
3.  **Improvement**: Modul lama memiliki masalah pada logika "Parent-Child" (copy ujian ke kelas lain) yang menyebabkan bug sinkronisasi. Kita perlu arsitektur baru yang lebih efisien (lihat poin 2 di bawah).

## 1. Spesifikasi Menu & Navigasi

Buatkan menu sidebar level atas bernama **UJIAN** dengan sub-menu dinamis berdasarkan Semester Aktif:

1.  **Formatif (Quiz)**: (Ulangan Harian/Kuis) - Selalu tampil.
2.  **SBTS**: (Sumatif Tengah Semester) - Selalu tampil.
3.  **SAS**: (Sumatif Akhir Semester) - **Hanya tampil jika Semester Aktif = GANJIL**.
4.  **SAT**: (Sumatif Akhir Tahun) - **Hanya tampil jika Semester Aktif = GENAP**.
5.  **Bank Soal**: Manajemen master soal.

## 2. Arsitektur Database Baru (Solusi Masalah Parent-Child)

Jangan gunakan konsep "Cloning/Copy" ujian fisik ke setiap kelas yang membuat data duplikat dan sulit diedit massal. Gunakan pendekatan **Master Packet & Assignment**.

### Konsep Entitas:

1.  **ExamPacket (Master Ujian)**:
    - Berisi header ujian (Judul, Deskripsi, KKM, Durasi Default, Instruksi).
    - Berisi daftar soal (relasi ke Bank Soal atau soal spesifik paket ini).
    - Tidak terikat pada tanggal/waktu spesifik, hanya konten ujian.
2.  **ExamSchedule (Jadwal/Assignment)**:
    - Mapping antara `ExamPacket` + `Class` + `Time`.
    - Contoh: Paket "Matematika Dasar X" dijadwalkan untuk:
      - Kelas X-1 (Senin, 08:00 - 10:00)
      - Kelas X-2 (Selasa, 10:00 - 12:00)
    - Token ujian di-generate di level ini.
    - Jika Guru mengedit soal di `ExamPacket`, **semua** kelas yang belum ujian otomatis mendapat update soal tersebut (karena referensinya sama).

## 3. Fitur Pembuatan Soal (Exam Editor)

Buatkan UI Editor Soal yang "Rich" dan interaktif (mirip Google Form / Quizizz tapi lebih advance).

### A. Struktur Halaman Editor

- **Header**: Judul Ujian, Setting (Durasi, KKM, Acak Soal, Acak Opsi).
- **Body**: List Section/Bagian Soal.
- **Sidebar Kanan**: Navigasi nomor soal & Bank Soal Picker.

### B. Fitur Soal (Detail)

Setiap butir soal harus mendukung fitur berikut:

1.  **Tipe Soal**:
    - **Pilihan Ganda (PG)**: Radio button (1 jawaban benar).
    - **Pilihan Ganda Kompleks (PGK)**: Checkbox (Banyak jawaban benar).
    - **Benar / Salah**: Variasi simpel dari PG.
    - **Menjodohkan**: (Opsional, fase 2).
    - **Essay/Uraian**: Input teks panjang.

2.  **Konten Pertanyaan (Question Stem)**:
    - **WYSIWYG Editor**: Bold, Italic, Underline, List.
    - **Support Bahasa Arab (RTL)**:
      - Tombol toggle `Text Direction` (LTR/RTL) di editor.
      - Support font khusus Arab (misal: _Amiri_ atau _Scheherazade_) agar harakat terbaca jelas untuk mapel PABP.
    - **Support Matematika (LaTeX)**:
      - Integrasi **MathJax** atau **KaTeX**.
      - Tombol "Insert Math Formula" yang membuka modal input LaTeX.
      - Live preview rumus saat mengetik (contoh: `\sqrt{\frac{5a^2c}{5b^2d}}`).
    - **Media**:
      - **Gambar**: Upload local / Paste image.
      - **Audio**: Upload file audio (untuk listening Bahasa Inggris).
      - **Video**:
        - Upload video local (mp4).
        - Embed Youtube Link (tampil player otomatis).

3.  **Opsi Jawaban (Answer Options)**:
    - Teks biasa (Support RTL & LaTeX juga di sini).
    - **Gambar di Opsi**: Setiap pilihan A/B/C/D/E bisa berupa gambar (penting untuk soal matematika/biologi).
    - Kunci Jawaban bisa diset dengan klik indikator "Kunci".

4.  **Manajemen Soal**:
    - **Add Section**: Membagi ujian menjadi beberapa sesi (misal: Sesi Listening, Sesi Reading).
    - **Save to Bank**: Checkbox "Simpan ke Bank Soal" saat membuat soal baru.
    - **Pick from Bank**: Tombol untuk mengambil soal yang sudah ada di Bank Soal (Filter by Mapel & Topik).

## 4. Alur Kerja Guru (User Flow)

1.  Guru masuk ke menu **UJIAN** -> **Buat Ujian Baru**.
2.  Isi Info Dasar (Nama Ujian, Kategori: UH/SBTS/SAS).
3.  Masuk ke **Editor Soal** -> Tambah/Import Soal.
4.  Klik **Simpan & Jadwalkan**.
5.  Pilih **Target Kelas** (bisa pilih multiple class: X-1, X-2, X-3).
6.  Set Tanggal & Waktu untuk masing-masing kelas (bisa diset serentak atau beda waktu).
7.  Generate Token.

## 5. Fitur Keamanan & Anti-Curang (Proctoring)
Karena ini adalah Web Application (berjalan di browser biasa), kita tidak bisa melakukan "Total System Lockdown" (memblokir tombol Alt+Tab/Windows secara fisik). Namun, terapkan mekanisme **Detective & Preventive Security**:

1.  **Fullscreen Enforcement**:
    - Siswa **WAJIB** masuk mode Fullscreen untuk melihat soal.
    - Jika siswa keluar dari Fullscreen (tekan ESC), soal otomatis blur/tertutup dan muncul peringatan "Kembali ke mode Fullscreen untuk melanjutkan!".

2.  **Focus Loss Detection (Tab Switching)**:
    - Gunakan `Page Visibility API` dan event `blur`.
    - Jika siswa pindah tab, minimize browser, atau membuka aplikasi lain:
      - Sistem mencatat sebagai **"Pelanggaran"**.
      - Muncul peringatan: "Anda terdeteksi meninggalkan ujian. Pelanggaran tercatat!".
      - Jika pelanggaran > 3 kali (configurable), ujian otomatis **Selesai/Diskualifikasi**.

3.  **Disable Browser Shortcuts**:
    - Block Klik Kanan (`contextmenu`).
    - Block Copy-Paste (`Ctrl+C`, `Ctrl+V`, `Ctrl+X`) pada teks soal.
    - Block `F12` (Inspect Element) sebisa mungkin via JavaScript.

4.  **Device Restriction**:
    - Cegah login ganda (satu akun hanya boleh aktif ujian di satu device).

## 6. Integrasi Nilai

- Setelah ujian selesai, sediakan tombol **"Rekap Nilai"**.
- Sistem otomatis mengoreksi (PG/PGK/BS).
- Guru mengoreksi Essay (jika ada).
- Tombol **"Push to Nilai"**: Mengirim nilai akhir ujian langsung ke modul Input Nilai (sesuai kategori Formatif (Quiz)/SBTS/SAS yang dipilih di awal).

---

**Instruksi Teknis:**

- Gunakan komponen UI modern (Shadcn UI / Tailwind).
- Gunakan `react-quill` atau `tiptap` untuk Rich Text Editor.
- Gunakan library `react-latex-next` atau `katex` untuk rendering matematika.
- Gunakan `screenfull.js` atau Native Fullscreen API untuk manajemen fullscreen.
- Pastikan schema database mendukung relasi One-to-Many antara `ExamPacket` dan `ExamSchedule`.
