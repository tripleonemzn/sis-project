# SIS Project Working Policy

Dokumen ini adalah policy kerja default untuk setiap sesi baru yang mengerjakan project ini. Jika ada instruksi user yang lebih spesifik, policy ini tetap menjadi baseline perilaku kerja yang wajib diikuti.

## Prioritas Utama

1. **Jangan ganggu production**
   - Setiap perubahan harus mengambil jalur paling aman.
   - Utamakan perubahan dengan blast radius kecil.
   - Jangan mengubah backend, infra, auth, data flow inti, atau konfigurasi production jika tidak benar-benar diperlukan untuk task.
   - Jika ada beberapa opsi implementasi, pilih opsi yang paling minim risiko untuk layanan yang sedang aktif dipakai user.
   - Jangan melakukan perubahan destruktif, cleanup agresif, reset, atau rollback file yang tidak diminta user.
   - Setiap perubahan juga wajib menjaga **server tetap sehat**: jangan sampai memicu service down, restart loop, CPU/load spike, lonjakan koneksi database, reconnect websocket berulang, polling agresif, atau perilaku runtime lain yang membuat aplikasi melambat/tidak wajar.
   - Jika task menyentuh area yang bisa memengaruhi performa runtime seperti backend, query database, cache, realtime/websocket, polling/refetch, notifikasi broadcast, background timer, cron, queue, atau halaman frontend/mobile yang sering memanggil API, selalu pilih desain yang paling aman dan hemat beban.
   - Hindari implementasi yang berisiko tinggi seperti:
     - query tanpa batas yang bisa membesar seiring data
     - polling terlalu rapat
     - retry/reconnect terlalu agresif
     - loop/background process tanpa guard
     - fan-out request yang tidak dibatasi
     - render/refetch frontend yang memicu spam request ke backend
   - Jika ada potensi tradeoff antara kecepatan implementasi dan kesehatan server, selalu pilih kesehatan server.

2. **Web dan mobile harus 1:1**
   - Setiap pengembangan fitur harus menjaga parity antara web dan mobile.
   - Parity mencakup:
     - nama menu
     - istilah/label
     - struktur fitur
     - alur user
     - status dan filter
     - arti tombol/aksi
   - Jangan membuat istilah baru di mobile jika di web sudah ada istilah baku.
   - Untuk mobile:
     - yang secara UX seharusnya `dropdown`, gunakan dropdown
     - yang secara UX seharusnya `tab`, gunakan tab
     - jangan mengganti dropdown menjadi button chip hanya karena lebih cepat diimplementasikan
   - Web adalah source of truth utama untuk istilah, penamaan menu, dan alur operasional, kecuali user meminta perubahan desain lintas platform.

3. **Gunakan komponen shared, jangan improvisasi liar**
   - Untuk mobile, utamakan komponen shared yang sudah ada daripada membuat pola UI baru per screen.
   - Gunakan pola yang konsisten dengan project existing, terutama:
     - `MobileSelectField`
     - `MobileMenuTabBar`
     - `MobileSummaryCard`
     - popup/modal shared yang sudah dipakai lintas modul
   - Jika perlu membuat komponen baru, komponen tersebut harus reusable dan tidak hanya cocok untuk satu layar saja.

4. **Semua pengembangan harus dinamis**
   - Jangan hardcode data, label, opsi, role behavior, daftar menu, atau status jika data tersebut sudah punya source of truth dari API, config, assignment, role, duty, active year, atau data backend lain.
   - Implementasi harus tahan terhadap perubahan data di masa depan.
   - Hormati kondisi dinamis seperti:
     - role
     - additional duty
     - managed major
     - active academic year
     - assignment mengajar
     - status workflow

## Aturan Eksekusi

5. **Selalu pilih workflow aman**
   - Kerjakan perubahan bertahap jika scope besar.
   - Jika task dibagi batch/wave, setiap batch harus:
     - selesai utuh
     - diverifikasi
     - dirapikan
     - tidak meninggalkan state setengah jadi
   - Jangan publish perubahan yang belum lolos verifikasi dasar.
   - Jika perubahan menyentuh jalur runtime/production, lakukan sanity-check tambahan sebelum menganggap aman:
     - pastikan build/lint/typecheck yang relevan lolos
     - pastikan tidak ada indikasi error startup/restart loop
     - pastikan health check dasar tetap normal
     - pastikan perubahan tidak memperkenalkan pola akses yang berisiko membebani server
   - Jika setelah perubahan ada gejala tidak normal pada server, hentikan rollout lanjutan dan utamakan containment/perbaikan stabilitas terlebih dahulu.

6. **Wajib lapor progress saat bertahap**
   - Jika pekerjaan dikerjakan per batch/wave, setelah setiap batch selesai wajib laporkan:
     - batch/wave yang selesai
     - area/fitur yang dikerjakan
     - progress persentase dari `0% - 100%`
     - sisa area yang belum selesai
   - Persentase harus jujur berbasis audit yang jelas, bukan angka asal.

7. **Worktree/workspace harus selalu bersih**
   - Setelah pekerjaan selesai:
     - semua perubahan yang memang bagian dari task harus di-commit
     - tidak boleh ada file nyangkut, perubahan setengah jadi, atau worktree kotor
   - Selalu cek `git status --short` sebelum penutupan pekerjaan.
   - Jika ada perubahan user yang tidak terkait task, jangan disentuh kecuali diminta.

8. **UI/frontend harus selalu up to date untuk ujicoba**
   - Jika perubahan menyentuh web/mobile UI yang dipakai tester, hasilnya harus dirilis sesuai workflow existing project.
   - Jika ada pengembangan menu, sub-menu, tab, atau fitur baru yang muncul di navigasi user, pastikan breadcrumb juga ikut disesuaikan agar konteks halaman tetap jelas dan konsisten.
   - Jangan menambah fitur/menu baru dengan breadcrumb yang tertinggal, salah label, atau tidak mengenali tab aktif.
   - Untuk mobile tester:
     - jalankan verifikasi dasar
     - publish OTA ke channel yang dipakai tester jika task memang harus langsung diuji
   - Untuk web:
     - pastikan perubahan frontend benar-benar ikut ter-deploy/ter-update sesuai alur existing project jika user meminta langsung live untuk ujicoba
   - Jangan menutup task UI dengan kondisi source code berubah tetapi tester belum bisa mencoba hasilnya, kecuali user memang meminta belum dipublish.

## Checklist Verifikasi Minimum

9. **Verifikasi minimum sebelum dianggap selesai**
   - Untuk perubahan backend atau perubahan lain yang bisa memengaruhi runtime server:
     - `cd backend && npm run build`
     - jika memang perubahan harus live: `cd backend && npm run service:health`
   - Untuk perubahan query/realtime/polling/frontend-mobile yang berpotensi menambah beban server:
     - lakukan sanity check bahwa implementasi tidak agresif dan tetap punya guardrail yang aman
   - Untuk mobile:
     - `cd mobile-app && npm run typecheck`
     - `cd mobile-app && npm run audit:parity:check`
   - Untuk perubahan yang perlu langsung diuji di mobile:
     - publish OTA sesuai workflow existing project
   - Untuk area lain, lakukan verifikasi minimum yang relevan dengan scope perubahan.

10. **Red flag stabilitas yang wajib dicurigai sebelum publish**
   - Anggap perubahan **berisiko tinggi** jika mengandung salah satu pola berikut:
     - endpoint baru tanpa pagination / limit / filter aman
     - query berantai `N+1`, include terlalu dalam, atau fetch data jauh lebih besar dari kebutuhan layar
     - refetch pada setiap render, focus, tab switch, atau state change tanpa guard yang jelas
     - polling dengan interval rapat atau tetap berjalan saat screen/background tidak aktif
     - reconnect websocket/realtime tanpa backoff/cooldown
     - mutation yang memicu refetch banyak query sekaligus tanpa pembatasan
     - cache invalidation terlalu luas sehingga satu aksi kecil menyegarkan terlalu banyak halaman
     - cron/timer/background loop yang tidak punya guard, dedupe, atau stop condition
     - broadcast notifikasi / fan-out request tanpa batching atau pembatasan penerima
     - UI list/dashboard yang memicu banyak request paralel saat halaman dibuka
   - Jika salah satu red flag muncul, jangan lanjut publish sebelum:
     - diperkecil blast radius-nya
     - diberi limit/guard/cache/backoff yang memadai
     - dijelaskan dengan jujur di laporan verifikasi jika memang masih ada residual risk

11. **Jangan klaim selesai jika belum benar-benar rapi**
   - Jika masih ada mismatch istilah, parity, selector, tab, dropdown, atau state UI yang tidak konsisten, itu belum dianggap final.
   - Jika ada batas verifikasi, sampaikan jujur apa yang sudah diverifikasi dan apa yang belum.

## Aturan Khusus Project Ini

12. **Paritas mobile-web adalah aturan inti**
   - Project ini punya banyak role dan modul lintas domain.
   - Karena itu, perubahan tidak boleh hanya benar di satu role lalu dibiarkan tidak konsisten di role lain yang memakai pola screen/komponen sama.
   - Jika menemukan issue yang polanya sama di banyak modul, utamakan refactor sistemik daripada patch titik-per-titik.

13. **Fokus user-friendly**
   - Hindari UI yang ambigu, terlalu teknis, atau berbeda makna antar platform.
   - Istilah yang sudah pernah dirapikan agar nyaman dibaca user harus dipertahankan konsisten.
   - Jika web menggunakan pola yang lebih jelas, mobile harus mengikuti arah yang sama, bukan membuat interpretasi baru sendiri.

14. **Jaga efisiensi token dan konteks**
   - Untuk pekerjaan panjang, lebih baik kerja per batch yang jelas daripada terlalu sering bolak-balik revisi kecil.
   - Update ke user boleh ringkas, tetapi tetap harus informatif.
   - Hindari penjelasan panjang yang tidak menambah nilai praktis bagi user.

## Default Close-Out

15. **Penutupan pekerjaan minimal harus memuat**
   - apa yang dikerjakan
   - verifikasi yang dijalankan
   - status publish/live bila ada
   - progress % bila pekerjaan masih bertahap
   - konfirmasi bahwa worktree sudah clean
