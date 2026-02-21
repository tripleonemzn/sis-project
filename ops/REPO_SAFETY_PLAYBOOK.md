# Repo Safety Playbook

Tujuan: menjaga deploy/release production tetap aman saat working tree sedang ramai perubahan.

## Prinsip
- Jangan deploy dari scope campuran tanpa validasi.
- Jalankan gate otomatis sebelum restart service atau publish OTA.
- Pisahkan staging/commit per scope (`web`, `mobile`, `scripts`).

## Guardrail Yang Aktif
- `update_all.sh` sekarang menjalankan `scripts/repo-safety-gate.sh web` sebelum build/deploy.
- OTA mobile bisa lewat wrapper aman:
  - `mobile-app/scripts/publish-ota-safe.sh`
  - npm scripts `update:pilot`, `update:staging`, `update:production`, `update:pilot-live` sudah mengarah ke wrapper ini.

## Perintah Utama
- Audit scope perubahan:
  - `bash ./scripts/scope-diff-report.sh`
- Cek gate web:
  - `bash ./scripts/repo-safety-gate.sh web`
- Cek gate mobile:
  - `bash ./scripts/repo-safety-gate.sh mobile`
- Simulasi staging scope:
  - `bash ./scripts/stage-scope.sh web --dry-run`
  - `bash ./scripts/stage-scope.sh mobile --dry-run`
- Terapkan staging scope:
  - `bash ./scripts/stage-scope.sh web --apply`
  - `bash ./scripts/stage-scope.sh mobile --apply`

## Alur Rilis Aman (Web)
1. Jalankan `bash ./scripts/repo-safety-gate.sh web`.
2. Pastikan backend/frontend build lulus.
3. Jalankan `bash ./update_all.sh`.

## Alur Rilis Aman (Mobile OTA)
1. Jalankan `bash ./scripts/repo-safety-gate.sh mobile`.
2. Jalankan OTA:
   - `cd mobile-app && npm run update:pilot`
3. Jika gate gagal karena scope campuran, isolasi dulu atau gunakan bypass darurat.

## Bypass Darurat
- Deploy web: `ALLOW_DIRTY_DEPLOY=1 bash ./update_all.sh`
- OTA mobile: `ALLOW_DIRTY_OTA=1 cd mobile-app && npm run update:pilot`

Gunakan bypass hanya saat ada persetujuan eksplisit dan insiden/time-critical.
