#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${APP_DIR}/.." && pwd)"

if [ "${ALLOW_DIRTY_OTA:-0}" != "1" ] && [ -x "${ROOT_DIR}/scripts/repo-safety-gate.sh" ]; then
  echo "Running repo safety gate (mode: mobile)..."
  bash "${ROOT_DIR}/scripts/repo-safety-gate.sh" mobile
else
  echo "Skip repo safety gate (ALLOW_DIRTY_OTA=${ALLOW_DIRTY_OTA:-0})."
fi

bash "${SCRIPT_DIR}/publish-ota-update.sh" "$@"
