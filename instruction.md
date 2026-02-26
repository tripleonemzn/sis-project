# Instruction for New Chat (SIS KGB2)

## Tujuan Utama
Pastikan pengembangan selalu **hybrid 1:1** antara web dan mobile:
- Apa pun yang bisa dilakukan di web harus bisa dilakukan di mobile.
- Berlaku untuk semua role dan semua fitur (akses, alur, CRUD, urutan menu, label, status data).

## Prinsip Wajib
1. Jangan membuat fitur hanya di satu platform.
2. Jika menemukan gap web vs mobile, langsung perbaiki pada task yang sama.
3. Utamakan keamanan production (hindari perubahan berisiko tanpa verifikasi).
4. Jangan rollback perubahan lain yang tidak diminta user.
5. Repo saat ini masih banyak perubahan lintas fitur (dirty), jadi edit hanya area yang relevan.

## Alur Kerja Wajib Setiap Task
1. Audit cepat fitur terkait di web + mobile + backend API.
2. Implementasi parity web dan mobile sekaligus (jika berdampak keduanya).
3. Verifikasi teknis minimal:
   - `cd backend && npm run build`
   - `cd frontend && npm run build`
   - `cd /var/www/sis-project && bash ./update_all.sh`
4. Jika ada perubahan mobile app yang perlu dirilis tester:
   - `cd /var/www/sis-project/mobile-app`
   - `bash ./scripts/publish-ota-update.sh pilot "<release note>"`
5. Laporkan hasil dengan format:
   - apa yang diubah,
   - file yang disentuh,
   - hasil verifikasi,
   - status parity web vs mobile.

## Konteks Terbaru (per 23 Februari 2026)
Perubahan area Kepala Perpustakaan sudah diterapkan:
- Style tab disamakan dengan pola tab Aset Sekolah.
- Sidebar detail inventaris tetap terdeteksi aktif.
- Form tambah peminjaman buku menjadi popup modal.
- Dropdown kelas pada peminjaman sudah searchable.
- Aksi tabel peminjaman icon-only (edit/hapus + tandai kembali).
- Status peminjaman lebih logis:
  - saat simpan: Dipinjam,
  - lewat tenggat: Terlambat,
  - saat konfirmasi: Dikembalikan.
- Filter status ditambahkan (Semua/Dipinjam/Terlambat/Dikembalikan).
- Inventaris perpustakaan: `kode rak` diganti menjadi `kategori` dinamis.
- Kategori buku bisa ditambah dinamis dari form.
- Tampilan kelas peminjaman: cukup nama kelas, tanpa suffix jurusan.

Backend terkait peminjaman perpustakaan:
- Penambahan tracking peminjam terhubung user (`borrowerUserId`).
- Penambahan tracking reminder overdue (`overdueNotifiedAt`).
- Reminder overdue + notifikasi push berjalan periodik via worker backend.

## Prompt Siap Pakai untuk Chat Baru
Gunakan prompt berikut di chat baru:

"Lanjutkan pengembangan SIS KGB2 dengan prinsip hybrid 1:1 parity web-mobile untuk semua role dan fitur. Mulai dengan audit gap pada fitur yang sedang saya minta, lalu implementasi di web + mobile + backend secara konsisten. Jangan rollback perubahan lain yang tidak relevan. Setelah coding, wajib jalankan `backend build`, `frontend build`, lalu `bash ./update_all.sh`. Jika ada perubahan mobile yang siap tester, lanjut publish OTA ke channel pilot dan laporkan update ID + ringkasan perubahan + status parity."

## Catatan Penting
- OTA terakhir berhasil dipublish ke branch `pilot` pada 23 Februari 2026.
- Jika notifikasi OTA tidak terkirim ke device, cek registrasi token pada `mobile_push_devices`.
- Jika ada perubahan schema Prisma, pastikan migration tercatat dan client tergenerate.
