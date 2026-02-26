#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ge 1 ]; then
  MESSAGE="${*}"
else
  TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
  GIT_REF="unknown"
  DIRTY_SUFFIX=""

  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null || true)"
    BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    if [ -n "${BRANCH_NAME}" ] && [ -n "${SHORT_SHA}" ]; then
      GIT_REF="${BRANCH_NAME}@${SHORT_SHA}"
    fi

    if ! git diff --quiet -- .; then
      DIRTY_SUFFIX="+dirty"
    fi
  fi

  MESSAGE="Live OTA ${TIMESTAMP} (${GIT_REF}${DIRTY_SUFFIX})"
fi

bash ../scripts/publish-mobile-ota-isolated.sh pilot-live "${MESSAGE}"
