
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugRankingLogic() {
  try {
    console.log('Starting debug logic...');

    // 1. Find Class XII TKJ 1
    const className = 'XII TKJ 1';
    const classData = await prisma.class.findFirst({
      where: { name: className },
      include: {
        students: {
          where: { studentStatus: 'ACTIVE' },
          select: { id: true, name: true, nis: true }
        },
        academicYear: true
      }
    });

    if (!classData) {
      console.error(`Class ${className} not found`);
      return;
    }

    console.log(`Class found: ${classData.name} (ID: ${classData.id})`);
    console.log(`Academic Year: ${classData.academicYear?.name} (ID: ${classData.academicYearId})`);
    console.log(`Total Active Students: ${classData.students.length}`);

    // 2. Find specific student Afifah
    const afifah = classData.students.find(s => s.name.toLowerCase().includes('afifah'));
    if (!afifah) {
      console.error('Student Afifah not found in this class');
      return;
    }
    console.log(`Target Student: ${afifah.name} (ID: ${afifah.id})`);

    // 3. Simulate getClassRankings logic
    // Assuming Semester is ODD (Ganjil) as per typical SAS
    const semester = 'ODD'; 
    const academicYearId = classData.academicYearId;

    console.log(`Querying ReportGrades for Semester: ${semester}, AcademicYearId: ${academicYearId}`);

    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: afifah.id,
        academicYearId: academicYearId,
        semester: semester
      },
      include: {
        subject: true
      }
    });

    console.log(`Found ${reportGrades.length} ReportGrades for Afifah:`);
    let totalScore = 0;
    let count = 0;

    reportGrades.forEach(g => {
      console.log(` - Subject: ${g.subject.name} (ID: ${g.subjectId})`);
      console.log(`   FinalScore: ${g.finalScore}`);
      console.log(`   Description: ${g.description}`);
      console.log(`   Semester: ${g.semester}`);
      
      if (g.finalScore !== null) {
        totalScore += g.finalScore;
        count++;
      }
    });

    console.log('--------------------------------');
    console.log(`Calculated Total Score: ${totalScore}`);
    console.log(`Calculated Count: ${count}`);
    console.log(`Calculated Average: ${count > 0 ? totalScore / count : 0}`);

    // Check if there are any other report grades for this student with DIFFERENT academic year or semester
    const otherGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: afifah.id,
        NOT: {
          AND: {
            academicYearId: academicYearId,
            semester: semester
          }
        }
      }
    });

    if (otherGrades.length > 0) {
      console.log(`WARNING: Found ${otherGrades.length} grades for Afifah in other periods:`);
      otherGrades.forEach(g => {
        console.log(` - AY: ${g.academicYearId}, Sem: ${g.semester}, Subj: ${g.subjectId}, Final: ${g.finalScore}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugRankingLogic();
