# Web-to-Mobile Parity Matrix (Template)

## Tujuan
Template ini dipakai untuk melacak progres agar setiap fitur web memiliki padanan di mobile tanpa mengganggu production web.

## Cara Pakai
1. Duplikat tabel ini menjadi dokumen kerja sprint (mis. `PARITY_MATRIX_SPRINT_01.md`).
2. Isi semua fitur web per role.
3. Prioritaskan berdasarkan dampak user (`P0`, `P1`, `P2`).
4. Update status harian saat implementasi berjalan.

## Legend
- Priority:
  - `P0` = wajib untuk operasional harian
  - `P1` = penting, bisa menyusul setelah P0
  - `P2` = nice-to-have / optimasi
- Status:
  - `NOT_STARTED`
  - `IN_ANALYSIS`
  - `IN_DEV`
  - `IN_QA`
  - `DONE`
  - `BLOCKED`

## Tabel Parity
| ID | Role | Feature Web | Mobile Screen | API Endpoint | Priority | Status | Owner | Dependencies | QA Checklist | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| STU-001 | STUDENT | Login | Login Screen | `POST /auth/login` | P0 | DONE | Mobile | Auth API | Login success/failed | |
| STU-002 | STUDENT | Dashboard | Home Screen | `GET /auth/me` | P0 | DONE | Mobile | Session restore | Role menu sesuai | |
| STU-003 | STUDENT | Jadwal | Schedule Screen | `GET /schedules` | P0 | DONE | Mobile | Academic year active | Filter hari + refresh | |
| STU-004 | STUDENT | Nilai | Grades Screen | `GET /grades/student-grades` | P0 | DONE | Mobile | Student role | Filter semester | |
| STU-005 | STUDENT | Absensi | Attendance Screen | `GET /attendances/student-history` | P0 | DONE | Mobile | Student role | Navigasi bulan | |
| TCH-001 | TEACHER | Absensi Kelas | TBD | TBD | P0 | NOT_STARTED | Mobile + Backend | Role guard | CRUD + validasi | |
| TCH-002 | TEACHER | Input Nilai | TBD | TBD | P0 | NOT_STARTED | Mobile + Backend | Grade component | Simpan + edit + finalisasi | |
| ADM-001 | ADMIN | Manajemen User | TBD | TBD | P1 | NOT_STARTED | Mobile + Backend | Permission matrix | Create/update/deactivate | |

## Definition of Done per Feature
1. API contract stabil dan backward-compatible ke web.
2. Role authorization sesuai web.
3. Loading/error/empty state lengkap.
4. Offline fallback terdefinisi (jika berlaku).
5. Lolos uji QA lintas device minimal 3 variasi.
6. Termasuk dalam release note internal.

## Sprint Tracking
| Sprint | Fokus Role | Target Feature | Done | Blocked | Catatan |
|---|---|---|---|---|---|
| Sprint-01 | STUDENT | 10 | 0 | 0 | |
| Sprint-02 | TEACHER | 12 | 0 | 0 | |
| Sprint-03 | ADMIN | 8 | 0 | 0 | |

