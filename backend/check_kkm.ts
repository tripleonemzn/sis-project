
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.teacherAssignment.findMany({
    include: {
      subject: true,
      class: true
    }
  });

  const target = assignments.find(a => {
      const thresholds = a.competencyThresholds as any;
      return thresholds?.A?.includes('switching, routing, NAT');
  });

  if (target) {
      console.log('Found Target Assignment:');
      console.log(`- Class: ${target.class.name}`);
      console.log(`- Subject: ${target.subject.name}`);
      console.log(`- KKM: ${target.kkm}`);
      console.log(`- Thresholds:`, target.competencyThresholds);
  } else {
      console.log('Target assignment not found');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
