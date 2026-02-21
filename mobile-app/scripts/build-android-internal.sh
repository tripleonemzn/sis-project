#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== SIS Mobile Internal APK Build =="
echo "[1/5] Release config check"
npm run release:check

echo "[2/5] Readiness check"
npm run readiness

echo "[3/5] Expo doctor"
npm run doctor

echo "[4/5] TypeScript check"
npm run typecheck

echo "[5/5] Build internal APK (EAS)"
if ! npx eas-cli whoami >/dev/null 2>&1; then
  echo "[ERROR] Belum login ke Expo."
  echo "Jalankan: npx expo login"
  exit 1
fi

npx eas-cli build -p android --profile internal "$@"
