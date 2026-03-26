#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "== SIS Mobile Tester OTA Publish =="
echo "Standar tester channel: pilot-live"
echo

bash "${ROOT_DIR}/scripts/publish-mobile-ota-ready-channels.sh" --channels pilot-live "$@"
