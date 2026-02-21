#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_DIR="${1:-$ROOT_DIR/ops/scope-reports/$STAMP}"

mkdir -p "$OUT_DIR"

if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: $ROOT_DIR is not a git repository."
  exit 1
fi

STATUS_FILE="$OUT_DIR/status_porcelain.txt"
git -C "$ROOT_DIR" status --porcelain > "$STATUS_FILE"

BACKEND_FILE="$OUT_DIR/backend_paths.txt"
FRONTEND_FILE="$OUT_DIR/frontend_paths.txt"
MOBILE_FILE="$OUT_DIR/mobile_paths.txt"
SCRIPTS_FILE="$OUT_DIR/scripts_paths.txt"
OTHER_FILE="$OUT_DIR/other_paths.txt"

>"$BACKEND_FILE"
>"$FRONTEND_FILE"
>"$MOBILE_FILE"
>"$SCRIPTS_FILE"
>"$OTHER_FILE"

while IFS= read -r line; do
  [ -z "$line" ] && continue
  raw_path="${line:3}"
  path="${raw_path##* -> }"

  case "$path" in
    backend/*) echo "$path" >>"$BACKEND_FILE" ;;
    frontend/*) echo "$path" >>"$FRONTEND_FILE" ;;
    mobile-app/*) echo "$path" >>"$MOBILE_FILE" ;;
    scripts/*|update_all.sh|.gitignore) echo "$path" >>"$SCRIPTS_FILE" ;;
    *) echo "$path" >>"$OTHER_FILE" ;;
  esac
done <"$STATUS_FILE"

for file in "$BACKEND_FILE" "$FRONTEND_FILE" "$MOBILE_FILE" "$SCRIPTS_FILE" "$OTHER_FILE"; do
  sort -u "$file" -o "$file"
done

export_patch() {
  local label="$1"
  local path_file="$2"
  local patch_file="$OUT_DIR/${label}.patch"

  if [ ! -s "$path_file" ]; then
    return 0
  fi

  mapfile -t paths <"$path_file"
  git -C "$ROOT_DIR" diff -- "${paths[@]}" >"$patch_file" || true
}

export_patch "backend" "$BACKEND_FILE"
export_patch "frontend" "$FRONTEND_FILE"
export_patch "mobile" "$MOBILE_FILE"
export_patch "scripts" "$SCRIPTS_FILE"
export_patch "other" "$OTHER_FILE"

SUMMARY_FILE="$OUT_DIR/summary.txt"
{
  echo "Scope Diff Report"
  echo "Generated : $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
  echo "Branch    : $(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
  echo
  echo "Counts"
  echo "- backend : $(wc -l <"$BACKEND_FILE")"
  echo "- frontend: $(wc -l <"$FRONTEND_FILE")"
  echo "- mobile  : $(wc -l <"$MOBILE_FILE")"
  echo "- scripts : $(wc -l <"$SCRIPTS_FILE")"
  echo "- other   : $(wc -l <"$OTHER_FILE")"
} >"$SUMMARY_FILE"

echo "Scope report generated:"
echo "- $SUMMARY_FILE"
echo "- $STATUS_FILE"
echo "- $BACKEND_FILE"
echo "- $FRONTEND_FILE"
echo "- $MOBILE_FILE"
echo "- $SCRIPTS_FILE"
echo "- $OTHER_FILE"
