
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupTutorTest() {
  console.log('Cleaning up Tutor Test data...');

  const username = 'tutor_pramuka_test';
  
  // Find user
  const user = await prisma.user.findUnique({ where: { username } });
  
  if (user) {
    // Delete assignments
    await prisma.ekstrakurikulerTutorAssignment.deleteMany({
      where: { tutorId: user.id }
    });
    console.log('Deleted assignments.');

    // Delete user
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`Deleted user: ${username}`);
  } else {
    console.log('User not found.');
  }

  // Optional: Delete enrollment if created specifically for test (id 956 in ekskul 4)
  // Check if it has grades, if not, maybe delete? 
  // Better safe: Only delete if no grades are set, or just leave it as enrollment is harmless.
  // I will check if grades are empty before deleting.
  const enrollment = await prisma.ekstrakurikulerEnrollment.findFirst({
      where: { studentId: 956, ekskulId: 4, academicYearId: 4 }
  });

  if (enrollment) {
      if (!enrollment.grade && !enrollment.gradeSas && !enrollment.gradeSat && !enrollment.gradeSbtsOdd && !enrollment.gradeSbtsEven) {
          await prisma.ekstrakurikulerEnrollment.delete({ where: { id: enrollment.id } });
          console.log('Deleted empty enrollment for student 956.');
      } else {
          console.log('Enrollment has grades, skipping delete to preserve history (or clean manually).');
      }
  }

  console.log('Cleanup complete.');
}

cleanupTutorTest()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
