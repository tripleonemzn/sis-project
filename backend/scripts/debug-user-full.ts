
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = 'KGB2G071';
  console.log(`Checking user: ${username}`);

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      teacherClasses: true,
      trainingClassesTeaching: true,
      teacherAssignments: true,
    },
  });

  if (!user) {
    console.log('User not found!');
    return;
  }

  console.log('User Data:', JSON.stringify(user, null, 2));
  
  // Check if there are any classes that MIGHT be related but not linked
  const allClasses = await prisma.class.findMany();
  console.log('Total classes in DB:', allClasses.length);
  
  // Check if this user is assigned as teacher in any class manually (raw query check if needed, but prisma include should cover it)
  // If teacherClasses is empty, it means class.teacherId is not set to this user.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
