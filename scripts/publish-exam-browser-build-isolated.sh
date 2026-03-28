#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_DIR="$(mktemp -d /tmp/sis-exam-browser-build-XXXXXX)"
INITIAL_STATUS="$(git -C "$ROOT_DIR" status --porcelain)"

if [ "${ALLOW_DIRTY_EXAMBROWSER:-0}" != "1" ] && [ -x "${ROOT_DIR}/scripts/repo-safety-gate.sh" ]; then
  echo "Running repo safety gate (mode: exambrowser)..."
  bash "${ROOT_DIR}/scripts/repo-safety-gate.sh" exambrowser
else
  echo "Skip repo safety gate (ALLOW_DIRTY_EXAMBROWSER=${ALLOW_DIRTY_EXAMBROWSER:-0})."
fi

if [ "$#" -ge 1 ]; then
  PROFILE="$1"
  shift
else
  PROFILE="internal-live"
fi

cleanup() {
  if git -C "$ROOT_DIR" worktree list --porcelain | grep -q "^worktree ${WORKTREE_DIR}\$"; then
    git -C "$ROOT_DIR" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKTREE_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Preparing isolated worktree for exam-browser build..."
echo "Root     : $ROOT_DIR"
echo "Worktree : $WORKTREE_DIR"
echo "Profile  : $PROFILE"

git -C "$ROOT_DIR" worktree add --detach "$WORKTREE_DIR" HEAD >/dev/null

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$ROOT_DIR/exam-browser-app/" "$WORKTREE_DIR/exam-browser-app/"
else
  rm -rf "$WORKTREE_DIR/exam-browser-app"
  cp -r "$ROOT_DIR/exam-browser-app" "$WORKTREE_DIR/exam-browser-app"
fi

cd "$WORKTREE_DIR/exam-browser-app"
unset npm_config_prefix NPM_CONFIG_PREFIX

echo "Running exam-browser typecheck..."
npm run typecheck

echo "Starting EAS Android build..."
EAS_NO_VCS=1 npx eas-cli build -p android --profile "$PROFILE" "$@"

echo "Exam-browser build triggered from isolated tree."

FINAL_STATUS="$(git -C "$ROOT_DIR" status --porcelain)"
if [ "$INITIAL_STATUS" != "$FINAL_STATUS" ]; then
  echo "[WARN] Root worktree status changed during exam-browser build."
  echo "Before:"
  printf '%s\n' "$INITIAL_STATUS"
  echo "After:"
  printf '%s\n' "$FINAL_STATUS"
  exit 2
fi
