
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const internships = await prisma.internship.findMany({
    where: {
      status: 'PROPOSED'
    },
    include: {
      student: true,
      academicYear: true
    }
  });

  console.log('Found PROPOSED internships:', internships.length);
  internships.forEach(i => {
    console.log(`- ID: ${i.id}, Student: ${i.student.name}, Year: ${i.academicYear.name}, Created: ${i.createdAt}`);
  });

  // Also check if there are ANY internships for Meisya
  const meisya = await prisma.user.findFirst({
    where: { name: { contains: 'Meisya', mode: 'insensitive' } }
  });

  if (meisya) {
    console.log(`\nFound Student Meisya (ID: ${meisya.id})`);
    const studentInternships = await prisma.internship.findMany({
      where: { studentId: meisya.id },
      include: { academicYear: true }
    });
    console.log('Meisya Internships:', studentInternships);
  } else {
    console.log('\nStudent Meisya not found');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
