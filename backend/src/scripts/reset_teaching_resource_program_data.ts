import prisma from '../utils/prisma';

function parseAcademicYearId(argv: string[]): number | null {
  const raw = argv.find((item) => item.startsWith('--academic-year-id='))?.split('=')[1];
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function main() {
  const academicYearId = parseAcademicYearId(process.argv.slice(2));
  const where = academicYearId ? { academicYearId } : undefined;

  const before = await Promise.all([
    prisma.teachingResourceEntry.count({ where }),
    prisma.teachingResourceProgramConfig.count({ where }),
  ]);

  const [deletedEntries, deletedPrograms] = await prisma.$transaction([
    prisma.teachingResourceEntry.deleteMany({ where }),
    prisma.teachingResourceProgramConfig.deleteMany({ where }),
  ]);

  const after = await Promise.all([
    prisma.teachingResourceEntry.count({ where }),
    prisma.teachingResourceProgramConfig.count({ where }),
  ]);

  const scopeLabel = academicYearId ? `academicYearId=${academicYearId}` : 'all academic years';
  console.log(
    JSON.stringify(
      {
        scope: scopeLabel,
        before: {
          entries: before[0],
          programs: before[1],
        },
        deleted: {
          entries: deletedEntries.count,
          programs: deletedPrograms.count,
        },
        after: {
          entries: after[0],
          programs: after[1],
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
