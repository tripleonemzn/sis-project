#!/bin/bash
set -euo pipefail

ROOT_DIR="/var/www/sis-project"

echo "update_all.sh sekarang menjadi wrapper ke deploy web isolated."
echo "Menjalankan deploy dari worktree terisolasi agar workspace root tetap bersih."

if [ "${ALLOW_DIRTY_DEPLOY:-0}" = "1" ]; then
  ALLOW_DIRTY_DEPLOY=1 bash "$ROOT_DIR/scripts/deploy-web-isolated.sh"
else
  bash "$ROOT_DIR/scripts/deploy-web-isolated.sh"
fi
