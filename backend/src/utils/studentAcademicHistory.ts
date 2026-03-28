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

export const listHistoricalStudentsByIds = async (
  studentIds: number[],
  academicYearId: number,
): Promise<HistoricalStudentSnapshot[]> => {
  const normalizedIds = Array.from(
    new Set(
      studentIds
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0),
    ),
  );

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

export const getHistoricalStudentSnapshot = async (
  studentId: number,
  academicYearId: number,
): Promise<HistoricalStudentSnapshot | null> => {
  const rows = await listHistoricalStudentsByIds([studentId], academicYearId);
  return rows[0] || null;
};

export const listHistoricalStudentsForAcademicYear = async (params: {
  academicYearId: number;
  studentId?: number | null;
  classId?: number | null;
  majorId?: number | null;
  limit?: number | null;
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

  return limit ? mergedRows.slice(0, limit) : mergedRows;
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
