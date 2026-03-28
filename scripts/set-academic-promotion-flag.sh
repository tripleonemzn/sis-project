#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env"
ACTION=""
RELOAD_PM2=0

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/set-academic-promotion-flag.sh --check
  bash ./scripts/set-academic-promotion-flag.sh on [--reload]
  bash ./scripts/set-academic-promotion-flag.sh off [--reload]

Options:
  --check      Hanya tampilkan status flag saat ini.
  --reload     Reload PM2 backend setelah file .env diubah.
  -h, --help   Tampilkan bantuan.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    on|off)
      if [ -n "$ACTION" ]; then
        echo "ERROR: aksi sudah ditentukan: $ACTION"
        exit 1
      fi
      ACTION="$1"
      ;;
    --check)
      if [ -n "$ACTION" ]; then
        echo "ERROR: tidak bisa menggabungkan --check dengan aksi '$ACTION'."
        exit 1
      fi
      ACTION="check"
      ;;
    --reload)
      RELOAD_PM2=1
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

if [ -z "$ACTION" ]; then
  print_usage
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: file env tidak ditemukan: $ENV_FILE"
  exit 1
fi

read_flag_value() {
  local env_file="$1"
  local value
  value="$(grep -E '^ACADEMIC_PROMOTION_V2_ENABLED=' "$env_file" | tail -n1 | cut -d'=' -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1|true|yes|on) echo "true" ;;
    0|false|no|off) echo "false" ;;
    *) echo "unset" ;;
  esac
}

CURRENT_VALUE="$(read_flag_value "$ENV_FILE")"

if [ "$ACTION" = "check" ]; then
  echo "Academic promotion v2 flag: $CURRENT_VALUE"
  echo "Env file: $ENV_FILE"
  exit 0
fi

NEXT_VALUE="false"
if [ "$ACTION" = "on" ]; then
  NEXT_VALUE="true"
fi

if [ "$CURRENT_VALUE" = "$NEXT_VALUE" ]; then
  echo "Academic promotion v2 flag sudah $NEXT_VALUE."
else
  BACKUP_FILE="${ENV_FILE}.promotion-flag.$(date +%Y%m%d_%H%M%S).bak"
  cp "$ENV_FILE" "$BACKUP_FILE"
  echo "Backup env dibuat: $BACKUP_FILE"

  TMP_FILE="$(mktemp)"
  trap 'rm -f "$TMP_FILE"' EXIT

  if grep -qE '^ACADEMIC_PROMOTION_V2_ENABLED=' "$ENV_FILE"; then
    sed 's/^ACADEMIC_PROMOTION_V2_ENABLED=.*/ACADEMIC_PROMOTION_V2_ENABLED='"$NEXT_VALUE"'/' "$ENV_FILE" >"$TMP_FILE"
  else
    cat "$ENV_FILE" >"$TMP_FILE"
    printf '\nACADEMIC_PROMOTION_V2_ENABLED=%s\n' "$NEXT_VALUE" >>"$TMP_FILE"
  fi

  mv "$TMP_FILE" "$ENV_FILE"
  trap - EXIT
  echo "Academic promotion v2 flag diubah: $CURRENT_VALUE -> $NEXT_VALUE"
fi

if [ "$RELOAD_PM2" -eq 1 ]; then
  echo "Reloading PM2 backend..."
  pm2 startOrReload "$ROOT_DIR/backend/ecosystem.config.cjs" --only sis-backend --update-env
  pm2 save >/dev/null 2>&1 || true
  echo "PM2 backend reload selesai."
else
  echo "PM2 belum direload. Jalankan ulang dengan --reload jika ingin env baru langsung aktif."
fi
