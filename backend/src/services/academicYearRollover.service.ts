import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';

type DbClient = typeof prisma | Prisma.TransactionClient;

export type AcademicYearRolloverComponentSelection = {
  classPreparation: boolean;
  teacherAssignments: boolean;
  scheduleTimeConfig: boolean;
  academicEvents: boolean;
  reportDates: boolean;
  subjectKkms: boolean;
  examGradeComponents: boolean;
  examProgramConfigs: boolean;
  examProgramSessions: boolean;
};

type RolloverCreateTargetPayload = {
  name?: string;
  semester1Start?: Date;
  semester1End?: Date;
  semester2Start?: Date;
  semester2End?: Date;
};

type RolloverActor = {
  id?: number | null;
};

type LoadedAcademicYearClass = Prisma.ClassGetPayload<{
  include: {
    major: {
      select: {
        id: true;
        code: true;
        name: true;
      };
    };
    teacher: {
      select: {
        id: true;
        name: true;
        username: true;
      };
    };
    students: {
      where: {
        role: 'STUDENT';
        studentStatus: 'ACTIVE';
      };
      select: {
        id: true;
      };
    };
  };
}>;

type LoadedRolloverContext = {
  sourceYear: Prisma.AcademicYearGetPayload<{
    include: {
      classes: {
        include: {
          major: {
            select: {
              id: true;
              code: true;
              name: true;
            };
          };
          teacher: {
            select: {
              id: true;
              name: true;
              username: true;
            };
          };
          students: {
            where: {
              role: 'STUDENT';
              studentStatus: 'ACTIVE';
            };
            select: {
              id: true;
            };
          };
        };
      };
    };
  }>;
  targetYear: Prisma.AcademicYearGetPayload<{
    include: {
      classes: {
        include: {
          major: {
            select: {
              id: true;
              code: true;
              name: true;
            };
          };
          teacher: {
            select: {
              id: true;
              name: true;
              username: true;
            };
          };
          students: {
            where: {
              role: 'STUDENT';
              studentStatus: 'ACTIVE';
            };
            select: {
              id: true;
            };
          };
        };
      };
    };
  }>;
  sourceAssignments: Array<{
    id: number;
    teacherId: number;
    subjectId: number;
    classId: number;
    academicYearId: number;
    kkm: number;
    competencyThresholds: Prisma.JsonValue | null;
    teacher: {
      id: number;
      name: string;
      username: string;
    };
    subject: {
      id: number;
      name: string;
      code: string;
    };
    class: {
      id: number;
      name: string;
      level: string;
      major: {
        id: number;
        code: string;
        name: string;
      };
    };
  }>;
  targetAssignments: Array<{
    id: number;
    teacherId: number;
    subjectId: number;
    classId: number;
    academicYearId: number;
  }>;
  sourceScheduleTimeConfig: {
    id: number;
    academicYearId: number;
    config: Prisma.JsonValue;
  } | null;
  targetScheduleTimeConfig: {
    id: number;
    academicYearId: number;
    config: Prisma.JsonValue;
  } | null;
  sourceAcademicEvents: Array<{
    id: number;
    title: string;
    type: string;
    semester: string | null;
    isHoliday: boolean;
    description: string | null;
    startDate: Date;
    endDate: Date;
  }>;
  targetAcademicEvents: Array<{
    id: number;
    title: string;
    type: string;
    startDate: Date;
    endDate: Date;
  }>;
  sourceReportDates: Array<{
    id: number;
    academicYearId: number;
    semester: string;
    reportType: string;
    place: string;
    date: Date;
  }>;
  targetReportDates: Array<{
    id: number;
    academicYearId: number;
    semester: string;
    reportType: string;
    place: string;
    date: Date;
  }>;
  sourceSubjectKkms: Array<{
    id: number;
    subjectId: number;
    academicYearId: number | null;
    classLevel: string;
    kkm: number;
    subject: {
      id: number;
      name: string;
      code: string;
    };
  }>;
  targetSubjectKkms: Array<{
    id: number;
    subjectId: number;
    academicYearId: number | null;
    classLevel: string;
    kkm: number;
    subject: {
      id: number;
      name: string;
      code: string;
    };
  }>;
  sourceExamGradeComponents: Array<{
    id: number;
    academicYearId: number;
    code: string;
    label: string;
    type: string;
    typeCode: string;
    entryMode: string;
    entryModeCode: string;
    reportSlot: string;
    reportSlotCode: string;
    includeInFinalScore: boolean;
    description: string | null;
    displayOrder: number;
    isActive: boolean;
  }>;
  targetExamGradeComponents: Array<{
    id: number;
    academicYearId: number;
    code: string;
    label: string;
    type: string;
    typeCode: string;
    entryMode: string;
    entryModeCode: string;
    reportSlot: string;
    reportSlotCode: string;
    includeInFinalScore: boolean;
    description: string | null;
    displayOrder: number;
    isActive: boolean;
  }>;
  sourceExamProgramConfigs: Array<{
    id: number;
    academicYearId: number;
    code: string;
    baseType: string;
    baseTypeCode: string;
    gradeComponentType: string;
    gradeComponentTypeCode: string;
    gradeComponentCode: string;
    gradeComponentLabel: string | null;
    gradeEntryMode: string;
    gradeEntryModeCode: string;
    displayLabel: string;
    shortLabel: string | null;
    description: string | null;
    fixedSemester: string | null;
    displayOrder: number;
    isActive: boolean;
    showOnTeacherMenu: boolean;
    showOnStudentMenu: boolean;
    targetClassLevels: string[];
    allowedSubjectIds: number[];
    allowedAuthorIds: number[];
    studentResultPublishMode: string;
    studentResultPublishAt: Date | null;
    financeClearanceMode: string;
    financeMinOutstandingAmount: number;
    financeMinOverdueInvoices: number;
    financeClearanceNotes: string | null;
  }>;
  targetExamProgramConfigs: Array<{
    id: number;
    academicYearId: number;
    code: string;
    baseType: string;
    baseTypeCode: string;
    gradeComponentType: string;
    gradeComponentTypeCode: string;
    gradeComponentCode: string;
    gradeComponentLabel: string | null;
    gradeEntryMode: string;
    gradeEntryModeCode: string;
    displayLabel: string;
    shortLabel: string | null;
    description: string | null;
    fixedSemester: string | null;
    displayOrder: number;
    isActive: boolean;
    showOnTeacherMenu: boolean;
    showOnStudentMenu: boolean;
    targetClassLevels: string[];
    allowedSubjectIds: number[];
    allowedAuthorIds: number[];
    studentResultPublishMode: string;
    studentResultPublishAt: Date | null;
    financeClearanceMode: string;
    financeMinOutstandingAmount: number;
    financeMinOverdueInvoices: number;
    financeClearanceNotes: string | null;
  }>;
  sourceExamProgramSessions: Array<{
    id: number;
    academicYearId: number;
    programCode: string;
    label: string;
    normalizedLabel: string;
    displayOrder: number;
    isActive: boolean;
  }>;
  targetExamProgramSessions: Array<{
    id: number;
    academicYearId: number;
    programCode: string;
    label: string;
    normalizedLabel: string;
    displayOrder: number;
    isActive: boolean;
  }>;
};

type RolloverClassPlanItem = {
  sourceClassId: number;
  sourceClassName: string;
  sourceLevel: string;
  studentCount: number;
  major: {
    id: number;
    code: string;
    name: string;
  };
  targetLevel: string;
  targetClassName: string;
  targetClassId: number | null;
  sourceHomeroomTeacher: {
    id: number;
    name: string;
    username: string;
  } | null;
  targetHomeroomTeacher: {
    id: number;
    name: string;
    username: string;
  } | null;
  homeroomAction:
    | 'CARRY_FORWARD_ON_CREATE'
    | 'FILL_EXISTING_EMPTY'
    | 'KEEP_EXISTING'
    | 'NO_SOURCE_HOMEROOM';
  action: 'CREATE' | 'SKIP_EXISTING';
};

type RolloverTeacherAssignmentPlanItem = {
  sourceAssignmentId: number;
  sourceClassId: number;
  sourceClassName: string;
  sourceClassLevel: string;
  targetClassId: number | null;
  targetClassName: string | null;
  teacher: {
    id: number;
    name: string;
    username: string;
  };
  subject: {
    id: number;
    name: string;
    code: string;
  };
  kkm: number;
  action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_NO_TARGET_CLASS';
  reason: string | null;
};

type RolloverAcademicEventPlanItem = {
  sourceEventId: number;
  title: string;
  type: string;
  semester: string | null;
  isHoliday: boolean;
  sourceStartDate: Date;
  sourceEndDate: Date;
  targetStartDate: Date | null;
  targetEndDate: Date | null;
  action: 'CREATE' | 'SKIP_DUPLICATE' | 'SKIP_OUTSIDE_TARGET_RANGE';
  reason: string | null;
};

type RolloverReportDatePlanItem = {
  sourceReportDateId: number;
  semester: string;
  reportType: string;
  place: string;
  sourceDate: Date;
  targetDate: Date | null;
  targetReportDateId: number | null;
  targetPlace: string | null;
  action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_OUTSIDE_TARGET_RANGE';
  reason: string | null;
};

type RolloverSubjectKkmPlanItem = {
  sourceSubjectKkmId: number;
  sourceAcademicYearId: number | null;
  sourceScope: 'ACADEMIC_YEAR' | 'GLOBAL_FALLBACK';
  subject: {
    id: number;
    code: string;
    name: string;
  };
  classLevel: string;
  sourceKkm: number;
  targetSubjectKkmId: number | null;
  targetKkm: number | null;
  action: 'CREATE' | 'SKIP_EXISTING';
  reason: string | null;
};

type RolloverExamGradeComponentPlanItem = {
  sourceComponentId: number;
  code: string;
  label: string;
  type: string;
  entryMode: string;
  reportSlot: string;
  includeInFinalScore: boolean;
  targetComponentId: number | null;
  action: 'CREATE' | 'SKIP_EXISTING';
  reason: string | null;
};

type RolloverExamProgramConfigPlanItem = {
  sourceProgramId: number;
  code: string;
  displayLabel: string;
  baseType: string;
  fixedSemester: string | null;
  gradeComponentCode: string;
  targetProgramId: number | null;
  targetHasGradeComponent: boolean;
  action: 'CREATE' | 'SKIP_EXISTING';
  reason: string | null;
};

type RolloverExamProgramSessionPlanItem = {
  sourceSessionId: number;
  programCode: string;
  label: string;
  normalizedLabel: string;
  displayOrder: number;
  targetSessionId: number | null;
  action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_NO_TARGET_PROGRAM';
  reason: string | null;
};

type RolloverWorkspace = {
  sourceAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
    semester1Start: Date;
    semester1End: Date;
    semester2Start: Date;
    semester2End: Date;
  };
  targetAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
    semester1Start: Date;
    semester1End: Date;
    semester2Start: Date;
    semester2End: Date;
  };
  targetDraftSuggestion: {
    name: string;
    semester1Start: Date;
    semester1End: Date;
    semester2Start: Date;
    semester2End: Date;
  };
  validation: {
    readyToApply: boolean;
    errors: string[];
    warnings: string[];
  };
  components: {
    classPreparation: {
      key: 'classPreparation';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        homeroomCarryCount: number;
        homeroomExistingFillCount: number;
        homeroomKeepExistingCount: number;
        homeroomMissingSourceCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverClassPlanItem[];
    };
    teacherAssignments: {
      key: 'teacherAssignments';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipNoTargetClassCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverTeacherAssignmentPlanItem[];
    };
    scheduleTimeConfig: {
      key: 'scheduleTimeConfig';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipNoSourceCount: number;
      };
      errors: string[];
      warnings: string[];
      item: {
        action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_NO_SOURCE';
        sourceAcademicYearId: number | null;
        targetAcademicYearId: number;
      };
    };
    academicEvents: {
      key: 'academicEvents';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipOutsideTargetRangeCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverAcademicEventPlanItem[];
    };
    reportDates: {
      key: 'reportDates';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipOutsideTargetRangeCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverReportDatePlanItem[];
    };
    subjectKkms: {
      key: 'subjectKkms';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        globalFallbackCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverSubjectKkmPlanItem[];
    };
    examGradeComponents: {
      key: 'examGradeComponents';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverExamGradeComponentPlanItem[];
    };
    examProgramConfigs: {
      key: 'examProgramConfigs';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        missingGradeComponentCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverExamProgramConfigPlanItem[];
    };
    examProgramSessions: {
      key: 'examProgramSessions';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipNoTargetProgramCount: number;
      };
      errors: string[];
      warnings: string[];
      items: RolloverExamProgramSessionPlanItem[];
    };
  };
  notes: string[];
};

type CreateRolloverTargetResult = {
  created: boolean;
  targetAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
    semester1Start: Date;
    semester1End: Date;
    semester2Start: Date;
    semester2End: Date;
  };
  targetDraftSuggestion: RolloverWorkspace['targetDraftSuggestion'];
  notes: string[];
};

type ApplyAcademicYearRolloverResult = {
  targetAcademicYear: RolloverWorkspace['targetAcademicYear'];
  applied: {
    classPreparation: {
      created: number;
      skippedExisting: number;
      homeroomCarriedOnCreate: number;
      homeroomFilledExisting: number;
      homeroomKeptExisting: number;
      homeroomMissingSource: number;
    };
    teacherAssignments: {
      created: number;
      skippedExisting: number;
      skippedNoTargetClass: number;
    };
    scheduleTimeConfig: {
      created: number;
      skippedExisting: number;
      skippedNoSource: number;
    };
    academicEvents: {
      created: number;
      skippedExisting: number;
      skippedOutsideTargetRange: number;
    };
    reportDates: {
      created: number;
      skippedExisting: number;
      skippedOutsideTargetRange: number;
    };
    subjectKkms: {
      created: number;
      skippedExisting: number;
      globalFallbackCount: number;
    };
    examGradeComponents: {
      created: number;
      skippedExisting: number;
    };
    examProgramConfigs: {
      created: number;
      skippedExisting: number;
      missingGradeComponentCount: number;
    };
    examProgramSessions: {
      created: number;
      skippedExisting: number;
      skippedNoTargetProgram: number;
    };
  };
  workspace: RolloverWorkspace;
};

const DEFAULT_COMPONENT_SELECTION: AcademicYearRolloverComponentSelection = {
  classPreparation: true,
  teacherAssignments: true,
  scheduleTimeConfig: true,
  academicEvents: true,
  reportDates: true,
  subjectKkms: true,
  examGradeComponents: true,
  examProgramConfigs: true,
  examProgramSessions: true,
};

const PROMOTION_SOURCE_LEVELS = new Set(['X', 'XI']);

function normalizeLevel(level?: string | null) {
  return String(level || '').trim().toUpperCase();
}

function parseDateOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function deriveTargetAcademicYearName(sourceName: string) {
  const match = String(sourceName || '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) {
    return `Draft ${new Date().toISOString().slice(0, 10)}`;
  }
  const nextStart = Number(match[1]) + 1;
  const nextEnd = Number(match[2]) + 1;
  return `${nextStart}/${nextEnd}`;
}

function deriveTargetAcademicYearTimeline(sourceYear: {
  name: string;
  semester1Start: Date;
  semester1End: Date;
  semester2Start: Date;
  semester2End: Date;
}) {
  return {
    name: deriveTargetAcademicYearName(sourceYear.name),
    semester1Start: addYears(sourceYear.semester1Start, 1),
    semester1End: addYears(sourceYear.semester1End, 1),
    semester2Start: addYears(sourceYear.semester2Start, 1),
    semester2End: addYears(sourceYear.semester2End, 1),
  };
}

function buildPromotionTargetClassName(sourceName: string, sourceLevel: string) {
  const trimmed = String(sourceName || '').trim();
  if (sourceLevel === 'X') {
    if (/^X\s+/i.test(trimmed)) return trimmed.replace(/^X(\s+)/i, 'XI$1');
    return `XI ${trimmed}`;
  }
  if (sourceLevel === 'XI') {
    if (/^XI\s+/i.test(trimmed)) return trimmed.replace(/^XI(\s+)/i, 'XII$1');
    return `XII ${trimmed}`;
  }
  return trimmed;
}

function shiftDateByAcademicYear(sourceDate: Date, sourceAcademicYearStart: Date, targetAcademicYearStart: Date) {
  const delta = sourceDate.getTime() - sourceAcademicYearStart.getTime();
  return new Date(targetAcademicYearStart.getTime() + delta);
}

function normalizeComponentSelection(
  input?: Partial<AcademicYearRolloverComponentSelection> | null,
): AcademicYearRolloverComponentSelection {
  return {
    classPreparation: input?.classPreparation ?? DEFAULT_COMPONENT_SELECTION.classPreparation,
    teacherAssignments: input?.teacherAssignments ?? DEFAULT_COMPONENT_SELECTION.teacherAssignments,
    scheduleTimeConfig: input?.scheduleTimeConfig ?? DEFAULT_COMPONENT_SELECTION.scheduleTimeConfig,
    academicEvents: input?.academicEvents ?? DEFAULT_COMPONENT_SELECTION.academicEvents,
    reportDates: input?.reportDates ?? DEFAULT_COMPONENT_SELECTION.reportDates,
    subjectKkms: input?.subjectKkms ?? DEFAULT_COMPONENT_SELECTION.subjectKkms,
    examGradeComponents: input?.examGradeComponents ?? DEFAULT_COMPONENT_SELECTION.examGradeComponents,
    examProgramConfigs: input?.examProgramConfigs ?? DEFAULT_COMPONENT_SELECTION.examProgramConfigs,
    examProgramSessions: input?.examProgramSessions ?? DEFAULT_COMPONENT_SELECTION.examProgramSessions,
  };
}

function getTargetClassPlan(
  sourceClasses: LoadedAcademicYearClass[],
  targetClasses: LoadedAcademicYearClass[],
): RolloverWorkspace['components']['classPreparation'] {
  const targetClassByName = new Map(
    targetClasses.map((item) => [item.name.trim().toLowerCase(), item]),
  );
  const errors: string[] = [];
  const warningSet = new Set<string>([
    'Kelas X tahun ajaran baru tidak di-clone otomatis di wizard ini dan tetap disiapkan sesuai PPDB/rombel baru.',
  ]);

  const items: RolloverClassPlanItem[] = sourceClasses
    .filter((item) => PROMOTION_SOURCE_LEVELS.has(normalizeLevel(item.level)))
    .map((sourceClass) => {
      const sourceLevel = normalizeLevel(sourceClass.level);
      const targetLevel = sourceLevel === 'X' ? 'XI' : 'XII';
      const targetClassName = buildPromotionTargetClassName(sourceClass.name, sourceLevel);
      const existingTargetClass = targetClassByName.get(targetClassName.trim().toLowerCase()) || null;
      const sourceHomeroomTeacher = sourceClass.teacher
        ? {
            id: sourceClass.teacher.id,
            name: sourceClass.teacher.name,
            username: sourceClass.teacher.username,
          }
        : null;
      const targetHomeroomTeacher = existingTargetClass?.teacher
        ? {
            id: existingTargetClass.teacher.id,
            name: existingTargetClass.teacher.name,
            username: existingTargetClass.teacher.username,
          }
        : null;
      const homeroomAction =
        !sourceHomeroomTeacher
          ? ('NO_SOURCE_HOMEROOM' as const)
          : !existingTargetClass
            ? ('CARRY_FORWARD_ON_CREATE' as const)
            : !targetHomeroomTeacher
              ? ('FILL_EXISTING_EMPTY' as const)
              : ('KEEP_EXISTING' as const);

      if (existingTargetClass) {
        const existingLevel = normalizeLevel(existingTargetClass.level);
        if (existingLevel !== targetLevel || existingTargetClass.major.id !== sourceClass.major.id) {
          errors.push(
            `Kelas target "${targetClassName}" sudah ada tetapi level/jurusannya tidak cocok dengan sumber "${sourceClass.name}".`,
          );
        }
        if (existingTargetClass.students.length > 0) {
          warningSet.add(
            `Kelas target "${targetClassName}" di tahun target sudah memiliki ${existingTargetClass.students.length} siswa aktif.`,
          );
        }
        if (
          sourceHomeroomTeacher &&
          targetHomeroomTeacher &&
          targetHomeroomTeacher.id !== sourceHomeroomTeacher.id
        ) {
          warningSet.add(
            `Kelas target "${targetClassName}" sudah memiliki wali kelas "${targetHomeroomTeacher.name}". Wizard mempertahankan wali kelas target yang sudah ada dan tidak menimpa source "${sourceHomeroomTeacher.name}".`,
          );
        }
      }

      return {
        sourceClassId: sourceClass.id,
        sourceClassName: sourceClass.name,
        sourceLevel,
        studentCount: sourceClass.students.length,
        major: {
          id: sourceClass.major.id,
          code: sourceClass.major.code,
          name: sourceClass.major.name,
        },
        targetLevel,
        targetClassName,
        targetClassId: existingTargetClass?.id || null,
        sourceHomeroomTeacher,
        targetHomeroomTeacher,
        homeroomAction,
        action: existingTargetClass ? ('SKIP_EXISTING' as const) : ('CREATE' as const),
      };
    })
    .sort((left, right) => left.targetClassName.localeCompare(right.targetClassName, 'id'));

  const targetNameCounts = new Map<string, number>();
  items.forEach((item) => {
    const key = item.targetClassName.trim().toLowerCase();
    targetNameCounts.set(key, (targetNameCounts.get(key) || 0) + 1);
  });
  targetNameCounts.forEach((count, key) => {
    if (count > 1) {
      errors.push(
        `Lebih dari satu kelas sumber menghasilkan target class "${key}". Periksa penamaan rombel sebelum apply wizard.`,
      );
    }
  });

  const createCount = items.filter((item) => item.action === 'CREATE').length;
  const existingCount = items.length - createCount;
  const homeroomCarryCount = items.filter((item) => item.homeroomAction === 'CARRY_FORWARD_ON_CREATE').length;
  const homeroomExistingFillCount = items.filter((item) => item.homeroomAction === 'FILL_EXISTING_EMPTY').length;
  const homeroomKeepExistingCount = items.filter((item) => item.homeroomAction === 'KEEP_EXISTING').length;
  const homeroomMissingSourceCount = items.filter((item) => item.homeroomAction === 'NO_SOURCE_HOMEROOM').length;
  const uniqueErrors = [...new Set(errors)];
  const warnings = [...warningSet];

  return {
    key: 'classPreparation',
    label: 'Kelas Target Promotion',
    description:
      'Menyiapkan kelas XI/XII yang dibutuhkan untuk promotion dari kelas X/XI tahun sumber, termasuk carry-forward wali kelas default bila tersedia.',
    selectedByDefault: true,
    ready: uniqueErrors.length === 0,
    summary: {
      sourceItems: items.length,
      createCount,
      existingCount,
      homeroomCarryCount,
      homeroomExistingFillCount,
      homeroomKeepExistingCount,
      homeroomMissingSourceCount,
    },
    errors: uniqueErrors,
    warnings,
    items,
  };
}

function getTeacherAssignmentPlan(
  sourceAssignments: LoadedRolloverContext['sourceAssignments'],
  classPlan: RolloverWorkspace['components']['classPreparation'],
  targetAssignments: LoadedRolloverContext['targetAssignments'],
): RolloverWorkspace['components']['teacherAssignments'] {
  const classPlanBySourceClassId = new Map(
    classPlan.items.map((item) => [item.sourceClassId, item]),
  );
  const targetAssignmentKeySet = new Set(
    targetAssignments.map((item) => `${item.classId}-${item.subjectId}`),
  );

  const items: RolloverTeacherAssignmentPlanItem[] = sourceAssignments
    .map((item) => {
      const targetClassPlan = classPlanBySourceClassId.get(item.classId);
      const targetClassId = targetClassPlan?.targetClassId || null;
      const targetClassName = targetClassPlan?.targetClassName || null;

      if (!targetClassPlan) {
        return {
          sourceAssignmentId: item.id,
          sourceClassId: item.class.id,
          sourceClassName: item.class.name,
          sourceClassLevel: normalizeLevel(item.class.level),
          targetClassId: null,
          targetClassName,
          teacher: item.teacher,
          subject: item.subject,
          kkm: item.kkm,
          action: 'SKIP_NO_TARGET_CLASS' as const,
          reason: 'Kelas target tidak masuk rencana wizard. Siapkan kelas target secara manual terlebih dahulu.',
        };
      }

      if (!targetClassId && targetClassPlan.action !== 'CREATE') {
        return {
          sourceAssignmentId: item.id,
          sourceClassId: item.class.id,
          sourceClassName: item.class.name,
          sourceClassLevel: normalizeLevel(item.class.level),
          targetClassId: null,
          targetClassName,
          teacher: item.teacher,
          subject: item.subject,
          kkm: item.kkm,
          action: 'SKIP_NO_TARGET_CLASS' as const,
          reason: 'Kelas target belum tersedia. Jalankan clone kelas dulu atau siapkan kelas target secara manual.',
        };
      }

      if (!targetClassId && targetClassPlan.action === 'CREATE') {
        return {
          sourceAssignmentId: item.id,
          sourceClassId: item.class.id,
          sourceClassName: item.class.name,
          sourceClassLevel: normalizeLevel(item.class.level),
          targetClassId: null,
          targetClassName,
          teacher: item.teacher,
          subject: item.subject,
          kkm: item.kkm,
          action: 'CREATE' as const,
          reason: 'Kelas target akan dibuat lebih dulu saat apply wizard, lalu assignment ini ikut dicloning.',
        };
      }

      const targetAssignmentKey = `${targetClassId}-${item.subjectId}`;
      if (targetAssignmentKeySet.has(targetAssignmentKey)) {
        return {
          sourceAssignmentId: item.id,
          sourceClassId: item.class.id,
          sourceClassName: item.class.name,
          sourceClassLevel: normalizeLevel(item.class.level),
          targetClassId,
          targetClassName,
          teacher: item.teacher,
          subject: item.subject,
          kkm: item.kkm,
          action: 'SKIP_EXISTING' as const,
          reason: 'Assignment target untuk kombinasi kelas-mapel sudah ada, jadi wizard tidak menimpa data manual.',
        };
      }

      return {
        sourceAssignmentId: item.id,
        sourceClassId: item.class.id,
        sourceClassName: item.class.name,
        sourceClassLevel: normalizeLevel(item.class.level),
        targetClassId,
        targetClassName,
        teacher: item.teacher,
        subject: item.subject,
        kkm: item.kkm,
        action: 'CREATE' as const,
        reason: null,
      };
    })
    .sort((left, right) => {
      const byClass = left.sourceClassName.localeCompare(right.sourceClassName, 'id');
      if (byClass !== 0) return byClass;
      return left.subject.name.localeCompare(right.subject.name, 'id');
    });

  return {
    key: 'teacherAssignments',
    label: 'Teacher Assignments',
    description: 'Clone assignment guru-mapel ke kelas target yang sudah tersedia tanpa menimpa assignment target yang sudah ada.',
    selectedByDefault: true,
    ready: true,
    summary: {
      sourceItems: items.length,
      createCount: items.filter((item) => item.action === 'CREATE').length,
      existingCount: items.filter((item) => item.action === 'SKIP_EXISTING').length,
      skipNoTargetClassCount: items.filter((item) => item.action === 'SKIP_NO_TARGET_CLASS').length,
    },
    errors: [],
    warnings: [
      'Wizard hanya membuat assignment yang belum ada. Assignment target yang sudah tersusun manual akan dipertahankan.',
      'Assignment untuk kelas X tahun baru tetap diatur terpisah setelah rombel/PPDB final.',
    ],
    items,
  };
}

function getScheduleTimeConfigPlan(
  sourceScheduleTimeConfig: LoadedRolloverContext['sourceScheduleTimeConfig'],
  targetScheduleTimeConfig: LoadedRolloverContext['targetScheduleTimeConfig'],
  targetAcademicYearId: number,
): RolloverWorkspace['components']['scheduleTimeConfig'] {
  const action = !sourceScheduleTimeConfig
    ? 'SKIP_NO_SOURCE'
    : targetScheduleTimeConfig
      ? 'SKIP_EXISTING'
      : 'CREATE';

  return {
    key: 'scheduleTimeConfig',
    label: 'Schedule Time Config',
    description: 'Salin konfigurasi jam/pola waktu jadwal dari tahun sumber jika target belum memilikinya.',
    selectedByDefault: true,
    ready: true,
    summary: {
      sourceItems: sourceScheduleTimeConfig ? 1 : 0,
      createCount: action === 'CREATE' ? 1 : 0,
      existingCount: action === 'SKIP_EXISTING' ? 1 : 0,
      skipNoSourceCount: action === 'SKIP_NO_SOURCE' ? 1 : 0,
    },
    errors: [],
    warnings:
      action === 'SKIP_EXISTING'
        ? ['Target year sudah memiliki schedule time config, jadi wizard tidak menimpanya.']
        : action === 'SKIP_NO_SOURCE'
          ? ['Tahun sumber belum memiliki schedule time config.']
          : [],
    item: {
      action,
      sourceAcademicYearId: sourceScheduleTimeConfig?.academicYearId || null,
      targetAcademicYearId,
    },
  };
}

function getAcademicEventPlan(
  sourceYear: LoadedRolloverContext['sourceYear'],
  targetYear: LoadedRolloverContext['targetYear'],
  sourceEvents: LoadedRolloverContext['sourceAcademicEvents'],
  targetEvents: LoadedRolloverContext['targetAcademicEvents'],
): RolloverWorkspace['components']['academicEvents'] {
  const targetEventKeySet = new Set(
    targetEvents.map(
      (item) =>
        `${item.title.trim().toLowerCase()}::${item.type}::${item.startDate.toISOString().slice(0, 10)}::${item.endDate.toISOString().slice(0, 10)}`,
    ),
  );

  const items: RolloverAcademicEventPlanItem[] = sourceEvents
    .map((item) => {
      const targetStartDate = shiftDateByAcademicYear(item.startDate, sourceYear.semester1Start, targetYear.semester1Start);
      const targetEndDate = shiftDateByAcademicYear(item.endDate, sourceYear.semester1Start, targetYear.semester1Start);

      if (targetStartDate < targetYear.semester1Start || targetEndDate > targetYear.semester2End) {
        return {
          sourceEventId: item.id,
          title: item.title,
          type: item.type,
          semester: item.semester,
          isHoliday: item.isHoliday,
          sourceStartDate: item.startDate,
          sourceEndDate: item.endDate,
          targetStartDate,
          targetEndDate,
          action: 'SKIP_OUTSIDE_TARGET_RANGE' as const,
          reason: 'Tanggal hasil clone keluar dari rentang semester target.',
        };
      }

      const targetKey = `${item.title.trim().toLowerCase()}::${item.type}::${targetStartDate.toISOString().slice(0, 10)}::${targetEndDate.toISOString().slice(0, 10)}`;
      if (targetEventKeySet.has(targetKey)) {
        return {
          sourceEventId: item.id,
          title: item.title,
          type: item.type,
          semester: item.semester,
          isHoliday: item.isHoliday,
          sourceStartDate: item.startDate,
          sourceEndDate: item.endDate,
          targetStartDate,
          targetEndDate,
          action: 'SKIP_DUPLICATE' as const,
          reason: 'Event target dengan judul, tipe, dan tanggal yang sama sudah ada.',
        };
      }

      return {
        sourceEventId: item.id,
        title: item.title,
        type: item.type,
        semester: item.semester,
        isHoliday: item.isHoliday,
        sourceStartDate: item.startDate,
        sourceEndDate: item.endDate,
        targetStartDate,
        targetEndDate,
        action: 'CREATE' as const,
        reason: null,
      };
    })
    .sort((left, right) => left.sourceStartDate.getTime() - right.sourceStartDate.getTime());

  return {
    key: 'academicEvents',
    label: 'Academic Events',
    description: 'Clone event kalender akademik dengan menggeser tanggal relatif terhadap awal semester 1 tahun ajaran.',
    selectedByDefault: true,
    ready: true,
    summary: {
      sourceItems: items.length,
      createCount: items.filter((item) => item.action === 'CREATE').length,
      existingCount: items.filter((item) => item.action === 'SKIP_DUPLICATE').length,
      skipOutsideTargetRangeCount: items.filter((item) => item.action === 'SKIP_OUTSIDE_TARGET_RANGE').length,
    },
    errors: [],
    warnings: items.some((item) => item.action === 'SKIP_OUTSIDE_TARGET_RANGE')
      ? ['Beberapa event tidak dicloning karena jatuh di luar rentang semester target.']
      : [],
    items,
  };
}

function normalizeSessionLabelKey(rawLabel?: string | null) {
  const normalized = String(rawLabel || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized || null;
}

function getReportDatePlan(
  sourceYear: LoadedRolloverContext['sourceYear'],
  targetYear: LoadedRolloverContext['targetYear'],
  sourceReportDates: LoadedRolloverContext['sourceReportDates'],
  targetReportDates: LoadedRolloverContext['targetReportDates'],
): RolloverWorkspace['components']['reportDates'] {
  const targetByKey = new Map(
    targetReportDates.map((item) => [`${item.semester}-${item.reportType}`, item]),
  );

  const items: RolloverReportDatePlanItem[] = sourceReportDates
    .map((item) => {
      const existingTarget = targetByKey.get(`${item.semester}-${item.reportType}`) || null;
      const targetDate = shiftDateByAcademicYear(item.date, sourceYear.semester1Start, targetYear.semester1Start);

      if (existingTarget) {
        return {
          sourceReportDateId: item.id,
          semester: item.semester,
          reportType: item.reportType,
          place: item.place,
          sourceDate: item.date,
          targetDate: existingTarget.date,
          targetReportDateId: existingTarget.id,
          targetPlace: existingTarget.place,
          action: 'SKIP_EXISTING' as const,
          reason: 'Target year sudah memiliki tanggal rapor untuk semester dan tipe rapor yang sama.',
        };
      }

      if (targetDate < targetYear.semester1Start || targetDate > targetYear.semester2End) {
        return {
          sourceReportDateId: item.id,
          semester: item.semester,
          reportType: item.reportType,
          place: item.place,
          sourceDate: item.date,
          targetDate: null,
          targetReportDateId: null,
          targetPlace: null,
          action: 'SKIP_OUTSIDE_TARGET_RANGE' as const,
          reason: 'Tanggal rapor hasil clone berada di luar rentang tahun ajaran target.',
        };
      }

      return {
        sourceReportDateId: item.id,
        semester: item.semester,
        reportType: item.reportType,
        place: item.place,
        sourceDate: item.date,
        targetDate,
        targetReportDateId: null,
        targetPlace: null,
        action: 'CREATE' as const,
        reason: null,
      };
    })
    .sort((left, right) => {
      const bySemester = left.semester.localeCompare(right.semester, 'id');
      if (bySemester !== 0) return bySemester;
      return left.reportType.localeCompare(right.reportType, 'id');
    });

  return {
    key: 'reportDates',
    label: 'Tanggal Rapor',
    description: 'Clone tanggal rapor tahunan berdasarkan semester dan tipe rapor tanpa menimpa target yang sudah ada.',
    selectedByDefault: true,
    ready: true,
    summary: {
      sourceItems: items.length,
      createCount: items.filter((item) => item.action === 'CREATE').length,
      existingCount: items.filter((item) => item.action === 'SKIP_EXISTING').length,
      skipOutsideTargetRangeCount: items.filter((item) => item.action === 'SKIP_OUTSIDE_TARGET_RANGE').length,
    },
    errors: [],
    warnings: items.length === 0 ? ['Tahun sumber belum memiliki tanggal rapor yang bisa diclone.'] : [],
    items,
  };
}

function buildEffectiveSourceSubjectKkms(
  sourceSubjectKkms: LoadedRolloverContext['sourceSubjectKkms'],
): RolloverSubjectKkmPlanItem[] {
  const yearlyMap = new Map(
    sourceSubjectKkms
      .filter((item) => item.academicYearId !== null)
      .map((item) => [`${item.subjectId}-${normalizeLevel(item.classLevel)}`, item]),
  );
  const globalRows = sourceSubjectKkms.filter((item) => item.academicYearId === null);
  const merged = [...yearlyMap.values()];

  globalRows.forEach((item) => {
    const key = `${item.subjectId}-${normalizeLevel(item.classLevel)}`;
    if (!yearlyMap.has(key)) {
      merged.push(item);
    }
  });

  return merged
    .map((item) => ({
      sourceSubjectKkmId: item.id,
      sourceAcademicYearId: item.academicYearId,
      sourceScope: item.academicYearId ? ('ACADEMIC_YEAR' as const) : ('GLOBAL_FALLBACK' as const),
      subject: {
        id: item.subject.id,
        code: item.subject.code,
        name: item.subject.name,
      },
      classLevel: normalizeLevel(item.classLevel),
      sourceKkm: item.kkm,
      targetSubjectKkmId: null,
      targetKkm: null,
      action: 'CREATE' as const,
      reason: item.academicYearId
        ? null
        : 'KKM ini diambil dari data global karena tahun sumber belum memiliki versi tahunan untuk kombinasi mapel-level tersebut.',
    }))
    .sort((left, right) => {
      const bySubject = left.subject.code.localeCompare(right.subject.code, 'id');
      if (bySubject !== 0) return bySubject;
      return left.classLevel.localeCompare(right.classLevel, 'id');
    });
}

function getSubjectKkmPlan(
  sourceSubjectKkms: LoadedRolloverContext['sourceSubjectKkms'],
  targetSubjectKkms: LoadedRolloverContext['targetSubjectKkms'],
): RolloverWorkspace['components']['subjectKkms'] {
  const effectiveSourceRows = buildEffectiveSourceSubjectKkms(sourceSubjectKkms);
  const targetByKey = new Map(
    targetSubjectKkms
      .filter((item) => item.academicYearId !== null)
      .map((item) => [`${item.subjectId}-${normalizeLevel(item.classLevel)}`, item]),
  );

  const items = effectiveSourceRows.map((item) => {
    const key = `${item.subject.id}-${item.classLevel}`;
    const existingTarget = targetByKey.get(key) || null;
    return {
      ...item,
      targetSubjectKkmId: existingTarget?.id || null,
      targetKkm: existingTarget?.kkm || null,
      action: existingTarget ? ('SKIP_EXISTING' as const) : ('CREATE' as const),
      reason: existingTarget
        ? 'KKM target untuk mapel-level ini sudah ada sehingga wizard tidak menimpanya.'
        : item.reason,
    };
  });

  const createCount = items.filter((item) => item.action === 'CREATE').length;
  const existingCount = items.length - createCount;
  const globalFallbackCount = items.filter((item) => item.sourceScope === 'GLOBAL_FALLBACK').length;
  const warnings: string[] = [];

  if (globalFallbackCount > 0) {
    warnings.push(
      `${globalFallbackCount} KKM memakai fallback data global karena source year belum punya versi tahunan lengkap.`,
    );
  }
  if (items.length === 0) {
    warnings.push('Tahun sumber belum memiliki data KKM yang bisa diclone.');
  }

  return {
    key: 'subjectKkms',
    label: 'KKM Tahunan',
    description: 'Clone KKM mapel per level ke tahun target tanpa menimpa KKM target yang sudah ada.',
    selectedByDefault: true,
    ready: true,
    summary: {
      sourceItems: items.length,
      createCount,
      existingCount,
      globalFallbackCount,
    },
    errors: [],
    warnings,
    items,
  };
}

function getExamGradeComponentPlan(
  sourceComponents: LoadedRolloverContext['sourceExamGradeComponents'],
  targetComponents: LoadedRolloverContext['targetExamGradeComponents'],
): RolloverWorkspace['components']['examGradeComponents'] {
  const targetByCode = new Map(targetComponents.map((item) => [item.code, item]));
  const items: RolloverExamGradeComponentPlanItem[] = sourceComponents
    .map((item) => {
      const existingTarget = targetByCode.get(item.code) || null;
      return {
        sourceComponentId: item.id,
        code: item.code,
        label: item.label,
        type: item.typeCode || item.type,
        entryMode: item.entryModeCode || item.entryMode,
        reportSlot: item.reportSlotCode || item.reportSlot,
        includeInFinalScore: item.includeInFinalScore,
        targetComponentId: existingTarget?.id || null,
        action: existingTarget ? ('SKIP_EXISTING' as const) : ('CREATE' as const),
        reason: existingTarget
          ? 'Komponen nilai target dengan kode yang sama sudah ada, jadi wizard tidak menimpanya.'
          : null,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code, 'id'));

  return {
    key: 'examGradeComponents',
    label: 'Komponen Nilai Ujian',
    description: 'Clone master komponen nilai ujian ke target year secara additive.',
    selectedByDefault: true,
    ready: true,
    summary: {
      sourceItems: items.length,
      createCount: items.filter((item) => item.action === 'CREATE').length,
      existingCount: items.filter((item) => item.action === 'SKIP_EXISTING').length,
    },
    errors: [],
    warnings: items.length === 0 ? ['Tahun sumber belum memiliki master komponen nilai ujian.'] : [],
    items,
  };
}

function getExamProgramConfigPlan(
  sourcePrograms: LoadedRolloverContext['sourceExamProgramConfigs'],
  targetPrograms: LoadedRolloverContext['targetExamProgramConfigs'],
  sourceComponents: LoadedRolloverContext['sourceExamGradeComponents'],
  targetComponents: LoadedRolloverContext['targetExamGradeComponents'],
): RolloverWorkspace['components']['examProgramConfigs'] {
  const targetByCode = new Map(targetPrograms.map((item) => [item.code, item]));
  const sourceComponentCodes = new Set(sourceComponents.map((item) => item.code));
  const targetComponentCodes = new Set(targetComponents.map((item) => item.code));
  const warnings: string[] = [];
  const errors: string[] = [];

  const items: RolloverExamProgramConfigPlanItem[] = sourcePrograms
    .map((item) => {
      const existingTarget = targetByCode.get(item.code) || null;
      const targetHasGradeComponent =
        targetComponentCodes.has(item.gradeComponentCode) || sourceComponentCodes.has(item.gradeComponentCode);
      if (!targetHasGradeComponent) {
        errors.push(
          `Program ujian "${item.code}" memakai komponen nilai "${item.gradeComponentCode}" yang tidak tersedia di source maupun target.`,
        );
      } else if (!targetComponentCodes.has(item.gradeComponentCode)) {
        warnings.push(
          `Program "${item.code}" bergantung pada komponen "${item.gradeComponentCode}" yang perlu ikut diclone ke target year.`,
        );
      }

      return {
        sourceProgramId: item.id,
        code: item.code,
        displayLabel: item.displayLabel,
        baseType: item.baseTypeCode || item.baseType,
        fixedSemester: item.fixedSemester,
        gradeComponentCode: item.gradeComponentCode,
        targetProgramId: existingTarget?.id || null,
        targetHasGradeComponent,
        action: existingTarget ? ('SKIP_EXISTING' as const) : ('CREATE' as const),
        reason: existingTarget
          ? 'Program ujian target dengan kode yang sama sudah ada, jadi wizard tidak menimpanya.'
          : !targetComponentCodes.has(item.gradeComponentCode)
            ? 'Program ini membutuhkan komponen nilai yang sebaiknya ikut diclone.'
            : null,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code, 'id'));

  return {
    key: 'examProgramConfigs',
    label: 'Program Ujian',
    description: 'Clone konfigurasi program ujian ke target year secara additive.',
    selectedByDefault: true,
    ready: errors.length === 0,
    summary: {
      sourceItems: items.length,
      createCount: items.filter((item) => item.action === 'CREATE').length,
      existingCount: items.filter((item) => item.action === 'SKIP_EXISTING').length,
      missingGradeComponentCount: items.filter((item) => !item.targetHasGradeComponent).length,
    },
    errors: [...new Set(errors)],
    warnings: items.length === 0
      ? ['Tahun sumber belum memiliki konfigurasi program ujian.']
      : [...new Set(warnings)],
    items,
  };
}

function getExamProgramSessionPlan(
  sourceSessions: LoadedRolloverContext['sourceExamProgramSessions'],
  targetSessions: LoadedRolloverContext['targetExamProgramSessions'],
  sourcePrograms: LoadedRolloverContext['sourceExamProgramConfigs'],
  targetPrograms: LoadedRolloverContext['targetExamProgramConfigs'],
): RolloverWorkspace['components']['examProgramSessions'] {
  const targetProgramCodes = new Set(targetPrograms.map((item) => item.code));
  const sourceProgramCodes = new Set(sourcePrograms.map((item) => item.code));
  const targetSessionByKey = new Map(
    targetSessions.map((item) => [`${item.programCode}::${item.normalizedLabel}`, item]),
  );

  const items: RolloverExamProgramSessionPlanItem[] = sourceSessions
    .map((item) => {
      const sessionKey = `${item.programCode}::${item.normalizedLabel}`;
      const existingTarget = targetSessionByKey.get(sessionKey) || null;
      const targetProgramAvailable = targetProgramCodes.has(item.programCode) || sourceProgramCodes.has(item.programCode);

      if (existingTarget) {
        return {
          sourceSessionId: item.id,
          programCode: item.programCode,
          label: item.label,
          normalizedLabel: item.normalizedLabel,
          displayOrder: item.displayOrder,
          targetSessionId: existingTarget.id,
          action: 'SKIP_EXISTING' as const,
          reason: 'Sesi program target dengan label yang sama sudah ada.',
        };
      }

      if (!targetProgramAvailable) {
        return {
          sourceSessionId: item.id,
          programCode: item.programCode,
          label: item.label,
          normalizedLabel: item.normalizedLabel,
          displayOrder: item.displayOrder,
          targetSessionId: null,
          action: 'SKIP_NO_TARGET_PROGRAM' as const,
          reason: 'Program ujian target belum tersedia untuk sesi ini.',
        };
      }

      return {
        sourceSessionId: item.id,
        programCode: item.programCode,
        label: item.label,
        normalizedLabel: item.normalizedLabel,
        displayOrder: item.displayOrder,
        targetSessionId: null,
        action: 'CREATE' as const,
        reason: !targetProgramCodes.has(item.programCode)
          ? 'Program ujian akan dibuat terlebih dahulu saat apply wizard.'
          : null,
      };
    })
    .sort((left, right) => {
      const byProgram = left.programCode.localeCompare(right.programCode, 'id');
      if (byProgram !== 0) return byProgram;
      return left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, 'id');
    });

  return {
    key: 'examProgramSessions',
    label: 'Sesi Program Ujian',
    description: 'Clone label sesi terjadwal per program ujian ke target year secara additive.',
    selectedByDefault: true,
    ready: true,
    summary: {
      sourceItems: items.length,
      createCount: items.filter((item) => item.action === 'CREATE').length,
      existingCount: items.filter((item) => item.action === 'SKIP_EXISTING').length,
      skipNoTargetProgramCount: items.filter((item) => item.action === 'SKIP_NO_TARGET_PROGRAM').length,
    },
    errors: [],
    warnings: items.some((item) => item.action === 'SKIP_NO_TARGET_PROGRAM')
      ? ['Beberapa sesi tidak bisa diclone sampai program ujian target tersedia.']
      : items.length === 0
        ? ['Tahun sumber belum memiliki sesi program ujian yang bisa diclone.']
        : [],
    items,
  };
}

async function loadAcademicYearRolloverContext(
  db: DbClient,
  sourceAcademicYearId: number,
  targetAcademicYearId: number,
): Promise<LoadedRolloverContext> {
  if (!Number.isFinite(sourceAcademicYearId) || sourceAcademicYearId <= 0) {
    throw new ApiError(400, 'Tahun ajaran sumber tidak valid.');
  }
  if (!Number.isFinite(targetAcademicYearId) || targetAcademicYearId <= 0) {
    throw new ApiError(400, 'Tahun ajaran target tidak valid.');
  }
  if (sourceAcademicYearId === targetAcademicYearId) {
    throw new ApiError(400, 'Tahun ajaran sumber dan target harus berbeda.');
  }

  const [
    sourceYear,
    targetYear,
    sourceAssignments,
    targetAssignments,
    sourceScheduleTimeConfig,
    targetScheduleTimeConfig,
    sourceAcademicEvents,
    targetAcademicEvents,
    sourceReportDates,
    targetReportDates,
    sourceSubjectKkms,
    targetSubjectKkms,
    sourceExamGradeComponents,
    targetExamGradeComponents,
    sourceExamProgramConfigs,
    targetExamProgramConfigs,
    sourceExamProgramSessions,
    targetExamProgramSessions,
  ] =
    await Promise.all([
      db.academicYear.findUnique({
        where: { id: sourceAcademicYearId },
        include: {
          classes: {
            orderBy: [{ level: 'asc' }, { major: { code: 'asc' } }, { name: 'asc' }],
            include: {
              major: {
                select: { id: true, code: true, name: true },
              },
              teacher: {
                select: { id: true, name: true, username: true },
              },
              students: {
                where: {
                  role: 'STUDENT',
                  studentStatus: 'ACTIVE',
                },
                select: { id: true },
              },
            },
          },
        },
      }),
      db.academicYear.findUnique({
        where: { id: targetAcademicYearId },
        include: {
          classes: {
            orderBy: [{ level: 'asc' }, { major: { code: 'asc' } }, { name: 'asc' }],
            include: {
              major: {
                select: { id: true, code: true, name: true },
              },
              teacher: {
                select: { id: true, name: true, username: true },
              },
              students: {
                where: {
                  role: 'STUDENT',
                  studentStatus: 'ACTIVE',
                },
                select: { id: true },
              },
            },
          },
        },
      }),
      db.teacherAssignment.findMany({
        where: {
          academicYearId: sourceAcademicYearId,
          class: {
            level: {
              in: ['X', 'XI'],
            },
          },
        },
        orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }, { teacher: { name: 'asc' } }],
        select: {
          id: true,
          teacherId: true,
          subjectId: true,
          classId: true,
          academicYearId: true,
          kkm: true,
          competencyThresholds: true,
          teacher: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
              level: true,
              major: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      db.teacherAssignment.findMany({
        where: {
          academicYearId: targetAcademicYearId,
        },
        select: {
          id: true,
          teacherId: true,
          subjectId: true,
          classId: true,
          academicYearId: true,
        },
      }),
      db.scheduleTimeConfig.findUnique({
        where: { academicYearId: sourceAcademicYearId },
        select: {
          id: true,
          academicYearId: true,
          config: true,
        },
      }),
      db.scheduleTimeConfig.findUnique({
        where: { academicYearId: targetAcademicYearId },
        select: {
          id: true,
          academicYearId: true,
          config: true,
        },
      }),
      (db as any).academicEvent.findMany({
        where: { academicYearId: sourceAcademicYearId },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          title: true,
          type: true,
          semester: true,
          isHoliday: true,
          description: true,
          startDate: true,
          endDate: true,
        },
      }),
      (db as any).academicEvent.findMany({
        where: { academicYearId: targetAcademicYearId },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          title: true,
          type: true,
          startDate: true,
          endDate: true,
        },
      }),
      db.reportDate.findMany({
        where: { academicYearId: sourceAcademicYearId },
        orderBy: [{ semester: 'asc' }, { reportType: 'asc' }, { date: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          semester: true,
          reportType: true,
          place: true,
          date: true,
        },
      }),
      db.reportDate.findMany({
        where: { academicYearId: targetAcademicYearId },
        orderBy: [{ semester: 'asc' }, { reportType: 'asc' }, { date: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          semester: true,
          reportType: true,
          place: true,
          date: true,
        },
      }),
      db.subjectKKM.findMany({
        where: {
          OR: [
            { academicYearId: sourceAcademicYearId },
            { academicYearId: null },
          ],
        },
        orderBy: [{ subject: { code: 'asc' } }, { classLevel: 'asc' }],
        select: {
          id: true,
          subjectId: true,
          academicYearId: true,
          classLevel: true,
          kkm: true,
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      db.subjectKKM.findMany({
        where: {
          academicYearId: targetAcademicYearId,
        },
        orderBy: [{ subject: { code: 'asc' } }, { classLevel: 'asc' }],
        select: {
          id: true,
          subjectId: true,
          academicYearId: true,
          classLevel: true,
          kkm: true,
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      db.examGradeComponent.findMany({
        where: { academicYearId: sourceAcademicYearId },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          code: true,
          label: true,
          type: true,
          typeCode: true,
          entryMode: true,
          entryModeCode: true,
          reportSlot: true,
          reportSlotCode: true,
          includeInFinalScore: true,
          description: true,
          displayOrder: true,
          isActive: true,
        },
      }),
      db.examGradeComponent.findMany({
        where: { academicYearId: targetAcademicYearId },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          code: true,
          label: true,
          type: true,
          typeCode: true,
          entryMode: true,
          entryModeCode: true,
          reportSlot: true,
          reportSlotCode: true,
          includeInFinalScore: true,
          description: true,
          displayOrder: true,
          isActive: true,
        },
      }),
      db.examProgramConfig.findMany({
        where: { academicYearId: sourceAcademicYearId },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          code: true,
          baseType: true,
          baseTypeCode: true,
          gradeComponentType: true,
          gradeComponentTypeCode: true,
          gradeComponentCode: true,
          gradeComponentLabel: true,
          gradeEntryMode: true,
          gradeEntryModeCode: true,
          displayLabel: true,
          shortLabel: true,
          description: true,
          fixedSemester: true,
          displayOrder: true,
          isActive: true,
          showOnTeacherMenu: true,
          showOnStudentMenu: true,
          targetClassLevels: true,
          allowedSubjectIds: true,
          allowedAuthorIds: true,
          studentResultPublishMode: true,
          studentResultPublishAt: true,
          financeClearanceMode: true,
          financeMinOutstandingAmount: true,
          financeMinOverdueInvoices: true,
          financeClearanceNotes: true,
        },
      }),
      db.examProgramConfig.findMany({
        where: { academicYearId: targetAcademicYearId },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          code: true,
          baseType: true,
          baseTypeCode: true,
          gradeComponentType: true,
          gradeComponentTypeCode: true,
          gradeComponentCode: true,
          gradeComponentLabel: true,
          gradeEntryMode: true,
          gradeEntryModeCode: true,
          displayLabel: true,
          shortLabel: true,
          description: true,
          fixedSemester: true,
          displayOrder: true,
          isActive: true,
          showOnTeacherMenu: true,
          showOnStudentMenu: true,
          targetClassLevels: true,
          allowedSubjectIds: true,
          allowedAuthorIds: true,
          studentResultPublishMode: true,
          studentResultPublishAt: true,
          financeClearanceMode: true,
          financeMinOutstandingAmount: true,
          financeMinOverdueInvoices: true,
          financeClearanceNotes: true,
        },
      }),
      db.examProgramSession.findMany({
        where: { academicYearId: sourceAcademicYearId },
        orderBy: [{ programCode: 'asc' }, { displayOrder: 'asc' }, { label: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          programCode: true,
          label: true,
          normalizedLabel: true,
          displayOrder: true,
          isActive: true,
        },
      }),
      db.examProgramSession.findMany({
        where: { academicYearId: targetAcademicYearId },
        orderBy: [{ programCode: 'asc' }, { displayOrder: 'asc' }, { label: 'asc' }],
        select: {
          id: true,
          academicYearId: true,
          programCode: true,
          label: true,
          normalizedLabel: true,
          displayOrder: true,
          isActive: true,
        },
      }),
    ]);

  if (!sourceYear) {
    throw new ApiError(404, 'Tahun ajaran sumber tidak ditemukan.');
  }
  if (!targetYear) {
    throw new ApiError(404, 'Tahun ajaran target tidak ditemukan.');
  }

  return {
    sourceYear,
    targetYear,
    sourceAssignments,
    targetAssignments,
    sourceScheduleTimeConfig,
    targetScheduleTimeConfig,
    sourceAcademicEvents,
    targetAcademicEvents,
    sourceReportDates,
    targetReportDates,
    sourceSubjectKkms,
    targetSubjectKkms,
    sourceExamGradeComponents,
    targetExamGradeComponents,
    sourceExamProgramConfigs,
    targetExamProgramConfigs,
    sourceExamProgramSessions,
    targetExamProgramSessions,
  };
}

function buildAcademicYearRolloverWorkspace(context: LoadedRolloverContext): RolloverWorkspace {
  const targetDraftSuggestion = deriveTargetAcademicYearTimeline(context.sourceYear);
  const classPreparation = getTargetClassPlan(context.sourceYear.classes, context.targetYear.classes);
  const teacherAssignments = getTeacherAssignmentPlan(
    context.sourceAssignments,
    classPreparation,
    context.targetAssignments,
  );
  const scheduleTimeConfig = getScheduleTimeConfigPlan(
    context.sourceScheduleTimeConfig,
    context.targetScheduleTimeConfig,
    context.targetYear.id,
  );
  const academicEvents = getAcademicEventPlan(
    context.sourceYear,
    context.targetYear,
    context.sourceAcademicEvents,
    context.targetAcademicEvents,
  );
  const reportDates = getReportDatePlan(
    context.sourceYear,
    context.targetYear,
    context.sourceReportDates,
    context.targetReportDates,
  );
  const subjectKkms = getSubjectKkmPlan(
    context.sourceSubjectKkms,
    context.targetSubjectKkms,
  );
  const examGradeComponents = getExamGradeComponentPlan(
    context.sourceExamGradeComponents,
    context.targetExamGradeComponents,
  );
  const examProgramConfigs = getExamProgramConfigPlan(
    context.sourceExamProgramConfigs,
    context.targetExamProgramConfigs,
    context.sourceExamGradeComponents,
    context.targetExamGradeComponents,
  );
  const examProgramSessions = getExamProgramSessionPlan(
    context.sourceExamProgramSessions,
    context.targetExamProgramSessions,
    context.sourceExamProgramConfigs,
    context.targetExamProgramConfigs,
  );

  const errors = [
    ...classPreparation.errors,
    ...teacherAssignments.errors,
    ...scheduleTimeConfig.errors,
    ...academicEvents.errors,
    ...reportDates.errors,
    ...subjectKkms.errors,
    ...examGradeComponents.errors,
    ...examProgramConfigs.errors,
    ...examProgramSessions.errors,
  ];
  const warnings = [
    ...classPreparation.warnings,
    ...teacherAssignments.warnings,
    ...scheduleTimeConfig.warnings,
    ...academicEvents.warnings,
    ...reportDates.warnings,
    ...subjectKkms.warnings,
    ...examGradeComponents.warnings,
    ...examProgramConfigs.warnings,
    ...examProgramSessions.warnings,
  ];
  if (context.targetYear.isActive) {
    warnings.push(
      'Tahun ajaran target sudah aktif. Pastikan setup tahunan dan promotion memang dijalankan pada jendela operasional yang disetujui.',
    );
  }

  return {
    sourceAcademicYear: {
      id: context.sourceYear.id,
      name: context.sourceYear.name,
      isActive: context.sourceYear.isActive,
      semester1Start: context.sourceYear.semester1Start,
      semester1End: context.sourceYear.semester1End,
      semester2Start: context.sourceYear.semester2Start,
      semester2End: context.sourceYear.semester2End,
    },
    targetAcademicYear: {
      id: context.targetYear.id,
      name: context.targetYear.name,
      isActive: context.targetYear.isActive,
      semester1Start: context.targetYear.semester1Start,
      semester1End: context.targetYear.semester1End,
      semester2Start: context.targetYear.semester2Start,
      semester2End: context.targetYear.semester2End,
    },
    targetDraftSuggestion,
    validation: {
      readyToApply: errors.length === 0,
      errors,
      warnings,
    },
    components: {
      classPreparation,
      teacherAssignments,
      scheduleTimeConfig,
      academicEvents,
      reportDates,
      subjectKkms,
      examGradeComponents,
      examProgramConfigs,
      examProgramSessions,
    },
    notes: [
      'Mapel dan kategori mapel tetap global, jadi tidak di-clone per tahun ajaran.',
      'Wizard ini additive: hanya membuat data target yang belum ada dan tidak memindahkan histori nilai/absensi/rapor.',
      'Wali kelas source dibawa default ke kelas target baru, tetapi kelas target yang sudah punya wali kelas tetap dipertahankan.',
      'Tanggal rapor diclone secara additive berdasarkan semester dan tipe rapor tanpa menimpa target yang sudah disusun manual.',
      'Jalankan promotion setelah target year dan komponen tahunan siap.',
    ],
  };
}

export async function createAcademicYearRolloverTarget(params: {
  sourceAcademicYearId: number;
  payload?: RolloverCreateTargetPayload;
}) {
  const sourceYear = await prisma.academicYear.findUnique({
    where: { id: params.sourceAcademicYearId },
  });

  if (!sourceYear) {
    throw new ApiError(404, 'Tahun ajaran sumber tidak ditemukan.');
  }

  const derived = deriveTargetAcademicYearTimeline(sourceYear);
  const desiredName = String(params.payload?.name || derived.name).trim();
  const semester1Start = params.payload?.semester1Start || derived.semester1Start;
  const semester1End = params.payload?.semester1End || derived.semester1End;
  const semester2Start = params.payload?.semester2Start || derived.semester2Start;
  const semester2End = params.payload?.semester2End || derived.semester2End;

  if (!desiredName) {
    throw new ApiError(400, 'Nama tahun ajaran target wajib diisi.');
  }
  if (semester1Start >= semester1End) {
    throw new ApiError(400, 'Semester 1 target harus memiliki rentang tanggal yang valid.');
  }
  if (semester2Start >= semester2End) {
    throw new ApiError(400, 'Semester 2 target harus memiliki rentang tanggal yang valid.');
  }
  if (semester1End >= semester2Start) {
    throw new ApiError(400, 'Semester 1 target harus berakhir sebelum Semester 2 dimulai.');
  }

  const existing = await prisma.academicYear.findFirst({
    where: { name: desiredName },
  });

  if (existing) {
    return {
      created: false,
      targetAcademicYear: {
        id: existing.id,
        name: existing.name,
        isActive: existing.isActive,
        semester1Start: existing.semester1Start,
        semester1End: existing.semester1End,
        semester2Start: existing.semester2Start,
        semester2End: existing.semester2End,
      },
      targetDraftSuggestion: derived,
      notes: [
        'Draft target year dengan nama yang sama sudah ada, sehingga wizard memakai data yang sudah tersedia.',
      ],
    } satisfies CreateRolloverTargetResult;
  }

  const created = await prisma.academicYear.create({
    data: {
      name: desiredName,
      isActive: false,
      semester1Start,
      semester1End,
      semester2Start,
      semester2End,
      pklEligibleGrades: sourceYear.pklEligibleGrades,
    } as any,
  });

  return {
    created: true,
    targetAcademicYear: {
      id: created.id,
      name: created.name,
      isActive: created.isActive,
      semester1Start: created.semester1Start,
      semester1End: created.semester1End,
      semester2Start: created.semester2Start,
      semester2End: created.semester2End,
    },
    targetDraftSuggestion: derived,
    notes: [
      'Draft target year berhasil dibuat dalam status nonaktif.',
      'Timeline target masih bisa diedit lewat form tahun ajaran sebelum dipakai untuk promotion.',
    ],
  } satisfies CreateRolloverTargetResult;
}

export async function getAcademicYearRolloverWorkspace(
  sourceAcademicYearId: number,
  targetAcademicYearId: number,
) {
  const context = await loadAcademicYearRolloverContext(prisma, sourceAcademicYearId, targetAcademicYearId);
  return buildAcademicYearRolloverWorkspace(context);
}

export async function applyAcademicYearRollover(params: {
  sourceAcademicYearId: number;
  targetAcademicYearId: number;
  components?: Partial<AcademicYearRolloverComponentSelection> | null;
  actor?: RolloverActor;
}) {
  const selectedComponents = normalizeComponentSelection(params.components);
  if (!Object.values(selectedComponents).some(Boolean)) {
    throw new ApiError(400, 'Pilih minimal satu komponen untuk di-clone.');
  }

  return prisma.$transaction(async (tx) => {
    const contextBefore = await loadAcademicYearRolloverContext(
      tx,
      params.sourceAcademicYearId,
      params.targetAcademicYearId,
    );
    const workspaceBefore = buildAcademicYearRolloverWorkspace(contextBefore);

    if (!workspaceBefore.validation.readyToApply) {
      throw new ApiError(400, 'Workspace rollover masih memiliki error dan belum bisa di-apply.');
    }

    const applied = {
      classPreparation: {
        created: 0,
        skippedExisting: 0,
        homeroomCarriedOnCreate: 0,
        homeroomFilledExisting: 0,
        homeroomKeptExisting: 0,
        homeroomMissingSource: 0,
      },
      teacherAssignments: {
        created: 0,
        skippedExisting: 0,
        skippedNoTargetClass: 0,
      },
      scheduleTimeConfig: {
        created: 0,
        skippedExisting: 0,
        skippedNoSource: 0,
      },
      academicEvents: {
        created: 0,
        skippedExisting: 0,
        skippedOutsideTargetRange: 0,
      },
      reportDates: {
        created: 0,
        skippedExisting: 0,
        skippedOutsideTargetRange: 0,
      },
      subjectKkms: {
        created: 0,
        skippedExisting: 0,
        globalFallbackCount: 0,
      },
      examGradeComponents: {
        created: 0,
        skippedExisting: 0,
      },
      examProgramConfigs: {
        created: 0,
        skippedExisting: 0,
        missingGradeComponentCount: 0,
      },
      examProgramSessions: {
        created: 0,
        skippedExisting: 0,
        skippedNoTargetProgram: 0,
      },
    };

    if (selectedComponents.classPreparation) {
      const classItemsToCreate = workspaceBefore.components.classPreparation.items.filter(
        (item) => item.action === 'CREATE',
      );

      if (classItemsToCreate.length > 0) {
        await tx.class.createMany({
          data: classItemsToCreate.map((item) => ({
            name: item.targetClassName,
            level: item.targetLevel,
            majorId: item.major.id,
            academicYearId: params.targetAcademicYearId,
            teacherId: item.sourceHomeroomTeacher?.id || null,
            presidentId: null,
          })),
        });
      }

      const existingClassItemsToFill = workspaceBefore.components.classPreparation.items.filter(
        (item) => item.homeroomAction === 'FILL_EXISTING_EMPTY' && item.targetClassId && item.sourceHomeroomTeacher?.id,
      );
      for (const item of existingClassItemsToFill) {
        const updated = await tx.class.updateMany({
          where: {
            id: item.targetClassId!,
            academicYearId: params.targetAcademicYearId,
            teacherId: null,
          },
          data: {
            teacherId: item.sourceHomeroomTeacher!.id,
          },
        });
        applied.classPreparation.homeroomFilledExisting += updated.count;
      }

      applied.classPreparation.created = classItemsToCreate.length;
      applied.classPreparation.skippedExisting =
        workspaceBefore.components.classPreparation.summary.existingCount;
      applied.classPreparation.homeroomCarriedOnCreate =
        workspaceBefore.components.classPreparation.summary.homeroomCarryCount;
      applied.classPreparation.homeroomKeptExisting =
        workspaceBefore.components.classPreparation.summary.homeroomKeepExistingCount;
      applied.classPreparation.homeroomMissingSource =
        workspaceBefore.components.classPreparation.summary.homeroomMissingSourceCount;
    }

    const contextAfterClasses = await loadAcademicYearRolloverContext(
      tx,
      params.sourceAcademicYearId,
      params.targetAcademicYearId,
    );
    const workspaceAfterClasses = buildAcademicYearRolloverWorkspace(contextAfterClasses);

    if (selectedComponents.teacherAssignments) {
      const assignmentsToCreate = workspaceAfterClasses.components.teacherAssignments.items.filter(
        (item) => item.action === 'CREATE' && item.targetClassId,
      );
      const sourceAssignmentById = new Map(
        contextAfterClasses.sourceAssignments.map((item) => [item.id, item]),
      );

      if (assignmentsToCreate.length > 0) {
        await tx.teacherAssignment.createMany({
          data: assignmentsToCreate.map((item) => {
            const sourceAssignment = sourceAssignmentById.get(item.sourceAssignmentId);
            if (!sourceAssignment || !item.targetClassId) {
              throw new ApiError(500, 'Assignment source tidak ditemukan saat apply rollover.');
            }

            return {
              teacherId: sourceAssignment.teacherId,
              subjectId: sourceAssignment.subjectId,
              classId: item.targetClassId,
              academicYearId: params.targetAcademicYearId,
              kkm: sourceAssignment.kkm,
              competencyThresholds:
                sourceAssignment.competencyThresholds === null
                  ? Prisma.JsonNull
                  : (sourceAssignment.competencyThresholds as Prisma.InputJsonValue),
            };
          }),
        });
      }

      applied.teacherAssignments.created = assignmentsToCreate.length;
      applied.teacherAssignments.skippedExisting =
        workspaceAfterClasses.components.teacherAssignments.summary.existingCount;
      applied.teacherAssignments.skippedNoTargetClass =
        workspaceAfterClasses.components.teacherAssignments.summary.skipNoTargetClassCount;
    }

    const workspaceAfterAssignments = buildAcademicYearRolloverWorkspace(
      await loadAcademicYearRolloverContext(tx, params.sourceAcademicYearId, params.targetAcademicYearId),
    );

    if (selectedComponents.scheduleTimeConfig) {
      const schedulePlan = workspaceAfterAssignments.components.scheduleTimeConfig;

      if (schedulePlan.item.action === 'CREATE') {
        await tx.scheduleTimeConfig.create({
          data: {
            academicYearId: params.targetAcademicYearId,
            config: contextAfterClasses.sourceScheduleTimeConfig?.config as Prisma.InputJsonValue,
          },
        });
        applied.scheduleTimeConfig.created = 1;
      } else if (schedulePlan.item.action === 'SKIP_EXISTING') {
        applied.scheduleTimeConfig.skippedExisting = 1;
      } else {
        applied.scheduleTimeConfig.skippedNoSource = 1;
      }
    }

    const workspaceAfterSchedule = buildAcademicYearRolloverWorkspace(
      await loadAcademicYearRolloverContext(tx, params.sourceAcademicYearId, params.targetAcademicYearId),
    );

    if (selectedComponents.academicEvents) {
      const eventItemsToCreate = workspaceAfterSchedule.components.academicEvents.items.filter(
        (item) => item.action === 'CREATE' && item.targetStartDate && item.targetEndDate,
      );
      const sourceEventById = new Map(
        contextAfterClasses.sourceAcademicEvents.map((item) => [item.id, item]),
      );

      if (eventItemsToCreate.length > 0) {
        await (tx as any).academicEvent.createMany({
          data: eventItemsToCreate.map((item) => {
            const sourceEvent = sourceEventById.get(item.sourceEventId);
            if (!sourceEvent || !item.targetStartDate || !item.targetEndDate) {
              throw new ApiError(500, 'Event source tidak ditemukan saat apply rollover.');
            }

            return {
              academicYearId: params.targetAcademicYearId,
              title: sourceEvent.title,
              type: sourceEvent.type,
              startDate: item.targetStartDate,
              endDate: item.targetEndDate,
              semester: sourceEvent.semester,
              isHoliday: sourceEvent.isHoliday,
              description: sourceEvent.description,
            };
          }),
        });
      }

      applied.academicEvents.created = eventItemsToCreate.length;
      applied.academicEvents.skippedExisting =
        workspaceAfterSchedule.components.academicEvents.summary.existingCount;
      applied.academicEvents.skippedOutsideTargetRange =
        workspaceAfterSchedule.components.academicEvents.summary.skipOutsideTargetRangeCount;
    }

    const workspaceAfterEvents = buildAcademicYearRolloverWorkspace(
      await loadAcademicYearRolloverContext(tx, params.sourceAcademicYearId, params.targetAcademicYearId),
    );

    if (selectedComponents.reportDates) {
      const reportDateItemsToCreate = workspaceAfterEvents.components.reportDates.items.filter(
        (item) => item.action === 'CREATE' && item.targetDate,
      );
      const sourceReportDateById = new Map(
        contextAfterClasses.sourceReportDates.map((item) => [item.id, item]),
      );

      if (reportDateItemsToCreate.length > 0) {
        await tx.reportDate.createMany({
          data: reportDateItemsToCreate.map((item) => {
            const sourceReportDate = sourceReportDateById.get(item.sourceReportDateId);
            if (!sourceReportDate || !item.targetDate) {
              throw new ApiError(500, 'Tanggal rapor source tidak ditemukan saat apply rollover.');
            }

            return {
              academicYearId: params.targetAcademicYearId,
              semester: sourceReportDate.semester as any,
              reportType: sourceReportDate.reportType as any,
              place: sourceReportDate.place,
              date: item.targetDate,
            };
          }),
          skipDuplicates: true,
        });
      }

      applied.reportDates.created = reportDateItemsToCreate.length;
      applied.reportDates.skippedExisting =
        workspaceAfterEvents.components.reportDates.summary.existingCount;
      applied.reportDates.skippedOutsideTargetRange =
        workspaceAfterEvents.components.reportDates.summary.skipOutsideTargetRangeCount;
    }

    const workspaceAfterReportDates = buildAcademicYearRolloverWorkspace(
      await loadAcademicYearRolloverContext(tx, params.sourceAcademicYearId, params.targetAcademicYearId),
    );

    if (selectedComponents.subjectKkms) {
      const kkmItemsToCreate = workspaceAfterReportDates.components.subjectKkms.items.filter(
        (item) => item.action === 'CREATE',
      );

      if (kkmItemsToCreate.length > 0) {
        await tx.subjectKKM.createMany({
          data: kkmItemsToCreate.map((item) => ({
            subjectId: item.subject.id,
            classLevel: item.classLevel,
            kkm: item.sourceKkm,
            academicYearId: params.targetAcademicYearId,
          })),
          skipDuplicates: true,
        });
      }

      applied.subjectKkms.created = kkmItemsToCreate.length;
      applied.subjectKkms.skippedExisting =
        workspaceAfterReportDates.components.subjectKkms.summary.existingCount;
      applied.subjectKkms.globalFallbackCount =
        workspaceAfterReportDates.components.subjectKkms.summary.globalFallbackCount;
    }

    const workspaceAfterKkms = buildAcademicYearRolloverWorkspace(
      await loadAcademicYearRolloverContext(tx, params.sourceAcademicYearId, params.targetAcademicYearId),
    );

    if (selectedComponents.examGradeComponents) {
      const componentItemsToCreate = workspaceAfterKkms.components.examGradeComponents.items.filter(
        (item) => item.action === 'CREATE',
      );
      const sourceComponentById = new Map(
        contextBefore.sourceExamGradeComponents.map((item) => [item.id, item]),
      );

      if (componentItemsToCreate.length > 0) {
        await tx.examGradeComponent.createMany({
          data: componentItemsToCreate.map((item) => {
            const sourceComponent = sourceComponentById.get(item.sourceComponentId);
            if (!sourceComponent) {
              throw new ApiError(500, 'Komponen nilai source tidak ditemukan saat apply rollover.');
            }
            return {
              academicYearId: params.targetAcademicYearId,
              code: sourceComponent.code,
              label: sourceComponent.label,
              type: sourceComponent.type as any,
              typeCode: sourceComponent.typeCode,
              entryMode: sourceComponent.entryMode as any,
              entryModeCode: sourceComponent.entryModeCode,
              reportSlot: sourceComponent.reportSlot as any,
              reportSlotCode: sourceComponent.reportSlotCode,
              includeInFinalScore: sourceComponent.includeInFinalScore,
              description: sourceComponent.description,
              displayOrder: sourceComponent.displayOrder,
              isActive: sourceComponent.isActive,
            };
          }),
          skipDuplicates: true,
        });
      }

      applied.examGradeComponents.created = componentItemsToCreate.length;
      applied.examGradeComponents.skippedExisting =
        workspaceAfterKkms.components.examGradeComponents.summary.existingCount;
    }

    const contextAfterComponents = await loadAcademicYearRolloverContext(
      tx,
      params.sourceAcademicYearId,
      params.targetAcademicYearId,
    );
    const workspaceAfterComponents = buildAcademicYearRolloverWorkspace(contextAfterComponents);

    if (selectedComponents.examProgramConfigs) {
      const targetComponentCodes = new Set(
        contextAfterComponents.targetExamGradeComponents.map((item) => item.code),
      );
      const programItemsToCreate = workspaceAfterComponents.components.examProgramConfigs.items.filter(
        (item) => item.action === 'CREATE',
      );
      const sourceProgramById = new Map(
        contextAfterComponents.sourceExamProgramConfigs.map((item) => [item.id, item]),
      );

      const missingGradeComponentPrograms = programItemsToCreate.filter(
        (item) => !targetComponentCodes.has(item.gradeComponentCode),
      );
      if (missingGradeComponentPrograms.length > 0) {
        throw new ApiError(
          400,
          `Program ujian belum bisa diclone karena komponen nilai target belum tersedia: ${missingGradeComponentPrograms
            .map((item) => `${item.code}:${item.gradeComponentCode}`)
            .join(', ')}`,
        );
      }

      if (programItemsToCreate.length > 0) {
        await tx.examProgramConfig.createMany({
          data: programItemsToCreate.map((item) => {
            const sourceProgram = sourceProgramById.get(item.sourceProgramId);
            if (!sourceProgram) {
              throw new ApiError(500, 'Program ujian source tidak ditemukan saat apply rollover.');
            }
            return {
              academicYearId: params.targetAcademicYearId,
              code: sourceProgram.code,
              baseType: sourceProgram.baseType as any,
              baseTypeCode: sourceProgram.baseTypeCode,
              gradeComponentType: sourceProgram.gradeComponentType as any,
              gradeComponentTypeCode: sourceProgram.gradeComponentTypeCode,
              gradeComponentCode: sourceProgram.gradeComponentCode,
              gradeComponentLabel: sourceProgram.gradeComponentLabel,
              gradeEntryMode: sourceProgram.gradeEntryMode as any,
              gradeEntryModeCode: sourceProgram.gradeEntryModeCode,
              displayLabel: sourceProgram.displayLabel,
              shortLabel: sourceProgram.shortLabel,
              description: sourceProgram.description,
              fixedSemester: sourceProgram.fixedSemester as any,
              displayOrder: sourceProgram.displayOrder,
              isActive: sourceProgram.isActive,
              showOnTeacherMenu: sourceProgram.showOnTeacherMenu,
              showOnStudentMenu: sourceProgram.showOnStudentMenu,
              targetClassLevels: sourceProgram.targetClassLevels,
              allowedSubjectIds: sourceProgram.allowedSubjectIds,
              allowedAuthorIds: sourceProgram.allowedAuthorIds,
              studentResultPublishMode: sourceProgram.studentResultPublishMode,
              studentResultPublishAt: sourceProgram.studentResultPublishAt,
              financeClearanceMode: sourceProgram.financeClearanceMode,
              financeMinOutstandingAmount: sourceProgram.financeMinOutstandingAmount,
              financeMinOverdueInvoices: sourceProgram.financeMinOverdueInvoices,
              financeClearanceNotes: sourceProgram.financeClearanceNotes,
            };
          }),
          skipDuplicates: true,
        });
      }

      applied.examProgramConfigs.created = programItemsToCreate.length;
      applied.examProgramConfigs.skippedExisting =
        workspaceAfterComponents.components.examProgramConfigs.summary.existingCount;
      applied.examProgramConfigs.missingGradeComponentCount =
        workspaceAfterComponents.components.examProgramConfigs.summary.missingGradeComponentCount;
    }

    const contextAfterPrograms = await loadAcademicYearRolloverContext(
      tx,
      params.sourceAcademicYearId,
      params.targetAcademicYearId,
    );
    const workspaceAfterPrograms = buildAcademicYearRolloverWorkspace(contextAfterPrograms);

    if (selectedComponents.examProgramSessions) {
      const targetProgramCodes = new Set(
        contextAfterPrograms.targetExamProgramConfigs.map((item) => item.code),
      );
      const sessionItemsToCreate = workspaceAfterPrograms.components.examProgramSessions.items.filter(
        (item) => item.action === 'CREATE',
      );
      const sourceSessionById = new Map(
        contextAfterPrograms.sourceExamProgramSessions.map((item) => [item.id, item]),
      );

      const sessionsWithoutPrograms = sessionItemsToCreate.filter(
        (item) => !targetProgramCodes.has(item.programCode),
      );
      if (sessionsWithoutPrograms.length > 0) {
        throw new ApiError(
          400,
          `Sesi program ujian belum bisa diclone karena program target belum tersedia: ${sessionsWithoutPrograms
            .map((item) => `${item.programCode}:${item.label}`)
            .join(', ')}`,
        );
      }

      if (sessionItemsToCreate.length > 0) {
        await tx.examProgramSession.createMany({
          data: sessionItemsToCreate.map((item) => {
            const sourceSession = sourceSessionById.get(item.sourceSessionId);
            const normalizedLabel = sourceSession?.normalizedLabel || normalizeSessionLabelKey(sourceSession?.label);
            if (!sourceSession) {
              throw new ApiError(500, 'Sesi program ujian source tidak ditemukan saat apply rollover.');
            }
            if (!normalizedLabel) {
              throw new ApiError(500, 'Normalized label sesi program ujian source tidak valid.');
            }
            return {
              academicYearId: params.targetAcademicYearId,
              programCode: sourceSession.programCode,
              label: sourceSession.label,
              normalizedLabel,
              displayOrder: sourceSession.displayOrder,
              isActive: sourceSession.isActive,
            };
          }),
          skipDuplicates: true,
        });
      }

      applied.examProgramSessions.created = sessionItemsToCreate.length;
      applied.examProgramSessions.skippedExisting =
        workspaceAfterPrograms.components.examProgramSessions.summary.existingCount;
      applied.examProgramSessions.skippedNoTargetProgram =
        workspaceAfterPrograms.components.examProgramSessions.summary.skipNoTargetProgramCount;
    }

    const finalWorkspace = buildAcademicYearRolloverWorkspace(
      await loadAcademicYearRolloverContext(tx, params.sourceAcademicYearId, params.targetAcademicYearId),
    );

    return {
      targetAcademicYear: finalWorkspace.targetAcademicYear,
      applied,
      workspace: finalWorkspace,
    } satisfies ApplyAcademicYearRolloverResult;
  });
}
