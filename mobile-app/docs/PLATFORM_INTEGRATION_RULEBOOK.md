# SOP Integrasi Multi-Platform (Web, Android, iOS)

## Tujuan
- Menjaga semua platform tetap selaras saat fitur berkembang.
- Mencegah web dan mobile berjalan sendiri-sendiri.
- Menjaga kualitas production saat tim mengembangkan fitur baru.

## Prinsip Wajib
1. Backend API adalah source of truth lintas platform.
2. Perubahan API harus additive dan backward-compatible.
3. Setiap fitur baru wajib punya rencana parity web + mobile.
4. Fitur dianggap selesai jika status parity jelas, bukan hanya web selesai.
5. Tidak boleh ada breaking change langsung ke endpoint yang dipakai production.

## Jawaban Aturan: "Apakah web otomatis mengubah mobile?"
- Tidak otomatis penuh.
- Otomatis hanya pada kasus tertentu:
  - Perubahan backend internal tanpa ubah kontrak API.
  - Perubahan data yang dibaca endpoint lama.
- Tidak otomatis bila:
  - Ada UI/UX baru di web.
  - Ada endpoint baru/flow baru.
  - Ada kebutuhan native mobile (permission, modul native, dsb).

## Klasifikasi Perubahan
| Tipe | Contoh | Web Terupdate | Android/iOS Terupdate | Aksi Wajib |
|---|---|---|---|---|
| A: Backend internal | Optimasi query, bugfix internal | Ya | Ya (jika endpoint sama) | Smoke test 3 platform |
| B: API additive | Tambah field/endpoint baru | Ya | Belum otomatis | Tambah tiket parity mobile |
| C: API breaking | Ubah struktur response existing | Berisiko rusak | Berisiko rusak | Dilarang, wajib versi endpoint |
| D: UI web only | Menu/halaman baru web | Ya | Tidak | Wajib entry parity matrix |
| E: Native mobile | Kamera/background task/permission baru | N/A | Butuh build baru | Build Android + iOS |

## Aturan Parity per Fitur
1. Setiap fitur baru harus punya `Feature ID`.
2. `Feature ID` wajib masuk ke parity matrix (`mobile-app/docs/PARITY_MATRIX_*.md`).
3. Isi minimum parity matrix:
   - Route web
   - Route/screen mobile
   - Endpoint API
   - Dampak role
   - Status (`NOT_STARTED/IN_DEV/IN_QA/DONE/BLOCKED`)
   - Target rilis
4. Jika web release duluan, status mobile harus tetap tercatat dengan ETA jelas.

## Definition of Done (Lintas Platform)
Sebuah fitur dinyatakan `DONE` hanya jika:
1. Backend/API stabil dan backward-compatible.
2. Web lulus QA.
3. Mobile Android lulus QA.
4. Mobile iOS lulus QA (minimal TestFlight).
5. Release note dibuat (apa berubah, siapa terdampak, rollback plan).

## SLA Parity (Disiplin Integrasi)
- P0 (kritis operasional): parity mobile maksimal 3 hari kerja setelah web release.
- P1 (penting): parity mobile maksimal 7 hari kerja.
- P2 (enhancement): masuk sprint berikutnya.
- Jika SLA tidak bisa dipenuhi, fitur web harus pakai feature flag/rollout bertahap.

## Strategi Rilis Wajib
Urutan rilis standar:
1. Deploy backend additive.
2. Deploy web.
3. Deploy mobile OTA untuk perubahan JS/TS/UI biasa.
4. Deploy binary baru Android/iOS untuk perubahan native.

## Aturan OTA vs Build Baru
- Gunakan OTA jika perubahan hanya:
  - JS/TS logic
  - Layout/UI
  - Validasi/form
  - Query/fetch data
- Wajib build baru jika perubahan menyentuh:
  - Permission baru
  - Modul native baru
  - Perubahan `app.json`/runtime native
  - Upgrade SDK native kritikal

## Aturan Khusus iOS (Disiapkan dari Sekarang)
1. Gunakan jalur resmi: TestFlight untuk pilot, App Store untuk produksi.
2. Siapkan dan kunci dari awal:
   - Bundle identifier
   - Apple Team
   - Signing profile
   - EAS profile iOS (`internal`, `production`)
3. Semua fitur baru wajib diuji minimal sekali di device iOS nyata sebelum status `DONE`.
4. Perubahan native iOS wajib masuk jadwal review Apple (jangan mepet jadwal sekolah/ujian).

## Checklist Go/No-Go Release
1. API compatibility checklist lulus.
2. Parity matrix ter-update.
3. QA web + Android + iOS lulus untuk scope rilis.
4. OTA/binary path sudah sesuai tipe perubahan.
5. Rollback plan ada dan bisa dieksekusi.
6. Release note dibagikan ke tester/stakeholder.

Dokumen operasional siap pakai:
- `mobile-app/docs/PARITY_RELEASE_GATE_CHECKLIST.md`
- `mobile-app/docs/ALL_ROLE_MENU_PARITY_RULE.md`
- `mobile-app/docs/ROLE_PARITY_AUDIT_2026-02-19.md`

## Template Wajib Saat Mulai Fitur
```md
Feature ID:
Nama Fitur:
Tipe Perubahan: (A/B/C/D/E)
Dampak Platform: Web / Android / iOS
Perlu OTA: Ya/Tidak
Perlu Build Baru: Android Ya/Tidak, iOS Ya/Tidak
Endpoint Terlibat:
Status Parity:
Target Rilis:
Risiko:
Rollback Plan:
```

## Operasional Mingguan
1. Review parity matrix (30 menit/minggu).
2. Cek item P0/P1 yang belum punya ETA.
3. Pastikan tidak ada fitur web production tanpa status parity mobile.

---
Dokumen ini menjadi acuan keputusan release lintas platform. Jika ada pengecualian, wajib dicatat di release note.
