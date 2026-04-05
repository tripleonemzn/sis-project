import { ExamSittingLayoutCellType } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { assertCurriculumExamManagerAccess } from '../utils/examManagementAccess';
import { listHistoricalStudentsByIdsForAcademicYear } from '../utils/studentAcademicHistory';

const MAX_LAYOUT_ROWS = 20;
const MAX_LAYOUT_COLUMNS = 20;

const generateLayoutSchema = z.object({
  rows: z.coerce.number().int().min(1).max(MAX_LAYOUT_ROWS).optional(),
  columns: z.coerce.number().int().min(1).max(MAX_LAYOUT_COLUMNS).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const layoutCellSchema = z.object({
  rowIndex: z.coerce.number().int().min(0),
  columnIndex: z.coerce.number().int().min(0),
  cellType: z.nativeEnum(ExamSittingLayoutCellType),
  seatLabel: z.string().trim().max(30).optional().nullable(),
  studentId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(200).optional().nullable(),
});

const updateLayoutSchema = z.object({
  rows: z.coerce.number().int().min(1).max(MAX_LAYOUT_ROWS),
  columns: z.coerce.number().int().min(1).max(MAX_LAYOUT_COLUMNS),
  notes: z.string().trim().max(500).optional().nullable(),
  cells: z.array(layoutCellSchema).max(MAX_LAYOUT_ROWS * MAX_LAYOUT_COLUMNS),
});

function getLayoutPositionKey(rowIndex: number, columnIndex: number) {
  return `${rowIndex}:${columnIndex}`;
}

function getSeatLabel(rowIndex: number, columnIndex: number) {
  let index = rowIndex;
  let label = '';
  do {
    label = String.fromCharCode(65 + (index % 26)) + label;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return `${label}${columnIndex + 1}`;
}

function deriveDefaultLayoutDimensions(studentCount: number) {
  const normalizedStudentCount = Math.max(1, Math.trunc(Number(studentCount) || 0));
  const columns = Math.min(MAX_LAYOUT_COLUMNS, Math.max(4, Math.ceil(Math.sqrt(normalizedStudentCount))));
  const rows = Math.min(MAX_LAYOUT_ROWS, Math.max(1, Math.ceil(normalizedStudentCount / columns)));
  return {
    rows,
    columns,
  };
}

function normalizeLayoutDimensions(params: { rows?: number | null; columns?: number | null; studentCount: number }) {
  const fallback = deriveDefaultLayoutDimensions(params.studentCount);
  const rows = params.rows && Number.isFinite(params.rows) ? Math.max(1, Math.min(MAX_LAYOUT_ROWS, Math.trunc(params.rows))) : fallback.rows;
  const columns =
    params.columns && Number.isFinite(params.columns)
      ? Math.max(1, Math.min(MAX_LAYOUT_COLUMNS, Math.trunc(params.columns)))
      : fallback.columns;

  if (rows * columns < params.studentCount) {
    throw new ApiError(400, 'Ukuran denah tidak cukup untuk menampung seluruh siswa pada ruang ujian ini.');
  }

  return { rows, columns };
}

async function loadSittingWithStudents(sittingId: number) {
  const sitting = await prisma.examSitting.findUnique({
    where: { id: sittingId },
    include: {
      programSession: {
        select: {
          id: true,
          label: true,
          displayOrder: true,
        },
      },
      students: {
        select: {
          studentId: true,
        },
      },
      layout: {
        include: {
          cells: {
            orderBy: [{ rowIndex: 'asc' }, { columnIndex: 'asc' }],
          },
        },
      },
    },
  });

  if (!sitting) {
    throw new ApiError(404, 'Ruang ujian tidak ditemukan.');
  }

  const studentIds = Array.from(new Set((sitting.students || []).map((item) => Number(item.studentId)).filter((id) => Number.isFinite(id) && id > 0)));
  const historicalStudents = await listHistoricalStudentsByIdsForAcademicYear(studentIds, sitting.academicYearId);
  const studentMap = new Map(historicalStudents.map((student) => [student.id, student]));

  return {
    sitting,
    studentIds,
    historicalStudents,
    studentMap,
  };
}

function buildLayoutResponse(params: {
  sitting: Awaited<ReturnType<typeof loadSittingWithStudents>>['sitting'];
  historicalStudents: Awaited<ReturnType<typeof loadSittingWithStudents>>['historicalStudents'];
  studentMap: Awaited<ReturnType<typeof loadSittingWithStudents>>['studentMap'];
}) {
  const { sitting, historicalStudents, studentMap } = params;
  const studentSeatMap = new Map<number, { seatLabel: string | null; rowIndex: number; columnIndex: number }>();

  (sitting.layout?.cells || []).forEach((cell) => {
    if (!cell.studentId) return;
    studentSeatMap.set(cell.studentId, {
      seatLabel: cell.seatLabel || getSeatLabel(cell.rowIndex, cell.columnIndex),
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
    });
  });

  return {
    sitting: {
      id: sitting.id,
      roomName: sitting.roomName,
      examType: sitting.examType,
      academicYearId: sitting.academicYearId,
      semester: sitting.semester,
      startTime: sitting.startTime,
      endTime: sitting.endTime,
      sessionId: sitting.sessionId,
      sessionLabel: sitting.sessionLabel,
      programSession: sitting.programSession,
    },
    layout: sitting.layout
      ? {
          id: sitting.layout.id,
          rows: sitting.layout.rows,
          columns: sitting.layout.columns,
          notes: sitting.layout.notes,
          generatedAt: sitting.layout.generatedAt,
          updatedAt: sitting.layout.updatedAt,
          generatedById: sitting.layout.generatedById,
          cells: sitting.layout.cells.map((cell) => {
            const student = cell.studentId ? studentMap.get(cell.studentId) || null : null;
            return {
              id: cell.id,
              rowIndex: cell.rowIndex,
              columnIndex: cell.columnIndex,
              cellType: cell.cellType,
              seatLabel: cell.seatLabel || (cell.cellType === ExamSittingLayoutCellType.SEAT ? getSeatLabel(cell.rowIndex, cell.columnIndex) : null),
              studentId: cell.studentId,
              notes: cell.notes,
              student: student
                ? {
                    id: student.id,
                    name: student.name,
                    nis: student.nis || null,
                    nisn: student.nisn || null,
                    className: student.studentClass?.name || null,
                  }
                : null,
            };
          }),
        }
      : null,
    students: historicalStudents.map((student) => ({
      id: student.id,
      name: student.name,
      nis: student.nis || null,
      nisn: student.nisn || null,
      className: student.studentClass?.name || null,
      seatLabel: studentSeatMap.get(student.id)?.seatLabel || null,
    })),
    meta: {
      studentCount: historicalStudents.length,
      suggestedDimensions: deriveDefaultLayoutDimensions(historicalStudents.length),
      hasGeneratedLayout: Boolean(sitting.layout),
    },
  };
}

export const getExamSittingLayout = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id?: number } | undefined;
  if (!user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCurriculumExamManagerAccess(Number(user.id), { allowAdmin: true });

  const sittingId = Number(req.params.id);
  if (!Number.isFinite(sittingId) || sittingId <= 0) {
    throw new ApiError(400, 'ID ruang ujian tidak valid.');
  }

  const payload = await loadSittingWithStudents(sittingId);
  res.status(200).json(new ApiResponse(200, buildLayoutResponse(payload), 'Denah ruang ujian berhasil diambil'));
});

export const generateExamSittingLayout = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id?: number } | undefined;
  if (!user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCurriculumExamManagerAccess(Number(user.id), { allowAdmin: true });

  const sittingId = Number(req.params.id);
  if (!Number.isFinite(sittingId) || sittingId <= 0) {
    throw new ApiError(400, 'ID ruang ujian tidak valid.');
  }

  const body = generateLayoutSchema.parse(req.body);
  const payload = await loadSittingWithStudents(sittingId);
  const { rows, columns } = normalizeLayoutDimensions({
    rows: body.rows || null,
    columns: body.columns || null,
    studentCount: payload.historicalStudents.length,
  });

  const cells = Array.from({ length: rows * columns }, (_, index) => {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;
    const student = payload.historicalStudents[index] || null;
    return {
      rowIndex,
      columnIndex,
      cellType: ExamSittingLayoutCellType.SEAT,
      seatLabel: getSeatLabel(rowIndex, columnIndex),
      studentId: student?.id || null,
      notes: null as string | null,
    };
  });

  await prisma.$transaction(async (tx) => {
    const layout = await tx.examSittingLayout.upsert({
      where: { sittingId },
      update: {
        rows,
        columns,
        notes: body.notes?.trim() || null,
        generatedAt: new Date(),
        generatedById: Number(user.id),
      },
      create: {
        sittingId,
        rows,
        columns,
        notes: body.notes?.trim() || null,
        generatedAt: new Date(),
        generatedById: Number(user.id),
      },
      select: { id: true },
    });

    await tx.examSittingLayoutCell.deleteMany({
      where: { layoutId: layout.id },
    });

    if (cells.length > 0) {
      await tx.examSittingLayoutCell.createMany({
        data: cells.map((cell) => ({
          layoutId: layout.id,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          cellType: cell.cellType,
          seatLabel: cell.seatLabel,
          studentId: cell.studentId,
          notes: cell.notes,
        })),
      });
    }
  });

  const updatedPayload = await loadSittingWithStudents(sittingId);
  res.status(200).json(new ApiResponse(200, buildLayoutResponse(updatedPayload), 'Denah ruang ujian berhasil digenerate'));
});

export const updateExamSittingLayout = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id?: number } | undefined;
  if (!user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCurriculumExamManagerAccess(Number(user.id), { allowAdmin: true });

  const sittingId = Number(req.params.id);
  if (!Number.isFinite(sittingId) || sittingId <= 0) {
    throw new ApiError(400, 'ID ruang ujian tidak valid.');
  }

  const body = updateLayoutSchema.parse(req.body);
  const payload = await loadSittingWithStudents(sittingId);
  const studentIdSet = new Set(payload.studentIds);
  const assignedStudentIds = new Set<number>();
  const seenPositions = new Set<string>();

  const normalizedCells = body.cells.map((cell) => {
    if (cell.rowIndex >= body.rows || cell.columnIndex >= body.columns) {
      throw new ApiError(400, 'Posisi sel denah berada di luar ukuran grid.');
    }
    const positionKey = getLayoutPositionKey(cell.rowIndex, cell.columnIndex);
    if (seenPositions.has(positionKey)) {
      throw new ApiError(400, 'Terdapat posisi kursi yang duplikat pada denah.');
    }
    seenPositions.add(positionKey);

    const normalizedCellType = cell.cellType;
    const normalizedStudentId =
      normalizedCellType === ExamSittingLayoutCellType.SEAT && cell.studentId ? Number(cell.studentId) : null;
    if (normalizedStudentId && !studentIdSet.has(normalizedStudentId)) {
      throw new ApiError(400, 'Siswa yang ditempatkan tidak termasuk peserta ruang ujian ini.');
    }
    if (normalizedStudentId && assignedStudentIds.has(normalizedStudentId)) {
      throw new ApiError(400, 'Satu siswa hanya boleh menempati satu kursi pada denah.');
    }
    if (normalizedStudentId) {
      assignedStudentIds.add(normalizedStudentId);
    }

    return {
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
      cellType: normalizedCellType,
      seatLabel:
        normalizedCellType === ExamSittingLayoutCellType.SEAT
          ? String(cell.seatLabel || '').trim() || getSeatLabel(cell.rowIndex, cell.columnIndex)
          : null,
      studentId: normalizedStudentId,
      notes: cell.notes?.trim() || null,
    };
  });

  for (let rowIndex = 0; rowIndex < body.rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < body.columns; columnIndex += 1) {
      const key = getLayoutPositionKey(rowIndex, columnIndex);
      if (seenPositions.has(key)) continue;
      normalizedCells.push({
        rowIndex,
        columnIndex,
        cellType: ExamSittingLayoutCellType.AISLE,
        seatLabel: null,
        studentId: null,
        notes: null,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const layout = await tx.examSittingLayout.upsert({
      where: { sittingId },
      update: {
        rows: body.rows,
        columns: body.columns,
        notes: body.notes?.trim() || null,
      },
      create: {
        sittingId,
        rows: body.rows,
        columns: body.columns,
        notes: body.notes?.trim() || null,
        generatedAt: new Date(),
        generatedById: Number(user.id),
      },
      select: { id: true },
    });

    await tx.examSittingLayoutCell.deleteMany({
      where: { layoutId: layout.id },
    });

    if (normalizedCells.length > 0) {
      await tx.examSittingLayoutCell.createMany({
        data: normalizedCells.map((cell) => ({
          layoutId: layout.id,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          cellType: cell.cellType,
          seatLabel: cell.seatLabel,
          studentId: cell.studentId,
          notes: cell.notes,
        })),
      });
    }
  });

  const updatedPayload = await loadSittingWithStudents(sittingId);
  res.status(200).json(new ApiResponse(200, buildLayoutResponse(updatedPayload), 'Denah ruang ujian berhasil diperbarui'));
});
