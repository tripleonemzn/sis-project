import prisma from '../utils/prisma';
import { getAcademicPromotionWorkspace } from '../services/academicPromotion.service';

type CliArgs = {
  sourceYearId: number;
  targetYearId: number;
  runId: number | null;
};

function printUsage() {
  console.log(`
Usage:
  npm run promotion:audit -- --source-year <id> --target-year <id> [--run-id <id>]

Examples:
  npm run promotion:audit -- --source-year 12 --target-year 13
  npm run promotion:audit -- --source-year 12 --target-year 13 --run-id 4
`);
}

function parseArgs(argv: string[]): CliArgs {
  let sourceYearId = 0;
  let targetYearId = 0;
  let runId: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--source-year' && next) {
      sourceYearId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--target-year' && next) {
      targetYearId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--run-id' && next) {
      runId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(sourceYearId) || sourceYearId <= 0 || !Number.isFinite(targetYearId) || targetYearId <= 0) {
    printUsage();
    throw new Error('Argumen --source-year dan --target-year wajib diisi dengan angka valid.');
  }

  if (runId !== null && (!Number.isFinite(runId) || runId <= 0)) {
    throw new Error('Nilai --run-id tidak valid.');
  }

  return {
    sourceYearId,
    targetYearId,
    runId,
  };
}

function logSection(title: string) {
  console.log('');
  console.log(`== ${title} ==`);
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function auditRunConsistency(runId: number) {
  const run = await prisma.promotionRun.findUnique({
    where: { id: runId },
    include: {
      items: true,
      sourceAcademicYear: {
        select: { id: true, name: true },
      },
      targetAcademicYear: {
        select: { id: true, name: true },
      },
    },
  });

  if (!run) {
    throw new Error(`Promotion run #${runId} tidak ditemukan.`);
  }

  const promotedStudentIds = Array.from(
    new Set(run.items.filter((item) => item.action === 'PROMOTE').map((item) => item.studentId)),
  );
  const graduatedStudentIds = Array.from(
    new Set(run.items.filter((item) => item.action === 'GRADUATE').map((item) => item.studentId)),
  );

  const [promotedUsers, graduatedUsers, promotedMemberships, sourceMemberships] = await Promise.all([
    promotedStudentIds.length > 0
      ? prisma.user.findMany({
          where: {
            id: { in: promotedStudentIds },
          },
          select: {
            id: true,
            classId: true,
            studentStatus: true,
          },
        })
      : Promise.resolve([]),
    graduatedStudentIds.length > 0
      ? prisma.user.findMany({
          where: {
            id: { in: graduatedStudentIds },
          },
          select: {
            id: true,
            classId: true,
            studentStatus: true,
          },
        })
      : Promise.resolve([]),
    promotedStudentIds.length > 0
      ? prisma.studentAcademicMembership.findMany({
          where: {
            studentId: { in: promotedStudentIds },
            academicYearId: run.targetAcademicYearId,
            isCurrent: true,
          },
          select: {
            studentId: true,
            classId: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    prisma.studentAcademicMembership.findMany({
      where: {
        studentId: { in: run.items.map((item) => item.studentId) },
        academicYearId: run.sourceAcademicYearId,
      },
      select: {
        studentId: true,
        status: true,
        isCurrent: true,
      },
    }),
  ]);

  const problems: string[] = [];
  const invalidPromotedUsers = promotedUsers.filter((item) => item.studentStatus !== 'ACTIVE' || !item.classId);
  const invalidGraduatedUsers = graduatedUsers.filter(
    (item) => item.studentStatus !== 'GRADUATED' || item.classId !== null,
  );

  if (invalidPromotedUsers.length > 0) {
    problems.push(`Ada ${invalidPromotedUsers.length} siswa promote yang snapshot user-nya tidak aktif/kelasnya kosong.`);
  }
  if (invalidGraduatedUsers.length > 0) {
    problems.push(`Ada ${invalidGraduatedUsers.length} siswa alumni yang status/classId-nya belum sinkron.`);
  }
  if (promotedMemberships.length !== promotedStudentIds.length) {
    problems.push(
      `Membership target current hanya ${promotedMemberships.length}/${promotedStudentIds.length} untuk siswa promote.`,
    );
  }
  if (sourceMemberships.some((item) => item.isCurrent)) {
    problems.push('Masih ada membership source year yang bertanda current setelah run commit.');
  }

  logSection(`Audit Run #${run.id}`);
  console.log(`Source : ${run.sourceAcademicYear.name} (#${run.sourceAcademicYear.id})`);
  console.log(`Target : ${run.targetAcademicYear.name} (#${run.targetAcademicYear.id})`);
  console.log(`Commit : ${formatDateTime(run.committedAt || run.createdAt)}`);
  console.log(`Items  : ${run.items.length}`);
  console.log(`Check  : ${problems.length === 0 ? 'PASS' : 'FAIL'}`);

  if (problems.length > 0) {
    problems.forEach((item) => console.log(` - ${item}`));
  }

  return problems;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspace = await getAcademicPromotionWorkspace(args.sourceYearId, args.targetYearId);

  console.log('Academic Promotion Audit');
  console.log(`Source Year : ${workspace.sourceAcademicYear.name} (#${workspace.sourceAcademicYear.id})`);
  console.log(`Target Year : ${workspace.targetAcademicYear.name} (#${workspace.targetAcademicYear.id})`);
  console.log(`Ready       : ${workspace.validation.readyToCommit ? 'YES' : 'NO'}`);

  logSection('Summary');
  console.log(`Total siswa aktif : ${workspace.summary.totalStudents}`);
  console.log(`Naik kelas       : ${workspace.summary.promotedStudents}`);
  console.log(`Menjadi alumni   : ${workspace.summary.graduatedStudents}`);
  console.log(
    `Mapping siap     : ${workspace.summary.configuredPromoteClasses}/${workspace.summary.promotableClasses}`,
  );

  if (workspace.validation.errors.length > 0) {
    logSection('Blocking Issues');
    workspace.validation.errors.forEach((item) => console.log(` - ${item}`));
  }

  if (workspace.validation.warnings.length > 0) {
    logSection('Warnings');
    workspace.validation.warnings.forEach((item) => console.log(` - ${item}`));
  }

  const highlightedClasses = workspace.classes.filter(
    (item) => item.studentCount > 0 || item.validation.errors.length > 0 || item.validation.warnings.length > 0,
  );

  logSection('Class Snapshot');
  if (highlightedClasses.length === 0) {
    console.log('Tidak ada kelas yang perlu ditampilkan.');
  } else {
    highlightedClasses.forEach((item) => {
      console.log(
        `- ${item.sourceClassName}: ${item.studentCount} siswa | ${item.action === 'GRADUATE' ? 'ALUMNI' : `TARGET=${item.targetClassName || '-'}`}`,
      );
      item.validation.errors.forEach((entry) => console.log(`    error   : ${entry}`));
      item.validation.warnings.forEach((entry) => console.log(`    warning : ${entry}`));
    });
  }

  let runProblems: string[] = [];
  if (args.runId) {
    runProblems = await auditRunConsistency(args.runId);
  } else if (workspace.recentRuns.length > 0) {
    console.log('');
    console.log('Latest runs:');
    workspace.recentRuns.forEach((run) => {
      console.log(
        ` - #${run.id} | ${run.promotedStudents} naik | ${run.graduatedStudents} alumni | ${formatDateTime(run.committedAt || run.createdAt)}`,
      );
    });
  }

  const failed = workspace.validation.errors.length > 0 || runProblems.length > 0;
  if (failed) {
    process.exitCode = 2;
    return;
  }

  console.log('');
  console.log('Audit selesai: PASS');
}

main()
  .catch((error) => {
    console.error('');
    console.error('Audit gagal:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
