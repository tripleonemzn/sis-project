
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { name: { contains: 'Syahdan' } },
    include: { documents: true }
  });

  if (user) {
    console.log(`User Found: ID=${user.id}, Name=${user.name}`);
    console.log('Documents:', JSON.stringify(user.documents, null, 2));
  } else {
    console.log('User "examiner" not found');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
