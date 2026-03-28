#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_YEAR_ID=""
TARGET_YEAR_ID=""
WITH_SMOKE_TEST=0
SKIP_GATE=0
ALLOW_FLAG_OFF=0

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/run-academic-promotion-preflight.sh --source-year <id> --target-year <id> [options]

Options:
  --source-year <id>   Tahun ajaran sumber yang akan dipromosikan.
  --target-year <id>   Tahun ajaran target tujuan kenaikan kelas.
  --with-smoke-test    Jalankan smoke test clone DB promotion + histori report + histori absensi + histori izin/BP-BK/TU + histori PKL + histori UKK + histori proctor + histori finance + refund backfill setelah audit utama.
  --skip-gate          Lewati repo safety gate web.
  --allow-flag-off     Jangan block jika ACADEMIC_PROMOTION_V2_ENABLED masih OFF.
  -h, --help           Tampilkan bantuan.
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
    --with-smoke-test)
      WITH_SMOKE_TEST=1
      ;;
    --skip-gate)
      SKIP_GATE=1
      ;;
    --allow-flag-off)
      ALLOW_FLAG_OFF=1
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

if ! [[ "$SOURCE_YEAR_ID" =~ ^[0-9]+$ ]] || ! [[ "$TARGET_YEAR_ID" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --source-year dan --target-year wajib berupa integer positif."
  print_usage
  exit 1
fi

echo "== Academic Promotion Preflight =="
echo "Source year     : $SOURCE_YEAR_ID"
echo "Target year     : $TARGET_YEAR_ID"
echo "Smoke test      : $WITH_SMOKE_TEST"
echo "Skip gate       : $SKIP_GATE"
echo "Allow flag off  : $ALLOW_FLAG_OFF"
echo

if [ "$SKIP_GATE" -ne 1 ]; then
  echo "-> Menjalankan safety gate web"
  bash "$ROOT_DIR/scripts/repo-safety-gate.sh" web
  echo
else
  echo "-> Skip safety gate web"
  echo
fi

echo "-> Mengecek feature flag promotion"
FLAG_OUTPUT="$(bash "$ROOT_DIR/scripts/set-academic-promotion-flag.sh" --check)"
printf '%s\n' "$FLAG_OUTPUT"
FLAG_STATUS="$(printf '%s\n' "$FLAG_OUTPUT" | awk -F': ' '/Academic promotion v2 flag:/ {print $2}' | tail -n1)"
if [ "$FLAG_STATUS" != "true" ] && [ "$ALLOW_FLAG_OFF" -ne 1 ]; then
  echo
  echo "ERROR: feature flag masih OFF. Aktifkan dulu dengan:"
  echo "  bash ./scripts/set-academic-promotion-flag.sh on --reload"
  exit 2
fi
echo

echo "-> Menjalankan audit pasangan tahun"
(cd "$ROOT_DIR/backend" && npm run promotion:audit -- --source-year "$SOURCE_YEAR_ID" --target-year "$TARGET_YEAR_ID")
echo

if [ "$WITH_SMOKE_TEST" -eq 1 ]; then
  echo "-> Menjalankan smoke test clone DB promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-promotion-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test histori report pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-report-history-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test histori absensi pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-attendance-history-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test histori izin/BP-BK/TU pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-permission-history-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test histori PKL pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-internship-history-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test histori UKK pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-ukk-history-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test histori proctor pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-proctor-history-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test histori finance pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-academic-finance-history-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo

  echo "-> Menjalankan smoke test refund backfill finance pasca-promotion"
  bash "$ROOT_DIR/scripts/smoke-test-finance-refund-backfill-clone.sh" --source-year-id "$SOURCE_YEAR_ID"
  echo
fi

cat <<EOF
[PASS] Preflight selesai.

Langkah berikutnya:
1. Deploy web stack:
   bash ./scripts/release-manager.sh web deploy
2. Uji Promotion Center di web dan mobile untuk source=$SOURCE_YEAR_ID target=$TARGET_YEAR_ID
3. Jalankan commit promotion hanya dari satu kanal admin
4. Audit pasca commit:
   cd backend && npm run promotion:audit -- --source-year $SOURCE_YEAR_ID --target-year $TARGET_YEAR_ID --run-id <RUN_ID>
EOF
