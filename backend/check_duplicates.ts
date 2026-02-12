
import prisma from './src/utils/prisma';

async function checkDuplicates() {
  console.log('Checking for duplicates...');
  
  // 1. Find Class XII TKJ 1
  const cls = await prisma.class.findFirst({
    where: { name: { contains: 'XII TKJ 1' } }
  });
  
  if (!cls) {
    console.log('Class not found');
    return;
  }
  
  console.log(`Class found: ${cls.name} (ID: ${cls.id})`);
  
  // 2. Get Students
  const students = await prisma.user.findMany({
    where: { classId: cls.id, role: 'STUDENT', studentStatus: 'ACTIVE' }
  });
  
  const studentIds = students.map(s => s.id);
  console.log(`Found ${studentIds.length} active students`);
  
  // 3. Get Report Grades
  // Assuming current academic year (active) and Odd/Even semester
  // Let's check both semesters or just find all
  const reportGrades = await prisma.reportGrade.findMany({
    where: {
      studentId: { in: studentIds }
    }
  });
  
  console.log(`Found ${reportGrades.length} report grades total`);
  
  // 4. Check for duplicates (same student, subject, year, semester)
  const map = new Map<string, number>();
  let dupCount = 0;
  
  reportGrades.forEach(g => {
    const key = `${g.studentId}-${g.subjectId}-${g.academicYearId}-${g.semester}`;
    if (map.has(key)) {
      console.log(`DUPLICATE FOUND: ${key} (IDs: ${map.get(key)}, ${g.id})`);
      dupCount++;
    } else {
      map.set(key, g.id);
    }
  });
  
  if (dupCount === 0) {
    console.log('No duplicates found.');
  } else {
    console.log(`Found ${dupCount} duplicate entries!`);
  }

  // 6. DEBUG AFIFAH DEEPER
  const afifah = students.find(s => s.name.toLowerCase().includes('afifah'));
  if (afifah) {
    console.log(`\n--- Debugging Student: ${afifah.name} (${afifah.id}) ---`);
    
    // Get all ReportGrades for Afifah
    const afifahReports = await prisma.reportGrade.findMany({
      where: { studentId: afifah.id },
      include: { subject: true }
    });
    console.log(`Afifah has ${afifahReports.length} ReportGrades:`);
    afifahReports.forEach(r => {
      console.log(`- Subject: ${r.subject.name} (${r.subjectId}), Final: ${r.finalScore}, Semester: ${r.semester}, Type: ${r.description}`);
    });

    // Get all StudentGrades (Raw) for Afifah
    const afifahRaw = await prisma.studentGrade.findMany({
      where: { studentId: afifah.id },
      include: { subject: true, component: true }
    });
    console.log(`\nAfifah has ${afifahRaw.length} Raw StudentGrades:`);
    // Group by subject
    const rawBySubject = new Map<string, any[]>();
    afifahRaw.forEach(g => {
        if (!rawBySubject.has(g.subject.name)) rawBySubject.set(g.subject.name, []);
        rawBySubject.get(g.subject.name)?.push(g);
    });
    
    for (const [subj, grades] of rawBySubject) {
        console.log(`- Subject: ${subj}`);
        grades.forEach(g => console.log(`  * ${g.component.name} (${g.component.type}): ${g.score}`));
    }
  }
}

checkDuplicates()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
