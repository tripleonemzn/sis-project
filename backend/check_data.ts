
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  const ekskuls = await prisma.ekstrakurikuler.findMany({ take: 5 });
  const students = await prisma.user.findMany({ where: { role: 'STUDENT' }, take: 5 });
  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });

  console.log('Ekskuls:', ekskuls);
  console.log('Students:', students.map(s => ({ id: s.id, name: s.name })));
  console.log('Active Academic Year:', academicYear);
}

checkData()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
