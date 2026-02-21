# Day 10 QA Checklist (Internal Pilot)

## Scope
- Fokus validasi MVP mobile terhadap API production/staging.
- Tidak mengubah perilaku aplikasi web.

## Pre-check
- Env sudah terpasang: `EXPO_PUBLIC_API_BASE_URL`.
- Akun uji tersedia: `STUDENT`, `TEACHER`, `ADMIN`.
- Backend dan web dalam status sehat.

## Functional Test
1. Auth
- Login berhasil dengan akun valid.
- Login gagal menampilkan pesan yang tepat.
- Logout menghapus sesi dan kembali ke login.
- App restart memulihkan sesi bila token masih valid.

2. Session Hardening
- Saat token kadaluarsa, user dipaksa login ulang.
- Saat API mengembalikan `401`, sesi dibersihkan otomatis.
- Event auth tercatat di local storage.

3. Navigation
- Gate route berjalan (`/login` dan `/home`).
- Role menu tampil sesuai role.
- Menu dengan route valid membuka halaman yang sesuai.

4. Read-only Data
- Profil (`/profile`) memuat data `me`.
- Jadwal (`/schedule`) memuat data + filter hari + pull-to-refresh.
- Nilai (`/grades`) memuat data siswa + semester filter.
- Absensi (`/attendance`) memuat riwayat + statistik + pindah bulan.

## Error/Edge Case
- Kondisi API down menampilkan state error + retry.
- Kondisi data kosong menampilkan empty state.
- Akun non-student membuka halaman nilai/absensi: tampil pesan pembatasan.

## Device Matrix (Minimum)
- Android 10+
- Android 12+
- Android 14+
- 1 perangkat RAM rendah
- 1 perangkat layar kecil

## Exit Criteria Pilot
- Tidak ada crash blocker.
- Semua alur auth dan 4 halaman utama berjalan.
- Tidak ada data mismatch kritis dibanding web untuk akun uji yang sama.

