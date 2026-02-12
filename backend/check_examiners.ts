
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const examiners = await prisma.user.findMany({
      where: { role: 'EXAMINER' },
      select: { id: true, name: true, username: true, role: true }
    });
    console.log('Examiners found:', JSON.stringify(examiners, null, 2));

    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      take: 2,
      select: { id: true, name: true, role: true }
    });
    console.log('Sample Teachers:', JSON.stringify(teachers, null, 2));

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
