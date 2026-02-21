import { Request, Response } from 'express'
import { Semester, GradeComponentType, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { ApiResponseHelper } from '../utils/ApiResponse'
import { ApiError } from '../utils/api'

// ============================================
// GRADE COMPONENTS
// ============================================

export const getGradeComponents = async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    const { subject_id } = req.query
    const where: any = { isActive: true }

    if (subject_id) {
      where.subjectId = Number(subject_id)
    }

    const components = await prisma.gradeComponent.findMany({
      where,
      orderBy: { type: 'asc' }
    })

    const elapsed = Date.now() - t0
    console.log(`getGradeComponents executed in ${elapsed}ms`)

    return ApiResponseHelper.success(res, components, 'Grade components retrieved successfully')
  } catch (error) {
    console.error('Get grade components error:', error)
    throw new ApiError(500, 'Failed to retrieve grade components')
  }
}

// ============================================
// HELPER: Sync Report Grade
// ============================================

export const syncReportGrade = async (
  studentId: number,
  subjectId: number,
  academicYearId: number,
  semester: Semester
) => {
  try {
    // 1. Get all grades for this student/subject/semester
    const grades = await prisma.studentGrade.findMany({
      where: {
        studentId,
        subjectId,
        academicYearId,
        semester,
      },
      include: { component: true }
    });

    // 2. Get active components for this subject
    const components = await prisma.gradeComponent.findMany({
      where: { 
        isActive: true,
        subjectId
      }
    });

    // 3. Calculate Score using Average per Type logic
    let finalScore = 0;
    
    // Group grades by component type
    const gradesByType: Record<string, number[]> = {
        FORMATIVE: [],
        MIDTERM: [],
        FINAL: [],
        SKILL: [],
        US_PRACTICE: [],
        US_THEORY: []
    };

    grades.forEach(g => {
        // Map Prisma Enum to keys
        const type = g.component.type;
        if (gradesByType[type]) {
            gradesByType[type].push(g.score);
        }
    });

    // Calculate averages
    const averages: Record<string, number | null> = {};
    Object.keys(gradesByType).forEach(type => {
        const scores = gradesByType[type];
        if (scores.length > 0) {
            const sum = scores.reduce((a, b) => a + b, 0);
            averages[type] = sum / scores.length;
        } else {
            averages[type] = null;
        }
    });

    // Calculate Weighted Final Score
    // Note: We iterate over defined components to apply weights.
    // If multiple components share a type (e.g. 2 Formatives), we use the AVERAGE of that type.
    // This assumes the weight in GradeComponent applies to the AGGREGATE of that type.
    // OR, if weights are distributed (e.g. PH1 10%, PH2 10%), we should sum them.
    
    // Standard approach in this system seems to be: 
    // Types are fixed (Formatif, UTS, UAS). 
    // If multiple components exist, they are likely just splitting the same category.
    // But usually weights sum to 100%.
    
    // Let's use the Component Weight * Component Score.
    // If we have PH1 (Formatif, 10%) and PH2 (Formatif, 10%).
    // We should use PH1 Score * 10% + PH2 Score * 10%.
    // NOT (Average Formatif) * (10% + 10%).
    // Actually, mathematically: (S1 + S2)/2 * 20%  VS  S1*10% + S2*10%.
    // If S1=100, S2=0. Avg=50. 50*20% = 10.
    // 100*10% + 0*10% = 10.
    // IT IS THE SAME if weights are equal!
    
    // But if weights differ (PH1 5%, PH2 15%).
    // S1=100, S2=0.
    // Avg=50. 50*20% = 10.
    // 100*5% + 0*15% = 5.
    // THEY DIFFER!
    
    // So we MUST use individual component scores for Final Score calculation.
    // BUT we must use AGGREGATE (Average) for Report Columns (Formatif, SBTS, SAS).
    
    let totalWeight = 0;
    let weightedScoreSum = 0;
    
    // Map for individual component lookup by ID to handle specific weighting
    const gradeByComponentId: Record<number, number> = {};
    grades.forEach(g => {
        gradeByComponentId[g.componentId] = g.score;
    });

    components.forEach(comp => {
        const score = gradeByComponentId[comp.id];
        if (score !== undefined) {
            weightedScoreSum += score * (comp.weight / 100);
            totalWeight += comp.weight;
        }
    });
    
    if (totalWeight > 0 && totalWeight !== 100) {
        // Normalize if weights don't sum to 100 (optional, but good practice)
        // finalScore = (weightedScoreSum / totalWeight) * 100;
        // Current logic seemed to assume normalization:
        finalScore = (weightedScoreSum / totalWeight) * 100;
    } else {
        finalScore = weightedScoreSum;
    }

    // Prepare Report Scores (Columns)
    const reportScores = {
        FORMATIVE: averages['FORMATIVE'],
        MIDTERM: averages['MIDTERM'],
        FINAL: averages['FINAL']
    };

    // Override for SAS/SAT: Ensure match with Frontend "Nilai Rapor SAS" logic
    // Frontend uses: (AvgNF + SBTS + SAS) / 3
    // This overrides the weighted calculation if all 3 components are present.
    if (reportScores.FORMATIVE !== null && reportScores.MIDTERM !== null && reportScores.FINAL !== null) {
        finalScore = (reportScores.FORMATIVE + reportScores.MIDTERM + reportScores.FINAL) / 3;
    }

    // Get KKM
    let kkm = 75;
    const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { classId: true }
    });
    
    if (student?.classId) {
        const assignment = await prisma.teacherAssignment.findFirst({
            where: {
                classId: student.classId,
                subjectId: subjectId,
                academicYearId: academicYearId
            },
            select: { kkm: true }
        });
        if (assignment) kkm = assignment.kkm;
    }

    const predicate = calculatePredicate(finalScore, kkm);

    // 4. US Score Logic (Copied from generateReportGrades)
    let usScore: number | null = null;
    const subject = await prisma.subject.findUnique({ 
        where: { id: subjectId },
        include: { category: true }
    });
    
    if (subject) {
        const sName = subject.name.toLowerCase();
        const isTeoriKejuruan = sName.includes('teori kejuruan') || sName.includes('kompetensi keahlian') || subject.category?.code === 'KEJURUAN' || subject.category?.code === 'KOMPETENSI_KEAHLIAN';
        
        const isUSSubject = 
            sName.includes('bahasa indonesia') ||
            sName.includes('bahasa inggris') ||
            sName.includes('agama') ||
            sName.includes('pancasila') ||
            sName.includes('matematika') ||
            sName.includes('bahasa sunda') ||
            isTeoriKejuruan;

        if (isUSSubject) {
            const theoryScore = averages['US_THEORY'] || 0;
            const practiceScore = averages['US_PRACTICE'] || 0;
            
            if (
                sName.includes('bahasa indonesia') ||
                sName.includes('bahasa inggris') ||
                sName.includes('agama') ||
                isTeoriKejuruan
            ) {
                usScore = (theoryScore * 0.5) + (practiceScore * 0.5);
            } else if (
                sName.includes('pancasila') ||
                sName.includes('matematika') ||
                sName.includes('bahasa sunda')
            ) {
                usScore = theoryScore;
            }
        }
    }

    // 5. Upsert ReportGrade
    const existing = await prisma.reportGrade.findFirst({
        where: { studentId, subjectId, academicYearId, semester }
    });

    if (existing) {
        await prisma.reportGrade.update({
            where: { id: existing.id },
            data: {
                formatifScore: reportScores.FORMATIVE,
                sbtsScore: reportScores.MIDTERM,
                sasScore: reportScores.FINAL,
                finalScore,
                predicate,
                usScore
            }
        });
    } else {
        await prisma.reportGrade.create({
            data: {
                studentId, subjectId, academicYearId, semester,
                formatifScore: reportScores.FORMATIVE,
                sbtsScore: reportScores.MIDTERM,
                sasScore: reportScores.FINAL,
                finalScore,
                predicate,
                usScore
            }
        });
    }
  } catch (error) {
    console.error('Error syncing report grade:', error);
    // Don't throw, just log. We don't want to block the main save operation.
  }
};

// ============================================
// STUDENT GRADES (Input Nilai per Komponen)
// ============================================

export const getStudentGrades = async (req: Request, res: Response) => {
  try {
    const { 
      student_id, 
      subject_id, 
      academic_year_id, 
      semester,
      class_id 
    } = req.query

    const where: any = {}
    const user = (req as any).user
    let targetStudentId = student_id ? Number(student_id) : undefined;

    // Security: Student can only view their own grades
    if (user.role === 'STUDENT') {
      where.studentId = user.id
      targetStudentId = user.id;
    } else {
      if (student_id) where.studentId = Number(student_id)

      // If class_id is provided (and not student), filter by students in that class
      if (class_id) {
        const students = await prisma.user.findMany({
          where: { classId: Number(class_id) },
          select: { id: true }
        })
        where.studentId = { in: students.map(s => s.id) }
      }
    }

    if (subject_id) where.subjectId = Number(subject_id)
    if (academic_year_id) where.academicYearId = Number(academic_year_id)
    if (semester) where.semester = semester as Semester

    const grades = await prisma.studentGrade.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nisn: true,
            nis: true,
            classId: true
          }
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        component: {
          select: {
            id: true,
            name: true,
            type: true,
            weight: true
          }
        },
        academicYear: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { student: { name: 'asc' } },
        { component: { type: 'asc' } }
      ]
    })

    // Fetch KKM data
    let gradesWithKkm = [...grades] as any[];
    
    // We need to attach KKM. 
    // If we have a single student, we can look up their class level.
    // If multiple students, we might need to look up each.
    // For optimization, if user.role === STUDENT, we know the student.
    
    if (grades.length > 0) {
      // Get all unique class IDs involved
      const classIds = [...new Set(grades.map(g => g.student?.classId).filter(id => id))];
      
      if (classIds.length > 0) {
        const classes = await prisma.class.findMany({
          where: { id: { in: classIds as number[] } },
          select: { id: true, level: true }
        });
        
        const classLevelMap = new Map(classes.map(c => [c.id, c.level]));
        const levels = [...new Set(classes.map(c => c.level))];
        const academicYearId = grades[0].academicYearId; // Assuming filtered by one academic year usually

        // Fetch KKMs for these levels and subjects
        const subjectIds = [...new Set(grades.map(g => g.subjectId))];
        
        const kkms = await prisma.subjectKKM.findMany({
          where: {
            subjectId: { in: subjectIds },
            academicYearId: academicYearId,
            classLevel: { in: levels }
          }
        });

        // Map KKMs for easy lookup: subjectId-level -> kkm
        const kkmMap = new Map<string, number>();
        kkms.forEach(k => {
          kkmMap.set(`${k.subjectId}-${k.classLevel}`, k.kkm);
        });

        gradesWithKkm = grades.map(grade => {
          const classLevel = grade.student?.classId ? classLevelMap.get(grade.student.classId) : null;
          let kkm = 75; // Default
          
          if (classLevel) {
            const foundKkm = kkmMap.get(`${grade.subjectId}-${classLevel}`);
            if (foundKkm !== undefined) kkm = foundKkm;
          }
          
          return {
            ...grade,
            kkm
          };
        });
      }
    }

    return ApiResponseHelper.success(res, gradesWithKkm, 'Student grades retrieved successfully')
  } catch (error) {
    console.error('Get student grades error:', error)
    throw new ApiError(500, 'Failed to retrieve student grades')
  }
}

export const createOrUpdateStudentGrade = async (req: Request, res: Response) => {
  try {
    const {
      student_id,
      subject_id,
      academic_year_id,
      grade_component_id,
      semester,
      score,
      nf1, nf2, nf3, nf4, nf5, nf6
    } = req.body

    // Validate required fields
    if (!student_id || !subject_id || !academic_year_id || !grade_component_id || !semester || score === undefined) {
      throw new ApiError(400, 'All fields are required')
    }

    // Validate score range
    if (score < 0 || score > 100) {
      throw new ApiError(400, 'Score must be between 0 and 100')
    }

    // Check if grade already exists
    // Note: Using findFirst because unique constraint might be missing in schema
    const whereClause: Prisma.StudentGradeWhereInput = {
      studentId: Number(student_id),
      subjectId: Number(subject_id),
      academicYearId: Number(academic_year_id),
      componentId: Number(grade_component_id),
      semester: semester as Semester
    }

    const existingGrade = await prisma.studentGrade.findFirst({
      where: whereClause
    })

    let grade
    if (existingGrade) {
      // Update existing grade
      const updateData: Prisma.StudentGradeUpdateInput = {
        score: parseFloat(score),
        nf1: nf1 !== undefined ? parseFloat(nf1) : undefined,
        nf2: nf2 !== undefined ? parseFloat(nf2) : undefined,
        nf3: nf3 !== undefined ? parseFloat(nf3) : undefined,
        nf4: nf4 !== undefined ? parseFloat(nf4) : undefined,
        nf5: nf5 !== undefined ? parseFloat(nf5) : undefined,
        nf6: nf6 !== undefined ? parseFloat(nf6) : undefined,
      }
      
      grade = await prisma.studentGrade.update({
        where: { id: existingGrade.id },
        data: updateData,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nisn: true
            }
          },
          subject: {
            select: {
              id: true,
              code: true,
              name: true
            }
          },
          component: true
        }
      })
    } else {
      // Create new grade
      const createData: Prisma.StudentGradeCreateInput = {
        student: { connect: { id: Number(student_id) } },
        subject: { connect: { id: Number(subject_id) } },
        academicYear: { connect: { id: Number(academic_year_id) } },
        component: { connect: { id: Number(grade_component_id) } },
        semester: semester as Semester,
        score: parseFloat(score),
        nf1: nf1 !== undefined ? parseFloat(nf1) : undefined,
        nf2: nf2 !== undefined ? parseFloat(nf2) : undefined,
        nf3: nf3 !== undefined ? parseFloat(nf3) : undefined,
        nf4: nf4 !== undefined ? parseFloat(nf4) : undefined,
        nf5: nf5 !== undefined ? parseFloat(nf5) : undefined,
        nf6: nf6 !== undefined ? parseFloat(nf6) : undefined,
      }

      grade = await prisma.studentGrade.create({
        data: createData,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nisn: true
            }
          },
          subject: {
            select: {
              id: true,
              code: true,
              name: true
            }
          },
          component: true
        }
      })
    }

    // Sync Report Grade
    try {
      await syncReportGrade(
        Number(student_id),
        Number(subject_id),
        Number(academic_year_id),
        semester as Semester
      )
    } catch (error) {
      console.error('Failed to sync report grade:', error)
    }

    return ApiResponseHelper.success(res, grade, 'Student grade saved successfully')
  } catch (error) {
    console.error('Create/Update student grade error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to save student grade')
  }
}

export const bulkCreateOrUpdateStudentGrades = async (req: Request, res: Response) => {
  try {
    const { grades } = req.body

    if (!Array.isArray(grades) || grades.length === 0) {
      throw new ApiError(400, 'Grades array is required')
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    }

    const uniqueKeys = new Set<string>();

    for (const gradeData of grades) {
      try {
        const {
          student_id,
          subject_id,
          academic_year_id,
          grade_component_id,
          semester,
          score,
          nf1, nf2, nf3, nf4, nf5, nf6,
          description // Add description to destructured variables
        } = gradeData

        // Track for sync
        uniqueKeys.add(`${student_id}-${subject_id}-${academic_year_id}-${semester}`);

        // Validate score range
        if (score !== null && (score < 0 || score > 100)) {
          results.failed++
          results.errors.push({
            student_id,
            error: 'Score must be between 0 and 100'
          })
          continue
        }

        // Handle ReportGrade description update if provided
        if (description !== undefined) {
          // Find or create ReportGrade to update description
          const reportGrade = await prisma.reportGrade.findFirst({
            where: {
              studentId: Number(student_id),
              subjectId: Number(subject_id),
              academicYearId: Number(academic_year_id),
              semester: semester as Semester
            }
          })

          if (reportGrade) {
            await prisma.reportGrade.update({
              where: { id: reportGrade.id },
              data: { description: description }
            })
          } else {
            // If ReportGrade doesn't exist, we might need to create it or wait for generation
            // Ideally it should exist or be created via generateReportGrades.
            // But let's create a placeholder if it doesn't exist, preserving the description.
            // However, creating it without scores might be premature.
            // Let's assume we only update if it exists or create with minimal data.
            await prisma.reportGrade.create({
              data: {
                studentId: Number(student_id),
                subjectId: Number(subject_id),
                academicYearId: Number(academic_year_id),
                semester: semester as Semester,
                finalScore: 0, // Default
                description: description
              }
            })
          }
        }

        // Check if grade already exists
        const existingGrade = await prisma.studentGrade.findFirst({
          where: {
            studentId: Number(student_id),
            subjectId: Number(subject_id),
            academicYearId: Number(academic_year_id),
            componentId: Number(grade_component_id),
            semester: semester as Semester
          }
        })

        if (existingGrade) {
          await prisma.studentGrade.update({
            where: { id: existingGrade.id },
            data: { 
              score: score !== null ? parseFloat(score) : 0, // Score cannot be null usually, default to 0 if cleared
              nf1: nf1 !== undefined ? (nf1 === null ? null : parseFloat(nf1)) : undefined,
              nf2: nf2 !== undefined ? (nf2 === null ? null : parseFloat(nf2)) : undefined,
              nf3: nf3 !== undefined ? (nf3 === null ? null : parseFloat(nf3)) : undefined,
              nf4: nf4 !== undefined ? (nf4 === null ? null : parseFloat(nf4)) : undefined,
              nf5: nf5 !== undefined ? (nf5 === null ? null : parseFloat(nf5)) : undefined,
              nf6: nf6 !== undefined ? (nf6 === null ? null : parseFloat(nf6)) : undefined,
            }
          })
        } else {
          await prisma.studentGrade.create({
            data: {
              studentId: Number(student_id),
              subjectId: Number(subject_id),
              academicYearId: Number(academic_year_id),
              componentId: Number(grade_component_id),
              semester: semester as Semester,
              score: score !== null ? parseFloat(score) : 0,
              nf1: nf1 !== undefined ? (nf1 === null ? null : parseFloat(nf1)) : undefined,
              nf2: nf2 !== undefined ? (nf2 === null ? null : parseFloat(nf2)) : undefined,
              nf3: nf3 !== undefined ? (nf3 === null ? null : parseFloat(nf3)) : undefined,
              nf4: nf4 !== undefined ? (nf4 === null ? null : parseFloat(nf4)) : undefined,
              nf5: nf5 !== undefined ? (nf5 === null ? null : parseFloat(nf5)) : undefined,
              nf6: nf6 !== undefined ? (nf6 === null ? null : parseFloat(nf6)) : undefined,
            }
          })
        }

        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({
          student_id: gradeData.student_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Sync Report Grades for all affected students
    // Process in background to avoid blocking response too long
    // But for consistency, we might want to await. Given it's a few students, await is safer.
    const syncPromises = Array.from(uniqueKeys).map(async (key) => {
      const [studentId, subjectId, academicYearId, semester] = key.split('-')
      try {
        await syncReportGrade(
          Number(studentId),
          Number(subjectId),
          Number(academicYearId),
          semester as Semester
        )
      } catch (err) {
        console.error(`Failed to sync report grade for ${key}:`, err)
      }
    })

    await Promise.all(syncPromises)

    return ApiResponseHelper.success(res, results, 'Bulk grade operation completed')
  } catch (error) {
    console.error('Bulk create/update student grades error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to save student grades')
  }
}

// ============================================
// REPORT GRADES (Nilai Raport)
// ============================================

// Calculate predicate based on score
const calculatePredicate = (score: number, kkm: number = 75): string => {
  const roundedScore = Math.round(score)
  if (roundedScore >= 86) return 'A'
  if (roundedScore >= kkm) return 'B'
  if (roundedScore >= 60) return 'C'
  return 'D'
}

export const generateReportGrades = async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    const {
      student_id,
      academic_year_id,
      semester
    } = req.body

    if (!student_id || !academic_year_id || !semester) {
      throw new ApiError(400, 'student_id, academic_year_id, and semester are required')
    }

    // Get student class to determine KKM
    const student = await prisma.user.findUnique({
      where: { id: Number(student_id) },
      select: { classId: true }
    })

    if (!student) {
      throw new ApiError(404, 'Student not found')
    }

    // Pre-fetch KKM for all subjects in this class
    const assignments = await prisma.teacherAssignment.findMany({
      where: {
        classId: student.classId || 0,
        academicYearId: Number(academic_year_id)
      },
      select: {
        subjectId: true,
        kkm: true
      }
    })

    const kkmMap = new Map<number, number>()
    assignments.forEach(a => kkmMap.set(a.subjectId, a.kkm))

    // Get all student grades for the semester
    const studentGrades = await prisma.studentGrade.findMany({
      where: {
        studentId: Number(student_id),
        academicYearId: Number(academic_year_id),
        semester: semester as Semester
      },
      include: {
        component: true,
        subject: {
          include: {
            category: true
          }
        }
      }
    })

    if (studentGrades.length === 0) {
      throw new ApiError(404, 'No grades found for this student')
    }

    // Group grades by subject
    const gradesBySubject = studentGrades.reduce((acc: any, grade: any) => {
      if (!acc[grade.subjectId]) {
        acc[grade.subjectId] = {
          subject: grade.subject,
          grades: {}
        }
      }
      // Store array of scores for averaging
      if (!acc[grade.subjectId].grades[grade.component.type]) {
        acc[grade.subjectId].grades[grade.component.type] = []
      }
      acc[grade.subjectId].grades[grade.component.type].push(grade.score)
      return acc
    }, {} as any)

    // Calculate final scores and create/update report grades
    const reportGrades = []

    // Get grade components once to avoid repeated DB calls inside the loop
    const components = await prisma.gradeComponent.findMany({
      where: { isActive: true }
    })

    for (const [subjectId, data] of Object.entries(gradesBySubject) as any) {
      const { subject, grades: rawGrades } = data

      // Calculate averages for each component type
      const grades: Record<string, number> = {}
      Object.keys(rawGrades).forEach(type => {
        const scores = rawGrades[type]
        if (scores.length > 0) {
          grades[type] = scores.reduce((a: number, b: number) => a + b, 0) / scores.length
        }
      })

      // Calculate weighted final score
      let finalScore = 0
      let totalWeight = 0

      for (const component of components) {
        if (grades[component.type] !== undefined) {
          finalScore += grades[component.type] * (component.weight / 100)
          totalWeight += component.weight
        }
      }

      // Normalize if total weight is not 100
      if (totalWeight > 0 && totalWeight !== 100) {
        finalScore = (finalScore / totalWeight) * 100
      }

      // Override for SAS/SAT (Avg NF + SBTS + SAS) / 3
      if (grades['FORMATIVE'] !== undefined && grades['MIDTERM'] !== undefined && grades['FINAL'] !== undefined) {
          finalScore = (grades['FORMATIVE'] + grades['MIDTERM'] + grades['FINAL']) / 3
      }

      const kkm = kkmMap.get(Number(subjectId)) || 75
      const predicate = calculatePredicate(finalScore, kkm)

      // ==========================================
      // UJIAN SEKOLAH (US) CALCULATION LOGIC
      // ==========================================
      let usScore: number | null = null
      const sName = subject.name.toLowerCase()
      const isTeoriKejuruan = sName.includes('teori kejuruan') || sName.includes('kompetensi keahlian') || subject.category?.code === 'KEJURUAN' || subject.category?.code === 'KOMPETENSI_KEAHLIAN'

      // Check if subject is one of the "Ujian Sekolah" subjects
      const isUSSubject = 
        sName.includes('bahasa indonesia') ||
        sName.includes('bahasa inggris') ||
        sName.includes('agama') || // Pendidikan Agama...
        sName.includes('pancasila') ||
        sName.includes('matematika') ||
        sName.includes('bahasa sunda') ||
        isTeoriKejuruan

      if (isUSSubject) {
        const theoryScore = grades['US_THEORY'] || 0
        const practiceScore = grades['US_PRACTICE'] || 0
        
        // Rule 3 & 4: 50% Theory + 50% Practice
        // Subjects: B. Indo, B. Ing, PABP, Teori Kejuruan
        if (
          sName.includes('bahasa indonesia') ||
          sName.includes('bahasa inggris') ||
          sName.includes('agama') ||
          isTeoriKejuruan
        ) {
          // If both exist, 50:50. If only one, maybe 100? 
          // User implies both are needed. Let's assume 0 if missing, or strict 50/50.
          // "penggabungan bobot 50%+50%"
          usScore = (theoryScore * 0.5) + (practiceScore * 0.5)
        }
        // Rule 7: 100% Theory
        // Subjects: Pancasila, Matematika, B. Sunda
        else if (
          sName.includes('pancasila') ||
          sName.includes('matematika') ||
          sName.includes('bahasa sunda')
        ) {
          usScore = theoryScore
        }
      }

      // Check if report grade already exists
      const existingReportGrade = await prisma.reportGrade.findFirst({
        where: {
          studentId: Number(student_id),
          subjectId: Number(subjectId),
          academicYearId: Number(academic_year_id),
          semester: semester as Semester
        }
      })

      let reportGrade
      if (existingReportGrade) {
        reportGrade = await prisma.reportGrade.update({
          where: { id: existingReportGrade.id },
          data: {
            formatifScore: grades.FORMATIVE || null,
            sbtsScore: grades.MIDTERM || null,
            sasScore: grades.FINAL || null,
            finalScore: finalScore,
            predicate,
            usScore // Add US Score
          },
          include: {
            subject: true
          }
        })
      } else {
        reportGrade = await prisma.reportGrade.create({
          data: {
            studentId: Number(student_id),
            subjectId: Number(subjectId),
            academicYearId: Number(academic_year_id),
            semester: semester as Semester,
            formatifScore: grades.FORMATIVE || null,
            sbtsScore: grades.MIDTERM || null,
            sasScore: grades.FINAL || null,
            finalScore: finalScore,
            predicate,
            usScore // Add US Score
          },
          include: {
            subject: true
          }
        })
      }

      reportGrades.push(reportGrade)
    }

    const elapsed = Date.now() - t0
    console.log(`generateReportGrades executed in ${elapsed}ms for student_id=${req.body.student_id}`)

    return ApiResponseHelper.success(res, reportGrades, 'Report grades generated successfully')
  } catch (error) {
    console.error('Generate report grades error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to generate report grades')
  }
}

export const getReportGrades = async (req: Request, res: Response) => {
  try {
    const {
      student_id,
      academic_year_id,
      semester,
      class_id,
      subject_id
    } = req.query

    const user = (req as any).user;
    const where: any = {}
    
    // Security: Students can only view their own grades
    if (user.role === 'STUDENT') {
      where.studentId = user.id;
    } else {
      if (student_id) where.studentId = Number(student_id)
      
      // If class_id is provided, filter by students in that class
      if (class_id) {
        const students = await prisma.user.findMany({
          where: { classId: Number(class_id) },
          select: { id: true }
        })
        where.studentId = { in: students.map(s => s.id) }
  
        // LAZY SYNC: If we are in a specific context (Class + Subject + Year + Sem),
        // ensure ReportGrades exist for all students.
        if (subject_id && academic_year_id && semester) {
          const existingCount = await prisma.reportGrade.count({ where });
          
          // If count mismatch (or force check), run sync
          if (existingCount < students.length) {
              console.log(`[LazySync] Syncing ReportGrades for Class ${class_id} Subject ${subject_id}`);
              // Use Promise.all with chunking or just all at once (assuming class size < 50)
              await Promise.all(students.map(s => 
                  syncReportGrade(
                      s.id, 
                      Number(subject_id), 
                      Number(academic_year_id), 
                      semester as Semester
                  ).catch(err => console.error(`Failed to sync student ${s.id}:`, err))
              ));
          }
        }
      }
    }

    if (academic_year_id) where.academicYearId = Number(academic_year_id)
    if (semester) where.semester = semester as Semester
    if (subject_id) where.subjectId = Number(subject_id)

    const reportGrades = await prisma.reportGrade.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: [
        { subject: { name: 'asc' } }
      ]
    })

    // Manual population of student data since ReportGrade has no relation to User
    const studentIds = [...new Set(reportGrades.map(g => g.studentId))]
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        name: true,
        nisn: true,
        nis: true,
        studentClass: {
          select: {
            id: true,
            name: true,
            major: {
              select: {
                name: true
              }
            }
          }
        }
      }
    })
    
    const studentMap = students.reduce((acc, student) => {
      acc[student.id] = student
      return acc
    }, {} as any)

    const result = reportGrades.map(grade => ({
      ...grade,
      student: studentMap[grade.studentId]
    }))

    // Sort by student name alphabetically
    result.sort((a, b) => {
      const nameA = a.student?.name || '';
      const nameB = b.student?.name || '';
      return nameA.localeCompare(nameB);
    });

    return ApiResponseHelper.success(res, result, 'Report grades retrieved successfully')
  } catch (error) {
    console.error('Get report grades error:', error)
    throw new ApiError(500, 'Failed to retrieve report grades')
  }
}

export const updateReportGrade = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const {
      formatif_score,
      sbts_score,
      sas_score,
      competency_desc
    } = req.body

    // Get existing report grade
    const existingGrade = await prisma.reportGrade.findUnique({
      where: { id: Number(id) }
    })

    if (!existingGrade) {
      throw new ApiError(404, 'Report grade not found')
    }

    // Calculate new final score if component scores are provided
    let finalScore = existingGrade.finalScore
    let predicate = existingGrade.predicate

    if (formatif_score !== undefined || sbts_score !== undefined || sas_score !== undefined) {
      const components = await prisma.gradeComponent.findMany({
        where: { isActive: true }
      })

      const scores = {
        FORMATIVE: formatif_score !== undefined ? formatif_score : existingGrade.formatifScore,
        MIDTERM: sbts_score !== undefined ? sbts_score : existingGrade.sbtsScore,
        FINAL: sas_score !== undefined ? sas_score : existingGrade.sasScore
      }

      finalScore = 0
      let totalWeight = 0

      for (const component of components) {
        const score = scores[component.type as keyof typeof scores]
        if (score !== null && score !== undefined) {
          finalScore += score * (component.weight / 100)
          totalWeight += component.weight
        }
      }

      if (totalWeight > 0 && totalWeight !== 100) {
        finalScore = (finalScore / totalWeight) * 100
      }

      predicate = calculatePredicate(finalScore)
    }

    const reportGrade = await prisma.reportGrade.update({
      where: { id: Number(id) },
      data: {
        formatifScore: formatif_score !== undefined ? formatif_score : undefined,
        sbtsScore: sbts_score !== undefined ? sbts_score : undefined,
        sasScore: sas_score !== undefined ? sas_score : undefined,
        finalScore: finalScore,
        predicate,
        description: competency_desc !== undefined ? competency_desc : undefined
      },
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    })

    return ApiResponseHelper.success(res, reportGrade, 'Report grade updated successfully')
  } catch (error) {
    console.error('Update report grade error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to update report grade')
  }
}

// ============================================
// REPORT CARD (Full Report)
// ============================================

export const getStudentReportCard = async (req: Request, res: Response) => {
  try {
    const { student_id, academic_year_id, semester } = req.query
    const user = (req as any).user;
    const targetStudentId = Number(student_id);

    if (!student_id || !academic_year_id || !semester) {
      throw new ApiError(400, 'student_id, academic_year_id, and semester are required')
    }

    // Security: Students can only view their own report card
    if (user.role === 'STUDENT' && targetStudentId !== user.id) {
      throw new ApiError(403, 'Forbidden: You can only view your own report card')
    }

    // Security: Parents can only view their linked children
    if (user.role === 'PARENT') {
      const parent = await prisma.user.findUnique({
        where: { id: Number(user.id) },
        select: {
          children: {
            select: {
              id: true,
            },
          },
        },
      });

      const childIds = new Set((parent?.children || []).map((child) => child.id));
      if (!childIds.has(targetStudentId)) {
        throw new ApiError(403, 'Forbidden: You can only view report card of your linked child')
      }
    }

    // Get student info
    const student = await prisma.user.findUnique({
      where: { id: targetStudentId },
      include: {
        studentClass: {
          include: {
            major: true,
            academicYear: true
          }
        }
      }
    })

    if (!student) {
      throw new ApiError(404, 'Student not found')
    }

    // Get report grades
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: targetStudentId,
        academicYearId: Number(academic_year_id),
        semester: semester as Semester
      },
      include: {
        subject: true
      },
      orderBy: {
        subject: { name: 'asc' }
      }
    })

    // Get report notes
    // Note: Assuming schema does not have a unique constraint, using findFirst
    const reportNotes = await prisma.reportNote.findFirst({
      where: {
        studentId: targetStudentId,
        academicYearId: Number(academic_year_id),
        semester: semester as Semester
      }
    })

    // Get attendance summary
    const attendances = await prisma.attendance.findMany({
      where: {
        classId: student.classId || undefined,
        academicYearId: Number(academic_year_id)
      },
      include: {
        records: {
          where: {
            studentId: targetStudentId
          }
        }
      }
    })

    // Aggregate attendance from records
    // Since Attendance is by subject/class/date, we need to count records for this student
    let hadir = 0
    let sakit = 0
    let izin = 0
    let alpha = 0

    attendances.forEach(att => {
      att.records.forEach(rec => {
        if (rec.status === 'PRESENT') hadir++
        else if (rec.status === 'SICK') sakit++
        else if (rec.status === 'PERMISSION') izin++
        else if (rec.status === 'ABSENT') alpha++
      })
    })

    const attendanceSummary = {
      hadir,
      sakit,
      izin,
      alpha
    }

    // Calculate average
    const average = reportGrades.length > 0
      ? reportGrades.reduce((sum: any, grade: any) => sum + grade.finalScore, 0) / reportGrades.length
      : 0

    return ApiResponseHelper.success(res, {
      student,
      reportGrades,
      reportNotes,
      attendanceSummary,
      average
    }, 'Student report card retrieved successfully')
  } catch (error) {
    console.error('Get student report card error:', error)
    if (error instanceof ApiError) throw error
    throw new ApiError(500, 'Failed to retrieve student report card')
  }
}
