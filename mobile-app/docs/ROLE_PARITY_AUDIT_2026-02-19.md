# Role Parity Audit (2026-02-19)

## Scope
- Target: memastikan menu web tetap punya fungsi saat diakses dari mobile.
- Prinsip: `route` native diprioritaskan, sisanya fallback ke `webPath`.
- Source of truth role: `backend/prisma/schema.prisma` (enum `Role`).

## Role Resmi Backend
- `ADMIN`
- `TEACHER`
- `STUDENT`
- `PRINCIPAL`
- `STAFF`
- `PARENT`
- `CALON_SISWA`
- `UMUM`
- `EXAMINER`
- `EXTRACURRICULAR_TUTOR`

## Coverage Ringkas Menu Mobile
Catatan:
- Angka di bawah berasal dari item role-specific.
- Semua role juga punya 2 menu base native: `Profil Saya` dan `Diagnostics`.
- `hybrid` berarti item punya `route` + `webPath` fallback.

| Role | Native | Web Fallback | Hybrid | Total |
|---|---:|---:|---:|---:|
| ADMIN | 3 | 0 | 29 | 32 |
| TEACHER | 7 | 0 | 54 | 61 |
| STUDENT | 6 | 0 | 9 | 15 |
| EXAMINER | 0 | 0 | 4 | 4 |
| PRINCIPAL | 0 | 0 | 6 | 6 |
| STAFF | 0 | 0 | 4 | 4 |
| PARENT | 0 | 0 | 4 | 4 |
| EXTRACURRICULAR_TUTOR | 0 | 0 | 3 | 3 |
| CALON_SISWA | 0 | 0 | 2 | 2 |
| UMUM | 0 | 0 | 2 | 2 |

## Perbaikan Phase Ini
1. Standardisasi spacing atas layar diterapkan lintas screen dengan helper `getStandardPagePadding`.
2. Parity menu web -> mobile diperluas untuk semua role dengan fallback `webPath`.
3. Ditambahkan guard integritas menu:
   - tidak boleh duplicate key,
   - setiap menu wajib punya `route` atau `webPath`,
   - path wajib diawali `/`.
4. Ditambahkan filter menu dinamis agar mendekati behavior web:
   - siswa alumni dibatasi ke menu relevan,
   - menu ketua kelas hanya muncul untuk `presidentId` yang cocok,
   - menu PKL siswa hanya untuk kelas eligible (`XI`/`XII`),
   - menu homeroom/training/duty guru tampil sesuai data user (`teacherClasses`, `trainingClassesTeaching`, `additionalDuties`).
5. `EXAMINER` core sudah tersedia native:
   - `Data Skema` (`/examiner/schemes`)
   - `Penilaian UKK` (`/examiner/assessment`)
6. `STAFF` core sudah tersedia native:
   - `Pembayaran SPP` (`/staff/payments`) + aksi konfirmasi realisasi
   - `Data Siswa` (`/staff/students`)
7. `PARENT` core (phase P1) tersedia native:
   - `Data Anak` (`/parent/children`)
   - `Absensi Anak` (`/parent/attendance`)
   - `Keuangan` (`/parent/finance`) sekarang native dengan data pembayaran nyata + ringkasan akademik.
8. Backend additive untuk dukung parent tanpa memutus web:
   - `GET /attendances/student-history` sekarang mendukung role `PARENT` dengan validasi relasi anak.
   - `GET /grades/report-card` sekarang mendukung role `PARENT` dengan validasi relasi anak.
   - `GET /payments/parent-overview` untuk ringkasan dan riwayat transaksi pembayaran anak (dengan validasi relasi parent-anak).
9. `PRINCIPAL` core (phase P1) tersedia native:
   - `Dashboard Kepala Sekolah` + `Laporan` (`/principal/overview`) untuk ringkasan akademik.
   - `Persetujuan` (`/principal/approvals`) untuk keputusan approve/reject pengajuan anggaran.
10. `PRINCIPAL` rekap absensi sekarang native:
   - `Rekap Absensi` (`/principal/attendance`) terhubung langsung ke `GET /attendances/daily/recap`.
11. `TEACHER` wali kelas presensi sekarang native:
   - `Wali Kelas Presensi` (`/teacher/homeroom-attendance`) mendukung:
     - Presensi harian (`GET/POST /attendances/daily`)
     - Rekap semester (`GET /attendances/daily/recap`)
     - Rekap terlambat (`GET /attendances/daily/late-summary`)
12. `TEACHER` wakasek kurikulum hub sekarang native:
   - `Kelola Kurikulum` (`/teacher/wakakur-curriculum`) menampilkan ringkasan:
     - Kategori mapel (`GET /subject-categories`)
     - Mata pelajaran + KKM (`GET /subjects`)
     - Assignment guru (`GET /teacher-assignments`)
     - Rekap jam mengajar (`GET /schedules/teaching-summary`)
   - Tetap ada quick action ke modul web section untuk operasi lanjutan.
13. `TEACHER` wakasek kelola ujian sekarang native:
   - `Kelola Ujian` (`/teacher/wakakur-exams`) menampilkan:
     - Jadwal ujian (`GET /exams/schedules`)
     - Ringkasan ruang ujian (derived dari jadwal)
     - Assignment pengawas per jadwal (`PATCH /exams/schedules/:id`)
     - Hapus jadwal (`DELETE /exams/schedules/:id`)
   - Tetap ada tombol ke hub web (`/teacher/wakasek/exams`) untuk operasi lanjutan.
14. `TEACHER` monitoring kinerja wakasek kurikulum sekarang native:
   - `Monitoring Kinerja` (`/teacher/wakakur-performance`) menampilkan:
     - Ringkasan cakupan assignment mapel/kelas.
     - Rekap per guru (assignment, sesi, total jam).
     - Kesiapan jadwal ujian per kelas (pengawas/ruang/paket).
   - Tetap tersedia fallback web (`/teacher/wakasek/performance`) untuk detail lanjutan.
15. `TEACHER` kelola kesiswaan sekarang native:
   - `Kelola Kesiswaan` (`/teacher/wakasis-students`) menampilkan:
     - Ringkasan data siswa, orang tua, pembina, dan ekstrakurikuler.
     - Tab data `Siswa`, `Orang Tua`, `Pembina`, `Ekstrakurikuler`.
     - Ringkasan absensi per kelas pada tab `Absensi` (derived dari `GET /attendances/daily/recap`).
   - Tetap tersedia fallback web (`/teacher/wakasek/students`) untuk detail lanjutan.
16. `TEACHER` monitoring kinerja siswa sekarang native:
   - `Monitoring Kinerja Siswa` (`/teacher/wakasis-performance`) menampilkan:
     - Ringkasan risiko siswa berbasis absensi per kelas.
     - Daftar siswa berisiko (kehadiran < 85%).
     - Ringkasan disiplin kelas (perilaku positif/negatif + alpha/telat).
   - Tetap tersedia fallback web (`/teacher/wakasek/student-performance`) untuk detail lanjutan.
17. `TEACHER` persetujuan kesiswaan sekarang native:
   - `Persetujuan Kesiswaan` (`/teacher/wakasis-approvals`) menampilkan:
     - Daftar pengajuan izin siswa dengan filter status, jenis izin, dan kelas.
     - Aksi `Setujui` / `Tolak` langsung dari mobile (termasuk catatan penolakan).
     - Akses lampiran bukti izin dan ringkasan status terfilter.
   - Tetap tersedia fallback web (`/teacher/wakasek/student-approvals`) untuk detail lanjutan.
18. `TEACHER` laporan kesiswaan sekarang native:
   - `Laporan Kesiswaan` (`/teacher/wakasis-reports`) menampilkan:
     - Ringkasan semester untuk absensi kelas dan statistik perizinan.
     - Rekap per kelas (kehadiran, alpha, telat, dan status izin).
     - Rekap perizinan (tren bulanan + siswa pengajuan terbanyak).
   - Tetap tersedia fallback web (`/teacher/wakasek/student-reports`) untuk detail lanjutan.
19. `TEACHER` aset sekolah sarpras sekarang hybrid native:
   - `Aset Sekolah` (`/teacher/sarpras-inventory`) menampilkan:
     - Ringkasan kategori ruang, kondisi ruang, dan rekap unit inventaris.
     - Daftar ruangan per kategori dengan filter pencarian.
     - Detail inventaris per ruangan (kondisi baik/rusak ringan/rusak berat).
   - Tetap tersedia fallback web (`/teacher/sarpras/inventory`) untuk operasi lanjutan.
20. `TEACHER` persetujuan anggaran sarpras sekarang hybrid native:
   - `Persetujuan Anggaran` (`/teacher/sarpras-budgets`) menampilkan:
     - Ringkasan nominal, jumlah pending, dan LPJ siap audit.
     - Filter status, unit pengaju, serta pencarian data pengajuan.
     - Aksi mobile untuk meneruskan pengajuan pending ke Kepala Sekolah.
   - Tetap tersedia fallback web (`/teacher/sarpras/budgets`) untuk audit LPJ lanjutan.
21. `TEACHER` laporan sarpras sekarang hybrid native:
   - `Laporan Sarpras` (`/teacher/sarpras-reports`) menampilkan:
     - Ringkasan aset (kategori, ruangan, kondisi, dan jumlah item).
     - Ringkasan anggaran sarpras (status, nominal, dan progress LPJ).
     - Rekap per unit pengaju dan daftar pengajuan terbaru.
   - Tetap tersedia fallback web (`/teacher/sarpras/reports`) untuk detail lanjutan.
22. `TEACHER` wali kelas izin sekarang hybrid native:
   - `Wali Kelas Izin` (`/teacher/homeroom-permissions`) menampilkan:
     - Daftar pengajuan izin siswa per kelas wali dengan filter status, jenis izin, dan pencarian.
     - Aksi `Setujui` / `Tolak` langsung dari mobile (dengan catatan penolakan opsional).
     - Akses lampiran bukti izin untuk verifikasi cepat.
   - Tetap tersedia fallback web (`/teacher/wali-kelas/permissions`) untuk fitur akses ujian lanjutan.
23. `TEACHER` wali kelas perilaku sekarang hybrid native:
   - `Wali Kelas Perilaku` (`/teacher/homeroom-behavior`) menampilkan:
     - Riwayat catatan perilaku siswa dengan filter jenis (positif/negatif) dan pencarian.
     - Form mobile untuk tambah catatan perilaku per siswa (tanggal, kategori, deskripsi, poin).
     - Aksi edit dan hapus catatan perilaku langsung dari aplikasi mobile.
   - Tetap tersedia fallback web (`/teacher/wali-kelas/behavior`) untuk kebutuhan lanjutan.
24. `TEACHER` rapor wali kelas sekarang hybrid native:
   - `Wali Kelas Rapor SBTS` (`/teacher/homeroom-sbts`) menampilkan:
     - Tab `Rapor Siswa` (ringkasan nilai per kelompok mapel + catatan).
     - Tab `Leger Nilai` (ringkasan nilai formatif/ujian/akhir per siswa).
     - Tab `Ekstrakurikuler` dan `Peringkat` dengan data kelas aktif.
   - `Wali Kelas Rapor SAS` (`/teacher/homeroom-sas`) dan `Wali Kelas Rapor SAT` (`/teacher/homeroom-sat`) menggunakan pola native yang sama (semester fixed sesuai jenis rapor).
   - Tetap tersedia fallback web untuk cetak dan operasi detail:
     - `/teacher/wali-kelas/rapor-sbts`
     - `/teacher/wali-kelas/rapor-sas`
     - `/teacher/wali-kelas/rapor-sat`
25. `TEACHER` proctoring dan ujian per tipe sekarang hybrid native:
   - `Jadwal Mengawas` (`/teacher/proctoring`) menampilkan:
     - Filter mode akses (`Sebagai Pengawas` / `Sebagai Penulis`), filter waktu, dan pencarian.
     - Ringkasan jadwal aktif serta daftar sesi ujian dengan aksi `Pantau Ujian`.
     - Detail monitoring (`/teacher/proctoring/[scheduleId]`) untuk status peserta dan simpan berita acara.
   - `Ujian Formatif/SBTS/SAS/SAT` dan `Bank Soal` sekarang memiliki route native:
     - `/teacher/exams-formatif`
     - `/teacher/exams-sbts`
     - `/teacher/exams-sas`
     - `/teacher/exams-sat`
     - `/teacher/exams-bank`
   - Masing-masing tetap memiliki fallback web:
     - `/teacher/proctoring`
     - `/teacher/exams/formatif`
     - `/teacher/exams/sbts`
     - `/teacher/exams/sas`
     - `/teacher/exams/sat`
     - `/teacher/exams/bank`
26. `TEACHER` perangkat ajar sekarang hybrid native:
   - `Perangkat Ajar CP` (`/teacher/learning-cp`)
   - `Perangkat Ajar ATP` (`/teacher/learning-atp`)
   - `Program Tahunan` (`/teacher/learning-prota`)
   - `Program Semester` (`/teacher/learning-promes`)
   - `Modul Ajar` (`/teacher/learning-modules`)
   - `KKTP` (`/teacher/learning-kktp`)
   - Semua route di atas menggunakan layar native yang sama untuk konteks assignment aktif + ringkasan status, lalu menyediakan tombol editor web sesuai section.
   - Fallback web tetap tersedia:
     - `/teacher/learning-resources/cp`
     - `/teacher/learning-resources/atp`
     - `/teacher/learning-resources/prota`
     - `/teacher/learning-resources/promes`
     - `/teacher/learning-resources/modules`
     - `/teacher/learning-resources/kktp`
27. `TEACHER` program kerja dan persetujuan program kerja sekarang hybrid native:
   - `Program Kerja` (`/teacher/work-program`) menampilkan:
     - Ringkasan status program kerja (total, menunggu, progress item).
     - Filter status + pencarian cepat lintas judul/deskripsi/tahun ajaran/jurusan.
     - Detail konteks program (duty, semester, periode, jurusan, dan progress item).
   - `Persetujuan Program Kerja` (`/teacher/wakakur-work-program-approvals`) menampilkan:
     - Daftar usulan menunggu persetujuan dengan informasi pengaju dan konteks program.
     - Aksi mobile `Setujui` / `Tolak` langsung dari aplikasi.
   - Fallback web tetap tersedia:
     - `/teacher/work-programs`
     - `/teacher/wakasek/work-program-approvals`
28. `TEACHER` area kepala kompetensi sekarang hybrid native:
   - `Kelas Kompetensi` (`/teacher/kakom-classes`) menampilkan:
     - Ringkasan kelas dan total siswa berdasarkan jurusan kelolaan akun.
     - Daftar kelas kompetensi aktif per jurusan (dengan pencarian cepat).
   - `Monitoring PKL` (`/teacher/kakom-pkl`) menampilkan:
     - Ringkasan progres PKL (berjalan/selesai) untuk siswa pada jurusan kelolaan.
     - Daftar siswa PKL dengan detail perusahaan, pembimbing, status, dan nilai akhir.
   - `Mitra Industri & BKK` (`/teacher/kakom-partners`) menampilkan:
     - Data mitra industri dan lowongan BKK dalam satu modul dengan tab data.
     - Pencarian cepat lintas data mitra dan data lowongan.
   - Fallback web tetap tersedia:
     - `/teacher/head-program/classes`
     - `/teacher/head-program/pkl`
     - `/teacher/head-program/partners`
29. `TEACHER` area wakasek humas sekarang hybrid native:
   - `Pengaturan PKL` (`/teacher/humas-settings`) menampilkan:
     - Konfigurasi kelas eligible PKL (`XI`, `XII`, `XI & XII`) untuk tahun ajaran aktif.
     - Simpan konfigurasi langsung dari mobile dengan validasi respons backend.
   - `Persetujuan PKL` (`/teacher/humas-approval`) menampilkan:
     - Daftar pengajuan PKL dengan filter status dan pencarian.
     - Aksi `Setujui` / `Tolak` langsung dari mobile.
   - `Nilai PKL` (`/teacher/humas-components`) menampilkan:
     - Daftar komponen penilaian PKL + status aktif/nonaktif.
     - Form tambah komponen baru dan toggle status komponen.
   - `Monitoring Jurnal` (`/teacher/humas-journals`) menampilkan:
     - Pilihan siswa PKL aktif untuk melihat jurnal.
     - Aksi verifikasi/penolakan jurnal dari mobile.
   - `Mitra Industri` (`/teacher/humas-partners`) menampilkan:
     - Tab data mitra dan lowongan BKK dalam satu modul.
     - Pencarian lintas nama perusahaan, mitra, dan lowongan.
   - `Laporan Humas` (`/teacher/humas-reports`) menampilkan:
     - Ringkasan lintas data PKL, komponen, mitra, dan lowongan.
     - Akses cepat monitoring performa humas dari dashboard mobile.
   - Fallback web tetap tersedia:
     - `/teacher/humas/settings`
     - `/teacher/internship/approval`
     - `/teacher/wakasek/internship-components`
     - `/teacher/wakasek/journal-monitoring`
     - `/teacher/humas/partners`
     - `/teacher/humas/reports`
30. Seluruh sisa menu teacher yang sebelumnya web-only sekarang sudah dialihkan menjadi hybrid native:
   - `Dashboard Guru` dan `Profil Guru (Web)` sekarang memakai route native (`/home`, `/profile`) dengan fallback web tetap aktif.
   - Sisa duty `Wakasek Kurikulum`:
     - `Persetujuan Akademik` memakai route native yang tersedia (`/teacher/wakakur-work-program-approvals`) + fallback web.
     - `Laporan Akademik` memakai route native yang tersedia (`/teacher/wakakur-performance`) + fallback web.
   - Sisa duty `Kepala Lab`:
     - `Inventaris Lab` (`/teacher/head-lab-inventory`)
     - `Jadwal Lab` (`/teacher/head-lab-schedule`)
     - `Laporan Insiden Lab` (`/teacher/head-lab-incidents`)
   - Sisa duty `Kepala Perpustakaan`:
     - `Inventaris Perpustakaan` (`/teacher/head-library-inventory`)
   - Sisa duty `Training`:
     - `Kelas Training` (`/teacher/training-classes`)
     - `Presensi Training` (`/teacher/training-attendance`)
     - `Nilai Training` (`/teacher/training-grades`)
     - `Materi Training` (`/teacher/training-materials`)
     - `Laporan Training` (`/teacher/training-reports`)
   - Sisa flow PKL guru:
     - `Bimbingan PKL` (`/teacher/internship-guidance`) dengan data tugas pembimbing + verifikasi jurnal + monitoring absensi.
     - `Sidang PKL` (`/teacher/internship-defense`) dengan monitoring jadwal sidang dan ringkasan nilai.
   - Hasil akhir role `TEACHER`: `Web Fallback = 0`, seluruh menu role-specific sudah memiliki route mobile.
31. Seluruh menu web-only non-teacher sekarang distandarkan ke pola bridge route mobile:
   - Menu yang sebelumnya hanya `webPath` (51 menu) kini otomatis dimaterialisasi menjadi `route` mobile di runtime:
     - format route: `/web-module/{menuKey}`
     - screen bridge: `app/(app)/web-module/[moduleKey].tsx`
   - Dampak:
     - Menu tetap membuka modul web production yang sudah running.
     - Navigasi mobile menjadi konsisten karena semua menu sekarang punya target route.
     - Struktur parity lebih stabil untuk roadmap hybrid tahap lanjutan.

## Residual Gap (Masih Ada)
1. Banyak menu role non-inti masih bridge ke web (belum native penuh).
2. Some duty-flow teacher masih berupa shortcut menu (fungsi tersedia, UX native belum ada).
3. Belum ada auto-parser dari sidebar web ke menu mobile; update parity masih controlled manual.
4. Beberapa flow pada modul native `EXAMINER`/`STAFF`/`PARENT` masih bersifat ringkasan; advanced action tetap dipertahankan via web path.
5. Aksi write untuk keuangan parent (contoh upload bukti/konfirmasi) belum ada; saat ini mobile berfokus read-only transaksi.

## Prioritas Native Berikutnya (Disarankan)
1. **P1**: konversi bridge role non-inti menjadi native bertahap berdasarkan trafik usage.
2. **P1**: parent finance write-action (opsional) setelah validasi SOP sekolah (tetap read-only sebagai default aman).
3. **P2**: otomatisasi parity check dari source menu web -> mobile (generate report delta).

## Exit Criteria Phase Audit
1. Semua role backend punya menu fungsional di mobile (native atau fallback) -> **TERPENUHI**.
2. Tidak ada menu tanpa target route/path -> **TERPENUHI**.
3. Tidak ada duplicate key menu -> **TERPENUHI**.
