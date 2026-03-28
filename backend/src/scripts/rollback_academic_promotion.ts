import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../utils/prisma';
import { isAcademicPromotionV2Enabled } from '../config/featureFlags';
import { rollbackAcademicPromotion } from '../services/academicPromotion.service';
import { writeAuditLog } from '../utils/auditLog';

type CliArgs = {
  runId: number;
  sourceYearId: number;
  actorId: number;
  confirm: boolean;
  outputPath: string | null;
};

function printUsage() {
  console.log(`
Usage:
  npm run promotion:rollback -- --run-id <id> --source-year <id> --actor-id <id> [options]

Options:
  --output <path>     Tulis hasil rollback ke file JSON.
  --yes               Jalankan rollback sungguhan. Tanpa ini script hanya menolak eksekusi.
  -h, --help          Tampilkan bantuan.
`);
}

function parseArgs(argv: string[]): CliArgs {
  let runId = 0;
  let sourceYearId = 0;
  let actorId = 0;
  let confirm = false;
  let outputPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--run-id' && next) {
      runId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--source-year' && next) {
      sourceYearId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--actor-id' && next) {
      actorId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--yes') {
      confirm = true;
      continue;
    }
    if (arg === '--output' && next) {
      outputPath = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(runId) || runId <= 0) {
    throw new Error('Argumen --run-id wajib diisi dengan angka valid.');
  }
  if (!Number.isFinite(sourceYearId) || sourceYearId <= 0) {
    throw new Error('Argumen --source-year wajib diisi dengan angka valid.');
  }
  if (!Number.isFinite(actorId) || actorId <= 0) {
    throw new Error('Argumen --actor-id wajib diisi dengan angka valid.');
  }

  return {
    runId,
    sourceYearId,
    actorId,
    confirm,
    outputPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isAcademicPromotionV2Enabled()) {
    throw new Error('Feature flag ACADEMIC_PROMOTION_V2_ENABLED masih OFF. Rollback diblokir.');
  }

  if (!args.confirm) {
    throw new Error('Tambahkan --yes untuk mengeksekusi rollback promotion.');
  }

  const actor = await prisma.user.findUnique({
    where: { id: args.actorId },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      additionalDuties: true,
    },
  });

  if (!actor || actor.role !== 'ADMIN') {
    throw new Error(`Actor #${args.actorId} tidak ditemukan atau bukan ADMIN.`);
  }

  const result = await rollbackAcademicPromotion({
    runId: args.runId,
    sourceAcademicYearId: args.sourceYearId,
    actor: {
      id: actor.id,
      name: actor.name,
      username: actor.username,
    },
  });

  await writeAuditLog(
    actor.id,
    actor.role,
    Array.isArray(actor.additionalDuties) ? actor.additionalDuties : null,
    'ROLLBACK',
    'ACADEMIC_PROMOTION',
    args.runId,
    null,
    {
      sourceAcademicYearId: args.sourceYearId,
      targetAcademicYearId: result.run.targetAcademicYearId,
      rollback: result.rollback,
    },
    'Rollback promotion kenaikan kelas dan alumni via script',
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    actor: {
      id: actor.id,
      name: actor.name,
      username: actor.username,
      role: actor.role,
    },
    sourceAcademicYearId: args.sourceYearId,
    runId: args.runId,
    result,
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(path.dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, serialized, 'utf8');
    console.log(`Rollback result berhasil ditulis ke ${args.outputPath}`);
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
