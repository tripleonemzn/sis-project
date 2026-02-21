# Checklist Parity Gate (Go/No-Go Rilis)

## Tujuan
- Menjadi gerbang final sebelum rilis agar web, Android, dan iOS tetap sinkron.
- Dipakai untuk keputusan `GO` atau `NO-GO` rilis.

## Kapan Dipakai
- Setiap akan rilis fitur baru ke production.
- Setiap batch pilot tester yang membawa perubahan fitur.
- Setiap perubahan API yang berdampak lintas platform.

## Cara Pakai Singkat
1. Duplikat template ini per rilis (contoh: `releases/parity-gate-2026-02-20.md`).
2. Isi semua checklist.
3. Jika ada poin gagal, status wajib `NO-GO` sampai diperbaiki.

---

## Identitas Rilis
- Release Name:
- Tanggal:
- Owner Release:
- Scope Fitur (Feature ID):
- Channel/Distribusi:
  - Web:
  - Android: (`pilot-live` untuk real-time test / `pilot` untuk stabil / `production` untuk rilis)
  - iOS:

## Gate A - API Compatibility
- [ ] Tidak ada breaking change endpoint existing.
- [ ] Endpoint baru bersifat additive.
- [ ] Contract response critical endpoint sudah diverifikasi.
- [ ] Fallback behavior untuk client lama aman.

Catatan Gate A:

## Gate B - Parity Matrix
- [ ] Semua Feature ID rilis tercatat di parity matrix.
- [ ] Status parity setiap Feature ID sudah update.
- [ ] Item P0 tidak ada yang `NOT_STARTED`.
- [ ] Jika ada gap parity, ETA dan mitigation sudah ditulis.

Catatan Gate B:

## Gate C - QA Lintas Platform
- [ ] Web: smoke test lulus.
- [ ] Android: smoke test lulus.
- [ ] iOS: smoke test lulus (minimal TestFlight/internal).
- [ ] Login/Session/Logout lulus di 3 platform.
- [ ] Skenario error utama sudah diuji (API error, internet putus, retry).

Catatan Gate C:

## Gate D - Distribusi & Update Path
- [ ] Perubahan ini valid untuk OTA (jika OTA dipakai).
- [ ] Jika ada native change, binary build baru sudah disiapkan.
- [ ] Catatan rilis user-facing sudah siap.
- [ ] Mekanisme rollback sudah siap dieksekusi.

Catatan Gate D:

## Gate E - Risiko Operasional
- [ ] Risiko utama sudah diidentifikasi.
- [ ] Dampak ke proses sekolah/ujian sudah dinilai.
- [ ] Window rilis tidak bentrok jadwal kritikal.
- [ ] Tim support standby pasca-rilis.

Catatan Gate E:

## Gate F - Sign-Off
- [ ] Backend Lead:
- [ ] Web Lead:
- [ ] Mobile Lead:
- [ ] QA Lead:
- [ ] Product/Stakeholder:

Keputusan:
- [ ] GO
- [ ] NO-GO

Alasan keputusan:

## Tindak Lanjut Jika NO-GO
- Issue blocker:
- PIC:
- Target fix:
- Target re-check gate:
