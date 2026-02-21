#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="${1:-}"
MODE="${2:---dry-run}"

if [ -z "$SCOPE" ]; then
  echo "Usage: bash ./scripts/stage-scope.sh <backend|frontend|mobile|web|scripts> [--dry-run|--apply]"
  exit 1
fi

if [ "$MODE" != "--dry-run" ] && [ "$MODE" != "--apply" ]; then
  echo "Invalid mode: $MODE"
  echo "Use --dry-run (default) or --apply"
  exit 1
fi

case "$SCOPE" in
  backend)
    PATHS=("backend/")
    ;;
  frontend)
    PATHS=("frontend/")
    ;;
  mobile)
    PATHS=("mobile-app/" "scripts/repo-safety-gate.sh")
    ;;
  web)
    PATHS=("backend/" "frontend/" "scripts/" "update_all.sh" ".gitignore")
    ;;
  scripts)
    PATHS=("scripts/" "update_all.sh" ".gitignore")
    ;;
  *)
    echo "Unknown scope: $SCOPE"
    exit 1
    ;;
esac

echo "== Stage Scope =="
echo "Scope: $SCOPE"
echo "Mode : $MODE"
echo "Root : $ROOT_DIR"
echo

echo "Candidate changed files:"
git -C "$ROOT_DIR" status --short -- "${PATHS[@]}" || true
echo

if [ "$MODE" = "--apply" ]; then
  git -C "$ROOT_DIR" add -A -- "${PATHS[@]}"
  echo "Applied: staged scope paths."
  echo
  echo "Staged now:"
  git -C "$ROOT_DIR" diff --cached --name-status -- "${PATHS[@]}" || true
else
  echo "Dry run only. No staging performed."
fi
