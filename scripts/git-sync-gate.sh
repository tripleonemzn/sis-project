#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FETCH_REMOTE=1
ALLOW_AHEAD=0
ALLOW_BEHIND=0
PUSH_IF_AHEAD=0

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/git-sync-gate.sh [options]

Options:
  --no-fetch         Jangan fetch upstream sebelum menghitung ahead/behind.
  --allow-ahead      Izinkan branch lokal lebih maju dari upstream.
  --allow-behind     Izinkan branch lokal tertinggal dari upstream.
  --allow-unsynced   Izinkan ahead maupun behind.
  --push-if-ahead    Push branch saat ini jika hanya ahead dan worktree clean.
  -h, --help         Tampilkan bantuan.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-fetch)
      FETCH_REMOTE=0
      ;;
    --allow-ahead)
      ALLOW_AHEAD=1
      ;;
    --allow-behind)
      ALLOW_BEHIND=1
      ;;
    --allow-unsynced)
      ALLOW_AHEAD=1
      ALLOW_BEHIND=1
      ;;
    --push-if-ahead)
      PUSH_IF_AHEAD=1
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "ERROR: opsi tidak dikenal: $1"
      print_usage
      exit 1
      ;;
  esac
  shift
done

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: $ROOT_DIR bukan git repository."
  exit 1
fi

BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" = "HEAD" ]; then
  echo "[BLOCKED] HEAD sedang detached. Gunakan branch biasa sebelum finalisasi/push."
  exit 2
fi

if ! UPSTREAM="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)"; then
  echo "[BLOCKED] Branch '$BRANCH' belum punya upstream."
  echo "Action: set upstream dulu, misalnya: git push -u origin $BRANCH"
  exit 2
fi

REMOTE_NAME="${UPSTREAM%%/*}"
echo "== Git Sync Gate =="
echo "Branch   : $BRANCH"
echo "Upstream : $UPSTREAM"

if [ "$FETCH_REMOTE" -eq 1 ]; then
  echo "Fetch    : git fetch --prune $REMOTE_NAME"
  git -C "$ROOT_DIR" fetch --prune "$REMOTE_NAME"
else
  echo "Fetch    : skipped (--no-fetch)"
fi

WORKTREE_STATUS="$(git -C "$ROOT_DIR" status --porcelain)"
if [ "$PUSH_IF_AHEAD" -eq 1 ] && [ -n "$WORKTREE_STATUS" ]; then
  echo "[BLOCKED] Tidak bisa auto-push karena worktree tidak clean."
  echo "Action: commit/stash/revert perubahan lokal dulu."
  exit 2
fi

read -r BEHIND_COUNT AHEAD_COUNT < <(git -C "$ROOT_DIR" rev-list --left-right --count '@{upstream}'...HEAD)

echo "Ahead    : $AHEAD_COUNT"
echo "Behind   : $BEHIND_COUNT"

if [ "$PUSH_IF_AHEAD" -eq 1 ] && [ "$AHEAD_COUNT" -gt 0 ] && [ "$BEHIND_COUNT" -eq 0 ]; then
  echo "Push     : git push $REMOTE_NAME $BRANCH"
  git -C "$ROOT_DIR" push "$REMOTE_NAME" "$BRANCH"
  if [ "$FETCH_REMOTE" -eq 1 ]; then
    git -C "$ROOT_DIR" fetch --prune "$REMOTE_NAME"
  fi
  read -r BEHIND_COUNT AHEAD_COUNT < <(git -C "$ROOT_DIR" rev-list --left-right --count '@{upstream}'...HEAD)
  echo "Post-push ahead  : $AHEAD_COUNT"
  echo "Post-push behind : $BEHIND_COUNT"
fi

BLOCKED=0

if [ "$AHEAD_COUNT" -gt 0 ] && [ "$ALLOW_AHEAD" -ne 1 ]; then
  echo "[BLOCKED] Branch lokal lebih maju $AHEAD_COUNT commit dari upstream."
  echo "Action: push dulu atau jalankan: bash ./scripts/git-sync-gate.sh --push-if-ahead"
  BLOCKED=1
fi

if [ "$BEHIND_COUNT" -gt 0 ] && [ "$ALLOW_BEHIND" -ne 1 ]; then
  echo "[BLOCKED] Branch lokal tertinggal $BEHIND_COUNT commit dari upstream."
  echo "Action: pull/rebase/merge dulu sebelum release atau finalisasi."
  BLOCKED=1
fi

if [ "$BLOCKED" -eq 1 ]; then
  exit 2
fi

if [ "$AHEAD_COUNT" -gt 0 ] || [ "$BEHIND_COUNT" -gt 0 ]; then
  echo "[WARN] Git sync gate dilalui dengan pengecualian."
  exit 0
fi

echo "[PASS] Branch sinkron dengan upstream."
