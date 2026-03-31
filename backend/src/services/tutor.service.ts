import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';
import { Semester, Prisma, ExamType, ExtracurricularCategory } from '@prisma/client';
import { createInAppNotification } from './mobilePushNotification.service';

type ExtracurricularFieldPair = {
  gradeField: 'gradeSbtsOdd' | 'gradeSas' | 'gradeSat' | 'gradeSbtsEven';
  descriptionField: 'descSbtsOdd' | 'descSas' | 'descSat' | 'descSbtsEven';
};

const EXTRACURRICULAR_PREDICATES = ['SB', 'B', 'C', 'K'] as const;
type ExtracurricularPredicate = (typeof EXTRACURRICULAR_PREDICATES)[number];

const DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS: Record<ExtracurricularPredicate, string> = {
  SB: 'Sangat Baik (SB)',
  B: 'Baik (B)',
  C: 'Cukup (C)',
  K: 'Kurang (K)',
};

const EXTRACURRICULAR_ATTENDANCE_STATUSES = ['PRESENT', 'PERMIT', 'SICK', 'ABSENT'] as const;
type ExtracurricularAttendanceStatus = (typeof EXTRACURRICULAR_ATTENDANCE_STATUSES)[number];

function normalizeAttendanceStatus(raw: unknown): ExtracurricularAttendanceStatus {
  const value = String(raw || '').trim().toUpperCase();
  if (value === 'PRESENT' || value === 'HADIR') return 'PRESENT';
  if (value === 'PERMIT' || value === 'IZIN') return 'PERMIT';
  if (value === 'SICK' || value === 'SAKIT') return 'SICK';
  if (value === 'ABSENT' || value === 'ALPA') return 'ABSENT';
  throw new ApiError(400, 'Status absensi harus salah satu dari HADIR, IZIN, SAKIT, atau ALPA.');
}

function sanitizeWeekKey(raw: unknown): string {
  const value = String(raw || '').trim().toUpperCase();
  if (!/^\d{4}-W\d{2}$/.test(value)) {
    throw new ApiError(400, 'Format pekan absensi tidak valid.');
  }
  return value;
}

function getCurrentWeekKey(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function normalizeProgramCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isFormativeAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  return code === 'FORMATIF' || code === 'FORMATIVE' || code.startsWith('NF');
}

function isMidtermAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(code)) return true;
  return code.includes('MIDTERM');
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(code)) return true;
  return code.includes('EVEN');
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(code)) return true;
  return code.includes('ODD');
}

function isFinalAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_EVEN', 'FINAL_ODD'].includes(code)) return true;
  return code.includes('FINAL');
}

function canonicalizeReportSlotAlias(raw: unknown, fixedSemester?: Semester | null): string {
  const normalized = normalizeProgramCode(raw);
  if (!normalized || normalized === 'NONE') return '';
  if (isMidtermAliasCode(normalized)) return 'SBTS';
  if (isFinalEvenAliasCode(normalized)) return 'SAT';
  if (isFinalOddAliasCode(normalized)) return 'SAS';
  if (isFinalAliasCode(normalized)) {
    return fixedSemester === Semester.EVEN ? 'SAT' : 'SAS';
  }
  return normalized;
}

function resolveFinalSlotByFallback(params: {
  inferredSlot: string;
  fallbackSlot: string;
  fixedSemester?: Semester | null;
}): string {
  const normalizedInferred = canonicalizeReportSlotAlias(params.inferredSlot, params.fixedSemester);
  if (!normalizedInferred) return '';
  if (params.fixedSemester || !isFinalAliasCode(normalizedInferred)) return normalizedInferred;
  const normalizedFallback = canonicalizeReportSlotAlias(params.fallbackSlot, params.fixedSemester);
  if (normalizedFallback && isFinalAliasCode(normalizedFallback)) {
    return normalizedFallback;
  }
  return normalizedInferred;
}

function mapBaseTypeFromCode(rawCode: unknown): ExamType | null {
  const code = normalizeProgramCode(rawCode);
  if (!code) return null;
  if ((Object.values(ExamType) as string[]).includes(code)) return code as ExamType;
  if (isFormativeAliasCode(code)) return ExamType.FORMATIF;
  if (isMidtermAliasCode(code)) return ExamType.SBTS;
  if (isFinalEvenAliasCode(code)) return ExamType.SAT;
  if (isFinalOddAliasCode(code)) return ExamType.SAS;
  if (isFinalAliasCode(code)) return ExamType.SAS;
  if (code === 'US_PRACTICE' || code === 'US_PRAKTEK') return ExamType.US_PRACTICE;
  if (code === 'US_THEORY' || code === 'US_TEORI') return ExamType.US_THEORY;
  return null;
}

function normalizePredicate(raw: unknown): ExtracurricularPredicate {
  const rawString = String(raw || '').trim();
  const value = rawString
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  if (rawString.toUpperCase() === 'SB') return 'SB';
  if (rawString.toUpperCase() === 'B') return 'B';
  if (rawString.toUpperCase() === 'C') return 'C';
  if (rawString.toUpperCase() === 'K') return 'K';

  if (/\(SB\)/i.test(rawString) || /^SANGAT\s+BAIK/i.test(rawString)) return 'SB';
  if (/\(B\)/i.test(rawString) || /^BAIK/i.test(rawString)) return 'B';
  if (/\(C\)/i.test(rawString) || /^CUKUP/i.test(rawString)) return 'C';
  if (/\(K\)/i.test(rawString) || /^KURANG/i.test(rawString)) return 'K';

  if (value === 'SB' || value === 'A' || value === 'SANGAT_BAIK') return 'SB';
  if (value === 'B' || value === 'BAIK') return 'B';
  if (value === 'C' || value === 'CUKUP') return 'C';
  if (value === 'K' || value === 'D' || value === 'KURANG') return 'K';

  throw new ApiError(
    400,
    'Predikat nilai ekskul wajib salah satu dari: SB (Sangat Baik), B (Baik), C (Cukup), K (Kurang).',
  );
}

function normalizeComparableName(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function notifyHomeroomExtracurricularGradeUpdated(params: {
  enrollmentId: number;
  academicYearId: number;
  semester?: Semester;
  reportType?: string;
  programCode?: string;
}) {
  const enrollment = await prisma.ekstrakurikulerEnrollment.findUnique({
    where: { id: params.enrollmentId },
    select: {
      id: true,
      student: {
        select: {
          id: true,
          name: true,
          studentClass: {
            select: {
              id: true,
              name: true,
              teacherId: true,
            },
          },
        },
      },
      ekskul: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!enrollment?.student.studentClass?.teacherId) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const title = 'Nilai Ekstrakurikuler Diperbarui';
  const message = `Pembina memperbarui nilai ekstrakurikuler ${enrollment.student.name} pada ${enrollment.ekskul.name}.`;

  const existingToday = await prisma.notification.findFirst({
    where: {
      userId: enrollment.student.studentClass.teacherId,
      type: 'EXTRACURRICULAR_GRADE_UPDATED',
      title,
      message,
      createdAt: { gte: dayStart },
    },
    select: { id: true },
  });

  if (existingToday) return;

  await createInAppNotification({
    data: {
      userId: enrollment.student.studentClass.teacherId,
      title,
      message,
      type: 'EXTRACURRICULAR_GRADE_UPDATED',
      data: {
        module: 'EXTRACURRICULAR',
        enrollmentId: enrollment.id,
        studentId: enrollment.student.id,
        classId: enrollment.student.studentClass.id,
        className: enrollment.student.studentClass.name,
        ekskulId: enrollment.ekskul.id,
        ekskulName: enrollment.ekskul.name,
        academicYearId: params.academicYearId,
        semester: params.semester || null,
        reportType: params.reportType || null,
        programCode: params.programCode || null,
        route: '/teacher/wali-kelas/students',
      },
    },
  });
}

function getRoomMatchScore(ekskulName: string, roomName: string): number {
  if (!ekskulName || !roomName) return 0;
  if (ekskulName === roomName) return 100;
  if (roomName.includes(ekskulName) || ekskulName.includes(roomName)) return 80;

  const ekskulTokens = ekskulName.split(' ').filter((token) => token.length >= 3);
  const roomTokens = roomName.split(' ').filter((token) => token.length >= 3);
  if (!ekskulTokens.length || !roomTokens.length) return 0;

  const overlapCount = ekskulTokens.filter((token) => roomTokens.includes(token)).length;
  return overlapCount * 10;
}

const EXTRACURRICULAR_FIELDS_BY_SLOT: Record<'ODD' | 'EVEN', Record<string, ExtracurricularFieldPair>> = {
  ODD: {
    SBTS: { gradeField: 'gradeSbtsOdd', descriptionField: 'descSbtsOdd' },
    SAS: { gradeField: 'gradeSas', descriptionField: 'descSas' },
    SAT: { gradeField: 'gradeSat', descriptionField: 'descSat' },
  },
  EVEN: {
    SBTS: { gradeField: 'gradeSbtsEven', descriptionField: 'descSbtsEven' },
    SAS: { gradeField: 'gradeSas', descriptionField: 'descSas' },
    SAT: { gradeField: 'gradeSat', descriptionField: 'descSat' },
  },
};

function resolveExtracurricularFields(
  semester: Semester,
  reportSlotCode: string,
): ExtracurricularFieldPair | null {
  const normalizedSemester = semester === Semester.EVEN ? 'EVEN' : 'ODD';
  const normalizedSlot = canonicalizeReportSlotAlias(reportSlotCode, semester);
  if (!normalizedSlot) return null;
  return EXTRACURRICULAR_FIELDS_BY_SLOT[normalizedSemester][normalizedSlot] || null;
}

async function resolveReportSlotCode(params: {
  academicYearId: number;
  programCode?: string;
  reportType?: string;
  semester?: Semester;
}): Promise<string> {
  const normalizedProgramCode = normalizeProgramCode(params.programCode);
  const normalizedReportCode = normalizeProgramCode(params.reportType);
  if (!normalizedProgramCode && !normalizedReportCode) return '';

  const inferSlotFromContext = (context: {
    gradeComponentType?: unknown;
    gradeComponentTypeCode?: unknown;
    fixedSemester?: Semester | null;
    baseType?: unknown;
    baseTypeCode?: unknown;
  }): string => {
    const baseTypeCode =
      normalizeProgramCode(context.baseTypeCode) || normalizeProgramCode(context.baseType);
    if (baseTypeCode && baseTypeCode !== 'NONE') {
      if (isMidtermAliasCode(baseTypeCode)) return 'SBTS';
      if (isFinalEvenAliasCode(baseTypeCode)) return 'SAT';
      if (isFinalOddAliasCode(baseTypeCode)) return 'SAS';
      if (isFinalAliasCode(baseTypeCode)) {
        const resolvedSemester = context.fixedSemester || params.semester || null;
        return resolvedSemester === Semester.EVEN ? 'SAT' : 'SAS';
      }
      return baseTypeCode;
    }

    const componentType = normalizeProgramCode(
      context.gradeComponentTypeCode || context.gradeComponentType,
    );
    if (isMidtermAliasCode(componentType)) return 'SBTS';
    if (isFinalAliasCode(componentType)) {
      const fixedSemester = context.fixedSemester || params.semester || null;
      return fixedSemester === Semester.EVEN ? 'SAT' : 'SAS';
    }
    return '';
  };

  const programSelect = {
    gradeComponentCode: true,
    gradeComponentType: true,
    gradeComponentTypeCode: true,
    fixedSemester: true,
    baseType: true,
    baseTypeCode: true,
    displayOrder: true,
  } satisfies Prisma.ExamProgramConfigSelect;

  const programByCode = normalizedProgramCode
    ? await prisma.examProgramConfig.findFirst({
        where: {
          academicYearId: params.academicYearId,
          code: normalizedProgramCode,
          isActive: true,
        },
        select: programSelect,
      })
    : null;

  const mappedBaseType = mapBaseTypeFromCode(normalizedReportCode);
  const semesterScope = params.semester
    ? [{ fixedSemester: null }, { fixedSemester: params.semester }]
    : undefined;

  const programByAlias =
    !programByCode && normalizedReportCode
      ? await prisma.examProgramConfig.findFirst({
          where: {
            academicYearId: params.academicYearId,
            isActive: true,
            ...(semesterScope ? { OR: semesterScope } : {}),
            AND: [
              {
                OR: [
                  { code: normalizedReportCode },
                  { baseTypeCode: normalizedReportCode },
                  { gradeComponentTypeCode: normalizedReportCode },
                  ...(mappedBaseType ? [{ baseType: mappedBaseType }] : []),
                ],
              },
            ],
          },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
          select: programSelect,
        })
      : null;

  const program = programByCode || programByAlias;

  if (program) {
    const componentCode = normalizeProgramCode(program.gradeComponentCode);
    if (componentCode) {
      const component = await prisma.examGradeComponent.findFirst({
        where: {
          academicYearId: params.academicYearId,
          code: componentCode,
        },
        select: {
          reportSlot: true,
          reportSlotCode: true,
        },
      });

      const slotFromComponent =
        normalizeProgramCode(component?.reportSlotCode) || normalizeProgramCode(component?.reportSlot);
      if (slotFromComponent && slotFromComponent !== 'NONE') {
        return canonicalizeReportSlotAlias(slotFromComponent, program.fixedSemester || params.semester) || slotFromComponent;
      }
    }

    const inferredSlot = inferSlotFromContext(program);
    if (inferredSlot && inferredSlot !== 'NONE') {
      return resolveFinalSlotByFallback({
        inferredSlot,
        fallbackSlot: normalizedReportCode,
        fixedSemester: program.fixedSemester || params.semester,
      });
    }
  }

  const fallbackSlot = inferSlotFromContext({
    baseType: mappedBaseType || normalizedReportCode,
    baseTypeCode: normalizedReportCode,
  });

  return (
    canonicalizeReportSlotAlias(fallbackSlot, params.semester) ||
    canonicalizeReportSlotAlias(mappedBaseType || normalizedReportCode, params.semester) ||
    normalizeProgramCode(mappedBaseType || normalizedReportCode)
  );
}

export class TutorService {
  private async getTutorActorRole(tutorId: number) {
    const actor = await prisma.user.findUnique({
      where: { id: tutorId },
      select: { role: true },
    });
    return String(actor?.role || '').trim().toUpperCase();
  }

  /**
   * Get extracurricular assignments for a tutor
   */
  async getAssignments(tutorId: number, academicYearId?: number) {
    // If academicYearId is not provided, use the active one
    let targetAcademicYearId = academicYearId;
    if (!targetAcademicYearId) {
      const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
      });
      if (activeYear) {
        targetAcademicYearId = activeYear.id;
      }
    }

    if (!targetAcademicYearId) {
      return [];
    }

    const actorRole = await this.getTutorActorRole(tutorId);

    // Cast prisma to any because Typescript definitions might be out of sync
    // verified runtime existence via check_prisma_keys.ts
    const assignments = await (prisma as any).ekstrakurikulerTutorAssignment.findMany({
      where: {
        tutorId,
        academicYearId: targetAcademicYearId,
        isActive: true,
        ...(actorRole === 'EXTRACURRICULAR_TUTOR'
          ? {
              ekskul: {
                category: {
                  not: ExtracurricularCategory.OSIS,
                },
              },
            }
          : {}),
      },
      include: {
        ekskul: true,
        academicYear: true,
      },
    });

    return assignments;
  }

  private async ensureActiveAssignment(
    tutorId: number,
    ekskulId: number,
    academicYearId: number,
  ) {
    const assignment = await (prisma as any).ekstrakurikulerTutorAssignment.findUnique({
      where: {
        tutorId_ekskulId_academicYearId: {
          tutorId,
          ekskulId,
          academicYearId,
        },
      },
      include: {
        ekskul: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ApiError(403, 'Anda tidak memiliki akses ke ekstrakurikuler ini');
    }

    const actorRole = await this.getTutorActorRole(tutorId);
    if (
      actorRole === 'EXTRACURRICULAR_TUTOR' &&
      assignment.ekskul?.category === ExtracurricularCategory.OSIS
    ) {
      throw new ApiError(403, 'Akses OSIS hanya tersedia untuk guru dengan duty Pembina OSIS.');
    }

    return assignment;
  }

  private async resolveTemplateReportSlot(params: {
    academicYearId: number;
    semester: Semester;
    programCode?: string;
    reportType?: string;
  }) {
    const normalizedProgramCode = normalizeProgramCode(params.programCode);
    const normalizedReportCode = normalizeProgramCode(params.reportType);

    if (!normalizedProgramCode && !normalizedReportCode) {
      throw new ApiError(400, 'Program rapor wajib dipilih terlebih dahulu.');
    }

    const reportSlot = await resolveReportSlotCode({
      academicYearId: params.academicYearId,
      semester: params.semester,
      programCode: normalizedProgramCode,
      reportType: normalizedReportCode,
    });

    const normalizedSlot = canonicalizeReportSlotAlias(reportSlot, params.semester);
    if (!normalizedSlot) {
      throw new ApiError(400, 'Program rapor tidak valid untuk template nilai ekskul.');
    }

    return normalizedSlot;
  }

  /**
   * Get members (students) of an extracurricular
   */
  async getMembers(tutorId: number, ekskulId: number, academicYearId: number) {
    await this.ensureActiveAssignment(tutorId, ekskulId, academicYearId);

    // Fetch enrollments
    const enrollments = await prisma.ekstrakurikulerEnrollment.findMany({
      where: {
        ekskulId,
        academicYearId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        student: {
          name: 'asc',
        },
      },
    });

    return enrollments;
  }

  async getAttendanceOverview(
    tutorId: number,
    params: {
      ekskulId: number;
      academicYearId: number;
      weekKey?: string;
    },
  ) {
    const assignment = await this.ensureActiveAssignment(tutorId, params.ekskulId, params.academicYearId);
    const normalizedWeekKey = sanitizeWeekKey(params.weekKey || getCurrentWeekKey());

    const [config, week] = await Promise.all([
      (prisma as any).ekstrakurikulerAttendanceConfig.findUnique({
        where: { tutorAssignmentId: assignment.id },
      }),
      (prisma as any).ekstrakurikulerAttendanceWeek.findUnique({
        where: {
          tutorAssignmentId_weekKey: {
            tutorAssignmentId: assignment.id,
            weekKey: normalizedWeekKey,
          },
        },
        include: {
          entries: true,
        },
      }),
    ]);

    return {
      assignmentId: assignment.id,
      ekskulId: params.ekskulId,
      academicYearId: params.academicYearId,
      weekKey: normalizedWeekKey,
      sessionsPerWeek: Math.max(1, Number(config?.sessionsPerWeek || 1)),
      records: Array.isArray(week?.entries)
        ? week.entries.map((entry: any) => ({
            enrollmentId: entry.enrollmentId,
            sessionIndex: entry.sessionIndex,
            status: entry.status,
            note: entry.note || '',
          }))
        : [],
    };
  }

  async saveAttendanceConfig(
    tutorId: number,
    params: {
      ekskulId: number;
      academicYearId: number;
      sessionsPerWeek: number;
    },
  ) {
    const assignment = await this.ensureActiveAssignment(tutorId, params.ekskulId, params.academicYearId);
    const sessionsPerWeek = Math.max(1, Math.min(14, Number(params.sessionsPerWeek || 1)));

    const config = await (prisma as any).ekstrakurikulerAttendanceConfig.upsert({
      where: { tutorAssignmentId: assignment.id },
      update: { sessionsPerWeek },
      create: {
        tutorAssignmentId: assignment.id,
        sessionsPerWeek,
      },
    });

    return {
      assignmentId: assignment.id,
      sessionsPerWeek: Number(config.sessionsPerWeek || sessionsPerWeek),
    };
  }

  async saveAttendanceRecords(
    tutorId: number,
    params: {
      ekskulId: number;
      academicYearId: number;
      weekKey: string;
      records: Array<{
        enrollmentId: number;
        sessionIndex: number;
        status: string;
        note?: string;
      }>;
    },
  ) {
    const assignment = await this.ensureActiveAssignment(tutorId, params.ekskulId, params.academicYearId);
    const normalizedWeekKey = sanitizeWeekKey(params.weekKey);
    const config = await (prisma as any).ekstrakurikulerAttendanceConfig.findUnique({
      where: { tutorAssignmentId: assignment.id },
    });
    const sessionsPerWeek = Math.max(1, Number(config?.sessionsPerWeek || 1));
    const validEnrollmentIds = new Set(
      (
        await prisma.ekstrakurikulerEnrollment.findMany({
          where: {
            ekskulId: params.ekskulId,
            academicYearId: params.academicYearId,
          },
          select: { id: true },
        })
      ).map((row) => row.id),
    );

    const sanitizedRecords = params.records
      .filter((record) => validEnrollmentIds.has(Number(record.enrollmentId)))
      .map((record) => ({
        enrollmentId: Number(record.enrollmentId),
        sessionIndex: Math.max(1, Math.min(sessionsPerWeek, Number(record.sessionIndex || 1))),
        status: normalizeAttendanceStatus(record.status),
        note: String(record.note || '').trim() || null,
      }))
      .filter((record) => record.status);

    const result = await prisma.$transaction(async (tx) => {
      const week = await (tx as any).ekstrakurikulerAttendanceWeek.upsert({
        where: {
          tutorAssignmentId_weekKey: {
            tutorAssignmentId: assignment.id,
            weekKey: normalizedWeekKey,
          },
        },
        update: {},
        create: {
          tutorAssignmentId: assignment.id,
          weekKey: normalizedWeekKey,
        },
      });

      await (tx as any).ekstrakurikulerAttendanceEntry.deleteMany({
        where: { weekId: week.id },
      });

      if (sanitizedRecords.length > 0) {
        await (tx as any).ekstrakurikulerAttendanceEntry.createMany({
          data: sanitizedRecords.map((record) => ({
            weekId: week.id,
            enrollmentId: record.enrollmentId,
            sessionIndex: record.sessionIndex,
            status: record.status,
            note: record.note,
          })),
        });
      }

      return week;
    });

    return {
      assignmentId: assignment.id,
      weekId: result.id,
      weekKey: normalizedWeekKey,
      savedRecords: sanitizedRecords.length,
    };
  }

  async getGradeTemplates(
    tutorId: number,
    params: {
      ekskulId: number;
      academicYearId: number;
      semester: Semester;
      reportType?: string;
      programCode?: string;
    },
  ) {
    await this.ensureActiveAssignment(tutorId, params.ekskulId, params.academicYearId);
    const reportSlot = await this.resolveTemplateReportSlot({
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportType: params.reportType,
      programCode: params.programCode,
    });

    const rows = await (prisma as any).ekstrakurikulerGradeTemplate.findMany({
      where: {
        ekskulId: params.ekskulId,
        academicYearId: params.academicYearId,
        semester: params.semester,
        reportSlot,
      },
      orderBy: [{ predicate: 'asc' }],
    });

    const templates = EXTRACURRICULAR_PREDICATES.reduce<
      Record<ExtracurricularPredicate, { label: string; description: string }>
    >(
      (acc, predicate) => {
        const found = rows.find((row: any) => normalizePredicate(row.predicate) === predicate);
        acc[predicate] = {
          label: String(found?.predicate || DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS[predicate]),
          description: String(found?.description || ''),
        };
        return acc;
      },
      {
        SB: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.SB,
          description: '',
        },
        B: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.B,
          description: '',
        },
        C: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.C,
          description: '',
        },
        K: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.K,
          description: '',
        },
      },
    );

    return {
      ekskulId: params.ekskulId,
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportSlot,
      templates,
    };
  }

  async saveGradeTemplates(
    tutorId: number,
    params: {
      ekskulId: number;
      academicYearId: number;
      semester: Semester;
      reportType?: string;
      programCode?: string;
      templates: Partial<
        Record<ExtracurricularPredicate, { label?: string; description?: string }>
      >;
    },
  ) {
    await this.ensureActiveAssignment(tutorId, params.ekskulId, params.academicYearId);
    const reportSlot = await this.resolveTemplateReportSlot({
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportType: params.reportType,
      programCode: params.programCode,
    });

    const rows = EXTRACURRICULAR_PREDICATES.map((predicate) => {
      const template = params.templates?.[predicate] || {};
      const label = String(template.label || '').trim() || DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS[predicate];
      const description = String(template.description || '').trim();
      return {
        ekskulId: params.ekskulId,
        academicYearId: params.academicYearId,
        semester: params.semester,
        reportSlot,
        predicate: label,
        description,
      };
    });

    await prisma.$transaction(async (tx) => {
      await (tx as any).ekstrakurikulerGradeTemplate.deleteMany({
        where: {
          ekskulId: params.ekskulId,
          academicYearId: params.academicYearId,
          semester: params.semester,
          reportSlot,
        },
      });

      const toInsert = rows.filter(
        (row) =>
          row.description.length > 0 ||
          row.predicate !== DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS[normalizePredicate(row.predicate)],
      );
      if (toInsert.length > 0) {
        await (tx as any).ekstrakurikulerGradeTemplate.createMany({
          data: toInsert,
        });
      }
    });

    return {
      ekskulId: params.ekskulId,
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportSlot,
      templates: rows.reduce<
        Record<ExtracurricularPredicate, { label: string; description: string }>
      >((acc, row) => {
        const code = normalizePredicate(row.predicate);
        acc[code] = {
          label: row.predicate,
          description: row.description,
        };
        return acc;
      }, {
        SB: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.SB,
          description: '',
        },
        B: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.B,
          description: '',
        },
        C: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.C,
          description: '',
        },
        K: {
          label: DEFAULT_EXTRACURRICULAR_PREDICATE_LABELS.K,
          description: '',
        },
      }),
    };
  }

  async getInventoryOverview(tutorId: number, academicYearId?: number) {
    const assignments = await this.getAssignments(tutorId, academicYearId);

    if (!assignments.length) {
      return [];
    }

    const rooms = await prisma.room.findMany({
      include: {
        category: {
          select: {
            id: true,
            name: true,
            inventoryTemplateKey: true,
          },
        },
        items: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    const usedRoomIds = new Set<number>();

    const mapped = assignments.map((assignment: any) => {
      const ekskulName = normalizeComparableName(assignment?.ekskul?.name);
      const candidates = rooms
        .map((room) => {
          const categoryName = normalizeComparableName(room.category?.name);
          const templateKey = normalizeComparableName(room.category?.inventoryTemplateKey);
          const isExtracurricularCategory =
            categoryName.includes('ekskul') ||
            categoryName.includes('ekstra') ||
            templateKey.includes('ekskul') ||
            templateKey.includes('extracurricular');
          const nameScore = getRoomMatchScore(ekskulName, normalizeComparableName(room.name));
          const score = nameScore + (isExtracurricularCategory ? 15 : 0);
          return { room, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score;
          return a.room.name.localeCompare(b.room.name);
        });

      let selected = candidates.find((candidate) => !usedRoomIds.has(candidate.room.id));
      if (!selected) selected = candidates[0];

      if (selected?.room?.id) {
        usedRoomIds.add(selected.room.id);
      }

      return {
        assignmentId: assignment.id,
        ekskulId: assignment.ekskulId,
        ekskulName: assignment?.ekskul?.name || '-',
        ekskulCategory: assignment?.ekskul?.category || 'EXTRACURRICULAR',
        academicYearId: assignment.academicYearId,
        academicYearName: assignment?.academicYear?.name || '-',
        room: selected
          ? {
              id: selected.room.id,
              name: selected.room.name,
              location: selected.room.location || null,
              categoryName: selected.room.category?.name || null,
              inventoryTemplateKey: selected.room.category?.inventoryTemplateKey || null,
            }
          : null,
        items: selected?.room?.items || [],
      };
    });

    return mapped;
  }

  async createInventoryItem(
    tutorId: number,
    payload: {
      assignmentId: number;
      name: string;
      code?: string;
      brand?: string;
      source?: string;
      description?: string;
      goodQty?: number;
      minorDamageQty?: number;
      majorDamageQty?: number;
    },
  ) {
    const assignment = await (prisma as any).ekstrakurikulerTutorAssignment.findFirst({
      where: {
        id: payload.assignmentId,
        tutorId,
        isActive: true,
      },
      include: {
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new ApiError(403, 'Anda tidak memiliki akses untuk menambah inventaris pada ekskul ini.');
    }

    const overview = await this.getInventoryOverview(tutorId, assignment.academicYearId);
    const target = overview.find(
      (row: any) => Number(row.assignmentId) === Number(payload.assignmentId),
    );

    if (!target?.room?.id) {
      throw new ApiError(
        400,
        'Ruang inventaris ekskul belum ditautkan oleh Sarpras. Silakan hubungi Wakasek Sarpras.',
      );
    }

    const name = String(payload.name || '').trim();
    if (!name) {
      throw new ApiError(400, 'Nama barang wajib diisi.');
    }

    const goodQty = Math.max(0, Number(payload.goodQty || 0));
    const minorDamageQty = Math.max(0, Number(payload.minorDamageQty || 0));
    const majorDamageQty = Math.max(0, Number(payload.majorDamageQty || 0));
    const quantity = goodQty + minorDamageQty + majorDamageQty;

    const item = await prisma.inventoryItem.create({
      data: {
        roomId: target.room.id,
        name,
        code: String(payload.code || '').trim() || null,
        brand: String(payload.brand || '').trim() || null,
        source: String(payload.source || '').trim() || null,
        description: String(payload.description || '').trim() || null,
        goodQty,
        minorDamageQty,
        majorDamageQty,
        quantity,
      },
    });

    return {
      ...item,
      room: target.room,
      assignmentId: target.assignmentId,
      ekskulId: target.ekskulId,
      ekskulName: target.ekskulName,
      academicYearId: target.academicYearId,
      academicYearName: target.academicYearName,
    };
  }

  /**
   * Update grade for a student in an extracurricular
   */
  async updateGrade(
    tutorId: number, 
    enrollmentId: number, 
    data: { 
      grade: string; 
      description: string;
      semester?: Semester;
      reportType?: string;
      programCode?: string;
    }
  ) {
    // Verify ownership
    const enrollment = await prisma.ekstrakurikulerEnrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      throw new ApiError(404, 'Data anggota tidak ditemukan');
    }

    await this.ensureActiveAssignment(tutorId, enrollment.ekskulId, enrollment.academicYearId);

    let updateData: any = {};
    const { semester, reportType, programCode, grade, description } = data;
    const normalizedGrade = normalizePredicate(grade);
    const normalizedDescription = String(description || '').trim();
    const normalizedReportCode = normalizeProgramCode(reportType);
    const normalizedProgramCode = normalizeProgramCode(programCode);

    if (semester && (normalizedProgramCode || normalizedReportCode)) {
      const resolvedReportSlotCode = await resolveReportSlotCode({
        academicYearId: enrollment.academicYearId,
        programCode: normalizedProgramCode,
        reportType: normalizedReportCode,
        semester,
      });
      const fields = resolveExtracurricularFields(semester, resolvedReportSlotCode);
      if (!fields) {
        throw new ApiError(400, 'Program rapor tidak sesuai dengan semester aktif.');
      }
      updateData = {
        grade: normalizedGrade,
        description: normalizedDescription,
        [fields.gradeField]: normalizedGrade,
        [fields.descriptionField]: normalizedDescription,
      };
    } else if (semester && !normalizedProgramCode && !normalizedReportCode) {
      throw new ApiError(400, 'Program rapor wajib dipilih sebelum menyimpan nilai.');
    } else {
      // Fallback legacy
      updateData = { grade: normalizedGrade, description: normalizedDescription };
    }

    const updated = await prisma.ekstrakurikulerEnrollment.update({
      where: { id: enrollmentId },
      data: updateData,
    });

    await notifyHomeroomExtracurricularGradeUpdated({
      enrollmentId,
      academicYearId: enrollment.academicYearId,
      semester,
      reportType: normalizedReportCode,
      programCode: normalizedProgramCode,
    });

    return updated;
  }
}

export const tutorService = new TutorService();
