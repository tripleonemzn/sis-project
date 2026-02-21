import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { reportService } from '../services/report.service';
import { Semester, ExamType } from '@prisma/client';

const classReportQuerySchema = z.object({
  classId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int().optional(),
});

const rankingQuerySchema = z.object({
  classId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int().optional(),
  semester: z.nativeEnum(Semester),
});

const principalAcademicOverviewQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
  semester: z.nativeEnum(Semester).optional(),
});

export const getPrincipalAcademicOverview = asyncHandler(
  async (req: Request, res: Response) => {
    const { academicYearId, semester } = principalAcademicOverviewQuerySchema.parse(
      req.query,
    );

    let academicYear = null as any;

    if (academicYearId) {
      academicYear = await prisma.academicYear.findUnique({
        where: { id: academicYearId },
      });
    } else {
      academicYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
      });
    }

    if (!academicYear) {
      throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan');
    }

    const where: any = {
      academicYearId: academicYear.id,
    };

    if (semester) {
      where.semester = semester;
    }

    const gradeGroups = await prisma.reportGrade.groupBy({
      by: ['studentId'],
      where,
      _avg: {
        finalScore: true,
      },
    });

    if (!gradeGroups.length) {
      res.status(200).json(
        new ApiResponse(
          200,
          {
            academicYear: {
              id: academicYear.id,
              name: academicYear.name,
            },
            semester: semester ?? null,
            topStudents: [],
            majors: [],
          },
          'Belum ada data nilai untuk filter ini',
        ),
      );
      return;
    }

    const studentIds = gradeGroups.map((g) => g.studentId);

    const students = await prisma.user.findMany({
      where: {
        id: {
          in: studentIds,
        },
      },
      select: {
        id: true,
        name: true,
        nis: true,
        nisn: true,
        studentClass: {
          select: {
            id: true,
            name: true,
            level: true,
            major: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    const studentMap = new Map<number, any>();
    students.forEach((s) => {
      studentMap.set(s.id, s);
    });

    const enriched: {
      studentId: number;
      averageScore: number;
      student: any;
    }[] = [];

    gradeGroups.forEach((g) => {
      const avg = g._avg.finalScore;
      const s = studentMap.get(g.studentId);

      if (avg == null || !s || !s.studentClass || !s.studentClass.major) {
        return;
      }

      const roundedAvg = Math.round(avg * 10) / 10;

      enriched.push({
        studentId: g.studentId,
        averageScore: roundedAvg,
        student: s,
      });
    });

    if (!enriched.length) {
      res.status(200).json(
        new ApiResponse(
          200,
          {
            academicYear: {
              id: academicYear.id,
              name: academicYear.name,
            },
            semester: semester ?? null,
            topStudents: [],
            majors: [],
          },
          'Belum ada data nilai untuk filter ini',
        ),
      );
      return;
    }

    const majorMap = new Map<
      number,
      {
        majorId: number;
        name: string;
        code: string;
        totalStudents: number;
        totalScore: number;
      }
    >();

    enriched.forEach((item) => {
      const major = item.student.studentClass.major;
      const existing =
        majorMap.get(major.id) ||
        ({
          majorId: major.id,
          name: major.name,
          code: major.code,
          totalStudents: 0,
          totalScore: 0,
        } as any);

      existing.totalStudents += 1;
      existing.totalScore += item.averageScore;

      majorMap.set(major.id, existing);
    });

    const majors = Array.from(majorMap.values())
      .map((m) => {
        const averageScore =
          m.totalStudents > 0 ? Math.round((m.totalScore / m.totalStudents) * 10) / 10 : 0;
        return {
          majorId: m.majorId,
          name: m.name,
          code: m.code,
          totalStudents: m.totalStudents,
          averageScore,
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore);

    const topStudents = [...enriched]
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 3)
      .map((item) => ({
        studentId: item.studentId,
        name: item.student.name,
        nis: item.student.nis,
        nisn: item.student.nisn,
        averageScore: item.averageScore,
        class: item.student.studentClass
          ? {
              id: item.student.studentClass.id,
              name: item.student.studentClass.name,
              level: item.student.studentClass.level,
            }
          : null,
        major: item.student.studentClass?.major
          ? {
              id: item.student.studentClass.major.id,
              name: item.student.studentClass.major.name,
              code: item.student.studentClass.major.code,
            }
          : null,
      }));

    res.status(200).json(
      new ApiResponse(
        200,
        {
          academicYear: {
            id: academicYear.id,
            name: academicYear.name,
          },
          semester: semester ?? null,
          topStudents,
          majors,
        },
        'Ringkasan akademik berhasil diambil',
      ),
    );
  },
);

export const getClassRankings = asyncHandler(async (req: Request, res: Response) => {
  const { classId, academicYearId, semester } = rankingQuerySchema.parse(req.query);

  const classData = await prisma.class.findUnique({
    where: { id: classId },
    select: { academicYearId: true }
  });

  if (!classData) {
    throw new ApiError(404, 'Kelas tidak ditemukan');
  }

  const effectiveAcademicYearId = academicYearId ?? classData.academicYearId;

  const result = await reportService.getClassRankings(classId, effectiveAcademicYearId, semester);

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  res.status(200).json(new ApiResponse(200, result, 'Data peringkat berhasil diambil'));
});


export const getClassReportSummary = asyncHandler(async (req: Request, res: Response) => {
  const { classId, academicYearId } = classReportQuerySchema.parse(req.query);

  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      academicYear: {
        select: {
          id: true,
          name: true,
        },
      },
      major: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      teacher: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      students: {
        select: {
          id: true,
          name: true,
          nis: true,
          nisn: true,
        },
        orderBy: {
          name: 'asc',
        },
      },
    },
  });

  if (!classData) {
    throw new ApiError(404, 'Kelas tidak ditemukan');
  }

  const effectiveAcademicYearId = academicYearId ?? classData.academicYearId;

  if (effectiveAcademicYearId !== classData.academicYearId) {
    throw new ApiError(400, 'Tahun ajaran tidak sesuai dengan kelas');
  }

  const studentIds = classData.students.map((s) => s.id);

  if (studentIds.length === 0) {
    res.status(200).json(
      new ApiResponse(
        200,
        {
          class: {
            id: classData.id,
            name: classData.name,
            level: classData.level,
            academicYear: classData.academicYear,
            major: classData.major,
            teacher: classData.teacher,
          },
          subjects: [],
          students: [],
          meta: {
            academicYearId: effectiveAcademicYearId,
          },
        },
        'Belum ada siswa di kelas ini',
      ),
    );
    return;
  }

  const teacherAssignments = await prisma.teacherAssignment.findMany({
    where: {
      classId,
      academicYearId: effectiveAcademicYearId,
    },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: {
      subject: {
        code: 'asc',
      },
    },
  });

  const subjectIds = teacherAssignments.map((a) => a.subjectId);

  if (subjectIds.length === 0) {
    res.status(200).json(
      new ApiResponse(
        200,
        {
          class: {
            id: classData.id,
            name: classData.name,
            level: classData.level,
            academicYear: classData.academicYear,
            major: classData.major,
            teacher: classData.teacher,
          },
          subjects: [],
          students: classData.students.map((student) => ({
            student,
            subjects: [],
            summary: {
              averageScore: null,
              passedCount: 0,
              failedCount: 0,
            },
          })),
          meta: {
            academicYearId: effectiveAcademicYearId,
          },
        },
        'Belum ada penugasan guru untuk kelas ini',
      ),
    );
    return;
  }

  const [gradesGrouped, subjectKkms] = await Promise.all([
    prisma.studentGrade.groupBy({
      by: ['studentId', 'subjectId'],
      where: {
        academicYearId: effectiveAcademicYearId,
        studentId: {
          in: studentIds,
        },
        subjectId: {
          in: subjectIds,
        },
      },
      _avg: {
        score: true,
      },
    }),
    prisma.subjectKKM.findMany({
      where: {
        subjectId: {
          in: subjectIds,
        },
        classLevel: classData.level,
        OR: [
          {
            academicYearId: effectiveAcademicYearId,
          },
          {
            academicYearId: null,
          },
        ],
      },
      orderBy: {
        academicYearId: 'desc',
      },
    }),
  ]);

  const gradeMap = new Map<string, number>();

  for (const g of gradesGrouped) {
    if (g._avg.score == null) continue;
    const key = `${g.studentId}-${g.subjectId}`;
    gradeMap.set(key, g._avg.score);
  }

  const subjectKkmMap = new Map<number, number>();

  for (const k of subjectKkms) {
    if (!subjectKkmMap.has(k.subjectId)) {
      subjectKkmMap.set(k.subjectId, k.kkm);
    }
  }

  const assignmentMap = new Map<
    number,
    { id: number; subject: { id: number; name: string; code: string } }
  >();
  for (const ta of teacherAssignments) {
    assignmentMap.set(ta.subjectId, ta);
  }

  const subjects = teacherAssignments.map((ta) => ({
    id: ta.subject.id,
    name: ta.subject.name,
    code: ta.subject.code,
    kkm: subjectKkmMap.get(ta.subject.id) || 75,
  }));

  const studentsWithGrades = classData.students.map((student) => {
    let totalScore = 0;
    let scoreCount = 0;
    let passedCount = 0;
    let failedCount = 0;

    const studentSubjects = subjects.map((subject) => {
      const key = `${student.id}-${subject.id}`;
      const score = gradeMap.get(key) || null;
      const kkm = subject.kkm;

      if (score !== null) {
        totalScore += score;
        scoreCount++;
        if (score >= kkm) {
          passedCount++;
        } else {
          failedCount++;
        }
      }

      return {
        subjectId: subject.id,
        score,
        status: score === null ? null : score >= kkm ? 'PASSED' : 'FAILED',
      };
    });

    const averageScore = scoreCount > 0 ? totalScore / scoreCount : null;

    return {
      student,
      subjects: studentSubjects,
      summary: {
        averageScore,
        passedCount,
        failedCount,
      },
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        class: {
          id: classData.id,
          name: classData.name,
          level: classData.level,
          academicYear: classData.academicYear,
          major: classData.major,
          teacher: classData.teacher,
        },
        subjects,
        students: studentsWithGrades,
        meta: {
          academicYearId: effectiveAcademicYearId,
        },
      },
      'Rekap nilai kelas berhasil diambil',
    ),
  );
});

export const getStudentSbtsReport = asyncHandler(async (req: Request, res: Response) => {
  const querySchema = z.object({
    studentId: z.coerce.number().int(),
    semester: z.nativeEnum(Semester),
  });

  const { studentId, semester } = querySchema.parse(req.query);

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
  }

  // Determine ExamType based on Semester
  // Semester.ODD -> SAS
  // Semester.EVEN -> SAT
  // However, user might request SBTS explicitly or logic might differ.
  // The route is getStudentSbtsReport, which implies SBTS.
  // But user wants SAS/SAT logic too. 
  // Let's assume this endpoint is used for "Rapor Tengah Semester" (SBTS) 
  // AND we need new endpoints or modify this to handle SAS/SAT based on a type param?
  // Or maybe the frontend calls this for SBTS only?
  // Wait, the user instruction was "rubah tab leger di SAS dan SAT".
  // The frontend likely calls a report endpoint. 
  // If we look at `HomeroomReportSasPage`, it probably will call an endpoint to get report data.
  // If `getStudentSbtsReport` is ONLY for SBTS, we should add `getStudentSasReport` or make it generic.
  // Let's make it generic or add a type parameter.

  // NOTE: Existing frontend calls this for SBTS.
  // We should add a 'type' query param, default to SBTS if missing.
  
  const typeSchema = z.enum(['SBTS', 'SAS', 'SAT']).optional().default('SBTS');
  const typeStr = req.query.type as string;
  // If type is not provided in query, default to SBTS
  // If type provided, parse it.
  
  let reportType: ExamType = ExamType.SBTS;
  if (typeStr === 'SAS') reportType = ExamType.SAS;
  else if (typeStr === 'SAT') reportType = ExamType.SAT;
  
  // Also validate against semester if strictness needed, but let service handle logic.

  const reportData = await reportService.getStudentSbtsReport(
    studentId,
    activeYear.id,
    semester,
    reportType
  );

  res.status(200).json(new ApiResponse(200, reportData, 'Data rapor berhasil diambil'));
});

export const getClassLedger = asyncHandler(async (req: Request, res: Response) => {
  const querySchema = z.object({
    classId: z.coerce.number().int(),
    semester: z.nativeEnum(Semester),
  });
  const { classId, semester } = querySchema.parse(req.query);
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
  const ledgerData = await reportService.getClassLedger(classId, activeYear.id, semester);
  
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.status(200).json(new ApiResponse(200, ledgerData, 'Data leger berhasil diambil'));
});

export const getClassExtracurricularReport = asyncHandler(async (req: Request, res: Response) => {
  const querySchema = z.object({
    classId: z.coerce.number().int(),
    semester: z.nativeEnum(Semester),
    reportType: z.enum(['SBTS', 'SAS', 'SAT']).optional(),
  });

  const { classId, semester, reportType } = querySchema.parse(req.query);
  let type: ExamType = ExamType.SBTS;
  if (reportType === 'SAS') type = ExamType.SAS;
  else if (reportType === 'SAT') type = ExamType.SAT;

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');

  const reportData = await reportService.getClassExtracurricularReport(classId, activeYear.id, semester, type);

  res.status(200).json(new ApiResponse(200, reportData, 'Data ekstrakurikuler berhasil diambil'));
});

export const upsertReportNote = asyncHandler(async (req: Request, res: Response) => {
  const bodySchema = z.object({
    studentId: z.number().int(),
    semester: z.nativeEnum(Semester),
    type: z.enum(['SIKAP_ANTAR_MAPEL', 'CATATAN_WALI_KELAS']),
    note: z.string(),
  });

  const { studentId, semester, type, note } = bodySchema.parse(req.body);
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');

  const result = await reportService.upsertReportNote(studentId, activeYear.id, semester, type, note);
  res.status(200).json(new ApiResponse(200, result, 'Catatan berhasil disimpan'));
});

export const updateExtracurricularGrade = asyncHandler(async (req: Request, res: Response) => {
  const bodySchema = z.object({
    enrollmentId: z.number().int(),
    grade: z.string(),
    description: z.string(),
    semester: z.nativeEnum(Semester),
    reportType: z.enum(['SBTS', 'SAS', 'SAT']),
  });
  const { enrollmentId, grade, description, semester, reportType } = bodySchema.parse(req.body);
  
  let type: ExamType = ExamType.SBTS;
  if (reportType === 'SAS') type = ExamType.SAS;
  else if (reportType === 'SAT') type = ExamType.SAT;

  const result = await reportService.updateExtracurricularGrade(enrollmentId, grade, description, semester, type);
  res.status(200).json(new ApiResponse(200, result, 'Nilai ekstrakurikuler berhasil disimpan'));
});

export const createAchievement = asyncHandler(async (req: Request, res: Response) => {
  const bodySchema = z.object({
    studentId: z.number().int(),
    name: z.string(),
    rank: z.string().optional(),
    level: z.string().optional(),
    year: z.number().int(),
  });
  const { studentId, name, rank, level, year } = bodySchema.parse(req.body);
  const result = await reportService.createAchievement(studentId, name, rank || '', level || '', year);
  res.status(201).json(new ApiResponse(201, result, 'Prestasi berhasil ditambahkan'));
});

export const deleteAchievement = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await reportService.deleteAchievement(Number(id));
  res.status(200).json(new ApiResponse(200, null, 'Prestasi berhasil dihapus'));
});
