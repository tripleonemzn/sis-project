
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Inspecting KKM data for KK16...');

  const subject = await prisma.subject.findUnique({
    where: { code: 'KK16' },
    include: {
      kkms: true
    }
  });

  if (!subject) {
    console.log('Subject KK16 not found');
    return;
  }

  console.log('Subject:', {
    id: subject.id,
    name: subject.name,
    code: subject.code,
    kkms: subject.kkms
  });

  const assignments = await prisma.teacherAssignment.findMany({
    where: {
      subjectId: subject.id,
      teacher: {
        name: {
          contains: 'Nira', // Nira Windy Andini
        }
      }
    },
    include: {
      class: true
    }
  });

  console.log('Assignments for Nira + KK16:');
  assignments.forEach(a => {
    console.log(`- Class: ${a.class.name} (Level: ${a.class.level}), Assignment KKM: ${a.kkm}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
