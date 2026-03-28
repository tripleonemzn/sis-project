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
  bash ./scripts/smoke-test-academic-internship-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_internship_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-internship-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Internship History Smoke Test =="
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
const crypto = require('crypto');
const prisma = require('./src/utils/prisma').default;
const {
  createAcademicYearRolloverTarget,
  applyAcademicYearRollover,
} = require('./src/services/academicYearRollover.service');
const { commitAcademicPromotion } = require('./src/services/academicPromotion.service');
const {
  getAllInternships,
  getAssignedInternships,
  getExaminerInternships,
  getInternshipDetail,
  getPrintLetterHtml,
  verifyAccessCode,
} = require('./src/controllers/internship.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Internship History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Internship History`;
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

  const [sampleStudent, guidanceTeacher, examinerTeacher] = await Promise.all([
    prisma.user.findFirst({
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
        studentClass: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.user.findFirst({
      where: { role: 'TEACHER' },
      orderBy: [{ id: 'asc' }],
      select: { id: true, role: true, name: true },
    }),
    prisma.user.findFirst({
      where: { role: 'TEACHER' },
      orderBy: [{ id: 'desc' }],
      select: { id: true, role: true, name: true },
    }),
  ]);

  if (!sampleStudent?.studentClass) {
    throw new Error('Tidak ada siswa PKL source year yang siap diuji.');
  }

  const colleagueStudent = await prisma.user.findFirst({
    where: {
      role: 'STUDENT',
      studentStatus: 'ACTIVE',
      studentClass: {
        academicYearId: sourceYear.id,
      },
      NOT: [{ id: sampleStudent.id }],
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

  if (!guidanceTeacher || !examinerTeacher) {
    throw new Error('Guru pembimbing/penguji untuk smoke test tidak ditemukan.');
  }

  const colleague = colleagueStudent?.studentClass ? colleagueStudent : sampleStudent;
  const accessCode = crypto.randomBytes(16).toString('hex');
  const accessCodeExpiresAt = new Date();
  accessCodeExpiresAt.setDate(accessCodeExpiresAt.getDate() + 30);

  const primaryInternship = await prisma.internship.create({
    data: {
      studentId: sampleStudent.id,
      academicYearId: sourceYear.id,
      teacherId: guidanceTeacher.id,
      examinerId: examinerTeacher.id,
      companyName: 'PT QA Internship History',
      companyAddress: 'Jl. Uji Histori No. 1',
      mentorName: 'Mentor QA',
      mentorPhone: '081200000001',
      mentorEmail: 'mentor-qa@example.com',
      startDate: new Date('2026-01-10T00:00:00.000Z'),
      endDate: new Date('2026-04-10T00:00:00.000Z'),
      status: 'ACTIVE',
      accessCode,
      accessCodeExpiresAt,
    },
  });

  if (colleague.id !== sampleStudent.id) {
    await prisma.internship.create({
      data: {
        studentId: colleague.id,
        academicYearId: sourceYear.id,
        teacherId: guidanceTeacher.id,
        examinerId: examinerTeacher.id,
        companyName: 'PT QA Internship History',
        companyAddress: 'Jl. Uji Histori No. 1',
        mentorName: 'Mentor QA',
        mentorPhone: '081200000002',
        mentorEmail: 'mentor-qa2@example.com',
        startDate: new Date('2026-01-12T00:00:00.000Z'),
        endDate: new Date('2026-04-12T00:00:00.000Z'),
        status: 'ACTIVE',
      },
    });
  }

  const beforeList = await callHandler(getAllInternships, {
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
      page: '1',
      limit: '20',
    },
  });
  const beforeSearchList = await callHandler(getAllInternships, {
    query: {
      academicYearId: String(sourceYear.id),
      search: sampleStudent.studentClass.name,
      page: '1',
      limit: '20',
    },
  });
  const beforeDetail = await callHandler(getInternshipDetail, {
    params: { id: String(primaryInternship.id) },
  });
  const beforeAssigned = await callHandler(getAssignedInternships, {
    user: { id: guidanceTeacher.id, role: guidanceTeacher.role },
  });
  const beforeExaminer = await callHandler(getExaminerInternships, {
    user: { id: examinerTeacher.id, role: examinerTeacher.role },
  });
  const beforePrint = await callHandler(getPrintLetterHtml, {
    params: { id: String(primaryInternship.id) },
    body: {
      letterNumber: '001/QA/PKL',
      attachment: '-',
      subject: 'Pengantar PKL',
      date: '2026-01-02T00:00:00.000Z',
      openingText: 'Pembukaan',
      closingText: 'Penutupan',
      signatureSpace: 3,
      useBarcode: false,
      contactPersons: [],
    },
  });
  const beforeVerify = await callHandler(verifyAccessCode, {
    params: { accessCode },
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

  const afterList = await callHandler(getAllInternships, {
    query: {
      classId: String(sampleStudent.studentClass.id),
      academicYearId: String(sourceYear.id),
      page: '1',
      limit: '20',
    },
  });
  const afterSearchList = await callHandler(getAllInternships, {
    query: {
      academicYearId: String(sourceYear.id),
      search: sampleStudent.studentClass.name,
      page: '1',
      limit: '20',
    },
  });
  const afterDetail = await callHandler(getInternshipDetail, {
    params: { id: String(primaryInternship.id) },
  });
  const afterAssigned = await callHandler(getAssignedInternships, {
    user: { id: guidanceTeacher.id, role: guidanceTeacher.role },
  });
  const afterExaminer = await callHandler(getExaminerInternships, {
    user: { id: examinerTeacher.id, role: examinerTeacher.role },
  });
  const afterPrint = await callHandler(getPrintLetterHtml, {
    params: { id: String(primaryInternship.id) },
    body: {
      letterNumber: '001/QA/PKL',
      attachment: '-',
      subject: 'Pengantar PKL',
      date: '2026-01-02T00:00:00.000Z',
      openingText: 'Pembukaan',
      closingText: 'Penutupan',
      signatureSpace: 3,
      useBarcode: false,
      contactPersons: [],
    },
  });
  const afterVerify = await callHandler(verifyAccessCode, {
    params: { accessCode },
  });

  const beforeListRow = (beforeList.data?.internships || []).find((item) => item.id === primaryInternship.id) || null;
  const afterListRow = (afterList.data?.internships || []).find((item) => item.id === primaryInternship.id) || null;
  const beforeSearchRow =
    (beforeSearchList.data?.internships || []).find((item) => item.id === primaryInternship.id) || null;
  const afterSearchRow =
    (afterSearchList.data?.internships || []).find((item) => item.id === primaryInternship.id) || null;
  const beforeAssignedRow =
    (beforeAssigned.data || []).find((item) => item.id === primaryInternship.id) || null;
  const afterAssignedRow =
    (afterAssigned.data || []).find((item) => item.id === primaryInternship.id) || null;
  const beforeExaminerRow =
    (beforeExaminer.data || []).find((item) => item.id === primaryInternship.id) || null;
  const afterExaminerRow =
    (afterExaminer.data || []).find((item) => item.id === primaryInternship.id) || null;

  const checks = [];
  assertCondition(
    checks,
    commitResult.summary.promotedStudents > 0,
    'Smoke test benar-benar menjalankan promotion PKL source year.',
    commitResult.summary,
  );
  assertCondition(
    checks,
    promotedStudent && promotedStudent.classId !== sampleStudent.studentClass.id,
    'Siswa sampel PKL benar-benar pindah kelas aktif setelah promotion.',
    {
      beforeClassId: sampleStudent.studentClass.id,
      afterClassId: promotedStudent?.classId || null,
      afterClassName: promotedStudent?.studentClass?.name || null,
    },
  );
  assertCondition(
    checks,
    beforeListRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List PKL class filter source year memakai kelas historis sebelum promotion.',
    beforeListRow,
  );
  assertCondition(
    checks,
    afterListRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List PKL class filter source year tetap memakai kelas historis setelah promotion.',
    afterListRow,
  );
  assertCondition(
    checks,
    beforeSearchRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List PKL search source year menemukan kelas historis sebelum promotion.',
    beforeSearchRow,
  );
  assertCondition(
    checks,
    afterSearchRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'List PKL search source year tetap menemukan kelas historis setelah promotion.',
    afterSearchRow,
  );
  assertCondition(
    checks,
    beforeDetail.data?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Detail PKL memakai kelas historis source year sebelum promotion.',
    beforeDetail.data || null,
  );
  assertCondition(
    checks,
    afterDetail.data?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Detail PKL tetap memakai kelas historis source year setelah promotion.',
    afterDetail.data || null,
  );
  assertCondition(
    checks,
    beforeAssignedRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Daftar pembimbing PKL memakai kelas historis sebelum promotion.',
    beforeAssignedRow,
  );
  assertCondition(
    checks,
    afterAssignedRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Daftar pembimbing PKL tetap memakai kelas historis setelah promotion.',
    afterAssignedRow,
  );
  assertCondition(
    checks,
    beforeExaminerRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Daftar penguji PKL memakai kelas historis sebelum promotion.',
    beforeExaminerRow,
  );
  assertCondition(
    checks,
    afterExaminerRow?.student?.studentClass?.name === sampleStudent.studentClass.name,
    'Daftar penguji PKL tetap memakai kelas historis setelah promotion.',
    afterExaminerRow,
  );
  assertCondition(
    checks,
    String(beforePrint.data?.html || '').includes(sampleStudent.studentClass.name),
    'Print surat PKL memuat kelas historis sebelum promotion.',
    null,
  );
  assertCondition(
    checks,
    String(afterPrint.data?.html || '').includes(sampleStudent.studentClass.name),
    'Print surat PKL tetap memuat kelas historis setelah promotion.',
    null,
  );
  assertCondition(
    checks,
    beforeVerify.data?.studentClass === sampleStudent.studentClass.name,
    'Magic link PKL memakai kelas historis sebelum promotion.',
    beforeVerify.data || null,
  );
  assertCondition(
    checks,
    afterVerify.data?.studentClass === sampleStudent.studentClass.name,
    'Magic link PKL tetap memakai kelas historis setelah promotion.',
    afterVerify.data || null,
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
