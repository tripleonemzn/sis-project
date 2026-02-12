import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const exams = await prisma.examPacket.findMany({
    select: {
      id: true,
      title: true,
      type: true,
      kkm: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(exams, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
