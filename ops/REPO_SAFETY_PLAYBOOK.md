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
- Entry point rilis satu pintu:
  - `scripts/release-manager.sh` untuk `check` dan `deploy` scope `web/mobile`.

## Perintah Utama
- Cek bantuan release manager:
  - `bash ./scripts/release-manager.sh --help`
- Cek web + generate report:
  - `bash ./scripts/release-manager.sh web check --report`
- Deploy web normal:
  - `bash ./scripts/release-manager.sh web deploy`
- Deploy web darurat (dirty):
  - `bash ./scripts/release-manager.sh web deploy --allow-dirty`
- Cek mobile:
  - `bash ./scripts/release-manager.sh mobile check`
- Publish OTA mobile:
  - `bash ./scripts/release-manager.sh mobile deploy --channel pilot`
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
1. Jalankan `bash ./scripts/release-manager.sh web check --report`.
2. Jalankan `bash ./scripts/release-manager.sh web deploy`.

## Alur Rilis Aman (Mobile OTA)
1. Jalankan `bash ./scripts/release-manager.sh mobile check`.
2. Jalankan OTA:
   - `bash ./scripts/release-manager.sh mobile deploy --channel pilot`
3. Jika gate gagal karena scope campuran, isolasi dulu atau gunakan bypass darurat.

## Bypass Darurat
- Deploy web: `ALLOW_DIRTY_DEPLOY=1 bash ./update_all.sh`
- OTA mobile: `ALLOW_DIRTY_OTA=1 cd mobile-app && npm run update:pilot`

Gunakan bypass hanya saat ada persetujuan eksplisit dan insiden/time-critical.
