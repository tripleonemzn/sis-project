# Parity Audit - Input Nilai & Profile (2026-02-20)

## Source of Truth (Web)
- `frontend/src/pages/teacher/TeacherGradesPage.tsx`
- `frontend/src/pages/common/UserProfilePage.tsx`
- `frontend/src/components/layout/Sidebar.tsx`

## Mobile Target
- `mobile-app/app/(app)/teacher/grades.tsx`
- `mobile-app/app/(app)/profile.tsx`
- `mobile-app/src/features/dashboard/roleMenu.ts`

## Temuan Real (Sebelum Perbaikan)
1. Input Nilai mobile masih auto-assign semester `Ganjil`, sehingga user bisa memilih kelas/mapel sebelum semester.
2. Input Nilai mobile belum menampilkan dua rerata formatif seperti web:
   - `Rerata SBTS (NF1-3)`
   - `Rerata SAS (NF1-6)`
3. Form Profile mobile hanya memuat subset kecil field (`name/email/phone/address`), sedangkan web memakai field role-specific yang jauh lebih lengkap.

## Perbaikan Yang Diimplementasikan
1. Alur Input Nilai disamakan dengan web:
   - Semester default kosong.
   - Kelas & mapel tidak bisa dipilih sebelum semester.
   - Komponen tidak bisa dipilih sebelum kelas & mapel.
   - Saat semester berubah, pilihan kelas/mapel + komponen di-reset.
2. Kartu Formatif mobile menampilkan dua rerata:
   - `Rerata SBTS (NF1-3)`
   - `Rerata SAS (NF1-6)`
3. Form Profile mobile diperluas mengikuti field web dan backend update schema:
   - Data akun, data pribadi, data kontak, data orang tua/wali (student), data kepegawaian (role terkait).
   - Payload update profile mencakup field scalar penting yang sama dengan web.
4. Untuk fitur media profile (upload foto/dokumen), mobile menyediakan akses ke modul web profile berdasarkan role agar alur production tetap sama.

## Validasi Teknis
- Type check lulus: `npm run typecheck` (mobile-app).

## Catatan Lanjutan
- Upload foto/dokumen profile masih menggunakan web-module (belum native upload flow).
- Setelah perubahan batch ini stabil di tester, lanjut audit parity modul mutasi lain per role dengan pola yang sama (source-of-truth web -> mobile).
