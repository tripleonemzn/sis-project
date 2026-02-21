# Parity Gap Audit (Web vs Mobile) - 2026-02-20

## Prinsip Audit
- Source of truth: implementasi web production.
- Mobile dianggap belum parity jika:
  - alur filter/aksi berbeda dari web,
  - field CRUD berbeda dari web,
  - screen hanya ringkasan + tombol ke web.

## Gap Yang Ditemukan
1. `Input Nilai` mobile:
   - semester default tidak kosong,
   - kelas/mapel bisa dipilih sebelum semester,
   - rerata formatif belum lengkap (`NF1-3` dan `NF1-6`).
2. `Profile` mobile:
   - field editable belum selengkap web (role-specific),
   - upload foto/dokumen belum native.
3. Banyak menu duty guru masih hybrid ringkasan (native ringkas + tombol buka web), sehingga UX berbeda dari web.

## Perbaikan Yang Sudah Diterapkan
1. `Input Nilai` disamakan dengan web:
   - semester wajib dipilih dulu,
   - reset assignment+komponen saat semester berubah,
   - formatif menampilkan `Rerata SBTS (NF1-3)` dan `Rerata SAS (NF1-6)`.
2. `Profile` disamakan dengan web (field utama):
   - data akun/pribadi/kontak/orang tua-wali/kepegawaian,
   - upload foto native (`/upload/teacher/photo`) + simpan ke profil,
   - upload dokumen native (`/upload/teacher/document`) + sinkron metadata dokumen.
3. `Strict Web Parity` diaktifkan untuk menu yang belum parity native penuh:
   - route dipaksa ke `/web-module/:key` agar modul web yang sama langsung dipakai.
   - daftar key strict parity didefinisikan di `mobile-app/src/features/dashboard/roleMenu.ts`.
4. `web-module` sekarang auto-open:
   - saat menu dibuka, link web langsung dijalankan (tanpa tambahan alur manual).
5. Ekspansi `Strict Web Parity` lanjutan:
   - menu `TEACHER` operasional yang sebelumnya native/hybrid (`jadwal`, `kelas & mapel`, `presensi`, `materi`, `nilai`, `rapor mapel`, `wali kelas`) dipaksa ke `/web-module/:key` agar alur identik web.
   - menu `STUDENT` operasional (`jadwal`, `materi`, `riwayat kehadiran`, `perizinan`, `riwayat nilai`) dipaksa ke `/web-module/:key`.
   - menu `PRINCIPAL` operasional (`rapor & ranking`, `rekap absensi`, `pengajuan anggaran`) dipaksa ke `/web-module/:key`.
   - menu `STAFF` (`pembayaran`, `data siswa`) dan `PARENT` (`data anak`, `keuangan`, `absensi anak`) dipaksa ke `/web-module/:key`.
6. Penutupan sinkronisasi final:
   - seluruh sisa menu role-specific yang sebelumnya native (`dashboard/profile` pada role tertentu) dipaksa ke `/web-module/:key`.
   - shortcut profil pada `home` diarahkan ke web-module sesuai role agar alur konsisten.

## Dampak
- Perbedaan alur yang membingungkan (native ringkasan vs web lengkap) dikurangi signifikan.
- User mobile langsung masuk ke modul web yang identik untuk area yang belum parity native 100%.
- Seluruh menu role-specific saat ini sudah menggunakan pola `web-module` (strict parity ke web).

## Validasi
- `npm run typecheck` lulus pada `mobile-app`.
