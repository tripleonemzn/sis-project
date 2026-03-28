#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_DIR="$(mktemp -d /tmp/sis-mobile-ota-XXXXXX)"
INITIAL_STATUS="$(git -C "$ROOT_DIR" status --porcelain)"

if [ "$#" -ge 1 ]; then
  CHANNEL="$1"
  shift
else
  CHANNEL="pilot"
fi

if [ "${ALLOW_DIRTY_OTA:-0}" != "1" ] && [ -x "${ROOT_DIR}/scripts/repo-safety-gate.sh" ]; then
  echo "Running repo safety gate (mode: mobile)..."
  if [ "${ALLOW_GIT_UNSYNC:-0}" = "1" ]; then
    ALLOW_GIT_UNSYNC=1 bash "${ROOT_DIR}/scripts/repo-safety-gate.sh" mobile
  else
    bash "${ROOT_DIR}/scripts/repo-safety-gate.sh" mobile
  fi
  INNER_ALLOW_DIRTY_OTA=1
else
  echo "Skip repo safety gate (ALLOW_DIRTY_OTA=${ALLOW_DIRTY_OTA:-0})."
  INNER_ALLOW_DIRTY_OTA=1
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
ALLOW_DIRTY_OTA="$INNER_ALLOW_DIRTY_OTA" bash ./scripts/publish-ota-safe.sh "$CHANNEL" "$@"

echo "OTA publish completed from isolated tree."

FINAL_STATUS="$(git -C "$ROOT_DIR" status --porcelain)"
if [ "$INITIAL_STATUS" != "$FINAL_STATUS" ]; then
  echo "[WARN] Root worktree status changed during OTA publish."
  echo "Before:"
  printf '%s\n' "$INITIAL_STATUS"
  echo "After:"
  printf '%s\n' "$FINAL_STATUS"
  exit 2
fi
