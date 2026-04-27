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
     - commit hasil pekerjaan wajib sudah di-push ke `origin/main` sebelum laporan hasil akhir diberikan, agar environment ujicoba selalu sinkron dengan source of truth terbaru
   - Selalu cek `git status --short` sebelum penutupan pekerjaan.
   - Jika ada perubahan user yang tidak terkait task, jangan disentuh kecuali diminta.

8. **UI/frontend harus selalu up to date untuk ujicoba**
   - Jika perubahan menyentuh web/mobile UI yang dipakai tester, hasilnya harus dirilis sesuai workflow existing project.
   - Default setiap pekerjaan yang mengubah web atau mobile adalah **langsung deploy/publish live untuk ujicoba** setelah verifikasi minimum lolos, agar tester bisa langsung mencoba hasil terbaru.
   - Deploy web dan publish OTA mobile adalah bagian wajib dari penyelesaian task jika area yang berubah menyentuh platform tersebut, kecuali user secara eksplisit memberi instruksi seperti `jangan deploy dulu`, `jangan publish dulu`, `source code saja`, atau instruksi lain yang maknanya setara.
   - Jangan menutup task UI dengan status source code sudah berubah tetapi hasil belum tersedia untuk tester di web/mobile yang terdampak, kecuali ada instruksi eksplisit untuk menahan publish atau ada blocker teknis yang wajib dilaporkan jujur.
   - Jika ada pengembangan menu, sub-menu, tab, atau fitur baru yang muncul di navigasi user, pastikan breadcrumb juga ikut disesuaikan agar konteks halaman tetap jelas dan konsisten.
   - Jangan menambah fitur/menu baru dengan breadcrumb yang tertinggal, salah label, atau tidak mengenali tab aktif.
   - Untuk mobile tester:
     - jalankan verifikasi dasar
     - publish OTA ke channel yang dipakai tester secara default setelah perubahan mobile lolos verifikasi
     - untuk notifikasi update OTA yang user-facing, gunakan copy baku yang konsisten dan wajib memuat kalimat `Silakan perbarui untuk menikmati fitur terbaru.`
     - jangan mengubah judul/pesan notifikasi update OTA per publish, per channel, atau per script kecuali user meminta eksplisit
   - Untuk web:
     - deploy/update frontend sesuai workflow existing project secara default setelah perubahan web lolos verifikasi

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
   - Untuk menu tab horizontal di web, gunakan gaya standar seperti tab pada `Kelola Ujian` Wakakur:
     - garis bawah/`border-b-2` sebagai indikator aktif
     - tanpa model kartu/pill tebal kecuali user meminta eksplisit
     - tab harus tetap mudah discan secara horizontal dan konsisten antar role
  - Untuk menu tab horizontal di mobile, gunakan komponen shared yang mengikuti hierarki visual tab web tersebut; jangan membuat gaya tab baru per screen yang maknanya berbeda.
  - Untuk dropdown/filter di web, gunakan standar berikut:
    - dropdown dengan opsi sedikit dan sifatnya sederhana seperti `semester`, `status`, `jenis`, `mode`, atau filter pendek lain harus memakai gaya dropdown compact standar seperti filter pada `Persetujuan Izin`
    - dropdown dengan opsi banyak seperti `guru`, `siswa`, `mapel`, `kelas`, atau data besar lain harus memakai pola searchable dropdown seperti `Tambah Assignment Guru`, lengkap dengan kotak pencarian dan tinggi panel yang dibatasi
    - jangan memakai native dropdown polos untuk data besar jika pencarian sudah jelas dibutuhkan secara operasional
    - lebar dropdown harus proporsional dengan isi, tidak terlalu pendek hingga label terpotong tanpa alasan, dan panel opsi tidak boleh terlalu tinggi sampai menabrak layout utama
  - Untuk dropdown di mobile, tetap gunakan komponen shared seperti `MobileSelectField` dan pertahankan makna yang sama dengan versi web; jangan membuat interpretasi visual baru untuk jenis filter yang sama.
  - Jika menambah fitur/input/aksi baru pada layar existing, jangan langsung ditempel terbuka di bawah konten utama. Gunakan popup/modal agar layout tetap rapi.
   - Untuk popup/modal, gunakan standar overlay yang tetap memperlihatkan konteks halaman di belakang secara halus; hindari backdrop hitam pekat yang membuat layar belakang “hilang”.
   - Gunakan pola visual popup yang konsisten dengan modal operasional utama project ini, terutama gaya popup seperti pada fitur `Buat Jadwal Ujian`: konten fokus, backdrop ringan, dan context halaman tetap terbaca.
   - Popup tambahan wajib mengikuti standar modal operasional seperti `Lihat Detail Mengajar`: center terhadap area konten, body scroll jika panjang, dan tidak boleh tertutup hanya karena klik area luar; tutup hanya lewat tombol/aksi yang jelas.
   - Jika membuat popup/modal baru, tinggi popup wajib dibatasi agar tidak melewati area header global aplikasi (terutama area ikon notifikasi) dan posisi popup harus center terhadap area konten halaman aktif, bukan terhadap lebar penuh layar yang ikut menghitung sidebar.
   - Popup/modal harus tetap proporsional dan dinamis saat sidebar ditarik, diciutkan, atau berubah lebar; jangan hardcode posisi yang hanya pas pada satu lebar sidebar.
   - Jika isi popup panjang, scroll harus terjadi di body popup, bukan dengan membiarkan popup memanjang melewati header. Jika data sangat banyak, utamakan grouping/collapse yang rapi seperti pola `Jadwal Mengawas` Wakakur agar tetap mudah dibaca.
   - Untuk dokumen cetak/surat yang membutuhkan kop/header institusi, gunakan header surat baku sekolah secara konsisten.
   - Header dokumen harus bersifat dinamis berdasarkan data existing yang relevan, terutama daftar kompetensi keahlian/jurusan; jangan hardcode per dokumen jika datanya sudah bisa dibaca dari source of truth.
   - Untuk barcode/QR verifikasi dokumen, gunakan standar pola BA/Jadwal Mengawas sebagai default:
     - tautan verifikasi harus sesingkat dan sesederhana mungkin
     - token verifikasi harus ringkas dan tidak membuat QR terlalu padat
     - ukuran QR harus proporsional untuk cetak A4 dan tetap mudah dipindai
     - hindari menambah teks legalitas panjang di area tanda tangan kecuali user meminta eksplisit

14. **Jaga efisiensi token dan konteks**
   - Untuk pekerjaan panjang, lebih baik kerja per batch yang jelas daripada terlalu sering bolak-balik revisi kecil.
   - Update ke user boleh ringkas, tetapi tetap harus informatif.
   - Hindari penjelasan panjang yang tidak menambah nilai praktis bagi user.
   - Setiap `room chat`/thread baru harus dianggap sebagai konteks kerja yang **mandiri**. Jangan otomatis menarik, merangkum, atau melanjutkan topik dari room/thread/chat lain hanya karena ada riwayat recent chat yang tersedia.
   - Jika user di room baru hanya meminta `baca AGENTS.md` atau instruksi kerja umum sejenis, cukup baca policy lalu kerjakan task di room aktif. **Jangan** melakukan audit history room lain kecuali user meminta eksplisit.
   - Konteks dari room/chat lain hanya boleh diambil jika user secara jelas meminta, misalnya dengan arahan seperti `lanjutkan dari room X`, `ambil recent chat room Y`, `tarik konteks dari thread sebelumnya`, atau permintaan eksplisit lain yang maknanya setara.
   - Jika ada dugaan task saat ini berhubungan dengan room lama tetapi user tidak meminta penarikan konteks, default yang aman adalah **tidak** membuka history room lain dan cukup bekerja dari instruksi room aktif.

15. **Tahun ajaran aktif adalah source of truth operasional**
   - Untuk semua halaman `operasional`, `pembelajaran`, `approval`, `input`, `monitoring aktif`, dan workflow harian, konteks tahun ajaran wajib mengikuti `tahun ajaran aktif` yang tampil di header aplikasi.
   - Fitur baru operasional tidak boleh menambahkan selector, dropdown, chip, query param, local storage restore, atau fallback lain yang memungkinkan user diam-diam bekerja di tahun ajaran yang berbeda dari header.
   - Jika halaman hanya perlu menampilkan konteks tahun ajaran, gunakan tampilan `read-only` seperti notice, badge, helper text, atau field disabled yang menegaskan bahwa data mengikuti tahun ajaran aktif.
   - Selector/filter `tahun ajaran` hanya boleh ada pada halaman yang memang `arsip`, `laporan historis`, `rekap lintas tahun`, atau `konfigurasi lintas tahun`.
   - Jika sebuah halaman memang lintas tahun, status tersebut wajib dibuat eksplisit di UI, misalnya dengan label seperti `Mode Arsip`, `Data Historis`, atau `Data Tahun Ajaran ...`, agar tidak disalahartikan sebagai workflow operasional aktif.
   - Jika sebuah layar operasional hanya **mengikuti tahun ajaran aktif** tanpa memberi pilihan apa pun, jangan tampilkan card, label, field disabled, helper box, atau keterangan tambahan tentang tahun ajaran tersebut hanya sebagai dekorasi. Cukup ikuti header aplikasi sebagai source of truth agar UI tidak redundan dan tidak ambigu.
   - Jangan menggunakan `class.academicYearId`, `assignment.academicYearId`, `selectedAcademicYear` lama, cache lama, atau state turunan lain sebagai override implisit terhadap tahun ajaran aktif pada layar operasional.
   - Endpoint/backend baru harus mengikuti kontrak ini:
     - endpoint operasional mengikuti tahun ajaran aktif atau tervalidasi terhadap tahun ajaran aktif
     - endpoint historis/lintas tahun harus memakai `academicYearId` eksplisit dan tidak disamarkan sebagai endpoint operasional
   - Setiap pengembangan fitur baru wajib melakukan sanity check bahwa konteks `tahun ajaran` di web, mobile, dan header tetap konsisten sebelum dianggap final.
   - Jika ada keraguan apakah sebuah layar termasuk operasional atau historis, default yang aman adalah menganggap layar tersebut `operasional` dan menguncinya ke tahun ajaran aktif.

16. **Realtime harus event-driven, scoped, dan hemat beban**
   - Untuk fitur baru yang datanya dipakai lintas user/role/screen, jangan default ke polling agresif atau refetch global.
   - Realtime harus mengikuti prinsip berikut:
     - gunakan event domain yang kecil dan jelas, bukan broadcast data besar
     - invalidate/refetch hanya query yang relevan dengan scope perubahan
     - hindari `invalidateQueries()` global kecuali benar-benar tidak ada scope aman lain
     - layar observasi/monitoring boleh auto-refresh
     - layar form/edit/input tidak boleh auto-overwrite state user yang sedang mengetik; jika ada perubahan dari luar, tampilkan sinyal untuk muat ulang dengan sadar
     - layar berat seperti preview akhir, ledger besar, ranking besar, export, dan laporan lintas banyak data harus memakai konsep `stale-aware snapshot`, bukan recompute penuh setiap ada mutasi kecil
   - Polling hanya boleh dipakai sebagai fallback, bukan source of truth utama, dengan aturan:
     - harus mati saat screen/tab/background tidak aktif jika platform memungkinkan
     - interval harus sejarang mungkin sesuai kebutuhan operasional
     - jangan menambah polling baru jika event scoped yang aman sudah bisa dipakai
   - Websocket/realtime wajib diberi guardrail:
     - backoff/cooldown reconnect
     - debounce/batching invalidate bila perlu
     - jangan membuat satu mutasi kecil memicu fan-out refetch ke banyak modul yang tidak relevan
   - Untuk fitur baru, urutan desain yang wajib diutamakan adalah:
     - tentukan source of truth data
     - tentukan query key yang scoped
     - tentukan event domain/mutation target yang scoped
     - baru tentukan fallback polling yang ringan jika memang masih diperlukan
   - Jika ada tradeoff antara realtime penuh vs kesehatan server/database, selalu pilih desain yang lebih aman untuk server walaupun refresh user tidak benar-benar instan.

17. **Notifikasi harus tepat sasaran, actionable, dan tidak nyasar**
   - Untuk fitur baru yang membuat notifikasi, tentukan dulu dengan jelas:
     - siapa pengirim/aktor
     - siapa penerima
     - apakah notifikasi bersifat individual, per kelas, per wali kelas, per divisi, per additional duty, atau lintas role tertentu
     - apakah notifikasi hanya informasional atau memang harus membuka layar tertentu
   - Jangan broadcast notifikasi ke role besar hanya karena lebih mudah. Selalu pilih scope penerima terkecil yang benar-benar relevan.
   - Jika notifikasi bersifat actionable, payload notifikasi wajib membawa `route` yang valid dan konsisten di web/mobile. Jangan mengandalkan fallback generic jika source of truth rutenya sebenarnya sudah jelas.
   - Jika notifikasi hanya informasional, boleh tanpa `route`, tetapi harus tetap jelas konteksnya di `title/message` agar user tidak bingung saat membukanya dari inbox.
   - Data notifikasi baru wajib semaksimal mungkin membawa metadata ringan yang cukup untuk audit dan routing, terutama:
     - `module`
     - `route` jika actionable
     - `actorId` / `actorName` / `actorRole` jika relevan
     - `scope` seperti `studentId`, `classId`, `scheduleId`, `packetId`, `periodId`, atau identifier domain lain yang memang diperlukan
   - Jangan membuat payload notifikasi terlalu besar, jangan memasukkan snapshot data berat, dan jangan menjadikan notifikasi sebagai source of truth utama layar.
   - Untuk notifikasi lintas role, parity web/mobile wajib dijaga:
     - arti notifikasi sama
     - tujuan navigasi sama
     - fallback route tidak boleh saling bertentangan
   - Jika satu domain punya penerima berbasis duty/jabatan khusus, gunakan source of truth duty/jabatan tersebut secara eksplisit; jangan hardcode satu jabatan jika secara operasional scope-nya mencakup beberapa jabatan setara.
   - Untuk reminder/notification yang berpotensi sering muncul, wajib ada guardrail dedupe, cooldown, atau pembatasan frekuensi agar tidak spam user dan tidak membebani server/database.
   - Saat mengembangkan notifikasi baru, lakukan sanity check minimal:
     - apakah penerima yang dipilih sudah paling tepat
     - apakah role lain tidak ikut menerima tanpa alasan
     - apakah klik notifikasi benar-benar membuka layar yang relevan
     - apakah inbox web dan mobile menafsirkan notifikasi itu dengan perilaku yang sama

## Default Close-Out

18. **Penutupan pekerjaan minimal harus memuat**
   - apa yang dikerjakan
   - verifikasi yang dijalankan
   - status publish/live web dan/atau OTA mobile untuk platform yang terdampak
   - progress % bila pekerjaan masih bertahap
   - konfirmasi bahwa worktree sudah clean
   - konfirmasi bahwa commit task sudah dipush ke `origin/main`

19. **Kontinuitas antar room chat wajib berbasis repo, bukan ingatan chat**
   - Jika user di room chat baru meminta `baca AGENTS.md`, `lanjut`, `teruskan`, atau instruksi sejenis, jangan mengandalkan memory dari room lain.
   - Untuk bootstrap konteks room baru, wajib lakukan urutan aman berikut:
     - baca `AGENTS.md`
     - baca `docs/CODEX_CONTINUITY.md`
     - cek `git status --short`
     - cek commit terbaru yang relevan, minimal `git log -1 --stat --decorate`
   - Setelah itu, laporkan ringkas kepada user:
     - progres terakhir yang tercatat
     - task aktif yang belum selesai
     - status worktree
     - langkah aman berikutnya untuk melanjutkan
   - Jika `docs/CODEX_CONTINUITY.md` belum diperbarui atau tertinggal dari kondisi repo, gunakan repo sebagai source of truth utama lalu perbarui file kontinuitas tersebut pada batch kerja berikutnya.
   - Jangan menarik history room/chat lain kecuali user meminta eksplisit. Kontinuitas lintas room harus diselesaikan lewat artefak repo yang bisa dibaca ulang secara deterministik.

20. **Jika pekerjaan terpotong, wajib tinggalkan handoff yang bisa dilanjutkan room baru**
   - Jika pekerjaan panjang, multi-batch, berisiko kena limit token, atau harus berhenti sebelum final close-out, wajib perbarui `docs/CODEX_CONTINUITY.md` sebelum sesi berakhir jika secara teknis masih memungkinkan.
   - File kontinuitas minimal harus memuat:
     - objective/task aktif
     - batch/wave terakhir yang selesai
     - progress persentase yang jujur
     - file/area yang sudah disentuh
     - verifikasi yang sudah dijalankan
     - publish/live status
     - sisa pekerjaan
     - blocker/residual risk jika ada
     - langkah berikutnya yang paling aman
     - timestamp update terakhir
     - commit hash terkait jika sudah ada
   - Jika sesi terhenti saat worktree masih kotor, isi handoff harus menjelaskan dengan jujur perubahan yang belum selesai dan apa yang harus dicek lebih dulu sebelum melanjutkan.
   - Jika satu batch sudah benar-benar selesai, dorong penyelesaian sampai commit/push sesuai policy agar room baru tidak bergantung pada worktree kotor.
   - `docs/CODEX_CONTINUITY.md` adalah source of truth progres operasional antar-room; setiap room baru wajib membacanya sebelum menyimpulkan status terakhir project.
