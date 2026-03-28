#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_DIR="$(mktemp -d /tmp/sis-web-deploy-XXXXXX)"
CHECK_ONLY=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  bash ./scripts/deploy-web-isolated.sh [--check-only]

Options:
  --check-only   Build/test dari worktree terisolasi tanpa db push, sync artifact, atau restart service.
EOF
      exit 0
      ;;
    *)
      echo "ERROR: opsi tidak dikenal: $1"
      exit 1
      ;;
  esac
  shift
done

if [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ] && [ -x "${ROOT_DIR}/scripts/repo-safety-gate.sh" ]; then
  echo "Running repo safety gate (mode: web)..."
  bash "${ROOT_DIR}/scripts/repo-safety-gate.sh" web
else
  echo "Skip repo safety gate (ALLOW_DIRTY_DEPLOY=${ALLOW_DIRTY_DEPLOY:-0})."
fi

INITIAL_STATUS="$(git -C "$ROOT_DIR" status --porcelain)"

cleanup() {
  if git -C "$ROOT_DIR" worktree list --porcelain | grep -q "^worktree ${WORKTREE_DIR}\$"; then
    git -C "$ROOT_DIR" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKTREE_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Preparing isolated worktree for web deploy..."
echo "Root       : $ROOT_DIR"
echo "Worktree   : $WORKTREE_DIR"
echo "Check only : $CHECK_ONLY"

git -C "$ROOT_DIR" worktree add --detach "$WORKTREE_DIR" HEAD >/dev/null

sync_dir() {
  local source_dir="$1"
  local target_dir="$2"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$source_dir/" "$target_dir/"
  else
    rm -rf "$target_dir"
    mkdir -p "$(dirname "$target_dir")"
    cp -r "$source_dir" "$target_dir"
  fi
}

sync_dir "$ROOT_DIR/backend" "$WORKTREE_DIR/backend"
sync_dir "$ROOT_DIR/frontend" "$WORKTREE_DIR/frontend"
sync_dir "$ROOT_DIR/scripts" "$WORKTREE_DIR/scripts"

if [ -f "$ROOT_DIR/update_all.sh" ]; then
  cp "$ROOT_DIR/update_all.sh" "$WORKTREE_DIR/update_all.sh"
fi

if [ -f "$ROOT_DIR/demo_sis.html" ]; then
  mkdir -p "$WORKTREE_DIR/frontend/public"
  cp "$ROOT_DIR/demo_sis.html" "$WORKTREE_DIR/frontend/public/demo_sis.html"
  echo "Synced demo_sis.html into isolated frontend/public/"
fi

unset npm_config_prefix NPM_CONFIG_PREFIX

echo
echo "== Backend =="
cd "$WORKTREE_DIR/backend"
echo "-> Validating Prisma schema"
npx prisma validate

if [ "$CHECK_ONLY" -eq 0 ]; then
  echo "-> Syncing database schema"
  npx prisma db push --skip-generate
else
  echo "-> Check only: skip prisma db push"
fi

echo "-> Building TypeScript"
npm run build

if [ "$CHECK_ONLY" -eq 0 ]; then
  echo "-> Syncing backend dist to root tree"
  mkdir -p "$ROOT_DIR/backend/dist"
  sync_dir "$WORKTREE_DIR/backend/dist" "$ROOT_DIR/backend/dist"

  echo "-> Reloading PM2 backend"
  pm2 startOrReload "$ROOT_DIR/backend/ecosystem.config.cjs" --only sis-backend --update-env
  pm2 save >/dev/null 2>&1 || true
else
  echo "-> Check only: skip backend dist sync and PM2 reload"
fi

echo
echo "== Frontend =="
cd "$WORKTREE_DIR/frontend"
echo "-> Building frontend"
npm run build

if [ "$CHECK_ONLY" -eq 0 ]; then
  echo "-> Deploying frontend dist to /var/www/html/"
  mkdir -p /var/www/html
  cp -r dist/. /var/www/html/
else
  echo "-> Check only: skip frontend deploy copy"
fi

echo
FINAL_STATUS="$(git -C "$ROOT_DIR" status --porcelain)"
if [ "$INITIAL_STATUS" != "$FINAL_STATUS" ]; then
  echo "[WARN] Root worktree status changed during deploy."
  echo "Before:"
  printf '%s\n' "$INITIAL_STATUS"
  echo "After:"
  printf '%s\n' "$FINAL_STATUS"
  exit 2
fi

echo "[PASS] Web deploy completed from isolated worktree."
