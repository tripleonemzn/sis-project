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
  bash ./scripts/smoke-test-academic-permission-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_permission_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-permission-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Permission/BPBK History Smoke Test =="
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
const { getPermissions } = require('./src/controllers/permission.controller');
const {
  getBpBkSummary,
  getBpBkPermissions,
  getBpBkPrincipalSummary,
} = require('./src/controllers/bpbk.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Permission History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Permission History`;
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
    handler(req, res, reject);
  });
}

(async () => {
  const sourceYear = await pickSourceYear();
  if (!sourceYear) throw new Error('Tahun sumber tidak ditemukan.');

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
      nis: true,
      nisn: true,
      studentClass: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!sampleStudent?.studentClass) {
    throw new Error('Tidak ada siswa X/XI aktif yang siap diuji.');
  }

  const permissionRecord = await prisma.studentPermission.create({
    data: {
      studentId: sampleStudent.id,
      academicYearId: sourceYear.id,
      type: 'PERMISSION',
      startDate: new Date('2026-08-11T00:00:00.000Z'),
      endDate: new Date('2026-08-11T00:00:00.000Z'),
      reason: 'Smoke test izin historis',
      status: 'PENDING',
      approvalNote: null,
      fileUrl: null,
    },
  });

  await prisma.studentBehavior.createMany({
    data: [
      {
        studentId: sampleStudent.id,
        classId: sampleStudent.studentClass.id,
        academicYearId: sourceYear.id,
        date: new Date('2026-08-12T00:00:00.000Z'),
        type: 'NEGATIVE',
        category: 'Smoke Test',
        description: 'Kasus 1',
        point: 10,
      },
      {
        studentId: sampleStudent.id,
        classId: sampleStudent.studentClass.id,
        academicYearId: sourceYear.id,
        date: new Date('2026-08-13T00:00:00.000Z'),
        type: 'NEGATIVE',
        category: 'Smoke Test',
        description: 'Kasus 2',
        point: 10,
      },
      {
        studentId: sampleStudent.id,
        classId: sampleStudent.studentClass.id,
        academicYearId: sourceYear.id,
        date: new Date('2026-08-14T00:00:00.000Z'),
        type: 'NEGATIVE',
        category: 'Smoke Test',
        description: 'Kasus 3',
        point: 10,
      },
    ],
  });

  const baseReq = { user: { id: 1, role: 'ADMIN' } };
  const beforePermissions = await callHandler(getPermissions, {
    ...baseReq,
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
      page: '1',
      limit: '20',
    },
  });
  const beforeBpBkPermissions = await callHandler(getBpBkPermissions, {
    ...baseReq,
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
      page: '1',
      limit: '20',
    },
  });
  const beforeBpBkSummary = await callHandler(getBpBkSummary, {
    ...baseReq,
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
    },
  });
  const beforePrincipalSummary = await callHandler(getBpBkPrincipalSummary, {
    ...baseReq,
    query: {
      academicYearId: String(sourceYear.id),
    },
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
      studentClass: {
        select: {
          id: true,
          name: true,
          academicYearId: true,
        },
      },
    },
  });

  const afterPermissions = await callHandler(getPermissions, {
    ...baseReq,
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
      page: '1',
      limit: '20',
    },
  });
  const afterBpBkPermissions = await callHandler(getBpBkPermissions, {
    ...baseReq,
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
      page: '1',
      limit: '20',
    },
  });
  const afterBpBkSummary = await callHandler(getBpBkSummary, {
    ...baseReq,
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
    },
  });
  const afterPrincipalSummary = await callHandler(getBpBkPrincipalSummary, {
    ...baseReq,
    query: {
      academicYearId: String(sourceYear.id),
    },
  });

  const beforePermissionsRows = beforePermissions.data?.permissions || [];
  const afterPermissionsRows = afterPermissions.data?.permissions || [];
  const beforeBpBkPermissionRows = beforeBpBkPermissions.data?.permissions || [];
  const afterBpBkPermissionRows = afterBpBkPermissions.data?.permissions || [];
  const beforeRecentPermissions = beforeBpBkSummary.data?.recentPermissions || [];
  const afterRecentPermissions = afterBpBkSummary.data?.recentPermissions || [];
  const beforeHighRiskStudents = beforePrincipalSummary.data?.highRiskStudents || [];
  const afterHighRiskStudents = afterPrincipalSummary.data?.highRiskStudents || [];

  const beforePermissionRow = beforePermissionsRows.find((item) => item.id === permissionRecord.id) || null;
  const afterPermissionRow = afterPermissionsRows.find((item) => item.id === permissionRecord.id) || null;
  const beforeBpBkPermissionRow = beforeBpBkPermissionRows.find((item) => item.id === permissionRecord.id) || null;
  const afterBpBkPermissionRow = afterBpBkPermissionRows.find((item) => item.id === permissionRecord.id) || null;
  const beforeRecentPermissionRow = beforeRecentPermissions.find((item) => item.id === permissionRecord.id) || null;
  const afterRecentPermissionRow = afterRecentPermissions.find((item) => item.id === permissionRecord.id) || null;
  const beforeHighRiskRow = beforeHighRiskStudents.find((item) => item.studentId === sampleStudent.id) || null;
  const afterHighRiskRow = afterHighRiskStudents.find((item) => item.studentId === sampleStudent.id) || null;

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
    'Siswa sampel benar-benar pindah kelas aktif setelah promotion.',
    {
      beforeClassId: sampleStudent.studentClass.id,
      afterClassId: promotedStudent?.classId || null,
      afterClassName: promotedStudent?.studentClass?.name || null,
    },
  );
  assertCondition(
    checks,
    beforePermissionRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Endpoint /permissions memakai kelas historis source year sebelum promotion.',
    beforePermissionRow,
  );
  assertCondition(
    checks,
    afterPermissionRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Endpoint /permissions tetap memakai kelas historis source year setelah promotion.',
    afterPermissionRow,
  );
  assertCondition(
    checks,
    beforeBpBkPermissionRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'BP/BK permissions memakai kelas historis source year sebelum promotion.',
    beforeBpBkPermissionRow,
  );
  assertCondition(
    checks,
    afterBpBkPermissionRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'BP/BK permissions tetap memakai kelas historis source year setelah promotion.',
    afterBpBkPermissionRow,
  );
  assertCondition(
    checks,
    beforeRecentPermissionRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Ringkasan BP/BK recent permissions memakai kelas historis sebelum promotion.',
    beforeRecentPermissionRow,
  );
  assertCondition(
    checks,
    afterRecentPermissionRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Ringkasan BP/BK recent permissions tetap memakai kelas historis setelah promotion.',
    afterRecentPermissionRow,
  );
  assertCondition(
    checks,
    beforeHighRiskRow?.className === sampleStudent.studentClass.name,
    'Principal BP/BK high risk memakai kelas historis sebelum promotion.',
    beforeHighRiskRow,
  );
  assertCondition(
    checks,
    afterHighRiskRow?.className === sampleStudent.studentClass.name,
    'Principal BP/BK high risk tetap memakai kelas historis setelah promotion.',
    afterHighRiskRow,
  );
  assertCondition(
    checks,
    Number(afterBpBkSummary.data?.summary?.pendingPermissions || 0) >= 1,
    'Ringkasan BP/BK class filter source year masih menghitung permission historis setelah promotion.',
    afterBpBkSummary.data?.summary || null,
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
