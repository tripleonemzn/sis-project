# Pilot Tester Onboarding (Internal APK)

## Sebelum Mulai
- Gunakan akun uji yang sudah disiapkan.
- Pastikan internet aktif.
- Install APK tester resmi dari profile `internal-live` agar channel perangkat = `pilot-live`.
- Setelah APK terpasang sekali, update fitur berikutnya dikirim via OTA (tanpa install ulang).
- Jika tim memberi tahu ada pergantian versi aplikasi (`appVersion`/runtime), install ulang APK tester terbaru sekali.

## Mekanisme Update OTA
1. Buka aplikasi dengan internet aktif.
2. Jika ada rilis baru pada channel APK yang terpasang (`pilot` atau `pilot-live`), banner **Update Aplikasi Tersedia** akan muncul.
3. Tekan **Update Sekarang**.
4. Aplikasi akan download update dan reload otomatis ke versi terbaru.
5. Jika update gagal karena koneksi, tekan **Cek Ulang** lalu coba lagi.
6. Alternatif manual: dari halaman Home, lakukan pull-to-refresh (tarik layar ke bawah) untuk refresh data sekaligus cek update.

## Catatan Channel Tester
- `pilot-live`: channel standar tester harian. Semua uji fitur terbaru sebaiknya memakai channel ini.
- `pilot`: channel stabil cadangan. Hanya akan menerima OTA jika APK `internal` dengan runtime yang cocok memang sudah terpasang.
- Jika tester perlu pindah channel, install APK dari profile yang sesuai.

## Skenario Uji Wajib
1. Login dengan akun valid.
2. Tutup app, buka kembali (cek restore session).
3. Buka halaman: Home, Profil, Jadwal, Nilai, Absensi.
4. Coba refresh data pada tiap halaman.
5. Logout dan login ulang.
6. Buka halaman Diagnostics, jalankan "Tes Koneksi API", lalu pastikan status koneksi sukses.

## Skenario Error
1. Login dengan password salah.
2. Putuskan internet, lalu buka halaman data.
3. Pastikan halaman Profil/Jadwal/Nilai/Absensi menampilkan indikator **Mode Offline** (cache terakhir).
4. Aktifkan internet lagi, tekan retry/refresh.
5. Buka Diagnostics dan coba **Clear Local Cache**, lalu refresh data kembali.
6. Pilih severity issue di Diagnostics (`BLOCKER/MAJOR/MINOR`), isi ringkasan + langkah reproduksi.
7. Gunakan **Export Diagnostics Report** lalu kirim hasilnya ke tim jika menemukan bug.

## Data yang Perlu Dilaporkan
- Tipe device dan versi Android.
- Waktu kejadian.
- Halaman/aksi saat error.
- Screenshot/video singkat.
- Dampak: blocker/major/minor.

## Format Laporan Singkat
- Device: ...
- Build: ...
- Halaman: ...
- Langkah: ...
- Hasil aktual: ...
- Harapan: ...
- Severity: Blocker/Major/Minor
