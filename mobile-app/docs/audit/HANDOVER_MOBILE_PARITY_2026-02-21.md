# Handover Pengembangan Mobile Parity

Tanggal: 2026-02-21 02:47 UTC
Fokus: menutup gap fitur web -> mobile lintas role tanpa mengganggu web production.

## Update Lanjutan (2026-02-23 02:39 UTC)

Tujuan batch ini: menutup gap parity urutan/group menu lintas duty (khususnya role guru) dan menegakkan konsep penguji PKL berasal dari guru yang ditunjuk Wakasek Humas.

Perubahan tambahan yang sudah dilakukan:
1. Parity urutan/group menu guru mengikuti pola web (termasuk Program Kerja per-duty)
   - File: `mobile-app/src/features/dashboard/roleMenu.ts`
   - Perubahan:
     - refactor builder group guru menjadi dinamis mengikuti urutan web:
       - base group (`AKADEMIK`, `PERANGKAT AJAR`, `UJIAN`)
       - conditional (`WALI KELAS`, `KELAS TRAINING`)
       - duty group berdasarkan urutan `additionalDuties` asli
       - group `KAKOM ...` di akhir duty section
       - group `SIDANG PKL` conditional.
     - `Program Kerja` sekarang muncul sebagai submenu di dalam tiap duty non-sekretaris (bukan group terpisah).
     - deteksi duty diperbaiki agar kompatibel kode dinamis seperti `KAPROG_TKJ` (matching berbasis token `includes`).
     - penyesuaian grouping alumni student agar sama seperti web (`AKADEMIK` berisi `Riwayat Nilai` + `Riwayat Kehadiran`).

2. Home mobile membaca status sidang PKL untuk menampilkan menu `SIDANG PKL` secara conditional
   - File: `mobile-app/app/(app)/home.tsx`
   - Perubahan:
     - tambah query `internshipDutyApi.listExaminerInternships()` untuk role guru.
     - kirim `hasPendingDefense` ke `getGroupedRoleMenu(...)`.
     - pull-to-refresh guru ikut me-refresh data sidang PKL.

3. Guard backend PKL: penguji wajib user role `TEACHER` dan assignment hanya oleh Admin/Wakasek Humas
   - File: `backend/src/controllers/internship.controller.ts`
   - Perubahan:
     - `assignExaminer` sekarang validasi:
       - actor harus `ADMIN` atau `TEACHER` dengan duty `WAKASEK_HUMAS` / `SEKRETARIS_HUMAS`.
       - `examinerId` harus user role `TEACHER`.
     - `scheduleDefense` ikut memakai guard actor yang sama.

4. Hardening route PKL: role `EXAMINER` tidak lagi memiliki endpoint sidang PKL
   - File: `backend/src/routes/internship.routes.ts`
   - Perubahan:
     - hapus role `EXAMINER` dari route PKL berikut:
       - `GET /internships/examiner`
       - `POST /internships/:id/grade-defense`
       - `GET /internships/:id/detail`
       - `GET /internships/:id/journals`
       - `GET /internships/:id/attendances`

5. Dashboard role EXAMINER dibersihkan dari modul sidang PKL
   - File: `frontend/src/pages/examiner/ExaminerDashboard.tsx`
   - Perubahan:
     - hapus query/aksi PKL sidang pada dashboard examiner.
     - dashboard fokus kembali ke skema dan penilaian UKK sesuai konsep role.

Validasi yang sudah dijalankan:
- `cd mobile-app && npm run typecheck` (sukses)
- `cd backend && npm run build` (sukses)
- `cd frontend && npm run build` (sukses)

## Update Lanjutan (2026-02-22 21:56 UTC)

Tujuan batch ini: menutup temuan terbaru pada menu Program Kerja lintas duty dan merapikan UX editor Buat Ujian Baru agar tidak membingungkan.

Perubahan tambahan yang sudah dilakukan:
1. Program Kerja tidak lagi terbatas pada duty KAKOM
   - File: `mobile-app/src/features/dashboard/roleMenu.ts`
   - Perubahan:
     - `teacher-work-program` sekarang tampil untuk semua duty primer (non-`SEKRETARIS_*`), bukan hanya `KAPROG/KEPALA_KOMPETENSI`.
     - menu `teacher-work-program` dipindah ke group baru `PROGRAM KERJA` agar tidak salah konteks di group `KAKOM`.

2. Optimasi loading halaman Program Kerja (owner)
   - File: `mobile-app/src/features/workPrograms/TeacherWorkProgramModuleScreen.tsx`
   - Perubahan:
     - Detail item per program dibuat collapsible (`Lihat Detail Item`) untuk menurunkan beban render awal.
     - Section `Anggaran & LPJ` dibuat lazy-render (manual expand) agar query berat tidak langsung jalan saat halaman dibuka.

3. UX editor ujian dipisah jadi 2 tahap
   - File: `mobile-app/app/(app)/teacher/exams/editor.tsx`
   - Perubahan:
     - Tab/step `1. Informasi Ujian` dan `2. Butir Soal`.
     - Form metadata ujian dipisah dari daftar butir soal.
     - Tombol navigasi antar tahap ditambahkan agar alur pembuatan lebih jelas.

4. Penyesuaian ikon group dashboard
   - File: `mobile-app/app/(app)/home.tsx`
   - Group `work-program` diberi ikon `briefcase` agar konsisten dengan konteks modul.

Validasi yang sudah dijalankan:
- `cd mobile-app && npm run typecheck` (sukses)
- `bash ./update_all.sh` (backend+frontend deploy sukses)

OTA Android (`pilot`) sudah terbit:
- Update group ID: `a98c82a5-09a8-472e-9147-7a504a44334b`
- Android update ID: `019c8753-5d7a-7c31-b5cc-45820572bcf8`
- Message: `Work program menu parity across duties + split exam editor steps`
- Dashboard: `https://expo.dev/accounts/tripleone.mzn/projects/sis-kgb2-mobile/updates/a98c82a5-09a8-472e-9147-7a504a44334b`

## Update Lanjutan (2026-02-23 03:58 UTC)

Tujuan batch ini: menutup gap parity review submission ujian (guru) dari daftar sesi sampai detail jawaban butir soal di web dan mobile.

Perubahan tambahan yang sudah dilakukan:
1. Backend endpoint review submission ujian
   - File: `backend/src/controllers/exam.controller.ts`
   - Tambahan logic:
     - `getPacketSubmissions` untuk daftar sesi per packet (filter status/class).
     - `getSessionDetail` untuk detail jawaban siswa per sesi.
   - Cakupan data:
     - ringkasan sesi/peserta/nilai, progres jawaban, status, objektif benar-salah, dan detail opsi jawaban per soal.
   - Akses:
     - guard role/ownership sama seperti analisis butir (`ADMIN`, `TEACHER` owner/mapel assignment, `EXAMINER` owner).

2. Routing backend endpoint baru
   - File: `backend/src/routes/exam.routes.ts`
   - Route baru:
     - `GET /api/exams/packets/:id/submissions`
     - `GET /api/exams/sessions/:id/detail`

3. Web teacher: halaman Submission Ujian + detail jawaban sesi
   - File baru: `frontend/src/pages/teacher/exams/ExamSubmissionsPage.tsx`
   - Integrasi:
     - `frontend/src/services/exam.service.ts` (method get submissions + session detail)
     - `frontend/src/App.tsx` (route `teacher/exams/:id/submissions`)
     - `frontend/src/pages/teacher/exams/ExamListPage.tsx` (button `Submisi`)

4. Mobile teacher: halaman Submission Ujian + Detail Jawaban Sesi
   - File baru:
     - `mobile-app/app/(app)/teacher/exams-submissions.tsx`
     - `mobile-app/app/(app)/teacher/exams-session-detail.tsx`
   - Integrasi:
     - `mobile-app/src/features/exams/examApi.ts` (method get submissions + session detail)
     - `mobile-app/src/features/exams/types.ts` (type response submissions/session detail)
     - `mobile-app/src/features/exams/TeacherExamPacketsModuleScreen.tsx` (button `Submisi`)

Validasi yang sudah dijalankan setelah patch:
- `cd backend && npm run build` (sukses)
- `cd frontend && npm run build` (sukses)
- `cd mobile-app && npm run typecheck` (sukses)

## Update Lanjutan (2026-02-22 22:55 UTC)

Tujuan batch ini: melanjutkan parity fitur ujian/submission dengan fokus analisis butir soal lintas platform dan menutup gap review submission tugas di web.

Perubahan tambahan yang sudah dilakukan:
1. Backend analisis butir soal packet ujian
   - File: `backend/src/controllers/exam.controller.ts`
   - Tambahan endpoint logic:
     - `getPacketItemAnalysis` (analisis dinamis dari sesi siswa per packet).
     - `syncPacketItemAnalysis` (sinkron itemAnalysis ke JSON `questions` pada packet).
   - Metrik yang dihasilkan:
     - indeks kesukaran, daya pembeda, unanswered rate, distribusi opsi, ringkasan peserta.
   - Akses dibatasi berdasarkan role/ownership (`ADMIN`, `TEACHER` owner/mapel assignment, `EXAMINER` owner).

2. Routing backend untuk analisis butir
   - File: `backend/src/routes/exam.routes.ts`
   - Route baru:
     - `GET /api/exams/packets/:id/item-analysis`
     - `POST /api/exams/packets/:id/item-analysis/sync`

3. Web teacher: halaman analisis butir + navigasi dari daftar ujian
   - File baru: `frontend/src/pages/teacher/exams/ExamItemAnalysisPage.tsx`
   - Integrasi:
     - `frontend/src/services/exam.service.ts` (method get/sync item analysis)
     - `frontend/src/pages/teacher/exams/ExamListPage.tsx` (button Analisis)
     - `frontend/src/App.tsx` (route `teacher/exams/:id/item-analysis`)

4. Mobile teacher: viewer analisis butir
   - File baru: `mobile-app/app/(app)/teacher/exams-analysis.tsx`
   - Integrasi:
     - `mobile-app/src/features/exams/examApi.ts` (method get/sync item analysis)
     - `mobile-app/src/features/exams/types.ts` (type response analisis)
     - `mobile-app/src/features/exams/TeacherExamPacketsModuleScreen.tsx` (button Analisis per packet)

5. Gap submission tugas web ditutup + hardening backend submission
   - File baru: `frontend/src/pages/teacher/AssignmentSubmissionsPage.tsx`
   - Route web baru:
     - `teacher/assignments/:id/submissions` di `frontend/src/App.tsx`
   - Hardening API:
     - `backend/src/controllers/submission.controller.ts`
     - perbaikan scope akses teacher (hanya tugas miliknya), validasi deadline publish, validasi kelas siswa, validasi rentang nilai saat grading.

Validasi yang sudah dijalankan setelah patch:
- `cd backend && npm run build` (sukses)
- `cd frontend && npm run build` (sukses)
- `cd mobile-app && npm run typecheck` (sukses)

## Update Lanjutan (2026-02-21 23:05 UTC)

Tujuan batch ini: menutup temuan KAKOM pada menu Program Kerja (mobile hanya bisa lihat data dari web, belum bisa tambah alur anggaran/LPJ seperti di web).

Perubahan tambahan yang sudah dilakukan:
1. Tambah domain type budget/LPJ pada modul work program mobile
   - File: `src/features/workPrograms/types.ts`
   - Tambahan type:
     - `WorkProgramBudgetRequest`
     - `WorkProgramBudgetLpjInvoice`
     - `WorkProgramBudgetLpjItem`
     - `WorkProgramBudgetLpjBundle`
     - payload/upload types terkait.

2. Perluasan API mobile untuk alur budget + LPJ owner
   - File: `src/features/workPrograms/workProgramApi.ts`
   - Tambahan method:
     - `listBudgetRequests`
     - `createBudgetRequest`
     - `removeBudgetRequest`
     - `uploadBudgetLpjFile`
     - `listBudgetLpj`
     - `createBudgetLpjInvoice`
     - `createBudgetLpjItem`
     - `removeBudgetLpjItem`
     - `uploadBudgetLpjInvoiceFile`
     - `uploadBudgetLpjProofFile`
     - `submitBudgetLpjInvoice`

3. Implement section native baru untuk owner Program Kerja
   - File baru: `src/features/workPrograms/WorkProgramBudgetOwnerSection.tsx`
   - Capability native:
     - create + delete pengajuan anggaran
     - filter status/duty + search
     - upload LPJ file legacy per pengajuan
     - create invoice LPJ
     - upload invoice file + proof file
     - create + delete item LPJ
     - submit invoice LPJ ke Sarpras
     - buka dokumen LPJ/Invoice/Bukti lewat route `web-module` (URL absolut lampiran)

4. Integrasi ke layar utama Program Kerja guru
   - File: `src/features/workPrograms/TeacherWorkProgramModuleScreen.tsx`
   - `mode=OWNER` sekarang memuat section `Anggaran & LPJ` native.
   - Pull-to-refresh owner diperluas untuk invalidate query budget/LPJ juga.

5. Audit route parity ulang
   - `npm run audit:parity` dijalankan ulang.
   - Hasil route-level tetap:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**
     - openURL global tetap 1 titik sengaja: `app/(app)/web-module/[moduleKey].tsx`

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)

## Update Lanjutan (2026-02-21 23:35 UTC)

Tujuan batch ini: retry publish OTA setelah patch parity Program Kerja + memastikan hasil publish tidak false-positive.

Perubahan/eksekusi tambahan yang sudah dilakukan:
1. Commit scoped parity batch
   - Commit: `926b99c`
   - Scope:
     - `src/features/workPrograms/*` (Program Kerja budget+LPJ owner flow)
     - dokumen audit/handover terkait.

2. Retry OTA channel `pilot`
   - Command:
     - `XDG_CACHE_HOME=/tmp/.cache NPM_CONFIG_CACHE=/tmp/.npm OTA_MAX_ATTEMPTS=5 bash ./scripts/publish-ota-update.sh pilot "Work program mobile: budget and LPJ owner flow parity"`
   - Hasil:
     - Gagal pada semua attempt karena DNS/network:
       - `getaddrinfo EAI_AGAIN api.expo.dev`
     - Status: update belum terbit.

3. Hardening script OTA (fix false-success exit code)
   - File: `scripts/publish-ota-update.sh`
   - Masalah:
     - saat `npx eas-cli update` gagal, script bisa tetap keluar dengan code `0` (false-success).
   - Perbaikan:
     - simpan `last_exit_code` di blok `else` dari command update.
     - final exit sekarang benar mengikuti status gagal.
   - Verifikasi:
     - `OTA_MAX_ATTEMPTS=1 ... publish-ota-update.sh ...`
   - output `__EXIT_CODE=1` saat gagal DNS (sesuai ekspektasi).

## Update Lanjutan (2026-02-22 00:05 UTC)

Tujuan batch ini: polishing UI dashboard mobile lintas role sebelum publish OTA (submenu iconized, avatar profile, dan header info akademik).

Perubahan tambahan yang sudah dilakukan:
1. Redesign menu dashboard lintas role menjadi icon-first (bukan card list)
   - File: `app/(app)/home.tsx`
   - Perubahan:
     - submenu pada setiap kategori sekarang tampil sebagai grid button icon untuk pindah cepat antar sub-menu.
     - quick actions non-teacher juga diubah ke icon buttons.
     - statistik dashboard yang sebelumnya card juga dirender dengan pola icon badge agar visual konsisten.
   - Dampak:
     - berlaku untuk semua role karena seluruh navigasi dashboard berbasis `getGroupedRoleMenu()` dirender dari satu screen home.

2. Header atas: lingkaran dijadikan foto profil + metadata akademik
   - File: `app/(app)/home.tsx`
   - Perubahan:
     - avatar lingkaran atas sekarang menampilkan foto profil user (fallback inisial).
     - di samping avatar ditambahkan:
       - `Tahun Ajaran Aktif`
       - tanggal/hari saat ini format Indonesia (seperti kebutuhan web).
     - tahun ajaran aktif diambil dari endpoint aktif + fallback sumber data role.

3. Footer floating circle: ganti icon search menjadi avatar profil
   - File: `app/(app)/home.tsx`
   - Perubahan:
     - tombol lingkaran tengah footer sekarang menampilkan foto profil user (fallback inisial), bukan icon search.
     - aksi diarahkan ke halaman profil.

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)

## Update Lanjutan (2026-02-22 01:12 UTC)

Tujuan batch ini: publish OTA `pilot` untuk perubahan UI dashboard icon/avatar yang sudah disepakati.

Perubahan/eksekusi tambahan yang sudah dilakukan:
1. Commit perubahan UI dashboard sebelum publish
   - Commit: `d1b713f`
   - Scope utama:
     - `app/(app)/home.tsx` (iconized dashboard/submenu, avatar profile header/footer, info tahun ajaran + hari).

2. Retry OTA dengan diagnosa kegagalan jaringan
   - Publish awal dalam sandbox gagal berulang (`api.expo.dev/graphql`), dan dari uji node HTTPS terdeteksi `connect EPERM`.
   - Mitigasi:
     - jalankan publish di mode non-sandbox (escalated) agar Node network tidak diblok.

3. OTA `pilot` berhasil terbit
   - Branch: `pilot`
   - Runtime version: `0.1.0`
   - Platform: `android`
   - Update group ID: `378f2bbb-3a2b-418a-a518-e27bd8064d15`
   - Android update ID: `019c82e8-c700-7595-a8f8-6533dbcb1dbc`
   - Message: `Dashboard icon refresh + profile avatar header/footer`
   - Commit: `d1b713f2e9c57319b10040a96c5caf73f002ff7f`
   - Dashboard: `https://expo.dev/accounts/tripleone.mzn/projects/sis-kgb2-mobile/updates/378f2bbb-3a2b-418a-a518-e27bd8064d15`
   - Push notify broadcast: sukses dikirim.

## Update Lanjutan (2026-02-21 03:30 UTC)

Tujuan batch ini: memastikan semua fitur tetap bisa diakses dari mobile meskipun belum semuanya native penuh.

Perubahan tambahan yang sudah dilakukan:
1. Aktifkan kembali fallback web internal mobile
   - File: `src/lib/navigation/mobileWebGuard.ts`
   - Guard pemblokiran `Linking.openURL` internal web dibuat no-op agar fallback web tidak lagi ditolak.

2. Hidupkan jalur `/web-module/[moduleKey]` untuk benar-benar membuka modul web
   - File: `app/(app)/web-module/[moduleKey].tsx`
   - Saat route dibuka, app auto-open URL web modul terkait.
   - Disediakan tombol manual `Buka Modul Web` jika browser tidak terbuka otomatis.

3. Tambahkan fallback web universal dari Home untuk semua role/menu
   - File: `app/(app)/home.tsx`
   - Semua menu yang punya `webPath` sekarang bisa dibuka versi web lewat long-press.
   - Long-press mengarah ke `/web-module/{menuKey}` (konsisten dan terpusat).
   - Ditambahkan hint UI: tekan lama menu untuk membuka versi web lengkap.

4. Perbaiki akurasi skrip audit parity
   - File: `scripts/audit-mobile-parity.js`
   - Route parser sekarang mengabaikan query/hash (`?tab=...` / `#...`) agar route seperti
     `/student/internship?tab=...` tetap dipetakan ke file screen yang benar.

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T03:32:30.758Z`)

## Update Lanjutan (2026-02-21 03:58 UTC)

Tujuan batch ini: menurunkan ketergantungan fallback web yang tercecer (langsung `Linking.openURL`) menjadi satu jalur terpusat.

Perubahan tambahan yang sudah dilakukan:
1. Tambah helper routing fallback web terpusat
   - File: `src/lib/navigation/webModuleRoute.ts`
   - Menyediakan `openWebModuleRoute(router, { moduleKey, webPath, label })`.
   - Mendukung `webPath` relatif dan URL absolut.

2. Upgrade screen web-module untuk dukung override URL/path
   - File: `app/(app)/web-module/[moduleKey].tsx`
   - Tambah parameter `path`, `url`, dan `label`.
   - Bisa membuka URL absolut langsung (untuk dokumen/lampiran), tidak hanya path internal.

3. Refactor massal modul Teacher + role operasional lain ke helper terpusat
   - Teacher modules (`learning resources`, `exam packets`, `head program`, `humas`, `work program`, `internship duty`, `teacher bridge`, `proctoring`, `wakakur`, `wakasis`, `sarpras`, `homeroom behavior`, dst) tidak lagi memanggil `Linking.openURL` langsung untuk fallback web modul.
   - Examiner (`schemes`, `assessment`), Principal (`overview`, `attendance`), Parent (`finance`) juga dipindahkan ke helper terpusat.
   - Akses lampiran/dokumen di `profile`, `student/internship`, `teacher/materials`, `teacher/assignment-submissions`, `teacher/homeroom-permissions`, `teacher/wakasis-approvals` juga diarahkan via jalur `web-module`.

4. Dampak audit parity setelah refactor
   - `Route Tree Punya openURL`:
     - `TEACHER`: **51 -> 0**
     - `STUDENT`: **5 -> 0**
     - `PRINCIPAL`: **3 -> 0**
     - `PARENT`: **1 -> 0**
     - `EXAMINER`: **3 -> 0**
     - Role lain production juga **0**
   - Global `Linking.openURL` tersisa **1 titik**: `app/(app)/web-module/[moduleKey].tsx` (sengaja sebagai satu gerbang fallback terpusat).

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T03:58:47.712Z`)

## Update Lanjutan (2026-02-21 04:05 UTC)

Tujuan batch ini: mulai konversi menu Teacher dari `Native + Web Fallback` ke `Native Only` secara bertahap (modul yang sudah matang dulu).

Perubahan tambahan yang sudah dilakukan:
1. Promote 5 menu Teacher ke native-only (hapus `webPath` dari role menu)
   - File: `src/features/dashboard/roleMenu.ts`
   - Item yang dipromosikan:
     - `teacher-materials`
     - `teacher-proctoring`
     - `teacher-homeroom-behavior`
     - `teacher-homeroom-permissions`
     - `teacher-wakasis-approvals`

2. Hapus tombol fallback web langsung pada screen native terkait
   - `app/(app)/teacher/proctoring/index.tsx`
   - `app/(app)/teacher/proctoring/[scheduleId].tsx`
   - `app/(app)/teacher/homeroom-behavior.tsx`
   - `app/(app)/teacher/homeroom-permissions.tsx`
   - `app/(app)/teacher/wakasis-approvals.tsx`
   - Catatan: akses lampiran file tetap tersedia via jalur terpusat `web-module`.

3. Dampak audit parity batch ini
   - `TEACHER`: `Native Only` naik **0 -> 5**
   - `TEACHER`: `Native + Web Fallback` turun **58 -> 53**
   - `TEACHER`: `Route Tree Punya openURL` tetap **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T04:05:45.376Z`)

## Update Lanjutan (2026-02-21 04:16 UTC)

Tujuan batch ini: lanjutkan promosi menu Teacher dari `Native + Web Fallback` ke `Native Only` untuk modul Wakakur/Wakasis yang sudah siap native.

Perubahan tambahan yang sudah dilakukan:
1. Promote 5 menu Teacher ke native-only (hapus `webPath` dari role menu)
   - File: `src/features/dashboard/roleMenu.ts`
   - Item yang dipromosikan:
     - `teacher-wakakur-curriculum`
     - `teacher-wakakur-exams`
     - `teacher-wakakur-performance`
     - `teacher-wakasis-students`
     - `teacher-wakasis-performance`

2. Hapus fallback web button/helper di screen native terkait
   - `app/(app)/teacher/wakakur-curriculum.tsx`
   - `app/(app)/teacher/wakakur-exams.tsx`
   - `app/(app)/teacher/wakakur-performance.tsx`
   - `app/(app)/teacher/wakasis-students.tsx`
   - `app/(app)/teacher/wakasis-performance.tsx`
   - Detail khusus:
     - Tombol `Buka ... Versi Web` dihapus.
     - Import/helper `openWebModuleRoute` dihapus pada kelima screen.
     - Quick action `wakakur-curriculum` sekarang diarahkan ke section/route native:
       - Kategori -> tab `CATEGORIES`
       - Mapel -> tab `SUBJECTS`
       - Data KKM -> `/teacher/report-subjects`
       - Assignment -> tab `ASSIGNMENTS`
       - Jadwal -> `/schedule`
       - Rekap Jam Mengajar -> tab `LOAD`

3. Dampak audit parity batch ini
   - `TEACHER`: `Native Only` naik **5 -> 10**
   - `TEACHER`: `Native + Web Fallback` turun **53 -> 48**
   - `TEACHER`: `Route Tree Punya openURL` tetap **0**
   - Global `Linking.openURL` tetap **1 titik** (gerbang terpusat `web-module`)

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T04:16:32.420Z`)

## Update Lanjutan (2026-02-21 04:23 UTC)

Tujuan batch ini: lanjutkan promosi native-only untuk cluster Wakakur/Wakasis yang sudah stabil native.

Perubahan tambahan yang sudah dilakukan:
1. Promote 4 menu Teacher ke native-only (hapus `webPath` dari role menu)
   - File: `src/features/dashboard/roleMenu.ts`
   - Item yang dipromosikan:
     - `teacher-wakakur-approvals-work-program`
     - `teacher-wakakur-approvals`
     - `teacher-wakakur-reports`
     - `teacher-wakasis-reports`

2. Hapus fallback web pada modul Wakasis Reports
   - File: `app/(app)/teacher/wakasis-reports.tsx`
   - Tombol `Buka Detail Modul Web` dihapus.
   - Helper `openWebModuleRoute` + mapping `sectionToWebSection` dihapus.

3. Buat fallback web pada modul work-program bersifat opsional
   - File: `src/features/workPrograms/TeacherWorkProgramModuleScreen.tsx`
   - Prop `webPath` diubah jadi opsional.
   - Tombol `Buka Modul Web` hanya tampil jika `webPath` tersedia.
   - Ini memungkinkan route approval native-only tanpa fallback tombol web.

4. Nonaktifkan fallback web pada entry screen approvals
   - File: `app/(app)/teacher/wakakur-work-program-approvals.tsx`
   - `webPath` tidak lagi dikirim ke `TeacherWorkProgramModuleScreen`.

5. Dampak audit parity batch ini
   - `TEACHER`: `Native Only` naik **10 -> 14**
   - `TEACHER`: `Native + Web Fallback` turun **48 -> 44**
   - `TEACHER`: `Route Tree Punya openURL` tetap **0**
   - Global `Linking.openURL` tetap **1 titik** (gerbang terpusat `web-module`)

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T04:23:45.407Z`)

Catatan OTA:
- Publish OTA ke channel `pilot` untuk batch ini sempat dicoba ulang, namun gagal 3x karena error koneksi `https://api.expo.dev/graphql`.

## Update Lanjutan (2026-02-21 04:42 UTC)

Tujuan batch ini: lanjutkan promosi native-only untuk cluster Sarpras (aset, persetujuan anggaran, laporan).

Perubahan tambahan yang sudah dilakukan:
1. Promote 3 menu Teacher ke native-only (hapus `webPath` dari role menu)
   - File: `src/features/dashboard/roleMenu.ts`
   - Item yang dipromosikan:
     - `teacher-sarpras-inventory`
     - `teacher-sarpras-budgets`
     - `teacher-sarpras-reports`

2. Hapus fallback web button/helper pada modul Sarpras
   - `app/(app)/teacher/sarpras-inventory.tsx`
     - Hapus helper `openWebHub` dan `openWebRoomDetail`.
     - Hapus tombol `Buka Modul Web Sarpras` dan `Buka Detail Inventaris Web`.
   - `app/(app)/teacher/sarpras-budgets.tsx`
     - Hapus helper `openWebHub`.
     - Hapus tombol `Buka Audit LPJ di Modul Web`.
   - `app/(app)/teacher/sarpras-reports.tsx`
     - Hapus helper `openWebReports` dan `openWebBudgetAudit`.
     - Hapus tombol `Buka Laporan Sarpras Web` dan `Buka Audit Anggaran Web`.

3. Dampak audit parity batch ini
   - `TEACHER`: `Native Only` naik **14 -> 17**
   - `TEACHER`: `Native + Web Fallback` turun **44 -> 41**
   - `TEACHER`: `Route Tree Punya openURL` tetap **0**
   - Global `Linking.openURL` tetap **1 titik** (gerbang terpusat `web-module`)

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T04:42:32.295Z`)

Catatan OTA:
- Publish OTA ke channel `pilot` untuk batch ini sudah dicoba, namun gagal 3x karena error koneksi `https://api.expo.dev/graphql`.

## Update Lanjutan (2026-02-21 04:49 UTC)

Tujuan batch ini: lanjutkan promosi native-only untuk cluster Humas (pengaturan, persetujuan, komponen, jurnal, mitra, laporan).

Perubahan tambahan yang sudah dilakukan:
1. Promote 6 menu Teacher ke native-only (hapus `webPath` dari role menu)
   - File: `src/features/dashboard/roleMenu.ts`
   - Item yang dipromosikan:
     - `teacher-humas-settings`
     - `teacher-humas-approval`
     - `teacher-humas-components`
     - `teacher-humas-journals`
     - `teacher-humas-partners`
     - `teacher-humas-reports`

2. Jadikan fallback web di modul Humas bersifat opsional
   - File: `src/features/humasModule/TeacherHumasModuleScreen.tsx`
   - Prop `webPath` diubah menjadi opsional.
   - Tombol `Buka Modul Web` hanya tampil jika `webPath` tersedia.
   - Guard ditambahkan (`if (!webPath) return`) sebelum `openWebModuleRoute`.

3. Nonaktifkan fallback web pada semua entry screen Humas
   - `app/(app)/teacher/humas-settings.tsx`
   - `app/(app)/teacher/humas-approval.tsx`
   - `app/(app)/teacher/humas-components.tsx`
   - `app/(app)/teacher/humas-journals.tsx`
   - `app/(app)/teacher/humas-partners.tsx`
   - `app/(app)/teacher/humas-reports.tsx`
   - Semua wrapper di atas tidak lagi mengirim `webPath` ke `TeacherHumasModuleScreen`.

4. Dampak audit parity batch ini
   - `TEACHER`: `Native Only` naik **17 -> 23**
   - `TEACHER`: `Native + Web Fallback` turun **41 -> 35**
   - `TEACHER`: `Route Tree Punya openURL` tetap **0**
   - Global `Linking.openURL` tetap **1 titik** (gerbang terpusat `web-module`)

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T04:49:23.647Z`)

Catatan OTA:
- Publish OTA ke channel `pilot` untuk batch ini sudah dicoba, namun gagal 3x karena error koneksi `https://api.expo.dev/graphql`.

## Update Lanjutan (2026-02-21 05:16 UTC)

Tujuan batch ini: dorong parity lintas role non-teacher yang sudah punya route native stabil, sekaligus lanjutkan pengurangan fallback web sesuai strategi "native-first".

Perubahan tambahan yang sudah dilakukan:
1. Promote role non-teacher ke native-only via role menu
   - File: `src/features/dashboard/roleMenu.ts`
   - `STUDENT`:
     - Semua 18 menu siswa tidak lagi membawa `webPath` (tetap route native yang sama).
   - `PRINCIPAL`:
     - Semua 6 menu principal tidak lagi membawa `webPath`.
   - `STAFF`:
     - Semua 4 menu staff tidak lagi membawa `webPath`.
   - `PARENT`:
     - Semua 4 menu parent tidak lagi membawa `webPath`.
   - `EXTRACURRICULAR_TUTOR`:
     - Semua 3 menu tutor tidak lagi membawa `webPath`.
   - `EXAMINER`:
     - `examiner-dashboard` dan `examiner-profile` dipromosikan native-only.
   - `ADMIN`:
     - `admin-dashboard`, `admin-school-profile`, `admin-password` dipromosikan native-only.

2. Hapus fallback tombol web di screen yang sudah dipromosikan native-only
   - `app/(app)/principal/overview.tsx`
     - Hapus import/helper `openWebModuleRoute` dan tombol `Buka Laporan Lengkap Versi Web`.
   - `app/(app)/principal/attendance.tsx`
     - Hapus import/helper `openWebModuleRoute` dan tombol `Buka Rekap Lengkap Versi Web`.
   - `app/(app)/parent/finance.tsx`
     - Hapus import/helper `openWebModuleRoute` dan tombol `Buka Modul Keuangan Versi Web`.

3. Dampak audit parity batch ini
   - `STUDENT`: `Native Only` naik **0 -> 18** (`Native + Web Fallback` **18 -> 0**)
   - `PRINCIPAL`: `Native Only` naik **0 -> 6** (`Native + Web Fallback` **6 -> 0**)
   - `STAFF`: `Native Only` naik **0 -> 4** (`Native + Web Fallback` **4 -> 0**)
   - `PARENT`: `Native Only` naik **0 -> 4** (`Native + Web Fallback` **4 -> 0**)
   - `EXTRACURRICULAR_TUTOR`: `Native Only` naik **0 -> 3** (`Native + Web Fallback` **3 -> 0**)
   - `EXAMINER`: `Native Only` naik **0 -> 2** (`Native + Web Fallback` **4 -> 2**)
   - `ADMIN`: `Native Only` naik **0 -> 3** (`Native + Web Fallback` **29 -> 26**)
   - `TEACHER`: tetap `Native Only` **40**, `Native + Web Fallback` **18**
   - Global `Linking.openURL` tetap **1 titik** di `app/(app)/web-module/[moduleKey].tsx`.

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T05:15:59.017Z`)

## Update Lanjutan (2026-02-21 05:26 UTC)

Tujuan batch ini: menutup gap examiner ke native penuh agar alur skema UKK + input nilai bisa dikerjakan langsung dari mobile.

Perubahan tambahan yang sudah dilakukan:
1. Tambah kemampuan native penuh untuk penilaian UKK (input skor + simpan massal)
   - File: `app/(app)/examiner/assessment.tsx`
   - Perubahan utama:
     - Screen `assessment` kini punya mode pemilihan skema saat tanpa `schemeId`.
     - Saat `schemeId` dipilih, mobile memuat detail skema, daftar siswa, komponen kriteria, dan nilai existing.
     - Examiner dapat input/edit skor per kriteria per siswa langsung di mobile.
     - Simpan massal native ke endpoint `POST /ukk-assessments` (upsert).
     - Tombol fallback web pada halaman assessment dihapus.

2. Tambah kemampuan native CRUD skema UKK
   - File: `app/(app)/examiner/schemes.tsx`
   - Perubahan utama:
     - Tambah form native `create/edit` skema (nama, mata pelajaran saat create, komponen kriteria).
     - Tambah aksi native `delete` skema dengan konfirmasi.
     - Tetap ada shortcut ke halaman input nilai (`/examiner/assessment`).
     - Tombol `Buka Kelola Lengkap Versi Web` dihapus.

3. Perluasan API mobile examiner untuk mendukung parity
   - File: `src/features/examiner/examinerApi.ts`
   - Tambahan method:
     - `getSchemeDetail`
     - `createScheme`
     - `updateScheme`
     - `deleteScheme`
     - `upsertAssessment`

4. Perluasan tipe data examiner
   - File: `src/features/examiner/types.ts`
   - Tambah field/mapping yang dibutuhkan:
     - `ExaminerSchemeCriteria` kini mendukung `id`, `group`, `aliases`.
     - `ExaminerAssessment` kini menyertakan `criteria` + `scores`.
     - Tambah payload type untuk create/update scheme dan upsert assessment.

5. Promote menu examiner ke native-only
   - File: `src/features/dashboard/roleMenu.ts`
   - `webPath` dihapus untuk:
     - `examiner-schemes`
     - `assessment`

6. Dampak audit parity batch ini
   - `EXAMINER`: `Native Only` naik **3 -> 4**
   - `EXAMINER`: `Native + Web Fallback` turun **1 -> 0**
   - Global `Linking.openURL` tetap **1 titik** di `app/(app)/web-module/[moduleKey].tsx`.

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T05:26:16.407Z`)

## Update Lanjutan (2026-02-21 05:35 UTC)

Tujuan batch ini: lanjutkan reduksi fallback Teacher dengan memindahkan inventaris `Head Lab`/`Head Library` ke jalur native mobile yang sudah tersedia.

Perubahan tambahan yang sudah dilakukan:
1. Alihkan entry `Head Lab/Library Inventory` ke modul native sarpras
   - `app/(app)/teacher/head-lab-inventory.tsx`
     - Sekarang redirect ke `/teacher/sarpras-inventory?scope=lab`.
   - `app/(app)/teacher/head-library-inventory.tsx`
     - Sekarang redirect ke `/teacher/sarpras-inventory?scope=library`.

2. Upgrade modul `sarpras-inventory` agar mendukung scope per duty
   - File: `app/(app)/teacher/sarpras-inventory.tsx`
   - Tambahan:
     - Parse query param `scope` (`ALL` / `LAB` / `LIBRARY`).
     - Akses duty disesuaikan:
       - `ALL`: Wakasek/Sekretaris Sarpras.
       - `LAB`: Wakasek/Sekretaris Sarpras atau `KEPALA_LAB`.
       - `LIBRARY`: Wakasek/Sekretaris Sarpras atau `KEPALA_PERPUSTAKAAN`.
     - Kategori ruang otomatis difilter sesuai scope (`lab` / `library`).
     - Judul/subjudul halaman disesuaikan berdasarkan scope.

3. Promote 2 menu Teacher ke native-only
   - File: `src/features/dashboard/roleMenu.ts`
   - Item yang dipromosikan:
     - `teacher-head-lab-inventory`
     - `teacher-head-library-inventory`
   - `webPath` pada 2 item tersebut dihapus.

4. Dampak audit parity batch ini
   - `TEACHER`: `Native Only` naik **40 -> 42**
   - `TEACHER`: `Native + Web Fallback` turun **18 -> 16**
   - Global `Linking.openURL` tetap **1 titik** di `app/(app)/web-module/[moduleKey].tsx`.

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T05:35:25.064Z`)

## Update Lanjutan (2026-02-21 05:46 UTC)

Tujuan batch ini: menutup fallback role `ADMIN` ke native penuh, sekaligus memastikan tiap submenu admin membuka konteks yang sesuai di layar mobile.

Perubahan tambahan yang sudah dilakukan:
1. Promote seluruh menu `ADMIN` ke native-only
   - File: `src/features/dashboard/roleMenu.ts`
   - `webPath` dihapus untuk semua 26 item admin yang sebelumnya fallback.
   - Route admin diperkaya query context agar submenu mengarah ke mode spesifik:
     - contoh: `/admin/master-data?section=majors`
     - contoh: `/admin/user-management?role=STUDENT`
     - contoh: `/admin/academic?section=question-bank`

2. Upgrade layar `admin/master-data` menjadi context-aware per section
   - File: `app/(app)/admin/master-data.tsx`
   - Tambah dukungan query `section` + chips navigasi in-screen.
   - Tambah data native untuk:
     - jurusan
     - mapel
     - kelas
     - kelas training (deteksi berbasis keyword)
     - kategori mapel
     - ekstrakurikuler

3. Upgrade layar `admin/user-management` dengan preset filter dari route
   - File: `app/(app)/admin/user-management.tsx`
   - Tambah parsing query:
     - `role`
     - `verification`
     - `section`
   - Saat dibuka dari submenu admin tertentu, filter role/verifikasi langsung aktif otomatis.

4. Upgrade layar `admin/academic` menjadi hub modul akademik native
   - File: `app/(app)/admin/academic.tsx`
   - Tambah dukungan query `section` + chips navigasi.
   - Tambah ringkasan native per modul:
     - tahun ajaran & kalender
     - assignment guru
     - ringkasan jadwal (berbasis assignment schedule entries)
     - rekap jam mengajar
     - cakupan KKM
     - rekap keterlambatan (sample kelas)
     - ringkasan rapor (sample kelas)
     - bank soal
     - sesi ujian

5. Perluasan API mobile admin untuk kebutuhan parity section
   - File: `src/features/admin/adminApi.ts`
   - Tambah method:
     - `listExtracurriculars`
     - `listExamQuestions`
     - `listExamSchedules`
     - `getLateSummaryByClass`
     - `getClassReportSummary`

6. Dampak audit parity batch ini
   - `ADMIN`: `Native Only` naik **3 -> 29**
   - `ADMIN`: `Native + Web Fallback` turun **26 -> 0**
   - Role produksi internal saat ini semua sudah `Native Only` penuh:
     - `ADMIN`, `TEACHER`, `STUDENT`, `PRINCIPAL`, `STAFF`, `PARENT`, `EXAMINER`, `EXTRACURRICULAR_TUTOR`
   - Sisa web-bridge hanya role publik/non-login:
     - `CALON_SISWA` (2)
     - `UMUM` (2)

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T05:46:52.725Z`)

## Update Lanjutan (2026-02-21 05:49 UTC)

Tujuan batch ini: menutup sisa gap web-bridge role publik/non-login (`CALON_SISWA`, `UMUM`) agar parity lintas role benar-benar 100% native route.

Perubahan tambahan yang sudah dilakukan:
1. Promote menu `CALON_SISWA` dan `UMUM` ke native-only
   - File: `src/features/dashboard/roleMenu.ts`
   - Mapping baru:
     - `candidate-application` -> `/candidate/application`
     - `candidate-information` -> `/candidate/information`
     - `public-information` -> `/public/information`
     - `public-registration` -> `/public/registration`
   - Seluruh `webPath` pada 4 menu tersebut dihapus.

2. Tambah screen native baru untuk role publik/calon
   - `app/(app)/candidate/application.tsx`
   - `app/(app)/candidate/information.tsx`
   - `app/(app)/public/information.tsx`
   - `app/(app)/public/registration.tsx`
   - Keempat screen memakai UI native in-app (tanpa lempar ke web-module).

3. Dampak audit parity batch ini
   - `CALON_SISWA`: `Native Only` naik **0 -> 2**
   - `UMUM`: `Native Only` naik **0 -> 2**
   - Semua role sekarang:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**
     - `Route Tree Punya openURL` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T05:49:06.829Z`)

## Update Lanjutan (2026-02-21 06:01 UTC)

Tujuan batch ini: mulai menutup gap **behavior parity** (bukan hanya route parity) pada modul `ADMIN Master Data` agar alur CRUD mobile mendekati modul web.

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API mobile admin untuk CRUD master data
   - File: `src/features/admin/adminApi.ts`
   - Tambahan method:
     - Jurusan: `createMajor`, `updateMajor`, `deleteMajor`
     - Kategori mapel: `createSubjectCategory`, `updateSubjectCategory`, `deleteSubjectCategory`
     - Mapel: `createSubject`, `updateSubject`, `deleteSubject`
     - Kelas: `createClass`, `updateClass`, `deleteClass`
     - Kelas training: `listTrainingClasses`, `createTrainingClass`, `updateTrainingClass`, `deleteTrainingClass`
     - Ekstrakurikuler: `createExtracurricular`, `updateExtracurricular`, `deleteExtracurricular`

2. Refactor besar `admin/master-data` dari mode baca -> mode operasional
   - File: `app/(app)/admin/master-data.tsx`
   - Implementasi native CRUD per section:
     - Jurusan
     - Kategori mapel
     - Mapel (+ KKM X/XI/XII)
     - Kelas (termasuk create multi-rombel seperti flow web)
     - Kelas training
     - Ekstrakurikuler
   - Tetap mempertahankan:
     - section context via query `?section=...`
     - search/filter in-screen
     - edit + delete action per item
     - validasi form dasar + feedback sukses/error

3. Dampak batch ini
   - Parity route tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**
   - Fokus peningkatan bergeser ke parity aksi/fitur (CRUD behavior).

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T06:01:37.156Z`)

## Update Lanjutan (2026-02-21 06:04 UTC)

Tujuan batch ini: lanjut menutup gap behavior parity pada `ADMIN Akademik`, fokus ke modul assignment guru agar aksi utama web bisa dikerjakan langsung dari mobile.

Perubahan tambahan yang sudah dilakukan:
1. Tambah API assignment guru untuk aksi write
   - File: `src/features/admin/adminApi.ts`
   - Tambahan method:
     - `upsertTeacherAssignments`
     - `deleteTeacherAssignment`

2. Upgrade section `teacher-assignments` di layar akademik admin
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - form pilih guru
     - form pilih mapel
     - multi-select kelas
     - submit upsert assignment (`POST /teacher-assignments`)
     - list detail assignment + aksi hapus per assignment (`DELETE /teacher-assignments/:id`)
     - grouping assignment per kombinasi guru-mapel + tombol `Muat ke Form` untuk edit cepat

3. Dampak batch ini
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**
   - Behavior parity meningkat pada area akademik admin (assignment guru kini sudah write-capable di mobile).

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T06:04:06.748Z`)

## Update Lanjutan (2026-02-21 06:25 UTC)

Tujuan batch ini: lanjut menutup gap behavior parity pada `ADMIN User Management` agar mobile dapat menjalankan operasi inti user seperti di web (bukan hanya verifikasi/read-only).

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API mobile admin untuk user CRUD + import data
   - File: `src/features/admin/adminApi.ts`
   - Tambahan method:
     - `createUser`
     - `deleteUser`
     - `importTeachers`
     - `importStudents`
     - `importParents`
   - `updateUser` diperluas dari hanya `verificationStatus` menjadi payload update user lengkap.
   - Type `AdminUser` diperluas mengikuti field backend (`nip`, `gender`, `classId`, `managedMajors`, `examinerMajor`, `documents`, dst).

2. Upgrade besar layar `admin/user-management` dari mode verifikasi menjadi mode operasional
   - File: `app/(app)/admin/user-management.tsx`
   - Tambahan fitur native:
     - create user lintas role
     - edit user lintas role
     - delete user
     - form role-aware (student/class/status, parent-child mapping, examiner major, teacher/staff additional duties + managed major)
     - import Excel native dari device untuk:
       - guru
       - siswa
       - orang tua
     - verifikasi akun single + bulk tetap dipertahankan

3. Dampak batch ini
   - `ADMIN user-management` berpindah dari verifikasi-only ke write-capable (CRUD + import) di mobile.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T06:26:22.318Z`)

## Update Lanjutan (2026-02-21 06:29 UTC)

Tujuan batch ini: lanjut menutup gap behavior parity pada `ADMIN Academic` untuk modul tahun ajaran (agar tidak hanya read/activate, tapi juga CRUD dari mobile).

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API mobile admin untuk CRUD tahun ajaran
   - File: `src/features/admin/adminApi.ts`
   - Tambahan method:
     - `createAcademicYear`
     - `updateAcademicYear`
     - `deleteAcademicYear`
   - Tambah tipe payload:
     - `AdminAcademicYearPayload`

2. Upgrade section `academic-years` di layar akademik admin
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - form create tahun ajaran (nama + rentang semester 1/2 + konfigurasi kelas PKL)
     - edit tahun ajaran existing
     - delete tahun ajaran
     - aksi aktifkan tahun ajaran tetap dipertahankan
   - Hasilnya: tahun ajaran sudah operasional penuh dari mobile (create/edit/delete/activate).

3. Dampak batch ini
   - Behavior parity `admin/academic -> academic-years` meningkat (dari activate-only menjadi CRUD+activate).
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T06:29:51.091Z`)

## Update Lanjutan (2026-02-21 08:53 UTC)

Tujuan batch ini: lanjut menutup gap behavior parity pada `ADMIN Academic` section kalender akademik (agar mobile tidak lagi sekadar ringkasan).

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API mobile admin untuk kalender akademik
   - File: `src/features/admin/adminApi.ts`
   - Tambahan type:
     - `AdminAcademicEventType`
     - `AdminAcademicEventSemester`
     - `AdminAcademicEvent`
     - `AdminAcademicEventPayload`
   - Tambahan method:
     - `listAcademicEvents`
     - `createAcademicEvent`
     - `updateAcademicEvent`
     - `deleteAcademicEvent`

2. Upgrade `admin/academic` section `academic-calendar` menjadi write-capable
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - filter tahun ajaran kalender
     - filter semester event (ALL/ODD/EVEN)
     - filter jenis event
     - form create/edit event kalender (judul, jenis, rentang tanggal, semester, hari libur, deskripsi)
     - delete event dengan konfirmasi
     - list event dinamis sesuai filter + retry state saat error

3. Dampak batch ini
   - Behavior parity `admin/academic -> academic-calendar` naik dari read-only ringkas ke CRUD event penuh.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T08:53:12.047Z`)

## Update Lanjutan (2026-02-21 08:56 UTC)

Tujuan batch ini: lanjut menutup gap behavior parity pada `ADMIN Academic` untuk section yang sebelumnya masih sample-only (`kkm`, `attendance-recap`, `report-cards`).

Perubahan tambahan yang sudah dilakukan:
1. Upgrade section `kkm` menjadi filter-driven
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan:
     - pencarian mapel
     - filter level KKM (ALL/X/XI/XII)
     - ringkasan rata-rata KKM per level
     - daftar mapel terfilter (bukan hanya sample list)

2. Upgrade section `attendance-recap` dari sample kelas ke pemilihan kelas dinamis
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan:
     - pilih tahun ajaran operasional
     - cari + pilih kelas
     - query rekap keterlambatan by class (`getLateSummaryByClass`) sesuai pilihan user
     - loading/error/retry state khusus section ini

3. Upgrade section `report-cards` dari sample kelas ke pemilihan kelas dinamis
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan:
     - pilih tahun ajaran operasional
     - cari + pilih kelas
     - query ringkasan rapor by class (`getClassReportSummary`)
     - pencarian mapel dalam hasil ringkasan rapor
     - loading/error/retry state khusus section ini

4. Refactor query akademik overview
   - File: `app/(app)/admin/academic.tsx`
   - Hapus ketergantungan sample fetch `lateSummary/classReportSummary` dari query overview utama.
   - Data attendance/report kini diambil melalui query terpisah berbasis filter user.

5. Dampak batch ini
   - Behavior parity section `kkm`, `attendance-recap`, `report-cards` meningkat dari preview/sample menjadi operasional berbasis filter seperti alur web.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T08:56:15.257Z`)

## Aturan Wajib Lanjutan
1. Jangan ubah UI `welcome` dan `login` mobile yang sudah dinyatakan final.
2. Jangan ganggu aplikasi web yang sedang berjalan di production.
3. Selalu sync dulu sebelum lanjut:
   - `cd /var/www/sis-project`
   - `bash ./update_all.sh`

## Perubahan Sudah Dikerjakan (Batch Terakhir)

### 1) Route menu role sudah diarahkan ke native (bukan fallback web)
File: `src/features/dashboard/roleMenu.ts`

Perubahan utama:
- `STUDENT`
  - `student-dashboard` -> `/home`
  - `student-extracurricular` -> `/student/extracurricular`
  - `student-class-attendance` -> `/student/class-attendance`
  - `student-pkl-*` -> `/student/internship?tab=...`
  - `student-exam-*` -> `/exams`
  - `student-finance` -> `/student/finance`
- `ADMIN`
  - `admin-dashboard` -> `/home`
  - `admin-master data` -> `/admin/master-data`
  - `admin-user management` -> `/admin/user-management`
  - `admin-academic` -> `/admin/academic`
  - `admin-settings` -> `/profile`
- `EXAMINER`
  - `examiner-dashboard` -> `/home`
- `PRINCIPAL`
  - `principal-students` -> `/principal/students`
  - `principal-teachers` -> `/principal/teachers`
- `STAFF`
  - `staff-dashboard` -> `/home`
  - `staff-admin` -> `/staff/admin`
- `PARENT`
  - `parent-dashboard` -> `/parent/overview`
- `EXTRACURRICULAR_TUTOR`
  - `tutor-dashboard` -> `/tutor/dashboard`
  - `tutor-members` -> `/tutor/members`

### 2) Screen native baru ditambahkan
- `app/(app)/tutor/dashboard.tsx`
- `app/(app)/tutor/members.tsx`
- `app/(app)/principal/students.tsx`
- `app/(app)/principal/teachers.tsx`
- `app/(app)/staff/admin.tsx`
- `app/(app)/parent/overview.tsx`
- `app/(app)/student/finance.tsx`

## Catatan Teknis per Screen Baru

### `tutor/dashboard`
- Menampilkan assignment ekskul pembina berdasarkan tahun ajaran aktif.
- Tombol item assignment langsung ke `tutor/members` dengan query `ekskulId` + `academicYearId`.

### `tutor/members`
- Menampilkan anggota ekskul per assignment.
- Input nilai + deskripsi native (`SBTS`/`SAS`/`SAT`, semester `ODD`/`EVEN`).
- Menyimpan lewat endpoint `POST /tutor/grades` (via `tutorApi.inputGrade`).

### `principal/students`
- Monitoring data siswa (filter kelas + pencarian).

### `principal/teachers`
- Monitoring data guru (filter duty + pencarian).

### `staff/admin`
- Ringkasan administrasi (siswa + pengajuan anggaran) + shortcut ke `staff/payments` dan `staff/students`.

### `parent/overview`
- Dashboard parent native (ringkasan anak + keuangan + quick actions).

### `student/finance`
- Placeholder native terstruktur (tetap in-app, tidak lempar web).

## Status Verifikasi Saat Ini
Status per 2026-02-21 11:57 UTC:
1. Typecheck: **sudah dijalankan** (`npm run typecheck`)
2. Audit parity terbaru: **sudah dijalankan** (`npm run audit:parity`)
3. Smoke test manual semua route yang baru dipetakan: **belum selesai penuh**
4. Publish OTA pilot: **sudah dipublish**

## Langkah Lanjut Disarankan (Urutan Aman)

### Step 1: Validasi teknis lokal (ulang sebelum release)
```bash
cd /var/www/sis-project/mobile-app
npm run typecheck
npm run audit:parity
```

### Step 2: Baca hasil audit terbaru
- `docs/audit/mobile_parity_audit_latest.md`
- `docs/audit/mobile_parity_audit_latest.json`

Target minimum batch berikut:
- Turunkan jumlah `Web Bridge Route` signifikan dari baseline terakhir.
- Pastikan role yang diprioritaskan user (Teacher, Student, Principal, Staff, Parent, Tutor) tidak lagi mentok di `/web-module/*` untuk menu utama.

### Step 3: Smoke test manual (wajib)
Tes role per role:
1. Login -> Home -> buka menu utama per group
2. Pastikan tidak terpental ke web-module untuk route yang sudah dipetakan
3. Cek aksi CRUD minimal untuk modul yang ada input
4. Logout -> harus kembali aman (no black screen)

### Step 4: Sync + OTA (setelah smoke test lulus)
```bash
cd /var/www/sis-project
bash ./update_all.sh

cd /var/www/sis-project/mobile-app
bash ./scripts/publish-ota-update.sh pilot "Parity batch: native routes for tutor/principal/staff/parent/student finance"
```

## Backlog Prioritas Setelah Batch Ini
1. Hapus fallback `Linking.openURL` internal web di modul teacher/principal/parent yang masih tersisa.
2. Samakan alur penuh modul nilai/materi/absensi dengan web untuk semua role (bukan hanya read-only).
3. Turunkan gap parity sampai menu aktif web = 1:1 di mobile untuk role production.

## Referensi Dokumen Utama
- `docs/audit/MOBILE_WEB_GAP_ACTION_PLAN_2026-02-20.md`
- `docs/audit/mobile_parity_audit_latest.md`
- `scripts/audit-mobile-parity.js`

## Update Lanjutan (2026-02-21 09:18 UTC)

Tujuan batch ini: menutup gap utama `ADMIN Academic -> schedule` agar mobile tidak lagi ringkasan, tetapi operasional seperti web (input per jam + time config + hapus slot).

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API admin untuk manajemen jadwal
   - File: `src/features/admin/adminApi.ts`
   - Tambahan type:
     - `AdminScheduleDayOfWeek`
     - `AdminSchedulePeriodType`
     - `AdminScheduleTimeConfigPayload`
     - `AdminScheduleTimeConfig`
     - `AdminScheduleEntry`
   - Tambahan method:
     - `listSchedules`
     - `createScheduleEntry`
     - `deleteScheduleEntry`
     - `getScheduleTimeConfig`
     - `saveScheduleTimeConfig`

2. Upgrade section `schedule` pada admin academic menjadi write-capable
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - filter tahun ajaran jadwal
     - pilih kelas dinamis (search + chip selector)
     - editor konfigurasi jam:
       - tambah hari
       - tambah/hapus slot periode
       - ubah rentang waktu
       - ubah catatan slot
       - ubah tipe slot (`TEACHING`, `UPACARA`, `ISTIRAHAT`, `TADARUS`, `OTHER`)
       - reset per hari / reset semua
       - simpan konfigurasi ke backend
     - input entri jadwal per rentang `jam pelajaran ke-` (auto map ke period non-non-teaching)
     - hapus slot jadwal dari grid
     - render grid jadwal per hari + indikator non-teaching

3. Dampak batch ini
   - Behavior parity `admin/academic -> schedule` naik dari summary-only menjadi operasional penuh (create/delete slot + konfigurasi waktu) setara alur web.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-23 04:40 UTC)

Tujuan batch ini: stabilisasi production setelah temuan `Program Kerja` gagal memuat di mobile, plus verifikasi guard PKL examiner.

Perubahan yang sudah dilakukan:
1. Hardening query `work-programs` agar tidak gagal ketika `limit > 100`
   - File: `backend/src/controllers/workProgram.controller.ts`
   - Perubahan:
     - validasi `limit` tidak lagi melempar error `max(100)`.
     - nilai `limit` sekarang di-clamp aman: `Math.min(parsed.limit ?? 10, 100)`.
   - Dampak:
     - client lama / query agresif tidak lagi langsung `400` hanya karena `limit` terlalu besar.
     - mengurangi kemungkinan layar `Gagal memuat data program kerja`.

2. Verifikasi guard PKL examiner pada data live
   - Query validasi Prisma (production DB) menunjukkan:
     - `totalWithExaminer: 0`
     - `invalidCount: 0` (tidak ada assignment examiner non-TEACHER)

3. Verifikasi parity menu (teacher + examiner)
   - Simulasi `getGroupedRoleMenu`:
     - Program Kerja berada di dalam grup duty terkait (bukan grup terpisah global).
     - Role EXAMINER tidak lagi memuat menu penguji/sidang PKL.

Deployment & validasi operasional:
- `npm run build` (backend) sukses
- `npm run service:health` => `Web:200`, `API:200`
- `bash ./update_all.sh` sukses (backend restart + frontend deploy)
- `npm run audit:parity` sukses
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-22 22:14 UTC)

Tujuan batch ini: menyelesaikan mismatch data `Ujian Guru` antara web dan mobile (kasus paket masih muncul di mobile walau di web sudah bersih).

Perubahan tambahan yang sudah dilakukan:
1. Sinkronisasi query paket ujian mobile agar setara web
   - File: `src/features/exams/useTeacherExamPacketsQuery.ts`
   - Perubahan:
     - query sekarang menyertakan `type`
     - query key juga menyertakan `type` agar cache antar filter tidak tercampur

2. Hard refresh endpoint paket ujian (anti stale response)
   - File: `src/features/exams/examApi.ts`
   - Perubahan:
     - `getTeacherPackets` menambahkan `_t` timestamp param
     - header no-cache ditambahkan (`Cache-Control`, `Pragma`, `Expires`)

3. Filter semester & tipe di layar paket ujian guru
   - File: `src/features/exams/TeacherExamPacketsModuleScreen.tsx`
   - Perubahan:
     - filter query ke API kini memakai `type` + `semester` aktif
     - halaman `SAS`/`SAT` mengunci semester sesuai konsep (ganjil/genap)
     - halaman lain menampilkan chip filter semester (`Semua`, `Ganjil`, `Genap`)
     - filtering client-side juga mengecek semester agar hasil konsisten

4. Publish OTA
   - Branch: `pilot`
   - Message: `Fix exam packets sync: enforce type+semester filters and bypass stale cache`
   - Update group ID: `9a6c628e-ac0a-414b-b638-c1e7243c4f24`
   - Android update ID: `019c876a-de10-7e4b-8743-17b4da74325f`

Catatan:
- Push broadcast endpoint merespon sukses, tetapi `recipients=0` (device push token belum terdaftar aktif di backend saat publish ini).

## Update Lanjutan (2026-02-23 01:32 UTC)

Tujuan batch ini: merapikan UX halaman `Ujian Formatif` dan mengembalikan posisi `Program Kerja` agar tidak menjadi kategori terpisah.

Perubahan tambahan yang sudah dilakukan:
1. UX filter halaman paket ujian guru (`Ujian Formatif/SBTS/SAS/SAT`)
   - File: `src/features/exams/TeacherExamPacketsModuleScreen.tsx`
   - Perubahan:
     - menambahkan label eksplisit untuk field pencarian (`Cari Paket Ujian`)
     - menambahkan `placeholderTextColor` agar placeholder tidak terlihat seperti kotak kosong
     - filter semester tidak lagi default `Semua`; sekarang default mengikuti semester aktif
     - chip semester non-fixed menjadi hanya `Ganjil/Genap` (lebih konsisten dengan alur web)
     - untuk menu `SAS/SAT`, semester tetap dikunci sesuai tipe ujian

2. Sinkron data semester aktif di query assignment
   - File: `src/features/academicYear/academicYearApi.ts`
   - File: `src/features/teacherAssignments/useTeacherAssignmentsQuery.ts`
   - Perubahan:
     - menambahkan typing `semester` pada payload tahun ajaran aktif agar default semester filter bisa diturunkan secara konsisten

3. Program Kerja kembali ke dalam duty (bukan kategori baru terpisah)
   - File: `src/features/dashboard/roleMenu.ts`
   - Perubahan:
     - `teacher-work-program` dipindahkan secara dinamis ke group duty yang aktif (prioritas: KAKOM, WAKAKUR, WAKASIS, SARPRAS, HUMAS, dst)
     - group `PROGRAM KERJA` standalone akan otomatis hilang jika item sudah dipindahkan ke group duty

4. Publish OTA
   - Branch: `pilot`
   - Message: `Fix exam screen clarity + default active semester + move work-program into duty group`
   - Update group ID: `730ddeba-fb79-4853-ac5c-cb5f532706f5`
   - Android update ID: `019c881f-e5c3-7648-88ca-db466ecb20fe`

## Update Lanjutan (2026-02-23 02:02 UTC)

Tujuan batch ini: memperbaiki error `Gagal memuat data program kerja` di mobile.

Temuan akar masalah:
- Endpoint backend `GET /work-programs` membatasi `limit <= 100` (validasi zod).
- Mobile mengirim `limit: 200` sehingga request gagal validasi dan data tidak pernah tampil.

Perbaikan:
1. Sanitasi limit pada API client mobile
   - File: `src/features/workPrograms/workProgramApi.ts`
   - Menambahkan helper `sanitizeListLimit` yang mengunci `limit` maksimal 100 sebelum request dikirim.

2. Sinkronisasi limit query owner
   - File: `src/features/workPrograms/TeacherWorkProgramModuleScreen.tsx`
   - `ownerQuery` diubah dari `limit: 200` menjadi `limit: 100`.

Validasi:
- `npm run typecheck` (sukses)

Publish OTA:
- Branch: `pilot`
- Message: `Fix work-program load failure: cap list limit to backend max 100`
- Update group ID: `76087c92-a6cc-442a-b00d-db588755ff36`
- Android update ID: `019c883b-ee4d-72aa-b765-3447b553c622`

## Update Lanjutan (2026-02-21 14:06 UTC)

Tujuan batch ini: mengamankan proses release/deploy saat repo root sedang sangat dirty agar production tetap stabil.

Perubahan/eksekusi tambahan yang sudah dilakukan:
1. Tambah guardrail release lintas scope di root repo
   - File: `scripts/repo-safety-gate.sh`
   - Perubahan:
     - mode `mobile/web/all` untuk blokir perubahan out-of-scope.
     - validasi teknis otomatis:
       - mobile: `typecheck` + `audit:parity`
       - web: `backend build` + `frontend build`

2. Integrasikan guardrail ke deploy web/back-end
   - File: `update_all.sh`
   - Perubahan:
     - sebelum deploy, script menjalankan `repo-safety-gate.sh web`.
     - bypass darurat tersedia via `ALLOW_DIRTY_DEPLOY=1`.

3. Integrasikan guardrail ke publish OTA mobile
   - File:
     - `mobile-app/scripts/publish-ota-safe.sh` (baru)
     - `mobile-app/scripts/publish-ota-live-auto.sh`
     - `mobile-app/package.json`
   - Perubahan:
     - `npm run update:*` sekarang lewat wrapper aman yang menjalankan gate mode `mobile`.
     - bypass darurat tersedia via `ALLOW_DIRTY_OTA=1`.

4. Tambah tooling isolasi perubahan dirty agar tidak campur scope
   - File:
     - `scripts/scope-diff-report.sh` (baru)
     - `scripts/stage-scope.sh` (baru)
     - `ops/REPO_SAFETY_PLAYBOOK.md` (baru)
   - Fungsi:
     - generate laporan perubahan per scope (`backend/frontend/mobile/scripts/other`)
     - dry-run/apply staging per scope.
     - SOP operasional release aman.

5. Verifikasi setelah patch
   - `bash ./scripts/repo-safety-gate.sh web` -> sukses.
   - `bash ./scripts/repo-safety-gate.sh mobile` -> block by design (karena ada perubahan backend/frontend out-of-scope).
   - `npm run update:pilot` -> block by design saat scope campur (safety aktif).

## Update Lanjutan (2026-02-21 13:24 UTC)

Tujuan batch ini: eksekusi 2 langkah operasional pasca parity (`gate check` + `publish OTA pilot`).

Perubahan/eksekusi tambahan yang sudah dilakukan:
1. Jalankan gate check release mobile
   - Perintah:
     - `npm run check:release`
   - Hasil:
     - `release:check` sukses
     - `readiness` sukses
     - `expo-doctor` gagal karena jaringan DNS/intermittent:
       - `EAI_AGAIN registry.npmjs.org`

2. Jalankan validasi lokal pengganti (tanpa dependency network)
   - Perintah:
     - `npm run typecheck` (sukses)
     - `npm run audit:parity` (sukses)
   - Output audit terbaru:
     - `docs/audit/mobile_parity_audit_latest.md`
     - `docs/audit/mobile_parity_audit_latest.json`

3. Coba publish OTA ke channel `pilot` dengan retry
   - Perintah:
     - `XDG_CACHE_HOME=/tmp/.cache NPM_CONFIG_CACHE=/tmp/.npm OTA_MAX_ATTEMPTS=5 bash ./scripts/publish-ota-update.sh pilot "Mobile parity final pass: role CRUD parity sync"`
   - Hasil:
     - Gagal sampai attempt 5/5.
     - Error utama:
       - `request to https://api.expo.dev/graphql failed`
     - Status: **OTA belum terbit** (bukan gagal logic app, tapi blokir konektivitas ke layanan Expo).

4. Diagnostik jaringan ringkas saat insiden
   - `curl https://api.expo.dev` -> gagal connect (`000`)
   - `curl https://registry.npmjs.org` -> gagal resolve host (`000`)
   - Indikasi: masalah konektivitas DNS/network environment, bukan regression parity code.

## Update Lanjutan (2026-02-21 13:10 UTC)

Tujuan batch ini: menutup gap behavior parity tersisa pada `TEACHER (HUMAS/KAKOM)` dan `TEACHER (SARPRAS)` agar operasi CRUD inti bisa dilakukan native di mobile.

Perubahan tambahan yang sudah dilakukan:
1. Humas/KAKOM: aktifkan CRUD Mitra Industri + Lowongan BKK di mobile
   - File:
     - `src/features/humasModule/humasApi.ts`
     - `src/features/humasModule/TeacherHumasModuleScreen.tsx`
     - `src/features/headProgram/headProgramApi.ts`
     - `src/features/headProgram/types.ts`
     - `src/features/headProgram/TeacherHeadProgramModuleScreen.tsx`
   - Tambahan capability:
     - create/update/delete partner
     - create/update/delete vacancy
     - form edit native + validasi minimal + refresh data pasca aksi

2. Backend akses write Humas disesuaikan ke duty-based teacher
   - File: `backend/src/routes/humas.routes.ts`
   - Perubahan:
     - write route sekarang pakai kombinasi `roleMiddleware(['ADMIN','TEACHER'])` + `dutyMiddleware(['WAKASEK_HUMAS','SEKRETARIS_HUMAS','KAPROG'])`
   - Dampak:
     - akun teacher dengan duty relevan kini bisa menjalankan CRUD Humas/KAKOM dari mobile secara valid.

3. Sarpras Inventory: naik dari monitoring-only menjadi CRUD native
   - File:
     - `src/features/sarpras/sarprasApi.ts`
     - `app/(app)/teacher/sarpras-inventory.tsx`
   - Tambahan capability:
     - kategori ruang: create/update/delete
     - ruangan: create/update/delete
     - item inventaris: create/update/delete
     - form editor native per section + aksi edit/hapus pada card list
   - Gate akses:
     - struktur (kategori/ruang): Wakasek/sekretaris sarpras
     - item inventaris: Wakasek/sekretaris sarpras + kepala lab/perpustakaan (sesuai scope)

4. Backend akses write Inventory dipisah sesuai tingkat hak
   - File: `backend/src/routes/inventory.routes.ts`
   - Perubahan:
     - `structureWriteMiddleware` untuk kategori/ruangan (sarpras core)
     - `itemWriteMiddleware` untuk item inventaris (sarpras core + kepala lab/perpustakaan)

5. Sarpras Budgets: tambah alur audit LPJ native
   - File:
     - `src/features/sarpras/types.ts`
     - `src/features/sarpras/sarprasApi.ts`
     - `app/(app)/teacher/sarpras-budgets.tsx`
   - Tambahan capability:
     - load invoice LPJ per budget
     - audit item LPJ (sesuai/tidak sesuai)
     - simpan berita acara audit LPJ
     - keputusan sarpras: approve / return / send to finance

6. Dampak batch ini
   - Behavior parity `teacher/humas-partners` dan `teacher/kakom-partners` naik ke write-capable native (CRUD).
   - Behavior parity `teacher/sarpras-inventory` naik ke write-capable native (CRUD struktur + item sesuai hak).
   - Behavior parity `teacher/sarpras-budgets` naik dari forward-only ke audit LPJ operasional.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `cd mobile-app && npm run typecheck` (sukses)
- `cd backend && npm run build` (sukses)
- `cd mobile-app && npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md` (generated `2026-02-21T13:10:45.131Z`)

## Update Lanjutan (2026-02-21 11:57 UTC)

Tujuan batch ini: release OTA channel `pilot` untuk hasil parity terbaru.

Perubahan tambahan yang sudah dilakukan:
1. Validasi pra-rilis
   - `npm run typecheck` (sukses)
   - `npm run audit:parity` (sukses)
   - `npm run release:check` (sukses)
   - `npm run readiness` (sukses)

2. Publish OTA `pilot` berhasil
   - Command:
     - `bash ./scripts/publish-ota-update.sh pilot "Mobile parity final pass: homeroom + training/head-lab bridge cleanup"`
   - Hasil publish:
     - Branch: `pilot`
     - Runtime version: `0.1.0`
     - Platform: `android`
     - Update group ID: `15a089ae-55b2-4fd9-994c-d41a268332bd`
     - Android update ID: `019c800f-466b-7ea2-a1b0-172acca4fc49`
     - Dashboard: `https://expo.dev/accounts/tripleone.mzn/projects/sis-kgb2-mobile/updates/15a089ae-55b2-4fd9-994c-d41a268332bd`

3. Push notify update
   - Endpoint notify:
     - `http://127.0.0.1:3000/api/mobile-updates/broadcast`
   - Status:
     - berhasil terkirim (tanpa secret)

## Update Lanjutan (2026-02-21 11:04 UTC)

Tujuan batch ini: menutup sisa pola `TeacherWebBridge` yang masih menampilkan tombol escape ke web pada modul yang di web sendiri masih placeholder (`training/*` dan `head-lab/{schedule,incidents}`).

Perubahan tambahan yang sudah dilakukan:
1. Refactor `TeacherWebBridgeModuleScreen` menjadi parity placeholder native
   - File: `src/features/teacherBridge/TeacherWebBridgeModuleScreen.tsx`
   - Hapus dependency fallback web:
     - `openWebModuleRoute`
     - prop wajib `webPath`
     - mapping internal `MODULE_KEY_BY_WEB_PATH`
     - tombol `Buka Modul Web`
   - Ubah default helper copy menjadi status parity placeholder (mobile = web).
   - Quick action dipertahankan untuk navigasi route native antar modul.

2. Hapus `webPath` pada wrapper screen terkait
   - File:
     - `app/(app)/teacher/training-classes.tsx`
     - `app/(app)/teacher/training-attendance.tsx`
     - `app/(app)/teacher/training-grades.tsx`
     - `app/(app)/teacher/training-materials.tsx`
     - `app/(app)/teacher/training-reports.tsx`
     - `app/(app)/teacher/head-lab-schedule.tsx`
     - `app/(app)/teacher/head-lab-incidents.tsx`

3. Dampak batch ini
   - Modul training dan head-lab (schedule/incidents) sekarang native placeholder-only, tanpa fallback tombol web.
   - `openWebModuleRoute` tersisa untuk kebutuhan link dokumen/lampiran (bukan fallback modul fitur).
   - String `Buka Modul Web` tersisa hanya di route utilitas `app/(app)/web-module/[moduleKey].tsx`.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 11:01 UTC)

Tujuan batch ini: menutup sisa fallback tombol web pada modul wali kelas rapor (`SBTS/SAS/SAT`) yang secara fungsi sudah berjalan native.

Perubahan tambahan yang sudah dilakukan:
1. Bersihkan fallback web di `HomeroomReportModuleScreen`
   - File: `src/features/homeroomReports/HomeroomReportModuleScreen.tsx`
   - Hapus import/helper:
     - `openWebModuleRoute`
     - `MODULE_MENU_KEY`
     - `webPath` pada konfigurasi modul
   - Hapus seluruh tombol:
     - `Buka Modul Web (Cetak Lengkap)`
     - `Buka Modul Web (Leger Detail)`
     - `Buka Modul Web (Input Detail)`
     - `Buka Modul Web (Detail Peringkat)`

2. Dampak batch ini
   - Modul `teacher/homeroom-sbts`, `teacher/homeroom-sas`, `teacher/homeroom-sat` kini benar-benar native-only di level UX (tanpa tombol escape ke web).
   - Laporan rapor/leger/ekstrakurikuler/peringkat tetap berjalan native untuk konteks wali kelas.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 10:18 UTC)

Tujuan batch ini: reduksi fallback behavior tambahan pada modul ujian guru.

Perubahan tambahan yang sudah dilakukan:
1. Hilangkan web fallback prop pada route `teacher/exams`
   - File: `app/(app)/teacher/exams.tsx`
   - `webPath="/teacher/exams"` dihapus.
   - Dampak: tombol fallback `Buka Modul Web` di layar daftar ujian tidak muncul lagi untuk route ini.

2. Dampak batch ini
   - Ketergantungan fallback web behavior berkurang pada entry ujian guru.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 10:15 UTC)

Tujuan batch ini: menutup gap behavior parity pada modul `TEACHER -> PKL (Sidang)` yang sebelumnya masih mengarahkan input komponen nilai detail ke web.

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API mobile internship duty untuk nilai sidang
   - File: `src/features/internshipDuty/internshipDutyApi.ts`
   - Tambahan method:
     - `gradeDefense` (`POST /internships/:id/grade-defense`)

2. Perluasan tipe data internship duty
   - File: `src/features/internshipDuty/types.ts`
   - Tambahan field pada `InternshipDutyRow`:
     - `scorePresentation`
     - `scoreUnderstanding`
     - `scoreRelevance`
     - `scoreSystematics`
     - `defenseNotes`

3. Upgrade layar `TeacherInternshipDutyModuleScreen` (mode `DEFENSE`)
   - File: `src/features/internshipDuty/TeacherInternshipDutyModuleScreen.tsx`
   - Tambahan fitur native:
     - pilih siswa sidang langsung dari daftar (context selector)
     - form input 4 komponen nilai sidang (`Presentasi`, `Pemahaman`, `Relevansi`, `Sistematika`)
     - catatan sidang (opsional)
     - preview rata-rata komponen realtime
     - simpan nilai sidang langsung ke backend
     - refresh data pasca save (nilai sidang + nilai akhir)
   - Perubahan behavior:
     - teks petunjuk “gunakan modul web untuk input detail” dihapus
     - tombol `Buka Modul Web` dihapus dari modul internship duty

4. Penyesuaian route wrapper guru PKL
   - File:
     - `app/(app)/teacher/internship-guidance.tsx`
     - `app/(app)/teacher/internship-defense.tsx`
   - Properti `webPath` dihapus karena alur utama sudah native.
   - Subtitle sidang diperbarui agar mencerminkan input nilai native.

5. Dampak batch ini
   - Behavior parity `teacher/internship-defense` naik dari monitoring-only + fallback web menjadi write-capable native.
   - Ketergantungan fallback web pada modul duty PKL berkurang.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 10:10 UTC)

Tujuan batch ini: menutup gap behavior parity pada menu `TEACHER -> Learning Resources`, khususnya modul `CP` yang sebelumnya masih status + tombol fallback web.

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API mobile learning resources untuk save dokumen CP
   - File: `src/features/learningResources/learningResourcesApi.ts`
   - Tambahan method:
     - `saveCpTpAnalysis`

2. Upgrade layar `teacher/learning-*` menjadi CP native editor
   - File: `src/features/learningResources/TeacherLearningResourceScreen.tsx`
   - Fitur native baru untuk section `CP`:
     - load dokumen CP by context (guru/mapel/level/tahun ajaran)
     - form `Elemen CP` + `Teks CP`
     - generator analisis otomatis dari teks CP
     - tambah/edit/hapus item analisis manual (`kompetensi`, `materi`, `tujuan`, `profil`)
     - simpan baris analisis ke dokumen (upsert ke backend)
     - edit/hapus baris dokumen yang sudah tersimpan
     - edit metadata dokumen (`principalName`, `titimangsa`) dan simpan
     - status `last saved` dari response backend

3. Penyesuaian parity untuk section non-CP (`ATP/PROTA/PROMES/MODULES/KKTP`)
   - `openWebModuleRoute` dihapus dari layar ini.
   - Non-CP sekarang menampilkan status parity placeholder yang sama dengan kondisi web saat ini (coming soon), tanpa jalur fallback web bridge.

4. Dampak batch ini
   - Behavior parity `teacher/learning-cp` naik dari monitor + redirect web menjadi editor native write-capable.
   - Ketergantungan fallback web internal berkurang pada modul learning resources.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 10:00 UTC)

Tujuan batch ini: menutup gap behavior parity pada `ADMIN Academic` untuk section `question-bank` dan `exam-sessions`.

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API admin untuk modul ujian (bank soal + sesi ujian)
   - File: `src/features/admin/adminApi.ts`
   - Tambahan type:
     - `AdminExamType`
     - `AdminExamQuestionType`
     - `AdminExamPacket`
     - perluasan detail `AdminExamQuestion` dan `AdminExamSchedule`
   - Tambahan method:
     - `listExamPackets`
     - `createExamSchedule`
     - `updateExamSchedule`
     - `deleteExamSchedule`
     - `listExamSchedules` diperluas dukung parameter filter

2. Upgrade section `question-bank` dari summary-only jadi filter-driven
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - filter tahun ajaran
     - filter mapel (search + selector)
     - filter tipe soal
     - filter semester
     - pencarian konten soal (submit search)
     - pagination (`Prev`/`Next`)
     - list soal dengan metadata mapel/tahun/semester + preview isi soal

3. Upgrade section `exam-sessions` menjadi operasional
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - filter tahun ajaran + tipe ujian + search sesi
     - statistik sesi (total/aktif/nonaktif/siap paket)
     - form pembuatan sesi ujian:
       - pilih paket ujian
       - pilih multi-kelas
       - set tanggal + jam mulai/selesai
       - ruang (opsional)
       - pengawas (opsional)
     - aksi pada list sesi:
       - aktif/nonaktifkan sesi (`PATCH /exams/schedules/:id`)
       - hapus sesi (`DELETE /exams/schedules/:id`)

4. Dampak batch ini
   - Behavior parity `admin/academic -> question-bank` naik dari ringkasan total soal menjadi filter/list operasional.
   - Behavior parity `admin/academic -> exam-sessions` naik dari preview list menjadi create/manage sesi (activate/deactivate/delete).
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 09:26 UTC)

Tujuan batch ini: menutup gap behavior parity `ADMIN Academic -> report-cards`, khususnya mode peringkat kelas per semester.

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API admin untuk data ranking rapor
   - File: `src/features/admin/adminApi.ts`
   - Tambahan type:
     - `AdminClassRankingRow`
     - `AdminClassRankingsResponse`
   - Tambahan method:
     - `getClassRankings`

2. Upgrade section `report-cards` dengan mode `Leger` + `Ranking`
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - switch mode:
       - `Leger Nilai` (existing summary + filter mapel)
       - `Peringkat Kelas`
     - mode ranking:
       - filter semester (`ODD`/`EVEN`)
       - query ranking (`/reports/rankings`)
       - statistik ranking (total siswa, rata-rata nilai, top student)
       - list ranking per siswa (rank, averageScore, totalScore, subjectCount)

3. Dampak batch ini
   - Behavior parity `admin/academic -> report-cards` meningkat: mobile kini mendukung alur ranking per semester yang sebelumnya hanya ada di web.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 09:24 UTC)

Tujuan batch ini: menutup gap behavior parity `ADMIN Academic -> attendance-recap` agar mobile menampilkan rekap absensi harian seperti web (bukan hanya late summary).

Perubahan tambahan yang sudah dilakukan:
1. Perluasan API admin untuk rekap absensi harian
   - File: `src/features/admin/adminApi.ts`
   - Tambahan type:
     - `AdminAttendanceSemesterFilter`
     - `AdminAttendanceDailyRecap`
   - Tambahan method:
     - `getDailyAttendanceRecap`

2. Upgrade section `attendance-recap` menjadi filter-driven + data lengkap
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - filter periode (`ALL`, `ODD`, `EVEN`)
     - fetch rekap absensi harian (`/attendances/daily/recap`) berbasis tahun ajaran + kelas + semester
     - tampilkan rentang tanggal data (`dateRange`) saat tersedia
     - statistik agregat absensi (hadir/telat/rata-rata kehadiran)
     - daftar rekap harian per siswa (hadir/telat/sakit/izin/alpha/persentase)
     - tetap menampilkan rekap keterlambatan (`late-summary`) sebagai panel lanjutan

3. Dampak batch ini
   - Behavior parity `admin/academic -> attendance-recap` meningkat dari ringkasan telat saja menjadi rekap absensi + telat yang jauh lebih mendekati halaman web.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`

## Update Lanjutan (2026-02-21 09:22 UTC)

Tujuan batch ini: menutup gap behavior parity `ADMIN Academic -> teaching-load` agar mobile tidak lagi hanya preview top list.

Perubahan tambahan yang sudah dilakukan:
1. Upgrade section `teaching-load` menjadi filter-driven
   - File: `app/(app)/admin/academic.tsx`
   - Tambahan fitur native:
     - filter tahun ajaran
     - filter guru (search + chip selector)
     - statistik agregat:
       - jumlah guru
       - total sesi/jam
       - rata-rata jam per guru
     - daftar detail per guru:
       - total kelas/mapel/sesi/jam
       - breakdown per mapel (classCount/sessionCount/hours)

2. Refactor query overview akademik
   - File: `app/(app)/admin/academic.tsx`
   - Fetch `teachingLoad` dikeluarkan dari query overview utama untuk menghindari fetch ganda.
   - Data teaching load kini diambil via query khusus section dengan filter user.

3. Dampak batch ini
   - Behavior parity `admin/academic -> teaching-load` naik dari preview-only menjadi operasional berbasis filter seperti halaman web.
   - Route parity tetap bersih:
     - `Native + Web Fallback` = **0**
     - `Web Bridge Route` = **0**

Validasi yang sudah dijalankan setelah patch:
- `npm run typecheck` (sukses)
- `npm run audit:parity` (sukses)
- Audit terbaru: `docs/audit/mobile_parity_audit_latest.md`
