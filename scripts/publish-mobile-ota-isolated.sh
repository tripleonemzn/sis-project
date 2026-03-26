#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_DIR="$(mktemp -d /tmp/sis-mobile-ota-XXXXXX)"

if [ "$#" -ge 1 ]; then
  CHANNEL="$1"
  shift
else
  CHANNEL="pilot"
fi

cleanup() {
  if git -C "$ROOT_DIR" worktree list --porcelain | grep -q "^worktree ${WORKTREE_DIR}\$"; then
    git -C "$ROOT_DIR" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKTREE_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Preparing isolated worktree for OTA publish..."
echo "Root     : $ROOT_DIR"
echo "Worktree : $WORKTREE_DIR"

git -C "$ROOT_DIR" worktree add --detach "$WORKTREE_DIR" HEAD >/dev/null

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$ROOT_DIR/mobile-app/" "$WORKTREE_DIR/mobile-app/"
else
  rm -rf "$WORKTREE_DIR/mobile-app"
  cp -r "$ROOT_DIR/mobile-app" "$WORKTREE_DIR/mobile-app"
fi

cd "$WORKTREE_DIR/mobile-app"
echo "Publishing OTA from isolated tree..."
# Avoid inherited npm prefix (e.g. from `npm --prefix ... run ...`) that can break npx in isolated worktree.
unset npm_config_prefix NPM_CONFIG_PREFIX
bash ./scripts/publish-ota-safe.sh "$CHANNEL" "$@"

echo "OTA publish completed from isolated tree."
