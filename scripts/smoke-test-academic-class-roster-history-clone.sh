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
  bash ./scripts/smoke-test-academic-class-roster-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_class_roster_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-class-roster-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Class Roster History Smoke Test =="
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
const { getClasses, getClassById, deleteClass } = require('./src/controllers/class.controller');
const { getUsers } = require('./src/controllers/user.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Class Roster History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Class Roster History`;
}

function assertCondition(checks, condition, description, details = undefined) {
  checks.push({
    description,
    pass: Boolean(condition),
    details: details === undefined ? null : details,
  });
}

async function expectAccessFailure(run) {
  try {
    await run();
    return { blocked: false, message: null, statusCode: null };
  } catch (error) {
    return {
      blocked: true,
      message: String(error?.message || error),
      statusCode: Number(error?.statusCode || error?.status || 0) || null,
    };
  }
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

  let sourceClassStudents = null;
  for (const level of ['XII', 'XI', 'X']) {
    const students = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        studentStatus: 'ACTIVE',
        studentClass: {
          academicYearId: sourceYear.id,
          level,
          teacherId: { not: null },
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
            teacherId: true,
          },
        },
      },
    });

    const studentsByClassId = new Map();
    for (const student of students) {
      const classId = Number(student.classId || 0);
      if (!Number.isFinite(classId) || classId <= 0) continue;
      const bucket = studentsByClassId.get(classId) || [];
      bucket.push(student);
      studentsByClassId.set(classId, bucket);
    }

    sourceClassStudents = Array.from(studentsByClassId.values()).find((rows) => rows.length >= 2) || null;
    if (sourceClassStudents) break;
  }

  if (!sourceClassStudents) {
    throw new Error('Tidak ada kelas source year dengan minimal 2 siswa aktif untuk smoke test roster kelas.');
  }

  const sampleStudents = sourceClassStudents.slice(0, 2);
  const sourceClass = sampleStudents[0].studentClass;
  if (!sourceClass?.id || !sourceClass?.teacherId) {
    throw new Error('Kelas sumber smoke test roster kelas tidak valid.');
  }

  const adminActor = await prisma.user.findFirst({
    where: {
      role: { in: ['ADMIN', 'PRINCIPAL'] },
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, role: true, name: true },
  });
  if (!adminActor) {
    throw new Error('Aktor admin smoke test roster kelas tidak ditemukan.');
  }

  const homeroomTeacher = await prisma.user.findUnique({
    where: { id: sourceClass.teacherId },
    select: { id: true, role: true, name: true },
  });
  const unrelatedTeacher = await prisma.user.findFirst({
    where: {
      role: 'TEACHER',
      id: { not: sourceClass.teacherId },
      NOT: {
        additionalDuties: {
          hasSome: ['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM'],
        },
      },
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, role: true, name: true },
  });
  const archiveStaffActor = await prisma.user.findFirst({
    where: {
      role: 'STAFF',
      ptkType: {
        in: ['KEPALA_TU', 'KEPALA_TATA_USAHA', 'STAFF_ADMINISTRASI'],
      },
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, role: true, name: true, ptkType: true },
  });

  if (!homeroomTeacher || !unrelatedTeacher) {
    throw new Error('Aktor wali kelas/unrelated teacher untuk smoke test roster kelas tidak ditemukan.');
  }

  const commitResult = await commitAcademicPromotion({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    activateTargetYear: true,
    actor: adminActor,
  });

  const studentsAfterPromotion = await prisma.user.findMany({
    where: {
      id: { in: sampleStudents.map((student) => student.id) },
    },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
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

  const classesResponse = await callHandler(getClasses, {
    query: {
      academicYearId: String(sourceYear.id),
      search: sourceClass.name,
      page: '1',
      limit: '100',
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const classDetailResponse = await callHandler(getClassById, {
    params: {
      id: String(sourceClass.id),
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });
  const homeroomClassDetailResponse = await callHandler(getClassById, {
    params: {
      id: String(sourceClass.id),
    },
    user: {
      id: homeroomTeacher.id,
      role: homeroomTeacher.role,
    },
  });
  const unrelatedClassDetailAccess = await expectAccessFailure(() =>
    callHandler(getClassById, {
      params: {
        id: String(sourceClass.id),
      },
      user: {
        id: unrelatedTeacher.id,
        role: unrelatedTeacher.role,
      },
    }),
  );

  const usersByClassResponse = await callHandler(getUsers, {
    query: {
      class_id: String(sourceClass.id),
      role: 'STUDENT',
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });
  const staffUsersByClassResponse = archiveStaffActor
    ? await callHandler(getUsers, {
        query: {
          class_id: String(sourceClass.id),
          role: 'STUDENT',
        },
        user: {
          id: archiveStaffActor.id,
          role: archiveStaffActor.role,
        },
      })
    : null;

  const deleteResponse = await expectAccessFailure(() =>
    callHandler(deleteClass, {
      params: {
        id: String(sourceClass.id),
      },
      user: {
        id: adminActor.id,
        role: adminActor.role,
      },
    }),
  );

  const classRows = classesResponse?.data?.classes || [];
  const sourceClassRow = classRows.find((item) => Number(item?.id || 0) === Number(sourceClass.id)) || null;
  const classDetailStudents = classDetailResponse?.data?.students || [];
  const userRows = Array.isArray(usersByClassResponse?.data) ? usersByClassResponse.data : [];
  const checks = [];

  assertCondition(
    checks,
    Number(commitResult.run.id) > 0,
    'Commit promotion source year untuk smoke test roster kelas berhasil',
    { runId: commitResult.run.id, classId: sourceClass.id },
  );
  assertCondition(
    checks,
    sourceClass.level === 'XII'
      ? studentsAfterPromotion.every(
          (student) =>
            String(student.studentStatus || '') === 'GRADUATED' && Number(student.classId || 0) === 0,
        )
      : studentsAfterPromotion.every(
          (student) => Number(student.classId || 0) !== Number(sourceClass.id),
        ),
    sourceClass.level === 'XII'
      ? 'Siswa source class XII benar-benar menjadi alumni setelah promotion'
      : 'Siswa source class benar-benar pindah dari kelas aktif lama setelah promotion',
    studentsAfterPromotion,
  );
  assertCondition(
    checks,
    Number(sourceClassRow?._count?.students || 0) >= sourceClassStudents.length,
    'List classes source year tetap menampilkan jumlah siswa historis yang benar setelah promotion',
    sourceClassRow || null,
  );
  assertCondition(
    checks,
    Array.isArray(classDetailStudents) && classDetailStudents.length >= sourceClassStudents.length,
    'Detail kelas source year tetap memuat roster historis setelah promotion',
    classDetailStudents.slice(0, 5),
  );
  assertCondition(
    checks,
    sampleStudents.every((student) =>
      classDetailStudents.some((row) => Number(row?.id || 0) === Number(student.id)),
    ),
    'Detail kelas source year tetap menampilkan sample siswa historis yang benar',
    classDetailStudents.slice(0, 5),
  );
  assertCondition(
    checks,
    Array.isArray(userRows) && userRows.length >= sourceClassStudents.length,
    'Filter /users?class_id=sourceClass tetap memuat roster historis setelah promotion',
    userRows.slice(0, 5),
  );
  assertCondition(
    checks,
    sampleStudents.every((student) =>
      userRows.some(
        (row) =>
          Number(row?.id || 0) === Number(student.id) &&
          Number(row?.studentClass?.id || 0) === Number(sourceClass.id),
      ),
    ),
    'Filter /users?class_id=sourceClass tetap mengembalikan class historis yang benar',
    userRows.slice(0, 5),
  );
  assertCondition(
    checks,
    Array.isArray(homeroomClassDetailResponse?.data?.students) &&
      homeroomClassDetailResponse.data.students.some((row) => Number(row?.id || 0) === Number(sampleStudents[0].id)),
    'Wali kelas historis tetap boleh membaca roster kelas arsip source year.',
    homeroomClassDetailResponse?.data?.students?.slice(0, 3) || null,
  );
  assertCondition(
    checks,
    unrelatedClassDetailAccess.blocked === true && unrelatedClassDetailAccess.statusCode === 403,
    'Guru yang bukan pemilik historis ditolak saat membuka roster kelas arsip source year.',
    unrelatedClassDetailAccess,
  );
  assertCondition(
    checks,
    archiveStaffActor
      ? Array.isArray(staffUsersByClassResponse?.data) &&
        staffUsersByClassResponse.data.some((row) => Number(row?.id || 0) === Number(sampleStudents[0].id))
      : true,
    archiveStaffActor
      ? 'Staff administrasi/Kepala TU tetap boleh membaca roster siswa arsip source year.'
      : 'Tidak ada aktor staff arsip untuk diverifikasi, smoke test tidak memblokir batch.',
    archiveStaffActor ? staffUsersByClassResponse?.data?.slice(0, 3) || null : null,
  );
  assertCondition(
    checks,
    deleteResponse.blocked === true && Number(deleteResponse?.statusCode || 0) === 403,
    'Delete class source year diblokir karena tahun ajaran sudah menjadi arsip read-only.',
    deleteResponse,
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
        actors: {
          homeroomTeacher,
          unrelatedTeacher,
          archiveStaffActor,
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
