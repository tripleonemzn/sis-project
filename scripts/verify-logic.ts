
import prisma from '../backend/src/utils/prisma';
import { reportService } from '../backend/src/services/report.service';
import { Semester, ExamType, GradeComponentType, AttendanceStatus } from '@prisma/client';

async function main() {
  console.log('Starting verification...');

  // 1. Setup Data
  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) throw new Error('No active academic year');

  const studentClass = await prisma.class.findFirst({
    include: { students: true }
  });
  if (!studentClass || studentClass.students.length === 0) throw new Error('No class with students found');

  const student = studentClass.students[0];
  const semester = Semester.ODD; // Default to ODD
  
  console.log(`Using Student: ${student.name} (${student.id})`);
  console.log(`Class: ${studentClass.name} (${studentClass.id})`);
  console.log(`Academic Year: ${academicYear.name} (${academicYear.id})`);

  // 2. Seed Grades (Formatif & SBTS)
  // Need a subject
  const assignment = await prisma.teacherAssignment.findFirst({
    where: { classId: studentClass.id },
    include: { subject: true }
  });
  
  if (!assignment) {
    console.log('No subject assignment found for class, skipping Grade Verification');
  } else {
    console.log(`Using Subject: ${assignment.subject.name} (${assignment.subject.id})`);
    const kkm = assignment.kkm;
    console.log(`KKM: ${kkm}`);

    // Find or Create GradeComponent (FORMATIVE)
    let component = await prisma.gradeComponent.findFirst({
        where: { subjectId: assignment.subject.id, type: GradeComponentType.FORMATIVE }
    });
    
    if (!component) {
        component = await prisma.gradeComponent.create({
            data: {
                name: 'Formatif',
                subjectId: assignment.subject.id,
                type: GradeComponentType.FORMATIVE,
                weight: 100 // dummy
            }
        });
    }

    // Clear existing grades for clean test
    await prisma.studentGrade.deleteMany({
      where: { studentId: student.id, subjectId: assignment.subject.id, academicYearId: academicYear.id, semester }
    });
    await prisma.reportGrade.deleteMany({
      where: { studentId: student.id, subjectId: assignment.subject.id, academicYearId: academicYear.id, semester }
    });

    // Create Formatif (Avg 85)
    await prisma.studentGrade.create({
      data: {
        studentId: student.id,
        subjectId: assignment.subject.id,
        academicYearId: academicYear.id,
        semester,
        componentId: component.id,
        score: 85,
        nf1: 85,
        nf2: 85,
        nf3: 85, 
      }
    });

    // Create SBTS (Score 90 -> A)
    await prisma.reportGrade.create({
      data: {
        studentId: student.id,
        subjectId: assignment.subject.id,
        academicYearId: academicYear.id,
        semester,
        sbtsScore: 90,
        finalScore: 0 // Dummy, usually calculated
      }
    });

    // 4. Verify Rapor SBTS Logic
    console.log('\n--- Verifying Rapor SBTS ---');
    const sbtsReport = await reportService.getStudentSbtsReport(student.id, academicYear.id, semester);
    
    // Find our subject in groups
    let subjectReport: any = null;
    ['A', 'B', 'C'].forEach(g => {
        if (sbtsReport.body.groups[g]) {
            const found = sbtsReport.body.groups[g].find((s: any) => s.id === assignment.subject.id);
            if (found) subjectReport = found;
        }
    });

    if (subjectReport) {
        console.log('Subject Data:', JSON.stringify(subjectReport, null, 2));
        
        // Verification Checks
        const formatifPred = subjectReport.formatif.predicate;
        const sbtsPred = subjectReport.sbts.predicate;
        
        console.log(`Formatif Score: ${subjectReport.formatif.score}, Predicate: ${formatifPred}`);
        console.log(`SBTS Score: ${subjectReport.sbts.score}, Predicate: ${sbtsPred}`);
        
        // Expected:
        // Formatif 85 -> B (>= KKM && < 86)
        // SBTS 90 -> A (>= 86)
        
        if (formatifPred === 'B' && sbtsPred === 'A') {
             console.log('✅ Predicate Logic Verified (85->B, 90->A)');
        } else {
             console.log('❌ Predicate Logic Mismatch');
        }
    } else {
        console.error('Subject not found in report!');
    }
  }
  
  // 3. Seed Attendance
  // Clear existing for today
  let targetDate = new Date();
  if (semester === Semester.ODD && academicYear.semester1Start) {
      targetDate = new Date(academicYear.semester1Start);
  } else if (semester === Semester.EVEN && academicYear.semester2Start) {
      targetDate = new Date(academicYear.semester2Start);
  }
  targetDate.setDate(targetDate.getDate() + 1);
  console.log(`Using Date for Attendance: ${targetDate.toISOString()}`);

  // Check existence manualy
  const existingAtt = await prisma.dailyAttendance.findFirst({
      where: {
          studentId: student.id,
          date: targetDate
      }
  });

  if (existingAtt) {
      await prisma.dailyAttendance.update({
          where: { id: existingAtt.id },
          data: { status: AttendanceStatus.SICK }
      });
  } else {
      await prisma.dailyAttendance.create({
          data: {
              studentId: student.id,
              classId: studentClass.id,
              academicYearId: academicYear.id,
              date: targetDate,
              status: AttendanceStatus.SICK
          }
      });
  }

  // 5. Verify Attendance Logic
  console.log('\n--- Verifying Attendance Integration ---');
  const extraReport = await reportService.getClassExtracurricularReport(studentClass.id, academicYear.id, semester);
  const studentExtra = extraReport.find(s => s.id === student.id);
  
  if (studentExtra) {
    console.log('Attendance Data:', JSON.stringify(studentExtra.attendance, null, 2));
    if (studentExtra.attendance.s > 0) {
        console.log('✅ Attendance Integration Verified (S count > 0)');
    } else {
        console.log('❌ Attendance Integration Failed (S count is 0)');
    }
  } else {
    console.error('Student not found in extra report!');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
