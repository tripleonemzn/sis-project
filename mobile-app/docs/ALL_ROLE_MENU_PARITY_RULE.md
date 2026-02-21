# Aturan Parity Menu Semua Role (Web -> Mobile)

## Tujuan
- Mulai fase ini, setiap menu role di web harus tetap bisa diakses dari mobile.
- Jika modul native mobile belum tersedia, mobile wajib menyediakan fallback ke modul web.

## Aturan Implementasi
1. Untuk menu yang sudah native:
   - gunakan `route` internal mobile.
2. Untuk menu yang belum native:
   - isi `webPath` pada `mobile-app/src/features/dashboard/roleMenu.ts`.
   - menu akan membuka modul web pada domain yang sama.
3. Menu tanpa `route` dan tanpa `webPath` tidak boleh ditambahkan.
4. Saat modul native selesai, ganti dari `webPath` ke `route` native.
5. Integritas menu divalidasi otomatis saat development (anti key duplikat dan anti path invalid).

## Definisi Status Parity
- `NATIVE`: fitur tersedia penuh di aplikasi mobile.
- `WEB_FALLBACK`: fitur dibuka ke halaman web dari aplikasi mobile.
- `PLANNED`: belum tersedia (tidak boleh dipakai untuk menu production).

## Checklist Saat Tambah Fitur Web Baru
1. Tambah entry parity di dokumen/matrix.
2. Tambah item menu mobile (`route` atau `webPath`).
3. Uji smoke test Android dan iOS.
4. Publish OTA jika perubahan non-native.

## Catatan
- Aturan ini menjaga integrasi lintas platform tanpa mengganggu web production.
- Prioritas tetap: modul P0 dipindah ke `NATIVE` secara bertahap.
