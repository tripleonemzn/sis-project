#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:-}"
if [[ -z "$APK_PATH" ]]; then
  echo "Usage: npm run qa:install:adb -- /path/to/app.apk"
  exit 1
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "[ERROR] APK tidak ditemukan: $APK_PATH"
  exit 1
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "[ERROR] adb tidak tersedia. Install Android Platform Tools."
  exit 1
fi

devices="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
if [[ -z "$devices" ]]; then
  echo "[ERROR] Tidak ada device ADB yang terhubung."
  echo "Aktifkan USB Debugging dan izinkan komputer ini di perangkat."
  exit 1
fi

echo "[INFO] Device terdeteksi:"
echo "$devices"
echo "[INFO] Installing APK: $APK_PATH"
adb install -r "$APK_PATH"
echo "[OK] Install selesai."
