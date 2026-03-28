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
  bash ./scripts/smoke-test-academic-report-archive-access-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_report_archive_access_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-report-archive-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Report Archive Access Smoke Test =="
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
const {
  getAcademicPromotionWorkspace,
  saveAcademicPromotionMappings,
  commitAcademicPromotion,
} = require('./src/services/academicPromotion.service');
const {
  ensureAcademicYearArchiveReadAccess,
  resolveAcademicYearArchiveEnvelope,
} = require('./src/utils/academicYearArchiveAccess');
const { listHistoricalStudentsForClass } = require('./src/utils/studentAcademicHistory');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Report Archive Access ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Report Archive Access`;
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
    return { blocked: false, message: null };
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
      reportDates: false,
      subjectKkms: false,
      examGradeComponents: false,
      examProgramConfigs: false,
      examProgramSessions: false,
      scheduleTimeConfig: false,
      academicEvents: false,
    },
    actor: null,
  });

  const sourceClass = await prisma.class.findFirst({
    where: {
      academicYearId: sourceYear.id,
      teacherId: { not: null },
    },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      teacherId: true,
      teacher: {
        select: {
          id: true,
          name: true,
          additionalDuties: true,
        },
      },
    },
  });

  const historicalStudents = sourceClass
    ? await listHistoricalStudentsForClass(sourceClass.id, sourceYear.id)
    : [];

  if (!sourceClass?.teacherId || !historicalStudents.length) {
    throw new Error('Tidak ada kelas sumber dengan wali kelas dan siswa yang siap diuji.');
  }

  const sampleStudentId = historicalStudents[0].id;

  const unrelatedTeacher =
    (await prisma.user.findFirst({
      where: {
        role: 'TEACHER',
        id: { not: sourceClass.teacherId },
        NOT: {
          additionalDuties: {
            hasSome: ['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM'],
          },
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, additionalDuties: true },
    })) ||
    (await prisma.user.findFirst({
      where: {
        role: 'TEACHER',
        id: { not: sourceClass.teacherId },
      },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, additionalDuties: true },
    }));

  const curriculumTeacher = await prisma.user.findFirst({
    where: {
      role: 'TEACHER',
      additionalDuties: {
        hasSome: ['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM'],
      },
    },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, additionalDuties: true },
  });

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  });
  if (!admin) {
    throw new Error('User admin tidak ditemukan pada clone DB.');
  }

  const workspace = await getAcademicPromotionWorkspace(sourceYear.id, targetSetup.targetAcademicYear.id);
  const mappings = workspace.classes
    .filter((item) => item.action === 'PROMOTE')
    .map((item) => ({
      sourceClassId: item.sourceClassId,
      targetClassId: item.targetClassId ?? item.suggestedTargetClassId ?? null,
    }));

  await saveAcademicPromotionMappings({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    mappings,
  });

  await commitAcademicPromotion({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    activateTargetYear: true,
    actor: { id: admin.id },
  });

  const archiveEnvelope = await resolveAcademicYearArchiveEnvelope(sourceYear.id);
  const checks = [];

  assertCondition(checks, archiveEnvelope.stage === 'ARCHIVED', 'Source year berubah menjadi arsip setelah target diaktifkan.', {
    stage: archiveEnvelope.stage,
    sourceAcademicYearId: sourceYear.id,
  });

  const homeroomClassAccess = await ensureAcademicYearArchiveReadAccess({
    actorId: sourceClass.teacherId,
    actorRole: 'TEACHER',
    academicYearId: sourceYear.id,
    module: 'REPORTS',
    classId: sourceClass.id,
  });
  assertCondition(checks, homeroomClassAccess.grantedBy === 'HISTORICAL_HOMEROOM', 'Wali kelas historis boleh mengakses arsip report per kelas.', homeroomClassAccess);

  const homeroomStudentAccess = await ensureAcademicYearArchiveReadAccess({
    actorId: sourceClass.teacherId,
    actorRole: 'TEACHER',
    academicYearId: sourceYear.id,
    module: 'REPORTS',
    studentId: sampleStudentId,
  });
  assertCondition(checks, homeroomStudentAccess.grantedBy === 'HISTORICAL_HOMEROOM', 'Wali kelas historis boleh mengakses arsip report per siswa.', homeroomStudentAccess);

  if (unrelatedTeacher) {
    const unrelatedClassDenied = await expectAccessFailure(() =>
      ensureAcademicYearArchiveReadAccess({
        actorId: unrelatedTeacher.id,
        actorRole: 'TEACHER',
        academicYearId: sourceYear.id,
        module: 'REPORTS',
        classId: sourceClass.id,
      }),
    );
    assertCondition(
      checks,
      unrelatedClassDenied.blocked && unrelatedClassDenied.statusCode === 403,
      'Guru yang bukan pemilik historis tertolak saat membuka arsip report kelas.',
      unrelatedClassDenied,
    );

    const unrelatedStudentDenied = await expectAccessFailure(() =>
      ensureAcademicYearArchiveReadAccess({
        actorId: unrelatedTeacher.id,
        actorRole: 'TEACHER',
        academicYearId: sourceYear.id,
        module: 'REPORTS',
        studentId: sampleStudentId,
      }),
    );
    assertCondition(
      checks,
      unrelatedStudentDenied.blocked && unrelatedStudentDenied.statusCode === 403,
      'Guru yang bukan pemilik historis tertolak saat membuka arsip report siswa.',
      unrelatedStudentDenied,
    );
  } else {
    assertCondition(checks, true, 'Skip guru non-owner karena tidak ditemukan pada dataset clone.', null);
    assertCondition(checks, true, 'Skip guru non-owner per siswa karena tidak ditemukan pada dataset clone.', null);
  }

  if (curriculumTeacher) {
    const curriculumAccess = await ensureAcademicYearArchiveReadAccess({
      actorId: curriculumTeacher.id,
      actorRole: 'TEACHER',
      academicYearId: sourceYear.id,
      module: 'REPORTS',
      classId: sourceClass.id,
    });
    assertCondition(checks, curriculumAccess.grantedBy === 'DUTY', 'Pejabat kurikulum tetap boleh membuka arsip report lintas kelas.', curriculumAccess);
  } else {
    assertCondition(checks, true, 'Skip pejabat kurikulum karena belum ada user bertugas pada dataset clone.', null);
  }

  const failedChecks = checks.filter((item) => !item.pass);
  const payload = {
    sourceAcademicYear: sourceYear,
    targetAcademicYear: targetSetup.targetAcademicYear,
    sampleClass: {
      id: sourceClass.id,
      name: sourceClass.name,
    },
    sampleStudentId,
    actors: {
      homeroomTeacher: sourceClass.teacher,
      unrelatedTeacher,
      curriculumTeacher,
    },
    checks,
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.length - failedChecks.length,
      failedChecks: failedChecks.length,
    },
  };

  console.log(JSON.stringify(payload, null, 2));
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

echo "== Result =="
RESULT_JSON_PATH="$RESULT_JSON" node <<'NODE'
const fs = require('fs');
const path = process.env.RESULT_JSON_PATH;
const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
console.log(`Source Year     : ${payload.sourceAcademicYear.name} (#${payload.sourceAcademicYear.id})`);
console.log(`Target Year     : ${payload.targetAcademicYear.name} (#${payload.targetAcademicYear.id})`);
console.log(`Sample Class    : ${payload.sampleClass.name} (#${payload.sampleClass.id})`);
console.log(`Sample Student  : #${payload.sampleStudentId}`);
console.log(`Checks          : ${payload.summary.passedChecks}/${payload.summary.totalChecks} PASS`);
payload.checks.forEach((item) => {
  console.log(` - ${item.pass ? 'PASS' : 'FAIL'}: ${item.description}`);
});
NODE
