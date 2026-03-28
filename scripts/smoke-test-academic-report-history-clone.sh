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
  bash ./scripts/smoke-test-academic-report-history-clone.sh [options]

Options:
  --source-year-id <id>     Gunakan tahun sumber tertentu. Default: tahun aktif.
  --target-name <name>      Nama target year uji. Default otomatis.
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

CLONE_DB="${PGDATABASE}_report_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-report-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Report History Smoke Test =="
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
const { Semester, ExamType } = require('@prisma/client');
const { reportService } = require('./src/services/report.service');
const { buildFinalLedgerPreviewData } = require('./src/controllers/report.controller');
const {
  createAcademicYearRolloverTarget,
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');
const { commitAcademicPromotion } = require('./src/services/academicPromotion.service');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Report History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Report History`;
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
    },
    actor: null,
  });

  const sampleStudent = await prisma.user.findFirst({
    where: {
      role: 'STUDENT',
      studentStatus: 'ACTIVE',
      studentClass: {
        academicYearId: sourceYear.id,
        level: { in: ['X', 'XI'] },
      },
    },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      name: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
    },
  });

  if (!sampleStudent?.studentClass) {
    throw new Error('Tidak ada siswa X/XI aktif yang siap diuji.');
  }

  const beforeStudentReport = await reportService.getStudentReport(
    sampleStudent.id,
    sourceYear.id,
    Semester.ODD,
    ExamType.SAS,
  );
  const beforeClassLedger = await reportService.getClassLedger(
    sampleStudent.studentClass.id,
    sourceYear.id,
    Semester.ODD,
    ExamType.SAS,
  );
  const beforeClassExtracurricular = await reportService.getClassExtracurricularReport(
    sampleStudent.studentClass.id,
    sourceYear.id,
    Semester.ODD,
    ExamType.SAS,
  );
  const beforeClassRankings = await reportService.getClassRankings(
    sampleStudent.studentClass.id,
    sourceYear.id,
    Semester.ODD,
  );
  const beforeFinalLedger = await buildFinalLedgerPreviewData({
    academicYearIds: [sourceYear.id],
    semesters: [Semester.ODD],
    classId: sampleStudent.studentClass.id,
    studentId: sampleStudent.id,
    limitStudents: 10,
  });

  const commitResult = await commitAcademicPromotion({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    activateTargetYear: false,
    actor: null,
  });

  const promotedStudent = await prisma.user.findUnique({
    where: { id: sampleStudent.id },
    select: {
      id: true,
      classId: true,
      studentStatus: true,
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
          academicYearId: sourceYear.id,
        },
        select: {
          academicYearId: true,
          status: true,
          classId: true,
          isCurrent: true,
          class: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
        },
      },
    },
  });

  const afterStudentReport = await reportService.getStudentReport(
    sampleStudent.id,
    sourceYear.id,
    Semester.ODD,
    ExamType.SAS,
  );
  const afterClassLedger = await reportService.getClassLedger(
    sampleStudent.studentClass.id,
    sourceYear.id,
    Semester.ODD,
    ExamType.SAS,
  );
  const afterClassExtracurricular = await reportService.getClassExtracurricularReport(
    sampleStudent.studentClass.id,
    sourceYear.id,
    Semester.ODD,
    ExamType.SAS,
  );
  const afterClassRankings = await reportService.getClassRankings(
    sampleStudent.studentClass.id,
    sourceYear.id,
    Semester.ODD,
  );
  const afterFinalLedger = await buildFinalLedgerPreviewData({
    academicYearIds: [sourceYear.id],
    semesters: [Semester.ODD],
    classId: sampleStudent.studentClass.id,
    studentId: sampleStudent.id,
    limitStudents: 10,
  });

  const checks = [];
  assertCondition(
    checks,
    commitResult.summary.promotedStudents > 0,
    'Smoke test benar-benar menjalankan promotion untuk siswa aktif.',
    commitResult.summary,
  );
  assertCondition(
    checks,
    promotedStudent && promotedStudent.classId !== sampleStudent.studentClass.id,
    'Siswa sampel benar-benar pindah dari kelas source setelah promotion.',
    {
      beforeClassId: sampleStudent.studentClass.id,
      afterClassId: promotedStudent?.classId || null,
      afterClassName: promotedStudent?.studentClass?.name || null,
    },
  );
  assertCondition(
    checks,
    afterStudentReport.header.class === sampleStudent.studentClass.name,
    'Student report source year tetap memakai nama kelas historis setelah promotion.',
    {
      expected: sampleStudent.studentClass.name,
      actual: afterStudentReport.header.class,
    },
  );
  assertCondition(
    checks,
    beforeStudentReport.header.class === afterStudentReport.header.class,
    'Header report siswa konsisten sebelum dan sesudah promotion.',
    {
      before: beforeStudentReport.header.class,
      after: afterStudentReport.header.class,
    },
  );
  assertCondition(
    checks,
    beforeClassLedger.students.length === afterClassLedger.students.length,
    'Jumlah siswa pada class ledger source year tetap sama sesudah promotion.',
    {
      before: beforeClassLedger.students.length,
      after: afterClassLedger.students.length,
    },
  );
  assertCondition(
    checks,
    afterClassLedger.students.some((item) => item.id === sampleStudent.id),
    'Class ledger source year masih memuat siswa sampel setelah promotion.',
    {
      sampleStudentId: sampleStudent.id,
      studentCount: afterClassLedger.students.length,
    },
  );
  assertCondition(
    checks,
    afterClassExtracurricular.some((item) => item.id === sampleStudent.id),
    'Report ekstrakurikuler source year masih memuat siswa sampel setelah promotion.',
    {
      sampleStudentId: sampleStudent.id,
      studentCount: afterClassExtracurricular.length,
    },
  );
  assertCondition(
    checks,
    afterClassRankings.rankings.some((item) => item.student.id === sampleStudent.id),
    'Ranking kelas source year masih memuat siswa sampel setelah promotion.',
    {
      sampleStudentId: sampleStudent.id,
      rankingCount: afterClassRankings.rankings.length,
    },
  );
  assertCondition(
    checks,
    beforeFinalLedger.rows.length === afterFinalLedger.rows.length,
    'Jumlah baris final ledger source year konsisten sebelum dan sesudah promotion.',
    {
      before: beforeFinalLedger.rows.length,
      after: afterFinalLedger.rows.length,
    },
  );
  assertCondition(
    checks,
    afterFinalLedger.rows.some(
      (item) =>
        item.student.id === sampleStudent.id &&
        item.student.class &&
        item.student.class.id === sampleStudent.studentClass.id &&
        item.student.class.name === sampleStudent.studentClass.name,
    ),
    'Final ledger source year tetap memuat kelas historis siswa sampel setelah promotion.',
    {
      sampleStudentId: sampleStudent.id,
      sampleClassId: sampleStudent.studentClass.id,
      sampleClassName: sampleStudent.studentClass.name,
    },
  );
  assertCondition(
    checks,
    (promotedStudent?.academicMemberships || []).some(
      (item) =>
        item.academicYearId === sourceYear.id &&
        item.classId === sampleStudent.studentClass.id &&
        item.class?.name === sampleStudent.studentClass.name &&
        item.isCurrent === false,
    ),
    'Membership historis source year tersimpan untuk siswa sampel.',
    promotedStudent?.academicMemberships || [],
  );

  console.log(
    JSON.stringify(
      {
        sourceYear,
        targetYear: targetSetup.targetAcademicYear,
        sampleStudent: {
          id: sampleStudent.id,
          name: sampleStudent.name,
          sourceClassId: sampleStudent.studentClass.id,
          sourceClassName: sampleStudent.studentClass.name,
        },
        promotedStudent,
        summary: commitResult.summary,
        checks,
        pass: checks.every((item) => item.pass),
      },
      null,
      2,
    ),
  );

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
console.log('Sample      : #' + result.sampleStudent.id + ' ' + result.sampleStudent.name + ' [' + result.sampleStudent.sourceClassName + ']');
console.log('Summary     : promoted=' + result.summary.promotedStudents + ', graduated=' + result.summary.graduatedStudents);
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
