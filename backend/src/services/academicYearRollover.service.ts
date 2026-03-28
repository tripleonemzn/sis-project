import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';

type DbClient = typeof prisma | Prisma.TransactionClient;

export type AcademicYearRolloverComponentSelection = {
  classPreparation: boolean;
  teacherAssignments: boolean;
  scheduleTimeConfig: boolean;
  academicEvents: boolean;
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
  };
  workspace: RolloverWorkspace;
};

const DEFAULT_COMPONENT_SELECTION: AcademicYearRolloverComponentSelection = {
  classPreparation: true,
  teacherAssignments: true,
  scheduleTimeConfig: true,
  academicEvents: true,
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
  const uniqueErrors = [...new Set(errors)];
  const warnings = [...warningSet];

  return {
    key: 'classPreparation',
    label: 'Kelas Target Promotion',
    description: 'Menyiapkan kelas XI/XII yang dibutuhkan untuk promotion dari kelas X/XI tahun sumber.',
    selectedByDefault: true,
    ready: uniqueErrors.length === 0,
    summary: {
      sourceItems: items.length,
      createCount,
      existingCount,
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

  const [sourceYear, targetYear, sourceAssignments, targetAssignments, sourceScheduleTimeConfig, targetScheduleTimeConfig, sourceAcademicEvents, targetAcademicEvents] =
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

  const errors = [
    ...classPreparation.errors,
    ...teacherAssignments.errors,
    ...scheduleTimeConfig.errors,
    ...academicEvents.errors,
  ];
  const warnings = [
    ...classPreparation.warnings,
    ...teacherAssignments.warnings,
    ...scheduleTimeConfig.warnings,
    ...academicEvents.warnings,
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
    },
    notes: [
      'Mapel dan kategori mapel tetap global, jadi tidak di-clone per tahun ajaran.',
      'Wizard ini additive: hanya membuat data target yang belum ada dan tidak memindahkan histori nilai/absensi/rapor.',
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
            teacherId: null,
            presidentId: null,
          })),
        });
      }

      applied.classPreparation.created = classItemsToCreate.length;
      applied.classPreparation.skippedExisting =
        workspaceBefore.components.classPreparation.summary.existingCount;
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
