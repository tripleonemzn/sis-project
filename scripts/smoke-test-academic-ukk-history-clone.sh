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
  bash ./scripts/smoke-test-academic-ukk-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_ukk_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-ukk-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic UKK History Smoke Test =="
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
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');
const { commitAcademicPromotion } = require('./src/services/academicPromotion.service');
const {
  upsertUKKAssessment,
  getUKKAssessment,
  getAssessmentsByExaminer,
} = require('./src/controllers/ukkAssessment.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA UKK History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA UKK History`;
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

async function callHandlerExpectError(handler, req) {
  try {
    await callHandler(handler, req);
    return null;
  } catch (error) {
    return error;
  }
}

async function withMutedConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  console.log = () => undefined;
  console.error = () => undefined;
  console.warn = () => undefined;
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
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

  const sampleStudent = await prisma.user.findFirst({
    where: {
      role: 'STUDENT',
      studentStatus: 'ACTIVE',
      studentClass: {
        academicYearId: sourceYear.id,
        level: 'XII',
      },
    },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      name: true,
      nis: true,
      studentClass: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!sampleStudent?.studentClass) {
    throw new Error('Tidak ada siswa kelas XII aktif yang siap diuji.');
  }

  const [examinerActor, adminActor] = await Promise.all([
    prisma.user.findFirst({
      where: {
        role: { in: ['TEACHER', 'EXAMINER'] },
      },
      orderBy: [{ id: 'asc' }],
      select: { id: true, role: true, name: true },
    }),
    prisma.user.findFirst({
      where: {
        role: { in: ['ADMIN', 'PRINCIPAL'] },
      },
      orderBy: [{ id: 'asc' }],
      select: { id: true, role: true, name: true },
    }),
  ]);

  if (!examinerActor) {
    throw new Error('Penguji untuk smoke test tidak ditemukan.');
  }
  if (!adminActor) {
    throw new Error('Aktor admin/principal untuk promotion smoke test tidak ditemukan.');
  }

  let usPracticeComponent = await prisma.gradeComponent.findFirst({
    where: {
      type: 'US_PRACTICE',
      isActive: true,
    },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      name: true,
      subjectId: true,
      subject: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!usPracticeComponent) {
    const fallbackSubject = await prisma.subject.findFirst({
      orderBy: [{ id: 'asc' }],
      select: { id: true, name: true },
    });
    if (!fallbackSubject) {
      throw new Error('Subject fallback untuk UKK smoke test tidak ditemukan.');
    }
    usPracticeComponent = await prisma.gradeComponent.create({
      data: {
        code: 'UKK_SMOKE',
        name: 'UKK Smoke Component',
        weight: 1,
        isActive: true,
        subjectId: fallbackSubject.id,
        type: 'US_PRACTICE',
        typeCode: 'US_PRACTICE',
      },
      select: {
        id: true,
        name: true,
        subjectId: true,
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  const criteria = [
    {
      id: 'ukk-smoke-criterion',
      name: 'Praktik Utama',
      maxScore: 100,
    },
  ];
  const scores = { 'ukk-smoke-criterion': 88 };
  const checks = [];

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
        },
      },
    },
  });

  const createdAssessment = await withMutedConsole(() =>
    callHandler(upsertUKKAssessment, {
      body: {
        studentId: sampleStudent.id,
        subjectId: usPracticeComponent.subjectId,
        academicYearId: sourceYear.id,
        criteria,
        scores,
        finalScore: 88,
      },
      user: {
        id: examinerActor.id,
        role: examinerActor.role,
      },
    }),
  );

  const invalidTargetYearError = await withMutedConsole(() =>
    callHandlerExpectError(upsertUKKAssessment, {
      body: {
        studentId: sampleStudent.id,
        subjectId: usPracticeComponent.subjectId,
        academicYearId: targetSetup.targetAcademicYear.id,
        criteria,
        scores,
        finalScore: 77,
      },
      user: {
        id: examinerActor.id,
        role: examinerActor.role,
      },
    }),
  );

  const assessmentDetail = await withMutedConsole(() =>
    callHandler(getUKKAssessment, {
      query: {
        studentId: sampleStudent.id,
        subjectId: usPracticeComponent.subjectId,
        academicYearId: sourceYear.id,
      },
    }),
  );

  const examinerAssessments = await withMutedConsole(() =>
    callHandler(getAssessmentsByExaminer, {
      query: {
        academicYearId: sourceYear.id,
      },
      user: {
        id: examinerActor.id,
        role: examinerActor.role,
      },
    }),
  );

  const syncedGrade = await prisma.studentGrade.findFirst({
    where: {
      studentId: sampleStudent.id,
      subjectId: usPracticeComponent.subjectId,
      componentId: usPracticeComponent.id,
      academicYearId: sourceYear.id,
      semester: 'EVEN',
    },
    select: {
      score: true,
    },
  });

  const examinerAssessmentRow = (examinerAssessments?.data || []).find(
    (item) =>
      Number(item.studentId) === Number(sampleStudent.id) &&
      Number(item.subjectId) === Number(usPracticeComponent.subjectId),
  );

  assertCondition(
    checks,
    Number(commitResult.run.id) > 0,
    'Commit promotion source year untuk smoke test berhasil',
    { runId: commitResult.run.id },
  );
  assertCondition(
    checks,
    studentAfterPromotion?.studentStatus === 'GRADUATED',
    'Siswa XII berubah menjadi alumni setelah promotion',
    studentAfterPromotion,
  );
  assertCondition(
    checks,
    studentAfterPromotion?.classId === null,
    'Siswa XII tidak lagi punya classId aktif setelah promotion',
    studentAfterPromotion,
  );
  assertCondition(
    checks,
    Number(createdAssessment?.data?.studentId || 0) === Number(sampleStudent.id),
    'Input UKK source year tetap bisa disimpan setelah siswa menjadi alumni',
    createdAssessment?.data || null,
  );
  assertCondition(
    checks,
    Number(syncedGrade?.score || 0) === 88,
    'Sinkronisasi UKK ke StudentGrade tetap berjalan untuk source year',
    syncedGrade,
  );
  assertCondition(
    checks,
    assessmentDetail?.data?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Detail UKK membaca kelas historis source year',
    assessmentDetail?.data?.student || null,
  );
  assertCondition(
    checks,
    examinerAssessmentRow?.className === sampleStudent.studentClass.name,
    'Daftar assessment examiner membaca className historis source year',
    examinerAssessmentRow || null,
  );
  assertCondition(
    checks,
    String(invalidTargetYearError?.message || '').includes('Siswa tidak valid'),
    'Input UKK untuk target year siswa XII yang sudah lulus ditolak',
    invalidTargetYearError
      ? {
          message: invalidTargetYearError.message,
          statusCode: invalidTargetYearError.statusCode || null,
        }
      : null,
  );

  const failedChecks = checks.filter((item) => !item.pass);

  process.stdout.write(
    JSON.stringify(
      {
        sourceYear,
        targetAcademicYear: targetSetup.targetAcademicYear,
        sampleStudent: {
          id: sampleStudent.id,
          name: sampleStudent.name,
          nis: sampleStudent.nis,
          sourceClassName: sampleStudent.studentClass.name,
        },
        examiner: examinerActor,
        subject: usPracticeComponent.subject,
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
console.log(
  `- Sample student: #${result.sampleStudent.id} ${result.sampleStudent.name} [${result.sampleStudent.sourceClassName}]`,
);
console.log(`- Subject       : ${result.subject?.name || '-'}`);
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
