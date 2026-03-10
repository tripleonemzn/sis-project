#!/usr/bin/env bash
set -euo pipefail

# Quick bandwidth hotspot profiler from nginx access log.
# Usage:
#   bash scripts/p2-bandwidth-top.sh [TAIL_LINES] [TOP_N]
# Example:
#   bash scripts/p2-bandwidth-top.sh 20000 30

TAIL_LINES="${1:-20000}"
TOP_N="${2:-30}"
ACCESS_LOG="${ACCESS_LOG:-/var/log/nginx/access.log}"
HOST_FILTER="${HOST_FILTER:-siskgb2.id}"

if [[ ! -f "$ACCESS_LOG" ]]; then
  echo "[ERROR] access log not found: $ACCESS_LOG" >&2
  exit 1
fi

echo "[INFO] source=$ACCESS_LOG tail_lines=$TAIL_LINES top_n=$TOP_N host_filter=$HOST_FILTER"

set +o pipefail
tail -n "$TAIL_LINES" "$ACCESS_LOG" \
  | awk -v host="$HOST_FILTER" -F'"' '
      {
        # Keep only lines related to requested host in referrer, or direct asset/API requests.
        ref = $4
        req = $2
        split(req, r, " ")
        uri = r[2]
        if (uri == "") next
        if (host != "" && ref !~ host && uri !~ /^\/(api|assets|index\.html|favicon|logo|background|webmail|admin|teacher|student|tutor|parent|principal|staff|examiner)/) next

        raw = $3
        gsub(/^ /, "", raw)
        split(raw, statusBytes, " ")
        status = statusBytes[1] + 0
        bytes = statusBytes[2] + 0

        cnt[uri] += 1
        sum[uri] += bytes
        st2xx[uri] += (status >= 200 && status < 300) ? 1 : 0
        st3xx[uri] += (status >= 300 && status < 400) ? 1 : 0
        st4xx[uri] += (status >= 400 && status < 500) ? 1 : 0
        st5xx[uri] += (status >= 500) ? 1 : 0
      }
      END {
        for (u in cnt) {
          printf "%12d %8d %8d %8d %8d %8d %s\n", sum[u], cnt[u], st2xx[u], st3xx[u], st4xx[u], st5xx[u], u
        }
      }
    ' \
  | sort -nr \
  | head -n "$TOP_N" \
  | awk '
      BEGIN {
        print "BYTES_TOTAL  REQ     2xx     3xx     4xx     5xx  URI"
      }
      {
        printf "%11d %6d %7d %7d %7d %7d  %s\n", $1, $2, $3, $4, $5, $6, $7
      }
    '
set -o pipefail
