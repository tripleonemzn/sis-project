#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APK_PATH="${1:-}"
BUILD_URL="${2:-}"
RELEASE_NOTES_DIR="$ROOT_DIR/docs/releases"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$RELEASE_NOTES_DIR/internal-release-$TIMESTAMP.md"

mkdir -p "$RELEASE_NOTES_DIR"

checksum=""
apk_name="(not provided)"

if [[ -n "$APK_PATH" ]]; then
  if [[ ! -f "$APK_PATH" ]]; then
    echo "[ERROR] APK tidak ditemukan: $APK_PATH"
    exit 1
  fi

  apk_name="$(basename "$APK_PATH")"
  if command -v sha256sum >/dev/null 2>&1; then
    checksum="$(sha256sum "$APK_PATH" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    checksum="$(shasum -a 256 "$APK_PATH" | awk '{print $1}')"
  else
    echo "[ERROR] sha256sum/shasum tidak tersedia."
    exit 1
  fi
fi

cat >"$OUT_FILE" <<EOF
# Internal Release - $TIMESTAMP

## Build Info
- APK: $apk_name
- EAS Build URL: ${BUILD_URL:-"(isi URL build EAS di sini)"}
- SHA-256: ${checksum:-"(generate checksum setelah APK tersedia)"}

## Scope
- Login + session restore
- Home dashboard
- Profile
- Schedule
- Grades
- Attendance

## QA Checklist
- Install APK sukses di minimal 3 device Android berbeda.
- Login/logout/restore session berjalan normal.
- Tidak ada crash saat berpindah halaman inti.
- Data tampil konsisten dengan web untuk akun yang sama.
- Uji di jaringan lambat tetap usable.

## Known Issues
- (isi jika ada)

## Go/No-Go
- Status: (Go / No-Go)
- Catatan:
EOF

echo "[OK] Release note dibuat: $OUT_FILE"
if [[ -z "$APK_PATH" ]]; then
  echo "[INFO] Jalankan ulang dengan APK untuk auto checksum:"
  echo "       npm run release:prepare -- /path/to/app.apk https://expo.dev/artifacts/..."
fi
