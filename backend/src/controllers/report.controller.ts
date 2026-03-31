import { Request, Response } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { reportService } from '../services/report.service';
import { Semester, ExamType, GradeComponentType } from '@prisma/client';
import {
  listHistoricalStudentsByIds,
  listHistoricalStudentsForAcademicYear,
  listHistoricalStudentsForClass,
} from '../utils/studentAcademicHistory';
import { ensureAcademicYearArchiveReadAccess } from '../utils/academicYearArchiveAccess';

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

const parseNumericScore = (raw: unknown): number | null => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const parseSlotScoreMap = (raw: unknown): Record<string, number | null> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, number | null> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const normalized = normalizeProgramCode(key);
    if (!normalized) return;
    result[normalized] = parseNumericScore(value);
  });
  return result;
};

const isUsTheorySlotCode = (raw: unknown): boolean => {
  const normalized = normalizeProgramCode(raw);
  return normalized === 'US_THEORY' || normalized === 'US_TEORI';
};

const isUsPracticeSlotCode = (raw: unknown): boolean => {
  const normalized = normalizeProgramCode(raw);
  return normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK';
};

const isUsSlotCode = (raw: unknown): boolean => isUsTheorySlotCode(raw) || isUsPracticeSlotCode(raw);

const hasUsSlotScore = (rawSlotScores: unknown): boolean => {
  const slotScores = parseSlotScoreMap(rawSlotScores);
  return Object.entries(slotScores).some(([slotCode, score]) => {
    if (score === null || score === undefined) return false;
    return isUsSlotCode(slotCode);
  });
};

const resolveEffectiveReportFinalScore = (grade: {
  usScore?: number | null;
  finalScore?: number | null;
  slotScores?: unknown;
}): number | null => {
  const finalScore = parseNumericScore(grade.finalScore);
  const usScore = parseNumericScore(grade.usScore);

  if (usScore !== null && (hasUsSlotScore(grade.slotScores) || finalScore === null || finalScore <= 0)) {
    return usScore;
  }
  return finalScore;
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

const setSlotReportType = (
  slotReportTypeByCode: Map<string, ExamType>,
  rawSlotCode: unknown,
  reportType: ExamType | null,
) => {
  const slotCode = normalizeProgramCode(rawSlotCode);
  if (!slotCode || !reportType || reportType === ExamType.FORMATIF) return;
  if (!slotReportTypeByCode.has(slotCode)) {
    slotReportTypeByCode.set(slotCode, reportType);
  }
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

type PrincipalResolvedAcademicYear = {
  id: number;
  name: string;
};

type PrincipalAcademicOverviewPayload = {
  academicYear: PrincipalResolvedAcademicYear;
  semester?: Semester | null;
  topStudents: Array<{
    studentId: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    averageScore: number;
    class?: {
      id: number;
      name: string;
      level?: string | null;
    } | null;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  }>;
  majors: Array<{
    majorId: number;
    name: string;
    code?: string | null;
    totalStudents: number;
    averageScore: number;
  }>;
};

type PrincipalDashboardSummaryPayload = {
  activeAcademicYear: PrincipalResolvedAcademicYear;
  totals: {
    students: number;
    teachers: number;
    pendingBudgetRequests: number;
    totalPendingBudgetAmount: number;
    totalPresentToday: number;
    totalAbsentToday: number;
  };
  studentByMajor: Array<{
    majorId: number;
    name: string;
    code: string;
    totalStudents: number;
    totalClasses: number;
  }>;
  teacherAssignmentSummary: {
    totalAssignments: number;
    totalTeachersWithAssignments: number;
  } | null;
  academicOverview: PrincipalAcademicOverviewPayload;
};

const finalLedgerPreviewSchema = z.object({
  academicYearIds: z.array(z.coerce.number().int().positive()).optional(),
  semesters: z.array(z.nativeEnum(Semester)).optional(),
  classId: z.coerce.number().int().positive().optional(),
  majorId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  limitStudents: z.coerce.number().int().min(1).max(1000).optional(),
});

type FinalLedgerSemesterColumn = {
  key: string;
  label: string;
  academicYearId: number;
  academicYearName: string;
  semester: Semester;
  order: number;
};

const parseAcademicYearSortKey = (name: string): number => {
  const matched = String(name || '').match(/(\d{4})/);
  return matched ? Number(matched[1]) : 0;
};

const sortAcademicYearsAscending = (years: Array<{ id: number; name: string }>) =>
  [...years].sort((a, b) => {
    const aKey = parseAcademicYearSortKey(a.name);
    const bKey = parseAcademicYearSortKey(b.name);
    if (aKey !== bKey) return aKey - bKey;
    return a.id - b.id;
  });

const resolveGradeTwelvePortfolioYears = (
  allYears: Array<{ id: number; name: string }>,
  selectedYears: Array<{ id: number; name: string }>,
): Array<{ id: number; name: string }> => {
  if (!allYears.length) return selectedYears;
  const orderedYears = sortAcademicYearsAscending(allYears);
  const orderedSelectedYears = sortAcademicYearsAscending(selectedYears);
  const anchorYearId =
    orderedSelectedYears.length > 0
      ? orderedSelectedYears[orderedSelectedYears.length - 1].id
      : orderedYears[orderedYears.length - 1].id;
  const anchorIndex = orderedYears.findIndex((year) => year.id === anchorYearId);
  const fallbackStart = Math.max(0, orderedYears.length - 3);
  const startIndex = anchorIndex >= 0 ? Math.max(0, anchorIndex - 2) : fallbackStart;
  const endIndex = anchorIndex >= 0 ? anchorIndex + 1 : orderedYears.length;
  const scoped = orderedYears.slice(startIndex, endIndex);
  return scoped.length > 0 ? scoped : orderedYears.slice(fallbackStart);
};

const buildFinalLedgerSemesterColumns = (
  years: Array<{ id: number; name: string }>,
  semesters: Semester[],
): FinalLedgerSemesterColumn[] => {
  const includesOdd = semesters.includes(Semester.ODD);
  const includesEven = semesters.includes(Semester.EVEN);
  const orderedYears = sortAcademicYearsAscending(years);

  let runningSemester = 1;
  const columns: FinalLedgerSemesterColumn[] = [];
  orderedYears.forEach((year) => {
    if (includesOdd) {
      columns.push({
        key: `${year.id}-${Semester.ODD}`,
        label: `SMT ${runningSemester}`,
        academicYearId: year.id,
        academicYearName: year.name,
        semester: Semester.ODD,
        order: runningSemester,
      });
      runningSemester += 1;
    }
    if (includesEven) {
      columns.push({
        key: `${year.id}-${Semester.EVEN}`,
        label: `SMT ${runningSemester}`,
        academicYearId: year.id,
        academicYearName: year.name,
        semester: Semester.EVEN,
        order: runningSemester,
      });
      runningSemester += 1;
    }
  });

  return columns;
};

const averageScore = (values: number[]): number | null => {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
};

const toFiniteScore = (raw: unknown): number | null => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const resolvePreviewUsTheoryScore = (row: {
  slotScores?: unknown;
  usScore?: number | null;
}): number | null => {
  const slots = parseSlotScoreMap(row.slotScores);
  const directTheory = toFiniteScore(slots.US_THEORY ?? slots.US_TEORI);
  if (directTheory !== null) return directTheory;
  return toFiniteScore(row.usScore);
};

const resolvePreviewUsPracticeScore = (row: { slotScores?: unknown }): number | null => {
  const slots = parseSlotScoreMap(row.slotScores);
  return toFiniteScore(slots.US_PRACTICE ?? slots.US_PRAKTEK);
};

const resolvePreviewComponentAverageScore = (row: {
  finalScore?: number | null;
  usScore?: number | null;
  slotScores?: unknown;
}): number | null => {
  const slots = parseSlotScoreMap(row.slotScores);
  const slotEntries = Object.entries(slots);
  const componentValues = slotEntries
    .filter(([slotCode, value]) => {
      if (value === null || value === undefined) return false;
      return !isUsSlotCode(slotCode);
    })
    .map(([, value]) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (componentValues.length > 0) {
    return averageScore(componentValues);
  }

  // US-only rows are carrier rows for US calculation, not portfolio/mapel ledger rows.
  if (slotEntries.length > 0 && slotEntries.every(([slotCode]) => isUsSlotCode(slotCode))) {
    return null;
  }

  return resolveEffectiveReportFinalScore({
    finalScore: row.finalScore,
    usScore: row.usScore,
    slotScores: row.slotScores,
  });
};

const isGradeTwelveStudent = (studentClass: { level?: string | null; name?: string | null } | null | undefined) => {
  const normalizedLevel = String(studentClass?.level || '').trim().toUpperCase();
  if (normalizedLevel === 'XII' || normalizedLevel === '12') return true;

  const className = String(studentClass?.name || '').trim().toUpperCase();
  return className.startsWith('XII') || className.startsWith('12');
};

const isCurriculumAccessAllowed = async (user: { id?: number | string; role?: string | null }) => {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'PRINCIPAL') return true;
  if (role !== 'TEACHER') return false;
  const teacherId = Number(user?.id || 0);
  if (!Number.isFinite(teacherId) || teacherId <= 0) return false;
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { additionalDuties: true },
  });
  const duties = (teacher?.additionalDuties || []).map((item) => String(item || '').toUpperCase());
  return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
};

const resolveReportReader = (user: { id?: number | string; role?: string | null } | null | undefined) => {
  const actorId = Number(user?.id || 0);
  const actorRole = String(user?.role || '').trim().toUpperCase();
  if (!Number.isFinite(actorId) || actorId <= 0 || !actorRole) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }
  return {
    actorId,
    actorRole,
  };
};

const resolveReadableReportAcademicYearId = async (params: {
  user: { id?: number | string; role?: string | null } | null | undefined;
  academicYearId?: number;
  classId?: number;
  studentId?: number;
}) => {
  const requestedAcademicYearId = Number(params.academicYearId || 0);
  let effectiveAcademicYearId = requestedAcademicYearId;

  if (!Number.isFinite(effectiveAcademicYearId) || effectiveAcademicYearId <= 0) {
    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!activeYear) {
      throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');
    }
    effectiveAcademicYearId = activeYear.id;
  }

  const actor = resolveReportReader(params.user);
  await ensureAcademicYearArchiveReadAccess({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    academicYearId: effectiveAcademicYearId,
    module: 'REPORTS',
    classId: params.classId || null,
    studentId: params.studentId || null,
  });

  return effectiveAcademicYearId;
};

type FinalLedgerPreviewData = {
  filters: {
    academicYears: Array<{ id: number; name: string }>;
    semesters: Semester[];
    classId: number | null;
    majorId: number | null;
    studentId: number | null;
  };
  columns: {
    semesterColumns: FinalLedgerSemesterColumn[];
    subjectColumns: Array<{ id: number; name: string; code: string }>;
  };
  summary: {
    totalStudents: number;
    totalSubjects: number;
    studentsWithResult: number;
    averagePortfolio: number | null;
    averageUs: number | null;
    averagePkl: number | null;
    averageFinal: number | null;
  };
  rows: Array<{
    student: {
      id: number;
      name: string;
      nis: string | null;
      nisn: string | null;
      class:
        | {
            id: number;
            name: string;
            level: string;
          }
        | null;
      major:
        | {
            id: number;
            name: string;
            code: string;
          }
        | null;
    };
    portfolioBySemester: Record<string, number | null>;
    portfolioAverage: number | null;
    ledgerBySubject: Record<string, number | null>;
    assignmentScore: number | null;
    usTheory: number | null;
    usPractice: number | null;
    usAverage: number | null;
    pklScore: number | null;
    finalScore: number | null;
  }>;
};

export const buildFinalLedgerPreviewData = async (
  parsed: z.infer<typeof finalLedgerPreviewSchema>,
): Promise<FinalLedgerPreviewData> => {
  const selectedSemesters = (parsed.semesters || [Semester.ODD, Semester.EVEN]).filter(
    (value, index, list) => list.indexOf(value) === index,
  );
  if (!selectedSemesters.length) {
    throw new ApiError(400, 'Pilih minimal satu semester.');
  }

  let academicYearIds = (parsed.academicYearIds || []).filter(
    (value, index, list) => list.indexOf(value) === index,
  );
  if (!academicYearIds.length) {
    const activeAcademicYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!activeAcademicYear) {
      throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan.');
    }
    academicYearIds = [activeAcademicYear.id];
  }

  const selectedAcademicYears = await prisma.academicYear.findMany({
    where: { id: { in: academicYearIds } },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  if (!selectedAcademicYears.length) {
    throw new ApiError(404, 'Tahun ajaran sumber tidak ditemukan.');
  }

  const orderedSelectedAcademicYears = sortAcademicYearsAscending(selectedAcademicYears);
  const selectedClass = parsed.classId
    ? await prisma.class.findUnique({
        where: { id: parsed.classId },
        select: {
          id: true,
          academicYearId: true,
        },
      })
    : null;

  if (parsed.classId && !selectedClass) {
    throw new ApiError(404, 'Kelas tidak ditemukan.');
  }

  if (
    selectedClass &&
    !selectedAcademicYears.some((item) => item.id === selectedClass.academicYearId)
  ) {
    throw new ApiError(400, 'Kelas tidak sesuai dengan tahun ajaran sumber yang dipilih.');
  }

  const referenceAcademicYearId =
    selectedClass?.academicYearId ||
    orderedSelectedAcademicYears[orderedSelectedAcademicYears.length - 1]?.id ||
    selectedAcademicYears[selectedAcademicYears.length - 1]?.id;

  if (!referenceAcademicYearId) {
    throw new ApiError(404, 'Tahun ajaran referensi tidak ditemukan.');
  }

  const studentLimit = parsed.limitStudents || 1000;
  const students = await listHistoricalStudentsForAcademicYear({
    academicYearId: referenceAcademicYearId,
    studentId: parsed.studentId || null,
    classId: parsed.classId || null,
    majorId: parsed.majorId || null,
    limit: studentLimit,
  });

  const allStudentsGradeXii =
    students.length > 0 &&
    students.every((student) =>
      isGradeTwelveStudent({
        level: student.studentClass?.level,
        name: student.studentClass?.name,
      }),
    );

  let portfolioAcademicYears = selectedAcademicYears;
  let effectiveSemesterSelection = selectedSemesters;
  if (allStudentsGradeXii) {
    const allAcademicYears = await prisma.academicYear.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const resolvedPortfolioYears = resolveGradeTwelvePortfolioYears(
      allAcademicYears,
      selectedAcademicYears,
    );
    if (resolvedPortfolioYears.length > 0) {
      portfolioAcademicYears = resolvedPortfolioYears;
    }
    // Leger kelas XII memakai rentang tetap SMT 1-5 (lintas tahun), jadi semester sumber
    // dipaksa ODD+EVEN lalu dipotong 5 kolom pertama secara kronologis.
    effectiveSemesterSelection = [Semester.ODD, Semester.EVEN];
  }

  const semesterColumnsBase = buildFinalLedgerSemesterColumns(
    portfolioAcademicYears,
    effectiveSemesterSelection,
  );
  const semesterColumns = allStudentsGradeXii
    ? semesterColumnsBase.slice(0, Math.min(5, semesterColumnsBase.length))
    : semesterColumnsBase;
  const semesterColumnOrder = new Map<string, number>();
  semesterColumns.forEach((column) => {
    semesterColumnOrder.set(column.key, column.order);
  });

  if (!students.length) {
    return {
      filters: {
        academicYears: portfolioAcademicYears,
        semesters: effectiveSemesterSelection,
        classId: parsed.classId || null,
        majorId: parsed.majorId || null,
        studentId: parsed.studentId || null,
      },
      columns: {
        semesterColumns,
        subjectColumns: [],
      },
      summary: {
        totalStudents: 0,
        totalSubjects: 0,
        studentsWithResult: 0,
        averagePortfolio: null,
        averageUs: null,
        averagePkl: null,
        averageFinal: null,
      },
      rows: [],
    };
  }

  const studentIds = students.map((item) => item.id);
  const selectedAcademicYearIdSet = selectedAcademicYears.map((item) => item.id);
  const portfolioAcademicYearIdSet = portfolioAcademicYears.map((item) => item.id);
  const reportAcademicYearIdSet = Array.from(
    new Set([...selectedAcademicYearIdSet, ...portfolioAcademicYearIdSet]),
  );
  const reportSemesterSelection = allStudentsGradeXii
    ? [Semester.ODD, Semester.EVEN]
    : selectedSemesters;

  const [reportGrades, ukkAssessments, internships, activePrograms, gradeComponents] = await Promise.all([
    prisma.reportGrade.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId: { in: reportAcademicYearIdSet },
        semester: { in: reportSemesterSelection },
      },
      select: {
        studentId: true,
        subjectId: true,
        academicYearId: true,
        semester: true,
        finalScore: true,
        usScore: true,
        slotScores: true,
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    }),
    prisma.ukkAssessment.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId: { in: selectedAcademicYearIdSet },
      },
      select: {
        studentId: true,
        subjectId: true,
        finalScore: true,
      },
    }),
    prisma.internship.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId: { in: selectedAcademicYearIdSet },
      },
      select: {
        studentId: true,
        finalGrade: true,
        industryScore: true,
        defenseScore: true,
      },
    }),
    prisma.examProgramConfig.findMany({
      where: {
        academicYearId: { in: selectedAcademicYearIdSet },
        isActive: true,
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
    }),
    prisma.examGradeComponent.findMany({
      where: {
        academicYearId: { in: selectedAcademicYearIdSet },
        isActive: true,
      },
      select: {
        code: true,
        reportSlot: true,
        reportSlotCode: true,
      },
    }),
  ]);

  const reportByStudent = new Map<number, typeof reportGrades>();
  const subjectInfoById = new Map<number, { id: number; name: string; code: string }>();
  const subjectHasLedgerScore = new Set<number>();
  reportGrades.forEach((grade) => {
    const currentRows = reportByStudent.get(grade.studentId) || [];
    currentRows.push(grade);
    reportByStudent.set(grade.studentId, currentRows);
    if (grade.subject) {
      subjectInfoById.set(grade.subject.id, {
        id: grade.subject.id,
        name: grade.subject.name,
        code: grade.subject.code,
      });
    }
    const effectiveScore = resolvePreviewComponentAverageScore({
      finalScore: grade.finalScore,
      usScore: grade.usScore,
      slotScores: grade.slotScores,
    });
    const semesterKey = `${grade.academicYearId}-${grade.semester}`;
    if (effectiveScore !== null && semesterColumnOrder.has(semesterKey)) {
      subjectHasLedgerScore.add(grade.subjectId);
    }
  });

  const ukkByStudent = new Map<number, typeof ukkAssessments>();
  ukkAssessments.forEach((assessment) => {
    const currentRows = ukkByStudent.get(assessment.studentId) || [];
    currentRows.push(assessment);
    ukkByStudent.set(assessment.studentId, currentRows);
  });

  const subjectColumns = Array.from(subjectInfoById.values())
    .filter((subject) => subjectHasLedgerScore.has(subject.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pklScoreMap = new Map<number, number[]>();
  internships.forEach((row) => {
    const finalGrade = toFiniteScore(row.finalGrade);
    const industryScore = toFiniteScore(row.industryScore);
    const defenseScore = toFiniteScore(row.defenseScore);
    const score =
      finalGrade !== null
        ? finalGrade
        : industryScore !== null && defenseScore !== null
          ? Number((industryScore * 0.7 + defenseScore * 0.3).toFixed(2))
          : null;
    if (score === null) return;
    const current = pklScoreMap.get(row.studentId) || [];
    current.push(score);
    pklScoreMap.set(row.studentId, current);
  });

  const activeFinalProgramTypes = activePrograms
    .map((program) => inferReportTypeFromProgram(program))
    .filter((type) => type === ExamType.SAS || type === ExamType.SAT);
  const hasSatProgram = activeFinalProgramTypes.includes(ExamType.SAT);
  const hasSasProgram = activeFinalProgramTypes.includes(ExamType.SAS);
  const preferredAssignmentTypeForXii = hasSatProgram
    ? ExamType.SAT
    : hasSasProgram
      ? ExamType.SAS
      : null;
  const preferredAssignmentTypeDefault = hasSasProgram
    ? ExamType.SAS
    : hasSatProgram
      ? ExamType.SAT
      : null;

  const slotReportTypeByCode = new Map<string, ExamType>();
  activePrograms.forEach((program) => {
    const inferredType = inferReportTypeFromProgram(program);
    setSlotReportType(slotReportTypeByCode, program.gradeComponentCode, inferredType);
    setSlotReportType(slotReportTypeByCode, program.gradeComponentTypeCode, inferredType);
    setSlotReportType(slotReportTypeByCode, program.code, inferredType);
  });
  gradeComponents.forEach((component) => {
    const inferredType = inferReportTypeFromSlotCode(
      component.reportSlotCode || component.reportSlot,
    );
    setSlotReportType(slotReportTypeByCode, component.code, inferredType);
  });

  const rows = students.map((student) => {
    const grades = reportByStudent.get(student.id) || [];
    const ukkRows = ukkByStudent.get(student.id) || [];
    const slotScoresBySemester = new Map<string, number[]>();
    const subjectScores = new Map<number, number[]>();
    const usTheoryScores: number[] = [];
    const usPracticeScores: number[] = [];
    const assignmentScores: number[] = [];
    const isGradeXii = isGradeTwelveStudent({
      level: student.studentClass?.level,
      name: student.studentClass?.name,
    });
    const selectedYearSet = new Set(selectedAcademicYearIdSet);
    const preferredAssignmentType = isGradeXii
      ? preferredAssignmentTypeForXii
      : preferredAssignmentTypeDefault;

    grades.forEach((grade) => {
      const effectiveSemesterScore = resolvePreviewComponentAverageScore({
        finalScore: grade.finalScore,
        usScore: grade.usScore,
        slotScores: grade.slotScores,
      });
      const semesterKey = `${grade.academicYearId}-${grade.semester}`;
      if (effectiveSemesterScore !== null && semesterColumnOrder.has(semesterKey)) {
        const semesterRows = slotScoresBySemester.get(semesterKey) || [];
        semesterRows.push(effectiveSemesterScore);
        slotScoresBySemester.set(semesterKey, semesterRows);

        const subjectRows = subjectScores.get(grade.subjectId) || [];
        subjectRows.push(effectiveSemesterScore);
        subjectScores.set(grade.subjectId, subjectRows);
      }

      if (selectedYearSet.has(grade.academicYearId)) {
        const usTheoryScore = resolvePreviewUsTheoryScore({
          slotScores: grade.slotScores,
          usScore: grade.usScore,
        });
        if (usTheoryScore !== null) {
          usTheoryScores.push(usTheoryScore);
        }

        const usPracticeScore = resolvePreviewUsPracticeScore({ slotScores: grade.slotScores });
        if (usPracticeScore !== null) {
          usPracticeScores.push(usPracticeScore);
        }

        const parsedSlotScores = parseSlotScoreMap(grade.slotScores);
        const sasScores: number[] = [];
        const satScores: number[] = [];
        Object.entries(parsedSlotScores).forEach(([slotCode, value]) => {
          if (value === null) return;
          if (isUsSlotCode(slotCode)) return;
          const slotType =
            slotReportTypeByCode.get(slotCode) || inferReportTypeFromSlotCode(slotCode, grade.semester);
          if (slotType === ExamType.SAT) {
            satScores.push(value);
            return;
          }
          if (slotType === ExamType.SAS) {
            sasScores.push(value);
          }
        });
        if (preferredAssignmentType === ExamType.SAT) {
          if (satScores.length > 0) {
            assignmentScores.push(...satScores);
          } else if (sasScores.length > 0) {
            assignmentScores.push(...sasScores);
          }
        } else if (preferredAssignmentType === ExamType.SAS) {
          if (sasScores.length > 0) {
            assignmentScores.push(...sasScores);
          } else if (satScores.length > 0) {
            assignmentScores.push(...satScores);
          }
        } else {
          assignmentScores.push(...satScores, ...sasScores);
        }
      }
    });

    ukkRows.forEach((assessment) => {
      const score = toFiniteScore(assessment.finalScore);
      if (score === null) return;
      usPracticeScores.push(score);
    });

    const portfolioBySemester = semesterColumns.reduce<Record<string, number | null>>((acc, column) => {
      acc[column.key] = averageScore(slotScoresBySemester.get(column.key) || []);
      return acc;
    }, {});

    const portfolioAverage = averageScore(
      Object.values(portfolioBySemester).filter((value): value is number => value !== null),
    );

    const ledgerBySubject = subjectColumns.reduce<Record<string, number | null>>((acc, subject) => {
      acc[String(subject.id)] = averageScore(subjectScores.get(subject.id) || []);
      return acc;
    }, {});

    const assignmentScore = averageScore(assignmentScores);

    const usTheory = averageScore(usTheoryScores);
    const usPractice = averageScore(usPracticeScores);
    const usAverage = averageScore([usTheory, usPractice].filter((value): value is number => value !== null));
    const pklScore = averageScore(pklScoreMap.get(student.id) || []);

    const finalScore = averageScore(
      [portfolioAverage, assignmentScore, usAverage, pklScore].filter(
        (value): value is number => value !== null,
      ),
    );

    return {
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
        class: student.studentClass
          ? {
              id: student.studentClass.id,
              name: student.studentClass.name,
              level: student.studentClass.level,
            }
          : null,
        major: student.studentClass?.major
          ? {
              id: student.studentClass.major.id,
              name: student.studentClass.major.name,
              code: student.studentClass.major.code,
            }
          : null,
      },
      portfolioBySemester,
      portfolioAverage,
      ledgerBySubject,
      assignmentScore,
      usTheory,
      usPractice,
      usAverage,
      pklScore,
      finalScore,
    };
  });

  const summary = {
    totalStudents: rows.length,
    totalSubjects: subjectColumns.length,
    studentsWithResult: rows.filter((row) => row.finalScore !== null).length,
    averagePortfolio: averageScore(
      rows
        .map((row) => row.portfolioAverage)
        .filter((value): value is number => value !== null),
    ),
    averageUs: averageScore(
      rows
        .map((row) => row.usAverage)
        .filter((value): value is number => value !== null),
    ),
    averagePkl: averageScore(
      rows
        .map((row) => row.pklScore)
        .filter((value): value is number => value !== null),
    ),
    averageFinal: averageScore(
      rows
        .map((row) => row.finalScore)
        .filter((value): value is number => value !== null),
    ),
  };

  return {
    filters: {
      academicYears: portfolioAcademicYears,
      semesters: effectiveSemesterSelection,
      classId: parsed.classId || null,
      majorId: parsed.majorId || null,
      studentId: parsed.studentId || null,
    },
    columns: {
      semesterColumns,
      subjectColumns,
    },
    summary,
    rows,
  };
};

const resolvePrincipalAcademicYear = async (
  academicYearId?: number,
): Promise<PrincipalResolvedAcademicYear> => {
  const academicYear = academicYearId
    ? await prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { id: true, name: true },
      })
    : await prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true, name: true },
      });

  if (!academicYear) {
    throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan');
  }

  return academicYear;
};

const buildEmptyPrincipalAcademicOverviewPayload = (
  academicYear: PrincipalResolvedAcademicYear,
  semester?: Semester,
): PrincipalAcademicOverviewPayload => ({
  academicYear: {
    id: academicYear.id,
    name: academicYear.name,
  },
  semester: semester ?? null,
  topStudents: [],
  majors: [],
});

const buildPrincipalAcademicOverviewPayload = async (params: {
  academicYear: PrincipalResolvedAcademicYear;
  semester?: Semester;
}): Promise<PrincipalAcademicOverviewPayload> => {
  const where: Record<string, unknown> = {
    academicYearId: params.academicYear.id,
  };

  if (params.semester) {
    where.semester = params.semester;
  }

  const reportGrades = await prisma.reportGrade.findMany({
    where,
    select: {
      studentId: true,
      finalScore: true,
      usScore: true,
      slotScores: true,
    },
  });

  if (!reportGrades.length) {
    return buildEmptyPrincipalAcademicOverviewPayload(params.academicYear, params.semester);
  }

  const aggregateByStudent = new Map<number, { total: number; count: number }>();
  reportGrades.forEach((grade) => {
    const effectiveScore = resolveEffectiveReportFinalScore(grade);
    if (effectiveScore === null) return;
    const current = aggregateByStudent.get(grade.studentId) || { total: 0, count: 0 };
    current.total += effectiveScore;
    current.count += 1;
    aggregateByStudent.set(grade.studentId, current);
  });

  if (!aggregateByStudent.size) {
    return buildEmptyPrincipalAcademicOverviewPayload(params.academicYear, params.semester);
  }

  const students = await listHistoricalStudentsByIds(
    Array.from(aggregateByStudent.keys()),
    params.academicYear.id,
  );
  const studentMap = new Map<number, (typeof students)[number]>();
  students.forEach((student) => {
    studentMap.set(student.id, student);
  });

  const enriched: Array<{
    studentId: number;
    averageScore: number;
    student: (typeof students)[number];
  }> = [];

  aggregateByStudent.forEach((aggregate, studentId) => {
    const student = studentMap.get(studentId);
    if (!student || !student.studentClass || !student.studentClass.major || aggregate.count <= 0) {
      return;
    }

    const roundedAverage = Math.round((aggregate.total / aggregate.count) * 10) / 10;
    enriched.push({
      studentId,
      averageScore: roundedAverage,
      student,
    });
  });

  if (!enriched.length) {
    return buildEmptyPrincipalAcademicOverviewPayload(params.academicYear, params.semester);
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
    const major = item.student.studentClass!.major!;
    const current = majorMap.get(major.id) || {
      majorId: major.id,
      name: major.name,
      code: major.code,
      totalStudents: 0,
      totalScore: 0,
    };

    current.totalStudents += 1;
    current.totalScore += item.averageScore;
    majorMap.set(major.id, current);
  });

  const majors = Array.from(majorMap.values())
    .map((item) => ({
      majorId: item.majorId,
      name: item.name,
      code: item.code,
      totalStudents: item.totalStudents,
      averageScore:
        item.totalStudents > 0 ? Math.round((item.totalScore / item.totalStudents) * 10) / 10 : 0,
    }))
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

  return {
    academicYear: {
      id: params.academicYear.id,
      name: params.academicYear.name,
    },
    semester: params.semester ?? null,
    topStudents,
    majors,
  };
};

const buildPrincipalDashboardSummaryPayload = async (params: {
  principalUserId: number;
  academicYear: PrincipalResolvedAcademicYear;
  semester?: Semester;
}): Promise<PrincipalDashboardSummaryPayload> => {
  const [students, teachers, pendingBudgetAggregate, assignments, academicOverview] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: 'STUDENT',
      },
      select: {
        id: true,
        studentClass: {
          select: {
            id: true,
            name: true,
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
    }),
    prisma.user.count({
      where: {
        role: 'TEACHER',
      },
    }),
    prisma.budgetRequest.aggregate({
      where: {
        approverId: params.principalUserId,
        academicYearId: params.academicYear.id,
        approvalStatus: 'PENDING',
      },
      _count: {
        id: true,
      },
      _sum: {
        totalAmount: true,
      },
    }),
    prisma.teacherAssignment.findMany({
      where: {
        academicYearId: params.academicYear.id,
      },
      select: {
        teacherId: true,
      },
    }),
    buildPrincipalAcademicOverviewPayload({
      academicYear: params.academicYear,
      semester: params.semester,
    }),
  ]);

  const studentByMajorMap = new Map<
    number,
    {
      majorId: number;
      name: string;
      code: string;
      totalStudents: number;
      classIds: Set<number>;
    }
  >();

  students.forEach((student) => {
    const studentClass = student.studentClass;
    const major = studentClass?.major;
    if (!studentClass || !major) return;

    const current = studentByMajorMap.get(major.id) || {
      majorId: major.id,
      name: major.name,
      code: major.code,
      totalStudents: 0,
      classIds: new Set<number>(),
    };

    current.totalStudents += 1;
    current.classIds.add(studentClass.id);
    studentByMajorMap.set(major.id, current);
  });

  const studentByMajor = Array.from(studentByMajorMap.values())
    .map((item) => ({
      majorId: item.majorId,
      name: item.name,
      code: item.code,
      totalStudents: item.totalStudents,
      totalClasses: item.classIds.size,
    }))
    .sort((a, b) => b.totalStudents - a.totalStudents);

  const uniqueTeacherIds = new Set<number>();
  assignments.forEach((assignment) => {
    if (assignment.teacherId) {
      uniqueTeacherIds.add(assignment.teacherId);
    }
  });

  return {
    activeAcademicYear: {
      id: params.academicYear.id,
      name: params.academicYear.name,
    },
    totals: {
      students: students.length,
      teachers,
      pendingBudgetRequests: pendingBudgetAggregate._count.id,
      totalPendingBudgetAmount: Number(pendingBudgetAggregate._sum.totalAmount || 0),
      totalPresentToday: 0,
      totalAbsentToday: 0,
    },
    studentByMajor,
    teacherAssignmentSummary: {
      totalAssignments: assignments.length,
      totalTeachersWithAssignments: uniqueTeacherIds.size,
    },
    academicOverview,
  };
};

export const getPrincipalAcademicOverview = asyncHandler(
  async (req: Request, res: Response) => {
    const { academicYearId, semester } = principalAcademicOverviewQuerySchema.parse(
      req.query,
    );
    const academicYear = await resolvePrincipalAcademicYear(academicYearId);
    const overview = await buildPrincipalAcademicOverviewPayload({
      academicYear,
      semester,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        overview,
        'Ringkasan akademik berhasil diambil',
      ),
    );
  },
);

export const getPrincipalDashboardSummary = asyncHandler(
  async (req: Request, res: Response) => {
    const { academicYearId, semester } = principalAcademicOverviewQuerySchema.parse(
      req.query,
    );
    const user = (req as any).user as { id?: number | string };
    const principalUserId = Number(user?.id || 0);

    if (!principalUserId) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const academicYear = await resolvePrincipalAcademicYear(academicYearId);
    const summary = await buildPrincipalDashboardSummaryPayload({
      principalUserId,
      academicYear,
      semester,
    });

    res.status(200).json(
      new ApiResponse(
        200,
        summary,
        'Ringkasan dashboard kepala sekolah berhasil diambil',
      ),
    );
  },
);

export const getFinalLedgerPreview = asyncHandler(async (req: Request, res: Response) => {
  const parsed = finalLedgerPreviewSchema.parse(req.body || {});
  const user = (req as any).user as { id?: number | string; role?: string | null };
  const accessAllowed = await isCurriculumAccessAllowed(user);
  if (!accessAllowed) {
    throw new ApiError(403, 'Anda tidak memiliki akses ke fitur Leger Nilai Akhir.');
  }
  const data = await buildFinalLedgerPreviewData(parsed);

  return res.status(200).json(
    new ApiResponse(200, data, data.rows.length ? 'Preview leger nilai akhir berhasil dihitung.' : 'Belum ada siswa sesuai filter.'),
  );
});

export const exportFinalLedgerPreview = asyncHandler(async (req: Request, res: Response) => {
  const parsed = finalLedgerPreviewSchema.parse(req.body || {});
  const user = (req as any).user as { id?: number | string; role?: string | null };
  const accessAllowed = await isCurriculumAccessAllowed(user);
  if (!accessAllowed) {
    throw new ApiError(403, 'Anda tidak memiliki akses ke fitur Leger Nilai Akhir.');
  }

  const data = await buildFinalLedgerPreviewData(parsed);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIS KGB2';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Leger Nilai Akhir');
  const headers = [
    'No',
    'Nama Siswa',
    'NIS',
    'NISN',
    'Kelas',
    ...data.columns.semesterColumns.map((column) => column.label),
    'Rata-rata Portofolio',
    ...data.columns.subjectColumns.map((subject) => `${subject.code} - ${subject.name}`),
    'Penugasan',
    'Rata-rata US',
    'Nilai PKL',
    'Nilai Akhir',
  ];

  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  data.rows.forEach((row, index) => {
    worksheet.addRow([
      index + 1,
      row.student.name,
      row.student.nis || '',
      row.student.nisn || '',
      row.student.class?.name || '',
      ...data.columns.semesterColumns.map((column) => row.portfolioBySemester[column.key] ?? null),
      row.portfolioAverage,
      ...data.columns.subjectColumns.map((subject) => row.ledgerBySubject[String(subject.id)] ?? null),
      row.assignmentScore,
      row.usAverage,
      row.pklScore,
      row.finalScore,
    ]);
  });

  if (data.rows.length > 0) {
    const averageBy = (values: Array<number | null | undefined>) => {
      const valid = values.filter(
        (value): value is number => value !== null && value !== undefined && Number.isFinite(Number(value)),
      );
      if (!valid.length) return null;
      return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
    };

    worksheet.addRow([
      '',
      'RATA-RATA',
      '',
      '',
      '',
      ...data.columns.semesterColumns.map((column) =>
        averageBy(data.rows.map((row) => row.portfolioBySemester[column.key])),
      ),
      averageBy(data.rows.map((row) => row.portfolioAverage)),
      ...data.columns.subjectColumns.map((subject) =>
        averageBy(data.rows.map((row) => row.ledgerBySubject[String(subject.id)])),
      ),
      averageBy(data.rows.map((row) => row.assignmentScore)),
      averageBy(data.rows.map((row) => row.usAverage)),
      averageBy(data.rows.map((row) => row.pklScore)),
      averageBy(data.rows.map((row) => row.finalScore)),
    ]);

    const footerRow = worksheet.getRow(worksheet.rowCount);
    footerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  }

  worksheet.columns.forEach((column, index) => {
    if (index === 1) {
      column.width = 6;
      return;
    }
    if (index === 2) {
      column.width = 28;
      return;
    }
    if (index <= 5) {
      column.width = 16;
      return;
    }
    column.width = 14;
  });

  const reportDate = new Date().toISOString().slice(0, 10);
  const fileName = `leger-nilai-akhir-${reportDate}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}\"`);
  await workbook.xlsx.write(res);
  res.end();
});

export const getConsolidationPreview = getFinalLedgerPreview;

export const getClassRankings = asyncHandler(async (req: Request, res: Response) => {
  const { classId, academicYearId, semester } = rankingQuerySchema.parse(req.query);

  const classData = await prisma.class.findUnique({
    where: { id: classId },
    select: { academicYearId: true }
  });

  if (!classData) {
    throw new ApiError(404, 'Kelas tidak ditemukan');
  }

  const effectiveAcademicYearId = await resolveReadableReportAcademicYearId({
    user: (req as any).user,
    academicYearId: academicYearId ?? classData.academicYearId,
    classId,
  });

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
    },
  });

  if (!classData) {
    throw new ApiError(404, 'Kelas tidak ditemukan');
  }

  const effectiveAcademicYearId = academicYearId ?? classData.academicYearId;

  if (effectiveAcademicYearId !== classData.academicYearId) {
    throw new ApiError(400, 'Tahun ajaran tidak sesuai dengan kelas');
  }

  const classStudents = await listHistoricalStudentsForClass(classId, effectiveAcademicYearId);
  const studentIds = classStudents.map((s) => s.id);

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
          students: classStudents.map((student) => ({
            student: {
              id: student.id,
              name: student.name,
              nis: student.nis,
              nisn: student.nisn,
            },
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

  const studentsWithGrades = classStudents.map((student) => {
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
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
      },
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
    academicYearId: z.coerce.number().int().optional(),
    semester: z.nativeEnum(Semester),
    type: z.string().optional(),
    programCode: z.string().optional(),
  });

  const { studentId, academicYearId, semester, type, programCode } = querySchema.parse(req.query);
  const effectiveAcademicYearId = await resolveReadableReportAcademicYearId({
    user: (req as any).user,
    academicYearId,
    studentId,
  });

  const context = await resolveReportTypeContext({
    academicYearId: effectiveAcademicYearId,
    semester,
    reportType: type,
    programCode,
  });

  const reportData = await reportService.getStudentReport(
    studentId,
    effectiveAcademicYearId,
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
    academicYearId: z.coerce.number().int().optional(),
    semester: z.nativeEnum(Semester),
    reportType: z.string().optional(),
    programCode: z.string().optional(),
  });
  const { classId, academicYearId, semester, reportType, programCode } = querySchema.parse(req.query);
  const effectiveAcademicYearId = await resolveReadableReportAcademicYearId({
    user: (req as any).user,
    academicYearId,
    classId,
  });
  const context = await resolveReportTypeContext({
    academicYearId: effectiveAcademicYearId,
    semester,
    reportType,
    programCode,
  });
  const ledgerData = await reportService.getClassLedger(
    classId,
    effectiveAcademicYearId,
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
    academicYearId: z.coerce.number().int().optional(),
    semester: z.nativeEnum(Semester),
    reportType: z.string().optional(),
    programCode: z.string().optional(),
  });

  const { classId, academicYearId, semester, reportType, programCode } = querySchema.parse(req.query);
  const effectiveAcademicYearId = await resolveReadableReportAcademicYearId({
    user: (req as any).user,
    academicYearId,
    classId,
  });

  const context = await resolveReportTypeContext({
    academicYearId: effectiveAcademicYearId,
    semester,
    reportType,
    programCode,
  });

  const reportData = await reportService.getClassExtracurricularReport(
    classId,
    effectiveAcademicYearId,
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
