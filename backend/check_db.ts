
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });
  console.log('Active Year:', activeYear);
  
  // Also check if schema has the column
  try {
      const allYears = await prisma.academicYear.findMany({ take: 1 });
      console.log('Sample Year:', allYears[0]);
  } catch (e) {
      console.error('Error fetching years:', e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
