
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up bad subjects...');
  
  // Find subjects with numeric names (length < 3 usually for row numbers like "1", "2")
  const badSubjects = await prisma.subject.findMany({
    where: {
      OR: [
        { name: '1' },
        { name: '2' },
        { name: '3' },
        { name: '4' },
        { name: '5' },
        { name: '6' },
        { name: '7' },
        { name: '8' },
        { name: '9' },
        { name: '10' },
        // Regex would be better but raw query or simple check:
      ]
    }
  });

  // More robust check: fetch all and filter in JS
  const allSubjects = await prisma.subject.findMany();
  const toDelete = allSubjects.filter(s => /^\d+$/.test(s.name) || s.name.length < 2);

  console.log(`Found ${toDelete.length} bad subjects.`);

  for (const s of toDelete) {
    // Delete related records first if needed (SubjectKKM, etc.)
    // Cascade delete might handle it, but let's be safe
    await prisma.subjectKKM.deleteMany({ where: { subjectId: s.id } });
    await prisma.teacherAssignment.deleteMany({ where: { subjectId: s.id } });
    await prisma.studentGrade.deleteMany({ where: { subjectId: s.id } });
    await prisma.reportGrade.deleteMany({ where: { subjectId: s.id } });
    
    await prisma.subject.delete({ where: { id: s.id } });
    console.log(`Deleted subject: ${s.name} (${s.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
