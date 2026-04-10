import { Prisma, Semester } from '@prisma/client';
import prisma from '../utils/prisma';
import { listHistoricalStudentsForClass } from '../utils/studentAcademicHistory';
import { normalizeExamProgramCode } from './examEligibility.service';

type PlacementSyncSummary = {
  createdAssignments: number;
  assignedSeats: number;
  affectedStudentIds: number[];
  unresolvedStudentIds: number[];
};

function normalizeAliasCode(raw: unknown) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRoomName(raw: unknown) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function compareRoomName(left: string, right: string) {
  return left.localeCompare(right, 'id-ID', {
    numeric: true,
    sensitivity: 'base',
  });
}

function resolveProgramCodeCandidates(programCode: string) {
  const normalizedProgramCode = normalizeAliasCode(programCode);
  const candidates = new Set<string>();

  if (!normalizedProgramCode) {
    return [];
  }

  candidates.add(normalizedProgramCode);

  if (['SBTS', 'MIDTERM', 'SUMATIF_BERSAMA_TENGAH_SEMESTER'].includes(normalizedProgramCode)) {
    candidates.add('SBTS');
    candidates.add('MIDTERM');
    candidates.add('SUMATIF_BERSAMA_TENGAH_SEMESTER');
  }

  if (['SAS', 'SUMATIF_AKHIR_SEMESTER'].includes(normalizedProgramCode)) {
    candidates.add('SAS');
    candidates.add('SUMATIF_AKHIR_SEMESTER');
  }

  if (['SAT', 'SUMATIF_AKHIR_TAHUN'].includes(normalizedProgramCode)) {
    candidates.add('SAT');
    candidates.add('SUMATIF_AKHIR_TAHUN');
  }

  if (['ASAJ', 'ASESMEN_SUMATIF_AKHIR_JENJANG'].includes(normalizedProgramCode)) {
    candidates.add('ASAJ');
    candidates.add('ASESMEN_SUMATIF_AKHIR_JENJANG');
  }

  if (['ASAJP', 'ASAJ_PRAKTIK', 'ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK', 'PSAJ'].includes(normalizedProgramCode)) {
    candidates.add('ASAJP');
    candidates.add('ASAJ_PRAKTIK');
    candidates.add('ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK');
    candidates.add('PSAJ');
  }

  return Array.from(candidates);
}

type SittingCandidateState = {
  sittingId: number;
  roomName: string;
  classStudentCount: number;
  freeSeatCellIds: number[];
};

async function reconcileMissingStudentPlacementsInternal(params: {
  academicYearId: number;
  programCode: string;
  semester?: Semester;
  tx?: Prisma.TransactionClient;
}): Promise<PlacementSyncSummary> {
  const normalizedProgramCode = normalizeExamProgramCode(params.programCode);
  if (!normalizedProgramCode) {
    return {
      createdAssignments: 0,
      assignedSeats: 0,
      affectedStudentIds: [],
      unresolvedStudentIds: [],
    };
  }

  const client = params.tx ?? prisma;
  const scheduleProgramCandidates = resolveProgramCodeCandidates(normalizedProgramCode);

  const [activeSchedules, sittings] = await Promise.all([
    client.examSchedule.findMany({
      where: {
        academicYearId: params.academicYearId,
        isActive: true,
        ...(params.semester ? { semester: params.semester } : {}),
        OR: [
          {
            examType: {
              in: scheduleProgramCandidates,
            },
          },
          {
            packet: {
              is: {
                programCode: {
                  in: scheduleProgramCandidates,
                },
              },
            },
          },
        ],
      },
      select: {
        classId: true,
        room: true,
      },
    }),
    client.examSitting.findMany({
      where: {
        academicYearId: params.academicYearId,
        examType: normalizedProgramCode,
        ...(params.semester ? { semester: params.semester } : {}),
      },
      select: {
        id: true,
        roomName: true,
        students: {
          select: {
            studentId: true,
            student: {
              select: {
                classId: true,
              },
            },
          },
        },
        layout: {
          select: {
            cells: {
              select: {
                id: true,
                rowIndex: true,
                columnIndex: true,
                cellType: true,
                studentId: true,
              },
            },
          },
        },
      },
      orderBy: [{ roomName: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const scheduledClassIds = Array.from(
    new Set(
      activeSchedules
        .map((schedule) => Number(schedule.classId || 0))
        .filter((classId): classId is number => Number.isFinite(classId) && classId > 0),
    ),
  );
  if (!scheduledClassIds.length || !sittings.length) {
    return {
      createdAssignments: 0,
      assignedSeats: 0,
      affectedStudentIds: [],
      unresolvedStudentIds: [],
    };
  }

  const scheduleRoomsByClassId = new Map<number, Set<string>>();
  activeSchedules.forEach((schedule) => {
    const classId = Number(schedule.classId || 0);
    const roomName = normalizeRoomName(schedule.room);
    if (!Number.isFinite(classId) || classId <= 0 || !roomName) {
      return;
    }
    const current = scheduleRoomsByClassId.get(classId) || new Set<string>();
    current.add(roomName);
    scheduleRoomsByClassId.set(classId, current);
  });

  const assignedStudentIds = new Set<number>();
  const sittingStates = new Map<number, SittingCandidateState>();

  sittings.forEach((sitting) => {
    const classCounts = new Map<number, number>();
    sitting.students.forEach((row) => {
      const studentId = Number(row.studentId || 0);
      if (Number.isFinite(studentId) && studentId > 0) {
        assignedStudentIds.add(studentId);
      }
      const classId = Number(row.student?.classId || 0);
      if (Number.isFinite(classId) && classId > 0) {
        classCounts.set(classId, (classCounts.get(classId) || 0) + 1);
      }
    });
    const freeSeatCellIds = (sitting.layout?.cells || [])
      .filter((cell) => cell.cellType === 'SEAT' && !cell.studentId)
      .sort((left, right) => {
        if (left.rowIndex !== right.rowIndex) return left.rowIndex - right.rowIndex;
        return left.columnIndex - right.columnIndex;
      })
      .map((cell) => cell.id);
    sittingStates.set(sitting.id, {
      sittingId: sitting.id,
      roomName: normalizeRoomName(sitting.roomName),
      classStudentCount: 0,
      freeSeatCellIds,
    });
    classCounts.forEach((count, classId) => {
      const state = sittingStates.get(sitting.id);
      if (!state) return;
      if (count > state.classStudentCount) {
        state.classStudentCount = count;
      }
      sittingStates.set(sitting.id, state);
    });
  });

  const assignmentRows: Array<{ sittingId: number; studentId: number }> = [];
  const seatRows: Array<{ cellId: number; studentId: number }> = [];
  const affectedStudentIds = new Set<number>();
  const unresolvedStudentIds = new Set<number>();

  for (const classId of scheduledClassIds) {
    const roster = await listHistoricalStudentsForClass(classId, params.academicYearId);
    const missingStudents = roster.filter((student) => {
      const studentId = Number(student.id || 0);
      return (
        Number.isFinite(studentId) &&
        studentId > 0 &&
        student.studentStatus === 'ACTIVE' &&
        !assignedStudentIds.has(studentId)
      );
    });

    if (!missingStudents.length) {
      continue;
    }

    const preferredRooms = scheduleRoomsByClassId.get(classId) || new Set<string>();
    const candidateStates = sittings
      .map((sitting) => {
        const state = sittingStates.get(sitting.id);
        if (!state || state.freeSeatCellIds.length === 0) return null;
        const classCount = sitting.students.filter((row) => Number(row.student?.classId || 0) === classId).length;
        return {
          state,
          classCount,
          roomMatched: preferredRooms.has(state.roomName),
        };
      })
      .filter((item): item is { state: SittingCandidateState; classCount: number; roomMatched: boolean } => Boolean(item))
      .filter((item) => item.roomMatched || item.classCount > 0)
      .sort((left, right) => {
        if (left.roomMatched !== right.roomMatched) return left.roomMatched ? -1 : 1;
        if (left.classCount !== right.classCount) return right.classCount - left.classCount;
        if (left.state.freeSeatCellIds.length !== right.state.freeSeatCellIds.length) {
          return right.state.freeSeatCellIds.length - left.state.freeSeatCellIds.length;
        }
        return compareRoomName(left.state.roomName, right.state.roomName);
      });

    for (const student of missingStudents) {
      const targetCandidate = candidateStates.find((candidate) => candidate.state.freeSeatCellIds.length > 0) || null;
      const studentId = Number(student.id || 0);
      if (!targetCandidate || !Number.isFinite(studentId) || studentId <= 0) {
        unresolvedStudentIds.add(studentId);
        continue;
      }

      const seatCellId = targetCandidate.state.freeSeatCellIds.shift() || null;
      assignmentRows.push({
        sittingId: targetCandidate.state.sittingId,
        studentId,
      });
      if (seatCellId) {
        seatRows.push({
          cellId: seatCellId,
          studentId,
        });
      }
      targetCandidate.classCount += 1;
      assignedStudentIds.add(studentId);
      affectedStudentIds.add(studentId);
    }
  }

  if (!assignmentRows.length) {
    return {
      createdAssignments: 0,
      assignedSeats: 0,
      affectedStudentIds: Array.from(affectedStudentIds),
      unresolvedStudentIds: Array.from(unresolvedStudentIds).filter((studentId) => studentId > 0),
    };
  }

  await client.examSittingStudent.createMany({
    data: assignmentRows,
    skipDuplicates: true,
  });

  for (const seatRow of seatRows) {
    await client.examSittingLayoutCell.updateMany({
      where: {
        id: seatRow.cellId,
        studentId: null,
      },
      data: {
        studentId: seatRow.studentId,
      },
    });
  }

  return {
    createdAssignments: assignmentRows.length,
    assignedSeats: seatRows.length,
    affectedStudentIds: Array.from(affectedStudentIds),
    unresolvedStudentIds: Array.from(unresolvedStudentIds).filter((studentId) => studentId > 0),
  };
}

export async function reconcileMissingStudentPlacements(params: {
  academicYearId: number;
  programCode: string;
  semester?: Semester;
  tx?: Prisma.TransactionClient;
}) {
  if (params.tx) {
    return reconcileMissingStudentPlacementsInternal(params);
  }
  return prisma.$transaction((tx) =>
    reconcileMissingStudentPlacementsInternal({
      ...params,
      tx,
    }),
  );
}

export async function reconcileMissingStudentPlacementsForStudent(params: {
  academicYearId: number;
  studentId: number;
}) {
  const student = await prisma.user.findUnique({
    where: { id: params.studentId },
    select: {
      id: true,
      classId: true,
    },
  });
  const classId = Number(student?.classId || 0);
  if (!Number.isFinite(classId) || classId <= 0) {
    return [];
  }

  const scheduleGroups = await prisma.examSchedule.findMany({
    where: {
      academicYearId: params.academicYearId,
      isActive: true,
      classId,
    },
    select: {
      examType: true,
      semester: true,
    },
    distinct: ['examType', 'semester'],
  });

  const summaries: PlacementSyncSummary[] = [];
  for (const group of scheduleGroups) {
    const normalizedProgramCode = normalizeExamProgramCode(group.examType);
    if (!normalizedProgramCode) continue;
    const summary = await reconcileMissingStudentPlacements({
      academicYearId: params.academicYearId,
      programCode: normalizedProgramCode,
      semester: group.semester || undefined,
    });
    if (summary.createdAssignments > 0 || summary.assignedSeats > 0 || summary.unresolvedStudentIds.length > 0) {
      summaries.push(summary);
    }
  }

  return summaries;
}
