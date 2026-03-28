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
  bash ./scripts/smoke-test-finance-refund-backfill-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_refund_backfill_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-finance-refund-backfill-XXXXXX)"
SETUP_JSON="$TMP_DIR/setup.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Finance Refund Backfill Smoke Test =="
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
node -r ts-node/register <<'NODE' >"$SETUP_JSON"
const prisma = require('./src/utils/prisma').default;
const {
  createAcademicYearRolloverTarget,
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');
const { commitAcademicPromotion } = require('./src/services/academicPromotion.service');
const { createFinanceRefund } = require('./src/controllers/payment.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Refund Backfill ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Refund Backfill`;
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
      select: {
        id: true,
        name: true,
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
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
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
  const checks = [];
  const sourceYear = await pickSourceYear();
  if (!sourceYear) {
    throw new Error('Tahun sumber tidak ditemukan.');
  }

  const targetSetup = await createAcademicYearRolloverTarget({
    sourceAcademicYearId: sourceYear.id,
    payload: {
      name: String(process.env.TARGET_NAME || '').trim() || deriveTargetName(sourceYear.name),
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

  const financeActor = await prisma.user.findFirst({
    where: {
      OR: [
        { role: 'ADMIN' },
        { role: 'STAFF', ptkType: 'STAFF_KEUANGAN' },
        { additionalDuties: { has: 'BENDAHARA' } },
      ],
    },
    select: { id: true, role: true },
    orderBy: [{ id: 'asc' }],
  });
  if (!financeActor) {
    throw new Error('Aktor finance tidak ditemukan.');
  }

  const existingCreditBalance = await prisma.financeCreditBalance.findUnique({
    where: { studentId: sampleStudent.id },
    select: { id: true, balanceAmount: true },
  });
  if (!existingCreditBalance) {
    await prisma.financeCreditBalance.create({
      data: {
        studentId: sampleStudent.id,
        balanceAmount: 20000,
      },
    });
  } else if (Number(existingCreditBalance.balanceAmount || 0) < 20000) {
    await prisma.financeCreditBalance.update({
      where: { id: existingCreditBalance.id },
      data: { balanceAmount: 20000 },
    });
  }

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
      studentClass: {
        select: {
          id: true,
          name: true,
          academicYearId: true,
        },
      },
    },
  });

  const refundDate = new Date(sourceYear.semester2Start || sourceYear.semester1Start);
  refundDate.setUTCDate(refundDate.getUTCDate() + 7);

  const financeReq = { user: { id: financeActor.id, role: financeActor.role } };
  const createdRefund = await callHandler(createFinanceRefund, {
    ...financeReq,
    params: {
      studentId: String(sampleStudent.id),
    },
    body: {
      amount: 5000,
      method: 'CASH',
      note: 'Smoke test refund backfill historis setelah promotion',
      refundedAt: refundDate,
    },
  });

  const createdRefundRecord = createdRefund.data?.refund || null;
  if (!createdRefundRecord?.id) {
    throw new Error('Refund smoke test tidak berhasil dibuat.');
  }

  const persistedRefund = await prisma.financeRefund.findUnique({
    where: { id: createdRefundRecord.id },
    select: {
      id: true,
      refundNo: true,
      academicYearId: true,
      refundedAt: true,
    },
  });

  assertCondition(
    checks,
    persistedRefund?.academicYearId === sourceYear.id,
    'Refund backdated setelah promotion tetap tersimpan pada source year.',
    persistedRefund,
  );
  assertCondition(
    checks,
    createdRefundRecord?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Create refund backdated setelah promotion tetap mengembalikan kelas historis source year.',
    createdRefundRecord,
  );
  assertCondition(
    checks,
    promotedStudent?.studentClass?.academicYearId === targetSetup.targetAcademicYear.id,
    'Siswa sampel benar-benar sudah dipromosikan ke target year sebelum uji backfill.',
    promotedStudent,
  );

  await prisma.financeRefund.update({
    where: { id: createdRefundRecord.id },
    data: {
      academicYearId: null,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: checks.every((item) => item.pass),
        checks,
        summary: {
          sourceYear: {
            id: sourceYear.id,
            name: sourceYear.name,
          },
          targetYear: targetSetup.targetAcademicYear,
          sampleStudent: {
            id: sampleStudent.id,
            name: sampleStudent.name,
            sourceClassName: sampleStudent.studentClass.name,
            promotedClassName: promotedStudent?.studentClass?.name || null,
          },
          refund: {
            id: createdRefundRecord.id,
            refundNo: createdRefundRecord.refundNo,
            expectedAcademicYearId: sourceYear.id,
            refundedAt: refundDate.toISOString(),
          },
          commitRunId: commitResult.run.id,
        },
      },
      null,
      2,
    ),
  );
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE

eval "$(
  SETUP_JSON="$SETUP_JSON" node <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.SETUP_JSON, 'utf8'));
if (!payload.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
console.log('export REFUND_ID=' + JSON.stringify(String(payload.summary.refund.id)));
console.log(
  'export EXPECTED_ACADEMIC_YEAR_ID=' +
    JSON.stringify(String(payload.summary.refund.expectedAcademicYearId)),
);
NODE
)"

echo "-> Dry-run backfill refund #$REFUND_ID"
DATABASE_URL="$CLONE_DATABASE_URL" npm run finance:refund-backfill-academic-year -- --refund-id "$REFUND_ID" --verbose
echo

DRY_RUN_ACADEMIC_YEAR_ID="$(
  DATABASE_URL="$CLONE_DATABASE_URL" REFUND_ID="$REFUND_ID" node -r ts-node/register <<'NODE'
const prisma = require('./src/utils/prisma').default;
(async () => {
  const refund = await prisma.financeRefund.findUnique({
    where: { id: Number(process.env.REFUND_ID) },
    select: { academicYearId: true },
  });
  process.stdout.write(String(refund?.academicYearId ?? 'null'));
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE
)"

echo "-> Apply backfill refund #$REFUND_ID"
DATABASE_URL="$CLONE_DATABASE_URL" npm run finance:refund-backfill-academic-year -- --refund-id "$REFUND_ID" --apply --verbose
echo

APPLY_ACADEMIC_YEAR_ID="$(
  DATABASE_URL="$CLONE_DATABASE_URL" REFUND_ID="$REFUND_ID" node -r ts-node/register <<'NODE'
const prisma = require('./src/utils/prisma').default;
(async () => {
  const refund = await prisma.financeRefund.findUnique({
    where: { id: Number(process.env.REFUND_ID) },
    select: { academicYearId: true },
  });
  process.stdout.write(String(refund?.academicYearId ?? 'null'));
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE
)"

SETUP_JSON="$SETUP_JSON" \
DRY_RUN_ACADEMIC_YEAR_ID="$DRY_RUN_ACADEMIC_YEAR_ID" \
APPLY_ACADEMIC_YEAR_ID="$APPLY_ACADEMIC_YEAR_ID" \
EXPECTED_ACADEMIC_YEAR_ID="$EXPECTED_ACADEMIC_YEAR_ID" \
node <<'NODE'
const fs = require('fs');

function assertCondition(checks, condition, description, details = undefined) {
  checks.push({
    description,
    pass: Boolean(condition),
    details: details === undefined ? null : details,
  });
}

const payload = JSON.parse(fs.readFileSync(process.env.SETUP_JSON, 'utf8'));
const checks = [...(payload.checks || [])];
const expectedAcademicYearId = Number(process.env.EXPECTED_ACADEMIC_YEAR_ID);
const dryRunAcademicYearId = process.env.DRY_RUN_ACADEMIC_YEAR_ID;
const applyAcademicYearId = Number(process.env.APPLY_ACADEMIC_YEAR_ID);

assertCondition(
  checks,
  dryRunAcademicYearId === 'null',
  'Dry-run backfill tidak menulis academicYearId refund.',
  { dryRunAcademicYearId },
);
assertCondition(
  checks,
  applyAcademicYearId === expectedAcademicYearId,
  'Apply backfill mengembalikan academicYearId refund ke source year yang benar.',
  { applyAcademicYearId, expectedAcademicYearId },
);

const summary = {
  ...payload.summary,
  dryRunAcademicYearId,
  applyAcademicYearId,
  totals: {
    checks: checks.length,
    passed: checks.filter((item) => item.pass).length,
    failed: checks.filter((item) => !item.pass).length,
  },
};

const result = {
  ok: summary.totals.failed === 0,
  summary,
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exit(1);
}
NODE
