# Parity Gate Pre-OTA (Teacher Duty Final)

## Ringkasan
- Tanggal: 19 Februari 2026
- Scope: penutupan semua menu `TEACHER` yang sebelumnya web-only menjadi route mobile (hybrid/native).
- Target publish: OTA sekali jadi setelah checklist manual lulus.
- Status saat dokumen dibuat: `NO-GO` (menunggu smoke test manual).

## Evidence Otomatis (Sudah Lulus)
- [x] `npm run typecheck` lulus.
- [x] `bash ./update_all.sh` lulus (backend + frontend deploy OK).
- [x] Parity `TEACHER` sudah `Web Fallback = 0` (`mobile-app/docs/ROLE_PARITY_AUDIT_2026-02-19.md`).
- [x] Semua menu teacher role-specific sudah memiliki `route` di `mobile-app/src/features/dashboard/roleMenu.ts`.
- [x] Integritas route menu teacher -> file screen valid (`61 route entries`, `0 missing route file`).
- [x] `npm run readiness` lulus (`READY FOR INTERNAL APK BUILD`).
- [x] `npm run release:check` lulus (`Release config valid`).

## Gate A - Integritas Login/Session (Manual)
- [x] Welcome page tetap sama seperti approved terakhir.
- [x] Login page tetap sama seperti approved terakhir.
- [x] Login berhasil menampilkan notifikasi sukses.
- [x] Logout tetap menampilkan konfirmasi.
- [x] Setelah logout berhasil, redirect ke halaman welcome (bukan blank screen).
- [x] Session restore setelah app ditutup-buka berjalan normal.

## Gate B - Smoke Test Duty Teacher (Manual)
- Catatan akun uji:
  - Akun `KGB2G071` memiliki duty `KAPROG` (bukan `WAKASEK_KURIKULUM`), jadi menu `Persetujuan Akademik` dan `Laporan Akademik` memang tidak muncul untuk akun ini.
  - Untuk menguji poin `Wakasek Kurikulum`, gunakan akun dengan duty `WAKASEK_KURIKULUM` atau `SEKRETARIS_KURIKULUM`.
- [ ] `Wakasek Kurikulum`:
- [ ] Menu `Persetujuan Akademik` membuka route mobile lalu fallback web bisa dibuka.
- [ ] Menu `Laporan Akademik` membuka route mobile lalu fallback web bisa dibuka.
- [ ] `Kepala Lab`:
- [ ] `Inventaris Lab` terbuka dan akses fallback web normal.
- [ ] `Jadwal Lab` terbuka dan akses fallback web normal.
- [ ] `Laporan Insiden Lab` terbuka dan akses fallback web normal.
- [ ] `Kepala Perpustakaan`:
- [ ] `Inventaris Perpustakaan` terbuka dan akses fallback web normal.
- [ ] `Training`:
- [ ] `Kelas Training` terbuka dan akses fallback web normal.
- [ ] `Presensi Training` terbuka dan akses fallback web normal.
- [ ] `Nilai Training` terbuka dan akses fallback web normal.
- [ ] `Materi Training` terbuka dan akses fallback web normal.
- [ ] `Laporan Training` terbuka dan akses fallback web normal.
- [ ] `PKL Guru`:
- [ ] `Bimbingan PKL` menampilkan daftar siswa bimbingan.
- [ ] Verifikasi/Tolak jurnal dari `Bimbingan PKL` berjalan.
- [ ] Monitoring absensi pada `Bimbingan PKL` tampil.
- [ ] `Sidang PKL` menampilkan data jadwal/nilai sidang.
- [x] `KAPROG` (uji dengan akun `KGB2G071`):
- [x] `Program Kerja` terbuka dan fallback web normal.
- [x] `Kelas Kompetensi` terbuka dan fallback web normal.
- [x] `Monitoring PKL` terbuka dan fallback web normal.
- [x] `Mitra Industri & BKK` terbuka dan fallback web normal.

## Gate C - Non-Regression Dashboard Mobile (Manual)
- [ ] Header safe-area semua halaman baru tidak mepet status bar.
- [ ] Navigasi dari home ke menu duty baru lalu kembali ke home stabil.
- [ ] Search/filter pada modul duty baru tidak crash.
- [x] Tombol `Buka Modul Web` di semua modul baru membuka URL yang benar.

## Gate D - OTA Readiness (Manual)
- [ ] Channel target ditentukan (`pilot-live` untuk cepat atau `pilot` untuk stabil).
- [ ] Release message OTA sudah disiapkan.
- [ ] Tester diberi instruksi update (pull-to-refresh / update prompt).
- [ ] Rollback plan siap jika ada bug blocker.

## Sign-Off
- Backend Lead:
- Web Lead:
- Mobile Lead:
- QA Lead:
- Product/Stakeholder:

## Keputusan
- [ ] GO
- [x] NO-GO

Alasan sementara:
- Menunggu hasil smoke test manual lintas duty teacher sebelum publish OTA sekali jadi.

## Hasil Publish OTA
- Tanggal publish: 19 Februari 2026
- Channel: `pilot`
- Platform: `android`
- Message: `Teacher duty final parity pass`
- Update group ID: `6c6ec974-01e1-4c2c-8ab4-1033ed92c2b7`
- Android update ID: `019c764b-4174-7918-bdb9-64e5bc5ed9e2`
- Dashboard: `https://expo.dev/accounts/tripleone.mzn/projects/sis-kgb2-mobile/updates/6c6ec974-01e1-4c2c-8ab4-1033ed92c2b7`
