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
  bash ./scripts/smoke-test-academic-grade-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_grade_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-grade-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Grade History Smoke Test =="
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
const { Semester, GradeComponentType } = require('@prisma/client');
const {
  createAcademicYearRolloverTarget,
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');
const { commitAcademicPromotion } = require('./src/services/academicPromotion.service');
const {
  createOrUpdateStudentGrade,
  bulkCreateOrUpdateStudentGrades,
  getStudentGrades,
  generateReportGrades,
  getReportGrades,
  updateReportGrade,
  getStudentReportCard,
} = require('./src/controllers/grade.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Grade History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Grade History`;
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

async function callHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve(payload);
        return this;
      },
    };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

async function withMutedConsole(callback) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = (...args) => {
    const firstArg = String(args?.[0] || '');
    if (
      firstArg.includes('Failed to sync report grade') ||
      firstArg.includes('Failed to sync student') ||
      firstArg.includes('[LazySync]')
    ) {
      return;
    }
    originalError(...args);
  };
  try {
    return await callback();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function pickGradeContext(sourceYearId) {
  for (const level of ['XII', 'XI', 'X']) {
    const assignments = await prisma.teacherAssignment.findMany({
      where: {
        academicYearId: sourceYearId,
        teacher: {
          role: 'TEACHER',
        },
        class: {
          level,
        },
      },
      orderBy: [{ id: 'asc' }],
      take: 25,
      select: {
        id: true,
        teacherId: true,
        subjectId: true,
        classId: true,
        kkm: true,
        teacher: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
      },
    });

    for (const assignment of assignments) {
      const student = await prisma.user.findFirst({
        where: {
          role: 'STUDENT',
          studentStatus: 'ACTIVE',
          classId: assignment.classId,
        },
        orderBy: [{ id: 'asc' }],
        select: {
          id: true,
          name: true,
          nis: true,
          role: true,
          classId: true,
          studentStatus: true,
          studentClass: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
        },
      });

      if (student?.studentClass?.id) {
        return {
          assignment,
          student,
        };
      }
    }
  }

  return null;
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

  const gradeContext = await pickGradeContext(sourceYear.id);
  if (!gradeContext) {
    throw new Error('Teacher assignment + siswa sample untuk smoke test grade tidak ditemukan.');
  }

  const { assignment, student: sampleStudent } = gradeContext;
  const sourceClass = assignment.class;
  const teacherActor = assignment.teacher;

  const adminActor = await prisma.user.findFirst({
    where: {
      role: { in: ['ADMIN', 'PRINCIPAL', 'TEACHER'] },
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, role: true, name: true },
  });
  if (!adminActor) {
    throw new Error('Aktor admin untuk smoke test grade tidak ditemukan.');
  }

  let gradeComponent = await prisma.gradeComponent.findFirst({
    where: {
      subjectId: assignment.subjectId,
      isActive: true,
    },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      subjectId: true,
      type: true,
      typeCode: true,
    },
  });

  if (!gradeComponent) {
    gradeComponent = await prisma.gradeComponent.create({
      data: {
        code: `QA_GRADE_SMOKE_${Date.now()}`,
        name: 'QA Grade Smoke Component',
        subjectId: assignment.subjectId,
        type: GradeComponentType.FORMATIVE,
        typeCode: 'FORMATIF',
        weight: 1,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        subjectId: true,
        type: true,
        typeCode: true,
      },
    });
  }

  const commitResult = await commitAcademicPromotion({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    activateTargetYear: false,
    actor: adminActor,
  });

  const studentAfterPromotion = await prisma.user.findUnique({
    where: { id: sampleStudent.id },
    select: {
      id: true,
      studentStatus: true,
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

  const singleSave = await withMutedConsole(() =>
    callHandler(createOrUpdateStudentGrade, {
      body: {
        student_id: sampleStudent.id,
        subject_id: assignment.subjectId,
        academic_year_id: sourceYear.id,
        grade_component_id: gradeComponent.id,
        semester: Semester.ODD,
        score: 81,
      },
      user: {
        id: teacherActor.id,
        role: teacherActor.role,
      },
    }),
  );

  const bulkSave = await withMutedConsole(() =>
    callHandler(bulkCreateOrUpdateStudentGrades, {
      body: {
        grades: [
          {
            student_id: sampleStudent.id,
            subject_id: assignment.subjectId,
            academic_year_id: sourceYear.id,
            grade_component_id: gradeComponent.id,
            semester: Semester.ODD,
            score: 84,
          },
        ],
      },
      user: {
        id: teacherActor.id,
        role: teacherActor.role,
      },
    }),
  );

  const studentGradesResponse = await withMutedConsole(() =>
    callHandler(getStudentGrades, {
      query: {
        class_id: String(sourceClass.id),
        subject_id: String(assignment.subjectId),
        academic_year_id: String(sourceYear.id),
        semester: Semester.ODD,
      },
      user: {
        id: teacherActor.id,
        role: teacherActor.role,
      },
    }),
  );

  const generatedReportGrades = await withMutedConsole(() =>
    callHandler(generateReportGrades, {
      body: {
        student_id: sampleStudent.id,
        academic_year_id: sourceYear.id,
        semester: Semester.ODD,
      },
      user: {
        id: teacherActor.id,
        role: teacherActor.role,
      },
    }),
  );

  const reportGradesResponse = await withMutedConsole(() =>
    callHandler(getReportGrades, {
      query: {
        class_id: String(sourceClass.id),
        subject_id: String(assignment.subjectId),
        academic_year_id: String(sourceYear.id),
        semester: Semester.ODD,
      },
      user: {
        id: teacherActor.id,
        role: teacherActor.role,
      },
    }),
  );

  const persistedReportGrade = await prisma.reportGrade.findFirst({
    where: {
      studentId: sampleStudent.id,
      subjectId: assignment.subjectId,
      academicYearId: sourceYear.id,
      semester: Semester.ODD,
    },
    orderBy: [{ id: 'desc' }],
    select: {
      id: true,
      predicate: true,
      finalScore: true,
      slotScores: true,
    },
  });

  if (!persistedReportGrade) {
    throw new Error('Report grade source year tidak berhasil dibuat untuk smoke test.');
  }

  const updatedReportGrade = await withMutedConsole(() =>
    callHandler(updateReportGrade, {
      params: {
        id: String(persistedReportGrade.id),
      },
      body: {
        slot_scores: {
          FORMATIF: 85,
        },
      },
      user: {
        id: teacherActor.id,
        role: teacherActor.role,
      },
    }),
  );

  const reportCardResponse = await withMutedConsole(() =>
    callHandler(getStudentReportCard, {
      query: {
        student_id: String(sampleStudent.id),
        academic_year_id: String(sourceYear.id),
        semester: Semester.ODD,
      },
      user: {
        id: sampleStudent.id,
        role: sampleStudent.role,
      },
    }),
  );

  const studentGradeRows = Array.isArray(studentGradesResponse?.data) ? studentGradesResponse.data : [];
  const sampleStudentGradeRow =
    studentGradeRows.find(
      (row) =>
        Number(row?.studentId || 0) === Number(sampleStudent.id) &&
        Number(row?.subjectId || 0) === Number(assignment.subjectId),
    ) || null;

  const reportGradeRows = Array.isArray(reportGradesResponse?.data) ? reportGradesResponse.data : [];
  const sampleReportGradeRow =
    reportGradeRows.find(
      (row) =>
        Number(row?.studentId || 0) === Number(sampleStudent.id) &&
        Number(row?.subjectId || 0) === Number(assignment.subjectId),
    ) || null;

  const expectedPromotedLevel =
    sourceClass.level === 'X'
      ? 'XI'
      : sourceClass.level === 'XI'
        ? 'XII'
        : null;

  const checks = [];

  assertCondition(
    checks,
    Number(commitResult.run.id) > 0,
    'Commit promotion source year untuk smoke test grade berhasil',
    { runId: commitResult.run.id, sourceClass: sourceClass.name },
  );
  assertCondition(
    checks,
    sourceClass.level === 'XII'
      ? String(studentAfterPromotion?.studentStatus || '') === 'GRADUATED' &&
          Number(studentAfterPromotion?.classId || 0) === 0
      : Number(studentAfterPromotion?.classId || 0) !== Number(sourceClass.id) &&
          String(studentAfterPromotion?.studentClass?.level || '') === expectedPromotedLevel,
    sourceClass.level === 'XII'
      ? 'Siswa XII benar-benar menjadi alumni setelah promotion'
      : `Siswa ${sourceClass.level} benar-benar pindah ke tingkat ${expectedPromotedLevel} setelah promotion`,
    studentAfterPromotion,
  );
  assertCondition(
    checks,
    Boolean(singleSave?.success) && Number(singleSave?.data?.student?.id || 0) === Number(sampleStudent.id),
    'Simpan nilai tunggal source year tetap berhasil setelah promotion',
    singleSave?.data || null,
  );
  assertCondition(
    checks,
    Boolean(bulkSave?.success) && Number(bulkSave?.data?.success || 0) >= 1,
    'Bulk save nilai source year tetap berhasil setelah promotion',
    bulkSave?.data || null,
  );
  assertCondition(
    checks,
    Array.isArray(studentGradeRows) && studentGradeRows.length >= 1,
    'Daftar student grades source year tetap terisi setelah promotion',
    studentGradeRows.slice(0, 3),
  );
  assertCondition(
    checks,
    Number(sampleStudentGradeRow?.student?.classId || 0) === Number(sourceClass.id),
    'Student grades source year tetap menempel ke class historis yang benar',
    sampleStudentGradeRow?.student || null,
  );
  assertCondition(
    checks,
    Boolean(generatedReportGrades?.success) && Array.isArray(generatedReportGrades?.data) && generatedReportGrades.data.length >= 1,
    'Generate report grades source year tetap berhasil setelah promotion',
    generatedReportGrades?.data || null,
  );
  assertCondition(
    checks,
    Array.isArray(reportGradeRows) && reportGradeRows.length >= 1,
    'Daftar report grades source year tetap terisi setelah promotion',
    reportGradeRows.slice(0, 3),
  );
  assertCondition(
    checks,
    Number(sampleReportGradeRow?.student?.studentClass?.id || 0) === Number(sourceClass.id),
    'Report grades source year tetap menampilkan class historis yang benar',
    sampleReportGradeRow?.student || null,
  );
  assertCondition(
    checks,
    Boolean(updatedReportGrade?.success) &&
      Number(updatedReportGrade?.data?.id || 0) === Number(persistedReportGrade.id),
    'Update report grade source year tetap berhasil setelah promotion',
    updatedReportGrade?.data || null,
  );
  assertCondition(
    checks,
    Number(reportCardResponse?.data?.student?.studentClass?.id || 0) === Number(sourceClass.id),
    'Report card source year tetap menampilkan class historis yang benar',
    reportCardResponse?.data?.student || null,
  );
  assertCondition(
    checks,
    reportCardResponse?.data?.attendanceSummary &&
      typeof reportCardResponse.data.attendanceSummary === 'object',
    'Report card source year tetap mengembalikan attendance summary',
    reportCardResponse?.data?.attendanceSummary || null,
  );

  const failedChecks = checks.filter((item) => !item.pass);

  process.stdout.write(
    JSON.stringify(
      {
        sourceYear,
        targetAcademicYear: targetSetup.targetAcademicYear,
        teacher: {
          id: teacherActor.id,
          name: teacherActor.name,
        },
        subject: assignment.subject,
        sourceClass,
        sampleStudent: {
          id: sampleStudent.id,
          name: sampleStudent.name,
          nis: sampleStudent.nis,
        },
        summary: {
          totalChecks: checks.length,
          passedChecks: checks.length - failedChecks.length,
          failedChecks: failedChecks.length,
        },
        checks,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
})().catch(async (error) => {
  try {
    await prisma.$disconnect();
  } catch (disconnectError) {
    console.error('Failed to disconnect prisma:', disconnectError);
  }
  console.error(error);
  process.exit(1);
});
NODE

node - "$RESULT_JSON" <<'NODE'
const fs = require('fs');
const resultPath = process.argv[2];
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
const total = result.summary.totalChecks;
const passed = result.summary.passedChecks;
const failed = result.summary.failedChecks;

console.log('Smoke test summary');
console.log(`- Source year   : ${result.sourceYear.id} (${result.sourceYear.name})`);
console.log(`- Target year   : ${result.targetAcademicYear.id} (${result.targetAcademicYear.name})`);
console.log(`- Source class  : ${result.sourceClass.name}`);
console.log(`- Subject       : ${result.subject.name}`);
console.log(`- Sample student: #${result.sampleStudent.id} ${result.sampleStudent.name}`);
console.log(`- Checks        : ${passed}/${total} PASS`);

if (failed > 0) {
  console.log('');
  console.log('Failed checks:');
  for (const check of result.checks.filter((item) => !item.pass)) {
    console.log(`- ${check.description}`);
    if (check.details) {
      console.log(`  details: ${JSON.stringify(check.details)}`);
    }
  }
  process.exit(1);
}
NODE
