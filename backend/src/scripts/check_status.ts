
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUnassigned() {
  const unassignedClasses = await prisma.class.findMany({
    where: { teacherId: null },
    include: { academicYear: true, major: true }
  });

  const totalClasses = await prisma.class.count();
  const assignedClasses = totalClasses - unassignedClasses.length;

  console.log(`Total Classes: ${totalClasses}`);
  console.log(`Assigned: ${assignedClasses}`);
  console.log(`Unassigned: ${unassignedClasses.length}`);

  if (unassignedClasses.length > 0) {
    console.log('\nUnassigned Classes:');
    unassignedClasses.forEach(c => {
      console.log(`- ${c.name} (${c.major.code})`);
    });
  }
}

checkUnassigned()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
