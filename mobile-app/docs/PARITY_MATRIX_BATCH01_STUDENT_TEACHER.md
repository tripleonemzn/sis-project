# Web-to-Mobile Parity Matrix (Batch 01)

## Scope Batch
- Role: `STUDENT`, `TEACHER`.
- Target: menyamakan fitur inti web ke mobile tanpa mengubah behavior web production.
- Referensi source web: `frontend/src/App.tsx` + `frontend/src/components/layout/Sidebar.tsx`.

## Guardrail Implementasi
1. Semua perubahan fitur mobile hanya di `mobile-app/`.
2. Backend hanya boleh additive/non-breaking.
3. Endpoint existing web dipakai ulang semaksimal mungkin.
4. Untuk fitur belum siap, tampilkan status "Segera Hadir" (tanpa dead-end/error).

## Snapshot Status Saat Ini (Mobile)
- `DONE`: login, dashboard role-based, profil, jadwal, nilai siswa, absensi siswa, diagnostics.
- `IN_QA`: jadwal untuk role guru (sudah ada route + query, butuh validasi pilot lebih luas).
- `NOT_STARTED`: mayoritas fitur teacher produktif dan fitur student lanjutan (ujian, PKL, materi/tugas, izin, ekskul).

## Matrix - STUDENT
| ID | Feature Web | Route Web | API Endpoint Kunci | Priority | Status | Target Phase | Notes |
|---|---|---|---|---|---|---|---|
| STU-001 | Login | `/login` | `POST /auth/login` | P0 | DONE | Rilis sekarang | Sudah dipakai APK pilot |
| STU-002 | Dashboard siswa | `/student` | `GET /auth/me`, `GET /exams/available`, `GET /attendances/student-history`, `GET /schedules` | P0 | DONE | Rilis sekarang | Ringkasan mobile sudah aktif |
| STU-003 | Profil | `/student/profile` | `GET /auth/me` | P0 | DONE | Rilis sekarang | Dengan fallback cache |
| STU-004 | Jadwal pelajaran | `/student/schedule` | `GET /academic-years/active`, `GET /schedules` | P0 | DONE | Rilis sekarang | Filter hari + refresh |
| STU-005 | Riwayat nilai | `/student/grades` | `GET /grades/student-grades` | P0 | DONE | Rilis sekarang | Filter semester |
| STU-006 | Riwayat kehadiran | `/student/attendance` | `GET /attendances/student-history` | P0 | DONE | Rilis sekarang | Filter bulan |
| STU-007 | Materi & Tugas + submit | `/student/learning` | `GET /materials`, `GET /assignments`, `GET /submissions`, `POST /submissions` | P0 | IN_DEV | Phase 03 | MVP V2 mobile aktif (submit teks + lampiran file) |
| STU-008 | Perizinan siswa | `/student/permissions` | `GET /permissions`, `POST /permissions`, `POST /upload/permission` | P0 | IN_DEV | Phase 03 | MVP V2 mobile aktif (termasuk upload lampiran) |
| STU-009 | Ujian list | `/student/exams/*` | `GET /exams/available` | P0 | IN_DEV | Phase 04 | MVP V1 mobile aktif (list + filter tipe/status) |
| STU-010 | Mengerjakan ujian | `/student/exams/:id/take` | `GET /exams/:id/start`, `POST /exams/:id/answers` | P0 | IN_DEV | Phase 04 | MVP V1 mobile aktif (timer + autosave + final submit) |
| STU-011 | Ekstrakurikuler | `/student/extracurricular` | `GET /student/extracurriculars/my`, `GET /public/extracurriculars`, `POST /student/extracurriculars/enroll` | P1 | NOT_STARTED | Phase 05 | Read-first, enroll second |
| STU-012 | Presensi kelas (ketua kelas) | `/student/class-attendance` | `GET /attendances/daily`, `POST /attendances/daily` | P1 | NOT_STARTED | Phase 05 | Hanya tampil jika `presidentId` match |
| STU-013 | PKL dashboard | `/student/internship/dashboard` | `GET /internships/my-internship`, `POST /internships/apply` | P1 | NOT_STARTED | Phase 06 | Flow apply + status |
| STU-014 | PKL jurnal | `/student/internship/journals` | `GET/POST /internships/:id/journals` | P1 | NOT_STARTED | Phase 06 | Draft + submit |
| STU-015 | PKL absensi | `/student/internship/attendance` | `GET/POST /internships/:id/attendances`, `POST /upload/internship` | P1 | NOT_STARTED | Phase 06 | Include evidence upload |
| STU-016 | PKL laporan | `/student/internship/report` | `POST /internships/:id/report`, `PUT /internships/my-internship` | P1 | NOT_STARTED | Phase 06 | Upload + status approval |
| STU-017 | Administrasi/keuangan | `/student/finance` | TBD | P2 | NOT_STARTED | Backlog | Route web masih placeholder |

## Matrix - TEACHER
| ID | Feature Web | Route Web | API Endpoint Kunci | Priority | Status | Target Phase | Notes |
|---|---|---|---|---|---|---|---|
| TCH-001 | Dashboard guru | `/teacher` | `GET /auth/me`, `GET /teacher-assignments`, `GET /schedules` | P0 | DONE | Rilis sekarang | Dashboard mobile generik sudah aktif |
| TCH-002 | Profil guru | `/teacher/profile` | `GET /auth/me` | P0 | DONE | Rilis sekarang | Sudah tersedia |
| TCH-003 | Jadwal mengajar | `/teacher/schedule` | `GET /academic-years/active`, `GET /schedules?teacherId=` | P0 | IN_QA | Phase 02 | Perlu pilot data real guru |
| TCH-004 | Kelas & mapel | `/teacher/classes` | `GET /teacher-assignments`, `GET /classes/:id` | P0 | IN_DEV | Phase 02 | MVP V1 mobile sudah tersedia, lanjut QA role guru |
| TCH-005 | Presensi siswa | `/teacher/attendance*` | `GET /attendances/subject`, `POST /attendances/subject` | P0 | IN_DEV | Phase 02 | MVP V1 mobile sudah tersedia, lanjut QA role guru |
| TCH-006 | Input nilai | `/teacher/grades` | `GET /grades/components`, `GET /grades/student-grades`, `POST /grades/student-grades/bulk` | P0 | IN_DEV | Phase 03 | MVP V1 mobile aktif (input & simpan bulk) |
| TCH-007 | Rapor mapel | `/teacher/report-subjects` | `GET /grades/report-grades` | P0 | IN_DEV | Phase 03 | MVP V1 mobile aktif (read-only rekap nilai) |
| TCH-008 | Materi pembelajaran | `/teacher/materials` (tab materi) | `GET/POST/PUT/DELETE /materials` | P0 | IN_DEV | Phase 04 | MVP V1 mobile aktif (list/create/publish/delete) |
| TCH-009 | Tugas & PR | `/teacher/materials` (tab tugas) | `GET/POST/PUT/DELETE /assignments` | P0 | IN_DEV | Phase 04 | MVP V1 mobile aktif (list/create/publish/delete) |
| TCH-010 | Daftar ujian | `/teacher/exams/*` | `GET /exams/packets` | P0 | IN_DEV | Phase 05 | MVP V1 mobile aktif (list + filter mapel/tipe) |
| TCH-011 | Editor ujian | `/teacher/exams/create|:id/edit` | `POST /exams/packets`, `PUT /exams/packets/:id`, `GET /exams/questions` | P1 | IN_DEV | Phase 05 | MVP V1 mobile aktif (create/edit packet + validasi soal dasar) |
| TCH-012 | Jadwal ujian | `/teacher/exams/:id/schedule` | `POST /exams/schedules`, `GET /exams/schedules` | P1 | NOT_STARTED | Phase 05 | Buat sesi untuk kelas |
| TCH-013 | Jadwal mengawas | `/teacher/proctoring` | `GET /exams/schedules` | P1 | NOT_STARTED | Phase 06 | List jadwal proktor |
| TCH-014 | Monitoring proktor | `/teacher/proctoring/:id` | `GET /proctoring/schedules/:id`, `POST /proctoring/schedules/:id/report` | P1 | NOT_STARTED | Phase 06 | Live monitoring ringkas |
| TCH-015 | Perangkat ajar (CP/ATP/Modul) | `/teacher/learning-resources/*` | `GET/POST /cp-tp-analyses` (+ endpoint terkait user/assignment) | P1 | NOT_STARTED | Phase 07 | Tahap awal read-only dulu |
| TCH-016 | Wali kelas (rekap/izin/perilaku/rapor) | `/teacher/wali-kelas/*` | `GET /attendances/daily*`, `GET/PATCH /permissions*`, `GET /reports/*`, `GET/PUT /exams/restrictions` | P1 | NOT_STARTED | Phase 07 | Modul gabungan, dipecah sub-sprint |
| TCH-017 | PKL guru (approval/guidance/defense) | `/teacher/internship/*` | `GET /internships/all`, `PATCH /internships/:id/status`, `GET/POST journals/attendances`, `POST /internships/:id/grade-defense` | P1 | NOT_STARTED | Phase 08 | Prioritas setelah akademik inti |
| TCH-018 | Duty khusus (wakasek/sarpras/humas/kaprog) | `/teacher/wakasek/*`, `/teacher/sarpras/*`, dst | Multi-endpoint (inventory/work-program/humas/budget) | P2 | NOT_STARTED | Backlog | Butuh role-duty matrix detail |

## Rencana Eksekusi Ringkas
1. Phase 02 (2 sprint):
   - Tutup gap P0 teacher dasar: `classes`, `attendance`, validasi `schedule`.
2. Phase 03 (2 sprint):
   - Tutup gap P0 student/teacher akademik: student `learning + permissions`, teacher `grades + subject report`.
3. Phase 04-05 (2 sprint):
   - Tutup gap ujian: student ujian + teacher exam management inti.
4. Phase 06+:
   - Proctoring, PKL, modul duty khusus berdasarkan prioritas operasional sekolah.

## Exit Criteria Batch 01
1. Semua item P0 pada tabel `STUDENT` dan `TEACHER` minimal status `IN_QA`.
2. Tidak ada perubahan breaking pada endpoint web existing.
3. QA pilot lulus pada skenario online lambat + offline sementara.
4. Release note dan checksum setiap build internal selalu tersedia.
