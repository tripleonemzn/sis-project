# Menu UX Parity Trace (2026-02-19)

> Update 2026-02-20:
> - Modul `Input Nilai` mobile sudah mengikuti flow web untuk gating semester dan rerata formatif (`NF1-3` + `NF1-6`).
> - Modul `Profile` mobile tidak lagi read-only; field role-specific utama sudah dapat diedit dan disimpan.
> - Detail implementasi: `mobile-app/docs/PARITY_AUDIT_2026-02-20_INPUT_NILAI_PROFILE.md`.

Dokumen ini adalah hasil telusur menu web vs mobile untuk memastikan konsep mobile tetap simple seperti web.

## Ringkasan Global
- Total menu role-specific: **130**
- Native-only: **0**
- Hybrid (route + webPath): **77**
- Web-bridge (hanya webPath): **53**
- Screen dengan aksi mutasi (edit/create/update/delete terdeteksi): **13**
- Screen non-mutating/read-only: **117**

## Ringkasan Per Role
| Role | Total | Native | Hybrid | Web-Bridge | Mutating | Read-Only |
|---|---:|---:|---:|---:|---:|---:|
| STUDENT | 18 | 0 | 6 | 12 | 2 | 16 |
| TEACHER | 58 | 0 | 58 | 0 | 9 | 49 |
| ADMIN | 29 | 0 | 0 | 29 | 0 | 29 |
| EXAMINER | 4 | 0 | 3 | 1 | 0 | 4 |
| PRINCIPAL | 6 | 0 | 4 | 2 | 1 | 5 |
| STAFF | 4 | 0 | 2 | 2 | 1 | 3 |
| PARENT | 4 | 0 | 3 | 1 | 0 | 4 |
| CALON_SISWA | 2 | 0 | 0 | 2 | 0 | 2 |
| UMUM | 2 | 0 | 0 | 2 | 0 | 2 |
| EXTRACURRICULAR_TUTOR | 3 | 0 | 1 | 2 | 0 | 3 |

## Menu Yang Masih Web-Bridge (belum native)
### STUDENT (12)
- Dashboard (`student-dashboard`) -> `/student`
- Ekstrakurikuler (`student-extracurricular`) -> `/student/extracurricular`
- Presensi Kelas (`student-class-attendance`) -> `/student/class-attendance`
- Dashboard PKL (`student-pkl-dashboard`) -> `/student/internship/dashboard`
- Jurnal Harian (`student-pkl-journal`) -> `/student/internship/journals`
- Absensi PKL (`student-pkl-attendance`) -> `/student/internship/attendance`
- Laporan PKL (`student-pkl-report`) -> `/student/internship/report`
- Formatif (Quiz) (`student-exam-formatif`) -> `/student/exams/formatif`
- SBTS (`student-exam-sbts`) -> `/student/exams/sbts`
- SAS (`student-exam-sas`) -> `/student/exams/sas`
- SAT (`student-exam-sat`) -> `/student/exams/sat`
- Keuangan (`student-finance`) -> `/student/finance`

### ADMIN (29)
- Dashboard (`admin-dashboard`) -> `/admin`
- Tahun Ajaran (`admin-academic-years`) -> `/admin/academic-years`
- Kompetensi Keahlian (`admin-majors`) -> `/admin/majors`
- Kelas (`admin-classes`) -> `/admin/classes`
- Kelas Training (`admin-training-classes`) -> `/admin/training-classes`
- Mata Pelajaran (`admin-subjects`) -> `/admin/subjects`
- Kategori Mapel (`admin-subject-categories`) -> `/admin/subject-categories`
- Ekstrakurikuler (`admin-extracurriculars`) -> `/admin/extracurriculars`
- Kelola Admin (`admin-user-admin`) -> `/admin/admin-users`
- Kelola Kepsek (`admin-user-principal`) -> `/admin/principal-users`
- Kelola Staff (`admin-user-staff`) -> `/admin/staff-users`
- Kelola Penguji (`admin-user-examiner`) -> `/admin/examiner-users`
- Kelola Pembina Ekskul (`admin-user-tutor`) -> `/admin/tutor-users`
- Kelola Orang Tua (`admin-user-parent`) -> `/admin/parent-users`
- Kelola Guru (`admin-user-teacher`) -> `/admin/teachers`
- Kelola Siswa (`admin-user-student`) -> `/admin/students`
- Verifikasi Akun (`admin-user-verify`) -> `/admin/user-verification`
- Assignment Guru (`admin-teacher-assignment`) -> `/admin/teacher-assignments`
- Export/Import (`admin-import-export`) -> `/admin/import-export`
- Kalender Akademik (`admin-academic-calendar`) -> `/admin/academic-calendar`
- Jadwal Pelajaran (`admin-schedule`) -> `/admin/schedule`
- Rekap Jam Mengajar (`admin-teaching-load`) -> `/admin/teaching-load`
- Data KKM (`admin-kkm`) -> `/admin/kkm`
- Rekap Absensi (`admin-attendance-recap`) -> `/admin/attendance`
- Laporan / Rapor (`admin-report-cards`) -> `/admin/report-cards`
- Bank Soal (`admin-question-bank`) -> `/admin/question-bank`
- Sesi Ujian (`admin-exam-sessions`) -> `/admin/exam-sessions`
- Profil Sekolah (`admin-school-profile`) -> `/admin/settings/profile`
- Ubah Password (`admin-password`) -> `/admin/settings/password`

### EXAMINER (1)
- Dashboard (`examiner-dashboard`) -> `/examiner/dashboard`

### PRINCIPAL (2)
- Data Siswa (`principal-students`) -> `/principal/students`
- Data Guru (`principal-teachers`) -> `/principal/teachers`

### STAFF (2)
- Dashboard (`staff-dashboard`) -> `/staff`
- Administrasi (`staff-admin`) -> `/staff/admin`

### PARENT (1)
- Dashboard (`parent-dashboard`) -> `/parent`

### CALON_SISWA (2)
- Status Pendaftaran (`candidate-application`) -> `/register`
- Informasi PPDB (`candidate-information`) -> `/`

### UMUM (2)
- Informasi Sekolah (`public-information`) -> `/`
- Pendaftaran Umum (`public-registration`) -> `/register`

### EXTRACURRICULAR_TUTOR (2)
- Dashboard (`tutor-dashboard`) -> `/tutor`
- Anggota & Nilai (`tutor-members`) -> `/tutor/members`

## Temuan Kritis Terkait Permintaan (Web-simple, Mobile-approach)
1. **Profil**
- STUDENT: Profile (`student-profile-web`) -> route `/profile`, webPath `/student/profile`, mutating=false
- TEACHER: Profil (`teacher-profile`) -> route `/profile`, webPath `/teacher/profile`, mutating=false
- ADMIN: Profil Sekolah (`admin-school-profile`) -> route `-`, webPath `/admin/settings/profile`, mutating=false
- EXAMINER: Profil (`examiner-profile`) -> route `/profile`, webPath `/examiner/profile`, mutating=false
- EXTRACURRICULAR_TUTOR: Profil (`tutor-profile`) -> route `/profile`, webPath `/tutor/profile`, mutating=false
- Dampak: profil mobile saat ini dominan read-only, sedangkan web editable penuh.

2. **Presensi Guru (UX berbeda dari web)**
- TEACHER: Presensi Siswa (`attendance-teacher`) -> route `/teacher/attendance`
- TEACHER: Rekap Presensi (`teacher-homeroom-attendance`) -> route `/teacher/homeroom-attendance`
- Dampak: web memakai pola tabel/full kelas, mobile saat ini card per siswa sehingga terasa lebih panjang.

## Rekomendasi Eksekusi Lanjutan (Prioritas)
1. P0 - Profil parity: buat profile mobile editable (minimal field inti) + sinkronisasi refetch otomatis saat focus.
2. P0 - Presensi parity UX: tambah mode tabel/ringkas full-kelas untuk `Presensi Siswa` dan `Rekap Presensi`.
3. P1 - Ubah web-bridge kritikal jadi native bertahap (mulai STUDENT + STAFF + PRINCIPAL).
4. P1 - Standardisasi pola screen: filter di atas, list/tabel di tengah, aksi simpan sticky di bawah.

## Lampiran
- Detail JSON: `mobile-app/docs/MENU_TRACE_2026-02-19.json`
- Detail CSV: `mobile-app/docs/MENU_TRACE_2026-02-19.csv`
