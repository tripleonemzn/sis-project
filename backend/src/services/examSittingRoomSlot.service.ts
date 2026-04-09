import { Prisma, Semester } from '@prisma/client';
import prisma from '../utils/prisma';
import { listHistoricalStudentsByIdsForAcademicYear } from '../utils/studentAcademicHistory';

function normalizeAliasCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveExamTypeCandidates(raw: unknown): string[] {
  const normalized = normalizeAliasCode(raw);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);

  const isFinalFamily = [
    'FINAL',
    'SAS',
    'SAT',
    'PAS',
    'PAT',
    'SAS_SAT',
    'SUMATIF_AKHIR_SEMESTER',
    'SUMATIF_AKHIR_TAHUN',
  ].includes(normalized);
  if (isFinalFamily) {
    candidates.add('FINAL');
    candidates.add('SAS');
    candidates.add('SAT');
  }

  const isMidtermFamily = ['MIDTERM', 'SBTS', 'SUMATIF_BERSAMA_TENGAH_SEMESTER'].includes(normalized);
  if (isMidtermFamily) {
    candidates.add('MIDTERM');
    candidates.add('SBTS');
  }

  const isFormativeFamily = ['FORMATIF', 'FORMATIVE', 'UH', 'ULANGAN_HARIAN'].includes(normalized);
  if (isFormativeFamily) {
    candidates.add('FORMATIF');
    candidates.add('UH');
    candidates.add('ULANGAN_HARIAN');
  }

  return Array.from(candidates.values());
}

function normalizeRoomLookupKey(raw: unknown): string {
  return String(raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSessionLabel(raw: unknown): string | null {
  const normalized = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.toLowerCase() : null;
}

function hasExamTypeIntersection(left: unknown, right: unknown): boolean {
  const leftCandidates = new Set(resolveExamTypeCandidates(left));
  const rightCandidates = resolveExamTypeCandidates(right);
  if (leftCandidates.size === 0 || rightCandidates.length === 0) return false;
  return rightCandidates.some((candidate) => leftCandidates.has(candidate));
}

function isSameSlotTime(
  leftStart: Date | null | undefined,
  leftEnd: Date | null | undefined,
  rightStart: Date | null | undefined,
  rightEnd: Date | null | undefined,
): boolean {
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return true;
  return leftStart.getTime() === rightStart.getTime() && leftEnd.getTime() === rightEnd.getTime();
}

function isSameSessionScope(params: {
  leftSessionId: number | null | undefined;
  leftSessionLabel: string | null | undefined;
  rightSessionId: number | null | undefined;
  rightSessionLabel: string | null | undefined;
}): boolean {
  const leftSessionId = Number(params.leftSessionId || 0) || null;
  const rightSessionId = Number(params.rightSessionId || 0) || null;
  if (leftSessionId && rightSessionId) {
    return leftSessionId === rightSessionId;
  }

  const leftLabel = normalizeSessionLabel(params.leftSessionLabel);
  const rightLabel = normalizeSessionLabel(params.rightSessionLabel);
  if (leftLabel || rightLabel) {
    return leftLabel === rightLabel;
  }

  return true;
}

function isSameDateScope(date: Date | null | undefined, startTime: Date | null | undefined): boolean {
  if (!date || !startTime) return true;
  return (
    date.getFullYear() === startTime.getFullYear() &&
    date.getMonth() === startTime.getMonth() &&
    date.getDate() === startTime.getDate()
  );
}

function compareClassName(a: string, b: string): number {
  return String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });
}

type ScheduleRow = Prisma.ExamScheduleGetPayload<{
  select: {
    id: true;
    academicYearId: true;
    examType: true;
    semester: true;
    startTime: true;
    endTime: true;
    periodNumber: true;
    sessionId: true;
    sessionLabel: true;
    subjectId: true;
    packet: {
      select: {
        title: true;
        subject: {
          select: {
            id: true;
            name: true;
            code: true;
          };
        };
      };
    };
    subject: {
      select: {
        id: true;
        name: true;
        code: true;
      };
    };
    class: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

type SittingRow = Prisma.ExamSittingGetPayload<{
  select: {
    id: true;
    academicYearId: true;
    examType: true;
    semester: true;
    roomName: true;
    sessionId: true;
    sessionLabel: true;
    startTime: true;
    endTime: true;
    proctorId: true;
    proctor: {
      select: {
        id: true;
        name: true;
      };
    };
    layout: {
      select: {
        id: true;
        rows: true;
        columns: true;
        generatedAt: true;
        updatedAt: true;
      };
    };
    students: {
      select: {
        studentId: true;
      };
    };
  };
}>;

type ScheduleGroup = {
  key: string;
  academicYearId: number;
  examType: string;
  semester: Semester | null;
  startTime: Date;
  endTime: Date;
  periodNumber: number | null;
  sessionId: number | null;
  sessionLabel: string | null;
  subjectId: number | null;
  subjectName: string;
  subjectCode: string | null;
  packetTitle: string | null;
  scheduleIds: number[];
  classIds: Set<number>;
  classNames: Set<string>;
};

type SittngStudentClass = {
  studentId: number;
  classId: number | null;
  className: string | null;
};

export type ExamSittingRoomSlotRow = {
  key: string;
  timeKey: string;
  roomKey: string;
  sittingId: number;
  roomName: string;
  academicYearId: number;
  examType: string;
  semester: Semester | null;
  startTime: Date;
  endTime: Date;
  periodNumber: number | null;
  sessionId: number | null;
  sessionLabel: string | null;
  subjectId: number | null;
  subjectName: string;
  subjectCode: string | null;
  packetTitle: string | null;
  scheduleIds: number[];
  classIds: number[];
  classNames: string[];
  participantCount: number;
  proctorId: number | null;
  proctor: {
    id: number;
    name: string;
  } | null;
  layout: {
    id: number;
    rows: number;
    columns: number;
    generatedAt: Date | null;
    updatedAt: Date | null;
  } | null;
};

export type ExamSittingRoomSlotResponse = {
  slots: ExamSittingRoomSlotRow[];
  unassignedSchedules: Array<{
    id: number;
    academicYearId: number;
    examType: string;
    semester: Semester | null;
    startTime: Date;
    endTime: Date;
    periodNumber: number | null;
    sessionId: number | null;
    sessionLabel: string | null;
    subjectId: number | null;
    subjectName: string;
    subjectCode: string | null;
    packetTitle: string | null;
    classId: number | null;
    className: string | null;
  }>;
};

function buildTimeKey(
  startTime: Date,
  endTime: Date,
  periodNumber: number | null,
  sessionId: number | null,
  sessionLabel: string | null,
) {
  return [
    startTime.toISOString(),
    endTime.toISOString(),
    `period:${Number.isFinite(Number(periodNumber)) && Number(periodNumber) > 0 ? Number(periodNumber) : 0}`,
    Number.isFinite(Number(sessionId)) && Number(sessionId) > 0
      ? `sid:${Number(sessionId)}`
      : normalizeSessionLabel(sessionLabel) || '__no_session__',
  ].join('|');
}

function buildRoomSlotKey(params: {
  sittingId: number;
  roomName: string;
  startTime: Date;
  endTime: Date;
  periodNumber: number | null;
  sessionId: number | null;
  sessionLabel: string | null;
  subjectId: number | null;
  subjectName: string;
}) {
  const subjectScope =
    Number.isFinite(Number(params.subjectId)) && Number(params.subjectId) > 0
      ? `sub:${Number(params.subjectId)}`
      : `subn:${String(params.subjectName || '').trim().toLowerCase() || '-'}`;
  const sessionScope =
    Number.isFinite(Number(params.sessionId)) && Number(params.sessionId) > 0
      ? `sid:${Number(params.sessionId)}`
      : `sl:${normalizeSessionLabel(params.sessionLabel) || '__no_session__'}`;
  return [
    `sit:${params.sittingId}`,
    `room:${normalizeRoomLookupKey(params.roomName) || '-'}`,
    `start:${params.startTime.toISOString()}`,
    `end:${params.endTime.toISOString()}`,
    `period:${Number.isFinite(Number(params.periodNumber)) && Number(params.periodNumber) > 0 ? Number(params.periodNumber) : 0}`,
    subjectScope,
    sessionScope,
  ].join('::');
}

function buildGroupKey(schedule: ScheduleRow, subjectId: number | null, subjectName: string) {
  const sessionScope =
    Number.isFinite(Number(schedule.sessionId)) && Number(schedule.sessionId) > 0
      ? `sid:${Number(schedule.sessionId)}`
      : `sl:${normalizeSessionLabel(schedule.sessionLabel) || '__no_session__'}`;
  const subjectScope =
    Number.isFinite(Number(subjectId)) && Number(subjectId) > 0
      ? `sub:${Number(subjectId)}`
      : `subn:${String(subjectName || '').trim().toLowerCase() || '-'}`;
  return [
    `start:${schedule.startTime.toISOString()}`,
    `end:${schedule.endTime.toISOString()}`,
    `period:${Number.isFinite(Number(schedule.periodNumber)) && Number(schedule.periodNumber) > 0 ? Number(schedule.periodNumber) : 0}`,
    sessionScope,
    subjectScope,
    `type:${normalizeAliasCode(schedule.examType) || '-'}`,
  ].join('::');
}

async function loadScheduleGroups(params: {
  academicYearId: number;
  examType?: string | null;
  semester?: Semester | null;
  date?: Date | null;
}) {
  const examTypeCandidates = resolveExamTypeCandidates(params.examType);
  const where: Prisma.ExamScheduleWhereInput = {
    isActive: true,
    academicYearId: params.academicYearId,
    ...(params.semester ? { semester: params.semester } : {}),
    ...(examTypeCandidates.length > 0 ? { examType: { in: examTypeCandidates } } : {}),
    ...(params.date
      ? {
          startTime: {
            gte: new Date(params.date.getFullYear(), params.date.getMonth(), params.date.getDate(), 0, 0, 0, 0),
            lt: new Date(params.date.getFullYear(), params.date.getMonth(), params.date.getDate() + 1, 0, 0, 0, 0),
          },
        }
      : {}),
  };

  const schedules = await prisma.examSchedule.findMany({
    where,
    select: {
      id: true,
      academicYearId: true,
      examType: true,
      semester: true,
      startTime: true,
      endTime: true,
      periodNumber: true,
      sessionId: true,
      sessionLabel: true,
      subjectId: true,
      packet: {
        select: {
          title: true,
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
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
        },
      },
    },
    orderBy: [{ startTime: 'asc' }, { periodNumber: 'asc' }, { endTime: 'asc' }, { id: 'asc' }],
  });

  const groupMap = new Map<string, ScheduleGroup>();
  schedules.forEach((schedule) => {
    const resolvedSubjectId = Number(schedule.subjectId || schedule.packet?.subject?.id || 0) || null;
    const resolvedSubjectName =
      String(schedule.subject?.name || schedule.packet?.subject?.name || '').trim() || 'Mata Pelajaran';
    const resolvedSubjectCode =
      String(schedule.subject?.code || schedule.packet?.subject?.code || '').trim() || null;
    const groupKey = buildGroupKey(schedule, resolvedSubjectId, resolvedSubjectName);
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        key: groupKey,
        academicYearId:
          Number.isFinite(Number(schedule.academicYearId)) && Number(schedule.academicYearId) > 0
            ? Number(schedule.academicYearId)
            : params.academicYearId,
        examType: String(schedule.examType || '').trim() || String(params.examType || '').trim() || 'UJIAN',
        semester: schedule.semester || null,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        periodNumber: Number(schedule.periodNumber || 0) || null,
        sessionId: Number(schedule.sessionId || 0) || null,
        sessionLabel: schedule.sessionLabel || null,
        subjectId: resolvedSubjectId,
        subjectName: resolvedSubjectName,
        subjectCode: resolvedSubjectCode,
        packetTitle: String(schedule.packet?.title || '').trim() || null,
        scheduleIds: [],
        classIds: new Set<number>(),
        classNames: new Set<string>(),
      });
    }

    const target = groupMap.get(groupKey)!;
    target.scheduleIds.push(schedule.id);
    if (Number.isFinite(Number(schedule.class?.id)) && Number(schedule.class?.id) > 0) {
      target.classIds.add(Number(schedule.class?.id));
    }
    if (schedule.class?.name) {
      target.classNames.add(String(schedule.class.name).trim());
    }
  });

  return {
    schedules,
    groups: Array.from(groupMap.values()),
  };
}

async function loadSittings(params: {
  academicYearId: number;
  examType?: string | null;
  semester?: Semester | null;
}) {
  const examTypeCandidates = resolveExamTypeCandidates(params.examType);
  return prisma.examSitting.findMany({
    where: {
      academicYearId: params.academicYearId,
      ...(params.semester ? { semester: params.semester } : {}),
      ...(examTypeCandidates.length > 0 ? { examType: { in: examTypeCandidates } } : {}),
    },
    select: {
      id: true,
      academicYearId: true,
      examType: true,
      semester: true,
      roomName: true,
      sessionId: true,
      sessionLabel: true,
      startTime: true,
      endTime: true,
      proctorId: true,
      proctor: {
        select: {
          id: true,
          name: true,
        },
      },
      layout: {
        select: {
          id: true,
          rows: true,
          columns: true,
          generatedAt: true,
          updatedAt: true,
        },
      },
      students: {
        select: {
          studentId: true,
        },
      },
    },
    orderBy: [{ roomName: 'asc' }, { id: 'asc' }],
  });
}

async function buildSittingStudentMap(sittings: SittingRow[], academicYearId: number) {
  const studentIds = Array.from(
    new Set(
      sittings
        .flatMap((sitting) => sitting.students.map((row) => Number(row.studentId)))
        .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
    ),
  );
  const historicalStudents = studentIds.length > 0
    ? await listHistoricalStudentsByIdsForAcademicYear(studentIds, academicYearId)
    : [];
  const historicalStudentMap = new Map(
    historicalStudents.map((student) => [
      student.id,
      {
        classId:
          Number.isFinite(Number(student.studentClass?.id)) && Number(student.studentClass?.id) > 0
            ? Number(student.studentClass?.id)
            : null,
        className: String(student.studentClass?.name || '').trim() || null,
      },
    ]),
  );

  const sittingStudentMap = new Map<number, SittngStudentClass[]>();
  sittings.forEach((sitting) => {
    const rows = sitting.students
      .map((row) => {
        const profile = historicalStudentMap.get(row.studentId) || null;
        return {
          studentId: Number(row.studentId),
          classId: profile?.classId ?? null,
          className: profile?.className ?? null,
        } satisfies SittngStudentClass;
      })
      .filter((row) => Number.isFinite(row.studentId) && row.studentId > 0);
    sittingStudentMap.set(sitting.id, rows);
  });

  return sittingStudentMap;
}

export async function listExamSittingRoomSlots(params: {
  academicYearId: number;
  examType?: string | null;
  programCode?: string | null;
  semester?: Semester | null;
  date?: Date | null;
}): Promise<ExamSittingRoomSlotResponse> {
  const resolvedExamType = String(params.programCode || params.examType || '').trim().toUpperCase() || null;
  const [scheduleData, sittings] = await Promise.all([
    loadScheduleGroups({
      academicYearId: params.academicYearId,
      examType: resolvedExamType,
      semester: params.semester || null,
      date: params.date || null,
    }),
    loadSittings({
      academicYearId: params.academicYearId,
      examType: resolvedExamType,
      semester: params.semester || null,
    }),
  ]);

  const sittingStudentMap = await buildSittingStudentMap(sittings, params.academicYearId);
  const representedScheduleIds = new Set<number>();
  const slots: ExamSittingRoomSlotRow[] = [];

  sittings.forEach((sitting) => {
    const studentRows = sittingStudentMap.get(sitting.id) || [];
    if (studentRows.length === 0) return;

    const sittingClassIds = new Set(
      studentRows
        .map((row) => Number(row.classId))
        .filter((classId) => Number.isFinite(classId) && classId > 0),
    );
    const sittingClassNames = new Set(
      studentRows
        .map((row) => String(row.className || '').trim())
        .filter(Boolean),
    );

    scheduleData.groups.forEach((group) => {
      if (!hasExamTypeIntersection(sitting.examType, group.examType)) return;
      if (!isSameDateScope(params.date, group.startTime)) return;
      if (
        !isSameSessionScope({
          leftSessionId: sitting.sessionId,
          leftSessionLabel: sitting.sessionLabel,
          rightSessionId: group.sessionId,
          rightSessionLabel: group.sessionLabel,
        })
      ) {
        return;
      }
      if (!isSameSlotTime(sitting.startTime, sitting.endTime, group.startTime, group.endTime)) return;

      const hasClassIntersection =
        Array.from(group.classIds.values()).some((classId) => sittingClassIds.has(classId)) ||
        Array.from(group.classNames.values()).some((className) => sittingClassNames.has(className));
      if (!hasClassIntersection) return;

      const matchedStudents = studentRows.filter((row) => {
        if (Number.isFinite(Number(row.classId)) && Number(row.classId) > 0 && group.classIds.has(Number(row.classId))) {
          return true;
        }
        return row.className ? group.classNames.has(row.className) : false;
      });
      if (matchedStudents.length === 0) return;

      group.scheduleIds.forEach((scheduleId) => representedScheduleIds.add(scheduleId));
      const matchedClassNames = Array.from(
        new Set(
          matchedStudents
            .map((row) => String(row.className || '').trim())
            .filter(Boolean),
        ),
      ).sort(compareClassName);
      const matchedClassIds = Array.from(
        new Set(
          matchedStudents
            .map((row) => Number(row.classId))
            .filter((classId) => Number.isFinite(classId) && classId > 0),
        ),
      );

      slots.push({
        key: buildRoomSlotKey({
          sittingId: sitting.id,
          roomName: sitting.roomName,
          startTime: group.startTime,
          endTime: group.endTime,
          periodNumber: group.periodNumber,
          sessionId: group.sessionId,
          sessionLabel: group.sessionLabel,
          subjectId: group.subjectId,
          subjectName: group.subjectName,
        }),
        timeKey: buildTimeKey(
          group.startTime,
          group.endTime,
          group.periodNumber,
          group.sessionId,
          group.sessionLabel,
        ),
        roomKey: `${normalizeRoomLookupKey(sitting.roomName) || '-'}::${buildTimeKey(
          group.startTime,
          group.endTime,
          group.periodNumber,
          group.sessionId,
          group.sessionLabel,
        )}`,
        sittingId: sitting.id,
        roomName: sitting.roomName,
        academicYearId: sitting.academicYearId,
        examType: group.examType,
        semester: sitting.semester || group.semester || null,
        startTime: group.startTime,
        endTime: group.endTime,
        periodNumber: group.periodNumber,
        sessionId: group.sessionId,
        sessionLabel: group.sessionLabel,
        subjectId: group.subjectId,
        subjectName: group.subjectName,
        subjectCode: group.subjectCode,
        packetTitle: group.packetTitle,
        scheduleIds: [...group.scheduleIds],
        classIds: matchedClassIds,
        classNames: matchedClassNames,
        participantCount: matchedStudents.length,
        proctorId: Number(sitting.proctorId || 0) || null,
        proctor: sitting.proctor
          ? {
              id: sitting.proctor.id,
              name: sitting.proctor.name,
            }
          : null,
        layout: sitting.layout
          ? {
              id: sitting.layout.id,
              rows: sitting.layout.rows,
              columns: sitting.layout.columns,
              generatedAt: sitting.layout.generatedAt,
              updatedAt: sitting.layout.updatedAt,
            }
          : null,
      });
    });
  });

  const unassignedSchedules = scheduleData.schedules
    .filter((schedule) => !representedScheduleIds.has(schedule.id))
    .map((schedule) => ({
      id: schedule.id,
      academicYearId:
        Number.isFinite(Number(schedule.academicYearId)) && Number(schedule.academicYearId) > 0
          ? Number(schedule.academicYearId)
          : params.academicYearId,
      examType: String(schedule.examType || '').trim() || (resolvedExamType || 'UJIAN'),
      semester: schedule.semester || null,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      periodNumber: Number(schedule.periodNumber || 0) || null,
      sessionId: Number(schedule.sessionId || 0) || null,
      sessionLabel: schedule.sessionLabel || null,
      subjectId: Number(schedule.subjectId || schedule.packet?.subject?.id || 0) || null,
      subjectName:
        String(schedule.subject?.name || schedule.packet?.subject?.name || '').trim() || 'Mata Pelajaran',
      subjectCode:
        String(schedule.subject?.code || schedule.packet?.subject?.code || '').trim() || null,
      packetTitle: String(schedule.packet?.title || '').trim() || null,
      classId: Number(schedule.class?.id || 0) || null,
      className: String(schedule.class?.name || '').trim() || null,
    }));

  const sortedSlots = [...slots].sort((a, b) => {
    const timeCompare = a.startTime.getTime() - b.startTime.getTime();
    if (timeCompare !== 0) return timeCompare;
    const periodCompare = Number(a.periodNumber || Number.MAX_SAFE_INTEGER) - Number(b.periodNumber || Number.MAX_SAFE_INTEGER);
    if (periodCompare !== 0) return periodCompare;
    const subjectCompare = String(a.subjectName || '').localeCompare(String(b.subjectName || ''), 'id', {
      sensitivity: 'base',
      numeric: true,
    });
    if (subjectCompare !== 0) return subjectCompare;
    const roomCompare = String(a.roomName || '').localeCompare(String(b.roomName || ''), 'id', {
      sensitivity: 'base',
      numeric: true,
    });
    if (roomCompare !== 0) return roomCompare;
    return a.sittingId - b.sittingId;
  });

  return {
    slots: sortedSlots,
    unassignedSchedules,
  };
}
