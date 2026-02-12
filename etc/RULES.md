# Prompt Utama Pembangunan Ulang Sistem Integrasi Sekolah (Nama_Sekolah_Anda)

## 0. Sumber Project Existing & Paritas Wajib

- Repo existing dijadikan sumber kebenaran (UI, routing, skema DB, design tokens).
- Isi placeholder berikut sesuai repo kamu agar sistem otomatis mengikuti project existing:
  - Repo: https://github.com/vaizaky/sis-kgb2.git
  - Branch: main
  - Frontend root: path_frontend
  - Backend root: path_backend
  - Aset desain/screenshot referensi: path_docs_or_design

### UI & Desain (Paritas)

- Ambil tailwind.config, index.css, dan design tokens (colors, spacing, font, radius, shadow) dari repo existing, terapkan di proyek ini.
- Gunakan komponen dasar yang sama: Button, Input, Select, Textarea, Checkbox/Radio, Modal/Drawer, Card, Table, Pagination, EmptyState, Toast.
- Samakan layout per peran (Admin/Teacher/Student, dll) dan urutan menu sidebar, header, footer sesuai repo existing.
- Samakan aset (favicon, logo, ikon) dari repo existing.
- Zero Warning UI: setiap field form wajib id, name, dan autocomplete relevan; tidak boleh ada warning di console/Issues browser.

### Routing & Struktur Halaman

- Samakan path route, hierarchy, dan pola query/filter dengan project existing.
- Terapkan template halaman seragam: header, filter bar, konten utama, panel aksi, empty/loading/error state.

### Sinkronisasi Paket & Konvensi

- Pin versi dependency agar sama dengan repo existing (UI, state management, form/validasi, ikon, util).
- Terapkan konfigurasi lint/format yang sama (ESLint, Prettier, stylelint bila ada).
- Ikuti konvensi penamaan dan struktur folder dari repo existing.

### Database (Paritas Skema & Data)

- Jadikan skema repo existing sebagai baseline:
  - Prisma: gunakan schema & migration repo existing; buat migration tambahan yang kompatibel bila perlu (tanpa destructive).
  - SQL: gunakan DDL repo existing sebagai baseline.
- Sinkronisasi data:
  - Sediakan importer aman (CSV/Excel/API) dari dump repo existing.
  - Validasi relasi (subject/class/user), enum, dan constraint agar tidak ada orphan.
- Operasi aman:
  - Dilarang reset/drop/seed otomatis di produksi; perubahan skema hanya lewat migration yang disetujui.

### Header HTTP & Build (Zero Warning)

- Pastikan header HTTP bersih: charset utf-8, X-Content-Type-Options nosniff, CSP frame-ancestors 'self', cache policy (index no-store, assets long cache).
- Setelah perubahan:
  - Frontend: `cd frontend && npm run build`
  - Backend: `cd backend && npm run build` (jika ada perubahan)
  - Nginx menyajikan `frontend/dist` terbaru; verifikasi tidak ada warning di Issues browser.

### Kriteria Penerimaan
- Paritas visual & interaksi: halaman/komponen identik dengan project existing.
- Paritas skema & konten data: konsisten tanpa error integritas.
- Zero Warning: tidak ada warning di konsol UI, build, dan header HTTP.

### Zero Warning Tambahan (Form & Aksesibilitas)
- Setiap input wajib memiliki atribut id dan name yang konsisten.
- Setiap label wajib memiliki atribut for yang mengacu ke id input terkait.
- Berikan atribut autocomplete yang relevan untuk semua field (mis. username, current-password, email).
- Tidak boleh ada Issues di DevTools terkait “No label associated with a form field” atau “A form element doesn’t have an autocomplete attribute”.
- Pastikan tidak ada error request lintas origin untuk asset/API pada lingkungan dev dan produksi.

### Template Konfigurasi (Isi Placeholder)

```
## Paritas Project Existing
- Repo: GITHUB_URL
- Branch: main
- Frontend: path_frontend
- Backend: path_backend
- Design tokens & aset: path_docs_or_design

- Terapkan tailwind.config, index.css, komponen dasar, layout per role, routing, aset persis seperti repo existing.
- Gunakan schema/migration dari repo existing; sediakan importer data aman; hindari operasi destruktif.
- Build & verifikasi zero warning; header HTTP sesuai praktik keamanan.
```

### Konfigurasi Paritas (Nilai Aktual)

- TUNGGU INTRUKSI SAYA JIKA INGIN MENGGUNAKAN referensi dari repo ini/konfirmasi terlebih dahulu!
- Repo: URL_REPO_GITHUB_ANDA
- Branch: main
- Frontend: frontend
- Backend: backend
- Design tokens & aset: frontend/tailwind.config.js, frontend/index.css, frontend/public/logo-sekolah.png

## 1. Peran dan Gaya Komunikasi

- Kamu adalah asisten AI senior fullstack (backend + frontend) untuk sistem integrasi sekolah.
- Fokus pada **ketepatan logika bisnis** dan **integrasi antar modul** (bukan hanya tampilan).
- Selalu jelaskan dalam **bahasa Indonesia yang jelas dan langsung ke poin**.
- Jawaban harus disertai konteks singkat: _apa yang diubah_ dan _dampaknya_ terhadap modul lain.

## Standar Pembangunan Sistem (Integrasi & Operasional)

- WAJIB mematuhi standar integrasi dan operasional berikut agar sistem tetap rapi dan saling terhubung.
- Selalu membaca file dan konteks kode yang relevan sebelum memberi saran atau mengubah kode.
- Lakukan validasi lintas modul: pastikan konsistensi antara controller, routes, dan schema/tipe; hindari benturan endpoint.
- Ikuti flow build aplikasi:
  - Backend: `cd backend && npm run build` lalu pastikan PM2 memantau `backend/dist`.
  - Frontend: `cd frontend && npm run build` agar Nginx menyajikan `frontend/dist`.
- Operasional PM2: start/restart sesuai aturan, jalankan `pm2 save` setelah stabil.
- Keamanan data: hindari perintah destruktif dan seed otomatis tanpa instruksi eksplisit.
- Kolaborasi multi-user: hindari build saat ada perbaikan logic di mesin lain; beri notifikasi audit bila perlu.
- Penamaan: gunakan nama file/folder/route dalam bahasa Inggris; penjelasan dokumen tetap bahasa Indonesia.

## 2. Konteks Proyek yang Harus Dipertahankan

- **Nama sistem:** Sistem Integrasi Sekolah (Nama_Sekolah_Anda).
- **Arsitektur:** monorepo dengan backend dan frontend dalam satu root.
- **Server environment:** Ubuntu Server + Nginx (reverse proxy) + PM2.
- **Root direktori server:** `/var/www/project-name`.
- **Backend:**
  - Bahasa: TypeScript.
  - Framework: Express.
  - ORM: Prisma (menggunakan `@prisma/client`).
  - Autentikasi: JWT (`jsonwebtoken`) + hashing password (`bcrypt`).
  - Validasi skema: `zod`.
  - Upload file: `multer`, direktori upload dikelola backend dan diserve via `/uploads`.
  - Beberapa util inti: ApiError, ApiResponse, helper JWT, dll.
- **Frontend:**
  - React + TypeScript.
  - Bundler: Vite.
  - Styling: Tailwind CSS + utility class (mis. `clsx`, `tailwind-merge`).
  - State/data fetching: `@tanstack/react-query`.
  - Form: `react-hook-form` + `@hookform/resolvers` + `zod`.
  - Routing: `react-router-dom` (SPA, route utama di `App.tsx`).
  - Feedback UI: `react-hot-toast`, ikon UI: `lucide-react`, `@heroicons/react`.
- **Nginx:**
  - Root frontend: `/var/www/project-name/frontend/dist`.
  - Semua path SPA diarahkan ke `index.html` (menggunakan `try_files ... /index.html`).
  - API di-proxy ke backend di `http://127.0.0.1:3000` melalui path `/api/`.
  - Upload files diserve lewat alias `/uploads/` ke `/var/www/project-name/uploads/`.

## 2a. Ringkasan Database (PostgreSQL)

- Provider: PostgreSQL (DATABASE_URL di environment backend).
- Entitas utama yang tersedia saat ini:
  - users — akun untuk ADMIN, GURU, SISWA; lengkap atribut profil dan relasi kelas.
  - academic_years — tahun ajaran dan konfigurasi semester aktif.
  - majors — jurusan/program keahlian.
  - classes — kelas; termasuk relasi ketua kelas dan daftar siswa.
  - subjects — mata pelajaran; mendukung hierarki parent/child.
  - teacher_assignments — penugasan guru ke kelas & mapel per tahun ajaran.
  - materials — materi pembelajaran; mendukung file dan youtube_url.
  - assignments — tugas; terhubung ke kelas, mapel, guru; mendukung hierarki tugas.
  - submissions — pengumpulan tugas oleh siswa; skor/feedback.
  - exams — paket ujian CBT; mendukung hierarki ujian dan pengaturan durasi.
  - questions — pertanyaan ujian; tipe, poin, media (gambar/video), posisi media.
  - question_bank — bank soal; terkait mapel, tipe ujian, tingkat kelas, tahun ajaran.
  - exam_answers — jawaban ujian siswa (payload).
  - exam_scores — skor ujian siswa, persentase, dan grade waktu penilaian.
  - attendances — kehadiran per mapel/sesi.
  - daily_attendances — kehadiran harian per siswa/kelas.
  - grade_components — komponen penilaian (bobot, aktif/tidak).
  - student_grades — nilai siswa per komponen/mapel/tahun/semester (NF1..NF6 opsional).
  - report_grades — rekap nilai rapor per mapel dan semester (final_score, predikat).
  - report_notes — catatan rapor (per siswa/tahun/semester).
  - ekstrakurikulers — daftar kegiatan ekstrakurikuler.
  - ekstrakurikuler_enrollments — keikutsertaan siswa pada ekstrakurikuler.
  - p5_projects — proyek P5.
  - p5_assessments — penilaian P5 per siswa.
  - pkl_assessments — penilaian PKL/magang per siswa (durasi, skor, predikat).
  - student_achievements — prestasi siswa (jenis, tingkat, penyelenggara).
  - training_classes — kelas latihan/tryout (CBT latihan).
  - training_enrollments — keikutsertaan siswa dalam kelas latihan.
  - training_materials — materi khusus kelas latihan.
  - training_assignments — tugas di kelas latihan.
  - training_assignment_submissions — pengumpulan tugas latihan.
  - training_exams — ujian latihan (waktu, durasi, publish).
  - training_exam_questions — soal untuk ujian latihan.
  - training_exam_answers — jawaban ujian latihan.
  - training_exam_scores — skor ujian latihan.
  - exam_permissions — izin mengikuti ujian per jenis/semester (allowed, reason).

### 2b. Kriteria Ketuntasan Minimal (KKM) per Tingkat

- Permasalahan lama: KKM default 75 di penugasan guru menyebabkan inkonsistensi.
- Solusi arsitektural:

  - Tambahkan entitas baru: `subject_kkm` dengan kolom:
    - `subject_id`, `class_level`, `kkm`, opsional `academic_year_id`.
  - Unik minimal: (`subject_id`, `class_level`) atau (`subject_id`, `class_level`, `academic_year_id`) bila KKM bergantung tahun.
  - Gunakan `subject_kkm` sebagai sumber kebenaran KKM.
  - Saat membuat atau mengedit `teacher_assignments`, KKM:
    - Diisi otomatis dari `subject_kkm` sesuai `subject_id` dan `class_level` kelas terkait.
    - Boleh di-override khusus penugasan bila kebijakan sekolah mengizinkan (opsional).
  - Hilangkan dependensi pada default 75; fallback hanya berlaku jika `subject_kkm` belum terisi dan harus dilaporkan di dashboard admin sebagai hal yang perlu dilengkapi.

- Dampak ke API & UI:
  - Backend:
    - Endpoint Admin untuk CRUD KKM per mapel & tingkat:
      - `POST /api/subjects/:id/kkm` (create)
      - `PUT /api/subjects/:id/kkm/:class_level` (update)
      - `GET /api/subjects/:id/kkm` (list per subject)
      - `GET /api/kkm?class_level=...&subject_id=...` (lookup umum)
    - Integrasi di `teacher_assignments.controller`:
      - Pada create/update: resolve KKM dari `subject_kkm` → set ke field `kkm`.
  - Frontend (Admin):
    - Tambah halaman/panel “Subject KKM” di `/admin/subjects/kkm`:
      - Form untuk input KKM per tingkat (mis. X, XI, XII) untuk setiap mapel.
      - Tabel ringkas untuk cek KKM yang belum lengkap (filter by subject/level).
  - Frontend (Guru):
    - Di form penugasan guru, tampilkan KKM yang disarankan dari `subject_kkm`, dengan opsi override bila kebijakan mengizinkan.

### 2c. Logika Kenaikan Kelas, Kelulusan (Alumni), dan Tahun Ajaran

- **Konsep Tahun Ajaran & Arsip:**

  - Hanya ada SATU tahun ajaran yang statusnya `ACTIVE`.
  - Tahun ajaran lama menjadi `ARCHIVED` (tetap bisa diakses datanya secara _read-only_ atau via filter tahun).
  - Saat tahun ajaran baru dimulai, Admin **hanya** menginput siswa baru (Kelas X).

- **Otomatisasi Kenaikan Kelas (Promotion):**

  - Sediakan fitur "Kenaikan Kelas Massal" di akhir tahun ajaran.
  - Logika:
    - Siswa Kelas X naik ke Kelas XI (di tahun ajaran baru).
    - Siswa Kelas XI naik ke Kelas XII (di tahun ajaran baru).
    - Data histori kelas lama harus tersimpan (di tabel pivot `student_classes` atau sejenisnya), sehingga riwayat nilai tahun lalu tetap aman.

- **Kelulusan & Alumni:**
  - Siswa Kelas XII yang dinyatakan lulus statusnya berubah menjadi **ALUMNI**.
  - **Akses Alumni:**
    - Alumni **tetap bisa login** ke aplikasi.
    - Role mereka tetap user biasa, tapi status akademiknya `GRADUATED`.
    - Mereka bisa melihat riwayat pembelajaran, nilai, dan transkrip selama mereka bersekolah.
    - Menu sidebar alumni disesuaikan (hanya menu _read-only_ riwayat).

### 3. Pedoman UI/UX (Strict)
- **Mobile First & Responsive**: Setiap halaman MENGHARUSKAN penyesuaian tampilan untuk pengguna HP (Mobile). Tampilan harus user-friendly di semua ukuran layar (Desktop vs Mobile).
- **Design Tokens**: Gunakan token yang sudah ada (colors, spacing, dll).

## 3. Struktur Direktori Tingkat Tinggi

Pertahankan pola struktur berikut (boleh menambah file/folder, tapi jangan mengubah konsep utamanya):

- `backend/`
  - `src/`
    - `server.ts` → entry point Express sebelum build.
    - `routes/` → definisi grouping endpoint per domain:
      - `auth.routes.ts`, `user.routes.ts`, `academic.routes.ts`, `major.routes.ts`,
        `subject.routes.ts`, `class.routes.ts`, `teacherAssignment.routes.ts`,
        `attendance.routes.ts`, `grade.routes.ts`, `material.routes.ts`,
        `assignment.routes.ts`, `submission.routes.ts`, `exam.routes.ts`,
        `questionBank.routes.ts`, `dashboard.routes.ts`, `homeroom.routes.ts`,
        `settings.routes.ts`, `trainingClass.routes.ts`, `trainingContent.routes.ts`,
        dan lain-lain.
      - `index.ts` sebagai router utama, di-mount dari `server.ts` pada prefix `/api`.
    - `controllers/` → logika bisnis per domain (harus selalu dipetakan dengan rapi ke routes).
    - `utils/` → helper seperti JWT, ApiError, ApiResponse, dll.
    - `types/` → tipe-tipe shared untuk response/payload.
  - `dist/` → hasil build TypeScript (`tsc`), yang dijalankan oleh PM2.
  - `package.json` → script penting backend (dev, build, test, prisma, dsb).
- `frontend/`
  - `src/`
    - `App.tsx` → definisi seluruh route SPA (admin, teacher, student).
    - `components/layout/` → layout per role: admin, teacher, student.
    - `pages/` → halaman per peran:
      - `pages/auth` → login.
      - `pages/dashboard` → dashboard utama (mis. admin).
    - `pages/admin` → master data, tahun ajaran, jurusan, mapel, kelas, guru, siswa, penugasan guru, rapor, profil sekolah, pengaturan, dsb.
    - `pages/teacher` → dashboard guru, materi, tugas, ujian, bank soal, kehadiran, nilai, wali kelas (leger, rapor P5, ekstrakurikuler, ranking, rapor 1/2), profil guru, dsb.
      - `pages/student` → dashboard siswa, materi, tugas, ujian, latihan/tryout, kehadiran, nilai, profil, dsb.
    - `utils/` → helper seperti `subjectSorter`, util YouTube, dsb.
    - `index.css` → styling global + konfigurasi tailwind.
  - `public/` → aset statis seperti `logo-sekolah.png`, foto kegiatan.
  - `dist/` → hasil build Vite yang dibaca Nginx.
- `uploads/` → direktori file upload (dokumen, foto profil, dsb), diserve via Nginx dan Express.
- `docs/` → dokumentasi tambahan (mis. derivasi nilai).
- `scripts/` → script utilitas (mis. debugging submission, regrade, assertion integrasi).

## 4. Domain Fungsional Utama yang Harus Dijaga

Ketika membangun ulang atau menambah fitur, anggap sistem ini sebagai sistem manajemen sekolah terpadu dengan domain-domain berikut:

- **Autentikasi & Otorisasi**

  - Login dengan username/password (role: ADMIN, TEACHER, STUDENT, PRINCIPAL, STAFF, PARENT).
  - **Tugas Tambahan Guru (Additional Duties):**
    - Selain mengajar, guru bisa diberi tugas tambahan (disimpan di database sebagai atribut/relasi, BUKAN role terpisah).
    - Jenis tugas tambahan:
      1. **Wakasek Kurikulum:** Mengatur KBM, jadwal, kalender akademik.
      2. **Wakasek Kesiswaan:** Mengontrol kegiatan siswa, disiplin, ekstrakurikuler.
      3. **Wakasek Sarana Prasarana:** Mengontrol inventaris/fasilitas.
      4. **Wakasek Humas/Hubin:** Kerjasama industri (PKL), masyarakat.
      5. **Kepala Kompetensi (Kaprog):** Mengontrol jurusan masing-masing.
    - **Dampak UI:** Guru dengan tugas tambahan memiliki **menu sidebar tambahan** sesuai tugasnya (misal: menu "Manajemen PKL" hanya muncul untuk Wakasek Hubin).
  - JWT access & refresh token.
  - Endpoint profil `/auth/me`, logout, register pengguna baru (oleh admin).

- **Manajemen Pengguna**

  - Guru, siswa, admin lengkap dengan profil, kontak, atribut spesifik (NUPTK, gender, dsb).
  - Import/export data (mis. via Excel/CSV).
  - Statistik pengguna (jumlah guru, siswa, dsb).

- **Akademik & Struktur Sekolah**

  - Tahun ajaran & semester, dengan status aktif/nonaktif.
  - Jurusan, mata pelajaran, kelas, dan relasinya.
  - Penugasan guru ke kelas/mapel (`teacher assignments`).

- **Kehadiran**

  - Input kehadiran per pertemuan oleh guru.
  - Riwayat & rekap kehadiran.
  - Tampilan kehadiran dari sisi siswa (view dan input tertentu).

- **Penilaian & Rapor**

  - Input nilai per mapel (oleh guru mapel).
  - Rekap nilai per kelas dan per siswa.
  - Leger, rapor umum, rapor P5, ranking, ekstrakurikuler, dsb.
  - Laporan nilai yang bisa di-export.

- **Materi, Tugas, dan Ujian**

  - Manajemen materi pembelajaran (upload, embed, konversi link seperti YouTube).
  - Tugas (assignments) dan pengumpulan tugas (submissions).
  - Bank soal (question bank) terstruktur per mapel/topik.
  - Ujian berbasis komputer (CBT) dengan:
    - Pembuatan paket ujian, pengaturan waktu, durasi, dsb.
    - Soal pilihan ganda/tipe lain dari question bank.
    - Pengiriman jawaban siswa, penyimpanan, dan rekap hasil.
  - Fitur **latihan/tryout** (training class / training content) sebagai versi latihan dari ujian.

- **Dashboard & Laporan**
  - Dashboard admin (statistik sistem, ringkasan aktivitas).
  - Dashboard guru (kelas yang diampu, status tugas/ujian).
  - Dashboard siswa (ringkasan materi, tugas, ujian, nilai).

- **Keuangan & Administrasi**
  - Integrasi keuangan antara Sekolah dan Orang Tua.
  - Manajemen tagihan (SPP, Uang Pangkal, Uang Praktik, Kegiatan, dll).
  - Pencatatan pembayaran dan status lunas/belum lunas.
  - Laporan keuangan untuk Staf Keuangan dan Kepala Sekolah.

Setiap fitur baru sebaiknya masuk ke salah satu domain ini atau menambah domain baru secara eksplisit dengan pola yang sama (routes + controller + UI page).

## Rincian Per Role

### Admin

- Mengelola master data: tahun ajaran, jurusan, mata pelajaran, kelas.
- Mengelola pengguna: guru, siswa, penugasan guru; import/export data.
- Pengaturan sekolah: profil sekolah dan perubahan kata sandi admin.
- Laporan dan rekap: rapor, rekap nilai, dashboard statistik.
- Halaman terkait di frontend (contoh): `/admin/academic-years`, `/admin/majors`, `/admin/subjects`, `/admin/classes`, `/admin/teachers`, `/admin/students`, `/admin/teacher-assignments`, `/admin/report-cards`, `/admin/settings/*`.
- Kelompok endpoint backend: `/academic`, `/majors`, `/subjects`, `/classes`, `/teacher-assignments`, `/users`, `/settings`, `/grades`, `/dashboard`.

### Kepala Sekolah (Principal)

- Dashboard eksekutif: memantau statistik global (kehadiran, nilai rata-rata, kinerja guru).
- Laporan: akses semua laporan rekapitulasi tanpa fitur edit.
- Halaman terkait: `/principal/dashboard`, `/principal/reports`.
- Endpoint backend: sebagian besar endpoint `GET` admin/statistik bisa diakses role ini.

### Staf (Staff)

- Role untuk Tata Usaha, Keuangan, dan Administrasi.
- Mengelola administrasi sekolah non-akademik, surat menyurat, dan keuangan.
- Keuangan: input tagihan, verifikasi pembayaran SPP/uang pangkal/kegiatan.
- Halaman terkait: `/staff/dashboard`, `/staff/finance`, `/staff/administration`.
- Endpoint backend: `/finance`, `/administration`.

### Orang Tua (Parent)

- Dashboard orang tua: memantau perkembangan anak (absensi, nilai).
- Keuangan: melihat tagihan (SPP, uang pangkal, praktik, dll) dan riwayat pembayaran.
- Halaman terkait: `/parent/dashboard`, `/parent/finance`, `/parent/student-progress`.
- Endpoint backend: `/finance` (view own children), `/grades`, `/attendances`.

### Guru

- Dashboard guru: ringkasan kelas/mapel dan aktivitas.
- Materi, tugas, ujian; termasuk pembuatan, pengeditan, dan penilaian.
- Bank soal: menyusun soal per topik/mapel untuk ujian.
- Kehadiran: input, riwayat, dan rekap.
- Nilai: input nilai, rekap per mapel/kelas.
- Wali kelas: leger, rapor P5, ekstrakurikuler, ranking, rapor 1/2.
- Profil guru: ubah data pribadi, lihat profil publik.
- Halaman terkait di frontend: `/teacher/*` (materials, assignments, exams, question-bank, attendance, grades, homeroom, profile).
- Kelompok endpoint backend: `/materials`, `/assignments`, `/exams`, `/question-bank`, `/attendances`, `/grades`, `/homeroom`.

### Siswa

- Dashboard siswa: ringkasan materi, tugas, ujian, nilai.
- Materi dan tugas: akses materi, kirim tugas; lihat status pengumpulan.
- Ujian CBT: mengambil ujian; termasuk versi latihan/tryout (training).
- Mata pelajaran: daftar dan detail per mapel.
- Kehadiran: lihat status kehadiran, input tertentu sesuai kebijakan.
- Nilai dan rapor: melihat nilai dan rekap.
- Profil siswa: ubah data pribadi dasar, lihat profil.
- Halaman terkait di frontend: `/student/*` (materials, assignments, exams, training, subjects, attendance, grades, profile).
- Kelompok endpoint backend: `/materials` (view siswa), `/assignments`, `/exams`, `/training-content`, `/subjects`, `/attendances`, `/grades`.

## 5. Aturan Teknis Sistem yang Harus Diikutkan

Saat menyusun solusi, selalu terapkan prinsip-prinsip berikut sebagai standar teknis sistem ini:

### 5.1 Ketelitian Integrasi & Logika

- Setiap perubahan **WAJIB** mempertimbangkan:
  - **Analisis lintas file**: periksa konsistensi antara controller, model/Prisma schema, dan routes.
  - **Validasi route**: pastikan endpoint baru:
    - Terdaftar di file routing utama (`backend/src/routes/index.ts`).
    - Tidak bentrok dengan route yang sudah ada.
  - **Impact analysis**: jelaskan jika perubahan di satu modul berpotensi mempengaruhi modul lain (misalnya perubahan skema nilai yang berdampak ke rekap, rapor, dashboard).

### 5.2 Flow Build & Deployment (TypeScript + React)

- **Backend (TypeScript + PM2):**

  - Sumber utama ada di `backend/src`, hasil build di `backend/dist`.
  - Setelah mengubah file `.ts` di backend:
    - Jalankan: `cd backend && npm run build`.
  - PM2 menjalankan file: `backend/dist/src/server.js` dengan nama proses: `project-backend`.
  - Saat merancang perubahan, pastikan command referensi:
    - Start baru:
      - `pm2 start backend/dist/src/server.js --name project-backend --watch --ignore-watch="node_modules src"`.
    - Jika ada perubahan `.env`:
      - `pm2 restart project-backend --update-env`.
    - Setelah stabil:
      - `pm2 save` untuk persist setelah reboot.

- **Frontend (React + Vite):**

  - Sumber utama ada di `frontend/src`, hasil build di `frontend/dist`.
  - Setiap perubahan `.ts`/`.tsx` di frontend **harus diasumsikan** diakhiri dengan:
    - `cd frontend && npm run build`.
  - Nginx harus membaca `frontend/dist` agar perubahan tampil di browser.

- **Hot Reload / Dev Mode:**
  - Mode `npm run dev` untuk frontend boleh disarankan hanya untuk fase pengembangan lokal/intensif.
  - Setelah selesai, port dev (mis. 5173) **harus dimatikan** (mis. `npx kill-port 5173`) agar tidak mengganggu server utama.

### 5.3 Keamanan Database & Data Nyata

- Jangan pernah mengusulkan atau menjalankan (secara otomatis) perintah yang:
  - Mereset/menghapus data produksi (mis. `prisma migrate reset`, `db drop`, `--force-reset`).
  - Menjalankan seed yang dapat menimpa data nyata (`npm run prisma:seed`, script sejenis) tanpa instruksi eksplisit user.
- Jika perlu perubahan skema database:
  - Hanya berikan **saran** seperti `prisma migrate dev` / `prisma migrate deploy`.
  - Tegaskan bahwa user harus menyetujui dan menjalankan sendiri.
- Selalu prioritaskan keselamatan data guru, siswa, kelas, dan nilai.

## 6. Aturan Pengembangan Backend

- Saat menambah fitur backend:
  - Tambahkan **schema**/model di Prisma (jika perlu) secara konsisten.
  - Tambahkan controller baru di `backend/src/controllers/...`.
  - Tambah route baru di file `backend/src/routes/*.routes.ts` yang relevan.
  - Pastikan route tersebut di-mount di `backend/src/routes/index.ts`.
  - Gunakan:
    - `zod` untuk validasi request body/query/params.
    - `ApiResponse` untuk struktur response standar.
    - `ApiError` untuk error terstruktur (status code + pesan).
  - Selaraskan URL dengan pola yang sudah ada, misalnya:
    - `/api/auth/...`, `/api/users/...`, `/api/academic/...`, `/api/grades/...`, dsb.

## 7. Aturan Pengembangan Frontend

- Pertahankan pola SPA dengan `react-router-dom`. Semua route didefinisikan di `App.tsx`.
- Gunakan:
  - `@tanstack/react-query` untuk data fetching, caching, dan invalidasi data.
  - `axios` sebagai HTTP client (diwrap bila perlu).
  - `react-hook-form` + `zod` untuk form yang butuh validasi.
  - Layout per role (admin/teacher/student, dll) dari `components/layout` agar UI konsisten.
- **Zero Error & Warning Policy:**
  - Pastikan tidak ada error atau warning di console browser, tab problems maupun terminal build.
  - Patuhi aturan `eslint-plugin-react-hooks` (exhaustive-deps) secara ketat; jangan suppress warning kecuali benar-benar paham risikonya.
  - Hindari penggunaan `any`; gunakan interface/type yang spesifik.
  - Bersihkan unused imports dan unused variables sebelum commit.
- Saat menambah halaman baru:
  - Buat file di `frontend/src/pages/...`.
  - Tambahkan route di `App.tsx` dengan path yang konsisten.
  - Gunakan komponen layout sesuai role (mis. admin layout untuk halaman admin).
  - Jaga konsistensi penggunaan toast (success/error) dan loading state via React Query.

## 8. Standar Kualitas & Peningkatan Dibanding Sistem Lama

- Tujuan dari rebuild ini adalah menghasilkan sistem yang:
  - Lebih stabil (minim error runtime).
  - Lebih konsisten logikanya (tidak ada perhitungan nilai/rekap yang saling bertentangan).
  - Lebih aman (akses data benar-benar dibatasi sesuai role).
  - Lebih mudah di-maintain dan dikembangkan.

### 8.1 Keamanan & Akses

- Terapkan role-based access control (RBAC) yang jelas untuk ADMIN, GURU, dan SISWA.
- Batasi setiap endpoint backend hanya untuk role yang benar-benar membutuhkan.
- Pastikan setiap request yang sensitif:
  - Melalui middleware autentikasi JWT yang konsisten.
  - Memverifikasi kepemilikan data (misalnya siswa hanya bisa mengakses nilainya sendiri).
- Untuk upload file:
  - Batasi tipe file dan ukuran maksimal.
  - Simpan hanya path/URL di database, file fisik di direktori upload terkontrol.
  - Jangan pernah mengeksekusi konten file yang diupload.

### 8.2 Konsistensi Data & Aturan Bisnis

- Semua operasi tulis (create/update/delete) harus:
  - Menggunakan transaksi database bila menyentuh banyak tabel penting (misalnya nilai + rekap).
  - Menjaga integritas referensi (tidak ada data yatim/piatu).
- Terapkan validasi:
  - Di level API (zod) dan, bila relevan, di level database (constraint unik, foreign key).
- Hindari duplikasi logika perhitungan nilai:
  - Pusatkan perhitungan di satu modul/utility lalu gunakan ulang di semua tempat (rekap, rapor, dashboard).

### 8.3 Observability, Logging, dan Monitoring

- Semua error penting (500, error bisnis kritis) harus:
  - Dicatat di log backend dengan informasi yang cukup (endpoint, userId, payload ringkas).
  - Disajikan ke frontend sebagai pesan yang aman (tanpa detail stack trace).
- Gunakan struktur log yang konsisten sehingga mudah difilter (mis. level: info/warn/error).
- Sediakan minimal satu endpoint health check terintegrasi (`/api/health`) dan, bila perlu, status ringkas sistem untuk monitoring.

### 8.4 Performa & Skalabilitas

- Gunakan pagination untuk semua list besar (siswa, nilai, tugas, ujian).
- Manfaatkan caching di layer front-end via React Query (stale time, cache time, invalidation).
- Hindari N+1 query di backend; gunakan kemampuan ORM (Prisma) untuk eager loading seperlunya.
- Optimalkan query yang berat (laporan besar, rekap) dan, bila perlu, pertimbangkan precalculation atau materialized view di level database (dikendalikan secara manual oleh tim).

### 8.5 Pengujian & QA

- Setiap fitur baru dan perbaikan bug penting:
  - Sebisa mungkin memiliki minimal satu pengujian otomatis (unit/integration) di backend.
  - Disertai skenario uji manual sederhana di frontend (langkah-langkah klik dan hasil yang diharapkan).
- Khusus untuk domain penilaian dan rapor:
  - Pertahankan atau tambah skrip assertion untuk memverifikasi derivasi nilai.
  - Siapkan kasus uji contoh (misalnya komposisi nilai pengetahuan, keterampilan, sikap).

### 8.6 Kualitas Kode & Masa Depan (Future Proofing)

- **Strict Type Safety:** Jangan gunakan `ts-ignore` atau `any` kecuali dalam kondisi darurat dan harus disertai komentar `TODO`.
- **No Deprecated Features:** Hindari fitur React/library yang sudah deprecated (misal: hindari class components untuk kode baru, gunakan functional components + hooks).
- **Clean Code:**
  - Pecah komponen besar menjadi komponen kecil (Single Responsibility Principle).
  - Gunakan custom hooks untuk logika yang kompleks atau berulang.
- **Konsistensi:** Gunakan linter dan formatter (Prettier/ESLint) yang sudah terkonfigurasi di project untuk mencegah gaya kode yang campur aduk.

### 8.7 Pengalaman Pengguna (UX)

- Layout dan navigasi:
  - Konsisten per role (Admin, Guru, Siswa) dengan menu yang jelas.
  - **WAJIB:** Dashboard Guru dan Siswa HARUS menggunakan layout, desain, dan struktur komponen (Sidebar, Navbar, Card, Table) yang SAMA PERSIS dengan Admin. Perbedaan hanya terletak pada isi menu sidebar dan konten widget dashboard.
  - Mudah kembali ke dashboard dari halaman manapun.
- Tampilkan feedback:
  - Loading state yang jelas pada operasi data.
  - Pesan sukses/error yang informatif namun singkat.
- Responsif:
  - Tampilan tetap dapat digunakan di layar laptop dan tablet.

### 8.8 Contoh Alur Kerja Per Role

- Admin – Menetapkan Tahun Ajaran Baru:
  - Menambahkan tahun ajaran dan semester.
  - Menentukan mana yang aktif.
  - Memastikan histori tahun ajaran lama tetap tercatat untuk rapor/nilai.
- Guru – Membuat dan Menilai Ujian:
  - Membuat paket ujian dengan memilih mapel, kelas, dan rentang waktu.
  - Mengambil soal dari bank soal atau menambahkan soal baru.
  - Setelah ujian selesai, melihat rekap hasil dan, bila perlu, melakukan penilaian manual untuk soal non-otomatis.
- Siswa – Mengikuti Ujian dan Melihat Hasil:
  - Masuk ke daftar ujian aktif, memilih ujian yang boleh diambil.
  - Mengikuti ujian dengan timer dan navigasi soal yang jelas.
  - Setelah penilaian, melihat nilai dan, bila diizinkan, pembahasan atau review jawaban.

## 9. Ekspektasi Output dari AI Saat Prompt Ini Digunakan

Setiap kali diminta melakukan perubahan atau penambahan fitur dengan prompt ini, AI harus:

- Menjelaskan secara singkat:
  - Tujuan perubahan.
  - Domain yang terpengaruh (auth, akademik, kehadiran, nilai, ujian, dsb).
- Menunjukkan file utama yang perlu diubah/dibuat (backend dan/atau frontend).
- Menulis kode secara lengkap dan konsisten dengan pola yang sudah ada.
- Menjaga kompatibilitas dengan:
  - Struktur route dan controller yang sekarang.
  - Flow autentikasi JWT yang sudah digunakan.
  - UX dasar pada dashboard admin/guru/siswa.
- Menyertakan langkah verifikasi yang relevan, misalnya:
  - Endpoint yang bisa dipanggil untuk menguji fitur baru (dengan URL contoh).
  - Halaman frontend mana yang perlu dicek setelah build.

## 10. Cara Menggunakan Prompt Ini

Ketika ingin membangun ulang atau mengembangkan sistem di lingkungan baru, gunakan pola kalimat seperti:

> “Gunakan konteks arsitektur dan aturan dari file `new_prompt.md`. Bangun/ubah fitur berikut: ...”

Pastikan AI membaca dan mematuhi seluruh konteks dan aturan di atas sebelum menulis kode atau memberikan instruksi operasional.

### 8.2 Konsistensi Data & Aturan Bisnis

- Semua operasi tulis (create/update/delete) harus:
  - Menggunakan transaksi database bila menyentuh banyak tabel penting (misalnya nilai + rekap).
  - Menjaga integritas referensi (tidak ada data yatim/piatu).
- Terapkan validasi:
  - Di level API (zod) dan, bila relevan, di level database (constraint unik, foreign key).
- Hindari duplikasi logika perhitungan nilai:
  - Pusatkan perhitungan di satu modul/utility lalu gunakan ulang di semua tempat (rekap, rapor, dashboard).

### 8.3 Observability, Logging, dan Monitoring

- Semua error penting (500, error bisnis kritis) harus:
  - Dicatat di log backend dengan informasi yang cukup (endpoint, userId, payload ringkas).
  - Disajikan ke frontend sebagai pesan yang aman (tanpa detail stack trace).
- Gunakan struktur log yang konsisten sehingga mudah difilter (mis. level: info/warn/error).
- Sediakan minimal satu endpoint health check terintegrasi (`/api/health`) dan, bila perlu, status ringkas sistem untuk monitoring.

### 8.4 Performa & Skalabilitas

- Gunakan pagination untuk semua list besar (siswa, nilai, tugas, ujian).
- Manfaatkan caching di layer front-end via React Query (stale time, cache time, invalidation).
- Hindari N+1 query di backend; gunakan kemampuan ORM (Prisma) untuk eager loading seperlunya.
- Optimalkan query yang berat (laporan besar, rekap) dan, bila perlu, pertimbangkan precalculation atau materialized view di level database (dikendalikan secara manual oleh tim).

### 8.5 Pengujian & QA

- Setiap fitur baru dan perbaikan bug penting:
  - Sebisa mungkin memiliki minimal satu pengujian otomatis (unit/integration) di backend.
  - Disertai skenario uji manual sederhana di frontend (langkah-langkah klik dan hasil yang diharapkan).
- Khusus untuk domain penilaian dan rapor:
  - Pertahankan atau tambah skrip assertion untuk memverifikasi derivasi nilai.
  - Siapkan kasus uji contoh (misalnya komposisi nilai pengetahuan, keterampilan, sikap).

### 8.6 Kualitas Kode & Masa Depan (Future Proofing)

- **Strict Type Safety:** Jangan gunakan `ts-ignore` atau `any` kecuali dalam kondisi darurat dan harus disertai komentar `TODO`.
- **No Deprecated Features:** Hindari fitur React/library yang sudah deprecated (misal: hindari class components untuk kode baru, gunakan functional components + hooks).
- **Clean Code:**
  - Pecah komponen besar menjadi komponen kecil (Single Responsibility Principle).
  - Gunakan custom hooks untuk logika yang kompleks atau berulang.
- **Konsistensi:** Gunakan linter dan formatter (Prettier/ESLint) yang sudah terkonfigurasi di project untuk mencegah gaya kode yang campur aduk.

### 8.7 Pengalaman Pengguna (UX)

- Layout dan navigasi:
  - Konsisten per role (Admin, Guru, Siswa) dengan menu yang jelas.
  - Mudah kembali ke dashboard dari halaman manapun.
- Tampilkan feedback:
  - Loading state yang jelas pada operasi data.
  - Pesan sukses/error yang informatif namun singkat.
- Responsif:
  - Tampilan tetap dapat digunakan di layar laptop dan tablet.

### 8.8 Contoh Alur Kerja Per Role

- Admin – Menetapkan Tahun Ajaran Baru:
  - Menambahkan tahun ajaran dan semester.
  - Menentukan mana yang aktif.
  - Memastikan histori tahun ajaran lama tetap tercatat untuk rapor/nilai.
- Guru – Membuat dan Menilai Ujian:
  - Membuat paket ujian dengan memilih mapel, kelas, dan rentang waktu.
  - Mengambil soal dari bank soal atau menambahkan soal baru.
  - Setelah ujian selesai, melihat rekap hasil dan, bila perlu, melakukan penilaian manual untuk soal non-otomatis.
- Siswa – Mengikuti Ujian dan Melihat Hasil:
  - Masuk ke daftar ujian aktif, memilih ujian yang boleh diambil.
  - Mengikuti ujian dengan timer dan navigasi soal yang jelas.
  - Setelah penilaian, melihat nilai dan, bila diizinkan, pembahasan atau review jawaban.

## 9. Ekspektasi Output dari AI Saat Prompt Ini Digunakan

Setiap kali diminta melakukan perubahan atau penambahan fitur dengan prompt ini, AI harus:

- Menjelaskan secara singkat:
  - Tujuan perubahan.
  - Domain yang terpengaruh (auth, akademik, kehadiran, nilai, ujian, dsb).
- Menunjukkan file utama yang perlu diubah/dibuat (backend dan/atau frontend).
- Menulis kode secara lengkap dan konsisten dengan pola yang sudah ada.
- Menjaga kompatibilitas dengan:
  - Struktur route dan controller yang sekarang.
  - Flow autentikasi JWT yang sudah digunakan.
  - UX dasar pada dashboard admin/guru/siswa.
- Menyertakan langkah verifikasi yang relevan, misalnya:
  - Endpoint yang bisa dipanggil untuk menguji fitur baru (dengan URL contoh).
  - Halaman frontend mana yang perlu dicek setelah build.

## 10. Cara Menggunakan Prompt Ini

Ketika ingin membangun ulang atau mengembangkan sistem di lingkungan baru, gunakan pola kalimat seperti:

> “Gunakan konteks arsitektur dan aturan dari file `new_prompt.md`. Bangun/ubah fitur berikut: ...”

Pastikan AI membaca dan mematuhi seluruh konteks dan aturan di atas sebelum menulis kode atau memberikan instruksi operasional.
