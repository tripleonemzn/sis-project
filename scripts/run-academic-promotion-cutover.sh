#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_YEAR_ID=""
TARGET_YEAR_ID=""
ACTOR_ID=""
ACTIVATE_TARGET=0
CONFIRM=0
SKIP_GATE=0
ARTIFACT_ROOT="$ROOT_DIR/ops/snapshots/academic-promotion"

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/run-academic-promotion-cutover.sh --source-year <id> --target-year <id> --actor-id <id> [options]

Options:
  --activate-target     Aktifkan tahun target setelah commit.
  --artifact-root <dir> Folder root untuk snapshot artifact. Default: ops/snapshots/academic-promotion
  --skip-gate           Lewati repo safety gate web.
  --yes                 Jalankan commit sungguhan.
  -h, --help            Tampilkan bantuan.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source-year)
      SOURCE_YEAR_ID="${2:-}"
      shift
      ;;
    --target-year)
      TARGET_YEAR_ID="${2:-}"
      shift
      ;;
    --actor-id)
      ACTOR_ID="${2:-}"
      shift
      ;;
    --activate-target)
      ACTIVATE_TARGET=1
      ;;
    --artifact-root)
      ARTIFACT_ROOT="$(realpath -m "${2:-}")"
      shift
      ;;
    --skip-gate)
      SKIP_GATE=1
      ;;
    --yes)
      CONFIRM=1
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

if ! [[ "$SOURCE_YEAR_ID" =~ ^[0-9]+$ ]] || ! [[ "$TARGET_YEAR_ID" =~ ^[0-9]+$ ]] || ! [[ "$ACTOR_ID" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --source-year, --target-year, dan --actor-id wajib berupa integer positif."
  print_usage
  exit 1
fi

if [ "$CONFIRM" -ne 1 ]; then
  echo "Cutover diblokir. Jalankan ulang dengan --yes setelah semua pihak siap."
  echo "Contoh:"
  echo "  bash ./scripts/run-academic-promotion-cutover.sh --source-year $SOURCE_YEAR_ID --target-year $TARGET_YEAR_ID --actor-id $ACTOR_ID --yes"
  exit 2
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ARTIFACT_DIR="$ARTIFACT_ROOT/source-${SOURCE_YEAR_ID}_target-${TARGET_YEAR_ID}_${TIMESTAMP}"
mkdir -p "$ARTIFACT_DIR"

echo "== Academic Promotion Cutover =="
echo "Source year   : $SOURCE_YEAR_ID"
echo "Target year   : $TARGET_YEAR_ID"
echo "Actor ID      : $ACTOR_ID"
echo "Activate year : $ACTIVATE_TARGET"
echo "Artifacts     : $ARTIFACT_DIR"
echo

if [ "$SKIP_GATE" -ne 1 ]; then
  echo "-> Menjalankan safety gate web"
  bash "$ROOT_DIR/scripts/repo-safety-gate.sh" web
  echo
else
  echo "-> Skip safety gate web"
  echo
fi

echo "-> Mengecek feature flag"
FLAG_OUTPUT="$(bash "$ROOT_DIR/scripts/set-academic-promotion-flag.sh" --check)"
printf '%s\n' "$FLAG_OUTPUT"
FLAG_STATUS="$(printf '%s\n' "$FLAG_OUTPUT" | awk -F': ' '/Academic promotion v2 flag:/ {print $2}' | tail -n1)"
if [ "$FLAG_STATUS" != "true" ]; then
  echo
  echo "ERROR: feature flag masih OFF. Aktifkan dulu dengan:"
  echo "  bash ./scripts/set-academic-promotion-flag.sh on --reload"
  exit 2
fi
echo

echo "-> Audit pre-commit"
(cd "$ROOT_DIR/backend" && npm run promotion:audit -- --source-year "$SOURCE_YEAR_ID" --target-year "$TARGET_YEAR_ID")
echo

echo "-> Export snapshot pre-commit"
(cd "$ROOT_DIR/backend" && npm run promotion:export-snapshot -- --source-year "$SOURCE_YEAR_ID" --target-year "$TARGET_YEAR_ID" --output "$ARTIFACT_DIR/pre-commit-snapshot.json")
echo

echo "-> Commit promotion"
COMMIT_ARGS=(--source-year "$SOURCE_YEAR_ID" --target-year "$TARGET_YEAR_ID" --actor-id "$ACTOR_ID" --output "$ARTIFACT_DIR/commit-result.json" --yes)
if [ "$ACTIVATE_TARGET" -eq 1 ]; then
  COMMIT_ARGS+=(--activate-target)
fi
(cd "$ROOT_DIR/backend" && npm run promotion:commit -- "${COMMIT_ARGS[@]}")
echo

RUN_ID="$(
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(data.result.run.id));" \
    "$ARTIFACT_DIR/commit-result.json"
)"

echo "-> Audit post-commit"
(cd "$ROOT_DIR/backend" && npm run promotion:audit -- --source-year "$SOURCE_YEAR_ID" --target-year "$TARGET_YEAR_ID" --run-id "$RUN_ID")
echo

echo "-> Export snapshot post-commit"
(cd "$ROOT_DIR/backend" && npm run promotion:export-snapshot -- --source-year "$SOURCE_YEAR_ID" --target-year "$TARGET_YEAR_ID" --run-id "$RUN_ID" --output "$ARTIFACT_DIR/post-commit-snapshot.json")
echo

cat <<EOF
[PASS] Cutover selesai.
Run ID       : $RUN_ID
Artifact dir : $ARTIFACT_DIR

File penting:
- $ARTIFACT_DIR/pre-commit-snapshot.json
- $ARTIFACT_DIR/commit-result.json
- $ARTIFACT_DIR/post-commit-snapshot.json
EOF
