#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="all"
PUSH=0
WITH_REPORT=0
NO_FETCH=0

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/finalize-dev-batch.sh [scope] [options]

Scopes:
  all         Semua stack
  web         Backend + frontend
  mobile      Mobile app
  exambrowser Exam browser app

Options:
  --push       Push branch saat ini jika hanya ahead dan semua check lulus.
  --report     Generate scope report sebelum verifikasi.
  --no-fetch   Jangan fetch upstream saat cek sync git.
  -h, --help   Tampilkan bantuan.

Examples:
  bash ./scripts/finalize-dev-batch.sh web
  bash ./scripts/finalize-dev-batch.sh mobile --push
  bash ./scripts/finalize-dev-batch.sh all --push --report
EOF
}

if [ "$#" -gt 0 ]; then
  case "$1" in
    all|web|mobile|exambrowser)
      SCOPE="$1"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
  esac
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --push)
      PUSH=1
      ;;
    --report)
      WITH_REPORT=1
      ;;
    --no-fetch)
      NO_FETCH=1
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

echo "== Finalize Dev Batch =="
echo "Scope : $SCOPE"
echo "Push  : $PUSH"
echo

if [ "$WITH_REPORT" -eq 1 ]; then
  bash "$ROOT_DIR/scripts/scope-diff-report.sh"
  echo
fi

# Hindari cek sync dua kali. Finalizer menjalankan sync gate secara eksplisit di bawah.
ALLOW_GIT_UNSYNC=1 bash "$ROOT_DIR/scripts/repo-safety-gate.sh" "$SCOPE"

SYNC_ARGS=()
if [ "$NO_FETCH" -eq 1 ]; then
  SYNC_ARGS+=(--no-fetch)
fi
if [ "$PUSH" -eq 1 ]; then
  SYNC_ARGS+=(--push-if-ahead)
fi

bash "$ROOT_DIR/scripts/git-sync-gate.sh" "${SYNC_ARGS[@]}"

echo "[PASS] Batch finalisasi bersih dan sinkron."
