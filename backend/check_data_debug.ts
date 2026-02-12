
import prisma from './src/utils/prisma';

async function main() {
  console.log('--- Checking Active Academic Year ---');
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });
  console.log('Active Year:', activeYear);

  if (!activeYear) {
    console.log('No active academic year found!');
    const latest = await prisma.academicYear.findFirst({ orderBy: { id: 'desc' } });
    console.log('Latest Year:', latest);
    return;
  }

  console.log('\n--- Checking Assignments for Active Year ---');
  const count = await prisma.teacherAssignment.count({
    where: { academicYearId: activeYear.id },
  });
  console.log(`Total Assignments for Year ${activeYear.id}: ${count}`);

  console.log('\n--- Checking Assignments for Siswanto ---');
  const siswanto = await prisma.user.findFirst({
    where: { name: { contains: 'Siswanto' } }
  });
  
  if (siswanto) {
      console.log('Found User:', siswanto.id, siswanto.name, siswanto.role);
      const count = await prisma.teacherAssignment.count({
        where: { 
            academicYearId: activeYear.id,
            teacherId: siswanto.id
        },
      });
      console.log(`Assignments for Siswanto in Year ${activeYear.id}: ${count}`);
  } else {
      console.log('User Siswanto not found');
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
