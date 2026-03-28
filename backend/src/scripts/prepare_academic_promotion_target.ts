import prisma from '../utils/prisma';

type Options = {
  sourceYearId: number;
  targetName?: string;
  apply: boolean;
  semester1Start?: Date;
  semester1End?: Date;
  semester2Start?: Date;
  semester2End?: Date;
};

function parseArgs(argv: string[]): Options {
  let sourceYearId = 0;
  let targetName = '';
  let apply = false;
  let semester1Start = '';
  let semester1End = '';
  let semester2Start = '';
  let semester2End = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--source-year':
        sourceYearId = Number(argv[index + 1] || '0');
        index += 1;
        break;
      case '--target-name':
        targetName = String(argv[index + 1] || '').trim();
        index += 1;
        break;
      case '--semester1-start':
        semester1Start = String(argv[index + 1] || '').trim();
        index += 1;
        break;
      case '--semester1-end':
        semester1End = String(argv[index + 1] || '').trim();
        index += 1;
        break;
      case '--semester2-start':
        semester2Start = String(argv[index + 1] || '').trim();
        index += 1;
        break;
      case '--semester2-end':
        semester2End = String(argv[index + 1] || '').trim();
        index += 1;
        break;
      case '--apply':
        apply = true;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Opsi tidak dikenal: ${arg}`);
    }
  }

  if (!Number.isInteger(sourceYearId) || sourceYearId <= 0) {
    throw new Error('--source-year wajib diisi dengan integer positif.');
  }

  return {
    sourceYearId,
    targetName: targetName || undefined,
    apply,
    semester1Start: semester1Start ? parseDateArg('--semester1-start', semester1Start) : undefined,
    semester1End: semester1End ? parseDateArg('--semester1-end', semester1End) : undefined,
    semester2Start: semester2Start ? parseDateArg('--semester2-start', semester2Start) : undefined,
    semester2End: semester2End ? parseDateArg('--semester2-end', semester2End) : undefined,
  };
}

function printUsage() {
  console.log(`Usage:
  npm run promotion:prepare-target -- --source-year <ID> [options]

Options:
  --target-name <name>         Nama tahun target. Default: hasil derivasi dari source year.
  --semester1-start <date>     Override tanggal semester 1 mulai (YYYY-MM-DD).
  --semester1-end <date>       Override tanggal semester 1 selesai (YYYY-MM-DD).
  --semester2-start <date>     Override tanggal semester 2 mulai (YYYY-MM-DD).
  --semester2-end <date>       Override tanggal semester 2 selesai (YYYY-MM-DD).
  --apply                      Tulis perubahan ke database. Default: dry-run.
  -h, --help                   Tampilkan bantuan.
`);
}

function parseDateArg(label: string, raw: string) {
  const value = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${label} tidak valid: ${raw}`);
  }
  return value;
}

function addYears(date: Date, years: number) {
  const value = new Date(date);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value;
}

function deriveTargetName(sourceName: string) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `Promotion Target ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd}`;
}

function buildTargetClassName(sourceName: string, sourceLevel: string) {
  const trimmed = String(sourceName || '').trim();
  if (sourceLevel === 'X') {
    if (/^X\s+/i.test(trimmed)) return trimmed.replace(/^X(\s+)/i, 'XI$1');
    return `XI ${trimmed}`;
  }
  if (sourceLevel === 'XI') {
    if (/^XI\s+/i.test(trimmed)) return trimmed.replace(/^XI(\s+)/i, 'XII$1');
    return `XII ${trimmed}`;
  }
  return trimmed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const sourceYear = await prisma.academicYear.findUnique({
    where: { id: options.sourceYearId },
    include: {
      classes: {
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          level: true,
          majorId: true,
          major: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  if (!sourceYear) {
    throw new Error(`Tahun sumber tidak ditemukan: ${options.sourceYearId}`);
  }

  const targetYearName = options.targetName || deriveTargetName(sourceYear.name);
  const targetDates = {
    semester1Start: options.semester1Start || addYears(sourceYear.semester1Start, 1),
    semester1End: options.semester1End || addYears(sourceYear.semester1End, 1),
    semester2Start: options.semester2Start || addYears(sourceYear.semester2Start, 1),
    semester2End: options.semester2End || addYears(sourceYear.semester2End, 1),
  };

  const promotionSourceClasses = sourceYear.classes.filter((item) => item.level === 'X' || item.level === 'XI');
  if (promotionSourceClasses.length === 0) {
    throw new Error(`Tahun sumber ${sourceYear.name} tidak memiliki kelas X/XI untuk promotion.`);
  }

  let targetYear = await prisma.academicYear.findFirst({
    where: { name: targetYearName },
    include: {
      classes: {
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          level: true,
          majorId: true,
          _count: { select: { students: true } },
        },
      },
    },
  });

  const existingTargetClassNames = new Set((targetYear?.classes || []).map((item) => item.name.toLowerCase()));
  const plannedTargetClasses = promotionSourceClasses.map((item) => ({
    sourceClassId: item.id,
    sourceClassName: item.name,
    sourceLevel: item.level,
    targetLevel: item.level === 'X' ? 'XI' : 'XII',
    targetClassName: buildTargetClassName(item.name, item.level),
    majorId: item.majorId,
    majorCode: item.major.code,
    majorName: item.major.name,
    exists: existingTargetClassNames.has(buildTargetClassName(item.name, item.level).toLowerCase()),
  }));

  const classesToCreate = plannedTargetClasses.filter((item) => !item.exists);

  if (options.apply) {
    await prisma.$transaction(async (tx) => {
      if (!targetYear) {
        targetYear = await tx.academicYear.create({
          data: {
            name: targetYearName,
            isActive: false,
            semester1Start: targetDates.semester1Start,
            semester1End: targetDates.semester1End,
            semester2Start: targetDates.semester2Start,
            semester2End: targetDates.semester2End,
            pklEligibleGrades: sourceYear.pklEligibleGrades,
          } as any,
          include: {
            classes: {
              orderBy: [{ level: 'asc' }, { name: 'asc' }],
              select: {
                id: true,
                name: true,
                level: true,
                majorId: true,
                _count: { select: { students: true } },
              },
            },
          },
        });
      }

      const currentTargetNames = new Set(
        (
          await tx.class.findMany({
            where: { academicYearId: targetYear.id },
            select: { name: true },
          })
        ).map((item) => item.name.toLowerCase()),
      );

      const finalClassesToCreate = plannedTargetClasses.filter(
        (item) => !currentTargetNames.has(item.targetClassName.toLowerCase()),
      );

      if (finalClassesToCreate.length > 0) {
        await tx.class.createMany({
          data: finalClassesToCreate.map((item) => ({
            name: item.targetClassName,
            level: item.targetLevel,
            majorId: item.majorId,
            academicYearId: targetYear!.id,
            teacherId: null,
            presidentId: null,
          })),
        });
      }
    });

    targetYear = await prisma.academicYear.findFirst({
      where: { name: targetYearName },
      include: {
        classes: {
          orderBy: [{ level: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            level: true,
            majorId: true,
            _count: { select: { students: true } },
          },
        },
      },
    });
  }

  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    sourceYear: {
      id: sourceYear.id,
      name: sourceYear.name,
      isActive: sourceYear.isActive,
    },
    targetYear: {
      id: targetYear?.id || null,
      name: targetYearName,
      exists: Boolean(targetYear),
      isActive: targetYear?.isActive || false,
      semester1Start: targetDates.semester1Start.toISOString(),
      semester1End: targetDates.semester1End.toISOString(),
      semester2Start: targetDates.semester2Start.toISOString(),
      semester2End: targetDates.semester2End.toISOString(),
    },
    summary: {
      promotionSourceClasses: promotionSourceClasses.length,
      plannedTargetClasses: plannedTargetClasses.length,
      classesAlreadyExisting: plannedTargetClasses.filter((item) => item.exists).length,
      classesToCreate: classesToCreate.length,
    },
    targetClasses: plannedTargetClasses,
    notes: [
      'Script ini hanya menyiapkan kelas target XI/XII untuk promotion.',
      'Kelas X tahun baru tetap mengikuti alur PPDB/persiapan kelas reguler.',
      options.apply
        ? 'Perubahan sudah ditulis ke database.'
        : 'Dry-run saja. Tambahkan --apply jika hasil sudah benar.',
    ],
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
