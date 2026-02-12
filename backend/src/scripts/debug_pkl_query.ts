
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Get Active Academic Year
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true }
  });

  if (!activeYear) {
    console.log('No active academic year found!');
    return;
  }

  console.log('Active Academic Year:', activeYear.id, activeYear.name);

  // 2. Simulate the query used in getAllInternships
  const status = 'PROPOSED';
  const academicYearId = activeYear.id;
  
  const where: any = {};
  if (status) where.status = status;
  // Note: The controller now adds academicYearId to filter
  if (academicYearId) where.academicYearId = Number(academicYearId);

  console.log('Query where clause:', JSON.stringify(where, null, 2));

  const count = await prisma.internship.count({ where });
  const internships = await prisma.internship.findMany({
    where,
    include: {
      student: { include: { studentClass: true } },
      teacher: true,
      examiner: true
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    skip: 0
  });

  console.log(`Found ${count} internships matching criteria.`);
  console.log('Internships:', JSON.stringify(internships, null, 2));

  // 3. Check specific internship from previous check
  const internshipId = 4; // Based on previous check
  const specificInternship = await prisma.internship.findUnique({
    where: { id: internshipId },
    select: { id: true, status: true, academicYearId: true }
  });
  console.log(`Internship ID ${internshipId} details:`, specificInternship);
  
  if (specificInternship && specificInternship.academicYearId !== activeYear.id) {
     console.warn(`WARNING: Internship ${internshipId} belongs to Academic Year ${specificInternship.academicYearId}, but Active Year is ${activeYear.id}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
