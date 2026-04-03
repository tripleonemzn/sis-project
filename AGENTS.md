# SIS Project Working Policy

Dokumen ini adalah policy kerja default untuk setiap sesi baru yang mengerjakan project ini. Jika ada instruksi user yang lebih spesifik, policy ini tetap menjadi baseline perilaku kerja yang wajib diikuti.

## Prioritas Utama

1. **Jangan ganggu production**
   - Setiap perubahan harus mengambil jalur paling aman.
   - Utamakan perubahan dengan blast radius kecil.
   - Jangan mengubah backend, infra, auth, data flow inti, atau konfigurasi production jika tidak benar-benar diperlukan untuk task.
   - Jika ada beberapa opsi implementasi, pilih opsi yang paling minim risiko untuk layanan yang sedang aktif dipakai user.
   - Jangan melakukan perubahan destruktif, cleanup agresif, reset, atau rollback file yang tidak diminta user.

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
   - Untuk mobile tester:
     - jalankan verifikasi dasar
     - publish OTA ke channel yang dipakai tester jika task memang harus langsung diuji
   - Untuk web:
     - pastikan perubahan frontend benar-benar ikut ter-deploy/ter-update sesuai alur existing project jika user meminta langsung live untuk ujicoba
   - Jangan menutup task UI dengan kondisi source code berubah tetapi tester belum bisa mencoba hasilnya, kecuali user memang meminta belum dipublish.

## Checklist Verifikasi Minimum

9. **Verifikasi minimum sebelum dianggap selesai**
   - Untuk mobile:
     - `cd mobile-app && npm run typecheck`
     - `cd mobile-app && npm run audit:parity:check`
   - Untuk perubahan yang perlu langsung diuji di mobile:
     - publish OTA sesuai workflow existing project
   - Untuk area lain, lakukan verifikasi minimum yang relevan dengan scope perubahan.

10. **Jangan klaim selesai jika belum benar-benar rapi**
   - Jika masih ada mismatch istilah, parity, selector, tab, dropdown, atau state UI yang tidak konsisten, itu belum dianggap final.
   - Jika ada batas verifikasi, sampaikan jujur apa yang sudah diverifikasi dan apa yang belum.

## Aturan Khusus Project Ini

11. **Paritas mobile-web adalah aturan inti**
   - Project ini punya banyak role dan modul lintas domain.
   - Karena itu, perubahan tidak boleh hanya benar di satu role lalu dibiarkan tidak konsisten di role lain yang memakai pola screen/komponen sama.
   - Jika menemukan issue yang polanya sama di banyak modul, utamakan refactor sistemik daripada patch titik-per-titik.

12. **Fokus user-friendly**
   - Hindari UI yang ambigu, terlalu teknis, atau berbeda makna antar platform.
   - Istilah yang sudah pernah dirapikan agar nyaman dibaca user harus dipertahankan konsisten.
   - Jika web menggunakan pola yang lebih jelas, mobile harus mengikuti arah yang sama, bukan membuat interpretasi baru sendiri.

13. **Jaga efisiensi token dan konteks**
   - Untuk pekerjaan panjang, lebih baik kerja per batch yang jelas daripada terlalu sering bolak-balik revisi kecil.
   - Update ke user boleh ringkas, tetapi tetap harus informatif.
   - Hindari penjelasan panjang yang tidak menambah nilai praktis bagi user.

## Default Close-Out

14. **Penutupan pekerjaan minimal harus memuat**
   - apa yang dikerjakan
   - verifikasi yang dijalankan
   - status publish/live bila ada
   - progress % bila pekerjaan masih bertahap
   - konfirmasi bahwa worktree sudah clean

