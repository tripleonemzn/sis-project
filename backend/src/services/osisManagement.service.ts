import {
  ExamType,
  OsisJoinRequestStatus,
  OsisManagementStatus,
  Prisma,
  Semester,
} from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';

const OSIS_PREDICATES = ['SB', 'B', 'C', 'K'] as const;
type OsisPredicate = (typeof OSIS_PREDICATES)[number];

const DEFAULT_OSIS_PREDICATE_LABELS: Record<OsisPredicate, string> = {
  SB: 'Sangat Baik (SB)',
  B: 'Baik (B)',
  C: 'Cukup (C)',
  K: 'Kurang (K)',
};

const managementPeriodInclude = Prisma.validator<Prisma.OsisManagementPeriodInclude>()({
  academicYear: { select: { id: true, name: true, isActive: true } },
  createdBy: { select: { id: true, name: true, username: true } },
  _count: {
    select: {
      divisions: true,
      positions: true,
      memberships: true,
    },
  },
});

const membershipInclude = Prisma.validator<Prisma.OsisMembershipInclude>()({
  student: {
    select: {
      id: true,
      name: true,
      nis: true,
      nisn: true,
      studentClass: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  division: {
    select: {
      id: true,
      name: true,
      code: true,
      displayOrder: true,
    },
  },
  position: {
    select: {
      id: true,
      name: true,
      code: true,
      displayOrder: true,
      divisionId: true,
      division: {
        select: {
          id: true,
          name: true,
          code: true,
          displayOrder: true,
        },
      },
    },
  },
  period: {
    select: {
      id: true,
      title: true,
      academicYearId: true,
      status: true,
      academicYear: {
        select: { id: true, name: true, isActive: true },
      },
    },
  },
  assessments: {
    orderBy: [{ gradedAt: 'desc' }, { id: 'desc' }],
    include: {
      gradedBy: { select: { id: true, name: true, username: true } },
    },
  },
});

const osisJoinRequestInclude = Prisma.validator<Prisma.OsisJoinRequestInclude>()({
  academicYear: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },
  ekskul: {
    select: {
      id: true,
      name: true,
      category: true,
    },
  },
  student: {
    select: {
      id: true,
      name: true,
      nis: true,
      nisn: true,
      studentClass: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  processedBy: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  membership: {
    include: membershipInclude,
  },
});

const normalizeProgramCode = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeComparableName = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeStructureCode = (rawCode: unknown, rawName: unknown): string => {
  const base = String(rawCode || rawName || '').trim();
  const normalized = base
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    throw new ApiError(400, 'Kode wajib diisi atau dapat diturunkan dari nama yang valid.');
  }

  return normalized;
};

const normalizeNullableText = (raw: unknown): string | null => {
  const value = String(raw || '').trim();
  return value.length > 0 ? value : null;
};

const isFormativeAliasCode = (raw: unknown): boolean => {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  return code === 'FORMATIF' || code === 'FORMATIVE' || code.startsWith('NF');
};

const isMidtermAliasCode = (raw: unknown): boolean => {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(code)) return true;
  return code.includes('MIDTERM');
};

const isFinalEvenAliasCode = (raw: unknown): boolean => {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(code)) return true;
  return code.includes('EVEN');
};

const isFinalOddAliasCode = (raw: unknown): boolean => {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(code)) return true;
  return code.includes('ODD');
};

const isFinalAliasCode = (raw: unknown): boolean => {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_EVEN', 'FINAL_ODD'].includes(code)) {
    return true;
  }
  return code.includes('FINAL');
};

const canonicalizeReportSlotAlias = (raw: unknown, fixedSemester?: Semester | null): string => {
  const normalized = normalizeProgramCode(raw);
  if (!normalized || normalized === 'NONE') return '';
  if (isMidtermAliasCode(normalized)) return 'SBTS';
  if (isFinalEvenAliasCode(normalized)) return 'SAT';
  if (isFinalOddAliasCode(normalized)) return 'SAS';
  if (isFinalAliasCode(normalized)) {
    return fixedSemester === Semester.EVEN ? 'SAT' : 'SAS';
  }
  return normalized;
};

const resolveFinalSlotByFallback = (params: {
  inferredSlot: string;
  fallbackSlot: string;
  fixedSemester?: Semester | null;
}): string => {
  const normalizedInferred = canonicalizeReportSlotAlias(params.inferredSlot, params.fixedSemester);
  if (!normalizedInferred) return '';
  if (params.fixedSemester || !isFinalAliasCode(normalizedInferred)) return normalizedInferred;
  const normalizedFallback = canonicalizeReportSlotAlias(params.fallbackSlot, params.fixedSemester);
  if (normalizedFallback && isFinalAliasCode(normalizedFallback)) {
    return normalizedFallback;
  }
  return normalizedInferred;
};

const mapBaseTypeFromCode = (rawCode: unknown): ExamType | null => {
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
};

const normalizePredicate = (raw: unknown): OsisPredicate => {
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
    'Predikat nilai OSIS wajib salah satu dari: SB (Sangat Baik), B (Baik), C (Cukup), K (Kurang).',
  );
};

const buildTemplatePayload = (
  rows: Array<{ predicate: string; description: string }>,
): Record<OsisPredicate, { label: string; description: string }> =>
  OSIS_PREDICATES.reduce<Record<OsisPredicate, { label: string; description: string }>>(
    (acc, predicate) => {
      const found = rows.find((row) => normalizePredicate(row.predicate) === predicate);
      acc[predicate] = {
        label: String(found?.predicate || DEFAULT_OSIS_PREDICATE_LABELS[predicate]),
        description: String(found?.description || ''),
      };
      return acc;
    },
    {
      SB: { label: DEFAULT_OSIS_PREDICATE_LABELS.SB, description: '' },
      B: { label: DEFAULT_OSIS_PREDICATE_LABELS.B, description: '' },
      C: { label: DEFAULT_OSIS_PREDICATE_LABELS.C, description: '' },
      K: { label: DEFAULT_OSIS_PREDICATE_LABELS.K, description: '' },
    },
  );

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
        return (
          canonicalizeReportSlotAlias(slotFromComponent, program.fixedSemester || params.semester) ||
          slotFromComponent
        );
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

const resolveTemplateReportSlot = async (params: {
  academicYearId: number;
  semester: Semester;
  programCode?: string;
  reportType?: string;
}) => {
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
    throw new ApiError(400, 'Program rapor tidak valid untuk nilai OSIS.');
  }

  return normalizedSlot;
};

const assertValidDateRange = (startAt: Date, endAt: Date) => {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new ApiError(400, 'Tanggal periode OSIS tidak valid.');
  }
  if (endAt <= startAt) {
    throw new ApiError(400, 'Tanggal selesai harus setelah tanggal mulai.');
  }
};

const sortMemberships = <
  T extends {
    position?: { displayOrder?: number | null; name?: string | null } | null;
    division?: { displayOrder?: number | null; name?: string | null } | null;
    student?: { name?: string | null } | null;
  },
>(
  rows: T[],
) =>
  [...rows].sort((a, b) => {
    const positionOrderA = Number(a.position?.displayOrder || 0);
    const positionOrderB = Number(b.position?.displayOrder || 0);
    if (positionOrderA !== positionOrderB) return positionOrderA - positionOrderB;

    const divisionOrderA = Number(a.division?.displayOrder || 0);
    const divisionOrderB = Number(b.division?.displayOrder || 0);
    if (divisionOrderA !== divisionOrderB) return divisionOrderA - divisionOrderB;

    const positionNameCompare = String(a.position?.name || '').localeCompare(String(b.position?.name || ''));
    if (positionNameCompare !== 0) return positionNameCompare;

    const divisionNameCompare = String(a.division?.name || '').localeCompare(String(b.division?.name || ''));
    if (divisionNameCompare !== 0) return divisionNameCompare;

    return String(a.student?.name || '').localeCompare(String(b.student?.name || ''));
  });

async function notifyHomeroomOsisGradeUpdated(params: {
  membershipId: number;
  academicYearId: number;
  semester?: Semester;
  reportType?: string;
  programCode?: string;
}) {
  const membership = await prisma.osisMembership.findUnique({
    where: { id: params.membershipId },
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
      position: {
        select: {
          id: true,
          name: true,
        },
      },
      period: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  if (!membership?.student.studentClass?.teacherId) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const title = 'Nilai OSIS Diperbarui';
  const message = `Pembina memperbarui nilai OSIS ${membership.student.name} sebagai ${membership.position.name}.`;

  const existingToday = await prisma.notification.findFirst({
    where: {
      userId: membership.student.studentClass.teacherId,
      type: 'OSIS_GRADE_UPDATED',
      title,
      message,
      createdAt: { gte: dayStart },
    },
    select: { id: true },
  });

  if (existingToday) return;

  await prisma.notification.create({
    data: {
      userId: membership.student.studentClass.teacherId,
      title,
      message,
      type: 'OSIS_GRADE_UPDATED',
      data: {
        module: 'OSIS',
        membershipId: membership.id,
        studentId: membership.student.id,
        classId: membership.student.studentClass.id,
        className: membership.student.studentClass.name,
        positionId: membership.position.id,
        positionName: membership.position.name,
        periodId: membership.period.id,
        periodTitle: membership.period.title,
        academicYearId: params.academicYearId,
        semester: params.semester || null,
        reportType: params.reportType || null,
        programCode: params.programCode || null,
        route: '/teacher/wali-kelas/students',
      },
    },
  });
}

export class OsisManagementService {
  private async resolveAcademicYearId(academicYearId?: number | null) {
    if (academicYearId) return Number(academicYearId);

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });

    return activeYear?.id || null;
  }

  private async ensureStudentActiveInAcademicYear(studentId: number, academicYearId: number) {
    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: 'STUDENT',
        studentStatus: 'ACTIVE',
        studentClass: {
          academicYearId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!student) {
      throw new ApiError(400, 'Siswa harus aktif pada tahun ajaran yang sama.');
    }

    return student;
  }

  private async ensureSingleActivePeriod(params: {
    academicYearId: number;
    status: OsisManagementStatus;
    excludeId?: number;
  }) {
    if (params.status !== OsisManagementStatus.ACTIVE) return;

    const existing = await prisma.osisManagementPeriod.findFirst({
      where: {
        academicYearId: params.academicYearId,
        status: OsisManagementStatus.ACTIVE,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: { id: true, title: true },
    });

    if (existing) {
      throw new ApiError(
        400,
        `Sudah ada periode kepengurusan OSIS aktif pada tahun ajaran ini: ${existing.title}.`,
      );
    }
  }

  private async ensurePeriodExists(periodId: number) {
    const period = await prisma.osisManagementPeriod.findUnique({
      where: { id: periodId },
      include: managementPeriodInclude,
    });

    if (!period) {
      throw new ApiError(404, 'Periode kepengurusan OSIS tidak ditemukan.');
    }

    return period;
  }

  private async ensureDivisionBelongsToPeriod(divisionId: number, periodId: number) {
    const division = await prisma.osisDivision.findUnique({
      where: { id: divisionId },
      select: {
        id: true,
        periodId: true,
        name: true,
        code: true,
        displayOrder: true,
      },
    });

    if (!division || Number(division.periodId) !== Number(periodId)) {
      throw new ApiError(400, 'Divisi OSIS tidak sesuai dengan periode yang dipilih.');
    }

    return division;
  }

  private async ensurePositionBelongsToPeriod(positionId: number, periodId: number) {
    const position = await prisma.osisPosition.findUnique({
      where: { id: positionId },
      select: {
        id: true,
        periodId: true,
        divisionId: true,
        name: true,
        code: true,
        displayOrder: true,
      },
    });

    if (!position || Number(position.periodId) !== Number(periodId)) {
      throw new ApiError(400, 'Jabatan OSIS tidak sesuai dengan periode yang dipilih.');
    }

    return position;
  }

  async listManagementPeriods(academicYearId?: number) {
    let targetAcademicYearId = academicYearId;

    if (!targetAcademicYearId) {
      const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      targetAcademicYearId = activeYear?.id;
    }

    return prisma.osisManagementPeriod.findMany({
      where: targetAcademicYearId ? { academicYearId: targetAcademicYearId } : undefined,
      orderBy: [{ academicYear: { name: 'desc' } }, { startAt: 'desc' }, { id: 'desc' }],
      include: managementPeriodInclude,
    });
  }

  async createManagementPeriod(
    actorId: number,
    payload: {
      academicYearId: number;
      title: string;
      description?: string | null;
      startAt: Date;
      endAt: Date;
      status?: OsisManagementStatus;
    },
  ) {
    const startAt = new Date(payload.startAt);
    const endAt = new Date(payload.endAt);
    assertValidDateRange(startAt, endAt);

    const status = payload.status || OsisManagementStatus.DRAFT;
    await this.ensureSingleActivePeriod({
      academicYearId: payload.academicYearId,
      status,
    });

    return prisma.osisManagementPeriod.create({
      data: {
        academicYearId: payload.academicYearId,
        title: String(payload.title || '').trim(),
        description: normalizeNullableText(payload.description),
        startAt,
        endAt,
        status,
        createdById: actorId,
      },
      include: managementPeriodInclude,
    });
  }

  async updateManagementPeriod(
    id: number,
    payload: Partial<{
      academicYearId: number;
      title: string;
      description: string | null;
      startAt: Date;
      endAt: Date;
      status: OsisManagementStatus;
    }>,
  ) {
    const existing = await this.ensurePeriodExists(id);
    const academicYearId = payload.academicYearId ?? existing.academicYearId;
    const startAt = payload.startAt ? new Date(payload.startAt) : existing.startAt;
    const endAt = payload.endAt ? new Date(payload.endAt) : existing.endAt;
    assertValidDateRange(startAt, endAt);

    const status = payload.status ?? existing.status;
    await this.ensureSingleActivePeriod({
      academicYearId,
      status,
      excludeId: id,
    });

    return prisma.osisManagementPeriod.update({
      where: { id },
      data: {
        academicYearId,
        title: payload.title !== undefined ? String(payload.title || '').trim() : existing.title,
        description:
          payload.description !== undefined
            ? normalizeNullableText(payload.description)
            : existing.description,
        startAt,
        endAt,
        status,
      },
      include: managementPeriodInclude,
    });
  }

  async listDivisions(periodId: number) {
    await this.ensurePeriodExists(periodId);
    return prisma.osisDivision.findMany({
      where: { periodId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            positions: true,
            memberships: true,
          },
        },
      },
    });
  }

  async createDivision(payload: {
    periodId: number;
    name: string;
    code?: string;
    description?: string | null;
    displayOrder?: number;
  }) {
    await this.ensurePeriodExists(payload.periodId);

    return prisma.osisDivision.create({
      data: {
        periodId: payload.periodId,
        name: String(payload.name || '').trim(),
        code: normalizeStructureCode(payload.code, payload.name),
        description: normalizeNullableText(payload.description),
        displayOrder: Number(payload.displayOrder || 0),
      },
      include: {
        _count: {
          select: {
            positions: true,
            memberships: true,
          },
        },
      },
    });
  }

  async updateDivision(
    id: number,
    payload: Partial<{
      name: string;
      code: string;
      description: string | null;
      displayOrder: number;
    }>,
  ) {
    const existing = await prisma.osisDivision.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, 'Divisi OSIS tidak ditemukan.');
    }

    return prisma.osisDivision.update({
      where: { id },
      data: {
        name: payload.name !== undefined ? String(payload.name || '').trim() : existing.name,
        code:
          payload.code !== undefined || payload.name !== undefined
            ? normalizeStructureCode(payload.code ?? existing.code, payload.name ?? existing.name)
            : existing.code,
        description:
          payload.description !== undefined
            ? normalizeNullableText(payload.description)
            : existing.description,
        displayOrder:
          payload.displayOrder !== undefined ? Number(payload.displayOrder || 0) : existing.displayOrder,
      },
      include: {
        _count: {
          select: {
            positions: true,
            memberships: true,
          },
        },
      },
    });
  }

  async deleteDivision(id: number) {
    const existing = await prisma.osisDivision.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            positions: true,
            memberships: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, 'Divisi OSIS tidak ditemukan.');
    }

    if (existing._count.positions > 0 || existing._count.memberships > 0) {
      throw new ApiError(400, 'Divisi tidak dapat dihapus karena masih dipakai jabatan atau anggota.');
    }

    await prisma.osisDivision.delete({ where: { id } });
    return existing;
  }

  async listPositions(periodId: number) {
    await this.ensurePeriodExists(periodId);
    return prisma.osisPosition.findMany({
      where: { periodId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        division: {
          select: {
            id: true,
            name: true,
            code: true,
            displayOrder: true,
          },
        },
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });
  }

  async createPosition(payload: {
    periodId: number;
    divisionId?: number | null;
    name: string;
    code?: string;
    description?: string | null;
    displayOrder?: number;
  }) {
    await this.ensurePeriodExists(payload.periodId);
    if (payload.divisionId) {
      await this.ensureDivisionBelongsToPeriod(payload.divisionId, payload.periodId);
    }

    return prisma.osisPosition.create({
      data: {
        periodId: payload.periodId,
        divisionId: payload.divisionId || null,
        name: String(payload.name || '').trim(),
        code: normalizeStructureCode(payload.code, payload.name),
        description: normalizeNullableText(payload.description),
        displayOrder: Number(payload.displayOrder || 0),
      },
      include: {
        division: {
          select: {
            id: true,
            name: true,
            code: true,
            displayOrder: true,
          },
        },
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });
  }

  async updatePosition(
    id: number,
    payload: Partial<{
      divisionId: number | null;
      name: string;
      code: string;
      description: string | null;
      displayOrder: number;
    }>,
  ) {
    const existing = await prisma.osisPosition.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, 'Jabatan OSIS tidak ditemukan.');
    }

    const nextDivisionId = payload.divisionId === undefined ? existing.divisionId : payload.divisionId;
    if (nextDivisionId) {
      await this.ensureDivisionBelongsToPeriod(nextDivisionId, existing.periodId);
    }

    if (
      existing._count.memberships > 0 &&
      payload.divisionId !== undefined &&
      Number(nextDivisionId || 0) !== Number(existing.divisionId || 0)
    ) {
      throw new ApiError(400, 'Jabatan yang sudah dipakai anggota tidak dapat dipindah ke divisi lain.');
    }

    return prisma.osisPosition.update({
      where: { id },
      data: {
        divisionId: nextDivisionId || null,
        name: payload.name !== undefined ? String(payload.name || '').trim() : existing.name,
        code:
          payload.code !== undefined || payload.name !== undefined
            ? normalizeStructureCode(payload.code ?? existing.code, payload.name ?? existing.name)
            : existing.code,
        description:
          payload.description !== undefined
            ? normalizeNullableText(payload.description)
            : existing.description,
        displayOrder:
          payload.displayOrder !== undefined ? Number(payload.displayOrder || 0) : existing.displayOrder,
      },
      include: {
        division: {
          select: {
            id: true,
            name: true,
            code: true,
            displayOrder: true,
          },
        },
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });
  }

  async deletePosition(id: number) {
    const existing = await prisma.osisPosition.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, 'Jabatan OSIS tidak ditemukan.');
    }

    if (existing._count.memberships > 0) {
      throw new ApiError(400, 'Jabatan tidak dapat dihapus karena masih dipakai anggota.');
    }

    await prisma.osisPosition.delete({ where: { id } });
    return existing;
  }

  async listMemberships(params: {
    periodId: number;
    semester?: Semester;
    reportType?: string;
    programCode?: string;
  }) {
    const period = await this.ensurePeriodExists(params.periodId);
    const reportSlot =
      params.semester && (params.reportType || params.programCode)
        ? await resolveTemplateReportSlot({
            academicYearId: period.academicYearId,
            semester: params.semester,
            reportType: params.reportType,
            programCode: params.programCode,
          })
        : null;

    const memberships = await prisma.osisMembership.findMany({
      where: { periodId: params.periodId },
      include: membershipInclude,
    });

    const rows = sortMemberships(memberships).map((membership) => {
      const currentAssessment =
        reportSlot && params.semester
          ? membership.assessments.find(
              (assessment) =>
                Number(assessment.academicYearId) === Number(period.academicYearId) &&
                assessment.semester === params.semester &&
                normalizeProgramCode(assessment.reportSlot) === normalizeProgramCode(reportSlot),
            ) || null
          : null;

      return {
        ...membership,
        currentAssessment,
      };
    });

    return {
      period,
      reportSlot,
      memberships: rows,
    };
  }

  async getStudentJoinStatus(studentId: number, academicYearId?: number | null) {
    const targetAcademicYearId = await this.resolveAcademicYearId(academicYearId);

    if (!targetAcademicYearId) {
      return {
        academicYearId: null,
        membership: null,
        request: null,
      };
    }

    const [membership, request] = await Promise.all([
      prisma.osisMembership.findFirst({
        where: {
          studentId,
          isActive: true,
          period: {
            academicYearId: targetAcademicYearId,
          },
        },
        orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
        include: membershipInclude,
      }),
      prisma.osisJoinRequest.findFirst({
        where: {
          studentId,
          academicYearId: targetAcademicYearId,
        },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        include: osisJoinRequestInclude,
      }),
    ]);

    return {
      academicYearId: targetAcademicYearId,
      membership,
      request,
    };
  }

  async createJoinRequest(
    studentId: number,
    payload: {
      ekskulId: number;
      academicYearId?: number | null;
    },
  ) {
    const targetAcademicYearId = await this.resolveAcademicYearId(payload.academicYearId);
    if (!targetAcademicYearId) {
      throw new ApiError(400, 'Tahun ajaran aktif tidak tersedia.');
    }

    const ekskul = await prisma.ekstrakurikuler.findUnique({
      where: { id: payload.ekskulId },
      select: {
        id: true,
        name: true,
        category: true,
      },
    });

    if (!ekskul) {
      throw new ApiError(404, 'OSIS tidak ditemukan.');
    }

    if (ekskul.category !== 'OSIS') {
      throw new ApiError(400, 'Permintaan OSIS hanya dapat dibuat untuk item kategori OSIS.');
    }

    await this.ensureStudentActiveInAcademicYear(studentId, targetAcademicYearId);

    const [existingMembership, existingPendingRequest] = await Promise.all([
      prisma.osisMembership.findFirst({
        where: {
          studentId,
          isActive: true,
          period: {
            academicYearId: targetAcademicYearId,
          },
        },
        select: { id: true },
      }),
      prisma.osisJoinRequest.findFirst({
        where: {
          studentId,
          academicYearId: targetAcademicYearId,
          status: OsisJoinRequestStatus.PENDING,
        },
        select: {
          id: true,
          ekskul: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    if (existingMembership) {
      throw new ApiError(400, 'Anda sudah tercatat sebagai anggota OSIS pada tahun ajaran ini.');
    }

    if (existingPendingRequest) {
      throw new ApiError(
        400,
        `Pengajuan OSIS Anda masih menunggu proses pembina${existingPendingRequest.ekskul?.name ? ` (${existingPendingRequest.ekskul.name})` : ''}.`,
      );
    }

    return prisma.osisJoinRequest.create({
      data: {
        academicYearId: targetAcademicYearId,
        ekskulId: ekskul.id,
        studentId,
        status: OsisJoinRequestStatus.PENDING,
      },
      include: osisJoinRequestInclude,
    });
  }

  async listJoinRequests(params: {
    academicYearId?: number | null;
    status?: OsisJoinRequestStatus;
  }) {
    const targetAcademicYearId = await this.resolveAcademicYearId(params.academicYearId);

    return prisma.osisJoinRequest.findMany({
      where: {
        ...(targetAcademicYearId ? { academicYearId: targetAcademicYearId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      include: osisJoinRequestInclude,
    });
  }

  async rejectJoinRequest(
    actorId: number,
    id: number,
    note?: string | null,
  ) {
    const existing = await prisma.osisJoinRequest.findUnique({
      where: { id },
      include: osisJoinRequestInclude,
    });

    if (!existing) {
      throw new ApiError(404, 'Permintaan OSIS tidak ditemukan.');
    }

    if (existing.status !== OsisJoinRequestStatus.PENDING) {
      throw new ApiError(400, 'Permintaan OSIS ini sudah diproses sebelumnya.');
    }

    return prisma.osisJoinRequest.update({
      where: { id },
      data: {
        status: OsisJoinRequestStatus.REJECTED,
        note: normalizeNullableText(note),
        processedAt: new Date(),
        processedById: actorId,
      },
      include: osisJoinRequestInclude,
    });
  }

  async createMembership(
    actorId: number,
    payload: {
    periodId: number;
    studentId: number;
    positionId: number;
    divisionId?: number | null;
    joinedAt?: Date | null;
    endedAt?: Date | null;
    isActive?: boolean;
    requestId?: number | null;
  },
  ) {
    const period = await this.ensurePeriodExists(payload.periodId);
    const position = await this.ensurePositionBelongsToPeriod(payload.positionId, payload.periodId);
    const resolvedDivisionId = payload.divisionId ?? position.divisionId ?? null;

    if (resolvedDivisionId) {
      await this.ensureDivisionBelongsToPeriod(resolvedDivisionId, payload.periodId);
    }

    if (position.divisionId && resolvedDivisionId && Number(position.divisionId) !== Number(resolvedDivisionId)) {
      throw new ApiError(400, 'Divisi anggota harus sesuai dengan divisi jabatan yang dipilih.');
    }

    await this.ensureStudentActiveInAcademicYear(payload.studentId, period.academicYearId);

    const joinedAt = payload.joinedAt ? new Date(payload.joinedAt) : new Date();
    const endedAt = payload.endedAt ? new Date(payload.endedAt) : null;
    if (endedAt && endedAt <= joinedAt) {
      throw new ApiError(400, 'Tanggal selesai jabatan harus setelah tanggal mulai.');
    }

    return prisma.$transaction(async (tx) => {
      const membership = await tx.osisMembership.create({
        data: {
          periodId: payload.periodId,
          studentId: payload.studentId,
          positionId: payload.positionId,
          divisionId: resolvedDivisionId,
          joinedAt,
          endedAt,
          isActive: payload.isActive ?? true,
        },
        include: membershipInclude,
      });

      const pendingRequest = payload.requestId
        ? await tx.osisJoinRequest.findUnique({
            where: { id: payload.requestId },
            select: {
              id: true,
              studentId: true,
              academicYearId: true,
              status: true,
            },
          })
        : await tx.osisJoinRequest.findFirst({
            where: {
              studentId: payload.studentId,
              academicYearId: period.academicYearId,
              status: OsisJoinRequestStatus.PENDING,
            },
            orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              studentId: true,
              academicYearId: true,
              status: true,
            },
          });

      if (pendingRequest) {
        if (pendingRequest.status !== OsisJoinRequestStatus.PENDING) {
          throw new ApiError(400, 'Permintaan OSIS ini sudah diproses.');
        }

        if (
          Number(pendingRequest.studentId) !== Number(payload.studentId) ||
          Number(pendingRequest.academicYearId) !== Number(period.academicYearId)
        ) {
          throw new ApiError(400, 'Permintaan OSIS tidak cocok dengan siswa atau tahun ajaran yang dipilih.');
        }

        await tx.osisJoinRequest.update({
          where: { id: pendingRequest.id },
          data: {
            status: OsisJoinRequestStatus.APPROVED,
            processedAt: new Date(),
            processedById: actorId,
            membershipId: membership.id,
          },
        });
      }

      return membership;
    });
  }

  async updateMembership(
    id: number,
    payload: Partial<{
      studentId: number;
      positionId: number;
      divisionId: number | null;
      joinedAt: Date | null;
      endedAt: Date | null;
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.osisMembership.findUnique({
      where: { id },
      include: {
        period: {
          select: {
            id: true,
            academicYearId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, 'Keanggotaan OSIS tidak ditemukan.');
    }

    const positionId = payload.positionId ?? existing.positionId;
    const position = await this.ensurePositionBelongsToPeriod(positionId, existing.periodId);
    const resolvedDivisionId =
      payload.divisionId === undefined
        ? existing.divisionId ?? position.divisionId ?? null
        : payload.divisionId ?? position.divisionId ?? null;

    if (resolvedDivisionId) {
      await this.ensureDivisionBelongsToPeriod(resolvedDivisionId, existing.periodId);
    }

    if (position.divisionId && resolvedDivisionId && Number(position.divisionId) !== Number(resolvedDivisionId)) {
      throw new ApiError(400, 'Divisi anggota harus sesuai dengan divisi jabatan yang dipilih.');
    }

    const studentId = payload.studentId ?? existing.studentId;
    if (studentId !== existing.studentId || payload.studentId !== undefined) {
      const student = await prisma.user.findFirst({
        where: {
          id: studentId,
          role: 'STUDENT',
          studentStatus: 'ACTIVE',
          studentClass: {
            academicYearId: existing.period.academicYearId,
          },
        },
        select: { id: true },
      });

      if (!student) {
        throw new ApiError(400, 'Anggota OSIS harus siswa aktif pada tahun ajaran yang sama.');
      }
    }

    const joinedAt = payload.joinedAt !== undefined ? new Date(payload.joinedAt || existing.joinedAt) : existing.joinedAt;
    const endedAt =
      payload.endedAt === undefined
        ? existing.endedAt
        : payload.endedAt
          ? new Date(payload.endedAt)
          : null;

    if (endedAt && endedAt <= joinedAt) {
      throw new ApiError(400, 'Tanggal selesai jabatan harus setelah tanggal mulai.');
    }

    return prisma.osisMembership.update({
      where: { id },
      data: {
        studentId,
        positionId,
        divisionId: resolvedDivisionId,
        joinedAt,
        endedAt,
        isActive: payload.isActive ?? existing.isActive,
      },
      include: membershipInclude,
    });
  }

  async deactivateMembership(id: number) {
    const existing = await prisma.osisMembership.findUnique({
      where: { id },
      include: membershipInclude,
    });

    if (!existing) {
      throw new ApiError(404, 'Keanggotaan OSIS tidak ditemukan.');
    }

    return prisma.osisMembership.update({
      where: { id },
      data: {
        isActive: false,
        endedAt: existing.endedAt || new Date(),
      },
      include: membershipInclude,
    });
  }

  async getGradeTemplates(params: {
    academicYearId: number;
    semester: Semester;
    reportType?: string;
    programCode?: string;
  }) {
    const reportSlot = await resolveTemplateReportSlot(params);
    const rows = await prisma.osisGradeTemplate.findMany({
      where: {
        academicYearId: params.academicYearId,
        semester: params.semester,
        reportSlot,
      },
      orderBy: [{ predicate: 'asc' }],
    });

    return {
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportSlot,
      templates: buildTemplatePayload(rows),
    };
  }

  async saveGradeTemplates(params: {
    academicYearId: number;
    semester: Semester;
    reportType?: string;
    programCode?: string;
    templates: Partial<Record<OsisPredicate, { label?: string; description?: string }>>;
  }) {
    const reportSlot = await resolveTemplateReportSlot(params);
    const rows = OSIS_PREDICATES.map((predicate) => {
      const template = params.templates?.[predicate] || {};
      const label = String(template.label || '').trim() || DEFAULT_OSIS_PREDICATE_LABELS[predicate];
      const description = String(template.description || '').trim();
      return {
        academicYearId: params.academicYearId,
        semester: params.semester,
        reportSlot,
        predicate: label,
        description,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.osisGradeTemplate.deleteMany({
        where: {
          academicYearId: params.academicYearId,
          semester: params.semester,
          reportSlot,
        },
      });

      const toInsert = rows.filter(
        (row) =>
          row.description.length > 0 ||
          row.predicate !== DEFAULT_OSIS_PREDICATE_LABELS[normalizePredicate(row.predicate)],
      );

      if (toInsert.length > 0) {
        await tx.osisGradeTemplate.createMany({ data: toInsert });
      }
    });

    return {
      academicYearId: params.academicYearId,
      semester: params.semester,
      reportSlot,
      templates: buildTemplatePayload(rows),
    };
  }

  async upsertAssessment(
    actorId: number,
    payload: {
      membershipId: number;
      grade: string;
      description: string;
      semester: Semester;
      reportType?: string;
      programCode?: string;
    },
  ) {
    const membership = await prisma.osisMembership.findUnique({
      where: { id: payload.membershipId },
      include: {
        period: {
          select: {
            academicYearId: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ApiError(404, 'Anggota OSIS tidak ditemukan.');
    }

    const reportSlot = await resolveTemplateReportSlot({
      academicYearId: membership.period.academicYearId,
      semester: payload.semester,
      reportType: payload.reportType,
      programCode: payload.programCode,
    });

    const normalizedGrade = normalizePredicate(payload.grade);
    const normalizedDescription = String(payload.description || '').trim();

    const assessment = await prisma.osisAssessment.upsert({
      where: {
        membershipId_academicYearId_semester_reportSlot: {
          membershipId: payload.membershipId,
          academicYearId: membership.period.academicYearId,
          semester: payload.semester,
          reportSlot,
        },
      },
      update: {
        grade: normalizedGrade,
        description: normalizedDescription || null,
        gradedById: actorId,
        gradedAt: new Date(),
      },
      create: {
        membershipId: payload.membershipId,
        academicYearId: membership.period.academicYearId,
        semester: payload.semester,
        reportSlot,
        grade: normalizedGrade,
        description: normalizedDescription || null,
        gradedById: actorId,
        gradedAt: new Date(),
      },
      include: {
        gradedBy: { select: { id: true, name: true, username: true } },
        membership: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                nis: true,
                nisn: true,
                studentClass: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            division: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            position: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            period: {
              select: {
                id: true,
                title: true,
                academicYear: {
                  select: {
                    id: true,
                    name: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    await notifyHomeroomOsisGradeUpdated({
      membershipId: payload.membershipId,
      academicYearId: membership.period.academicYearId,
      semester: payload.semester,
      reportType: normalizeProgramCode(payload.reportType),
      programCode: normalizeProgramCode(payload.programCode),
    });

    return {
      ...assessment,
      reportSlot,
    };
  }
}

export const osisManagementService = new OsisManagementService();

export const osisManagementUtils = {
  canonicalizeReportSlotAlias,
  normalizeComparableName,
  normalizeProgramCode,
};
