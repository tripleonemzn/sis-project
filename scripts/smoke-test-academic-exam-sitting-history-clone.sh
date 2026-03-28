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
  bash ./scripts/smoke-test-academic-exam-sitting-history-clone.sh [options]

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

CLONE_DB="${PGDATABASE}_exam_sitting_history_clone_$(date +%Y%m%d_%H%M%S)"
RESTORE_LOG="/tmp/${CLONE_DB}.restore.log"
TMP_DIR="$(mktemp -d /tmp/sis-exam-sitting-history-smoke-XXXXXX)"
RESULT_JSON="$TMP_DIR/result.json"

cleanup() {
  rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG" >/dev/null 2>&1 || true
  if [ "$KEEP_CLONE" -ne 1 ] && [ -n "$CLONE_DB" ]; then
    dropdb --if-exists "$CLONE_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== Academic Exam Sitting History Smoke Test =="
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
  createExamSitting,
  getExamSittingDetail,
  updateExamSitting,
  updateSittingStudents,
} = require('./src/controllers/exam-sitting.controller');
const { getSessionDetail } = require('./src/controllers/exam.controller');

function deriveTargetName(sourceName) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `QA Exam Sitting History ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd} QA Exam Sitting History`;
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
    const headers = {};
    const res = {
      statusCode: 200,
      headers,
      setHeader(name, value) {
        headers[String(name)] = value;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve(payload);
        return this;
      },
      end(payload) {
        resolve({
          ended: true,
          payload: payload ?? null,
          statusCode: this.statusCode,
          headers,
        });
        return this;
      },
    };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

async function ensureExamRoom(name) {
  const existing = await prisma.room.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: { id: true, name: true },
  });
  if (existing) return existing;

  let category = await prisma.roomCategory.findFirst({
    where: {
      name: {
        equals: 'LAB QA SMOKE',
        mode: 'insensitive',
      },
    },
    select: { id: true, name: true },
  });

  if (!category) {
    category = await prisma.roomCategory.create({
      data: {
        name: 'LAB QA SMOKE',
        description: 'Synthetic lab category for exam sitting history smoke test',
      },
      select: { id: true, name: true },
    });
  }

  return prisma.room.create({
    data: {
      name,
      categoryId: category.id,
      capacity: 40,
      location: 'Smoke Test Wing',
      condition: 'BAIK',
      description: 'Synthetic room for academic exam sitting history smoke test',
    },
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
    throw new Error('Tidak ada kelas X dengan minimal 2 siswa aktif untuk smoke test exam sitting.');
  }

  const sampleStudents = sourceClassStudents.slice(0, 2);
  const sourceClass = sampleStudents[0].studentClass;
  if (!sourceClass?.id) {
    throw new Error('Kelas sumber smoke test exam sitting tidak valid.');
  }

  const [teacherActor, adminActor, subject, roomA, roomB] = await Promise.all([
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
    ensureExamRoom('Lab QA Exam Sitting A'),
    ensureExamRoom('Lab QA Exam Sitting B'),
  ]);

  if (!teacherActor) throw new Error('Guru smoke test exam sitting tidak ditemukan.');
  if (!adminActor) throw new Error('Admin/principal smoke test exam sitting tidak ditemukan.');
  if (!subject) throw new Error('Subject smoke test exam sitting tidak ditemukan.');

  const programCode = `QA_X_ONLY_${Date.now()}`;
  await prisma.examProgramConfig.create({
    data: {
      academicYearId: sourceYear.id,
      code: programCode,
      baseType: 'SAS',
      baseTypeCode: 'SAS',
      displayLabel: 'QA X Only Smoke Test',
      shortLabel: 'QA-X',
      description: 'Synthetic program config for exam sitting history smoke test',
      fixedSemester: 'ODD',
      displayOrder: 999,
      targetClassLevels: ['X'],
      isActive: true,
    },
  });

  const startTime = new Date('2026-02-18T07:30:00.000Z');
  const endTime = new Date('2026-02-18T09:00:00.000Z');
  const secondStartTime = new Date('2026-02-19T07:30:00.000Z');
  const secondEndTime = new Date('2026-02-19T09:00:00.000Z');

  const packet = await prisma.examPacket.create({
    data: {
      title: `Smoke Test Exam Sitting ${sourceClass.name}`,
      subjectId: subject.id,
      authorId: teacherActor.id,
      academicYearId: sourceYear.id,
      description: 'Synthetic packet for exam sitting history smoke test',
      duration: 90,
      semester: 'ODD',
      type: 'SAS',
      programCode,
      questions: [
        {
          id: 'q1',
          type: 'MULTIPLE_CHOICE',
          question_text: 'Question 1',
          content: 'Question 1',
          score: 1,
          options: [
            { id: 'A', content: 'Option A', is_correct: true },
            { id: 'B', content: 'Option B', is_correct: false },
          ],
        },
        {
          id: 'q2',
          type: 'ESSAY',
          question_text: 'Question 2',
          content: 'Question 2',
          score: 1,
        },
      ],
    },
    select: { id: true, title: true },
  });

  const [scheduleOne, scheduleTwo] = await Promise.all([
    prisma.examSchedule.create({
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
        room: null,
        examType: programCode,
        isActive: true,
      },
      select: { id: true, room: true, startTime: true, endTime: true, sessionLabel: true },
    }),
    prisma.examSchedule.create({
      data: {
        classId: sourceClass.id,
        subjectId: subject.id,
        academicYearId: sourceYear.id,
        startTime: secondStartTime,
        endTime: secondEndTime,
        sessionLabel: 'Sesi 2',
        proctorId: teacherActor.id,
        packetId: packet.id,
        semester: 'ODD',
        room: null,
        examType: programCode,
        isActive: true,
      },
      select: { id: true, room: true, startTime: true, endTime: true, sessionLabel: true },
    }),
  ]);

  const initialSitting = await callHandler(createExamSitting, {
    body: {
      roomName: roomA.name,
      academicYearId: sourceYear.id,
      programCode,
      semester: 'ODD',
      sessionLabel: 'Sesi 1',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      proctorId: teacherActor.id,
      studentIds: sampleStudents.map((student) => student.id),
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const initialSittingId = Number(initialSitting?.data?.id || 0);
  if (!Number.isFinite(initialSittingId) || initialSittingId <= 0) {
    throw new Error('Gagal membuat sitting awal untuk smoke test exam sitting.');
  }

  const session = await prisma.studentExamSession.create({
    data: {
      studentId: sampleStudents[0].id,
      scheduleId: scheduleOne.id,
      status: 'COMPLETED',
      startTime,
      submitTime: new Date('2026-02-18T08:40:00.000Z'),
      score: 92,
      answers: {
        q1: 'A',
        q2: 'Synthetic essay answer',
        __monitoring: {
          totalViolations: 0,
          tabSwitchCount: 0,
          fullscreenExitCount: 0,
          appSwitchCount: 0,
          currentQuestionIndex: 1,
          currentQuestionNumber: 2,
          currentQuestionId: 'q2',
          lastSyncAt: '2026-02-18T08:40:00.000Z',
        },
      },
    },
    select: { id: true },
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
      studentStatus: true,
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

  const detail = await callHandler(getExamSittingDetail, {
    params: { id: String(initialSittingId) },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const sessionDetail = await callHandler(getSessionDetail, {
    params: { id: String(session.id) },
    headers: {},
    user: {
      id: teacherActor.id,
      role: teacherActor.role,
    },
  });

  const updatedSitting = await callHandler(updateExamSitting, {
    params: { id: String(initialSittingId) },
    body: {
      roomName: roomB.name,
      academicYearId: sourceYear.id,
      programCode,
      semester: 'ODD',
      sessionLabel: 'Sesi 1',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      proctorId: teacherActor.id,
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const updatedStudentsResponse = await callHandler(updateSittingStudents, {
    params: { id: String(initialSittingId) },
    body: {
      studentIds: sampleStudents.map((student) => student.id),
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const postPromotionCreatedSitting = await callHandler(createExamSitting, {
    body: {
      roomName: roomA.name,
      academicYearId: sourceYear.id,
      programCode,
      semester: 'ODD',
      sessionLabel: 'Sesi 2',
      startTime: secondStartTime.toISOString(),
      endTime: secondEndTime.toISOString(),
      proctorId: teacherActor.id,
      studentIds: sampleStudents.map((student) => student.id),
    },
    user: {
      id: adminActor.id,
      role: adminActor.role,
    },
  });

  const [scheduleOneAfter, scheduleTwoAfter] = await Promise.all([
    prisma.examSchedule.findUnique({
      where: { id: scheduleOne.id },
      select: { id: true, room: true },
    }),
    prisma.examSchedule.findUnique({
      where: { id: scheduleTwo.id },
      select: { id: true, room: true },
    }),
  ]);

  const detailStudents = detail?.data?.students || [];
  const sessionStudentClass = sessionDetail?.data?.session?.student?.class || null;
  const secondSittingStudents = postPromotionCreatedSitting?.data?.students || [];
  const checks = [];

  assertCondition(
    checks,
    Number(commitResult.run.id) > 0,
    'Commit promotion source year untuk smoke test exam sitting berhasil',
    { runId: commitResult.run.id, sittingId: initialSittingId },
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
    Array.isArray(detailStudents) && detailStudents.length === sampleStudents.length,
    'Detail exam sitting setelah promotion tetap memuat seluruh siswa source class',
    detailStudents,
  );
  assertCondition(
    checks,
    detailStudents.every((student) => String(student.studentClass?.name || '') === sourceClass.name),
    'Detail exam sitting tetap menampilkan class historis source year',
    detailStudents,
  );
  assertCondition(
    checks,
    String(sessionStudentClass?.name || '') === sourceClass.name,
    'Session detail ujian tetap menampilkan class historis source year',
    sessionDetail?.data?.session?.student || null,
  );
  assertCondition(
    checks,
    Boolean(updatedSitting?.success),
    'Update exam sitting source year setelah promotion tetap berhasil untuk program khusus kelas X',
    updatedSitting?.data || null,
  );
  assertCondition(
    checks,
    String(scheduleOneAfter?.room || '') === roomB.name,
    'Update exam sitting tetap menyinkronkan room ke schedule source year yang benar',
    scheduleOneAfter,
  );
  assertCondition(
    checks,
    Boolean(updatedStudentsResponse?.success),
    'Update daftar siswa sitting setelah promotion tetap lolos validasi class scope historis',
    updatedStudentsResponse || null,
  );
  assertCondition(
    checks,
    Boolean(postPromotionCreatedSitting?.success) && Number(postPromotionCreatedSitting?.data?.id || 0) > 0,
    'Create exam sitting source year setelah promotion tetap berhasil untuk program khusus kelas X',
    postPromotionCreatedSitting?.data || null,
  );
  assertCondition(
    checks,
    secondSittingStudents.every(
      (row) => String(row?.student?.studentClass?.name || '') === sourceClass.name,
    ),
    'Create exam sitting pasca-promotion mengembalikan roster dengan class historis source year',
    secondSittingStudents,
  );
  assertCondition(
    checks,
    String(scheduleTwoAfter?.room || '') === roomA.name,
    'Create exam sitting pasca-promotion tetap menyinkronkan room ke schedule source year yang benar',
    scheduleTwoAfter,
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
        resources: {
          packetId: packet.id,
          programCode,
          scheduleOneId: scheduleOne.id,
          scheduleTwoId: scheduleTwo.id,
          initialSittingId,
          secondSittingId: Number(postPromotionCreatedSitting?.data?.id || 0),
          sessionId: session.id,
          roomA: roomA.name,
          roomB: roomB.name,
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
console.log(`- Program code  : ${result.resources.programCode}`);
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
