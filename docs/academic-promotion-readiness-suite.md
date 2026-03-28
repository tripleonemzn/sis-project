# Academic Promotion Readiness Suite

Dokumen ini merangkum cara menjalankan uji penutup fitur `promotion v2` secara aman sebelum staging atau production.

## Tujuan

Suite ini dipakai untuk menjawab pertanyaan operasional berikut dalam satu command:

- apakah repo/worktree bersih dan sinkron
- apakah backend, frontend, dan mobile masih lolos verifikasi dasar
- apakah `Year Setup Clone Wizard` aman
- apakah `Promotion Center` bisa commit promotion
- apakah rollback terkontrol benar-benar mengembalikan state siswa
- apakah histori lintas domain tetap aman setelah promotion

Semua uji tulis dijalankan di clone database terisolasi, bukan database aktif.

## Command

```bash
bash ./scripts/run-academic-promotion-readiness-suite.sh --source-year <SOURCE_ID>
```

Opsi penting:

- `--skip-gate`
  - Lewati `repo-safety-gate.sh all` jika check build/typecheck sudah dijalankan terpisah.
- `--keep-clones`
  - Pertahankan clone DB tiap smoke test untuk inspeksi manual.
- `--fail-fast`
  - Hentikan suite pada kegagalan pertama.
- `--keep-logs`
  - Simpan log suite walau semua langkah lulus.

## Coverage

Suite ini menjalankan:

- `repo-safety-gate.sh all`
- `smoke-test-academic-year-rollover-clone.sh`
- `smoke-test-academic-promotion-clone.sh`
- `smoke-test-academic-promotion-rollback-clone.sh`
- `smoke-test-academic-report-history-clone.sh`
- `smoke-test-academic-report-archive-access-clone.sh`
- `smoke-test-academic-class-roster-history-clone.sh`
- `smoke-test-academic-grade-history-clone.sh`
- `smoke-test-academic-attendance-history-clone.sh`
- `smoke-test-academic-permission-history-clone.sh`
- `smoke-test-academic-internship-history-clone.sh`
- `smoke-test-academic-ukk-history-clone.sh`
- `smoke-test-academic-proctor-history-clone.sh`
- `smoke-test-academic-exam-sitting-history-clone.sh`
- `smoke-test-academic-exam-restriction-history-clone.sh`
- `smoke-test-academic-finance-history-clone.sh`
- `smoke-test-finance-refund-backfill-clone.sh`

## Interpretasi Hasil

`PASS` berarti:

- jalur setup tahun ajaran baru aman
- commit promotion aman di clone DB
- rollback promotion aman di clone DB
- permission arsip report sudah mengikuti `role + duty + historical ownership`
- histori domain utama tetap membaca snapshot tahun ajaran yang benar setelah promotion

`FAIL` berarti rollout belum boleh dilanjutkan ke staging/production sampai log step yang gagal diperiksa dan diperbaiki.
