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
  bash ./scripts/smoke-test-academic-year-rollover-clone.sh [options]

Options:
  --source-year-id <id>     Gunakan tahun sumber tertentu. Default: tahun aktif.
  --target-name <name>      Nama target year smoke test. Default otomatis.
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

CLONE_DB="${PGDATABASE}_rollover_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-rollover-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Year Rollover Smoke Test =="
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
node -r ts-node/register <<'NODE' >"$RESULT_JSON"
const prisma = require('./src/utils/prisma').default;
const {
  createAcademicYearRolloverTarget,
  getAcademicYearRolloverWorkspace,
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Rollover ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Rollover`;
}

async function pickSourceYear() {
  const requestedSourceYearId = Number(process.env.SOURCE_YEAR_ID || '');
  if (Number.isFinite(requestedSourceYearId) && requestedSourceYearId > 0) {
    return prisma.academicYear.findUnique({
      where: { id: requestedSourceYearId },
      select: {
        id: true,
        name: true,
        isActive: true,
        semester1Start: true,
        semester1End: true,
        semester2Start: true,
        semester2End: true,
      },
    });
  }
  return prisma.academicYear.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      isActive: true,
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
  });
}

async function collectStudentSamples(sourceYearId) {
  const result = {};
  for (const level of ['X', 'XI', 'XII']) {
    const student = await prisma.user.findFirst({
      where: {
        role: 'STUDENT',
        studentStatus: 'ACTIVE',
        studentClass: {
          academicYearId: sourceYearId,
          level,
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
    result[level] = student;
  }
  return result;
}

async function collectSourceSummary(sourceYearId) {
  const sourceClassIds = (
    await prisma.class.findMany({
      where: { academicYearId: sourceYearId },
      select: { id: true },
    })
  ).map((item) => item.id);

  return {
    sourceClassCount: sourceClassIds.length,
    sourceAssignmentCount: await prisma.teacherAssignment.count({
      where: { academicYearId: sourceYearId },
    }),
    sourceAcademicEventCount: await prisma.academicEvent.count({
      where: { academicYearId: sourceYearId },
    }),
    sourceReportDateCount: await prisma.reportDate.count({
      where: { academicYearId: sourceYearId },
    }),
    activeStudentsInSourceYear: await prisma.user.count({
      where: {
        role: 'STUDENT',
        studentStatus: 'ACTIVE',
        classId: { in: sourceClassIds.length > 0 ? sourceClassIds : [-1] },
      },
    }),
  };
}

function assertCondition(checks, condition, description, details = undefined) {
  checks.push({
    description,
    pass: Boolean(condition),
    details: details === undefined ? null : details,
  });
}

(async () => {
  const sourceYear = await pickSourceYear();
  if (!sourceYear) {
    throw new Error('Tahun sumber tidak ditemukan.');
  }

  const requestedTargetName = String(process.env.TARGET_NAME || '').trim();
  const targetName = requestedTargetName || deriveTargetName(sourceYear.name);
  const targetResult = await createAcademicYearRolloverTarget({
    sourceAcademicYearId: sourceYear.id,
    payload: { name: targetName },
  });

  const preSamples = await collectStudentSamples(sourceYear.id);
  const sourceSummaryBefore = await collectSourceSummary(sourceYear.id);
  let seededReportDates = 0;
  if (sourceSummaryBefore.sourceReportDateCount === 0) {
    await prisma.reportDate.createMany({
      data: [
        {
          academicYearId: sourceYear.id,
          semester: 'ODD',
          reportType: 'SAS',
          place: 'Bekasi',
          date: new Date(sourceYear.semester1End),
        },
        {
          academicYearId: sourceYear.id,
          semester: 'EVEN',
          reportType: 'SAT',
          place: 'Bekasi',
          date: new Date(sourceYear.semester2End),
        },
      ],
      skipDuplicates: true,
    });
    seededReportDates = await prisma.reportDate.count({
      where: { academicYearId: sourceYear.id },
    });
  }
  const sourceSummaryPrepared = await collectSourceSummary(sourceYear.id);
  const workspaceBefore = await getAcademicYearRolloverWorkspace(sourceYear.id, targetResult.targetAcademicYear.id);

  if (!workspaceBefore.validation.readyToApply) {
    throw new Error(`Workspace rollover belum siap: ${workspaceBefore.validation.errors.join(' | ')}`);
  }

  const firstApply = await applyAcademicYearRollover({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetResult.targetAcademicYear.id,
    components: {
      classPreparation: true,
      teacherAssignments: true,
      subjectKkms: true,
      examGradeComponents: true,
      examProgramConfigs: true,
      examProgramSessions: true,
      scheduleTimeConfig: true,
      academicEvents: true,
      reportDates: true,
    },
    actor: null,
  });
  const workspaceAfterFirst = await getAcademicYearRolloverWorkspace(sourceYear.id, targetResult.targetAcademicYear.id);

  const secondApply = await applyAcademicYearRollover({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetResult.targetAcademicYear.id,
    components: {
      classPreparation: true,
      teacherAssignments: true,
      subjectKkms: true,
      examGradeComponents: true,
      examProgramConfigs: true,
      examProgramSessions: true,
      scheduleTimeConfig: true,
      academicEvents: true,
      reportDates: true,
    },
    actor: null,
  });
  const workspaceAfterSecond = await getAcademicYearRolloverWorkspace(sourceYear.id, targetResult.targetAcademicYear.id);

  const postSamples = await collectStudentSamples(sourceYear.id);
  const sourceSummaryAfter = await collectSourceSummary(sourceYear.id);
  const targetYearAfter = await prisma.academicYear.findUnique({
    where: { id: targetResult.targetAcademicYear.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
      _count: { select: { classes: true, teacherAssignments: true, academicEvents: true } },
    },
  });
  const targetScheduleTimeConfig = await prisma.scheduleTimeConfig.findUnique({
    where: { academicYearId: targetResult.targetAcademicYear.id },
    select: { id: true },
  });
  const targetSubjectKkmCount = await prisma.subjectKKM.count({
    where: { academicYearId: targetResult.targetAcademicYear.id },
  });
  const targetExamGradeComponentCount = await prisma.examGradeComponent.count({
    where: { academicYearId: targetResult.targetAcademicYear.id },
  });
  const targetExamProgramConfigCount = await prisma.examProgramConfig.count({
    where: { academicYearId: targetResult.targetAcademicYear.id },
  });
  const targetExamProgramSessionCount = await prisma.examProgramSession.count({
    where: { academicYearId: targetResult.targetAcademicYear.id },
  });
  const targetReportDateCount = await prisma.reportDate.count({
    where: { academicYearId: targetResult.targetAcademicYear.id },
  });

  const checks = [];
  assertCondition(
    checks,
    targetYearAfter && targetYearAfter.isActive === false,
    'Target year tetap nonaktif setelah wizard apply.',
  );
  assertCondition(
    checks,
    firstApply.applied.classPreparation.created === workspaceBefore.components.classPreparation.summary.createCount,
    'Jumlah kelas yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.classPreparation.summary.createCount,
      applied: firstApply.applied.classPreparation.created,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.teacherAssignments.created === workspaceBefore.components.teacherAssignments.summary.createCount,
    'Jumlah teacher assignment yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.teacherAssignments.summary.createCount,
      applied: firstApply.applied.teacherAssignments.created,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.scheduleTimeConfig.created === workspaceBefore.components.scheduleTimeConfig.summary.createCount,
    'Schedule time config mengikuti preview.',
    {
      preview: workspaceBefore.components.scheduleTimeConfig.summary.createCount,
      applied: firstApply.applied.scheduleTimeConfig.created,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.academicEvents.created === workspaceBefore.components.academicEvents.summary.createCount,
    'Academic event yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.academicEvents.summary.createCount,
      applied: firstApply.applied.academicEvents.created,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.reportDates.created === workspaceBefore.components.reportDates.summary.createCount,
    'Tanggal rapor yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.reportDates.summary.createCount,
      applied: firstApply.applied.reportDates.created,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.subjectKkms.created === workspaceBefore.components.subjectKkms.summary.createCount,
    'KKM tahunan yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.subjectKkms.summary.createCount,
      applied: firstApply.applied.subjectKkms.created,
      globalFallbackCount: workspaceBefore.components.subjectKkms.summary.globalFallbackCount,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.examGradeComponents.created === workspaceBefore.components.examGradeComponents.summary.createCount,
    'Komponen nilai ujian yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.examGradeComponents.summary.createCount,
      applied: firstApply.applied.examGradeComponents.created,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.examProgramConfigs.created === workspaceBefore.components.examProgramConfigs.summary.createCount,
    'Program ujian target yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.examProgramConfigs.summary.createCount,
      applied: firstApply.applied.examProgramConfigs.created,
      missingGradeComponentCount: workspaceBefore.components.examProgramConfigs.summary.missingGradeComponentCount,
    },
  );
  assertCondition(
    checks,
    firstApply.applied.examProgramSessions.created === workspaceBefore.components.examProgramSessions.summary.createCount,
    'Sesi program ujian yang dibuat sesuai preview.',
    {
      preview: workspaceBefore.components.examProgramSessions.summary.createCount,
      applied: firstApply.applied.examProgramSessions.created,
      skipNoTargetProgramCount: workspaceBefore.components.examProgramSessions.summary.skipNoTargetProgramCount,
    },
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.classPreparation.summary.createCount === 0,
    'Setelah apply pertama, kelas target tidak punya item create tersisa.',
    workspaceAfterFirst.components.classPreparation.summary,
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.teacherAssignments.summary.createCount === 0,
    'Setelah apply pertama, teacher assignment tidak punya item create tersisa.',
    workspaceAfterFirst.components.teacherAssignments.summary,
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.academicEvents.summary.createCount === 0,
    'Setelah apply pertama, academic events tidak punya item create tersisa.',
    workspaceAfterFirst.components.academicEvents.summary,
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.reportDates.summary.createCount === 0,
    'Setelah apply pertama, tanggal rapor target tidak punya item create tersisa.',
    workspaceAfterFirst.components.reportDates.summary,
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.subjectKkms.summary.createCount === 0,
    'Setelah apply pertama, KKM target tidak punya item create tersisa.',
    workspaceAfterFirst.components.subjectKkms.summary,
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.examGradeComponents.summary.createCount === 0,
    'Setelah apply pertama, komponen nilai tidak punya item create tersisa.',
    workspaceAfterFirst.components.examGradeComponents.summary,
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.examProgramConfigs.summary.createCount === 0,
    'Setelah apply pertama, program ujian tidak punya item create tersisa.',
    workspaceAfterFirst.components.examProgramConfigs.summary,
  );
  assertCondition(
    checks,
    workspaceAfterFirst.components.examProgramSessions.summary.createCount === 0,
    'Setelah apply pertama, sesi program ujian tidak punya item create tersisa.',
    workspaceAfterFirst.components.examProgramSessions.summary,
  );
  assertCondition(
    checks,
    secondApply.applied.classPreparation.created === 0 &&
      secondApply.applied.teacherAssignments.created === 0 &&
      secondApply.applied.reportDates.created === 0 &&
      secondApply.applied.subjectKkms.created === 0 &&
      secondApply.applied.examGradeComponents.created === 0 &&
      secondApply.applied.examProgramConfigs.created === 0 &&
      secondApply.applied.examProgramSessions.created === 0 &&
      secondApply.applied.scheduleTimeConfig.created === 0 &&
      secondApply.applied.academicEvents.created === 0,
    'Apply kedua idempotent dan tidak membuat data tambahan.',
    secondApply.applied,
  );
  assertCondition(
    checks,
    sourceSummaryBefore.activeStudentsInSourceYear === sourceSummaryAfter.activeStudentsInSourceYear,
    'Wizard setup tahunan tidak memindahkan siswa aktif di source year.',
    {
      before: sourceSummaryBefore.activeStudentsInSourceYear,
      after: sourceSummaryAfter.activeStudentsInSourceYear,
    },
  );
  assertCondition(
    checks,
    JSON.stringify(preSamples) === JSON.stringify(postSamples),
    'Sampel siswa X/XI/XII tetap pada status dan kelas asal setelah wizard apply.',
    {
      before: preSamples,
      after: postSamples,
    },
  );
  assertCondition(
    checks,
    Boolean(targetScheduleTimeConfig) ===
      (workspaceBefore.components.scheduleTimeConfig.summary.createCount === 1 ||
        workspaceBefore.components.scheduleTimeConfig.summary.existingCount === 1),
    'Schedule time config target sesuai ekspektasi sesudah apply.',
    {
      targetExists: Boolean(targetScheduleTimeConfig),
      preview: workspaceBefore.components.scheduleTimeConfig.summary,
    },
  );
  assertCondition(
    checks,
    workspaceAfterSecond.validation.readyToApply === true,
    'Workspace tetap sehat setelah apply berulang.',
    workspaceAfterSecond.validation,
  );
  assertCondition(
    checks,
    targetSubjectKkmCount >= firstApply.applied.subjectKkms.created,
    'Target year menyimpan KKM tahunan yang baru dibuat.',
    {
      targetSubjectKkmCount,
      created: firstApply.applied.subjectKkms.created,
    },
  );
  assertCondition(
    checks,
    targetReportDateCount >= firstApply.applied.reportDates.created,
    'Target year menyimpan tanggal rapor yang baru dibuat.',
    {
      targetReportDateCount,
      created: firstApply.applied.reportDates.created,
    },
  );
  assertCondition(
    checks,
    targetExamGradeComponentCount >= firstApply.applied.examGradeComponents.created,
    'Target year menyimpan komponen nilai ujian.',
    {
      targetExamGradeComponentCount,
      created: firstApply.applied.examGradeComponents.created,
    },
  );
  assertCondition(
    checks,
    targetExamProgramConfigCount >= firstApply.applied.examProgramConfigs.created,
    'Target year menyimpan program ujian.',
    {
      targetExamProgramConfigCount,
      created: firstApply.applied.examProgramConfigs.created,
    },
  );
  assertCondition(
    checks,
    targetExamProgramSessionCount >= firstApply.applied.examProgramSessions.created,
    'Target year menyimpan sesi program ujian.',
    {
      targetExamProgramSessionCount,
      created: firstApply.applied.examProgramSessions.created,
    },
  );

  console.log(JSON.stringify({
    sourceYear,
    targetYear: targetYearAfter,
    targetCreated: targetResult.created,
    previewBefore: {
      classPreparation: workspaceBefore.components.classPreparation.summary,
      teacherAssignments: workspaceBefore.components.teacherAssignments.summary,
      reportDates: workspaceBefore.components.reportDates.summary,
      subjectKkms: workspaceBefore.components.subjectKkms.summary,
      examGradeComponents: workspaceBefore.components.examGradeComponents.summary,
      examProgramConfigs: workspaceBefore.components.examProgramConfigs.summary,
      examProgramSessions: workspaceBefore.components.examProgramSessions.summary,
      scheduleTimeConfig: workspaceBefore.components.scheduleTimeConfig.summary,
      academicEvents: workspaceBefore.components.academicEvents.summary,
      warnings: workspaceBefore.validation.warnings,
    },
    firstApply: firstApply.applied,
    secondApply: secondApply.applied,
    sourceSummaryBefore,
    sourceSummaryPrepared,
    sourceSummaryAfter,
    seededReportDates,
    checks,
    pass: checks.every((item) => item.pass),
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
NODE

node <<NODE
const fs = require('fs');
const result = JSON.parse(fs.readFileSync('$RESULT_JSON', 'utf8'));
console.log('== Result ==');
console.log('Source year : ' + result.sourceYear.id + ' (' + result.sourceYear.name + ')');
console.log('Target year : ' + result.targetYear.id + ' (' + result.targetYear.name + ')');
console.log('Target made : ' + (result.targetCreated ? 'created' : 'reused'));
console.log('Preview     : classes=' + result.previewBefore.classPreparation.createCount
  + ', assignments=' + result.previewBefore.teacherAssignments.createCount
  + ', reportDates=' + result.previewBefore.reportDates.createCount
  + ', kkms=' + result.previewBefore.subjectKkms.createCount
  + ', examComponents=' + result.previewBefore.examGradeComponents.createCount
  + ', examPrograms=' + result.previewBefore.examProgramConfigs.createCount
  + ', examSessions=' + result.previewBefore.examProgramSessions.createCount
  + ', schedule=' + result.previewBefore.scheduleTimeConfig.createCount
  + ', events=' + result.previewBefore.academicEvents.createCount);
console.log('1st apply   : classes=' + result.firstApply.classPreparation.created
  + ', assignments=' + result.firstApply.teacherAssignments.created
  + ', reportDates=' + result.firstApply.reportDates.created
  + ', kkms=' + result.firstApply.subjectKkms.created
  + ', examComponents=' + result.firstApply.examGradeComponents.created
  + ', examPrograms=' + result.firstApply.examProgramConfigs.created
  + ', examSessions=' + result.firstApply.examProgramSessions.created
  + ', schedule=' + result.firstApply.scheduleTimeConfig.created
  + ', events=' + result.firstApply.academicEvents.created);
console.log('2nd apply   : classes=' + result.secondApply.classPreparation.created
  + ', assignments=' + result.secondApply.teacherAssignments.created
  + ', reportDates=' + result.secondApply.reportDates.created
  + ', kkms=' + result.secondApply.subjectKkms.created
  + ', examComponents=' + result.secondApply.examGradeComponents.created
  + ', examPrograms=' + result.secondApply.examProgramConfigs.created
  + ', examSessions=' + result.secondApply.examProgramSessions.created
  + ', schedule=' + result.secondApply.scheduleTimeConfig.created
  + ', events=' + result.secondApply.academicEvents.created);
console.log('Checks      : ' + result.checks.filter((item) => item.pass).length + '/' + result.checks.length + ' PASS');
if (!result.pass) {
  console.log();
  console.log('Failed checks:');
  result.checks.filter((item) => !item.pass).forEach((item) => {
    console.log('- ' + item.description);
    if (item.details) {
      console.log('  ' + JSON.stringify(item.details));
    }
  });
  process.exit(1);
}
NODE
