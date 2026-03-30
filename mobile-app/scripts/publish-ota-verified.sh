#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export OTA_REQUIRE_NOTIFY_SUCCESS="${OTA_REQUIRE_NOTIFY_SUCCESS:-1}"
export OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN="${OTA_REQUIRE_NOTIFY_RECIPIENTS_MIN:-1}"
export OTA_REQUIRE_NOTIFY_SENT_MIN="${OTA_REQUIRE_NOTIFY_SENT_MIN:-1}"

bash "${SCRIPT_DIR}/publish-ota-update.sh" "$@"
