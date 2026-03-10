import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { reportService } from '../services/report.service';
import { Semester, ExamType, GradeComponentType } from '@prisma/client';

const normalizeProgramCode = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const isMidtermAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(normalized)) return true;
  return normalized.includes('MIDTERM');
};

const isFinalAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['SAS', 'SAT', 'FINAL', 'PAS', 'PAT', 'PSAS', 'PSAT'].includes(normalized)) return true;
  return normalized.includes('FINAL');
};

const isFinalEvenAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(normalized)) return true;
  return normalized.includes('FINAL_EVEN');
};

const isFinalOddAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(normalized)) return true;
  return normalized.includes('FINAL_ODD');
};

const isFormativeAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  return normalized === 'FORMATIF' || normalized === 'FORMATIVE' || normalized.startsWith('NF');
};

const inferReportTypeFromSlotCode = (
  slotCode: string | null | undefined,
  fixedSemester?: Semester | null,
): ExamType | null => {
  const normalized = normalizeProgramCode(slotCode);
  if (!normalized || normalized === 'NONE') return null;
  if (isMidtermAliasCode(normalized)) return ExamType.SBTS;
  if (isFinalEvenAliasCode(normalized)) return ExamType.SAT;
  if (isFinalOddAliasCode(normalized)) return ExamType.SAS;
  if (isFinalAliasCode(normalized)) {
    return fixedSemester === Semester.EVEN ? ExamType.SAT : ExamType.SAS;
  }
  return null;
};

const parseDirectReportType = (raw: unknown): ExamType | null => {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return null;
  if (isFormativeAliasCode(normalized)) return ExamType.FORMATIF;
  if (isMidtermAliasCode(normalized)) return ExamType.SBTS;
  if (isFinalEvenAliasCode(normalized)) return ExamType.SAT;
  if (isFinalOddAliasCode(normalized)) return ExamType.SAS;
  return (Object.values(ExamType) as string[]).includes(normalized)
    ? (normalized as ExamType)
    : null;
};

const inferReportTypeFromProgram = (program: {
  baseType?: ExamType | null;
  baseTypeCode?: string | null;
  gradeComponentType?: GradeComponentType | null;
  gradeComponentTypeCode?: string | null;
  gradeComponentCode?: string | null;
  fixedSemester?: Semester | null;
}): ExamType => {
  if (program.baseType) return program.baseType;
  const baseTypeFromCode = parseDirectReportType(program.baseTypeCode);
  if (baseTypeFromCode) return baseTypeFromCode;
  const componentType = normalizeProgramCode(
    program.gradeComponentTypeCode || program.gradeComponentType,
  );
  if (isMidtermAliasCode(componentType)) return ExamType.SBTS;
  if (isFinalEvenAliasCode(componentType)) return ExamType.SAT;
  if (isFinalOddAliasCode(componentType)) return ExamType.SAS;
  if (isFinalAliasCode(componentType)) {
    return program.fixedSemester === Semester.EVEN ? ExamType.SAT : ExamType.SAS;
  }
  return ExamType.FORMATIF;
};

const resolveReportTypeByProgramSlot = async (params: {
  academicYearId: number;
  fixedSemester?: Semester | null;
  gradeComponentCode?: string | null;
}): Promise<ExamType | null> => {
  const componentCode = normalizeProgramCode(params.gradeComponentCode);
  if (!componentCode) return null;

  const component = await prisma.examGradeComponent.findFirst({
    where: {
      academicYearId: params.academicYearId,
      code: componentCode,
      isActive: true,
    },
    select: {
      reportSlot: true,
      reportSlotCode: true,
    },
  });
  if (!component) return null;

  return inferReportTypeFromSlotCode(
    normalizeProgramCode(component.reportSlotCode || component.reportSlot),
    params.fixedSemester,
  );
};

const resolveDefaultReportProgram = async (params: {
  academicYearId: number;
  semester?: Semester;
}): Promise<{ code: string; baseType: ExamType } | null> => {
  const programs = await prisma.examProgramConfig.findMany({
    where: {
      academicYearId: params.academicYearId,
      isActive: true,
    },
    select: {
      code: true,
      baseType: true,
      baseTypeCode: true,
      fixedSemester: true,
      displayOrder: true,
      gradeComponentType: true,
      gradeComponentTypeCode: true,
      gradeComponentCode: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  });

  if (!programs.length) return null;

  const componentCodes = Array.from(
    new Set(
      programs
        .map((program) => normalizeProgramCode(program.gradeComponentCode))
        .filter((code): code is string => Boolean(code)),
    ),
  );
  const components = componentCodes.length
    ? await prisma.examGradeComponent.findMany({
        where: {
          academicYearId: params.academicYearId,
          code: { in: componentCodes },
          isActive: true,
        },
        select: {
          code: true,
          reportSlot: true,
          reportSlotCode: true,
        },
      })
    : [];
  const componentSlotByCode = new Map<string, string>();
  components.forEach((component) => {
    const normalizedCode = normalizeProgramCode(component.code);
    if (!normalizedCode) return;
    const slotCode = normalizeProgramCode(component.reportSlotCode || component.reportSlot);
    if (!slotCode) return;
    componentSlotByCode.set(normalizedCode, slotCode);
  });

  const bySemester = params.semester
    ? programs.filter((program) => !program.fixedSemester || program.fixedSemester === params.semester)
    : programs;
  const scopedPrograms = bySemester.length ? bySemester : programs;
  const reportCandidates = scopedPrograms.filter((program) => {
    const directType = parseDirectReportType(program.baseType) || parseDirectReportType(program.baseTypeCode);
    if (directType && directType !== ExamType.FORMATIF) return true;

    const componentType = normalizeProgramCode(
      program.gradeComponentTypeCode || program.gradeComponentType,
    );
    if (isMidtermAliasCode(componentType) || isFinalAliasCode(componentType)) return true;

    const componentCode = normalizeProgramCode(program.gradeComponentCode);
    const slotCode = componentCode ? componentSlotByCode.get(componentCode) : '';
    if (slotCode && slotCode !== 'NONE') {
      if (isMidtermAliasCode(slotCode) || isFinalAliasCode(slotCode)) return true;
      return true;
    }

    return false;
  });
  const selectedPrograms = reportCandidates.length > 0 ? reportCandidates : scopedPrograms;

  const first = selectedPrograms[0];
  if (first) {
    const inferredFromSlot = await resolveReportTypeByProgramSlot({
      academicYearId: params.academicYearId,
      fixedSemester: first.fixedSemester,
      gradeComponentCode: first.gradeComponentCode,
    });
    if (inferredFromSlot) {
      return {
        code: first.code,
        baseType: inferredFromSlot,
      };
    }
  }
  return first
    ? {
        code: first.code,
        baseType: inferReportTypeFromProgram(first),
      }
    : null;
};

const resolveReportTypeContext = async (params: {
  academicYearId: number;
  semester?: Semester;
  reportType?: string | null;
  programCode?: string | null;
  defaultType?: ExamType;
}): Promise<{ reportType: ExamType; programCode: string | null }> => {
  const defaultType = params.defaultType || null;
  const normalizedProgramCode = normalizeProgramCode(params.programCode);
  const normalizedReportType = normalizeProgramCode(params.reportType);
  const directTypeFromProgramCode = parseDirectReportType(normalizedProgramCode);
  const directTypeFromReportType = parseDirectReportType(normalizedReportType);
  const directType = directTypeFromReportType || directTypeFromProgramCode;
  const semesterScope = params.semester
    ? [{ fixedSemester: null }, { fixedSemester: params.semester }]
    : undefined;

  if (!normalizedProgramCode && !normalizedReportType) {
    const defaultProgram = await resolveDefaultReportProgram({
      academicYearId: params.academicYearId,
      semester: params.semester,
    });
    if (defaultProgram) {
      return { reportType: defaultProgram.baseType, programCode: defaultProgram.code };
    }
    if (defaultType) {
      return { reportType: defaultType, programCode: null };
    }
    throw new ApiError(
      400,
      'Program rapor aktif tidak ditemukan. Aktifkan Program Ujian komponen rapor terlebih dahulu.',
    );
  }

  if (normalizedProgramCode) {
    const program = await prisma.examProgramConfig.findFirst({
      where: {
        academicYearId: params.academicYearId,
        code: normalizedProgramCode,
      },
      select: {
        code: true,
        baseType: true,
        baseTypeCode: true,
        gradeComponentType: true,
        gradeComponentTypeCode: true,
        gradeComponentCode: true,
        fixedSemester: true,
      },
    });

    if (program) {
      const inferredFromSlot = await resolveReportTypeByProgramSlot({
        academicYearId: params.academicYearId,
        fixedSemester: program.fixedSemester,
        gradeComponentCode: program.gradeComponentCode,
      });
      return {
        reportType: inferredFromSlot || inferReportTypeFromProgram(program),
        programCode: program.code,
      };
    }
  }

  const aliasCode = normalizedProgramCode || normalizedReportType;
  const aliasDirectType = parseDirectReportType(aliasCode) || directType;
  const programByAlias = await prisma.examProgramConfig.findFirst({
    where: {
      academicYearId: params.academicYearId,
      isActive: true,
      ...(semesterScope ? { OR: semesterScope } : {}),
      AND: [
        {
          OR: [
            ...(aliasCode
              ? [
                  { code: aliasCode },
                  { baseTypeCode: aliasCode },
                  { gradeComponentTypeCode: aliasCode },
                ]
              : []),
            ...(aliasDirectType ? [{ baseType: aliasDirectType }] : []),
          ],
        },
      ],
    },
    select: {
      code: true,
      baseType: true,
      baseTypeCode: true,
      gradeComponentType: true,
      gradeComponentTypeCode: true,
      gradeComponentCode: true,
      fixedSemester: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  });

  if (programByAlias) {
    const inferredFromSlot = await resolveReportTypeByProgramSlot({
      academicYearId: params.academicYearId,
      fixedSemester: programByAlias.fixedSemester,
      gradeComponentCode: programByAlias.gradeComponentCode,
    });
    return {
      reportType: inferredFromSlot || inferReportTypeFromProgram(programByAlias),
      programCode: programByAlias.code,
    };
  }

  if (directTypeFromReportType) {
    return { reportType: directTypeFromReportType, programCode: null };
  }
  if (directTypeFromProgramCode && !normalizedReportType) {
    return { reportType: directTypeFromProgramCode, programCode: null };
  }

  throw new ApiError(
    400,
    `Program/tipe rapor ${aliasCode || normalizedReportType || normalizedProgramCode} tidak dikenali.`,
  );
};

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

export const getStudentReport = asyncHandler(async (req: Request, res: Response) => {
  const querySchema = z.object({
    studentId: z.coerce.number().int(),
    semester: z.nativeEnum(Semester),
    type: z.string().optional(),
    programCode: z.string().optional(),
  });

  const { studentId, semester, type, programCode } = querySchema.parse(req.query);

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
  }

  const context = await resolveReportTypeContext({
    academicYearId: activeYear.id,
    semester,
    reportType: type,
    programCode,
  });

  const reportData = await reportService.getStudentReport(
    studentId,
    activeYear.id,
    semester,
    context.reportType,
    context.programCode,
  );

  res.status(200).json(new ApiResponse(200, reportData, 'Data rapor berhasil diambil'));
});

export const getStudentSbtsReport = getStudentReport;

export const getClassLedger = asyncHandler(async (req: Request, res: Response) => {
  const querySchema = z.object({
    classId: z.coerce.number().int(),
    semester: z.nativeEnum(Semester),
    reportType: z.string().optional(),
    programCode: z.string().optional(),
  });
  const { classId, semester, reportType, programCode } = querySchema.parse(req.query);
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
  const context = await resolveReportTypeContext({
    academicYearId: activeYear.id,
    semester,
    reportType,
    programCode,
  });
  const ledgerData = await reportService.getClassLedger(
    classId,
    activeYear.id,
    semester,
    context.reportType,
    context.programCode,
  );
  
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.status(200).json(new ApiResponse(200, ledgerData, 'Data leger berhasil diambil'));
});

export const getClassExtracurricularReport = asyncHandler(async (req: Request, res: Response) => {
  const querySchema = z.object({
    classId: z.coerce.number().int(),
    semester: z.nativeEnum(Semester),
    reportType: z.string().optional(),
    programCode: z.string().optional(),
  });

  const { classId, semester, reportType, programCode } = querySchema.parse(req.query);

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');

  const context = await resolveReportTypeContext({
    academicYearId: activeYear.id,
    semester,
    reportType,
    programCode,
  });

  const reportData = await reportService.getClassExtracurricularReport(
    classId,
    activeYear.id,
    semester,
    context.reportType,
    context.programCode,
  );

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
    reportType: z.string().optional(),
    programCode: z.string().optional(),
    academicYearId: z.number().int().optional(),
  });
  const { enrollmentId, grade, description, semester, reportType, programCode, academicYearId } = bodySchema.parse(req.body);

  let targetAcademicYearId = academicYearId;
  if (!targetAcademicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!activeYear) throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
    targetAcademicYearId = activeYear.id;
  }

  const context = await resolveReportTypeContext({
    academicYearId: targetAcademicYearId,
    semester,
    reportType,
    programCode,
  });

  const result = await reportService.updateExtracurricularGrade(
    enrollmentId,
    grade,
    description,
    semester,
    context.reportType,
    targetAcademicYearId,
    context.programCode,
  );
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
