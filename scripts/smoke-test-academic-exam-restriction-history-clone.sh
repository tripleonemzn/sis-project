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
  bash ./scripts/smoke-test-academic-exam-restriction-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_exam_restriction_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-exam-restriction-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Exam Restriction History Smoke Test =="
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
  getExamRestrictions,
  updateExamRestriction,
} = require('./src/controllers/exam.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Exam Restriction History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Exam Restriction History`;
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

  const candidateStudents = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      studentStatus: 'ACTIVE',
      studentClass: {
        academicYearId: sourceYear.id,
        level: 'X',
      },
    },
    orderBy: [{ classId: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      nis: true,
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

  const studentsByClassId = new Map();
  for (const student of candidateStudents) {
    const classId = Number(student.classId || 0);
    if (!Number.isFinite(classId) || classId <= 0) continue;
    const bucket = studentsByClassId.get(classId) || [];
    bucket.push(student);
    studentsByClassId.set(classId, bucket);
  }

  const sourceClassStudents =
    Array.from(studentsByClassId.values()).find((rows) => rows.length >= 2) || null;
  if (!sourceClassStudents) {
    throw new Error('Tidak ada kelas X dengan minimal 2 siswa aktif untuk smoke test exam restriction.');
  }

  const sampleStudents = sourceClassStudents.slice(0, 2);
  const sourceClass = sampleStudents[0].studentClass;
  if (!sourceClass?.id) {
    throw new Error('Kelas sumber smoke test exam restriction tidak valid.');
  }

  const adminActor = await prisma.user.findFirst({
    where: {
      role: { in: ['ADMIN', 'PRINCIPAL', 'TEACHER'] },
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, role: true, name: true },
  });
  if (!adminActor) {
    throw new Error('Aktor admin/guru smoke test exam restriction tidak ditemukan.');
  }

  const programCode = `QA_RESTRICTION_X_${Date.now()}`;
  await prisma.examProgramConfig.create({
    data: {
      academicYearId: sourceYear.id,
      code: programCode,
      baseType: 'SAS',
      baseTypeCode: 'SAS',
      displayLabel: 'QA Restriction X Only',
      shortLabel: 'QA-RESTR-X',
      description: 'Synthetic program config for exam restriction history smoke test',
      fixedSemester: 'ODD',
      displayOrder: 998,
      targetClassLevels: ['X'],
      isActive: true,
    },
  });

  const commitResult = await commitAcademicPromotion({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    activateTargetYear: false,
    actor: adminActor,
  });

  const studentsAfterPromotion = await prisma.user.findMany({
    where: {
      id: { in: sampleStudents.map((student) => student.id) },
    },
    select: {
      id: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          level: true,
        },
      },
    },
    orderBy: [{ id: 'asc' }],
  });

  const initialRestrictions = await callHandler(getExamRestrictions, {
    query: {
      classId: String(sourceClass.id),
      academicYearId: String(sourceYear.id),
      semester: 'ODD',
      programCode,
      page: '1',
      limit: '10',
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const updatedRestriction = await callHandler(updateExamRestriction, {
    body: {
      studentId: sampleStudents[0].id,
      academicYearId: sourceYear.id,
      semester: 'ODD',
      programCode,
      isBlocked: true,
      reason: 'Smoke test manual restriction',
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const searchRestrictions = await callHandler(getExamRestrictions, {
    query: {
      classId: String(sourceClass.id),
      academicYearId: String(sourceYear.id),
      semester: 'ODD',
      programCode,
      page: '1',
      limit: '10',
      search: sampleStudents[0].name,
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const persistedRestriction = await prisma.studentExamProgramRestriction.findUnique({
    where: {
      studentId_academicYearId_semester_programCode: {
        studentId: sampleStudents[0].id,
        academicYearId: sourceYear.id,
        semester: 'ODD',
        programCode,
      },
    },
    select: {
      studentId: true,
      academicYearId: true,
      programCode: true,
      isBlocked: true,
      reason: true,
    },
  });

  const restrictionRows = initialRestrictions?.data?.restrictions || [];
  const searchRows = searchRestrictions?.data?.restrictions || [];
  const initialMeta = initialRestrictions?.data?.meta || {};
  const checks = [];

  assertCondition(
    checks,
    Number(commitResult.run.id) > 0,
    'Commit promotion source year untuk smoke test exam restriction berhasil',
    { runId: commitResult.run.id, classId: sourceClass.id },
  );
  assertCondition(
    checks,
    studentsAfterPromotion.every(
      (student) =>
        Number(student.classId || 0) !== Number(sourceClass.id) && String(student.studentClass?.level || '') === 'XI',
    ),
    'Siswa kelas X benar-benar naik ke tingkat XI setelah promotion',
    studentsAfterPromotion,
  );
  assertCondition(
    checks,
    Array.isArray(restrictionRows) && restrictionRows.length >= 2,
    'Daftar exam restriction source year tetap memuat siswa historis setelah promotion',
    restrictionRows,
  );
  assertCondition(
    checks,
    Number(initialMeta.total || 0) >= 2,
    'Meta total exam restriction source year tetap menghitung siswa historis dengan benar',
    initialMeta,
  );
  assertCondition(
    checks,
    restrictionRows.some((row) => Number(row?.student?.id || 0) === Number(sampleStudents[0].id)) &&
      restrictionRows.some((row) => Number(row?.student?.id || 0) === Number(sampleStudents[1].id)),
    'Daftar exam restriction source year tetap menampilkan sample siswa historis yang benar',
    restrictionRows.map((row) => row?.student || null),
  );
  assertCondition(
    checks,
    Boolean(updatedRestriction?.success) && Boolean(persistedRestriction?.isBlocked),
    'Update manual exam restriction source year tetap berhasil setelah promotion',
    updatedRestriction?.data || persistedRestriction || null,
  );
  assertCondition(
    checks,
    String(persistedRestriction?.reason || '') === 'Smoke test manual restriction',
    'Reason manual exam restriction source year tersimpan dengan benar',
    persistedRestriction,
  );
  assertCondition(
    checks,
    Array.isArray(searchRows) &&
      searchRows.length >= 1 &&
      Number(searchRows[0]?.student?.id || 0) === Number(sampleStudents[0].id),
    'Search exam restriction source year tetap bekerja pada roster historis',
    searchRows,
  );
  assertCondition(
    checks,
    Boolean(searchRows[0]?.manualBlocked),
    'Hasil search restriction source year menampilkan manualBlocked yang baru disimpan',
    searchRows[0] || null,
  );

  const failedChecks = checks.filter((item) => !item.pass);

  process.stdout.write(
    JSON.stringify(
      {
        sourceYear,
        targetAcademicYear: targetSetup.targetAcademicYear,
        sourceClass: {
          id: sourceClass.id,
          name: sourceClass.name,
          level: sourceClass.level,
        },
        sampleStudents: sampleStudents.map((student) => ({
          id: student.id,
          name: student.name,
          nis: student.nis,
        })),
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
console.log(
  `- Sample student: #${result.sampleStudents[0].id} ${result.sampleStudents[0].name} & #${result.sampleStudents[1].id} ${result.sampleStudents[1].name}`,
);
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
