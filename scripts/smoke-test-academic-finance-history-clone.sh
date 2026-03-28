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
  bash ./scripts/smoke-test-academic-finance-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_finance_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-finance-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Finance History Smoke Test =="
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
const { Semester } = require('@prisma/client');
const {
  createAcademicYearRolloverTarget,
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');
const { commitAcademicPromotion } = require('./src/services/academicPromotion.service');
const {
  listFinanceCredits,
  createFinanceRefund,
  listFinanceInvoices,
  listFinanceReports,
  listFinanceLedgerBooks,
  listFinancePaymentVerifications,
  createFinanceWriteOffRequest,
  listFinanceWriteOffs,
  listFinancePaymentReversals,
  createFinancePaymentReversalRequest,
  decideFinancePaymentReversalAsHeadTu,
  decideFinancePaymentReversalAsPrincipal,
  applyFinancePaymentReversal,
} = require('./src/controllers/payment.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Finance History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Finance History`;
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
      nis: true,
      nisn: true,
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
  const headTuActor = await prisma.user.findFirst({
    where: {
      role: 'STAFF',
      ptkType: {
        in: ['KEPALA_TU', 'KEPALA_TATA_USAHA'],
      },
    },
    select: { id: true, role: true },
    orderBy: [{ id: 'asc' }],
  });
  const principalActor = await prisma.user.findFirst({
    where: { role: 'PRINCIPAL' },
    select: { id: true, role: true },
    orderBy: [{ id: 'asc' }],
  });

  if (!financeActor) {
    throw new Error('Aktor finance staff untuk smoke test finance tidak ditemukan.');
  }
  if (!headTuActor) {
    throw new Error('Aktor Kepala TU untuk smoke test finance tidak ditemukan.');
  }
  if (!principalActor) {
    throw new Error('Aktor principal untuk smoke test finance tidak ditemukan.');
  }

  const periodKey = '2099-01';
  const invoiceNo = `INV-QA-HIST-${sampleStudent.id}-${Date.now()}`;
  const invoiceTitle = `QA Finance History ${Date.now()}`;
  const invoice = await prisma.financeInvoice.create({
    data: {
      invoiceNo,
      studentId: sampleStudent.id,
      academicYearId: sourceYear.id,
      semester: Semester.ODD,
      periodKey,
      title: invoiceTitle,
      dueDate: new Date('2099-01-20T00:00:00.000Z'),
      totalAmount: 150000,
      paidAmount: 0,
      balanceAmount: 150000,
      status: 'UNPAID',
      createdById: financeActor.id,
      issuedAt: new Date('2026-01-05T00:00:00.000Z'),
      items: {
        create: [
          {
            componentCode: 'QA-FINANCE-HISTORY',
            componentName: 'Komponen Smoke Test Histori Finance',
            amount: 150000,
            notes: 'Smoke test histori finance setelah promotion',
          },
        ],
      },
    },
    select: {
      id: true,
      invoiceNo: true,
      title: true,
    },
  });
  const paymentNo = `PAY-QA-HIST-${sampleStudent.id}-${Date.now()}`;
  const payment = await prisma.financePayment.create({
    data: {
      paymentNo,
      studentId: sampleStudent.id,
      invoiceId: invoice.id,
      amount: 50000,
      allocatedAmount: 50000,
      creditedAmount: 0,
      source: 'DIRECT',
      method: 'BANK_TRANSFER',
      verificationStatus: 'PENDING',
      referenceNo: `REF-${paymentNo}`,
      note: 'Smoke test histori payment verification setelah promotion',
      paidAt: new Date('2026-01-10T00:00:00.000Z'),
      createdById: financeActor.id,
    },
    select: {
      id: true,
      paymentNo: true,
    },
  });
  await prisma.financeInvoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount: 50000,
      balanceAmount: 100000,
      status: 'PARTIAL',
    },
  });

  const existingCreditBalance = await prisma.financeCreditBalance.findUnique({
    where: { studentId: sampleStudent.id },
    select: {
      id: true,
      balanceAmount: true,
    },
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
      data: {
        balanceAmount: 20000,
      },
    });
  }

  const financeReq = { user: { id: financeActor.id, role: financeActor.role } };
  const createdRefundBeforePromotion = await callHandler(createFinanceRefund, {
    ...financeReq,
    params: {
      studentId: String(sampleStudent.id),
    },
    body: {
      amount: 5000,
      method: 'CASH',
      note: 'Smoke test refund historis finance sebelum promotion',
      refundedAt: new Date('2026-01-09T00:00:00.000Z'),
    },
  });
  const beforeInvoiceSearch = await callHandler(listFinanceInvoices, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      search: invoice.invoiceNo,
      limit: '20',
    },
  });
  const beforeInvoiceClass = await callHandler(listFinanceInvoices, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      classId: String(sampleStudent.studentClass.id),
      search: invoice.invoiceNo,
      limit: '20',
    },
  });
  const beforeInvoiceGrade = await callHandler(listFinanceInvoices, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      gradeLevel: sampleStudent.studentClass.level,
      search: invoice.invoiceNo,
      limit: '20',
    },
  });
  const beforeReportClass = await callHandler(listFinanceReports, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      classId: String(sampleStudent.studentClass.id),
      periodFrom: periodKey,
      periodTo: periodKey,
    },
  });
  const beforeReportGrade = await callHandler(listFinanceReports, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      gradeLevel: sampleStudent.studentClass.level,
      periodFrom: periodKey,
      periodTo: periodKey,
    },
  });
  const beforePaymentVerifications = await callHandler(listFinancePaymentVerifications, {
    ...financeReq,
    query: {
      search: payment.paymentNo,
      limit: '20',
    },
  });
  const beforeCredits = await callHandler(listFinanceCredits, {
    ...financeReq,
    query: {
      studentId: String(sampleStudent.id),
      limit: '20',
    },
  });
  const beforeLedgerSearch = await callHandler(listFinanceLedgerBooks, {
    ...financeReq,
    query: {
      search: payment.paymentNo,
      limit: '20',
    },
  });
  const beforeLedgerRefundSearch = await callHandler(listFinanceLedgerBooks, {
    ...financeReq,
    query: {
      search: createdRefundBeforePromotion.data?.refund?.refundNo || '',
      limit: '20',
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

  const afterInvoiceSearch = await callHandler(listFinanceInvoices, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      search: invoice.invoiceNo,
      limit: '20',
    },
  });
  const afterInvoiceClass = await callHandler(listFinanceInvoices, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      classId: String(sampleStudent.studentClass.id),
      search: invoice.invoiceNo,
      limit: '20',
    },
  });
  const afterInvoiceGrade = await callHandler(listFinanceInvoices, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      gradeLevel: sampleStudent.studentClass.level,
      search: invoice.invoiceNo,
      limit: '20',
    },
  });
  const afterReportClass = await callHandler(listFinanceReports, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      classId: String(sampleStudent.studentClass.id),
      periodFrom: periodKey,
      periodTo: periodKey,
    },
  });
  const afterReportGrade = await callHandler(listFinanceReports, {
    ...financeReq,
    query: {
      academicYearId: String(sourceYear.id),
      gradeLevel: sampleStudent.studentClass.level,
      periodFrom: periodKey,
      periodTo: periodKey,
    },
  });
  const afterPaymentVerifications = await callHandler(listFinancePaymentVerifications, {
    ...financeReq,
    query: {
      search: payment.paymentNo,
      limit: '20',
    },
  });
  const afterCredits = await callHandler(listFinanceCredits, {
    ...financeReq,
    query: {
      studentId: String(sampleStudent.id),
      limit: '20',
    },
  });
  const afterLedgerSearch = await callHandler(listFinanceLedgerBooks, {
    ...financeReq,
    query: {
      search: payment.paymentNo,
      limit: '20',
    },
  });
  const afterLedgerRefundSearch = await callHandler(listFinanceLedgerBooks, {
    ...financeReq,
    query: {
      search: createdRefundBeforePromotion.data?.refund?.refundNo || '',
      limit: '20',
    },
  });
  const createdWriteOff = await callHandler(createFinanceWriteOffRequest, {
    ...financeReq,
    params: {
      id: String(invoice.id),
    },
    body: {
      amount: 25000,
      reason: 'Smoke test write-off historis finance',
      note: 'Dibuat sesudah promotion untuk source year',
    },
  });
  const afterWriteOffList = await callHandler(listFinanceWriteOffs, {
    ...financeReq,
    query: {
      search: createdWriteOff.data?.request?.requestNo || '',
      limit: '20',
    },
  });
  const createdReversal = await callHandler(createFinancePaymentReversalRequest, {
    ...financeReq,
    params: {
      id: String(payment.id),
    },
    body: {
      amount: 10000,
      reason: 'Smoke test reversal historis finance',
      note: 'Dibuat sesudah promotion untuk source year',
    },
  });
  const headTuApprovedReversal = await callHandler(decideFinancePaymentReversalAsHeadTu, {
    user: { id: headTuActor.id, role: headTuActor.role },
    params: {
      id: String(createdReversal.data?.request?.id || ''),
    },
    body: {
      approved: true,
      note: 'Disetujui Kepala TU untuk smoke test historis',
    },
  });
  const principalApprovedReversal = await callHandler(decideFinancePaymentReversalAsPrincipal, {
    user: { id: principalActor.id, role: principalActor.role },
    params: {
      id: String(createdReversal.data?.request?.id || ''),
    },
    body: {
      approved: true,
      note: 'Disetujui Kepala Sekolah untuk smoke test historis',
    },
  });
  const appliedReversal = await callHandler(applyFinancePaymentReversal, {
    ...financeReq,
    params: {
      id: String(createdReversal.data?.request?.id || ''),
    },
    body: {
      note: 'Diterapkan finance sesudah promotion untuk source year',
    },
  });
  const afterReversalList = await callHandler(listFinancePaymentReversals, {
    ...financeReq,
    query: {
      search: createdReversal.data?.request?.requestNo || '',
      limit: '20',
    },
  });
  const afterLedgerSearchPostReversal = await callHandler(listFinanceLedgerBooks, {
    ...financeReq,
    query: {
      search: payment.paymentNo,
      limit: '20',
    },
  });

  const beforeInvoiceSearchRow =
    (beforeInvoiceSearch.data?.invoices || []).find((row) => row.id === invoice.id) || null;
  const afterInvoiceSearchRow =
    (afterInvoiceSearch.data?.invoices || []).find((row) => row.id === invoice.id) || null;
  const beforeInvoiceClassRow =
    (beforeInvoiceClass.data?.invoices || []).find((row) => row.id === invoice.id) || null;
  const afterInvoiceClassRow =
    (afterInvoiceClass.data?.invoices || []).find((row) => row.id === invoice.id) || null;
  const beforeInvoiceGradeRow =
    (beforeInvoiceGrade.data?.invoices || []).find((row) => row.id === invoice.id) || null;
  const afterInvoiceGradeRow =
    (afterInvoiceGrade.data?.invoices || []).find((row) => row.id === invoice.id) || null;

  const beforeReportClassDetail =
    (beforeReportClass.data?.detailRows || []).find((row) => row.invoiceNo === invoice.invoiceNo) || null;
  const afterReportClassDetail =
    (afterReportClass.data?.detailRows || []).find((row) => row.invoiceNo === invoice.invoiceNo) || null;
  const beforeReportGradeDetail =
    (beforeReportGrade.data?.detailRows || []).find((row) => row.invoiceNo === invoice.invoiceNo) || null;
  const afterReportGradeDetail =
    (afterReportGrade.data?.detailRows || []).find((row) => row.invoiceNo === invoice.invoiceNo) || null;

  const beforeReportClassRecap =
    (beforeReportClass.data?.classRecap || []).find((row) => row.className === sampleStudent.studentClass.name) ||
    null;
  const afterReportClassRecap =
    (afterReportClass.data?.classRecap || []).find((row) => row.className === sampleStudent.studentClass.name) ||
    null;
  const beforePaymentVerificationRow =
    (beforePaymentVerifications.data?.payments || []).find((row) => row.id === payment.id) || null;
  const afterPaymentVerificationRow =
    (afterPaymentVerifications.data?.payments || []).find((row) => row.id === payment.id) || null;
  const beforeLedgerPaymentRow =
    (beforeLedgerSearch.data?.entries || []).find(
      (row) => row.sourceType === 'PAYMENT' && row.transactionNo === payment.paymentNo,
    ) || null;
  const afterLedgerPaymentRow =
    (afterLedgerSearch.data?.entries || []).find(
      (row) => row.sourceType === 'PAYMENT' && row.transactionNo === payment.paymentNo,
    ) || null;
  const afterLedgerPaymentRowPostReversal =
    (afterLedgerSearchPostReversal.data?.entries || []).find(
      (row) => row.sourceType === 'PAYMENT' && row.transactionNo === payment.paymentNo,
    ) || null;
  const createdRefundRecord = createdRefundBeforePromotion.data?.refund || null;
  const beforeCreditRefundRow =
    (beforeCredits.data?.recentRefunds || []).find((row) => row.id === createdRefundRecord?.id) || null;
  const afterCreditRefundRow =
    (afterCredits.data?.recentRefunds || []).find((row) => row.id === createdRefundRecord?.id) || null;
  const beforeLedgerRefundRow =
    (beforeLedgerRefundSearch.data?.entries || []).find(
      (row) => row.sourceType === 'REFUND' && row.transactionNo === createdRefundRecord?.refundNo,
    ) || null;
  const afterLedgerRefundRow =
    (afterLedgerRefundSearch.data?.entries || []).find(
      (row) => row.sourceType === 'REFUND' && row.transactionNo === createdRefundRecord?.refundNo,
    ) || null;
  const createdWriteOffRequest = createdWriteOff.data?.request || null;
  const afterWriteOffListRow =
    (afterWriteOffList.data?.requests || []).find((row) => row.id === createdWriteOffRequest?.id) || null;
  const createdReversalRequest = createdReversal.data?.request || null;
  const headTuApprovedReversalRequest = headTuApprovedReversal.data?.request || null;
  const principalApprovedReversalRequest = principalApprovedReversal.data?.request || null;
  const appliedReversalRequest = appliedReversal.data?.request || null;
  const appliedReversalInvoice = appliedReversal.data?.invoice || null;
  const afterReversalListRow =
    (afterReversalList.data?.requests || []).find((row) => row.id === createdReversalRequest?.id) || null;
  const afterCollectionQueueRow =
    (afterReportClass.data?.collectionPriorityQueue || []).find((row) => row.studentId === sampleStudent.id) ||
    null;

  const checks = [];
  assertCondition(
    checks,
    commitResult.summary.promotedStudents > 0,
    'Smoke test benar-benar menjalankan promotion finance source year.',
    commitResult.summary,
  );
  assertCondition(
    checks,
    promotedStudent && promotedStudent.classId !== sampleStudent.studentClass.id,
    'Siswa sampel finance benar-benar pindah kelas aktif setelah promotion.',
    {
      beforeClassId: sampleStudent.studentClass.id,
      afterClassId: promotedStudent?.classId || null,
      afterClassName: promotedStudent?.studentClass?.name || null,
    },
  );
  assertCondition(
    checks,
    beforeInvoiceSearchRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List invoice source year menampilkan kelas historis sebelum promotion.',
    beforeInvoiceSearchRow,
  );
  assertCondition(
    checks,
    afterInvoiceSearchRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List invoice source year tetap menampilkan kelas historis setelah promotion.',
    afterInvoiceSearchRow,
  );
  assertCondition(
    checks,
    beforeInvoiceClassRow?.id === invoice.id,
    'Filter classId invoice source year menemukan invoice sebelum promotion.',
    beforeInvoiceClass.data?.summary || null,
  );
  assertCondition(
    checks,
    afterInvoiceClassRow?.id === invoice.id,
    'Filter classId invoice source year tetap menemukan invoice setelah promotion.',
    afterInvoiceClass.data?.summary || null,
  );
  assertCondition(
    checks,
    beforeInvoiceGradeRow?.id === invoice.id,
    'Filter gradeLevel invoice source year menemukan invoice sebelum promotion.',
    beforeInvoiceGrade.data?.summary || null,
  );
  assertCondition(
    checks,
    afterInvoiceGradeRow?.id === invoice.id,
    'Filter gradeLevel invoice source year tetap menemukan invoice setelah promotion.',
    afterInvoiceGrade.data?.summary || null,
  );
  assertCondition(
    checks,
    beforeReportClassDetail?.className === sampleStudent.studentClass.name,
    'Finance report class filter source year memakai kelas historis sebelum promotion.',
    beforeReportClassDetail,
  );
  assertCondition(
    checks,
    afterReportClassDetail?.className === sampleStudent.studentClass.name,
    'Finance report class filter source year tetap memakai kelas historis setelah promotion.',
    afterReportClassDetail,
  );
  assertCondition(
    checks,
    beforeReportGradeDetail?.className === sampleStudent.studentClass.name,
    'Finance report gradeLevel source year memakai kelas historis sebelum promotion.',
    beforeReportGradeDetail,
  );
  assertCondition(
    checks,
    afterReportGradeDetail?.className === sampleStudent.studentClass.name,
    'Finance report gradeLevel source year tetap memakai kelas historis setelah promotion.',
    afterReportGradeDetail,
  );
  assertCondition(
    checks,
    beforeReportClassRecap?.className === sampleStudent.studentClass.name,
    'Class recap finance source year merangkum kelas historis sebelum promotion.',
    beforeReportClassRecap,
  );
  assertCondition(
    checks,
    afterReportClassRecap?.className === sampleStudent.studentClass.name,
    'Class recap finance source year tetap merangkum kelas historis setelah promotion.',
    afterReportClassRecap,
  );
  assertCondition(
    checks,
    afterCollectionQueueRow?.className === sampleStudent.studentClass.name,
    'Collection queue finance source year tetap memakai kelas historis setelah promotion.',
    afterCollectionQueueRow,
  );
  assertCondition(
    checks,
    beforePaymentVerificationRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Payment verification menampilkan kelas historis source year sebelum promotion.',
    beforePaymentVerificationRow,
  );
  assertCondition(
    checks,
    afterPaymentVerificationRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Payment verification tetap menampilkan kelas historis source year setelah promotion.',
    afterPaymentVerificationRow,
  );
  assertCondition(
    checks,
    beforeLedgerPaymentRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Ledger finance source year menampilkan kelas historis payment sebelum promotion.',
    beforeLedgerPaymentRow,
  );
  assertCondition(
    checks,
    afterLedgerPaymentRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Ledger finance source year tetap menampilkan kelas historis payment setelah promotion.',
    afterLedgerPaymentRow,
  );
  assertCondition(
    checks,
    createdRefundRecord?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Create refund sebelum promotion mengembalikan kelas source year yang benar.',
    createdRefundRecord,
  );
  assertCondition(
    checks,
    beforeCreditRefundRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Daftar refund admin menampilkan kelas historis refund sebelum promotion.',
    beforeCreditRefundRow,
  );
  assertCondition(
    checks,
    afterCreditRefundRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Daftar refund admin tetap menampilkan kelas historis refund setelah promotion.',
    afterCreditRefundRow,
  );
  assertCondition(
    checks,
    beforeLedgerRefundRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Ledger finance menampilkan kelas historis refund sebelum promotion.',
    beforeLedgerRefundRow,
  );
  assertCondition(
    checks,
    afterLedgerRefundRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Ledger finance tetap menampilkan kelas historis refund setelah promotion.',
    afterLedgerRefundRow,
  );
  assertCondition(
    checks,
    Number(afterLedgerRefundRow?.amount || 0) === Number(createdRefundRecord?.amount || 0),
    'Ledger finance menampilkan nominal refund yang benar setelah promotion.',
    afterLedgerRefundRow,
  );
  assertCondition(
    checks,
    createdWriteOffRequest?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Create write-off source year setelah promotion tetap mengembalikan kelas historis.',
    createdWriteOffRequest,
  );
  assertCondition(
    checks,
    afterWriteOffListRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List write-off source year setelah promotion tetap menampilkan kelas historis.',
    afterWriteOffListRow,
  );
  assertCondition(
    checks,
    createdReversalRequest?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Create reversal source year setelah promotion tetap mengembalikan kelas historis.',
    createdReversalRequest,
  );
  assertCondition(
    checks,
    headTuApprovedReversalRequest?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Approval Kepala TU pada reversal tetap membawa kelas historis source year.',
    headTuApprovedReversalRequest,
  );
  assertCondition(
    checks,
    principalApprovedReversalRequest?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Approval Kepala Sekolah pada reversal tetap membawa kelas historis source year.',
    principalApprovedReversalRequest,
  );
  assertCondition(
    checks,
    appliedReversalRequest?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Apply reversal source year tetap mengembalikan kelas historis pada request.',
    appliedReversalRequest,
  );
  assertCondition(
    checks,
    appliedReversalInvoice?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Apply reversal source year tetap mengembalikan kelas historis pada invoice.',
    appliedReversalInvoice,
  );
  assertCondition(
    checks,
    afterReversalListRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List reversal source year setelah approval/apply tetap menampilkan kelas historis.',
    afterReversalListRow,
  );
  assertCondition(
    checks,
    afterLedgerPaymentRowPostReversal?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Ledger finance source year tetap menampilkan kelas historis payment setelah reversal diterapkan.',
    afterLedgerPaymentRowPostReversal,
  );
  assertCondition(
    checks,
    Number(afterLedgerPaymentRowPostReversal?.amount || 0) === 40000,
    'Ledger finance menampilkan nominal payment neto setelah reversal diterapkan.',
    afterLedgerPaymentRowPostReversal,
  );

  const summary = {
    sourceYear,
    targetYear: targetSetup.targetAcademicYear,
    sampleStudent: {
      id: sampleStudent.id,
      name: sampleStudent.name,
      classId: sampleStudent.studentClass.id,
      className: sampleStudent.studentClass.name,
      level: sampleStudent.studentClass.level,
    },
    invoice: {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      title: invoice.title,
      periodKey,
    },
    payment: {
      id: payment.id,
      paymentNo: payment.paymentNo,
    },
    refund: createdRefundRecord
      ? {
          id: createdRefundRecord.id,
          refundNo: createdRefundRecord.refundNo,
          amount: createdRefundRecord.amount,
        }
      : null,
    reversalRequest: createdReversalRequest
      ? {
          id: createdReversalRequest.id,
          requestNo: createdReversalRequest.requestNo,
          status: afterReversalListRow?.status || appliedReversalRequest?.status || null,
        }
      : null,
    writeOffRequest: createdWriteOffRequest
      ? {
          id: createdWriteOffRequest.id,
          requestNo: createdWriteOffRequest.requestNo,
        }
      : null,
    commitRunId: commitResult.run.id,
    actors: {
      financeActorId: financeActor.id,
      headTuActorId: headTuActor.id,
      principalActorId: principalActor.id,
    },
    totals: {
      checks: checks.length,
      passed: checks.filter((item) => item.pass).length,
      failed: checks.filter((item) => !item.pass).length,
    },
  };

  console.log(
    JSON.stringify(
      {
        ok: summary.totals.failed === 0,
        summary,
        checks,
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

node <<NODE
const fs = require('fs');
const result = JSON.parse(fs.readFileSync('$RESULT_JSON', 'utf8'));
console.log('== Result ==');
console.log('Source year : ' + result.summary.sourceYear.id + ' (' + result.summary.sourceYear.name + ')');
console.log('Target year : ' + result.summary.targetYear.id + ' (' + result.summary.targetYear.name + ')');
console.log(
  'Sample      : #' +
    result.summary.sampleStudent.id +
    ' ' +
    result.summary.sampleStudent.name +
    ' [' +
    result.summary.sampleStudent.className +
    ']',
);
console.log(
  'Invoice     : ' +
    result.summary.invoice.invoiceNo +
    ' (' +
    result.summary.invoice.periodKey +
    ')',
);
console.log(
  'Checks      : ' +
    result.summary.totals.passed +
    '/' +
    result.summary.totals.checks +
    ' PASS',
);
if (!result.ok) {
  console.log();
  console.log('Failed checks:');
  result.checks
    .filter((check) => !check.pass)
    .forEach((check) => {
      console.log('- ' + check.description);
      if (check.details) {
        console.log('  ' + JSON.stringify(check.details));
      }
    });
  process.exit(1);
}
NODE
