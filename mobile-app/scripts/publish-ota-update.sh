#!/usr/bin/env bash
set -euo pipefail

CHANNEL="${1:-pilot}"
PLATFORM="${OTA_PLATFORM:-android}"
MAX_ATTEMPTS="${OTA_MAX_ATTEMPTS:-3}"
RETRY_DELAY_SECONDS="${OTA_RETRY_DELAY_SECONDS:-8}"
if [ "$#" -ge 2 ]; then
  MESSAGE="${*:2}"
else
  MESSAGE="Mobile OTA update $(date '+%Y-%m-%d %H:%M:%S')"
fi

export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/.cache}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/.npm}"
export CI="${CI:-1}"
mkdir -p "${XDG_CACHE_HOME}" "${NPM_CONFIG_CACHE}"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

NOTIFY_URL="${OTA_PUSH_NOTIFY_URL:-http://127.0.0.1:3000/api/mobile-updates/broadcast}"
NOTIFY_SECRET="${OTA_PUSH_NOTIFY_SECRET:-${MOBILE_UPDATE_PUSH_SECRET:-}}"
NOTIFY_TITLE="${OTA_PUSH_NOTIFY_TITLE:-SIS KGB2 : Update Tersedia}"
NOTIFY_BODY="${OTA_PUSH_NOTIFY_BODY:-Versi terbaru SIS KGB2 tersedia. Silakan perbarui untuk menikmati fitur terbaru.}"

echo "Publishing OTA update..."
echo "Channel : ${CHANNEL}"
echo "Platform: ${PLATFORM}"
echo "Message : ${MESSAGE}"
echo "Attempts: ${MAX_ATTEMPTS}"

notify_broadcast() {
  local safe_title
  local safe_body
  local safe_channel
  local safe_platform
  local notify_platform
  local payload
  local curl_status
  local response
  local summary

  notify_platform="$(printf '%s' "${PLATFORM}" | tr '[:lower:]' '[:upper:]')"
  safe_title="$(printf '%s' "${NOTIFY_TITLE}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  safe_body="$(printf '%s' "${NOTIFY_BODY}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  safe_channel="$(printf '%s' "${CHANNEL}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  safe_platform="$(printf '%s' "${notify_platform}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  payload="{\"title\":\"${safe_title}\",\"message\":\"${safe_body}\",\"channel\":\"${safe_channel}\",\"platform\":\"${safe_platform}\"}"

  if [ -z "${NOTIFY_URL}" ]; then
    echo "Skip push notify: OTA_PUSH_NOTIFY_URL tidak dikonfigurasi."
    return 0
  fi

  echo "Trigger push notify ke ${NOTIFY_URL}..."
  if [ -n "${NOTIFY_SECRET}" ]; then
    if response="$(curl -fsS -X POST "${NOTIFY_URL}" \
      -H "Content-Type: application/json" \
      -H "x-mobile-update-secret: ${NOTIFY_SECRET}" \
      --data "${payload}")"; then
      echo "Push notify update berhasil dikirim."
      summary="$(printf '%s' "${response}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const d=j?.data||{};process.stdout.write('recipients='+String(d.recipients??0)+', sent='+String(d.sent??0)+', failed='+String(d.failed??0)+', stale='+String(d.staleTokensDisabled??0));}catch{}});" 2>/dev/null || true)"
      if [ -n "${summary}" ]; then
        echo "Push notify summary: ${summary}"
      fi
      return 0
    fi
    curl_status=$?
    echo "Peringatan: gagal kirim push notify (exit ${curl_status}). OTA tetap sukses."
    return 0
  fi

  if response="$(curl -fsS -X POST "${NOTIFY_URL}" \
    -H "Content-Type: application/json" \
    --data "${payload}")"; then
    echo "Push notify update berhasil dikirim (tanpa secret)."
    summary="$(printf '%s' "${response}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const d=j?.data||{};process.stdout.write('recipients='+String(d.recipients??0)+', sent='+String(d.sent??0)+', failed='+String(d.failed??0)+', stale='+String(d.staleTokensDisabled??0));}catch{}});" 2>/dev/null || true)"
    if [ -n "${summary}" ]; then
      echo "Push notify summary: ${summary}"
    fi
    return 0
  fi
  curl_status=$?
  echo "Peringatan: gagal kirim push notify (exit ${curl_status}). OTA tetap sukses."
  return 0
}

attempt=1
last_exit_code=1
while [ "${attempt}" -le "${MAX_ATTEMPTS}" ]; do
  echo "Attempt ${attempt}/${MAX_ATTEMPTS}..."
  if npx eas-cli update --channel "${CHANNEL}" --platform "${PLATFORM}" --message "${MESSAGE}"; then
    notify_broadcast
    exit 0
  else
    last_exit_code=$?
  fi
  if [ "${attempt}" -lt "${MAX_ATTEMPTS}" ]; then
    echo "Publish gagal (exit ${last_exit_code}), retry ${RETRY_DELAY_SECONDS}s..."
    sleep "${RETRY_DELAY_SECONDS}"
  fi
  attempt=$((attempt + 1))
done

echo "Publish OTA gagal setelah ${MAX_ATTEMPTS} percobaan."
exit "${last_exit_code}"
