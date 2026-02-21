# Mobile UI/UX Guidelines

## Objective
Menjaga tampilan aplikasi mobile tetap menarik, elegant, dan user friendly secara konsisten saat semua fitur web diparitasikan.

## Design Principles
1. Clarity first:
   - Konten utama harus langsung terlihat tanpa scroll berlebihan.
   - Hindari teks panjang tanpa hirarki visual.
2. Elegant but simple:
   - Komponen bersih, whitespace cukup, dan tipografi konsisten.
   - Warna aksen dipakai seperlunya untuk fokus aksi.
3. Fast interaction:
   - Semua aksi utama maksimal 2-3 tap dari landing role.
   - Feedback interaksi selalu jelas (loading, success, error).
4. Accessibility baseline:
   - Ukuran teks minimal 12-14 untuk body.
   - Kontras warna memadai untuk keterbacaan.

## Visual Direction (SIS Mobile)
1. Tone:
   - Profesional, ramah, tidak terlalu ramai.
2. Color:
   - Dominan netral terang (`#f8fafc`, `#ffffff`).
   - Aksen primer biru (`#1d4ed8`).
   - State:
     - Error: merah lembut (`#fee2e2`, `#991b1b`)
     - Warning: oranye lembut (`#ffedd5`, `#9a3412`)
     - Success: hijau lembut (`#dcfce7`, `#166534`)
3. Shape:
   - Radius 8-12 untuk card/button/input agar modern dan konsisten.

## Typography
1. Heading:
   - 22-24, weight 700.
2. Subheading:
   - 14-16, weight 500-600.
3. Body:
   - 12-14, weight 400-500.
4. Metadata/helper:
   - 11-12, opacity/warna netral.

## Component Standards
1. Screen structure:
   - Header title
   - Subtitle/context
   - Content card/list
   - Primary action di area bawah
2. Button:
   - Tinggi touch area minimal 44.
   - State disabled harus terlihat jelas.
3. Card:
   - Border tipis netral + background putih.
   - Padding konsisten 10-14.
4. Form:
   - Label selalu tampil.
   - Error message dekat field dan spesifik.
5. Feedback states:
   - Wajib punya `loading`, `error`, `empty`, `data`.

## UX Rules per Feature
1. Dashboard:
   - Tampilkan ringkasan paling penting per role.
2. Data list:
   - Sediakan refresh manual.
   - Sediakan fallback empty state yang informatif.
3. Critical action:
   - Konfirmasi untuk aksi destruktif.
4. Offline behavior:
   - Tampilkan indicator cache/offline secara eksplisit.

## QA UI Checklist
1. Semua screen nyaman pada lebar device kecil (320-360 dp).
2. Tidak ada teks terpotong pada bahasa Indonesia.
3. Tidak ada tombol yang terlalu rapat untuk jari.
4. Navigasi tetap konsisten antar role.
5. Error message bisa dipahami non-teknis.

## Governance
1. Setiap PR fitur baru wajib menyertakan screenshot mobile:
   - normal state
   - loading/error/empty state
2. Jika menambah komponen baru, cek ulang konsistensi dengan guideline ini.
3. Jika melanggar guideline karena kebutuhan khusus, dokumentasikan alasannya di PR.

