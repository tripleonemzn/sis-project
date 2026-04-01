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

resolve_runtime_version() {
  node -e "const app=require(process.argv[1]); const runtime=app?.expo?.runtimeVersion; if (typeof runtime === 'string') { process.stdout.write(runtime); process.exit(0); } if (runtime && runtime.policy === 'appVersion') { process.stdout.write(String(app?.expo?.version || '')); process.exit(0); } if (runtime && typeof runtime.version === 'string') { process.stdout.write(runtime.version); process.exit(0); } process.exit(1);" ./app.json
}

RUNTIME_VERSION="${OTA_RUNTIME_VERSION:-$(resolve_runtime_version)}"

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
OTA_REQUIRE_NOTIFY_SUCCESS="${OTA_REQUIRE_NOTIFY_SUCCESS:-0}"
OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN="${OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN:-0}"
OTA_REQUIRE_NOTIFY_SENT_MIN="${OTA_REQUIRE_NOTIFY_SENT_MIN:-0}"

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
  local safe_runtime_version
  local notify_platform
  local payload
  local curl_status
  local response
  local metrics
  local recipients
  local sent
  local failed
  local stale

  notify_platform="$(printf '%s' "${PLATFORM}" | tr '[:lower:]' '[:upper:]')"
  safe_title="$(printf '%s' "${NOTIFY_TITLE}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  safe_body="$(printf '%s' "${NOTIFY_BODY}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  safe_channel="$(printf '%s' "${CHANNEL}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  safe_platform="$(printf '%s' "${notify_platform}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  safe_runtime_version="$(printf '%s' "${RUNTIME_VERSION}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  payload="{\"title\":\"${safe_title}\",\"message\":\"${safe_body}\",\"channel\":\"${safe_channel}\",\"runtimeVersion\":\"${safe_runtime_version}\",\"platform\":\"${safe_platform}\"}"

  if [ -z "${NOTIFY_URL}" ]; then
    echo "Skip push notify: OTA_PUSH_NOTIFY_URL tidak dikonfigurasi."
    return 0
  fi

  parse_metrics() {
    printf '%s' "${1:-}" | node -e "let raw='';process.stdin.on('data',d=>raw+=d).on('end',()=>{try{const json=JSON.parse(raw);const data=json?.data||{};process.stdout.write([String(data.recipients??0),String(data.sent??0),String(data.failed??0),String(data.staleTokensDisabled??0)].join('|'));}catch{process.exit(2);}});" 2>/dev/null
  }

  validate_metrics() {
    metrics="$(parse_metrics "${1:-}")" || return 30
    IFS='|' read -r recipients sent failed stale <<< "${metrics}"
    echo "Push notify summary: recipients=${recipients}, sent=${sent}, failed=${failed}, stale=${stale}"

    if [ "${OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN}" -gt 0 ] && [ "${recipients}" -lt "${OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN}" ]; then
      echo "Peringatan: recipients push ${recipients} di bawah minimum ${OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN}."
      return 31
    fi

    if [ "${OTA_REQUIRE_NOTIFY_SENT_MIN}" -gt 0 ] && [ "${sent}" -lt "${OTA_REQUIRE_NOTIFY_SENT_MIN}" ]; then
      echo "Peringatan: push sent ${sent} di bawah minimum ${OTA_REQUIRE_NOTIFY_SENT_MIN}."
      return 32
    fi

    return 0
  }

  echo "Trigger push notify ke ${NOTIFY_URL}..."
  if [ -n "${NOTIFY_SECRET}" ]; then
    if response="$(curl -fsS -X POST "${NOTIFY_URL}" \
      -H "Content-Type: application/json" \
      -H "x-mobile-update-secret: ${NOTIFY_SECRET}" \
      --data "${payload}")"; then
      echo "Push notify update berhasil dikirim."
      if ! validate_metrics "${response}"; then
        if [ "${OTA_REQUIRE_NOTIFY_SUCCESS}" = "1" ] || [ "${OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN}" -gt 0 ] || [ "${OTA_REQUIRE_NOTIFY_SENT_MIN}" -gt 0 ]; then
          return 1
        fi
      fi
      return 0
    fi
    curl_status=$?
    echo "Peringatan: gagal kirim push notify (exit ${curl_status}). OTA tetap sukses."
    if [ "${OTA_REQUIRE_NOTIFY_SUCCESS}" = "1" ]; then
      return "${curl_status}"
    fi
    return 0
  fi

  if response="$(curl -fsS -X POST "${NOTIFY_URL}" \
    -H "Content-Type: application/json" \
    --data "${payload}")"; then
    echo "Push notify update berhasil dikirim (tanpa secret)."
    if ! validate_metrics "${response}"; then
      if [ "${OTA_REQUIRE_NOTIFY_SUCCESS}" = "1" ] || [ "${OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN}" -gt 0 ] || [ "${OTA_REQUIRE_NOTIFY_SENT_MIN}" -gt 0 ]; then
        return 1
      fi
    fi
    return 0
  fi
  curl_status=$?
  echo "Peringatan: gagal kirim push notify (exit ${curl_status}). OTA tetap sukses."
  if [ "${OTA_REQUIRE_NOTIFY_SUCCESS}" = "1" ]; then
    return "${curl_status}"
  fi
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
