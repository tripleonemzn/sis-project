
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });
  
  if (!activeYear) {
      console.log("No active year found");
      return;
  }
  
  console.log('Active Year:', activeYear.id, activeYear.name);
  
  // Count assignments for this year
  const count = await prisma.teacherAssignment.count({
      where: { academicYearId: activeYear.id }
  });
  
  console.log(`Teacher Assignments for active year (${activeYear.id}): ${count}`);
  
  // Check if there are assignments for ANY year
  const allCount = await prisma.teacherAssignment.count();
  console.log(`Total Teacher Assignments (all years): ${allCount}`);
  
  if (allCount > 0 && count === 0) {
      // Find which year has assignments
      const sample = await prisma.teacherAssignment.findFirst({
          include: { academicYear: true }
      });
      console.log('Sample assignment belongs to year:', sample?.academicYearId, sample?.academicYear?.name);
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
