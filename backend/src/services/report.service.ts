import prisma from '../utils/prisma';
import { Semester, ExamType, Prisma } from '@prisma/client';
import { ApiError } from '../utils/api';

interface ReportSignature {
  title: string;
  name: string;
  nip?: string;
  date?: string;
  place?: string;
}

export class ReportService {
  async getStudentSbtsReport(
    studentId: number,
    academicYearId: number,
    semester: Semester,
    type: ExamType = ExamType.SBTS
  ) {
    // 1. Fetch Student Info
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentClass: {
          include: {
            major: true,
            teacher: true, // Wali Kelas
          },
        },
        parents: true, // To get parent name
      },
    });

    if (!student || !student.studentClass) {
      throw new ApiError(404, 'Siswa atau kelas tidak ditemukan');
    }

    const classData = student.studentClass;
    const waliKelas = classData.teacher;
    const parent = student.guardianName || (student.fatherName ?? student.motherName ?? '.......................');

    // 2. Fetch Report Date/Config
    const reportDate = await prisma.reportDate.findUnique({
      where: {
        academicYearId_semester_reportType: {
          academicYearId,
          semester,
          reportType: type,
        },
      },
    });

    // 3. Fetch Grades (Formatif & SBTS/SAS/SAT)
    // We need all subjects assigned to this class
    const teacherAssignments = await prisma.teacherAssignment.findMany({
      where: {
        classId: classData.id,
        academicYearId,
      },
      include: {
        subject: {
          include: {
            category: true,
          },
        },
        teacher: true, // Subject Teacher
      },
      orderBy: {
        subject: {
          code: 'asc',
        },
      },
    });

    // Fetch Student Grades (Formatif NF1-NF6)
    const studentGrades = await prisma.studentGrade.findMany({
      where: {
        studentId,
        academicYearId,
        semester,
      },
    });

    // Fetch Report Grades (SBTS Score or SAS/SAT Score)
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId,
        academicYearId,
        semester,
      },
    });

    // Fetch Extracurriculars
    const enrollments = await prisma.ekstrakurikulerEnrollment.findMany({
      where: {
        studentId,
        academicYearId
      },
      include: {
        ekskul: true
      }
    });

    const extracurriculars = enrollments.map(e => {
        let grade = null;
        let description = null;
        const enrollment = e as any; // Cast for dynamic fields

        if (semester === Semester.ODD) {
            if (type === ExamType.SBTS) {
                grade = enrollment.gradeSbtsOdd;
                description = enrollment.descSbtsOdd;
            } else if (type === ExamType.SAS) {
                grade = enrollment.gradeSas;
                description = enrollment.descSas;
            }
        } else {
            if (type === ExamType.SBTS) {
                grade = enrollment.gradeSbtsEven;
                description = enrollment.descSbtsEven;
            } else if (type === ExamType.SAT) {
                grade = enrollment.gradeSat;
                description = enrollment.descSat;
            }
        }
        
        // Fallback
        if (!grade && !description) {
            grade = enrollment.grade;
            description = enrollment.description;
        }

        return {
            name: e.ekskul?.name || '',
            grade: grade || '-',
            description: description || '-'
        };
    }).filter(e => e.grade !== '-' || e.description !== '-');

    // 4. Map Data
    const groups: Record<string, any[]> = {
      'A': [],
      'B': [],
      'C': [],
    };

    // Helper buckets
    const bucketA: any[] = [];
    const bucketC: any[] = [];
    const bucketB_Kejuruan: any[] = [];
    const bucketB_Kompetensi: any[] = [];
    const bucketB_Pilihan: any[] = [];

    teacherAssignments.forEach((assignment) => {
      const subject = assignment.subject;
      const grade = studentGrades.find((g) => g.subjectId === subject.id);
      const report = reportGrades.find((r) => r.subjectId === subject.id);
      const kkm = assignment.kkm || 75;

      let col1Score: number | null = 0;
      let col1Predicate: string | null = null;
      let col2Score: number | null = 0;
      let col2Predicate: string | null = null;
      let finalScoreVal: number | null = 0;
      let finalPredicateVal: string | null = null;
      let description: string = '-';

      const getPredicate = (score: number, kkmVal: number) => {
          if (score >= 86) return 'A';
          if (score >= kkmVal) return 'B';
          if (score >= 60) return 'C';
          return 'D';
      };

      if (type === ExamType.SBTS) {
        // SBTS Logic: Formatif (NF1-NF3) & SBTS Score
        // FIX: Use pre-calculated ReportGrade values if available, fallback to manual calc
        
        let formatifAvg = report?.formatifScore ?? 0;
        const sbtsScore = report?.sbtsScore ?? 0;

        // Fallback calculation if reportGrade is not synced yet (though syncReportGrade should handle it)
        if (!report) {
            const nfs = [grade?.nf1, grade?.nf2, grade?.nf3].filter((n): n is number => n !== null && n !== undefined);
            formatifAvg = nfs.length > 0 ? nfs.reduce((a, b) => a + b, 0) / nfs.length : 0;
        }

        // Final Score for SBTS Report usually is (Formatif + SBTS) / 2 or just list them
        // Assuming (Formatif + SBTS) / 2 for Final Column if needed
        const finalScore = (formatifAvg + sbtsScore) / 2;

        col1Score = formatifAvg > 0 ? Math.round(formatifAvg) : null;
        col1Predicate = formatifAvg > 0 ? getPredicate(formatifAvg, kkm) : null;
        
        col2Score = sbtsScore > 0 ? sbtsScore : null;
        col2Predicate = sbtsScore > 0 ? getPredicate(sbtsScore, kkm) : null;

        finalScoreVal = finalScore > 0 ? Math.round(finalScore) : null;
        finalPredicateVal = finalScore > 0 ? getPredicate(finalScore, kkm) : null;
        
        // SBTS: KET dibiarkan kosong (tanpa tanda '-')
        description = '';

      } else {
        // SAS/SAT Logic: Nilai Akhir & Capaian Kompetensi
        // Column 1: Nilai Akhir (Rapor)
        // Column 2: Capaian Kompetensi (Deskripsi/Predicate) - Using description for now as requested or competency logic

        // Based on user request:
        // 1. Formatif -> Nilai Akhir (terintegrasi otomatis dari Komponen SAS/SAT field Nilai Rapor SAS)
        // 2. SBTS -> Capaian Kompetensi (terintegrasi otomatis dari Capaian Kompetensi)
        
        // In DB: ReportGrade has finalScore, predicate, description (competency_desc)
        // Mapping:
        // col1 (Nilai Akhir) = report.finalScore
        // col2 (Capaian Kompetensi) = report.description (or predicate if preferred, user said "Capaian Kompetensi")

        const finalScore = report?.finalScore ?? 0;
        
        col1Score = finalScore > 0 ? Math.round(finalScore) : null;
        col1Predicate = finalScore > 0 ? getPredicate(finalScore, kkm) : null;

        // For Capaian Kompetensi, user wants it in the second column usually used for SBTS
        // We will pass it as a special structure or reuse fields but mapped differently in frontend
        // Here we map to generic structure
        
        // Note: col2 is usually numeric in previous logic, but for SAS/SAT "Capaian Kompetensi" is text/predicate.
        // We'll treat col2Score as null if it's text, or pass text in separate field.
        // User said: "rubah SBTS menjadi Capaian Kompetensi"
        
        col2Score = null; // No numeric score for competency in this column context usually
        col2Predicate = report?.predicate ?? null; // Use predicate for short display
        description = report?.description || '-'; // Full description
      }

      const item = {
        id: subject.id,
        name: subject.name,
        kkm: kkm,
        // Generic mapping based on type
        col1: {
          score: col1Score,
          predicate: col1Predicate,
        },
        col2: {
          score: col2Score, // For SBTS this is score, for SAS/SAT this might be null if only predicate/desc needed
          predicate: col2Predicate, // For SAS/SAT this is the Predicate (A/B/C/D)
          description: description // Full text
        },
        final: {
          score: finalScoreVal,
          predicate: finalPredicateVal,
        },
        // Backward compatibility for SBTS Frontend if not updated yet (aliasing)
        formatif: {
          score: col1Score,
          predicate: col1Predicate,
        },
        sbts: {
          score: col2Score,
          predicate: col2Predicate,
        },
        teacherName: assignment.teacher.name,
        description: description,
      };

      const catCode = subject.category?.code;
      if (catCode === 'UMUM') bucketA.push(item);
      else if (catCode === 'MUATAN_LOKAL') bucketC.push(item);
      else if (catCode === 'KOMPETENSI_KEAHLIAN') bucketB_Kompetensi.push(item);
      else if (catCode === 'PILIHAN') bucketB_Pilihan.push(item);
      else bucketB_Kejuruan.push(item);
    });

    // Numbering & Assembly
    bucketA.forEach((item, i) => (item as any).no = i + 1);
    bucketC.forEach((item, i) => (item as any).no = i + 1);

    let bCounter = 1;
    bucketB_Kejuruan.forEach((item) => (item as any).no = bCounter++);

    const finalB = [...bucketB_Kejuruan];

    if (bucketB_Kompetensi.length > 0) {
      finalB.push({ 
        name: 'Mata Pelajaran Kompetensi Keahlian:', 
        isHeader: true, 
        no: bCounter++,
        rowCount: bucketB_Kompetensi.length
      });
      bucketB_Kompetensi.forEach((item, i) => {
         item.name = `${String.fromCharCode(65 + i)}. ${item.name}`;
         (item as any).no = '';
         (item as any).skipNoColumn = true;
      }); 
      finalB.push(...bucketB_Kompetensi);
    }

    if (bucketB_Pilihan.length > 0) {
      finalB.push({ 
        name: 'Mata Pelajaran Pilihan:', 
        isHeader: true, 
        no: bCounter++,
        rowCount: bucketB_Pilihan.length
      });
      bucketB_Pilihan.forEach((item, i) => {
         item.name = `${String.fromCharCode(65 + i)}. ${item.name}`;
         (item as any).no = '';
         (item as any).skipNoColumn = true;
      });
      finalB.push(...bucketB_Pilihan);
    }

    groups['A'] = bucketA;
    groups['B'] = finalB;
    groups['C'] = bucketC;

    const academicYearObj = await prisma.academicYear.findUnique({
        where: { id: academicYearId },
    });

    // Fetch Principal
    const principal = await prisma.user.findFirst({
      where: { role: 'PRINCIPAL' }
    });

    // Fetch Achievements (Prestasi) from StudentBehavior (POSITIVE)
    const behaviors = await prisma.studentBehavior.findMany({
      where: {
        studentId,
        academicYearId,
        type: 'POSITIVE'
      }
    });

    const achievements = behaviors.map(b => ({
      name: b.description,
      description: b.category || '-'
    }));

    // Fetch Attendance
    let dateFilter = {};
    if (academicYearObj) {
        if (semester === Semester.ODD) {
            dateFilter = {
                gte: academicYearObj.semester1Start,
                lte: academicYearObj.semester1End,
            };
        } else {
            dateFilter = {
                gte: academicYearObj.semester2Start,
                lte: academicYearObj.semester2End,
            };
        }
    }

    const attendanceStats = await prisma.dailyAttendance.groupBy({
      by: ['status'],
      where: {
        studentId,
        academicYearId,
        date: dateFilter
      },
      _count: { status: true }
    });

    const attSick = attendanceStats.find(a => a.status === 'SICK')?._count.status || 0;
    const attPerm = attendanceStats.find(a => a.status === 'PERMISSION')?._count.status || 0;
    const attAbsent = attendanceStats.find(a => a.status === 'ABSENT')?._count.status || 0;

    // Fetch Homeroom Note
    const homeroomNote = await prisma.reportNote.findFirst({
        where: {
            studentId,
            academicYearId,
            semester,
            type: 'CATATAN_WALI_KELAS'
        }
    });

    // Determine Fase based on class name
    let fase = '-';
    const cName = classData.name.toUpperCase();
    if (cName.startsWith('X ') || cName.startsWith('10 ') || cName === 'X') fase = 'E';
    else if (cName.startsWith('XI ') || cName.startsWith('11 ') || cName.startsWith('XII ') || cName.startsWith('12 ')) fase = 'F';

    return {
      header: {
        schoolName: 'SMKS KARYA GUNA BHAKTI 2',
        semester: semester === Semester.ODD ? 'Ganjil' : 'Genap',
        academicYear: academicYearObj?.name || '2024/2025',
        studentName: student.name,
        nis: student.nis || '-',
        nisn: student.nisn || '-',
        class: classData.name,
        major: classData.major.name,
        fase: fase,
      },
      body: { 
        groups, 
        extracurriculars,
        achievements,
        attendance: { sick: attSick, permission: attPerm, absent: attAbsent },
        homeroomNote: homeroomNote?.note || ''
      },
      footer: {
        date: reportDate?.date ? new Date(reportDate.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        place: reportDate?.place || 'Bekasi',
        signatures: {
          homeroom: {
            title: 'Wali Kelas',
            name: waliKelas?.name || '.......................',
            nip: waliKelas?.nip || waliKelas?.nuptk || '-',
          },
          parent: {
            title: 'Orang Tua / Wali',
            name: parent,
          },
          principal: {
            title: 'Kepala Sekolah',
            name: principal?.name || '.......................',
            nip: principal?.nip || '-',
          }
        }
      }
    };
  }

  async getClassLedger(
    classId: number,
    academicYearId: number,
    semester: Semester
  ) {
    // 1. Fetch Class & Students
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          orderBy: { name: 'asc' },
          where: {
            studentStatus: 'ACTIVE',
          },
        },
      },
    });

    if (!classData) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }

    // 2. Fetch Subjects assigned to this class
    const teacherAssignments = await prisma.teacherAssignment.findMany({
      where: {
        classId,
        academicYearId,
      },
      include: {
        subject: {
          include: {
            category: true,
          },
        },
      },
    });

    const categoryOrder: Record<string, number> = {
      'UMUM': 1,
      'KEJURUAN': 2,
      'KOMPETENSI_KEAHLIAN': 3,
      'PILIHAN': 4,
      'MUATAN_LOKAL': 5,
    };

    const subjects = teacherAssignments
      .map(ta => ta.subject)
      .sort((a, b) => {
        const codeA = a.category?.code || '';
        const codeB = b.category?.code || '';
        
        const orderA = categoryOrder[codeA] ?? 99;
        const orderB = categoryOrder[codeB] ?? 99;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        return a.code.localeCompare(b.code);
      });

    // 3. Fetch Grades for all students in the class
    const studentIds = classData.students.map(s => s.id);
    
    // Fetch Formative Grades (NF1-3) from StudentGrade
    const studentGrades = await prisma.studentGrade.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId,
        semester,
      },
    });

    // Fetch SBTS Scores from ReportGrade
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId,
        semester,
      },
    });

    // 4. Transform data
    const students = classData.students.map(student => {
      const grades: Record<number, any> = {};
      
      subjects.forEach(subject => {
        const sGrade = studentGrades.find(sg => sg.studentId === student.id && sg.subjectId === subject.id);
        const rGrade = reportGrades.find(rg => rg.studentId === student.id && rg.subjectId === subject.id);
        
        const nfs = [sGrade?.nf1, sGrade?.nf2, sGrade?.nf3].filter((n): n is number => n !== null && n !== undefined);
        
        // FIX: Use pre-calculated ReportGrade.formatifScore if available, fallback to manual calc
        const formatifAvg = rGrade?.formatifScore ?? (nfs.length > 0 ? nfs.reduce((a, b) => a + b, 0) / nfs.length : null);

        grades[subject.id] = {
          nf1: sGrade?.nf1 ?? null,
          nf2: sGrade?.nf2 ?? null,
          nf3: sGrade?.nf3 ?? null,
          formatif: formatifAvg,
          sbts: rGrade?.sbtsScore ?? null,
          finalScore: rGrade?.finalScore ?? null,
          predicate: rGrade?.predicate ?? null,
          description: rGrade?.description ?? null,
        };
      });

      return {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
        grades,
      };
    });

    return {
      subjects: subjects.map(s => ({ id: s.id, name: s.name, code: s.code })),
      students,
    };
  }

  async getClassExtracurricularReport(
    classId: number,
    academicYearId: number,
    semester: Semester,
    reportType: ExamType = ExamType.SBTS
  ) {
    // 1. Fetch Class & Students
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          orderBy: { name: 'asc' },
          where: { studentStatus: 'ACTIVE' },
        },
      },
    });

    if (!classData) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }

    const studentIds = classData.students.map(s => s.id);

    // 2. Fetch Attendance Stats
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId }
    });

    if (!academicYear) {
      throw new ApiError(404, 'Tahun ajaran tidak ditemukan');
    }

    let dateFilter = {};

    if (semester === Semester.ODD) {
      dateFilter = {
        gte: academicYear.semester1Start,
        lte: academicYear.semester1End,
      };
    } else {
      dateFilter = {
        gte: academicYear.semester2Start,
        lte: academicYear.semester2End,
      };
    }

    const attendanceStats = await prisma.dailyAttendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        classId,
        academicYearId,
        date: dateFilter,
        studentId: { in: studentIds }
      },
      _count: {
        status: true
      }
    });

    // 3. Fetch Report Notes (Only CATATAN_WALI_KELAS)
    const reportNotes = await prisma.reportNote.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId,
        semester,
        type: 'CATATAN_WALI_KELAS'
      }
    });

    // 4. Fetch Extracurricular Enrollments
    const enrollments = await prisma.ekstrakurikulerEnrollment.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId
      },
      include: {
        ekskul: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      }
    });

    // 5. Fetch Achievements
    const achievements = await prisma.studentAchievement.findMany({
      where: {
        studentId: { in: studentIds },
        year: parseInt(academicYear.name.split('/')[0]) // Filter by start year of academic year
      }
    });

    // 6. Map Data
    const students = classData.students.map(student => {
      // Attendance
      const studentAttendance = attendanceStats.filter(a => a.studentId === student.id);
      const s = studentAttendance.find(a => a.status === 'SICK')?._count.status || 0;
      const i = studentAttendance.find(a => a.status === 'PERMISSION')?._count.status || 0;
      const a = studentAttendance.find(a => a.status === 'ABSENT')?._count.status || 0;

      // Notes
      const catatan = reportNotes.find(n => n.studentId === student.id && n.type === 'CATATAN_WALI_KELAS')?.note || '';

      // Extracurriculars
      const studentEnrollments = enrollments
        .filter(e => e.studentId === student.id)
        .map(e => {
          let grade = null;
          let description = null;

          // Cast to any to avoid stale type errors until IDE restart
          const enrollment = e as any;

          if (semester === Semester.ODD) {
            if (reportType === ExamType.SBTS) {
              grade = enrollment.gradeSbtsOdd;
              description = enrollment.descSbtsOdd;
            } else if (reportType === ExamType.SAS) {
              grade = enrollment.gradeSas;
              description = enrollment.descSas;
            }
          } else {
            if (reportType === ExamType.SBTS) {
              grade = enrollment.gradeSbtsEven;
              description = enrollment.descSbtsEven;
            } else if (reportType === ExamType.SAT) {
              grade = enrollment.gradeSat;
              description = enrollment.descSat;
            }
          }

          // Fallback to old fields if new ones are empty (for backward compatibility during migration)
          if (!grade && !description) {
            grade = enrollment.grade;
            description = enrollment.description;
          }

          return {
            id: e.id,
            ekskulName: e.ekskul?.name || '',
            grade: grade || '',
            description: description || ''
          };
        });

      // Achievements
      const studentAchievements = achievements
        .filter(a => a.studentId === student.id)
        .map(a => ({
          id: a.id,
          name: a.name,
          rank: a.rank,
          level: a.level
        }));

      return {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
        attendance: { s, i, a },
        catatan,
        extracurriculars: studentEnrollments,
        achievements: studentAchievements
      };
    });

    return students;
  }

  async updateExtracurricularGrade(
    enrollmentId: number, 
    grade: string, 
    description: string,
    semester: Semester,
    reportType: ExamType
  ) {
    let data: any = {};

    if (semester === Semester.ODD) {
      if (reportType === ExamType.SBTS) {
        data = { gradeSbtsOdd: grade, descSbtsOdd: description };
      } else if (reportType === ExamType.SAS) {
        data = { gradeSas: grade, descSas: description };
      }
    } else {
      if (reportType === ExamType.SBTS) {
        data = { gradeSbtsEven: grade, descSbtsEven: description };
      } else if (reportType === ExamType.SAT) {
        data = { gradeSat: grade, descSat: description };
      }
    }

    // Fallback/Legacy: also update main fields for now to ensure data is visible everywhere
    // data.grade = grade;
    // data.description = description;

    const enrollment = await prisma.ekstrakurikulerEnrollment.update({
      where: { id: enrollmentId },
      data
    });

    return enrollment;
  }

  async getClassRankings(classId: number, academicYearId: number, semester: Semester) {
    // 1. Fetch Class & Students
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          orderBy: { name: 'asc' },
          where: {
            studentStatus: 'ACTIVE',
          },
        },
        teacher: true, // Wali Kelas
        academicYear: true, // For default signing date if needed
      },
    });

    if (!classData) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }

    // 2. Fetch All Report Grades for these students
    const studentIds = classData.students.map((s) => s.id);
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId,
        semester,
      },
    });

    // 3. Aggregate Scores
    const rankingMap = new Map<number, { 
      student: typeof classData.students[0], 
      totalScore: number, 
      subjectCount: number 
    }>();

    // Initialize map
    classData.students.forEach((s) => {
      rankingMap.set(s.id, {
        student: s,
        totalScore: 0,
        subjectCount: 0,
      });
    });

    // Sum scores
    reportGrades.forEach((g) => {
      const entry = rankingMap.get(g.studentId);
      if (entry && g.finalScore !== null) {
        entry.totalScore += g.finalScore;
        entry.subjectCount += 1;
      }
    });

    // 4. Calculate Average & Sort
    const rankings = Array.from(rankingMap.values())
      .map((item) => ({
        student: item.student,
        totalScore: Number(item.totalScore.toFixed(2)),
        averageScore: item.subjectCount > 0 ? Number((item.totalScore / item.subjectCount).toFixed(2)) : 0,
        subjectCount: item.subjectCount,
      }))
      .sort((a, b) => b.totalScore - a.totalScore); // Descending by Total Score

    // 5. Assign Rank
    const result = rankings.map((item, index) => ({
      ...item,
      rank: index + 1,
    })).sort((a, b) => a.student.name.localeCompare(b.student.name));

    // 6. Get Principal (Kepala Sekolah)
    // Assuming Principal is a User with role PRINCIPAL or configured somewhere.
    // For now, try to find a user with role PRINCIPAL or hardcode based on user request "Yulia Venny Susanti, S.E., M.M."
    // Ideally, this should be in SchoolConfig.
    // We'll return the hardcoded name as default fallback or look for principal.
    const principal = await prisma.user.findFirst({
      where: { role: 'PRINCIPAL' },
    });

    return {
      className: classData.name,
      academicYear: classData.academicYear?.name || '',
      semester: semester,
      homeroomTeacher: classData.teacher,
      principalName: principal?.name || 'Yulia Venny Susanti, S.E., M.M.',
      principalNip: principal?.nip || principal?.nuptk || '-',
      rankings: result,
    };
  }

  async createAchievement(studentId: number, name: string, rank: string, level: string, year: number) {
    return prisma.studentAchievement.create({
      data: {
        studentId,
        name,
        rank,
        level,
        year
      }
    });
  }
  
  async deleteAchievement(id: number) {
    return prisma.studentAchievement.delete({ where: { id } });
  }

  async upsertReportNote(
    studentId: number,
    academicYearId: number,
    semester: Semester,
    type: string,
    note: string
  ) {
    const existingNote = await prisma.reportNote.findFirst({
      where: {
        studentId,
        academicYearId,
        semester,
        type
      }
    });

    if (existingNote) {
      return prisma.reportNote.update({
        where: { id: existingNote.id },
        data: { note }
      });
    } else {
      return prisma.reportNote.create({
        data: {
          studentId,
          academicYearId,
          semester,
          type,
          note
        }
      });
    }
  }
}

export const reportService = new ReportService();
