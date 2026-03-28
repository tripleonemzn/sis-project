#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_YEAR_ID=""
SKIP_GATE=0
KEEP_CLONES=0
FAIL_FAST=0
KEEP_LOGS=0
LOG_DIR="$(mktemp -d /tmp/sis-academic-promotion-readiness-XXXXXX)"

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/run-academic-promotion-readiness-suite.sh [options]

Options:
  --source-year <id>   Gunakan tahun sumber tertentu. Default: tahun aktif.
  --skip-gate          Lewati repo safety gate all.
  --keep-clones        Pertahankan clone DB setiap smoke test untuk inspeksi manual.
  --fail-fast          Hentikan suite pada kegagalan pertama.
  --keep-logs          Jangan hapus log suite setelah semua langkah lulus.
  -h, --help           Tampilkan bantuan.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source-year)
      SOURCE_YEAR_ID="${2:-}"
      shift
      ;;
    --skip-gate)
      SKIP_GATE=1
      ;;
    --keep-clones)
      KEEP_CLONES=1
      ;;
    --fail-fast)
      FAIL_FAST=1
      ;;
    --keep-logs)
      KEEP_LOGS=1
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

cleanup() {
  if [ "$KEEP_LOGS" -eq 1 ]; then
    return
  fi
  if [ -d "$LOG_DIR" ]; then
    rm -rf "$LOG_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Promotion Readiness Suite =="
echo "Source year   : ${SOURCE_YEAR_ID:-auto}"
echo "Skip gate     : ${SKIP_GATE}"
echo "Keep clones   : ${KEEP_CLONES}"
echo "Fail fast     : ${FAIL_FAST}"
echo "Log dir       : ${LOG_DIR}"
echo

PASSED=0
FAILED=0
FAILURES=()

COMMON_ARGS=()
if [ -n "$SOURCE_YEAR_ID" ]; then
  COMMON_ARGS+=(--source-year-id "$SOURCE_YEAR_ID")
fi
if [ "$KEEP_CLONES" -eq 1 ]; then
  COMMON_ARGS+=(--keep-clone)
fi

run_step() {
  local label="$1"
  shift
  local slug
  slug="$(printf '%s' "$label" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')"
  local logfile="$LOG_DIR/${slug}.log"

  echo "-> ${label}"
  if "$@" >"$logfile" 2>&1; then
    PASSED=$((PASSED + 1))
    echo "   [PASS] ${label}"
    echo "   Log: ${logfile}"
    echo
    return 0
  fi

  FAILED=$((FAILED + 1))
  FAILURES+=("$label|$logfile")
  echo "   [FAIL] ${label}"
  echo "   Log: ${logfile}"
  echo "   Tail:"
  tail -n 20 "$logfile" || true
  echo

  if [ "$FAIL_FAST" -eq 1 ]; then
    return 1
  fi
  return 0
}

if [ "$SKIP_GATE" -ne 1 ]; then
  run_step "Repo Safety Gate All" bash "$ROOT_DIR/scripts/repo-safety-gate.sh" all || exit 1
else
  echo "-> Repo safety gate dilewati (--skip-gate)"
  echo
fi

run_step "Academic Year Rollover Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-year-rollover-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Promotion Commit Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-promotion-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Promotion Rollback Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-promotion-rollback-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Report History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-report-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Report Archive Access Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-report-archive-access-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Class Roster History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-class-roster-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Grade History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-grade-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Attendance History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-attendance-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Permission History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-permission-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Internship History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-internship-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic UKK History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-ukk-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Proctor History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-proctor-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Exam Sitting History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-exam-sitting-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Exam Restriction History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-exam-restriction-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Academic Finance History Smoke" bash "$ROOT_DIR/scripts/smoke-test-academic-finance-history-clone.sh" "${COMMON_ARGS[@]}" || exit 1
run_step "Finance Refund Backfill Smoke" bash "$ROOT_DIR/scripts/smoke-test-finance-refund-backfill-clone.sh" "${COMMON_ARGS[@]}" || exit 1

echo "== Readiness Summary =="
echo "Passed : ${PASSED}"
echo "Failed : ${FAILED}"

if [ "$FAILED" -gt 0 ]; then
  echo
  echo "Failed steps:"
  for entry in "${FAILURES[@]}"; do
    label="${entry%%|*}"
    logfile="${entry#*|}"
    echo "- ${label}: ${logfile}"
  done
  KEEP_LOGS=1
  exit 1
fi

echo
echo "[PASS] Academic promotion readiness suite selesai."
if [ "$KEEP_LOGS" -eq 1 ]; then
  echo "Logs dipertahankan di: ${LOG_DIR}"
else
  echo "Logs sementara akan dibersihkan otomatis."
fi
