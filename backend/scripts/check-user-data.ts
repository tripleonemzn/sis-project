
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUser() {
  const username = 'KGB2G071';
  console.log(`Checking user with username: ${username}`);

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      teacherClasses: true, 
    }
  });

  if (!user) {
    console.log('User not found!');
    return;
  }
  
  const userAny = user as any;

  console.log('User found:', {
    id: user.id,
    name: user.name,
    role: user.role,
    additionalDuties: user.additionalDuties
  });

  console.log('Teacher Classes (Wali Kelas):', userAny.teacherClasses);

  // Cross check with Class table directly
  const classesAsTeacher = await prisma.class.findMany({
    where: { teacherId: user.id }
  });
  console.log('Classes where teacherId matches user.id:', classesAsTeacher);

  // Check if user has WALI_KELAS in additionalDuties
  const isWaliKelasEnum = user.additionalDuties.includes('WALI_KELAS');
  console.log('Has WALI_KELAS in additionalDuties enum:', isWaliKelasEnum);
}

checkUser()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
