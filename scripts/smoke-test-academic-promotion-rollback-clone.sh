#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP_CLONE=0
SOURCE_YEAR_ID=""
TARGET_NAME=""
CLONE_DB=""

print_usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/smoke-test-academic-promotion-rollback-clone.sh [options]

Options:
  --source-year-id <id>     Gunakan tahun sumber tertentu. Default: tahun aktif.
  --target-name <name>      Nama tahun target smoke test. Default otomatis.
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
if (!raw) {
  throw new Error('DATABASE_URL tidak ditemukan di backend/.env');
}
const u = new URL(raw);
console.log('export BASE_DATABASE_URL=' + JSON.stringify(u.toString()));
console.log('export PGHOST=' + JSON.stringify(u.hostname));
console.log('export PGPORT=' + JSON.stringify(u.port || '5432'));
console.log('export PGDATABASE=' + JSON.stringify(u.pathname.replace(/^\//, '')));
console.log('export PGUSER=' + JSON.stringify(decodeURIComponent(u.username || '')));
console.log('export PGPASSWORD=' + JSON.stringify(decodeURIComponent(u.password || '')));
NODE
)"

CLONE_DB="${PGDATABASE}_promotion_rollback_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-promotion-rollback-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Promotion Rollback Smoke Test =="
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

set +e
DATABASE_URL="$CLONE_DATABASE_URL" \
SOURCE_YEAR_ID="$SOURCE_YEAR_ID" \
TARGET_NAME="$TARGET_NAME" \
node -r ts-node/register <<'NODE' >"$RESULT_JSON"
const prisma = require('./src/utils/prisma').default;
const {
  createAcademicYearRolloverTarget,
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');
const {
  getAcademicPromotionWorkspace,
  saveAcademicPromotionMappings,
  commitAcademicPromotion,
  rollbackAcademicPromotion,
} = require('./src/services/academicPromotion.service');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Promotion Rollback ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Promotion Rollback`;
}

function assertCondition(checks, condition, description, details = undefined) {
  checks.push({
    description,
    pass: Boolean(condition),
    details: details === undefined ? null : details,
  });
}

async function pickSourceYear() {
  const requestedSourceYearId = Number(process.env.SOURCE_YEAR_ID || '');
  if (Number.isFinite(requestedSourceYearId) && requestedSourceYearId > 0) {
    return prisma.academicYear.findUnique({
      where: { id: requestedSourceYearId },
      select: { id: true, name: true },
    });
  }
  return prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
}

async function collectStudentSamples(sourceYearId) {
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
        studentClass: {
          select: {
            id: true,
            name: true,
            level: true,
            academicYearId: true,
          },
        },
      },
    });
    samples[level] = student;
  }
  return samples;
}

async function collectStudentStateMap(samples, sourceYearId, targetYearId) {
  const ids = Object.values(samples)
    .filter(Boolean)
    .map((item) => item.id);

  if (ids.length === 0) {
    return {};
  }

  const students = await prisma.user.findMany({
    where: { id: { in: ids } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      studentStatus: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          level: true,
          academicYearId: true,
        },
      },
      academicMemberships: {
        where: {
          academicYearId: {
            in: [sourceYearId, targetYearId],
          },
        },
        orderBy: [{ academicYearId: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          classId: true,
          status: true,
          isCurrent: true,
          promotionRunId: true,
        },
      },
    },
  });

  return Object.fromEntries(
    students.map((student) => [
      student.id,
      {
        ...student,
        sourceMembership:
          student.academicMemberships.find((membership) => membership.academicYearId === sourceYearId) || null,
        targetMembership:
          student.academicMemberships.find((membership) => membership.academicYearId === targetYearId) || null,
      },
    ]),
  );
}

(async () => {
  const sourceYear = await pickSourceYear();
  if (!sourceYear) {
    throw new Error('Tahun sumber tidak ditemukan.');
  }

  const requestedTargetName = String(process.env.TARGET_NAME || '').trim();
  const targetSetup = await createAcademicYearRolloverTarget({
    sourceAcademicYearId: sourceYear.id,
    payload: {
      name: requestedTargetName || deriveTargetName(sourceYear.name),
    },
  });

  await applyAcademicYearRollover({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    components: {
      classPreparation: true,
      teacherAssignments: false,
      subjectKkms: false,
      examGradeComponents: false,
      examProgramConfigs: false,
      examProgramSessions: false,
      scheduleTimeConfig: false,
      academicEvents: false,
      reportDates: false,
    },
    actor: null,
  });

  const targetYearId = targetSetup.targetAcademicYear.id;
  const preSamples = await collectStudentSamples(sourceYear.id);
  const preStateMap = await collectStudentStateMap(preSamples, sourceYear.id, targetYearId);
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: [{ id: 'asc' }],
    select: { id: true, name: true, username: true },
  });

  if (!admin) {
    throw new Error('User admin tidak ditemukan pada clone DB.');
  }

  const workspace = await getAcademicPromotionWorkspace(sourceYear.id, targetYearId);
  const mappings = workspace.classes
    .filter((item) => item.action === 'PROMOTE')
    .map((item) => ({
      sourceClassId: item.sourceClassId,
      targetClassId: item.targetClassId ?? item.suggestedTargetClassId ?? null,
    }));

  await saveAcademicPromotionMappings({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetYearId,
    mappings,
  });

  const commitResult = await commitAcademicPromotion({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetYearId,
    activateTargetYear: true,
    actor: { id: admin.id },
  });

  const afterCommitActiveYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const committedStateMap = await collectStudentStateMap(preSamples, sourceYear.id, targetYearId);
  const rollbackResult = await rollbackAcademicPromotion({
    runId: commitResult.run.id,
    sourceAcademicYearId: sourceYear.id,
    actor: {
      id: admin.id,
      name: admin.name,
      username: admin.username,
    },
  });

  const afterRollbackActiveYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const rolledBackRun = await prisma.promotionRun.findUnique({
    where: { id: commitResult.run.id },
    select: {
      id: true,
      status: true,
      summary: true,
    },
  });

  const postRollbackStateMap = await collectStudentStateMap(preSamples, sourceYear.id, targetYearId);
  const checks = [];
  const sampleEntries = Object.entries(preSamples).filter(([, sample]) => Boolean(sample));
  const promoteSampleEntry = sampleEntries.find(([level]) => level === 'X' || level === 'XI') || null;
  const graduateSampleEntry = sampleEntries.find(([level]) => level === 'XII') || null;
  const rollbackMeta = rolledBackRun && rolledBackRun.summary && typeof rolledBackRun.summary === 'object'
    ? rolledBackRun.summary.rollback || null
    : null;

  assertCondition(checks, sampleEntries.length > 0, 'Minimal ada satu sampel siswa aktif pada source year.');
  assertCondition(checks, Boolean(promoteSampleEntry), 'Sampel kenaikan kelas (X/XI) tersedia.');
  assertCondition(checks, Boolean(graduateSampleEntry), 'Sampel alumni (XII) tersedia.');
  assertCondition(
    checks,
    commitResult.run.id > 0 && rollbackResult.run.id === commitResult.run.id,
    'Run commit dan rollback menggunakan run yang sama.',
    { commitRunId: commitResult.run.id, rollbackRunId: rollbackResult.run.id },
  );
  assertCondition(
    checks,
    afterCommitActiveYear?.id === targetYearId,
    'Setelah commit, tahun target menjadi aktif.',
    afterCommitActiveYear,
  );
  assertCondition(
    checks,
    afterRollbackActiveYear?.id === sourceYear.id,
    'Setelah rollback, tahun sumber aktif kembali.',
    afterRollbackActiveYear,
  );
  assertCondition(
    checks,
    rollbackResult.run.status === 'ROLLED_BACK',
    'Rollback mengembalikan status public run menjadi ROLLED_BACK.',
    rollbackResult.run,
  );
  assertCondition(
    checks,
    rollbackResult.rollback.restoredStudents === commitResult.summary.totalStudents,
    'Jumlah siswa yang direstore sama dengan total siswa pada commit.',
    {
      restoredStudents: rollbackResult.rollback.restoredStudents,
      totalStudents: commitResult.summary.totalStudents,
    },
  );
  assertCondition(
    checks,
    rollbackResult.rollback.revertedPromotedStudents === commitResult.summary.promotedStudents,
    'Jumlah siswa promote yang direvert sama dengan ringkasan commit.',
    {
      revertedPromotedStudents: rollbackResult.rollback.revertedPromotedStudents,
      promotedStudents: commitResult.summary.promotedStudents,
    },
  );
  assertCondition(
    checks,
    rollbackResult.rollback.revertedGraduatedStudents === commitResult.summary.graduatedStudents,
    'Jumlah siswa graduate yang direvert sama dengan ringkasan commit.',
    {
      revertedGraduatedStudents: rollbackResult.rollback.revertedGraduatedStudents,
      graduatedStudents: commitResult.summary.graduatedStudents,
    },
  );
  assertCondition(
    checks,
    Boolean(rollbackMeta?.rolledBackAt) &&
      Number(rollbackMeta?.sourceAcademicYearId || 0) === sourceYear.id &&
      Number(rollbackMeta?.targetAcademicYearId || 0) === targetYearId,
    'Metadata rollback tersimpan pada summary run.',
    rollbackMeta,
  );

  for (const [level, sample] of sampleEntries) {
    const beforeState = preStateMap[sample.id];
    const afterCommitState = committedStateMap[sample.id];
    const afterRollbackState = postRollbackStateMap[sample.id];
    const label = `${level}#${sample.id} ${sample.name}`;

    assertCondition(
      checks,
      afterRollbackState?.studentStatus === 'ACTIVE' && afterRollbackState?.classId === sample.classId,
      `${label}: setelah rollback kembali ACTIVE di kelas asal.`,
      afterRollbackState,
    );
    assertCondition(
      checks,
      afterRollbackState?.sourceMembership?.status === 'ACTIVE' &&
        afterRollbackState?.sourceMembership?.isCurrent === true &&
        afterRollbackState?.sourceMembership?.classId === sample.classId &&
        afterRollbackState?.sourceMembership?.promotionRunId === null,
      `${label}: membership source setelah rollback kembali ACTIVE/current.`,
      afterRollbackState?.sourceMembership || null,
    );

    if (level === 'XII') {
      assertCondition(
        checks,
        afterCommitState?.studentStatus === 'GRADUATED' &&
          afterCommitState?.classId === null &&
          afterCommitState?.sourceMembership?.status === 'GRADUATED' &&
          afterCommitState?.sourceMembership?.isCurrent === false &&
          !afterCommitState?.targetMembership,
        `${label}: setelah commit menjadi alumni dengan histori source yang benar.`,
        afterCommitState,
      );
      assertCondition(
        checks,
        !afterRollbackState?.targetMembership,
        `${label}: setelah rollback tidak memiliki membership target tersisa.`,
        afterRollbackState?.targetMembership || null,
      );
      continue;
    }

    assertCondition(
      checks,
      afterCommitState?.studentStatus === 'ACTIVE' &&
        afterCommitState?.classId !== sample.classId &&
        afterCommitState?.targetMembership?.isCurrent === true &&
        afterCommitState?.targetMembership?.status === 'ACTIVE' &&
        afterCommitState?.sourceMembership?.status === 'PROMOTED' &&
        afterCommitState?.sourceMembership?.isCurrent === false,
      `${label}: setelah commit naik kelas dengan membership target current.`,
      afterCommitState,
    );
    assertCondition(
      checks,
      !afterRollbackState?.targetMembership,
      `${label}: setelah rollback membership target hasil promotion terhapus.`,
      afterRollbackState?.targetMembership || null,
    );
  }

  const passedChecks = checks.filter((item) => item.pass).length;
  const failedChecks = checks.filter((item) => !item.pass);

  console.log(
    JSON.stringify(
      {
        sourceYear: {
          id: sourceYear.id,
          name: sourceYear.name,
        },
        targetYear: {
          id: targetYearId,
          name: targetSetup.targetAcademicYear.name,
        },
        admin,
        commit: commitResult,
        rollback: rollbackResult,
        activeYears: {
          afterCommit: afterCommitActiveYear,
          afterRollback: afterRollbackActiveYear,
        },
        preSamples,
        checks,
        passedChecks,
        failedChecks,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();

  if (failedChecks.length > 0) {
    process.exit(1);
  }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
NODE
NODE_EXIT=$?
set -e

echo "== Result Summary =="
if [ -f "$RESULT_JSON" ]; then
  cat "$RESULT_JSON"
else
  echo "Smoke test tidak menghasilkan result JSON."
fi
echo

if [ "$NODE_EXIT" -ne 0 ]; then
  exit "$NODE_EXIT"
fi

PASS_COUNT="$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$RESULT_JSON','utf8'));process.stdout.write(String(data.passedChecks||0));")"
FAIL_COUNT="$(node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('$RESULT_JSON','utf8'));process.stdout.write(String((data.failedChecks||[]).length));")"

echo "[PASS] Academic promotion rollback smoke test selesai."
echo "Clone DB    : ${CLONE_DB}"
echo "Passed      : ${PASS_COUNT}"
echo "Failed      : ${FAIL_COUNT}"
echo

if [ "$KEEP_CLONE" -eq 1 ]; then
  echo "Clone dipertahankan untuk inspeksi manual: ${CLONE_DB}"
else
  echo "Clone akan dibersihkan otomatis."
fi
