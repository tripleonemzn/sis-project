# Mobile Parity Audit (All Roles)

Generated: 2026-03-27T16:10:11.365Z

## Ringkasan per Role

| Role | Total | Native Only | Native + Web Fallback | Web Bridge Route | Route Tree Punya openURL |
| --- | ---: | ---: | ---: | ---: | ---: |
| ADMIN | 33 | 33 | 0 | 0 | 0 |
| CALON_SISWA | 4 | 4 | 0 | 0 | 1 |
| EXAMINER | 4 | 4 | 0 | 0 | 0 |
| EXTRACURRICULAR_TUTOR | 6 | 6 | 0 | 0 | 0 |
| PARENT | 5 | 5 | 0 | 0 | 1 |
| PRINCIPAL | 7 | 7 | 0 | 0 | 0 |
| STAFF | 5 | 5 | 0 | 0 | 1 |
| STUDENT | 15 | 15 | 0 | 0 | 1 |
| TEACHER | 59 | 49 | 6 | 4 | 4 |
| UMUM | 6 | 6 | 0 | 0 | 1 |

## Detail Web Bridge per Role

### ADMIN
- Tidak ada menu web-bridge.

### CALON_SISWA
- Tidak ada menu web-bridge.

### EXAMINER
- Tidak ada menu web-bridge.

### EXTRACURRICULAR_TUTOR
- Tidak ada menu web-bridge.

### PARENT
- Tidak ada menu web-bridge.

### PRINCIPAL
- Tidak ada menu web-bridge.

### STAFF
- Tidak ada menu web-bridge.

### STUDENT
- Tidak ada menu web-bridge.

### TEACHER
- Dashboard BP/BK (`teacher-bk-dashboard`) -> route `/web-module/teacher-bk-dashboard`, webPath `/teacher/bk`
- Kasus Perilaku (`teacher-bk-behaviors`) -> route `/web-module/teacher-bk-behaviors`, webPath `/teacher/bk/behaviors`
- Perizinan Siswa (`teacher-bk-permissions`) -> route `/web-module/teacher-bk-permissions`, webPath `/teacher/bk/permissions`
- Konseling & Tindak Lanjut (`teacher-bk-counselings`) -> route `/web-module/teacher-bk-counselings`, webPath `/teacher/bk/counselings`

### UMUM
- Tidak ada menu web-bridge.

## Route Native Yang Masih Mengandung openURL

### ADMIN
- Tidak ada.

### CALON_SISWA
- Status Pendaftaran (`candidate-application`)
  - `app/(app)/candidate/application.tsx:448`

### EXAMINER
- Tidak ada.

### EXTRACURRICULAR_TUTOR
- Tidak ada.

### PARENT
- Keuangan (`parent-finance`)
  - `app/(app)/parent/finance.tsx:1029`

### PRINCIPAL
- Tidak ada.

### STAFF
- Pembayaran (SPP) (`staff-payments`)
  - `app/(app)/staff/payments.tsx:3250`

### STUDENT
- Keuangan (`student-finance`)
  - `app/(app)/student/finance.tsx:937`

### TEACHER
- Tidak ada.

### UMUM
- Lowongan BKK (`public-vacancies`)
  - `app/(app)/public/vacancies.tsx:394`

## Semua Pemanggilan Linking.openURL (Global)

- `app/(app)/candidate/application.tsx:448`
- `app/(app)/parent/finance.tsx:1029`
- `app/(app)/public/vacancies.tsx:394`
- `app/(app)/staff/payments.tsx:3250`
- `app/(app)/student/finance.tsx:937`
- `app/(app)/web-module/[moduleKey].tsx:44`

