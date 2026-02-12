# STANDAR BAKU PEMBUATAN MODUL PERANGKAT AJAR

**STATUS: WAJIB & MENGIKAT**
Dokumen ini adalah REFERENSI MUTLAK untuk pengembangan seluruh modul perangkat ajar (ATP, Program Tahunan, Program Semester, Modul Ajar, dll) di dalam sistem ini. 

Setiap baris kode yang Anda tulis WAJIB mematuhi standar yang telah terbukti berhasil di modul **Capaian Pembelajaran (CP)**. Penyimpangan dari standar ini tanpa alasan krusial dianggap sebagai **KEGAGALAN IMPLEMENTASI** dan membuang-buang waktu.

---

## 1. PRINSIP "ZERO WASTE TIME"
- **JANGAN BUAT DESAIN BARU!** Copy-paste struktur layout dan logika dari `CpPage.tsx`.
- **FOKUS FUNGSIONALITAS:** Jangan habiskan waktu untuk eksperimen UI. Gunakan komponen yang sudah ada.
- **KONSISTENSI MUTLAK:** User tidak boleh merasakan perbedaan pengalaman (UX) antara satu menu perangkat ajar dengan yang lain.

## 2. STANDAR UX & INTERFACE (WAJIB)
Setiap halaman perangkat ajar HARUS memiliki elemen-elemen berikut:

### A. Context-First Approach
- **Wajib Pilih Konteks:** User HARUS memilih Mata Pelajaran & Kelas terlebih dahulu sebelum form input aktif.
- **Disabled State:** Input form dan tombol aksi harus dalam keadaan *disabled* (abu-abu) jika konteks belum dipilih.
- **Validasi:** Tampilkan alert keras jika user mencoba aksi tanpa memilih konteks.

### B. Tab Separation (Editor vs Preview)
- **Mode Editor:** Fokus pada input data (Form, Table Input, CRUD).
- **Mode Preview:** Fokus pada visualisasi hasil cetak. Tampilan di layar harus 100% identik dengan hasil cetak kertas.

### C. Sticky Headers
- **Main Header:** Judul halaman dan tab navigasi WAJIB *sticky* di `top-0`.
- **Sub-Header:** Toolbar di mode Preview (Info Total Data & Tombol Print) WAJIB *sticky* di bawah Main Header (biasanya `top-[100px]`).

### D. Data Persistence (WAJIB DATABASE)
- **Storage:** Data WAJIB disimpan secara PERMANEN di Database Server (Backend), BUKAN di Local Storage browser.
- **API Integration:** Setiap perubahan (Create/Update/Delete) harus langsung terhubung ke endpoint API yang sesuai.
- **Data Security:** Pastikan data aman dan tidak hilang jika user berganti perangkat atau membersihkan cache browser.
- **Feedback:** Berikan indikator visual (Loading/Success/Error) saat proses penyimpanan ke server berlangsung.

## 3. STANDAR TEKNIS CETAK / PRINT (HARGA MATI)
DILARANG KERAS menggunakan metode lama (window.open/tab baru) atau CSS global sembarangan. Ikuti standar `CpPage.tsx` + `CpAnalysisDocument.tsx`:

1.  **Metode Isolasi (Hidden Iframe Portal):**
    - Proses cetak dilakukan di balik layar menggunakan Iframe tersembunyi.
    - User tetap di halaman yang sama, dialog print muncul otomatis.
    - **DILARANG** membuka tab baru hanya untuk print.

2.  **Komponen Dokumen Terpisah:**
    - Buat komponen UI khusus untuk cetak (misal: `AtpDocument.tsx`) yang terpisah dari logika halaman utama.
    - Komponen ini hanya menerima `props` data jadi, tanpa `useState` atau `useEffect` yang kompleks.

3.  **CSS Print Reset:**
    - Gunakan CSS `@media print` untuk menyembunyikan elemen UI aplikasi (Sidebar, Navbar).
    - Pastikan `body { visibility: visible !important; }` pada iframe cetak untuk meng-override style global yang menyembunyikan konten.
    - Gunakan ukuran kertas yang spesifik (A4 Portrait/Landscape) sesuai kebutuhan dokumen.

4.  **Feedback UX:**
    - Tombol print harus memiliki *loading state* ("Menyiapkan...") dan disable sementara saat proses render iframe berlangsung.

## 4. STRUKTUR KODE & BEST PRACTICES
- **TypeScript:** Definisikan `interface` tipe data dengan jelas. Dilarang menggunakan `any` untuk data inti.
- **Clean Code:** Hapus `console.log` debugging sebelum commit.
- **Error Handling:** Pastikan aplikasi tidak crash jika data `localStorage` rusak (gunakan `try-catch` saat parsing JSON).

---

**PATUHI ATURAN INI.** 
Waktu pengembangan sangat berharga. Mengikuti standar ini akan mempercepat kerja Anda hingga 300% karena tidak perlu memikirkan ulang logika dasar.
