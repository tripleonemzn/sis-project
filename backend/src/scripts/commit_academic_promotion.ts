import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../utils/prisma';
import { commitAcademicPromotion, getAcademicPromotionWorkspace } from '../services/academicPromotion.service';
import { isAcademicPromotionV2Enabled } from '../config/featureFlags';
import { writeAuditLog } from '../utils/auditLog';

type CliArgs = {
  sourceYearId: number;
  targetYearId: number;
  actorId: number;
  activateTargetYear: boolean;
  confirm: boolean;
  outputPath: string | null;
};

function printUsage() {
  console.log(`
Usage:
  npm run promotion:commit -- --source-year <id> --target-year <id> --actor-id <id> [options]

Options:
  --activate-target   Aktifkan tahun target setelah commit.
  --output <path>     Tulis hasil commit ke file JSON.
  --yes               Jalankan commit. Tanpa ini script hanya menolak eksekusi.
  -h, --help          Tampilkan bantuan.
`);
}

function parseArgs(argv: string[]): CliArgs {
  let sourceYearId = 0;
  let targetYearId = 0;
  let actorId = 0;
  let activateTargetYear = false;
  let confirm = false;
  let outputPath: string | null = null;

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
    if (arg === '--actor-id' && next) {
      actorId = Number(next);
      index += 1;
      continue;
    }
    if (arg === '--activate-target') {
      activateTargetYear = true;
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

  if (!Number.isFinite(sourceYearId) || sourceYearId <= 0 || !Number.isFinite(targetYearId) || targetYearId <= 0) {
    printUsage();
    throw new Error('Argumen --source-year dan --target-year wajib diisi dengan angka valid.');
  }
  if (!Number.isFinite(actorId) || actorId <= 0) {
    throw new Error('Argumen --actor-id wajib diisi dengan ID admin yang valid.');
  }

  return {
    sourceYearId,
    targetYearId,
    actorId,
    activateTargetYear,
    confirm,
    outputPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!isAcademicPromotionV2Enabled()) {
    throw new Error('Feature flag ACADEMIC_PROMOTION_V2_ENABLED masih OFF. Commit diblokir.');
  }

  if (!args.confirm) {
    throw new Error('Tambahkan --yes untuk mengeksekusi commit promotion.');
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

  const workspace = await getAcademicPromotionWorkspace(args.sourceYearId, args.targetYearId);
  if (!workspace.validation.readyToCommit) {
    throw new Error(`Promotion belum siap di-commit: ${workspace.validation.errors.join('; ')}`);
  }

  const result = await commitAcademicPromotion({
    sourceAcademicYearId: args.sourceYearId,
    targetAcademicYearId: args.targetYearId,
    activateTargetYear: args.activateTargetYear,
    actor: { id: actor.id },
  });

  await writeAuditLog(
    actor.id,
    actor.role,
    Array.isArray(actor.additionalDuties) ? actor.additionalDuties : null,
    'COMMIT',
    'ACADEMIC_PROMOTION',
    result.run.id,
    null,
    {
      sourceAcademicYearId: args.sourceYearId,
      targetAcademicYearId: args.targetYearId,
      activateTargetYear: args.activateTargetYear,
      summary: result.summary,
    },
    'Commit promotion kenaikan kelas dan alumni via script',
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
    targetAcademicYearId: args.targetYearId,
    activateTargetYear: args.activateTargetYear,
    result,
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(path.dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, serialized, 'utf8');
    console.log(`Commit result berhasil ditulis ke ${args.outputPath}`);
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
