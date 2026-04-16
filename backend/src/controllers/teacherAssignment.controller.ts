import { Request, Response } from 'express';
import { z } from 'zod';
import { Semester } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { broadcastDomainEvent } from '../realtime/realtimeGateway';
import { writeAuditLog } from '../utils/auditLog';
import { listHistoricalStudentsForClass } from '../utils/studentAcademicHistory';
import {
  coerceCompetencyThresholdBucket,
  deriveThresholdDescription,
  emptyCompetencyThresholdBucket,
  hasAnyCompetencyThresholdBucketValue,
  isReligionCompetencySubject,
  mergeCompetencyThresholdBucket,
  normalizeReligionKey,
  resolveCompetencyThresholdBucket,
} from '../utils/competencyThresholds';

const createTeacherAssignmentsSchema = z.object({
  academicYearId: z.number().int(),
  teacherId: z.number().int(),
  subjectId: z.number().int(),
  classIds: z.array(z.number().int()).min(1),
});

const listTeacherAssignmentsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  search: z.string().optional(),
  academicYearId: z.coerce.number().int().optional(),
  teacherId: z.coerce.number().int().optional(),
  subjectId: z.coerce.number().int().optional(),
  classId: z.coerce.number().int().optional(),
  scope: z.string().optional(),
});

const teacherAssignmentIdSchema = z.object({
  id: z.coerce.number().int(),
});

const competencyThresholdSetSchema = z.object({
  A: z.string().optional(),
  B: z.string().optional(),
  C: z.string().optional(),
  D: z.string().optional(),
});

const updateCompetencySchema = z.object({
  competencyThresholds: competencyThresholdSetSchema.extend({
    _byReligion: z.record(competencyThresholdSetSchema).optional(),
  }),
  semester: z.nativeEnum(Semester).optional(),
});

const semesterQuerySchema = z.object({
  semester: z.nativeEnum(Semester).optional(),
});

type TeacherAssignmentWithScope = {
  id: number;
  teacherId: number;
  subjectId: number;
  academicYearId: number;
  competencyThresholds: unknown;
  class: {
    level: string | null;
  };
};

const listAvailableReligionsForAssignments = async (
  assignments: Array<{ classId?: number | null }>,
  academicYearId: number,
): Promise<string[]> => {
  const classIds = Array.from(
    new Set(
      assignments
        .map((assignment) => Number(assignment.classId || 0))
        .filter((classId) => Number.isFinite(classId) && classId > 0),
    ),
  );

  if (classIds.length === 0) {
    return [];
  }

  const rosters = await Promise.all(
    classIds.map((classId) => listHistoricalStudentsForClass(classId, academicYearId)),
  );
  const studentIds = Array.from(
    new Set(
      rosters
        .flatMap((roster) => roster.map((student) => Number(student.id)))
        .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
    ),
  );

  if (studentIds.length === 0) {
    return [];
  }

  const religionRows = await prisma.user.findMany({
    where: {
      id: { in: studentIds },
    },
    select: {
      religion: true,
    },
  });

  return Array.from(
    new Set(
      religionRows
        .map((row) => normalizeReligionKey(row.religion))
        .filter((religion): religion is string => Boolean(religion)),
    ),
  ).sort((left, right) => left.localeCompare(right, 'id', { sensitivity: 'base' }));
};

const calculatePredicateFromScore = (score: number, kkm: number): string => {
  const roundedScore = Math.round(score);
  if (roundedScore >= 86) return 'A';
  if (roundedScore >= kkm) return 'B';
  if (roundedScore >= 60) return 'C';
  return 'D';
};


const buildAssignmentScopeKey = (assignment: TeacherAssignmentWithScope) =>
  `${assignment.teacherId}:${assignment.subjectId}:${assignment.academicYearId}:${String(
    assignment.class?.level || '',
  ).trim().toUpperCase()}`;

const normalizeAssignmentsForSemester = <T extends TeacherAssignmentWithScope>(
  assignments: T[],
  preferredSemester?: Semester | null,
): T[] => {
  const assignmentsByScope = new Map<string, T[]>();
  assignments.forEach((assignment) => {
    const key = buildAssignmentScopeKey(assignment);
    const current = assignmentsByScope.get(key) || [];
    current.push(assignment);
    assignmentsByScope.set(key, current);
  });

  return assignments.map((assignment) => {
    const ownResolved = resolveCompetencyThresholdBucket(
      assignment.competencyThresholds,
      preferredSemester,
    );

    if (hasAnyCompetencyThresholdBucketValue(ownResolved)) {
      return {
        ...assignment,
        competencyThresholds: ownResolved,
      };
    }

    const siblings = assignmentsByScope.get(buildAssignmentScopeKey(assignment)) || [];
    const siblingResolved =
      siblings
        .filter((row) => row.id !== assignment.id)
        .map((row) => resolveCompetencyThresholdBucket(row.competencyThresholds, preferredSemester))
        .find((row) => hasAnyCompetencyThresholdBucketValue(row)) || emptyCompetencyThresholdBucket();

    return {
      ...assignment,
      competencyThresholds: siblingResolved,
    };
  });
};

const resolvePreferredSemester = async (explicit?: Semester | null) => {
  if (explicit) return explicit;
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { name: true },
  });
  const activeYearName = String(activeYear?.name || '').toUpperCase();
  return activeYearName.includes('GENAP') ? Semester.EVEN : Semester.ODD;
};

export const updateCompetencyThresholds = asyncHandler(async (req: Request, res: Response) => {
  const { id } = teacherAssignmentIdSchema.parse(req.params);
  const { competencyThresholds, semester } = updateCompetencySchema.parse(req.body);
  const targetSemester = await resolvePreferredSemester(semester || null);

  const normalizedThresholds = coerceCompetencyThresholdBucket(competencyThresholds);

  const before = await prisma.teacherAssignment.findUnique({
    where: { id },
    include: {
      class: {
        select: {
          level: true,
        },
      },
      subject: {
        select: {
          name: true,
          code: true,
        },
      },
    },
  });
  if (!before) {
    throw new ApiError(404, 'Penugasan tidak ditemukan');
  }

  const siblingAssignments = await prisma.teacherAssignment.findMany({
    where: {
      teacherId: before.teacherId,
      subjectId: before.subjectId,
      academicYearId: before.academicYearId,
      class: {
        level: before.class.level,
      },
    },
    include: {
      class: {
        select: {
          level: true,
        },
      },
    },
  });

  await prisma.$transaction(
    siblingAssignments.map((assignment) =>
      prisma.teacherAssignment.update({
        where: { id: assignment.id },
        data: {
          competencyThresholds: mergeCompetencyThresholdBucket(
            assignment.competencyThresholds,
            targetSemester,
            normalizedThresholds,
          ),
        },
      }),
    ),
  );

  const affectedClassIds = Array.from(
    new Set(
      siblingAssignments
        .map((assignment) => Number(assignment.classId || 0))
        .filter((classId) => Number.isFinite(classId) && classId > 0),
    ),
  );

  if (affectedClassIds.length > 0) {
    const studentRosters = await Promise.all(
      affectedClassIds.map((classId) => listHistoricalStudentsForClass(classId, before.academicYearId)),
    );
    const classByStudentId = new Map<number, number>();
    studentRosters.forEach((roster, rosterIndex) => {
      const classId = affectedClassIds[rosterIndex];
      roster.forEach((student) => {
        classByStudentId.set(Number(student.id), classId);
      });
    });

    const studentIds = Array.from(classByStudentId.keys());
    if (studentIds.length > 0) {
      const religionRows = await prisma.user.findMany({
        where: {
          id: { in: studentIds },
        },
        select: {
          id: true,
          religion: true,
        },
      });
      const religionByStudentId = new Map(
        religionRows.map((row) => [Number(row.id), normalizeReligionKey(row.religion)]),
      );

      const reportGrades = await prisma.reportGrade.findMany({
        where: {
          studentId: { in: studentIds },
          subjectId: before.subjectId,
          academicYearId: before.academicYearId,
          semester: targetSemester,
        },
        select: {
          id: true,
          studentId: true,
          finalScore: true,
          predicate: true,
          sasScore: true,
          usScore: true,
          slotScores: true,
        },
      });

      const kkmByClassId = new Map<number, number>(
        siblingAssignments.map((assignment) => [
          Number(assignment.classId || 0),
          Number(assignment.kkm || 75),
        ]),
      );
      const useReligionThresholds = isReligionCompetencySubject(before.subject);

      await prisma.$transaction(
        reportGrades.map((reportGrade) => {
          const classId = Number(classByStudentId.get(Number(reportGrade.studentId)) || 0);
          const kkm = Number(kkmByClassId.get(classId) || 75);
          const slotScoreEvidence =
            reportGrade.slotScores &&
            typeof reportGrade.slotScores === 'object' &&
            !Array.isArray(reportGrade.slotScores) &&
            Object.values(reportGrade.slotScores as Record<string, unknown>).some(
              (value) => value !== null && value !== undefined,
            );
          const hasFinalEvidence =
            slotScoreEvidence ||
            reportGrade.sasScore !== null ||
            reportGrade.usScore !== null ||
            Number(reportGrade.finalScore || 0) !== 0;
          if (!hasFinalEvidence) {
            return prisma.reportGrade.update({
              where: { id: reportGrade.id },
              data: {
                description: null,
              },
            });
          }
          const predicate =
            String(reportGrade.predicate || '').trim() ||
            calculatePredicateFromScore(Number(reportGrade.finalScore || 0), kkm);
          const description = deriveThresholdDescription(normalizedThresholds, predicate, {
            religionKey: religionByStudentId.get(Number(reportGrade.studentId)) || null,
            preferReligion: useReligionThresholds,
            allowGeneralFallback: !useReligionThresholds,
          });

          return prisma.reportGrade.update({
            where: { id: reportGrade.id },
            data: {
              predicate,
              description,
            },
          });
        }),
      );
    }
  }

  const refreshedAssignments = await prisma.teacherAssignment.findMany({
    where: {
      teacherId: before.teacherId,
      subjectId: before.subjectId,
      academicYearId: before.academicYearId,
      class: {
        level: before.class.level,
      },
    },
    include: {
      class: {
        select: {
          level: true,
        },
      },
    },
  });
  const normalizedAssignments = normalizeAssignmentsForSemester(refreshedAssignments, targetSemester);
  const assignment = normalizedAssignments.find((item) => item.id === id);

  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  const dutiesArr = (dutyUser?.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
  await writeAuditLog(
    authUser.id,
    dutyUser?.role || authUser.role,
    dutiesArr,
    'UPDATE',
    'TEACHER_ASSIGNMENT_COMPETENCY',
    id,
    before,
    {
      assignmentId: id,
      semester: targetSemester,
      thresholds: normalizedThresholds,
      affectedAssignmentIds: refreshedAssignments.map((item) => item.id),
    },
    (req.body as any)?.reason,
  );

  broadcastDomainEvent({
    domain: 'REPORTS',
    action: 'UPDATED',
    scope: {
      academicYearIds: [Number(before.academicYearId)],
      subjectIds: [Number(before.subjectId)],
      semesters: [targetSemester],
      classIds: affectedClassIds,
    },
  });

  res.status(200).json(new ApiResponse(200, assignment, 'Deskripsi capaian kompetensi berhasil disimpan'));
});

export const getTeacherAssignmentById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = teacherAssignmentIdSchema.parse(req.params);
  const { semester } = semesterQuerySchema.parse(req.query);
  const preferredSemester = await resolvePreferredSemester(semester || null);

  const assignment = await prisma.teacherAssignment.findUnique({
    where: { id },
    include: {
      class: {
        include: {
          students: {
            where: { studentStatus: 'ACTIVE' },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, nis: true, nisn: true, gender: true, religion: true },
          },
          major: true,
        },
      },
      subject: true,
      academicYear: true,
      teacher: {
        select: { id: true, name: true },
      },
    },
  });

  if (!assignment) {
    throw new ApiError(404, 'Penugasan tidak ditemukan');
  }

  const siblings = await prisma.teacherAssignment.findMany({
    where: {
      teacherId: assignment.teacherId,
      subjectId: assignment.subjectId,
      academicYearId: assignment.academicYearId,
      class: {
        level: assignment.class.level,
      },
    },
    include: {
      class: {
        select: {
          level: true,
        },
      },
    },
  });
  const normalizedAssignments = normalizeAssignmentsForSemester(siblings, preferredSemester);
  const normalizedAssignment = normalizedAssignments.find((item) => item.id === id);
  const availableReligions = await listAvailableReligionsForAssignments(
    siblings,
    Number(assignment.academicYearId),
  );
  const detailAssignment = {
    ...assignment,
    competencyThresholds:
      normalizedAssignment?.competencyThresholds ??
      resolveCompetencyThresholdBucket(assignment.competencyThresholds, preferredSemester),
    availableReligions,
  };

  res.status(200).json(
    new ApiResponse(200, detailAssignment, 'Detail penugasan berhasil diambil'),
  );
});

export const createTeacherAssignments = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  if (!dutyUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }
  if (dutyUser.role !== 'ADMIN') {
    const duties = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
    const allowed = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    if (!allowed) {
      throw new ApiError(403, 'Anda tidak memiliki hak akses untuk mengelola assignment guru');
    }
  }
  const { academicYearId, teacherId, subjectId, classIds } = createTeacherAssignmentsSchema.parse(req.body);

  const classes = await prisma.class.findMany({
    where: {
      id: { in: classIds },
      academicYearId,
    },
    select: {
      id: true,
      level: true,
    },
  });

  if (classes.length === 0) {
    res.status(400).json(new ApiResponse(400, null, 'Kelas tidak valid untuk tahun ajaran tersebut'));
    return;
  }

  const existingAssignments = await prisma.teacherAssignment.findMany({
    where: {
      teacherId,
      subjectId,
      academicYearId,
    },
    include: {
      class: {
        select: {
          id: true,
          level: true,
        },
      },
    },
  });

  const targetClassIdSet = new Set(classIds);

  const assignments = [];

  for (const cls of classes) {
    const subjectKkm = await prisma.subjectKKM.findFirst({
      where: {
        subjectId,
        classLevel: cls.level,
        OR: [
          { academicYearId },
          { academicYearId: null },
        ],
      },
      orderBy: {
        academicYearId: 'desc',
      },
    });

    const kkm = subjectKkm?.kkm ?? 75;

    const existing = existingAssignments.find((a) => a.classId === cls.id);
    const siblingTemplate = existingAssignments.find(
      (assignment) =>
        assignment.classId !== cls.id &&
        String(assignment.class?.level || '').trim().toUpperCase() ===
          String(cls.level || '').trim().toUpperCase() &&
        assignment.competencyThresholds,
    );

    let assignment;

    if (existing) {
      assignment = await prisma.teacherAssignment.update({
        where: { id: existing.id },
        data: { kkm },
      });
    } else {
      assignment = await prisma.teacherAssignment.create({
        data: {
          teacherId,
          subjectId,
          academicYearId,
          classId: cls.id,
          kkm,
          competencyThresholds: siblingTemplate?.competencyThresholds ?? undefined,
        },
      });
    }

    assignments.push(assignment);
  }

  const toDeleteIds = existingAssignments
    .filter((a) => !targetClassIdSet.has(a.classId))
    .map((a) => a.id);

  if (toDeleteIds.length > 0) {
    await prisma.teacherAssignment.deleteMany({
      where: {
        id: { in: toDeleteIds },
      },
    });
  }

  const dutiesArr2 = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
  await writeAuditLog(authUser.id, dutyUser.role, dutiesArr2, 'UPSERT', 'TEACHER_ASSIGNMENTS', undefined, null, { academicYearId, teacherId, subjectId, classIds }, (req.body as any)?.reason);

  res
    .status(201)
    .json(new ApiResponse(201, { assignments }, 'Penugasan guru berhasil disimpan'));
});

export const getTeacherAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, academicYearId, teacherId, subjectId, classId, scope } =
    listTeacherAssignmentsSchema.parse(req.query);
  const { semester } = semesterQuerySchema.parse(req.query);
  const preferredSemester = await resolvePreferredSemester(semester || null);

  const user = (req as any).user;

  const skip = (page - 1) * limit;

  const where: any = {};

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  if (classId) {
    where.classId = classId;
  }

  if (user && user.role === 'TEACHER') {
    const dutyUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { additionalDuties: true },
    });
    const duties = (dutyUser?.additionalDuties || []).map((d: any) =>
      String(d).trim().toUpperCase(),
    );
    const isCurriculum =
      duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    const requestScope = String(scope || '').trim().toUpperCase();
    const canUseCurriculumScope = isCurriculum && requestScope === 'CURRICULUM';

    if (canUseCurriculumScope) {
      if (teacherId) {
        where.teacherId = teacherId;
      }
    } else {
      // Default TEACHER scope must always be own assignment only,
      // even when the account has additional curriculum duty.
      where.teacherId = user.id;
    }
  } else if (teacherId) {
    where.teacherId = teacherId;
  }

  if (subjectId) {
    where.subjectId = subjectId;
  }
  if (search && search.trim().length > 0) {
    const term = search.trim();
    where.OR = [
      {
        teacher: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
      {
        teacher: {
          username: { contains: term, mode: 'insensitive' },
        },
      },
      {
        subject: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
      {
        subject: {
          code: { contains: term, mode: 'insensitive' },
        },
      },
      {
        class: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
      {
        academicYear: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
    ];
  }

  const [total, assignments] = await Promise.all([
    prisma.teacherAssignment.count({ where }),
    prisma.teacherAssignment.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { academicYear: { name: 'desc' } },
        { subject: { name: 'asc' } },
        { class: { level: 'asc' } },
        { class: { name: 'asc' } },
        { subject: { code: 'asc' } },
      ],
      include: {
        teacher: {
          select: { id: true, name: true, username: true },
        },
        subject: {
          select: { id: true, name: true, code: true },
        },
        class: {
          select: {
            id: true,
            name: true,
            level: true,
            major: {
              select: { id: true, name: true, code: true },
            },
            _count: {
              select: { students: true },
            },
          },
        },
        academicYear: {
          select: { id: true, name: true },
        },
        _count: {
          select: { scheduleEntries: true },
        },
      },
    }),
  ]);

  const normalizedAssignments = normalizeAssignmentsForSemester(assignments, preferredSemester);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        assignments: normalizedAssignments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
      'Data penugasan guru berhasil diambil',
    ),
  );
});

export const deleteTeacherAssignment = asyncHandler(
  async (req: Request, res: Response) => {
    const authUser = (req as any).user;
    const dutyUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true, additionalDuties: true },
    });
    if (!dutyUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }
    if (dutyUser.role !== 'ADMIN') {
      const duties = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
      const allowed = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
      if (!allowed) {
        throw new ApiError(403, 'Anda tidak memiliki hak akses untuk menghapus assignment guru');
      }
    }
    const { id } = teacherAssignmentIdSchema.parse(req.params);

    const before = await prisma.teacherAssignment.findUnique({ where: { id } });
    await prisma.teacherAssignment.delete({ where: { id } });
    const dutiesArr3 = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
    await writeAuditLog(authUser.id, dutyUser.role, dutiesArr3, 'DELETE', 'TEACHER_ASSIGNMENT', id, before, null, (req.body as any)?.reason);

    res
      .status(200)
      .json(
        new ApiResponse(200, null, 'Penugasan guru berhasil dihapus'),
      );
  },
);
