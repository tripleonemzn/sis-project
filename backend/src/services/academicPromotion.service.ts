import {
  Prisma,
  PromotionAction,
  PromotionRunStatus,
  StudentAcademicMembershipStatus,
  StudentStatus,
} from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';

type DbClient = typeof prisma | Prisma.TransactionClient;

type PromotionMappingPayload = {
  sourceClassId: number;
  targetClassId: number | null;
};

type PromotionActor = {
  id?: number | null;
};

type LoadedYearClass = Prisma.ClassGetPayload<{
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

type LoadedPromotionContext = {
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
  savedMappings: Array<{
    sourceClassId: number;
    targetClassId: number | null;
    action: PromotionAction;
    sourceLevel: string;
    targetLevel: string | null;
  }>;
  recentRuns: Array<{
    id: number;
    status: PromotionRunStatus;
    totalClasses: number;
    totalStudents: number;
    promotedStudents: number;
    graduatedStudents: number;
    activateTargetYear: boolean;
    committedAt: Date | null;
    createdAt: Date;
    createdBy: {
      id: number;
      name: string;
      username: string;
    } | null;
  }>;
};

type PromotionWorkspaceClassInternal = {
  sourceClassId: number;
  sourceClassName: string;
  sourceLevel: string;
  studentCount: number;
  major: {
    id: number;
    code: string;
    name: string;
  };
  action: PromotionAction;
  expectedTargetLevel: string | null;
  targetClassId: number | null;
  targetClassName: string | null;
  suggestedTargetClassId: number | null;
  mappingSource: 'SAVED' | 'SUGGESTED' | 'EMPTY' | 'GRADUATE';
  targetCurrentStudentCount: number | null;
  targetOptions: Array<{
    id: number;
    name: string;
    level: string;
    currentStudentCount: number;
    major: {
      id: number;
      code: string;
      name: string;
    };
  }>;
  validation: {
    errors: string[];
    warnings: string[];
  };
  sourceStudentIds: number[];
};

type PromotionWorkspacePublicClass = Omit<PromotionWorkspaceClassInternal, 'sourceStudentIds'>;

type PromotionWorkspace = {
  sourceAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  targetAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  summary: {
    totalClasses: number;
    totalStudents: number;
    promotableClasses: number;
    graduatingClasses: number;
    promotedStudents: number;
    graduatedStudents: number;
    configuredPromoteClasses: number;
  };
  validation: {
    readyToCommit: boolean;
    errors: string[];
    warnings: string[];
  };
  classes: PromotionWorkspacePublicClass[];
  recentRuns: LoadedPromotionContext['recentRuns'];
};

type PreparedPromotionWorkspace = {
  context: LoadedPromotionContext;
  internalClasses: PromotionWorkspaceClassInternal[];
  workspace: PromotionWorkspace;
};

const PROMOTION_LEVELS = ['X', 'XI', 'XII'] as const;

function normalizeLevel(level?: string | null) {
  return String(level || '').trim().toUpperCase();
}

function getExpectedTargetLevel(level: string): string | null {
  if (level === 'X') return 'XI';
  if (level === 'XI') return 'XII';
  return null;
}

function normalizeBaseName(name: string, level: string) {
  return name.replace(new RegExp(`^${level}\\s+`, 'i'), '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getSuggestedTargetClass(sourceClass: LoadedYearClass, targetOptions: LoadedYearClass[]) {
  if (targetOptions.length === 1) {
    return targetOptions[0];
  }

  const sourceBaseName = normalizeBaseName(sourceClass.name, sourceClass.level);
  const matchedByBaseName = targetOptions.find(
    (targetClass) => normalizeBaseName(targetClass.name, targetClass.level) === sourceBaseName,
  );

  return matchedByBaseName || null;
}

async function loadPromotionContext(
  db: DbClient,
  sourceAcademicYearId: number,
  targetAcademicYearId: number,
): Promise<LoadedPromotionContext> {
  if (!Number.isFinite(sourceAcademicYearId) || sourceAcademicYearId <= 0) {
    throw new ApiError(400, 'Tahun ajaran sumber tidak valid');
  }
  if (!Number.isFinite(targetAcademicYearId) || targetAcademicYearId <= 0) {
    throw new ApiError(400, 'Tahun ajaran target tidak valid');
  }
  if (sourceAcademicYearId === targetAcademicYearId) {
    throw new ApiError(400, 'Tahun ajaran sumber dan target tidak boleh sama');
  }

  const [sourceYear, targetYear, savedMappings, recentRuns] = await Promise.all([
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
    db.promotionClassMapping.findMany({
      where: {
        sourceAcademicYearId,
        targetAcademicYearId,
      },
      select: {
        sourceClassId: true,
        targetClassId: true,
        action: true,
        sourceLevel: true,
        targetLevel: true,
      },
    }),
    db.promotionRun.findMany({
      where: {
        sourceAcademicYearId,
        targetAcademicYearId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        totalClasses: true,
        totalStudents: true,
        promotedStudents: true,
        graduatedStudents: true,
        activateTargetYear: true,
        committedAt: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    }),
  ]);

  if (!sourceYear) {
    throw new ApiError(404, 'Tahun ajaran sumber tidak ditemukan');
  }
  if (!targetYear) {
    throw new ApiError(404, 'Tahun ajaran target tidak ditemukan');
  }

  return {
    sourceYear,
    targetYear,
    savedMappings,
    recentRuns,
  };
}

function preparePromotionWorkspaceFromContext(context: LoadedPromotionContext): PreparedPromotionWorkspace {
  const { sourceYear, targetYear, savedMappings, recentRuns } = context;
  const savedMappingBySourceClassId = new Map(savedMappings.map((item) => [item.sourceClassId, item]));
  const targetClassById = new Map(targetYear.classes.map((item) => [item.id, item]));
  const sourceClasses = sourceYear.classes.filter((item) =>
    PROMOTION_LEVELS.includes(normalizeLevel(item.level) as (typeof PROMOTION_LEVELS)[number]),
  );

  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];
  const internalClasses: PromotionWorkspaceClassInternal[] = [];

  if (sourceClasses.length === 0) {
    globalWarnings.push('Belum ada kelas X, XI, atau XII pada tahun ajaran sumber.');
  }
  if (targetYear.classes.length === 0) {
    globalWarnings.push('Belum ada kelas pada tahun ajaran target.');
  }

  for (const sourceClass of sourceClasses) {
    const sourceLevel = normalizeLevel(sourceClass.level);
    const action = sourceLevel === 'XII' ? PromotionAction.GRADUATE : PromotionAction.PROMOTE;
    const expectedTargetLevel = action === PromotionAction.PROMOTE ? getExpectedTargetLevel(sourceLevel) : null;
    const targetOptions =
      action === PromotionAction.PROMOTE
        ? targetYear.classes.filter(
            (targetClass) =>
              normalizeLevel(targetClass.level) === expectedTargetLevel && targetClass.majorId === sourceClass.majorId,
          )
        : [];

    const suggestedTarget = action === PromotionAction.PROMOTE ? getSuggestedTargetClass(sourceClass, targetOptions) : null;
    const savedMapping = savedMappingBySourceClassId.get(sourceClass.id);
    const resolvedTargetClassId =
      action === PromotionAction.GRADUATE
        ? null
        : savedMapping?.targetClassId ?? suggestedTarget?.id ?? null;
    const resolvedTargetClass = resolvedTargetClassId ? targetClassById.get(resolvedTargetClassId) || null : null;
    const classErrors: string[] = [];
    const classWarnings: string[] = [];
    const studentCount = sourceClass.students.length;

    if (action === PromotionAction.PROMOTE) {
      if (!resolvedTargetClassId) {
        if (studentCount > 0) {
          classErrors.push('Kelas target belum dipilih.');
        } else {
          classWarnings.push('Kelas target belum dipilih, tetapi kelas sumber belum memiliki siswa aktif.');
        }
      } else if (!resolvedTargetClass) {
        classErrors.push('Kelas target tidak ditemukan pada tahun ajaran target.');
      } else {
        if (normalizeLevel(resolvedTargetClass.level) !== expectedTargetLevel) {
          classErrors.push(`Kelas target harus berada di tingkat ${expectedTargetLevel}.`);
        }
        if (resolvedTargetClass.majorId !== sourceClass.majorId) {
          classErrors.push('Jurusan kelas target harus sama dengan jurusan kelas sumber.');
        }
        if (studentCount > 0 && resolvedTargetClass.students.length > 0) {
          classErrors.push(
            `Kelas target ${resolvedTargetClass.name} sudah berisi ${resolvedTargetClass.students.length} siswa aktif.`,
          );
        }
      }

      if (targetOptions.length === 0) {
        if (studentCount > 0) {
          classErrors.push(`Belum ada kelas ${expectedTargetLevel} untuk jurusan ${sourceClass.major.code} di tahun target.`);
        } else {
          classWarnings.push(`Belum ada kelas ${expectedTargetLevel} untuk jurusan ${sourceClass.major.code} di tahun target.`);
        }
      }
    }

    internalClasses.push({
      sourceClassId: sourceClass.id,
      sourceClassName: sourceClass.name,
      sourceLevel,
      studentCount,
      major: {
        id: sourceClass.major.id,
        code: sourceClass.major.code,
        name: sourceClass.major.name,
      },
      action,
      expectedTargetLevel,
      targetClassId: resolvedTargetClass?.id || null,
      targetClassName: resolvedTargetClass?.name || null,
      suggestedTargetClassId: suggestedTarget?.id || null,
      mappingSource:
        action === PromotionAction.GRADUATE
          ? 'GRADUATE'
          : savedMapping?.targetClassId
            ? 'SAVED'
            : suggestedTarget?.id
              ? 'SUGGESTED'
              : 'EMPTY',
      targetCurrentStudentCount: resolvedTargetClass ? resolvedTargetClass.students.length : null,
      targetOptions: targetOptions.map((targetClass) => ({
        id: targetClass.id,
        name: targetClass.name,
        level: normalizeLevel(targetClass.level),
        currentStudentCount: targetClass.students.length,
        major: {
          id: targetClass.major.id,
          code: targetClass.major.code,
          name: targetClass.major.name,
        },
      })),
      validation: {
        errors: classErrors,
        warnings: classWarnings,
      },
      sourceStudentIds: sourceClass.students.map((student) => student.id),
    });
  }

  const duplicateTargetUsage = new Map<number, string[]>();
  for (const item of internalClasses) {
    if (item.action !== PromotionAction.PROMOTE || !item.targetClassId || item.studentCount <= 0) {
      continue;
    }
    const sources = duplicateTargetUsage.get(item.targetClassId) || [];
    sources.push(item.sourceClassName);
    duplicateTargetUsage.set(item.targetClassId, sources);
  }

  for (const item of internalClasses) {
    if (!item.targetClassId) continue;
    const sources = duplicateTargetUsage.get(item.targetClassId);
    if (sources && sources.length > 1) {
      item.validation.errors.push(
        `Kelas target dipakai ganda oleh beberapa kelas sumber: ${sources.join(', ')}.`,
      );
    }
  }

  const allClassErrors = internalClasses.flatMap((item) => item.validation.errors);
  const allClassWarnings = internalClasses.flatMap((item) => item.validation.warnings);
  globalErrors.push(...Array.from(new Set(allClassErrors)));
  globalWarnings.push(...Array.from(new Set(allClassWarnings)));

  const totalStudents = internalClasses.reduce((sum, item) => sum + item.studentCount, 0);
  const promotedStudents = internalClasses
    .filter((item) => item.action === PromotionAction.PROMOTE)
    .reduce((sum, item) => sum + item.studentCount, 0);
  const graduatedStudents = internalClasses
    .filter((item) => item.action === PromotionAction.GRADUATE)
    .reduce((sum, item) => sum + item.studentCount, 0);
  const configuredPromoteClasses = internalClasses.filter(
    (item) => item.action === PromotionAction.PROMOTE && !!item.targetClassId,
  ).length;

  const workspace: PromotionWorkspace = {
    sourceAcademicYear: {
      id: sourceYear.id,
      name: sourceYear.name,
      isActive: sourceYear.isActive,
    },
    targetAcademicYear: {
      id: targetYear.id,
      name: targetYear.name,
      isActive: targetYear.isActive,
    },
    summary: {
      totalClasses: internalClasses.length,
      totalStudents,
      promotableClasses: internalClasses.filter((item) => item.action === PromotionAction.PROMOTE).length,
      graduatingClasses: internalClasses.filter((item) => item.action === PromotionAction.GRADUATE).length,
      promotedStudents,
      graduatedStudents,
      configuredPromoteClasses,
    },
    validation: {
      readyToCommit: globalErrors.length === 0 && totalStudents > 0,
      errors: globalErrors,
      warnings: globalWarnings,
    },
    classes: internalClasses.map(({ sourceStudentIds, ...item }) => item),
    recentRuns,
  };

  return {
    context,
    internalClasses,
    workspace,
  };
}

async function preparePromotionWorkspace(
  db: DbClient,
  sourceAcademicYearId: number,
  targetAcademicYearId: number,
) {
  const context = await loadPromotionContext(db, sourceAcademicYearId, targetAcademicYearId);
  return preparePromotionWorkspaceFromContext(context);
}

export async function getAcademicPromotionWorkspace(sourceAcademicYearId: number, targetAcademicYearId: number) {
  const { workspace } = await preparePromotionWorkspace(prisma, sourceAcademicYearId, targetAcademicYearId);
  return workspace;
}

export async function saveAcademicPromotionMappings(params: {
  sourceAcademicYearId: number;
  targetAcademicYearId: number;
  mappings: PromotionMappingPayload[];
}) {
  const sourceAcademicYearId = Number(params.sourceAcademicYearId);
  const targetAcademicYearId = Number(params.targetAcademicYearId);
  const context = await loadPromotionContext(prisma, sourceAcademicYearId, targetAcademicYearId);

  const duplicateSourceClassIds = new Set<number>();
  const seenSourceClassIds = new Set<number>();
  for (const item of params.mappings) {
    if (seenSourceClassIds.has(item.sourceClassId)) {
      duplicateSourceClassIds.add(item.sourceClassId);
    }
    seenSourceClassIds.add(item.sourceClassId);
  }
  if (duplicateSourceClassIds.size > 0) {
    throw new ApiError(400, 'Payload mapping berisi kelas sumber yang duplikat');
  }

  const incomingMap = new Map(params.mappings.map((item) => [Number(item.sourceClassId), item.targetClassId]));
  const sourceClasses = context.sourceYear.classes.filter((item) =>
    PROMOTION_LEVELS.includes(normalizeLevel(item.level) as (typeof PROMOTION_LEVELS)[number]),
  );
  const sourceClassById = new Map(sourceClasses.map((item) => [item.id, item]));
  const targetClassById = new Map(context.targetYear.classes.map((item) => [item.id, item]));

  for (const item of params.mappings) {
    if (!sourceClassById.has(Number(item.sourceClassId))) {
      throw new ApiError(400, `Kelas sumber ${item.sourceClassId} tidak valid untuk promotion.`);
    }
    if (item.targetClassId != null && !targetClassById.has(Number(item.targetClassId))) {
      throw new ApiError(400, `Kelas target ${item.targetClassId} tidak ditemukan pada tahun ajaran target.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const eligibleSourceClassIds = sourceClasses.map((item) => item.id);

    await tx.promotionClassMapping.deleteMany({
      where: {
        sourceAcademicYearId,
        targetAcademicYearId,
        sourceClassId: {
          notIn: eligibleSourceClassIds.length > 0 ? eligibleSourceClassIds : [-1],
        },
      },
    });

    for (const sourceClass of sourceClasses) {
      const sourceLevel = normalizeLevel(sourceClass.level);
      const action = sourceLevel === 'XII' ? PromotionAction.GRADUATE : PromotionAction.PROMOTE;
      const expectedTargetLevel = action === PromotionAction.PROMOTE ? getExpectedTargetLevel(sourceLevel) : null;
      let targetClassId = incomingMap.get(sourceClass.id) ?? null;

      if (action === PromotionAction.GRADUATE) {
        targetClassId = null;
      }

      const targetClass = targetClassId ? targetClassById.get(targetClassId) || null : null;
      if (action === PromotionAction.PROMOTE && targetClass) {
        if (normalizeLevel(targetClass.level) !== expectedTargetLevel) {
          throw new ApiError(400, `Kelas ${targetClass.name} bukan tingkat ${expectedTargetLevel}.`);
        }
        if (targetClass.majorId !== sourceClass.majorId) {
          throw new ApiError(400, `Jurusan kelas target untuk ${sourceClass.name} harus sama dengan jurusan sumber.`);
        }
      }

      await tx.promotionClassMapping.upsert({
        where: {
          sourceAcademicYearId_targetAcademicYearId_sourceClassId: {
            sourceAcademicYearId,
            targetAcademicYearId,
            sourceClassId: sourceClass.id,
          },
        },
        create: {
          sourceAcademicYearId,
          targetAcademicYearId,
          sourceClassId: sourceClass.id,
          targetClassId,
          action,
          sourceLevel,
          targetLevel: expectedTargetLevel,
        },
        update: {
          targetClassId,
          action,
          sourceLevel,
          targetLevel: expectedTargetLevel,
        },
      });
    }
  });

  const { workspace } = await preparePromotionWorkspace(prisma, sourceAcademicYearId, targetAcademicYearId);
  return workspace;
}

export async function commitAcademicPromotion(params: {
  sourceAcademicYearId: number;
  targetAcademicYearId: number;
  activateTargetYear?: boolean;
  actor?: PromotionActor;
}) {
  const sourceAcademicYearId = Number(params.sourceAcademicYearId);
  const targetAcademicYearId = Number(params.targetAcademicYearId);
  const activateTargetYear = Boolean(params.activateTargetYear);
  const actorId = params.actor?.id && Number.isFinite(Number(params.actor.id)) ? Number(params.actor.id) : null;

  return prisma.$transaction(async (tx) => {
    const prepared = await preparePromotionWorkspace(tx, sourceAcademicYearId, targetAcademicYearId);
    const { workspace, internalClasses, context } = prepared;

    if (workspace.validation.errors.length > 0) {
      throw new ApiError(400, 'Promotion belum siap di-commit.', workspace.validation.errors);
    }
    if (workspace.summary.totalStudents <= 0) {
      throw new ApiError(400, 'Tidak ada siswa aktif yang dapat diproses.');
    }

    const now = new Date();
    const run = await tx.promotionRun.create({
      data: {
        sourceAcademicYearId,
        targetAcademicYearId,
        createdById: actorId,
        status: PromotionRunStatus.COMMITTED,
        activateTargetYear,
        totalClasses: workspace.summary.totalClasses,
        totalStudents: workspace.summary.totalStudents,
        promotedStudents: workspace.summary.promotedStudents,
        graduatedStudents: workspace.summary.graduatedStudents,
        summary: {
          summary: workspace.summary,
          validation: workspace.validation,
          classes: workspace.classes.map((item) => ({
            sourceClassId: item.sourceClassId,
            sourceClassName: item.sourceClassName,
            sourceLevel: item.sourceLevel,
            studentCount: item.studentCount,
            action: item.action,
            targetClassId: item.targetClassId,
            targetClassName: item.targetClassName,
          })),
        },
        committedAt: now,
      },
      select: {
        id: true,
        sourceAcademicYearId: true,
        targetAcademicYearId: true,
        status: true,
        activateTargetYear: true,
        totalClasses: true,
        totalStudents: true,
        promotedStudents: true,
        graduatedStudents: true,
        committedAt: true,
        createdAt: true,
      },
    });

    const affectedStudentIds = new Set<number>();
    const promotedUserUpdates: Array<{ id: number; classId: number }> = [];
    const graduatedStudentIds: number[] = [];
    const runItems: Array<{
      promotionRunId: number;
      studentId: number;
      sourceClassId: number;
      targetClassId: number | null;
      action: PromotionAction;
      beforeStudentStatus: StudentStatus;
      afterStudentStatus: StudentStatus;
      note: string | null;
    }> = [];

    for (const item of internalClasses) {
      if (item.studentCount <= 0) continue;

      for (const studentId of item.sourceStudentIds) {
        affectedStudentIds.add(studentId);

        if (item.action === PromotionAction.PROMOTE && item.targetClassId) {
          promotedUserUpdates.push({ id: studentId, classId: item.targetClassId });
          runItems.push({
            promotionRunId: run.id,
            studentId,
            sourceClassId: item.sourceClassId,
            targetClassId: item.targetClassId,
            action: PromotionAction.PROMOTE,
            beforeStudentStatus: StudentStatus.ACTIVE,
            afterStudentStatus: StudentStatus.ACTIVE,
            note: null,
          });
          continue;
        }

        graduatedStudentIds.push(studentId);
        runItems.push({
          promotionRunId: run.id,
          studentId,
          sourceClassId: item.sourceClassId,
          targetClassId: null,
          action: PromotionAction.GRADUATE,
          beforeStudentStatus: StudentStatus.ACTIVE,
          afterStudentStatus: StudentStatus.GRADUATED,
          note: 'Lulus menjadi alumni',
        });
      }
    }

    if (affectedStudentIds.size === 0) {
      throw new ApiError(400, 'Tidak ada siswa aktif yang dapat diproses.');
    }

    if (promotedUserUpdates.length > 0) {
      await Promise.all(
        promotedUserUpdates.map((item) =>
          tx.user.update({
            where: { id: item.id },
            data: {
              classId: item.classId,
              studentStatus: StudentStatus.ACTIVE,
            },
          }),
        ),
      );
    }

    if (graduatedStudentIds.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: graduatedStudentIds } },
        data: {
          classId: null,
          studentStatus: StudentStatus.GRADUATED,
        },
      });
    }

    await tx.studentAcademicMembership.updateMany({
      where: {
        studentId: {
          in: Array.from(affectedStudentIds),
        },
      },
      data: {
        isCurrent: false,
      },
    });

    for (const item of internalClasses) {
      if (item.studentCount <= 0) continue;

      const terminalStatus =
        item.action === PromotionAction.GRADUATE
          ? StudentAcademicMembershipStatus.GRADUATED
          : StudentAcademicMembershipStatus.PROMOTED;

      for (const studentId of item.sourceStudentIds) {
        await tx.studentAcademicMembership.upsert({
          where: {
            studentId_academicYearId: {
              studentId,
              academicYearId: sourceAcademicYearId,
            },
          },
          create: {
            studentId,
            academicYearId: sourceAcademicYearId,
            classId: item.sourceClassId,
            status: terminalStatus,
            isCurrent: false,
            startedAt: context.sourceYear.semester1Start,
            endedAt: now,
            promotionRunId: run.id,
          },
          update: {
            classId: item.sourceClassId,
            status: terminalStatus,
            isCurrent: false,
            endedAt: now,
            promotionRunId: run.id,
          },
        });

        if (item.action === PromotionAction.PROMOTE && item.targetClassId) {
          await tx.studentAcademicMembership.upsert({
            where: {
              studentId_academicYearId: {
                studentId,
                academicYearId: targetAcademicYearId,
              },
            },
            create: {
              studentId,
              academicYearId: targetAcademicYearId,
              classId: item.targetClassId,
              status: StudentAcademicMembershipStatus.ACTIVE,
              isCurrent: true,
              startedAt: context.targetYear.semester1Start,
              endedAt: null,
              promotionRunId: run.id,
            },
            update: {
              classId: item.targetClassId,
              status: StudentAcademicMembershipStatus.ACTIVE,
              isCurrent: true,
              startedAt: context.targetYear.semester1Start,
              endedAt: null,
              promotionRunId: run.id,
            },
          });
        }
      }
    }

    if (runItems.length > 0) {
      await tx.promotionRunItem.createMany({
        data: runItems,
      });
    }

    if (activateTargetYear) {
      await tx.academicYear.updateMany({
        where: {
          isActive: true,
          id: {
            not: targetAcademicYearId,
          },
        },
        data: {
          isActive: false,
        },
      });

      await tx.academicYear.update({
        where: { id: targetAcademicYearId },
        data: { isActive: true },
      });
    }

    return {
      run,
      summary: workspace.summary,
      validation: workspace.validation,
    };
  });
}
