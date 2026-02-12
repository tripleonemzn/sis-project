
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('Cleaning up dummy tutor data...');

  const username = 'tutor_pramuka_test';

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    console.log('User not found, nothing to clean.');
    return;
  }

  // Delete assignments first
  // Note: Using any cast because the table might be generated differently in client
  const deletedAssignments = await (prisma as any).ekstrakurikulerTutorAssignment.deleteMany({
    where: {
      tutorId: user.id
    }
  });
  console.log(`Deleted ${deletedAssignments.count} assignments.`);

  // Delete user
  const deletedUser = await prisma.user.delete({
    where: { id: user.id }
  });
  console.log(`Deleted user: ${deletedUser.username}`);
}

cleanup()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
