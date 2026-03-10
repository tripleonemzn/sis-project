# Template Task Pengembangan (Dynamic + Parity 1:1)

Gunakan template ini untuk setiap task baru agar pengembangan tetap konsisten, cepat, dan aman di production.

---

## 1) Identitas Task

- `Task ID`: 
- `Fitur`:
- `Role terdampak`: 
- `Platform`: `Web` / `Mobile` / `Backend` / `Semua`
- `PIC`:
- `Tanggal`:

---

## 2) Tujuan Bisnis

- Masalah yang diselesaikan:
- Outcome yang diharapkan user:
- Kriteria selesai (bahasa bisnis):

---

## 3) Ruang Lingkup Teknis

### In Scope
- 
- 

### Out of Scope
- 
- 

---

## 4) Standard Dynamic (Wajib)

Checklist wajib centang:

- [ ] Tidak hardcode label/tipe/slot yang harusnya dari database/config.
- [ ] Semua dropdown/sumber data pakai endpoint/config aktif.
- [ ] Logic role + duty pakai scope yang benar (`DEFAULT` vs `CURRICULUM`/lainnya).
- [ ] Jika menyentuh area lama yang belum dinamis, lakukan `touch-and-fix` pada area terkait.
- [ ] Tidak menambah fallback legacy baru tanpa alasan kompatibilitas yang jelas.

Catatan desain dynamic untuk task ini:
- Sumber konfigurasi utama:
- Fallback yang masih diizinkan:
- Rencana migrasi legacy (jika ada):

---

## 5) Standard Parity Web-Mobile (Wajib)

Checklist wajib centang:

- [ ] Fitur tersedia di web dan mobile untuk role yang sama.
- [ ] Urutan menu, label, dan status utama konsisten.
- [ ] CRUD yang ada di web tersedia versi mobile (dan sebaliknya jika relevan).
- [ ] Validasi input dan pesan error setara.
- [ ] Data sinkron: hasil aksi di web/mobile merefleksikan sumber data yang sama.

Catatan parity:
- Perbedaan UI yang memang disengaja:
- Perbedaan karena limit platform:

---

## 6) Dampak & Risiko

- File/area yang terdampak:
- Risiko regresi:
- Mitigasi:
- Data production yang sensitif:

---

## 7) Rencana Implementasi (Step-by-step)

1. 
2. 
3. 
4. 

---

## 8) Verifikasi Teknis (Wajib)

Jalankan dan lampirkan hasil:

- [ ] `cd backend && npm run build`
- [ ] `cd frontend && npm run build`
- [ ] `cd /var/www/sis-project && bash ./update_all.sh`

Jika ada perubahan mobile untuk tester:

- [ ] `cd /var/www/sis-project/mobile-app && bash ./scripts/publish-ota-update.sh pilot "<release note>"`
- [ ] Catat `OTA Update ID`:

---

## 9) QA Fungsional (Wajib)

Skenario uji minimal:

1. `Happy path`:
2. `Validation/error path`:
3. `Role unauthorized path`:
4. `Cross-platform parity check (web vs mobile)`:
5. `Data consistency check (refresh/relogin)`:

Hasil:
- `PASS/FAIL` + catatan:

---

## 10) Laporan Akhir (Format Standar)

### Ringkasan Perubahan
- 

### File yang Diubah
- `path/file1`
- `path/file2`

### Hasil Verifikasi
- Backend build:
- Frontend build:
- update_all:
- OTA (jika ada):

### Status Dynamic + Parity
- Dynamic: `xx%` (jelaskan gap tersisa jika belum 100%)
- Parity Web-Mobile: `xx%` (jelaskan gap tersisa jika belum 100%)

### Next Action
1. 
2. 

---

## 11) Aturan Kerja Cepat (Anti Berlarut)

- Fokus selesaikan 1 flow end-to-end per batch.
- Hindari refactor besar di luar scope task aktif.
- Jika blocker > 30 menit, catat akar masalah + workaround, lalu lanjut batch berikutnya.
- Jangan merge/publish sebelum checklist verifikasi inti lulus.
