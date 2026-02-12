
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const totalStudents = await prisma.user.count({
    where: { role: 'STUDENT' }
  });

  const activeStudents = await prisma.user.count({
    where: { 
      role: 'STUDENT',
      studentStatus: 'ACTIVE'
    }
  });

  const nonActiveStudents = await prisma.user.groupBy({
    by: ['studentStatus'],
    where: { role: 'STUDENT' },
    _count: {
      studentStatus: true
    }
  });

  console.log(`Total Students in DB: ${totalStudents}`);
  console.log(`Active Students in DB: ${activeStudents}`);
  console.log('Breakdown by Status:', nonActiveStudents);

  // Check valid classes
  const studentsWithoutClass = await prisma.user.count({
    where: {
      role: 'STUDENT',
      classId: null
    }
  });
  console.log(`Students without class: ${studentsWithoutClass}`);

}

main().finally(() => prisma.$disconnect());
