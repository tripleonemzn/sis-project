import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../utils/prisma';
import { getAcademicPromotionWorkspace } from '../services/academicPromotion.service';
import { getAcademicFeatureFlags } from '../config/featureFlags';

type CliArgs = {
  sourceYearId: number;
  targetYearId: number;
  runId: number | null;
  outputPath: string | null;
  sampleSize: number;
};

function printUsage() {
  console.log(`
Usage:
  npm run promotion:export-snapshot -- --source-year <id> --target-year <id> [options]

Options:
  --run-id <id>          Sertakan detail run tertentu.
  --output <path>        Tulis JSON ke file.
  --sample-size <n>      Jumlah sample per level. Default: 3
  -h, --help             Tampilkan bantuan.
`);
}

function parseArgs(argv: string[]): CliArgs {
  let sourceYearId = 0;
  let targetYearId = 0;
  let runId: number | null = null;
  let outputPath: string | null = null;
  let sampleSize = 3;

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
    if (arg === '--output' && next) {
      outputPath = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === '--sample-size' && next) {
      sampleSize = Number(next);
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

  if (!Number.isFinite(sampleSize) || sampleSize <= 0) {
    throw new Error('Nilai --sample-size tidak valid.');
  }

  return {
    sourceYearId,
    targetYearId,
    runId,
    outputPath,
    sampleSize,
  };
}

async function loadSamplesForLevel(sourceYearId: number, level: string, sampleSize: number) {
  return prisma.user.findMany({
    where: {
      role: 'STUDENT',
      studentClass: {
        academicYearId: sourceYearId,
        level,
      },
    },
    orderBy: { id: 'asc' },
    take: sampleSize,
    select: {
      id: true,
      username: true,
      name: true,
      nis: true,
      nisn: true,
      studentStatus: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          level: true,
          academicYearId: true,
        },
      },
      academicMemberships: {
        orderBy: [{ academicYearId: 'asc' }],
        select: {
          academicYearId: true,
          classId: true,
          status: true,
          isCurrent: true,
        },
      },
    },
  });
}

async function loadRunDetails(runId: number) {
  const run = await prisma.promotionRun.findUnique({
    where: { id: runId },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
        },
      },
      items: {
        orderBy: [{ id: 'asc' }],
        take: 20,
        select: {
          id: true,
          studentId: true,
          sourceClassId: true,
          targetClassId: true,
          action: true,
          beforeStudentStatus: true,
          afterStudentStatus: true,
          note: true,
        },
      },
    },
  });

  if (!run) {
    throw new Error(`Promotion run #${runId} tidak ditemukan.`);
  }

  return run;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspace = await getAcademicPromotionWorkspace(args.sourceYearId, args.targetYearId);

  const [xSamples, xiSamples, xiiSamples, runDetails] = await Promise.all([
    loadSamplesForLevel(args.sourceYearId, 'X', args.sampleSize),
    loadSamplesForLevel(args.sourceYearId, 'XI', args.sampleSize),
    loadSamplesForLevel(args.sourceYearId, 'XII', args.sampleSize),
    args.runId ? loadRunDetails(args.runId) : Promise.resolve(null),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    featureFlags: getAcademicFeatureFlags(),
    workspace: {
      sourceAcademicYear: workspace.sourceAcademicYear,
      targetAcademicYear: workspace.targetAcademicYear,
      summary: workspace.summary,
      validation: workspace.validation,
      classes: workspace.classes.map((item) => ({
        sourceClassId: item.sourceClassId,
        sourceClassName: item.sourceClassName,
        sourceLevel: item.sourceLevel,
        studentCount: item.studentCount,
        major: item.major,
        action: item.action,
        expectedTargetLevel: item.expectedTargetLevel,
        targetClassId: item.targetClassId,
        targetClassName: item.targetClassName,
        suggestedTargetClassId: item.suggestedTargetClassId,
        mappingSource: item.mappingSource,
        targetCurrentStudentCount: item.targetCurrentStudentCount,
        validation: item.validation,
      })),
      recentRuns: workspace.recentRuns,
    },
    samples: {
      sourceYear: {
        X: xSamples,
        XI: xiSamples,
        XII: xiiSamples,
      },
    },
    run: runDetails,
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(path.dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, serialized, 'utf8');
    console.log(`Snapshot berhasil ditulis ke ${args.outputPath}`);
    return;
  }

  process.stdout.write(serialized);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
