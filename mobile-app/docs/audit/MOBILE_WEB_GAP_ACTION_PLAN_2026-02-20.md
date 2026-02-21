# Mobile Web Gap Action Plan (All Roles)

Generated from:
- `docs/audit/mobile_parity_audit_latest.json`
- `docs/audit/mobile_parity_audit_latest.md`

Date: 20 February 2026

## Kondisi Saat Ini

- Total menu role-specific: **130**
- Menu yang masih web-bridge (`/web-module/*`): **53**
- Menu native yang masih punya fallback aksi `openURL` ke web: **77**
- Route tree native yang terdeteksi masih memanggil `Linking.openURL`: **60**

## Gap per Role

| Role | Total | Web-Bridge | Native + Web Fallback | Catatan |
| --- | ---: | ---: | ---: | --- |
| ADMIN | 29 | 29 | 0 | Semua menu masih bridge ke web |
| STUDENT | 18 | 12 | 6 | PKL, ujian, keuangan, dashboard masih bridge |
| PRINCIPAL | 6 | 2 | 4 | Data siswa/guru masih bridge |
| STAFF | 4 | 2 | 2 | Dashboard + administrasi masih bridge |
| PARENT | 4 | 1 | 3 | Dashboard masih bridge |
| EXAMINER | 4 | 1 | 3 | Dashboard masih bridge |
| EXTRACURRICULAR_TUTOR | 3 | 2 | 1 | Dashboard + anggota masih bridge |
| CALON_SISWA | 2 | 2 | 0 | Full web bridge |
| UMUM | 2 | 2 | 0 | Full web bridge |
| TEACHER | 58 | 0 | 58 | Route native ada, namun banyak fallback `openURL` |

## Prioritas Eksekusi (No-Assumption)

1. **P0 - Hapus ketergantungan web untuk role operasional harian**
   - Target role: `STUDENT`, `STAFF`, `PARENT`, `PRINCIPAL`, `EXAMINER`.
   - Sasaran: web-bridge turun drastis untuk menu yang paling sering dipakai harian.

2. **P0 - Bersihkan fallback web di route native guru**
   - Fokus file yang saat ini masih memanggil `Linking.openURL`:
   - `app/(app)/teacher/materials.tsx`
   - `app/(app)/teacher/homeroom-behavior.tsx`
   - `app/(app)/teacher/homeroom-permissions.tsx`
   - `app/(app)/teacher/wakakur-curriculum.tsx`
   - `app/(app)/teacher/wakakur-exams.tsx`
   - `app/(app)/teacher/wakakur-performance.tsx`
   - `app/(app)/teacher/wakasis-students.tsx`
   - `app/(app)/teacher/wakasis-performance.tsx`
   - `app/(app)/teacher/wakasis-approvals.tsx`
   - `app/(app)/teacher/wakasis-reports.tsx`
   - `app/(app)/teacher/sarpras-inventory.tsx`
   - `app/(app)/teacher/sarpras-budgets.tsx`
   - `app/(app)/teacher/sarpras-reports.tsx`
   - `app/(app)/teacher/proctoring/index.tsx`
   - `src/features/*` bridge modules (learning resources, humas, exams packets, head program, homeroom reports, work program).

3. **P1 - Konversi bridge ADMIN menjadi native modular**
   - `admin/master-data.tsx`, `admin/user-management.tsx`, `admin/academic.tsx` dijadikan basis.
   - Tambah mode CRUD sesuai behavior web, bukan ringkasan read-only.

4. **P1 - Konversi bridge STUDENT**
   - Dashboard siswa native.
   - Ujian type-specific native (formatif/SBTS/SAS/SAT) tanpa keluar ke web.
   - PKL native (dashboard/jurnal/absensi/laporan).

5. **P2 - Role publik/non-login (`UMUM`, `CALON_SISWA`)**
   - Tentukan apakah tetap webview/native full.
   - Untuk target “full mobile native”, butuh modul onboarding + PPDB native.

## Rule Eksekusi Berikutnya

- Dilarang menambah fallback baru ke web.
- Setiap menu yang diubah wajib diverifikasi parity:
  - Nama menu/submenu sama seperti web.
  - Input/edit/save/delete sama seperti web.
  - Urutan filter/form sama seperti web (contoh: semester -> kelas/mapel -> komponen).
- Jalankan audit ulang setelah setiap batch:
  - `npm run audit:parity`

