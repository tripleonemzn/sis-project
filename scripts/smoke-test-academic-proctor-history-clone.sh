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
  bash ./scripts/smoke-test-academic-proctor-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_proctor_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-proctor-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Proctor History Smoke Test =="
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
  getProctoringDetail,
  submitBeritaAcara,
  getProctoringReports,
} = require('./src/controllers/proctor.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Proctor History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Proctor History`;
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
        level: { in: ['X', 'XI'] },
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
    throw new Error('Tidak ada kelas X/XI dengan minimal 2 siswa aktif untuk smoke test.');
  }

  const sampleStudents = sourceClassStudents.slice(0, 2);
  const sourceClass = sampleStudents[0].studentClass;
  if (!sourceClass?.id) {
    throw new Error('Kelas sumber smoke test tidak valid.');
  }

  const [teacherActor, adminActor, subject] = await Promise.all([
    prisma.user.findFirst({
      where: {
        role: { in: ['TEACHER', 'ADMIN'] },
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
    prisma.subject.findFirst({
      orderBy: [{ id: 'asc' }],
      select: { id: true, name: true, code: true },
    }),
  ]);

  if (!teacherActor) throw new Error('Guru/proktor smoke test tidak ditemukan.');
  if (!adminActor) throw new Error('Admin/principal smoke test tidak ditemukan.');
  if (!subject) throw new Error('Subject smoke test tidak ditemukan.');

  const startTime = new Date('2026-02-14T07:30:00.000Z');
  const endTime = new Date('2026-02-14T09:00:00.000Z');

  const packet = await prisma.examPacket.create({
    data: {
      title: `Smoke Test Proctor ${sourceClass.name}`,
      subjectId: subject.id,
      authorId: teacherActor.id,
      academicYearId: sourceYear.id,
      description: 'Synthetic packet for proctor history smoke test',
      duration: 90,
      semester: 'ODD',
      type: 'FORMATIF',
      questions: [
        { id: 'q1', text: 'Question 1' },
        { id: 'q2', text: 'Question 2' },
      ],
    },
    select: { id: true, title: true },
  });

  const schedule = await prisma.examSchedule.create({
    data: {
      classId: sourceClass.id,
      subjectId: subject.id,
      academicYearId: sourceYear.id,
      startTime,
      endTime,
      sessionLabel: 'Sesi 1',
      proctorId: teacherActor.id,
      packetId: packet.id,
      semester: 'ODD',
      room: 'Lab QA-1',
      examType: 'FORMATIF',
      isActive: true,
    },
    select: { id: true, room: true, startTime: true, endTime: true },
  });

  const sitting = await prisma.examSitting.create({
    data: {
      academicYearId: sourceYear.id,
      proctorId: teacherActor.id,
      sessionLabel: 'Sesi 1',
      startTime,
      endTime,
      examType: 'FORMATIF',
      roomName: 'Lab QA-1',
      semester: 'ODD',
      students: {
        create: sampleStudents.map((student) => ({
          studentId: student.id,
        })),
      },
    },
    select: { id: true },
  });

  await prisma.studentExamSession.create({
    data: {
      studentId: sampleStudents[0].id,
      scheduleId: schedule.id,
      status: 'COMPLETED',
      startTime,
      submitTime: new Date('2026-02-14T08:45:00.000Z'),
      score: 91,
      answers: {
        q1: 'A',
        q2: 'B',
        __monitoring: {
          totalViolations: 1,
          tabSwitchCount: 1,
          fullscreenExitCount: 0,
          appSwitchCount: 0,
          currentQuestionIndex: 1,
          currentQuestionNumber: 2,
          currentQuestionId: 'q2',
          lastViolationType: 'TAB_SWITCH',
          lastViolationAt: '2026-02-14T08:00:00.000Z',
          lastSyncAt: '2026-02-14T08:45:00.000Z',
        },
      },
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
        },
      },
    },
    orderBy: [{ id: 'asc' }],
  });

  const submittedReport = await callHandler(submitBeritaAcara, {
    params: { scheduleId: String(schedule.id) },
    body: {
      notes: 'Smoke test report',
      incident: 'Tidak ada kendala berarti',
    },
    user: {
      id: teacherActor.id,
      role: teacherActor.role,
    },
  });

  const detail = await callHandler(getProctoringDetail, {
    params: { scheduleId: String(schedule.id) },
    user: {
      id: teacherActor.id,
      role: teacherActor.role,
    },
  });

  const reports = await callHandler(getProctoringReports, {
    query: {
      academicYearId: String(sourceYear.id),
      examType: 'FORMATIF',
      date: '2026-02-14',
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const reportRow = (reports?.data?.rows || []).find((row) => Number(row.scheduleIds?.[0] || 0) === Number(schedule.id));
  const detailStudents = detail?.data?.students || [];
  const detailClassNames = detail?.data?.schedule?.classNames || [];
  const reportSummary = submittedReport?.data?.summary || null;
  const checks = [];

  assertCondition(
    checks,
    Number(commitResult.run.id) > 0,
    'Commit promotion source year untuk smoke test proctor berhasil',
    { runId: commitResult.run.id, sittingId: sitting.id },
  );
  assertCondition(
    checks,
    studentsAfterPromotion.every((student) => Number(student.classId || 0) !== Number(sourceClass.id)),
    'Siswa source class benar-benar pindah dari classId lama setelah promotion',
    studentsAfterPromotion,
  );
  assertCondition(
    checks,
    reportSummary?.expectedParticipants === 2 &&
      reportSummary?.presentParticipants === 1 &&
      reportSummary?.absentParticipants === 1,
    'Submit berita acara setelah promotion tetap menghitung peserta historis source year dengan benar',
    reportSummary,
  );
  assertCondition(
    checks,
    Array.isArray(reportSummary?.classNames) && reportSummary.classNames.includes(sourceClass.name),
    'Submit berita acara tetap membawa classNames historis source year',
    reportSummary,
  );
  assertCondition(
    checks,
    Array.isArray(detailStudents) && detailStudents.length === 2,
    'Detail proctor tetap memuat dua siswa source class setelah promotion',
    detailStudents,
  );
  assertCondition(
    checks,
    detailStudents.every((student) => String(student.className || '') === sourceClass.name),
    'Detail proctor membaca className historis source year untuk semua siswa',
    detailStudents,
  );
  assertCondition(
    checks,
    Array.isArray(detailClassNames) && detailClassNames.includes(sourceClass.name),
    'Header detail proctor menampilkan classNames historis source year',
    detailClassNames,
  );
  assertCondition(
    checks,
    detailStudents.find((student) => Number(student.id) === Number(sampleStudents[0].id))?.status === 'COMPLETED',
    'Detail proctor tetap membaca status sesi ujian source year yang sudah berlangsung',
    detailStudents,
  );
  assertCondition(
    checks,
    Number(reportRow?.expectedParticipants || 0) === 2 &&
      Number(reportRow?.presentParticipants || 0) === 1 &&
      Number(reportRow?.absentParticipants || 0) === 1,
    'Rekap proctor reports tetap menghitung roster historis source year dengan benar',
    reportRow,
  );
  assertCondition(
    checks,
    Array.isArray(reportRow?.classNames) && reportRow.classNames.includes(sourceClass.name),
    'Rekap proctor reports menampilkan classNames historis source year',
    reportRow?.classNames || null,
  );
  assertCondition(
    checks,
    Array.isArray(reportRow?.absentStudents) &&
      reportRow.absentStudents.some(
        (student) =>
          Number(student.id) === Number(sampleStudents[1].id) && String(student.className || '') === sourceClass.name,
      ),
    'Daftar siswa absen di proctor reports tetap menampilkan className historis source year',
    reportRow?.absentStudents || null,
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
        schedule: {
          id: schedule.id,
          room: schedule.room,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
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
console.log(`- Schedule      : #${result.schedule.id} ${result.schedule.room || '-'}`);
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
