#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP_CLONE=0
SOURCE_YEAR_ID=""
TARGET_NAME=""
ACTIVATE_TARGET_YEAR=1
CLONE_DB=""
RUN_ID=""

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/smoke-test-academic-promotion-clone.sh [options]

Options:
  --source-year-id <id>     Gunakan tahun sumber tertentu. Default: tahun aktif.
  --target-name <name>      Nama tahun target smoke test. Default otomatis.
  --no-activate-target      Commit tanpa mengaktifkan tahun target.
  --keep-clone              Jangan hapus clone DB setelah selesai.
  -h, --help                Tampilkan bantuan.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source-year-id)
      SOURCE_YEAR_ID="${2:-}"
      shift
      ;;
    --target-name)
      TARGET_NAME="${2:-}"
      shift
      ;;
    --no-activate-target)
      ACTIVATE_TARGET_YEAR=0
      ;;
    --keep-clone)
      KEEP_CLONE=1
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

eval "$(set -a; source "$ROOT_DIR/backend/.env" >/dev/null 2>&1; node <<'NODE'
const raw = process.env.DATABASE_URL;
const u = new URL(raw);
console.log('export BASE_DATABASE_URL=' + JSON.stringify(u.toString()));
console.log('export PGHOST=' + JSON.stringify(u.hostname));
console.log('export PGPORT=' + JSON.stringify(u.port || '5432'));
console.log('export PGDATABASE=' + JSON.stringify(u.pathname.replace(/^\//, '')));
console.log('export PGUSER=' + JSON.stringify(decodeURIComponent(u.username || '')));
console.log('export PGPASSWORD=' + JSON.stringify(decodeURIComponent(u.password || '')));
NODE
)"

CLONE_DB="${PGDATABASE}_promotion_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-promotion-smoke-XXXXXX)"
SETUP_JSON="$TMP_DIR/setup.json"
PRE_SAMPLES_JSON="$TMP_DIR/pre-samples.json"
COMMIT_JSON="$TMP_DIR/commit.json"
POST_SAMPLES_JSON="$TMP_DIR/post-samples.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Promotion Smoke Test =="
echo "Source DB    : ${PGDATABASE}"
echo "Clone DB     : ${CLONE_DB}"
echo "Keep clone   : ${KEEP_CLONE}"
echo

dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
createdb "$CLONE_DB"
pg_dump --no-owner --no-privileges --dbname="$PGDATABASE" | psql -v ON_ERROR_STOP=1 --dbname="$CLONE_DB" >"$RESTORE_LOG"

CLONE_DATABASE_URL="$(
  BASE_DATABASE_URL="$BASE_DATABASE_URL" CLONE_DB="$CLONE_DB" node <<'NODE'
const u = new URL(process.env.BASE_DATABASE_URL);
u.pathname = `/${process.env.CLONE_DB}`;
process.stdout.write(u.toString());
NODE
)"

echo "Clone created and restored."
echo

cd "$ROOT_DIR/backend"
DATABASE_URL="$CLONE_DATABASE_URL" npx prisma db push --skip-generate >/dev/null

DATABASE_URL="$CLONE_DATABASE_URL" \
SOURCE_YEAR_ID="$SOURCE_YEAR_ID" \
TARGET_NAME="$TARGET_NAME" \
node -r ts-node/register <<'NODE' >"$SETUP_JSON"
const prisma = require('./src/utils/prisma').default;

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Promotion ${new Date().toISOString().slice(0, 10)}`;
  }
  const start = Number(match[1]) + 1;
  const end = Number(match[2]) + 1;
  return `${start}/${end} QA Promotion`;
}

(async () => {
  const requestedSourceYearId = Number(process.env.SOURCE_YEAR_ID || '');
  const sourceYear = Number.isFinite(requestedSourceYearId) && requestedSourceYearId > 0
    ? await prisma.academicYear.findUnique({
        where: { id: requestedSourceYearId },
        include: { classes: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
      })
    : await prisma.academicYear.findFirst({
        where: { isActive: true },
        include: { classes: { orderBy: [{ level: 'asc' }, { name: 'asc' }] } },
      });

  if (!sourceYear) throw new Error('Tahun sumber tidak ditemukan.');

  const requestedTargetName = String(process.env.TARGET_NAME || '').trim();
  const targetYearName = requestedTargetName || deriveTargetName(sourceYear.name);

  let targetYear = await prisma.academicYear.findFirst({ where: { name: targetYearName } });
  if (!targetYear) {
    targetYear = await prisma.academicYear.create({
      data: {
        name: targetYearName,
        semester1Start: new Date('2026-07-13T00:00:00.000Z'),
        semester1End: new Date('2026-12-18T00:00:00.000Z'),
        semester2Start: new Date('2027-01-11T00:00:00.000Z'),
        semester2End: new Date('2027-06-18T00:00:00.000Z'),
        isActive: false,
      },
    });
  }

  const existingTargetNames = new Set(
    (
      await prisma.class.findMany({
        where: { academicYearId: targetYear.id },
        select: { name: true },
      })
    ).map((item) => item.name),
  );

  const candidateClasses = sourceYear.classes
    .filter((item) => item.level === 'X' || item.level === 'XI')
    .map((item) => ({
      name: item.level === 'X' ? item.name.replace(/^X\s+/, 'XI ') : item.name.replace(/^XI\s+/, 'XII '),
      level: item.level === 'X' ? 'XI' : 'XII',
      majorId: item.majorId,
    }))
    .filter((item) => !existingTargetNames.has(item.name));

  if (candidateClasses.length > 0) {
    await prisma.class.createMany({
      data: candidateClasses.map((item) => ({
        name: item.name,
        level: item.level,
        majorId: item.majorId,
        academicYearId: targetYear.id,
        teacherId: null,
      })),
    });
  }

  console.log(JSON.stringify({
    sourceYearId: sourceYear.id,
    sourceYearName: sourceYear.name,
    targetYearId: targetYear.id,
    targetYearName: targetYear.name,
    createdTargetClasses: candidateClasses.length,
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
NODE

SOURCE_YEAR_ID_FINAL="$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$SETUP_JSON','utf8'));process.stdout.write(String(data.sourceYearId));")"
TARGET_YEAR_ID_FINAL="$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$SETUP_JSON','utf8'));process.stdout.write(String(data.targetYearId));")"
TARGET_YEAR_NAME_FINAL="$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$SETUP_JSON','utf8'));process.stdout.write(String(data.targetYearName));")"

echo "Source year  : ${SOURCE_YEAR_ID_FINAL}"
echo "Target year  : ${TARGET_YEAR_ID_FINAL} (${TARGET_YEAR_NAME_FINAL})"
echo

DATABASE_URL="$CLONE_DATABASE_URL" \
SOURCE_YEAR_ID="$SOURCE_YEAR_ID_FINAL" \
node -r ts-node/register <<'NODE' >"$PRE_SAMPLES_JSON"
const prisma = require('./src/utils/prisma').default;
(async () => {
  const sourceYearId = Number(process.env.SOURCE_YEAR_ID);
  const samples = {};
  for (const level of ['X', 'XI', 'XII']) {
    const student = await prisma.user.findFirst({
      where: {
        role: 'STUDENT',
        studentStatus: 'ACTIVE',
        studentClass: {
          level,
          academicYearId: sourceYearId,
        },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        studentStatus: true,
        classId: true,
        studentClass: { select: { id: true, name: true, level: true, academicYearId: true } },
      },
    });
    samples[level] = student;
  }
  console.log(JSON.stringify(samples, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
NODE

echo "== Pre-commit Audit =="
DATABASE_URL="$CLONE_DATABASE_URL" npm run promotion:audit -- --source-year "$SOURCE_YEAR_ID_FINAL" --target-year "$TARGET_YEAR_ID_FINAL"
echo

DATABASE_URL="$CLONE_DATABASE_URL" \
SOURCE_YEAR_ID="$SOURCE_YEAR_ID_FINAL" \
TARGET_YEAR_ID="$TARGET_YEAR_ID_FINAL" \
ACTIVATE_TARGET_YEAR="$ACTIVATE_TARGET_YEAR" \
node -r ts-node/register <<'NODE' >"$COMMIT_JSON"
const prisma = require('./src/utils/prisma').default;
const { getAcademicPromotionWorkspace, saveAcademicPromotionMappings, commitAcademicPromotion } = require('./src/services/academicPromotion.service');

(async () => {
  const sourceYearId = Number(process.env.SOURCE_YEAR_ID);
  const targetYearId = Number(process.env.TARGET_YEAR_ID);
  const activateTargetYear = Number(process.env.ACTIVATE_TARGET_YEAR || '1') === 1;
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, name: true } });
  if (!admin) throw new Error('User admin tidak ditemukan pada clone DB.');

  const workspace = await getAcademicPromotionWorkspace(sourceYearId, targetYearId);
  const mappings = workspace.classes
    .filter((item) => item.action === 'PROMOTE')
    .map((item) => ({
      sourceClassId: item.sourceClassId,
      targetClassId: item.targetClassId ?? item.suggestedTargetClassId ?? null,
    }));

  await saveAcademicPromotionMappings({
    sourceAcademicYearId: sourceYearId,
    targetAcademicYearId: targetYearId,
    mappings,
  });

  const result = await commitAcademicPromotion({
    sourceAcademicYearId: sourceYearId,
    targetAcademicYearId: targetYearId,
    activateTargetYear,
    actor: { id: admin.id },
  });

  console.log(JSON.stringify({
    admin,
    runId: result.run.id,
    activateTargetYear,
    summary: result.summary,
    validation: result.validation,
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
NODE

RUN_ID="$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$COMMIT_JSON','utf8'));process.stdout.write(String(data.runId));")"

echo "== Post-commit Audit =="
DATABASE_URL="$CLONE_DATABASE_URL" npm run promotion:audit -- --source-year "$SOURCE_YEAR_ID_FINAL" --target-year "$TARGET_YEAR_ID_FINAL" --run-id "$RUN_ID"
echo

DATABASE_URL="$CLONE_DATABASE_URL" \
PRE_SAMPLES_JSON="$PRE_SAMPLES_JSON" \
node -r ts-node/register <<'NODE' >"$POST_SAMPLES_JSON"
const fs = require('fs');
const prisma = require('./src/utils/prisma').default;
const samples = JSON.parse(fs.readFileSync(process.env.PRE_SAMPLES_JSON, 'utf8'));

(async () => {
  const ids = Object.values(samples).filter(Boolean).map((item) => item.id);
  const students = await prisma.user.findMany({
    where: { id: { in: ids } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      studentStatus: true,
      classId: true,
      studentClass: { select: { id: true, name: true, level: true, academicYearId: true } },
      academicMemberships: {
        orderBy: [{ academicYearId: 'asc' }],
        select: { academicYearId: true, classId: true, status: true, isCurrent: true },
      },
    },
  });
  console.log(JSON.stringify(students, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
NODE

echo "== Result Summary =="
echo "Clone DB    : ${CLONE_DB}"
echo "Source year : ${SOURCE_YEAR_ID_FINAL}"
echo "Target year : ${TARGET_YEAR_ID_FINAL} (${TARGET_YEAR_NAME_FINAL})"
echo "Run ID      : ${RUN_ID}"
echo

echo "-- Pre samples --"
cat "$PRE_SAMPLES_JSON"
echo
echo "-- Commit result --"
cat "$COMMIT_JSON"
echo
echo "-- Post samples --"
cat "$POST_SAMPLES_JSON"
echo

if [ "$KEEP_CLONE" -eq 1 ]; then
  echo "Clone dipertahankan untuk inspeksi manual: ${CLONE_DB}"
else
  echo "Clone akan dibersihkan otomatis."
fi
