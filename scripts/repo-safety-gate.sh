#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

case "$MODE" in
  all|mobile|web|exambrowser)
    ;;
  *)
    echo "Usage: bash ./scripts/repo-safety-gate.sh [all|mobile|web|exambrowser]"
    exit 1
    ;;
esac

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: $ROOT_DIR is not a git repository."
  exit 1
fi

echo "== Repo Safety Gate =="
echo "Time : $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "Mode : $MODE"
echo "Branch: $(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
echo

read_dirty_files() {
  git -C "$ROOT_DIR" status --porcelain -z \
    | while IFS= read -r -d '' entry; do
        path="${entry:3}"
        # Handle rename entries: "old -> new"
        if [[ "$path" == *" -> "* ]]; then
          path="${path##* -> }"
        fi
        printf '%s\n' "$path"
      done
}

mapfile -t DIRTY_FILES < <(read_dirty_files)

if [ "${#DIRTY_FILES[@]}" -eq 0 ]; then
  echo "[OK] Working tree clean."
else
  echo "[WARN] Working tree dirty: ${#DIRTY_FILES[@]} path(s)."
  echo
  echo "Top-level change summary:"
  printf '%s\n' "${DIRTY_FILES[@]}" \
    | cut -d/ -f1 \
    | sort \
    | uniq -c \
    | sort -nr
  echo
fi

is_allowed_path() {
  local mode="$1"
  local path="$2"

  case "$mode" in
    mobile)
      [[ "$path" == mobile-app/* || "$path" == scripts/* || "$path" == .gitignore || "$path" == *.md || "$path" == ops/* ]]
      ;;
    exambrowser)
      [[ "$path" == exam-browser-app/* || "$path" == scripts/* || "$path" == .gitignore || "$path" == *.md || "$path" == ops/* ]]
      ;;
    web)
      [[ "$path" == backend/* || "$path" == frontend/* || "$path" == scripts/* || "$path" == mobile-app/* || "$path" == ops/* || "$path" == *.md || "$path" == update_all.sh || "$path" == demo_sis.html || "$path" == .gitignore ]]
      ;;
    all)
      return 0
      ;;
  esac
}

if [ "${#DIRTY_FILES[@]}" -gt 0 ] && [ "$MODE" != "all" ]; then
  OUT_OF_SCOPE=()
  for path in "${DIRTY_FILES[@]}"; do
    if ! is_allowed_path "$MODE" "$path"; then
      OUT_OF_SCOPE+=("$path")
    fi
  done

  if [ "${#OUT_OF_SCOPE[@]}" -gt 0 ]; then
    echo "[BLOCKED] Found out-of-scope changes for mode '$MODE':"
    MAX_PRINT=30
    for path in "${OUT_OF_SCOPE[@]:0:$MAX_PRINT}"; do
      echo " - $path"
    done
    if [ "${#OUT_OF_SCOPE[@]}" -gt "$MAX_PRINT" ]; then
      echo " ... and $((${#OUT_OF_SCOPE[@]} - MAX_PRINT)) more path(s)"
    fi
    echo
    echo "Action: isolate changes first before release/deploy."
    exit 2
  fi
fi

run_check() {
  local dir="$1"
  local cmd="$2"
  echo "-> [$dir] $cmd"
  (cd "$ROOT_DIR/$dir" && eval "$cmd")
  echo
}

if [ "$MODE" = "mobile" ] || [ "$MODE" = "all" ]; then
  run_check "mobile-app" "npm run typecheck"
  run_check "mobile-app" "npm run audit:parity"
fi

if [ "$MODE" = "exambrowser" ] || [ "$MODE" = "all" ]; then
  run_check "exam-browser-app" "npm run typecheck"
fi

if [ "$MODE" = "web" ] || [ "$MODE" = "all" ]; then
  run_check "backend" "npm run build"
  run_check "frontend" "npm run build"
fi

echo "[PASS] Repo safety gate completed."
