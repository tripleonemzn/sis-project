#!/usr/bin/env bash
set -euo pipefail

# P1 benchmark helper (read-only endpoints).
# Usage:
#   STUDENT_ID=956 TEACHER_ID=915 bash scripts/p1-load-benchmark.sh
#
# Output:
#   /tmp/p1-load/<timestamp>/*.json
#   /tmp/p1-load/<timestamp>/summary.json

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
OUT_BASE="/tmp/p1-load"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$OUT_BASE/$TS"
mkdir -p "$OUT_DIR"

TEACHER_ID="${TEACHER_ID:-915}"
STUDENT_ID="${STUDENT_ID:-956}"
CONNECTIONS="${CONNECTIONS:-800}"
DURATION_SEC="${DURATION_SEC:-15}"

cd "$BACKEND_DIR"
set -a
source .env
set +a

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "[ERROR] JWT_SECRET tidak ditemukan di backend/.env" >&2
  exit 1
fi

TEACHER_TOKEN="$(TEACHER_ID="$TEACHER_ID" node -e 'const jwt=require("jsonwebtoken"); console.log(jwt.sign({id:Number(process.env.TEACHER_ID),role:"TEACHER"}, process.env.JWT_SECRET, {expiresIn:"1h"}));')"
STUDENT_TOKEN="$(STUDENT_ID="$STUDENT_ID" node -e 'const jwt=require("jsonwebtoken"); console.log(jwt.sign({id:Number(process.env.STUDENT_ID),role:"STUDENT"}, process.env.JWT_SECRET, {expiresIn:"1h"}));')"

run_case() {
  local name="$1"
  local rate="$2"
  local url="$3"
  local token="$4"
  echo "[RUN] $name c=$CONNECTIONS d=${DURATION_SEC}s R=$rate"
  npx --yes autocannon \
    -c "$CONNECTIONS" \
    -d "$DURATION_SEC" \
    -R "$rate" \
    --renderStatusCodes \
    --json \
    -H "Authorization=Bearer $token" \
    "$url" > "$OUT_DIR/$name.json"
}

run_case "auth_me" 1200 "https://siskgb2.id/api/auth/me" "$TEACHER_TOKEN"
run_case "active_year" 1200 "https://siskgb2.id/api/academic-years/active" "$TEACHER_TOKEN"
run_case "exam_programs" 900 "https://siskgb2.id/api/exams/programs?roleContext=teacher" "$TEACHER_TOKEN"
run_case "exams_available" 900 "https://siskgb2.id/api/exams/available" "$STUDENT_TOKEN"

node - "$OUT_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const outDir = process.argv[2];
const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.json')).sort();
const summary = files.map((file) => {
  const data = JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8'));
  return {
    case: file.replace('.json', ''),
    requestsPerSecAvg: data.requests?.mean ?? null,
    latencyP90Ms: data.latency?.p90 ?? null,
    latencyP99Ms: data.latency?.p99 ?? null,
    errors: data.errors ?? null,
    timeouts: data.timeouts ?? null,
    non2xx: data.non2xx ?? null,
    throughputMbpsAvg: Number((((data.throughput?.mean || 0) * 8) / (1024 * 1024)).toFixed(2)),
    statusCodes: data.statusCodeStats || {},
  };
});
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
NODE

echo "[DONE] output: $OUT_DIR"
