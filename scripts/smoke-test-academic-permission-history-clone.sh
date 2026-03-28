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

echo "== Academic Permission/BPBK/Office History Smoke Test =="
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
const { getPermissions, updatePermissionStatus } = require('./src/controllers/permission.controller');
const { createBehavior } = require('./src/controllers/behavior.controller');
const {
  createBpBkCounseling,
  getBpBkSummary,
  getBpBkPermissions,
  getBpBkPrincipalSummary,
  updateBpBkCounseling,
} = require('./src/controllers/bpbk.controller');
const { getAdministrationSummary } = require('./src/controllers/office.controller');

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
        teacherId: { not: null },
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
          teacherId: true,
        },
      },
    },
  });

  if (!sampleStudent?.studentClass?.teacherId) {
    throw new Error('Tidak ada siswa X/XI aktif dengan wali kelas yang siap diuji.');
  }

  const adminActor =
    (await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, role: true },
      orderBy: [{ id: 'asc' }],
    })) ||
    (await prisma.user.findFirst({
      where: { role: 'PRINCIPAL' },
      select: { id: true, role: true },
      orderBy: [{ id: 'asc' }],
    }));

  if (!adminActor) {
    throw new Error('Aktor admin/principal untuk smoke test tidak ditemukan.');
  }

  const homeroomTeacher = await prisma.user.findUnique({
    where: { id: sampleStudent.studentClass.teacherId },
    select: { id: true, role: true, name: true, additionalDuties: true },
  });
  const unrelatedTeacher = await prisma.user.findFirst({
    where: {
      role: 'TEACHER',
      id: { not: sampleStudent.studentClass.teacherId },
      NOT: {
        additionalDuties: {
          hasSome: ['BP_BK', 'WAKASEK_KESISWAAN', 'SEKRETARIS_KESISWAAN'],
        },
      },
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, role: true, name: true, additionalDuties: true },
  });
  const bpbkTeacher = await prisma.user.findFirst({
    where: {
      role: 'TEACHER',
      additionalDuties: {
        has: 'BP_BK',
      },
    },
    orderBy: [{ id: 'asc' }],
    select: { id: true, role: true, name: true, additionalDuties: true },
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
    throw new Error('Aktor wali kelas/unrelated teacher untuk smoke test izin tidak ditemukan.');
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
  const counselingBehavior = await prisma.studentBehavior.create({
    data: {
      studentId: sampleStudent.id,
      classId: sampleStudent.studentClass.id,
      academicYearId: sourceYear.id,
      date: new Date('2026-08-15T00:00:00.000Z'),
      type: 'NEGATIVE',
      category: 'Smoke Test',
      description: 'Kasus konseling arsip',
      point: 5,
    },
  });
  const existingCounseling = await prisma.bpBkCounseling.create({
    data: {
      classId: sampleStudent.studentClass.id,
      studentId: sampleStudent.id,
      academicYearId: sourceYear.id,
      counselorId: adminActor.id,
      behaviorId: counselingBehavior.id,
      sessionDate: new Date('2026-08-16T00:00:00.000Z'),
      issueSummary: 'Konseling sebelum arsip',
      counselingNote: 'Catatan awal',
      followUpPlan: 'Monitoring',
      summonParent: false,
      status: 'OPEN',
    },
  });

  const baseReq = { user: { id: adminActor.id, role: adminActor.role } };
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
  const beforeAdministrationSummary = await callHandler(getAdministrationSummary, {
    ...baseReq,
    query: {
      academicYearId: String(sourceYear.id),
    },
  });

  const commitResult = await commitAcademicPromotion({
    sourceAcademicYearId: sourceYear.id,
    targetAcademicYearId: targetSetup.targetAcademicYear.id,
    activateTargetYear: true,
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
  const afterAdministrationSummary = await callHandler(getAdministrationSummary, {
    ...baseReq,
    query: {
      academicYearId: String(sourceYear.id),
    },
  });
  const archivedHomeroomPermissions = await callHandler(getPermissions, {
    user: { id: homeroomTeacher.id, role: homeroomTeacher.role },
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
      page: '1',
      limit: '20',
    },
  });
  const archivedUnrelatedPermissionAccess = await expectAccessFailure(() =>
    callHandler(getPermissions, {
      user: { id: unrelatedTeacher.id, role: unrelatedTeacher.role },
      query: {
        classId: String(sampleStudent.studentClass.id),
        academicYearId: String(sourceYear.id),
        page: '1',
        limit: '20',
      },
    }),
  );
  const archivedBpbkSummaryByDuty = await callHandler(getBpBkSummary, {
    user: {
      id: (bpbkTeacher || adminActor).id,
      role: (bpbkTeacher || adminActor).role,
    },
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
    },
  });
  const archivedUnrelatedBpBkAccess = await expectAccessFailure(() =>
    callHandler(getBpBkSummary, {
      user: { id: unrelatedTeacher.id, role: unrelatedTeacher.role },
      query: {
        classId: String(sampleStudent.studentClass.id),
        academicYearId: String(sourceYear.id),
      },
    }),
  );
  const archivedStaffPermissions = archiveStaffActor
    ? await callHandler(getPermissions, {
        user: { id: archiveStaffActor.id, role: archiveStaffActor.role },
        query: {
          classId: String(sampleStudent.studentClass.id),
          academicYearId: String(sourceYear.id),
          page: '1',
          limit: '20',
        },
      })
    : null;
  const blockedPermissionApproval = await expectAccessFailure(() =>
    callHandler(updatePermissionStatus, {
      ...baseReq,
      params: { id: String(permissionRecord.id) },
      body: {
        status: 'APPROVED',
        approvalNote: 'Approval arsip yang seharusnya diblokir',
      },
    }),
  );
  const blockedBehaviorCreate = await expectAccessFailure(() =>
    callHandler(createBehavior, {
      ...baseReq,
      body: {
        studentId: sampleStudent.id,
        classId: sampleStudent.studentClass.id,
        academicYearId: sourceYear.id,
        date: '2026-08-17T00:00:00.000Z',
        type: 'NEGATIVE',
        category: 'Smoke Test',
        description: 'Kasus pasca arsip',
        point: 5,
      },
    }),
  );
  const blockedCounselingCreate = await expectAccessFailure(() =>
    callHandler(createBpBkCounseling, {
      ...baseReq,
      body: {
        academicYearId: sourceYear.id,
        classId: sampleStudent.studentClass.id,
        studentId: sampleStudent.id,
        behaviorId: counselingBehavior.id,
        sessionDate: '2026-08-18T00:00:00.000Z',
        issueSummary: 'Konseling pasca arsip',
        counselingNote: 'Catatan',
        followUpPlan: 'Monitoring',
        summonParent: false,
        status: 'OPEN',
      },
    }),
  );
  const blockedCounselingUpdate = await expectAccessFailure(() =>
    callHandler(updateBpBkCounseling, {
      ...baseReq,
      params: {
        id: String(existingCounseling.id),
      },
      body: {
        status: 'IN_PROGRESS',
        counselingNote: 'Pembaruan arsip yang seharusnya diblokir',
      },
    }),
  );

  const beforePermissionsRows = beforePermissions.data?.permissions || [];
  const afterPermissionsRows = afterPermissions.data?.permissions || [];
  const beforeBpBkPermissionRows = beforeBpBkPermissions.data?.permissions || [];
  const afterBpBkPermissionRows = afterBpBkPermissions.data?.permissions || [];
  const beforeRecentPermissions = beforeBpBkSummary.data?.recentPermissions || [];
  const afterRecentPermissions = afterBpBkSummary.data?.recentPermissions || [];
  const beforeHighRiskStudents = beforePrincipalSummary.data?.highRiskStudents || [];
  const afterHighRiskStudents = afterPrincipalSummary.data?.highRiskStudents || [];
  const beforeAdministrationPermissionQueue = beforeAdministrationSummary.data?.permissionQueue || [];
  const afterAdministrationPermissionQueue = afterAdministrationSummary.data?.permissionQueue || [];
  const beforeAdministrationClassRecap = beforeAdministrationSummary.data?.studentClassRecap || [];
  const afterAdministrationClassRecap = afterAdministrationSummary.data?.studentClassRecap || [];

  const beforePermissionRow = beforePermissionsRows.find((item) => item.id === permissionRecord.id) || null;
  const afterPermissionRow = afterPermissionsRows.find((item) => item.id === permissionRecord.id) || null;
  const beforeBpBkPermissionRow = beforeBpBkPermissionRows.find((item) => item.id === permissionRecord.id) || null;
  const afterBpBkPermissionRow = afterBpBkPermissionRows.find((item) => item.id === permissionRecord.id) || null;
  const beforeRecentPermissionRow = beforeRecentPermissions.find((item) => item.id === permissionRecord.id) || null;
  const afterRecentPermissionRow = afterRecentPermissions.find((item) => item.id === permissionRecord.id) || null;
  const beforeHighRiskRow = beforeHighRiskStudents.find((item) => item.studentId === sampleStudent.id) || null;
  const afterHighRiskRow = afterHighRiskStudents.find((item) => item.studentId === sampleStudent.id) || null;
  const beforeAdministrationPermissionRow =
    beforeAdministrationPermissionQueue.find((item) => item.id === permissionRecord.id) || null;
  const afterAdministrationPermissionRow =
    afterAdministrationPermissionQueue.find((item) => item.id === permissionRecord.id) || null;
  const beforeAdministrationClassRecapRow =
    beforeAdministrationClassRecap.find((item) => item.classId === sampleStudent.studentClass.id) || null;
  const afterAdministrationClassRecapRow =
    afterAdministrationClassRecap.find((item) => item.classId === sampleStudent.studentClass.id) || null;
  const archivedHomeroomPermissionRow =
    (archivedHomeroomPermissions.data?.permissions || []).find((item) => item.id === permissionRecord.id) || null;

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
  assertCondition(
    checks,
    beforeAdministrationPermissionRow?.className === sampleStudent.studentClass.name,
    'Dashboard administrasi TU memakai kelas historis source year sebelum promotion.',
    beforeAdministrationPermissionRow,
  );
  assertCondition(
    checks,
    afterAdministrationPermissionRow?.className === sampleStudent.studentClass.name,
    'Dashboard administrasi TU tetap memakai kelas historis source year setelah promotion.',
    afterAdministrationPermissionRow,
  );
  assertCondition(
    checks,
    beforeAdministrationClassRecapRow?.className === sampleStudent.studentClass.name,
    'Rekap kelas administrasi source year memuat kelas historis sebelum promotion.',
    beforeAdministrationClassRecapRow,
  );
  assertCondition(
    checks,
    afterAdministrationClassRecapRow?.className === sampleStudent.studentClass.name,
    'Rekap kelas administrasi source year tetap memuat kelas historis setelah promotion.',
    afterAdministrationClassRecapRow,
  );
  assertCondition(
    checks,
    archivedHomeroomPermissionRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Wali kelas historis tetap boleh membaca arsip izin source year.',
    archivedHomeroomPermissionRow,
  );
  assertCondition(
    checks,
    archivedUnrelatedPermissionAccess.blocked === true &&
      archivedUnrelatedPermissionAccess.statusCode === 403,
    'Guru yang bukan pemilik historis ditolak saat membuka arsip izin source year.',
    archivedUnrelatedPermissionAccess,
  );
  assertCondition(
    checks,
    Number(archivedBpbkSummaryByDuty.data?.summary?.totalCases || 0) >= 1,
    'Guru BP/BK/pejabat berwenang tetap boleh membaca ringkasan arsip BP/BK source year.',
    archivedBpbkSummaryByDuty.data?.summary || null,
  );
  assertCondition(
    checks,
    archivedUnrelatedBpBkAccess.blocked === true && archivedUnrelatedBpBkAccess.statusCode === 403,
    'Guru yang bukan pemilik historis atau duty BP/BK ditolak saat membuka arsip BP/BK source year.',
    archivedUnrelatedBpBkAccess,
  );
  assertCondition(
    checks,
    archiveStaffActor
      ? (archivedStaffPermissions?.data?.permissions || []).some((item) => item.id === permissionRecord.id)
      : true,
    archiveStaffActor
      ? 'Staff administrasi/Kepala TU tetap boleh membaca arsip izin source year.'
      : 'Tidak ada aktor staff arsip untuk diverifikasi, smoke test tidak memblokir batch.',
    archiveStaffActor ? archivedStaffPermissions?.data?.permissions?.slice(0, 3) || null : null,
  );
  assertCondition(
    checks,
    blockedPermissionApproval.blocked === true && blockedPermissionApproval.statusCode === 403,
    'Approval izin pada tahun ajaran arsip diblokir.',
    blockedPermissionApproval,
  );
  assertCondition(
    checks,
    blockedBehaviorCreate.blocked === true && blockedBehaviorCreate.statusCode === 403,
    'Input kasus perilaku pada tahun ajaran arsip diblokir.',
    blockedBehaviorCreate,
  );
  assertCondition(
    checks,
    blockedCounselingCreate.blocked === true && blockedCounselingCreate.statusCode === 403,
    'Input konseling BP/BK pada tahun ajaran arsip diblokir.',
    blockedCounselingCreate,
  );
  assertCondition(
    checks,
    blockedCounselingUpdate.blocked === true && blockedCounselingUpdate.statusCode === 403,
    'Update konseling BP/BK pada tahun ajaran arsip diblokir.',
    blockedCounselingUpdate,
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
        actors: {
          homeroomTeacher,
          unrelatedTeacher,
          bpbkTeacher,
          archiveStaffActor,
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
