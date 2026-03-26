# Mobile Parity Audit (All Roles)

Generated: 2026-03-26T15:03:50.532Z

## Ringkasan per Role

| Role | Total | Native Only | Native + Web Fallback | Web Bridge Route | Route Tree Punya openURL |
| --- | ---: | ---: | ---: | ---: | ---: |
| ADMIN | 33 | 33 | 0 | 0 | 0 |
| CALON_SISWA | 4 | 4 | 0 | 0 | 1 |
| EXAMINER | 4 | 4 | 0 | 0 | 0 |
| EXTRACURRICULAR_TUTOR | 6 | 6 | 0 | 0 | 0 |
| PARENT | 5 | 5 | 0 | 0 | 0 |
| PRINCIPAL | 7 | 7 | 0 | 0 | 0 |
| STAFF | 5 | 5 | 0 | 0 | 0 |
| STUDENT | 15 | 15 | 0 | 0 | 0 |
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
  - `app/(app)/candidate/application.tsx:422`

### EXAMINER
- Tidak ada.

### EXTRACURRICULAR_TUTOR
- Tidak ada.

### PARENT
- Tidak ada.

### PRINCIPAL
- Tidak ada.

### STAFF
- Tidak ada.

### STUDENT
- Tidak ada.

### TEACHER
- Tidak ada.

### UMUM
- Lowongan BKK (`public-vacancies`)
  - `app/(app)/public/vacancies.tsx:394`

## Semua Pemanggilan Linking.openURL (Global)

- `app/(app)/candidate/application.tsx:422`
- `app/(app)/public/vacancies.tsx:394`
- `app/(app)/web-module/[moduleKey].tsx:44`

