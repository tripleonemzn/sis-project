import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';
import { Semester, Prisma, ExamType } from '@prisma/client';

type ExtracurricularFieldPair = {
  gradeField: 'gradeSbtsOdd' | 'gradeSas' | 'gradeSat' | 'gradeSbtsEven';
  descriptionField: 'descSbtsOdd' | 'descSas' | 'descSat' | 'descSbtsEven';
};

const EXTRACURRICULAR_PREDICATES = ['SB', 'B', 'C', 'K'] as const;
type ExtracurricularPredicate = (typeof EXTRACURRICULAR_PREDICATES)[number];

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
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

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

    // Cast prisma to any because Typescript definitions might be out of sync
    // verified runtime existence via check_prisma_keys.ts
    const assignments = await (prisma as any).ekstrakurikulerTutorAssignment.findMany({
      where: {
        tutorId,
        academicYearId: targetAcademicYearId,
        isActive: true,
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
          },
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ApiError(403, 'Anda tidak memiliki akses ke ekstrakurikuler ini');
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

    const templates = EXTRACURRICULAR_PREDICATES.reduce<Record<ExtracurricularPredicate, string>>(
      (acc, predicate) => {
        const found = rows.find((row: any) => normalizePredicate(row.predicate) === predicate);
        acc[predicate] = String(found?.description || '');
        return acc;
      },
      { SB: '', B: '', C: '', K: '' },
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
      templates: Partial<Record<ExtracurricularPredicate, string>>;
    },
  ) {
    await this.ensureActiveAssignment(tutorId, params.ekskulId, params.academicYearId);
    const reportSlot = await this.resolveTemplateReportSlot({
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportType: params.reportType,
      programCode: params.programCode,
    });

    const rows = EXTRACURRICULAR_PREDICATES.map((predicate) => ({
      ekskulId: params.ekskulId,
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportSlot,
      predicate,
      description: String(params.templates?.[predicate] || '').trim(),
    }));

    await prisma.$transaction(async (tx) => {
      await (tx as any).ekstrakurikulerGradeTemplate.deleteMany({
        where: {
          ekskulId: params.ekskulId,
          academicYearId: params.academicYearId,
          semester: params.semester,
          reportSlot,
        },
      });

      const toInsert = rows.filter((row) => row.description.length > 0);
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
      templates: rows.reduce<Record<ExtracurricularPredicate, string>>((acc, row) => {
        acc[row.predicate] = row.description;
        return acc;
      }, { SB: '', B: '', C: '', K: '' }),
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

    return prisma.ekstrakurikulerEnrollment.update({
      where: { id: enrollmentId },
      data: updateData,
    });
  }
}

export const tutorService = new TutorService();
