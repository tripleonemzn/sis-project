#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== SIS Mobile Readiness Check =="

required_files=(
  "package.json"
  "app.json"
  "eas.json"
  ".env"
  "app/(auth)/login.tsx"
  "app/(app)/home.tsx"
  "app/(app)/schedule.tsx"
  "app/(app)/grades.tsx"
  "app/(app)/attendance.tsx"
)

missing=0
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[MISSING] $f"
    missing=1
  else
    echo "[OK] $f"
  fi
done

if ! command -v node >/dev/null 2>&1; then
  echo "[MISSING] node command not found"
  missing=1
else
  echo "[OK] node $(node -v)"
fi

if [[ -f ".env" ]]; then
  if grep -q "^EXPO_PUBLIC_API_BASE_URL=" .env; then
    value=$(grep "^EXPO_PUBLIC_API_BASE_URL=" .env | head -n1 | cut -d'=' -f2-)
    if [[ -z "$value" ]]; then
      echo "[WARN] EXPO_PUBLIC_API_BASE_URL is empty"
      missing=1
    else
      echo "[OK] EXPO_PUBLIC_API_BASE_URL configured"
    fi
  else
    echo "[MISSING] EXPO_PUBLIC_API_BASE_URL in .env"
    missing=1
  fi
fi

if [[ $missing -ne 0 ]]; then
  echo "== RESULT: NOT READY =="
  exit 1
fi

echo "== RESULT: READY FOR INTERNAL APK BUILD =="
