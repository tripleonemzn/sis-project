
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTutor() {
  console.log('Checking for users with role EXTRACURRICULAR_TUTOR...');
  const tutors = await prisma.user.findMany({
    where: { role: Role.EXTRACURRICULAR_TUTOR },
    select: { id: true, username: true, name: true }
  });

  console.log('Tutors found:', tutors);

  // Cast to any to bypass type issues with generated client
  const assignments = await (prisma as any).ekstrakurikulerTutorAssignment.findMany({
    include: {
      tutor: { select: { id: true, username: true, name: true, role: true } },
      ekskul: { select: { name: true } }
    }
  });

  console.log('Assignments found:', assignments.map((a: any) => ({
    tutor: a.tutor.username,
    role: a.tutor.role,
    ekskul: a.ekskul.name
  })));
}

checkTutor()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
