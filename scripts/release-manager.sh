#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/release-manager.sh <scope> <action> [options]

Scopes:
  web         Backend + Frontend
  mobile      Mobile OTA
  exambrowser Build aplikasi exam-browser terpisah
  all         Safety gate all stacks (check only)

Actions:
  check     Run safety gate only
  deploy    Deploy based on scope

Options:
  --report                 Generate scope report before action
  --allow-dirty            Bypass dirty-tree gate (darurat)
  --channel <name>         Mobile OTA channel: pilot|staging|production|pilot-live (default: pilot)
  --profile <name>         Exam-browser EAS profile (default: internal-live)
  -h, --help               Show this help

Examples:
  bash ./scripts/release-manager.sh web check --report
  bash ./scripts/release-manager.sh web deploy
  bash ./scripts/release-manager.sh web deploy --allow-dirty
  bash ./scripts/release-manager.sh mobile check
  bash ./scripts/release-manager.sh mobile deploy --channel pilot
  bash ./scripts/release-manager.sh exambrowser deploy --profile internal-live
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ "$#" -lt 2 ]; then
  print_usage
  exit 0
fi

SCOPE="$1"
ACTION="$2"
shift 2

ALLOW_DIRTY=0
WITH_REPORT=0
CHANNEL="pilot"
PROFILE="internal-live"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --allow-dirty)
      ALLOW_DIRTY=1
      ;;
    --report)
      WITH_REPORT=1
      ;;
    --channel)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --channel membutuhkan nilai."
        exit 1
      fi
      CHANNEL="$2"
      shift
      ;;
    --profile)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --profile membutuhkan nilai."
        exit 1
      fi
      PROFILE="$2"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "ERROR: Opsi tidak dikenal: $1"
      print_usage
      exit 1
      ;;
  esac
  shift
done

case "$SCOPE" in
  web|mobile|exambrowser|all)
    ;;
  *)
    echo "ERROR: scope tidak valid: $SCOPE"
    print_usage
    exit 1
    ;;
esac

case "$ACTION" in
  check|deploy)
    ;;
  *)
    echo "ERROR: action tidak valid: $ACTION"
    print_usage
    exit 1
    ;;
esac

if [ "$SCOPE" = "all" ] && [ "$ACTION" = "deploy" ]; then
  echo "ERROR: scope 'all' hanya mendukung action 'check'."
  exit 1
fi

if [ "$WITH_REPORT" -eq 1 ]; then
  echo "== Generating scope report =="
  bash "$ROOT_DIR/scripts/scope-diff-report.sh"
  echo
fi

run_gate() {
  local mode="$1"
  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    echo "⚠️  Skip safety gate ($mode) karena --allow-dirty dipakai."
  else
    bash "$ROOT_DIR/scripts/repo-safety-gate.sh" "$mode"
  fi
}

echo "== Release Manager =="
echo "Scope       : $SCOPE"
echo "Action      : $ACTION"
echo "Allow dirty : $ALLOW_DIRTY"
if [ "$SCOPE" = "mobile" ]; then
  echo "Channel     : $CHANNEL"
fi
if [ "$SCOPE" = "exambrowser" ]; then
  echo "Profile     : $PROFILE"
fi
echo

if [ "$ACTION" = "check" ]; then
  run_gate "$SCOPE"
  echo "✅ Check selesai."
  exit 0
fi

if [ "$SCOPE" = "web" ]; then
  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    ALLOW_DIRTY_DEPLOY=1 bash "$ROOT_DIR/update_all.sh"
  else
    bash "$ROOT_DIR/update_all.sh"
  fi
  echo "✅ Web deploy selesai."
  exit 0
fi

if [ "$SCOPE" = "mobile" ]; then
  case "$CHANNEL" in
    pilot|staging|production|pilot-live)
      ;;
    *)
      echo "ERROR: channel mobile tidak valid: $CHANNEL"
      echo "Gunakan: pilot | staging | production | pilot-live"
      exit 1
      ;;
  esac

  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    ALLOW_DIRTY_OTA=1 bash "$ROOT_DIR/scripts/publish-mobile-ota-isolated.sh" "$CHANNEL"
  else
    bash "$ROOT_DIR/scripts/publish-mobile-ota-isolated.sh" "$CHANNEL"
  fi
  echo "✅ Mobile OTA deploy selesai."
  exit 0
fi

if [ "$SCOPE" = "exambrowser" ]; then
  case "$PROFILE" in
    internal|internal-live)
      ;;
    *)
      echo "ERROR: profile exam-browser tidak valid: $PROFILE"
      echo "Gunakan: internal | internal-live"
      exit 1
      ;;
  esac

  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    ALLOW_DIRTY_EXAMBROWSER=1 bash "$ROOT_DIR/scripts/publish-exam-browser-build-isolated.sh" "$PROFILE"
  else
    bash "$ROOT_DIR/scripts/publish-exam-browser-build-isolated.sh" "$PROFILE"
  fi
  echo "✅ Exam-browser build selesai."
  exit 0
fi

echo "ERROR: kombinasi scope/action tidak didukung."
exit 1
