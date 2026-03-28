import { Prisma, StudentAcademicMembershipStatus } from '@prisma/client';
import prisma from './prisma';

const historicalClassSelect = {
  id: true,
  name: true,
  level: true,
  academicYearId: true,
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
      nip: true,
      nuptk: true,
    },
  },
} satisfies Prisma.ClassSelect;

const historicalStudentSelect = {
  id: true,
  name: true,
  nis: true,
  nisn: true,
  studentStatus: true,
  guardianName: true,
  fatherName: true,
  motherName: true,
  studentClass: {
    select: historicalClassSelect,
  },
} satisfies Prisma.UserSelect;

const historicalMembershipSelect = {
  studentId: true,
  status: true,
  class: {
    select: historicalClassSelect,
  },
} satisfies Prisma.StudentAcademicMembershipSelect;

type HistoricalStudentBase = Prisma.UserGetPayload<{
  select: typeof historicalStudentSelect;
}>;

type HistoricalMembershipBase = Prisma.StudentAcademicMembershipGetPayload<{
  select: typeof historicalMembershipSelect;
}>;

export type HistoricalStudentSnapshot = Omit<HistoricalStudentBase, 'studentClass'> & {
  studentClass: HistoricalStudentBase['studentClass'];
  academicMembershipStatus: StudentAcademicMembershipStatus | null;
};

export type HistoricalStudentScope = {
  academicYearId: number | null;
  students: HistoricalStudentSnapshot[];
  studentIds: number[];
  studentMap: Map<number, HistoricalStudentSnapshot>;
};

export type HistoricalStudentClassValidation = {
  cls: {
    id: number;
    name: string;
    academicYearId: number;
  };
  student: HistoricalStudentSnapshot | null;
};

const sortStudentsByName = (rows: HistoricalStudentSnapshot[]) =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));

const sortStudentsByClassThenName = (rows: HistoricalStudentSnapshot[]) =>
  [...rows].sort((a, b) => {
    const classNameA = String(a.studentClass?.name || '').trim();
    const classNameB = String(b.studentClass?.name || '').trim();
    const classCompare = classNameA.localeCompare(classNameB, 'id-ID');
    if (classCompare !== 0) return classCompare;
    return a.name.localeCompare(b.name, 'id-ID');
  });

const resolveHistoricalStudent = (
  student: HistoricalStudentBase,
  membership?: HistoricalMembershipBase | null,
): HistoricalStudentSnapshot => ({
  ...student,
  studentClass: membership?.class ?? student.studentClass ?? null,
  academicMembershipStatus: membership?.status ?? null,
});

const normalizeStudentIds = (studentIds: number[]) =>
  Array.from(
    new Set(
      studentIds
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0),
    ),
  );

export const listHistoricalStudentsByIds = async (
  studentIds: number[],
  academicYearId: number,
): Promise<HistoricalStudentSnapshot[]> => {
  const normalizedIds = normalizeStudentIds(studentIds);

  if (!normalizedIds.length) return [];

  const [students, memberships] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: normalizedIds },
        role: 'STUDENT',
      },
      select: historicalStudentSelect,
    }),
    prisma.studentAcademicMembership.findMany({
      where: {
        studentId: { in: normalizedIds },
        academicYearId,
      },
      select: historicalMembershipSelect,
    }),
  ]);

  const membershipMap = new Map<number, HistoricalMembershipBase>();
  memberships.forEach((item) => {
    membershipMap.set(item.studentId, item);
  });

  return sortStudentsByName(
    students.map((student) => resolveHistoricalStudent(student, membershipMap.get(student.id) || null)),
  );
};

export const listHistoricalStudentsByIdsForAcademicYear = async (
  studentIds: number[],
  academicYearId: number,
): Promise<HistoricalStudentSnapshot[]> => {
  const normalizedIds = normalizeStudentIds(studentIds);
  if (!normalizedIds.length) return [];

  const [students, memberships] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: normalizedIds },
        role: 'STUDENT',
        OR: [
          {
            studentClass: {
              academicYearId,
            },
          },
          {
            academicMemberships: {
              some: {
                academicYearId,
              },
            },
          },
        ],
      },
      select: historicalStudentSelect,
    }),
    prisma.studentAcademicMembership.findMany({
      where: {
        studentId: { in: normalizedIds },
        academicYearId,
      },
      select: historicalMembershipSelect,
    }),
  ]);

  const membershipMap = new Map<number, HistoricalMembershipBase>();
  memberships.forEach((item) => {
    membershipMap.set(item.studentId, item);
  });

  return sortStudentsByName(
    students
      .map((student) => resolveHistoricalStudent(student, membershipMap.get(student.id) || null))
      .filter((student) => {
        if (membershipMap.has(student.id)) return true;
        return Number(student.studentClass?.academicYearId || 0) === academicYearId;
      }),
  );
};

export const getHistoricalStudentSnapshot = async (
  studentId: number,
  academicYearId: number,
): Promise<HistoricalStudentSnapshot | null> => {
  const rows = await listHistoricalStudentsByIds([studentId], academicYearId);
  return rows[0] || null;
};

export const getHistoricalStudentSnapshotForAcademicYear = async (
  studentId: number,
  academicYearId: number,
): Promise<HistoricalStudentSnapshot | null> => {
  const rows = await listHistoricalStudentsByIdsForAcademicYear([studentId], academicYearId);
  return rows[0] || null;
};

export const listHistoricalStudentsForAcademicYear = async (params: {
  academicYearId: number;
  studentId?: number | null;
  classId?: number | null;
  majorId?: number | null;
  limit?: number | null;
  search?: string | null;
}): Promise<HistoricalStudentSnapshot[]> => {
  const academicYearId = Number(params.academicYearId);
  if (!Number.isFinite(academicYearId) || academicYearId <= 0) return [];

  const studentId =
    params.studentId && Number.isFinite(Number(params.studentId)) ? Number(params.studentId) : null;
  const classId =
    params.classId && Number.isFinite(Number(params.classId)) ? Number(params.classId) : null;
  const majorId =
    params.majorId && Number.isFinite(Number(params.majorId)) ? Number(params.majorId) : null;
  const limit =
    params.limit && Number.isFinite(Number(params.limit)) && Number(params.limit) > 0
      ? Number(params.limit)
      : null;
  const normalizedSearch = String(params.search || '').trim().toLowerCase();

  const membershipWhere: Prisma.StudentAcademicMembershipWhereInput = {
    academicYearId,
    student: {
      role: 'STUDENT',
    },
  };

  if (studentId) membershipWhere.studentId = studentId;
  if (classId) membershipWhere.classId = classId;
  if (majorId) {
    membershipWhere.class = {
      majorId,
    };
  }

  const membershipRows = await prisma.studentAcademicMembership.findMany({
    where: membershipWhere,
    select: {
      status: true,
      class: {
        select: historicalClassSelect,
      },
      student: {
        select: historicalStudentSelect,
      },
    },
  });

  const membershipStudents = membershipRows.map((item) =>
    resolveHistoricalStudent(item.student, {
      studentId: item.student.id,
      status: item.status,
      class: item.class,
    }),
  );

  const membershipStudentIdSet = new Set(membershipStudents.map((item) => item.id));
  const fallbackWhere: Prisma.UserWhereInput = {
    role: 'STUDENT',
    studentClass: {
      academicYearId,
      ...(majorId ? { majorId } : {}),
    },
    ...(studentId ? { id: studentId } : {}),
    ...(classId ? { classId } : {}),
    ...(membershipStudentIdSet.size > 0
      ? {
          AND: [
            {
              id: {
                notIn: Array.from(membershipStudentIdSet),
              },
            },
          ],
        }
      : {}),
  };

  const fallbackCurrentStudents = await prisma.user.findMany({
    where: fallbackWhere,
    select: historicalStudentSelect,
  });

  const mergedRows = sortStudentsByClassThenName([
    ...membershipStudents,
    ...fallbackCurrentStudents.map((item) => resolveHistoricalStudent(item, null)),
  ]);

  const filteredRows = normalizedSearch
    ? mergedRows.filter((student) =>
        [
          student.name,
          student.nis,
          student.nisn,
          student.studentClass?.name,
          student.studentClass?.major?.name,
          student.studentClass?.major?.code,
        ]
          .map((item) => String(item || '').toLowerCase())
          .some((value) => value.includes(normalizedSearch)),
      )
    : mergedRows;

  return limit ? filteredRows.slice(0, limit) : filteredRows;
};

export const resolveHistoricalStudentScope = async (params: {
  academicYearId?: number | null;
  studentId?: number | null;
  classId?: number | null;
  majorId?: number | null;
  limit?: number | null;
  search?: string | null;
}): Promise<HistoricalStudentScope> => {
  const explicitAcademicYearId =
    params.academicYearId && Number.isFinite(Number(params.academicYearId))
      ? Number(params.academicYearId)
      : null;
  const classId =
    params.classId && Number.isFinite(Number(params.classId)) ? Number(params.classId) : null;

  let classAcademicYearId: number | null = null;
  if (classId) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { academicYearId: true },
    });
    classAcademicYearId = cls?.academicYearId ?? null;
  }

  if (
    explicitAcademicYearId &&
    classAcademicYearId &&
    explicitAcademicYearId !== classAcademicYearId
  ) {
    return {
      academicYearId: explicitAcademicYearId,
      students: [],
      studentIds: [],
      studentMap: new Map(),
    };
  }

  const effectiveAcademicYearId = explicitAcademicYearId || classAcademicYearId;
  if (!effectiveAcademicYearId) {
    return {
      academicYearId: null,
      students: [],
      studentIds: [],
      studentMap: new Map(),
    };
  }

  const students = await listHistoricalStudentsForAcademicYear({
    academicYearId: effectiveAcademicYearId,
    studentId: params.studentId || null,
    classId,
    majorId: params.majorId || null,
    limit: params.limit || null,
    search: params.search || null,
  });

  return {
    academicYearId: effectiveAcademicYearId,
    students,
    studentIds: students.map((item) => item.id),
    studentMap: new Map(students.map((item) => [item.id, item])),
  };
};

export const validateHistoricalStudentClassMembership = async (params: {
  academicYearId: number;
  classId: number;
  studentId: number;
}): Promise<HistoricalStudentClassValidation | null> => {
  const academicYearId = Number(params.academicYearId);
  const classId = Number(params.classId);
  const studentId = Number(params.studentId);

  if (
    !Number.isFinite(academicYearId) ||
    academicYearId <= 0 ||
    !Number.isFinite(classId) ||
    classId <= 0 ||
    !Number.isFinite(studentId) ||
    studentId <= 0
  ) {
    return null;
  }

  const cls = await prisma.class.findFirst({
    where: {
      id: classId,
      academicYearId,
    },
    select: {
      id: true,
      name: true,
      academicYearId: true,
    },
  });

  if (!cls) {
    return null;
  }

  const students = await listHistoricalStudentsForAcademicYear({
    academicYearId,
    classId,
    studentId,
    limit: 1,
  });

  const student = students[0] || null;
  return {
    cls,
    student,
  };
};

export const listHistoricalStudentsForClass = async (
  classId: number,
  academicYearId: number,
): Promise<HistoricalStudentSnapshot[]> => {
  const membershipRows = await prisma.studentAcademicMembership.findMany({
    where: {
      classId,
      academicYearId,
    },
    orderBy: {
      student: {
        name: 'asc',
      },
    },
    select: {
      status: true,
      class: {
        select: historicalClassSelect,
      },
      student: {
        select: historicalStudentSelect,
      },
    },
  });

  if (membershipRows.length > 0) {
    const membershipStudents = membershipRows.map((item) =>
      resolveHistoricalStudent(item.student, {
        studentId: item.student.id,
        status: item.status,
        class: item.class,
      }),
    );

    const membershipStudentIdSet = new Set(membershipStudents.map((item) => item.id));
    const fallbackCurrentStudents = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        classId,
        id: {
          notIn: Array.from(membershipStudentIdSet),
        },
      },
      orderBy: {
        name: 'asc',
      },
      select: historicalStudentSelect,
    });

    const mergedRows = [
      ...membershipStudents,
      ...fallbackCurrentStudents.map((item) => resolveHistoricalStudent(item, null)),
    ];
    return sortStudentsByName(mergedRows);
  }

  const currentStudents = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      classId,
      studentStatus: 'ACTIVE',
    },
    orderBy: {
      name: 'asc',
    },
    select: historicalStudentSelect,
  });

  return sortStudentsByName(currentStudents.map((item) => resolveHistoricalStudent(item, null)));
};
