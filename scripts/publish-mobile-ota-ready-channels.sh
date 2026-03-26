#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/mobile-app"

TARGET_CHANNELS=("pilot-live" "pilot" "production")
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Usage: bash ./scripts/publish-mobile-ota-ready-channels.sh [--check-only] [--channels pilot-live,pilot,production] [message...]

Tujuan:
- Menentukan channel Android mana saja yang punya binary dengan runtime cocok.
- Publish OTA hanya ke channel yang benar-benar reachable oleh APK yang terpasang.

Contoh:
- bash ./scripts/publish-mobile-ota-ready-channels.sh --check-only
- bash ./scripts/publish-mobile-ota-ready-channels.sh --channels pilot-live "Uji fitur bendahara"
EOF
}

MESSAGE_PARTS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    --channels)
      if [ "$#" -lt 2 ]; then
        echo "[ERROR] --channels membutuhkan nilai."
        exit 1
      fi
      IFS=',' read -r -a TARGET_CHANNELS <<< "$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        MESSAGE_PARTS+=("$1")
        shift
      done
      ;;
    *)
      MESSAGE_PARTS+=("$1")
      shift
      ;;
  esac
done

APP_VERSION="$(
  node -e "const app=require(process.argv[1]); process.stdout.write(String(app?.expo?.version || ''));" \
    "${APP_DIR}/app.json"
)"

RUNTIME_VERSION="$(
  node -e "const app=require(process.argv[1]); const runtime=app?.expo?.runtimeVersion; if (typeof runtime === 'string') { process.stdout.write(runtime); process.exit(0); } if (runtime && runtime.policy === 'appVersion') { process.stdout.write(String(app?.expo?.version || '')); process.exit(0); } if (runtime && typeof runtime.version === 'string') { process.stdout.write(runtime.version); process.exit(0); } process.exit(1);" \
    "${APP_DIR}/app.json"
)"

if [ -z "${APP_VERSION}" ] || [ -z "${RUNTIME_VERSION}" ]; then
  echo "[ERROR] Gagal menentukan app version/runtime version dari mobile-app/app.json."
  exit 1
fi

if [ "${#MESSAGE_PARTS[@]}" -gt 0 ]; then
  MESSAGE="${MESSAGE_PARTS[*]}"
else
  TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
  MESSAGE="Mobile OTA ${TIMESTAMP} (reachable channels)"
fi

echo "== Mobile OTA Reachable Channels =="
echo "App version : ${APP_VERSION}"
echo "Runtime     : ${RUNTIME_VERSION}"
echo "Targets     : ${TARGET_CHANNELS[*]}"
echo

READY_CHANNELS=()
SKIPPED_CHANNELS=()

for channel in "${TARGET_CHANNELS[@]}"; do
  if [ -z "${channel}" ]; then
    continue
  fi

  json_file="$(mktemp)"
  (
    cd "${APP_DIR}"
    npx eas-cli build:list \
      --platform android \
      --status finished \
      --channel "${channel}" \
      --runtime-version "${RUNTIME_VERSION}" \
      --limit 1 \
      --json > "${json_file}"
  )

  if summary="$(
    node -e "const fs=require('fs'); const rows=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (!Array.isArray(rows) || rows.length === 0) process.exit(2); const row=rows[0]; process.stdout.write([row.buildProfile || '-', row.appVersion || '-', row.runtimeVersion || '-', row.createdAt || '-', row.id || '-'].join('|'));" \
      "${json_file}" 2>/dev/null
  )"; then
    IFS='|' read -r build_profile build_app_version build_runtime build_created_at build_id <<< "${summary}"
    echo "[READY] ${channel}"
    echo "        profile : ${build_profile}"
    echo "        version : ${build_app_version}"
    echo "        runtime : ${build_runtime}"
    echo "        build   : ${build_id}"
    echo "        created : ${build_created_at}"
    READY_CHANNELS+=("${channel}")
  else
    echo "[SKIP]  ${channel}"
    echo "        tidak ada Android build selesai dengan runtime ${RUNTIME_VERSION}"
    SKIPPED_CHANNELS+=("${channel}")
  fi

  rm -f "${json_file}"
  echo
done

if [ "${CHECK_ONLY}" = "1" ]; then
  if [ "${#SKIPPED_CHANNELS[@]}" -gt 0 ]; then
    echo "[WARN] Sebagian channel belum siap untuk runtime ${RUNTIME_VERSION}: ${SKIPPED_CHANNELS[*]}"
    exit 2
  fi
  echo "[PASS] Semua channel target siap."
  exit 0
fi

if [ "${#READY_CHANNELS[@]}" -eq 0 ]; then
  echo "[ERROR] Tidak ada channel yang reachable untuk runtime ${RUNTIME_VERSION}."
  echo "        Build APK/AAB baru dulu untuk channel target, lalu publish OTA ulang."
  exit 2
fi

echo "Publishing OTA message:"
echo "${MESSAGE}"
echo

for channel in "${READY_CHANNELS[@]}"; do
  echo "-> Publish ke channel ${channel}"
  bash "${ROOT_DIR}/scripts/publish-mobile-ota-isolated.sh" "${channel}" "${MESSAGE}"
  echo
done

if [ "${#SKIPPED_CHANNELS[@]}" -gt 0 ]; then
  echo "[WARN] Channel berikut dilewati karena belum punya binary runtime ${RUNTIME_VERSION}: ${SKIPPED_CHANNELS[*]}"
fi

echo "[PASS] OTA publish selesai untuk channel reachable: ${READY_CHANNELS[*]}"
