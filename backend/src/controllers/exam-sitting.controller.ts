import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';
import { ExamGeneratedCardStatus, ExamType, Semester, Prisma } from '@prisma/client';
import {
    type HistoricalStudentSnapshot,
    listHistoricalStudentsByIdsForAcademicYear,
} from '../utils/studentAcademicHistory';
import { listExamSittingRoomSlots } from '../services/examSittingRoomSlot.service';
import { listStudentExamPlacementSlots } from '../services/examSittingRoomSlot.service';
import {
    buildExamSittingSlotProctorKey,
    saveExamSittingSlotProctorAssignment,
} from '../services/examSittingSlotProctor.service';
import { reconcileMissingStudentPlacementsForStudent } from '../services/examStudentPlacementSync.service';

function normalizeAliasCode(raw: unknown): string {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/QUIZ/g, 'FORMATIF')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizeRoomLookupKey(raw: unknown): string {
    return String(raw || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]+/g, '')
        .trim();
}

function isNonScheduledExamProgramCode(raw: unknown): boolean {
    const normalized = normalizeAliasCode(raw);
    if (!normalized) return false;
    return ['UH', 'ULANGAN_HARIAN', 'FORMATIF', 'FORMATIVE'].includes(normalized);
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

function isExamEligibleRoomType(raw: unknown): boolean {
    const normalized = normalizeAliasCode(raw);
    if (!normalized) return false;
    return (
        normalized.includes('KELAS') ||
        normalized.includes('CLASS') ||
        normalized.includes('PRAKTIK') ||
        normalized.includes('PRAKTEK') ||
        normalized.includes('LAB') ||
        normalized.includes('LABORATORIUM')
    );
}

function normalizeOptionalSessionLabel(rawSessionLabel: unknown): string | null {
    if (rawSessionLabel === undefined || rawSessionLabel === null) {
        return null;
    }
    const normalized = String(rawSessionLabel)
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return null;
    if (normalized.length > 60) {
        throw new ApiError(400, 'Label sesi maksimal 60 karakter.');
    }
    return normalized;
}

function normalizeSessionLabelKey(rawLabel: unknown): string | null {
    const normalized = normalizeOptionalSessionLabel(rawLabel);
    if (!normalized) return null;
    return normalized.toLowerCase();
}

function parseOptionalSemester(rawSemester: unknown): Semester | undefined {
    const normalized = String(rawSemester || '').trim().toUpperCase();
    if (!normalized) return undefined;
    if (normalized === Semester.ODD || normalized === Semester.EVEN) {
        return normalized as Semester;
    }
    throw new ApiError(400, 'semester tidak valid.');
}

async function resolveCanonicalProgramCode(params: {
    academicYearId: number;
    rawProgramCode?: unknown;
    rawExamType?: unknown;
}): Promise<string | null> {
    const normalizedProgramCode = normalizeAliasCode(params.rawProgramCode);
    if (normalizedProgramCode) return normalizedProgramCode;

    const normalizedExamType = normalizeAliasCode(params.rawExamType);
    if (!normalizedExamType) return null;

    const config = await prisma.examProgramConfig.findFirst({
        where: {
            academicYearId: params.academicYearId,
            OR: [{ code: normalizedExamType }, { baseTypeCode: normalizedExamType }],
        },
        orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }, { id: 'asc' }],
        select: { code: true },
    });
    return config?.code || normalizedExamType;
}

async function resolveProgramSessionReference(params: {
    academicYearId: number;
    programCode: string;
    sessionId?: unknown;
    sessionLabel?: unknown;
}): Promise<{ id: number; label: string } | null> {
    const hasSessionIdPayload = params.sessionId !== undefined;
    const hasSessionLabelPayload = params.sessionLabel !== undefined;
    if (!hasSessionIdPayload && !hasSessionLabelPayload) {
        return null;
    }

    const parsedSessionId =
        params.sessionId === null || params.sessionId === ''
            ? null
            : params.sessionId === undefined
              ? undefined
              : Number(params.sessionId);
    if (typeof parsedSessionId === 'number' && (!Number.isFinite(parsedSessionId) || parsedSessionId <= 0)) {
        throw new ApiError(400, 'sessionId tidak valid.');
    }

    if (typeof parsedSessionId === 'number') {
        const selectedSession = await prisma.examProgramSession.findUnique({
            where: { id: parsedSessionId },
            select: { id: true, label: true, academicYearId: true, programCode: true, isActive: true },
        });
        if (!selectedSession || !selectedSession.isActive) {
            throw new ApiError(404, 'Sesi tidak ditemukan atau tidak aktif.');
        }
        if (
            selectedSession.academicYearId !== params.academicYearId ||
            selectedSession.programCode !== params.programCode
        ) {
            throw new ApiError(400, 'Sesi tidak sesuai dengan tahun ajaran/program ujian yang dipilih.');
        }
        return { id: selectedSession.id, label: selectedSession.label };
    }

    const normalizedSessionLabel = normalizeOptionalSessionLabel(params.sessionLabel);
    const normalizedLabelKey = normalizeSessionLabelKey(params.sessionLabel);
    if (!normalizedSessionLabel || !normalizedLabelKey) {
        return null;
    }

    const maxDisplayOrder = await prisma.examProgramSession.aggregate({
        where: {
            academicYearId: params.academicYearId,
            programCode: params.programCode,
        },
        _max: { displayOrder: true },
    });

    const session = await prisma.examProgramSession.upsert({
        where: {
            academicYearId_programCode_normalizedLabel: {
                academicYearId: params.academicYearId,
                programCode: params.programCode,
                normalizedLabel: normalizedLabelKey,
            },
        },
        create: {
            academicYearId: params.academicYearId,
            programCode: params.programCode,
            label: normalizedSessionLabel,
            normalizedLabel: normalizedLabelKey,
            displayOrder: (maxDisplayOrder._max.displayOrder ?? 0) + 1,
            isActive: true,
        },
        update: {
            label: normalizedSessionLabel,
            isActive: true,
        },
        select: { id: true, label: true },
    });

    return session;
}

function buildScheduleSessionScope(
    sessionId: number | null,
    sessionLabel: string | null,
): Prisma.ExamScheduleWhereInput {
    const normalizedLabel = normalizeOptionalSessionLabel(sessionLabel);
    if (sessionId && Number.isFinite(sessionId) && sessionId > 0) {
        const orConditions: Prisma.ExamScheduleWhereInput[] = [{ sessionId }];
        if (normalizedLabel) {
            orConditions.push({
                sessionId: null,
                sessionLabel: normalizedLabel,
            });
        }
        return {
            OR: orConditions,
        };
    }

    return {
        sessionId: null,
        sessionLabel: normalizedLabel || null,
    };
}

function buildExamScheduleScopeForSittingSync(params: {
    academicYearId: number;
    examType?: string | null;
    semester?: Semester | null;
    sessionId?: number | null;
    sessionLabel?: string | null;
    classIds: number[];
}): Prisma.ExamScheduleWhereInput {
    const normalizedClassIds = Array.from(
        new Set(
            (Array.isArray(params.classIds) ? params.classIds : [])
                .map((value) => Number(value))
                .filter((value): value is number => Number.isFinite(value) && value > 0),
        ),
    );
    if (normalizedClassIds.length === 0) {
        return { id: { in: [] } };
    }

    const examTypeCandidates = resolveExamTypeCandidates(params.examType);
    return {
        academicYearId: params.academicYearId,
        classId: { in: normalizedClassIds },
        ...(params.semester ? { semester: params.semester } : {}),
        ...(examTypeCandidates.length > 0
            ? {
                  examType: {
                      in: examTypeCandidates,
                  },
              }
            : params.examType
              ? { examType: String(params.examType) }
              : {}),
        ...buildScheduleSessionScope(params.sessionId ?? null, params.sessionLabel ?? null),
    };
}

async function syncExamScheduleRoomsForSitting(
    tx: Prisma.TransactionClient,
    params: {
        previousScope?: {
            academicYearId: number;
            examType?: string | null;
            semester?: Semester | null;
            sessionId?: number | null;
            sessionLabel?: string | null;
            roomName?: string | null;
            classIds: number[];
        } | null;
        nextScope?: {
            academicYearId: number;
            examType?: string | null;
            semester?: Semester | null;
            sessionId?: number | null;
            sessionLabel?: string | null;
            roomName?: string | null;
            classIds: number[];
        } | null;
    },
): Promise<void> {
    const previousRoomName = String(params.previousScope?.roomName || '').trim();
    if (params.previousScope && previousRoomName) {
        const previousWhere = buildExamScheduleScopeForSittingSync({
            academicYearId: params.previousScope.academicYearId,
            examType: params.previousScope.examType,
            semester: params.previousScope.semester,
            sessionId: params.previousScope.sessionId,
            sessionLabel: params.previousScope.sessionLabel,
            classIds: params.previousScope.classIds,
        });
        await tx.examSchedule.updateMany({
            where: {
                ...previousWhere,
                room: previousRoomName,
            },
            data: {
                room: null,
            },
        });
    }

    const nextRoomName = String(params.nextScope?.roomName || '').trim();
    if (params.nextScope && nextRoomName) {
        const nextWhere = buildExamScheduleScopeForSittingSync({
            academicYearId: params.nextScope.academicYearId,
            examType: params.nextScope.examType,
            semester: params.nextScope.semester,
            sessionId: params.nextScope.sessionId,
            sessionLabel: params.nextScope.sessionLabel,
            classIds: params.nextScope.classIds,
        });
        await tx.examSchedule.updateMany({
            where: nextWhere,
            data: {
                room: nextRoomName,
            },
        });
    }
}

async function revokeGeneratedCardsForStudentsWithoutSitting(
    tx: Prisma.TransactionClient,
    params: {
        academicYearId: number;
        examType?: string | null;
        semester?: Semester | null;
        studentIds: number[];
        reason: string;
    },
): Promise<void> {
    const normalizedStudentIds = Array.from(
        new Set(
            (Array.isArray(params.studentIds) ? params.studentIds : [])
                .map((value) => Number(value))
                .filter((value): value is number => Number.isFinite(value) && value > 0),
        ),
    );
    const normalizedProgramCode = normalizeAliasCode(params.examType);
    if (!normalizedStudentIds.length || !normalizedProgramCode) {
        return;
    }

    const examTypeCandidates = resolveExamTypeCandidates(normalizedProgramCode);
    const remainingAssignments = await tx.examSittingStudent.findMany({
        where: {
            studentId: { in: normalizedStudentIds },
            sitting: {
                academicYearId: params.academicYearId,
                ...(params.semester ? { semester: params.semester } : {}),
                ...(examTypeCandidates.length > 0
                    ? {
                          examType: {
                              in: examTypeCandidates,
                          },
                      }
                    : {}),
            },
        },
        select: {
            studentId: true,
        },
    });
    const remainingStudentIdSet = new Set(
        remainingAssignments
            .map((row) => Number(row.studentId))
            .filter((studentId): studentId is number => Number.isFinite(studentId) && studentId > 0),
    );
    const staleStudentIds = normalizedStudentIds.filter((studentId) => !remainingStudentIdSet.has(studentId));
    if (staleStudentIds.length === 0) {
        return;
    }

    await tx.examGeneratedCard.updateMany({
        where: {
            academicYearId: params.academicYearId,
            programCode: normalizedProgramCode,
            ...(params.semester ? { semester: params.semester } : {}),
            studentId: { in: staleStudentIds },
            status: ExamGeneratedCardStatus.ACTIVE,
        },
        data: {
            status: ExamGeneratedCardStatus.REVOKED,
            revokedAt: new Date(),
            revokedReason: params.reason,
        },
    });
}

function normalizeClassLevelForProgramScope(raw: unknown): string {
    const value = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    if (!value) return '';
    if (value === '10' || value === 'X') return 'X';
    if (value === '11' || value === 'XI') return 'XI';
    if (value === '12' || value === 'XII') return 'XII';
    return '';
}

async function resolveProgramScopeConfig(params: {
    academicYearId: number;
    programCode?: string | null;
}) {
    const normalizedProgramCode = normalizeAliasCode(params.programCode);
    if (!normalizedProgramCode) return null;
    return prisma.examProgramConfig.findFirst({
        where: {
            academicYearId: params.academicYearId,
            code: normalizedProgramCode,
        },
        select: {
            code: true,
            targetClassLevels: true,
        },
    });
}

async function assertSittingClassLevelScope(params: {
    academicYearId: number;
    programCode?: string | null;
    classIds: number[];
}) {
    if (!Array.isArray(params.classIds) || params.classIds.length === 0) return;
    const scopeConfig = await resolveProgramScopeConfig({
        academicYearId: params.academicYearId,
        programCode: params.programCode,
    });
    if (!scopeConfig) return;

    const allowedLevels = new Set(
        (scopeConfig.targetClassLevels || [])
            .map((item) => normalizeClassLevelForProgramScope(item))
            .filter((item): item is string => Boolean(item)),
    );
    if (allowedLevels.size === 0) return;

    const classes = await prisma.class.findMany({
        where: { id: { in: params.classIds } },
        select: {
            id: true,
            name: true,
            level: true,
        },
    });

    const invalidClasses = classes.filter(
        (item) => !allowedLevels.has(normalizeClassLevelForProgramScope(item.level)),
    );

    if (invalidClasses.length > 0) {
        throw new ApiError(
            400,
            `Program ${scopeConfig.code} hanya untuk tingkat ${Array.from(allowedLevels).join('/')}.\nKelas tidak sesuai: ${invalidClasses
                .map((item) => item.name)
                .join(', ')}.`,
        );
    }
}

function buildHistoricalClassSummary(student: HistoricalStudentSnapshot | null | undefined) {
    if (!student?.studentClass) return null;
    return {
        id: student.studentClass.id,
        name: student.studentClass.name,
    };
}

async function listHistoricalSittingStudentsByIds(
    studentIds: number[],
    academicYearId: number,
): Promise<HistoricalStudentSnapshot[]> {
    const normalizedStudentIds = Array.from(
        new Set(
            (Array.isArray(studentIds) ? studentIds : [])
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0),
        ),
    );

    if (!normalizedStudentIds.length) return [];
    return listHistoricalStudentsByIdsForAcademicYear(normalizedStudentIds, academicYearId);
}

function collectHistoricalClassIds(students: HistoricalStudentSnapshot[]): number[] {
    return Array.from(
        new Set(
            students
                .map((student) => Number(student.studentClass?.id || 0))
                .filter((classId): classId is number => Number.isFinite(classId) && classId > 0),
        ),
    );
}

async function resolveRoomNameFromSarpras(rawRoomName: unknown): Promise<string> {
    const roomName = String(rawRoomName || '').trim();
    if (!roomName) {
        throw new ApiError(400, 'Nama ruang wajib dipilih dari daftar Aset Sekolah.');
    }

    let room = await prisma.room.findFirst({
        where: {
            name: {
                equals: roomName,
                mode: 'insensitive',
            },
        },
        include: {
            category: {
                select: {
                    name: true,
                },
            },
        },
    });

    // Fallback: antisipasi mismatch kecil (spasi/simbol/hidden char) antara UI dan data master.
    if (!room) {
        const targetKey = normalizeRoomLookupKey(roomName);
        const candidates = await prisma.room.findMany({
            include: {
                category: {
                    select: {
                        name: true,
                    },
                },
            },
        });
        room =
            candidates.find((candidate) => normalizeRoomLookupKey(candidate.name) === targetKey) || null;
    }

    if (!room) {
        throw new ApiError(400, 'Ruang tidak ditemukan di master ruangan.');
    }

    const categoryName = String(room.category?.name || '').trim();
    if (!isExamEligibleRoomType(`${room.name} ${categoryName}`)) {
        throw new ApiError(400, 'Ruang ujian hanya boleh dari kategori ruang kelas atau praktik/lab.');
    }

    return room.name;
}

export const createExamSitting = asyncHandler(async (req: Request, res: Response) => {
    const { 
        roomName, 
        academicYearId, 
        examType, 
        programCode,
        semester,
        sessionId,
        sessionLabel,
        startTime, 
        endTime, 
        proctorId, 
        studentIds 
    } = req.body;

    const resolvedRoomName = await resolveRoomNameFromSarpras(roomName);

    // Validate Academic Year
    let targetAcademicYearId = academicYearId;
    if (!targetAcademicYearId) {
        const activeAY = await prisma.academicYear.findFirst({ where: { isActive: true } });
        if (!activeAY) throw new ApiError(400, 'No active academic year found');
        targetAcademicYearId = activeAY.id;
    }
    const parsedAcademicYearId = Number(targetAcademicYearId);
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
        throw new ApiError(400, 'Tahun ajaran tidak valid.');
    }

    const requestedExamType = String(programCode || examType || '').trim().toUpperCase();
    const resolvedExamType =
        (await resolveCanonicalProgramCode({
            academicYearId: parsedAcademicYearId,
            rawProgramCode: programCode,
            rawExamType: requestedExamType,
        })) || requestedExamType;
    if (!resolvedExamType) {
        throw new ApiError(400, 'Program ujian wajib dipilih.');
    }
    if (isNonScheduledExamProgramCode(resolvedExamType)) {
        throw new ApiError(
            400,
            'Program Ulangan Harian (UH/Formatif) tidak menggunakan pengaturan ruang ujian terjadwal.',
        );
    }

    const normalizedStudentIds = Array.from(
        new Set(
            (Array.isArray(studentIds) ? studentIds : [])
                .map((value: unknown) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value > 0),
        ),
    );

    const historicalStudents = await listHistoricalSittingStudentsByIds(
        normalizedStudentIds,
        parsedAcademicYearId,
    );
    const historicalStudentMap = new Map(historicalStudents.map((student) => [student.id, student]));
    const classIds = collectHistoricalClassIds(historicalStudents);
    await assertSittingClassLevelScope({
        academicYearId: parsedAcademicYearId,
        programCode: resolvedExamType,
        classIds,
    });

    const resolvedProgramSession = await resolveProgramSessionReference({
        academicYearId: parsedAcademicYearId,
        programCode: resolvedExamType,
        sessionId,
        sessionLabel,
    });

    // Create Sitting + sync room to schedules
    const sitting = await prisma.$transaction(async (tx) => {
        const created = await tx.examSitting.create({
            data: {
                roomName: resolvedRoomName,
                academicYearId: parsedAcademicYearId,
                examType: resolvedExamType,
                semester: semester || null,
                sessionId: resolvedProgramSession?.id ?? null,
                sessionLabel: resolvedProgramSession?.label ?? null,
                startTime: startTime ? new Date(startTime) : null,
                endTime: endTime ? new Date(endTime) : null,
                proctorId: proctorId ? parseInt(proctorId) : null,
                students: {
                    createMany: {
                        data: normalizedStudentIds.map((sid: number) => ({
                            studentId: parseInt(sid.toString()),
                        })),
                    },
                },
            },
            include: {
                students: {
                    include: {
                        student: {
                            select: { id: true, name: true, studentClass: { select: { name: true } } },
                        },
                    },
                },
            },
        });

        await syncExamScheduleRoomsForSitting(tx, {
            nextScope:
                classIds.length > 0
                    ? {
                          academicYearId: created.academicYearId,
                          examType: created.examType,
                          semester: created.semester,
                          sessionId: created.sessionId,
                          sessionLabel: created.sessionLabel,
                          roomName: created.roomName,
                          classIds,
                      }
                    : null,
        });

        return created;
    });

    const normalizedStudents = sitting.students.map((item) => ({
        ...item,
        student: {
            ...item.student,
            studentClass:
                buildHistoricalClassSummary(historicalStudentMap.get(item.student.id)) || item.student.studentClass,
        },
    }));

    res.json(
        new ApiResponse(
            200,
            {
                ...sitting,
                students: normalizedStudents,
            },
            'Exam Sitting created successfully',
        ),
    );
});

export const getMyExamSitting = asyncHandler(async (req: Request, res: Response) => {
    const studentId = (req as any).user.id;
    const parsedStudentId = Number(studentId);
    const student = await prisma.user.findUnique({
        where: { id: parsedStudentId },
        select: {
            classId: true,
            studentStatus: true,
        },
    });
    if (student?.studentStatus && student.studentStatus !== 'ACTIVE') {
        res.json(new ApiResponse(200, []));
        return;
    }
    
    const activeAY = await prisma.academicYear.findFirst({ where: { isActive: true } });
    
    const activeSemester = activeAY
        ? (() => {
              const now = new Date();
              if (
                  activeAY.semester2Start &&
                  activeAY.semester2End &&
                  now >= activeAY.semester2Start &&
                  now <= activeAY.semester2End
              ) {
                  return Semester.EVEN;
              }
              return Semester.ODD;
          })()
        : undefined;

    let placements =
        activeAY?.id && student?.classId
            ? await listStudentExamPlacementSlots({
                  academicYearId: activeAY.id,
                  studentId: parsedStudentId,
                  classId: Number(student.classId),
                  semester: activeSemester,
              })
            : [];
    if (placements.length === 0 && activeAY?.id) {
        await reconcileMissingStudentPlacementsForStudent({
            academicYearId: activeAY.id,
            studentId: parsedStudentId,
        });
        placements =
            student?.classId
                ? await listStudentExamPlacementSlots({
                      academicYearId: activeAY.id,
                      studentId: parsedStudentId,
                      classId: Number(student.classId),
                      semester: activeSemester,
                  })
                : [];
    }

    const normalized = placements.map((placement) => ({
        id: placement.id,
        roomName: placement.roomName,
        academicYearId: placement.academicYearId,
        examType: placement.examType,
        semester: placement.semester,
        sessionId: placement.sessionId,
        sessionLabel: placement.sessionLabel,
        startTime: placement.startTime,
        endTime: placement.endTime,
        proctorId: placement.proctorId,
        proctor: placement.proctor,
        seatLabel: placement.seatLabel,
        seatPosition: placement.seatPosition,
        layout: placement.layout,
    }));

    res.json(new ApiResponse(200, normalized));
});

export const getExamSittings = asyncHandler(async (req: Request, res: Response) => {
    const { academicYearId, proctorId, date, examType, programCode, semester } = req.query;

    const where: any = {};
    if (academicYearId) where.academicYearId = parseInt(academicYearId as string);
    if (proctorId) where.proctorId = parseInt(proctorId as string);
    const resolvedSemester = parseOptionalSemester(semester);
    if (resolvedSemester) {
        where.semester = resolvedSemester;
    }
    const resolvedExamType = String(programCode || examType || '').trim().toUpperCase();
    const examTypeCandidates = resolveExamTypeCandidates(resolvedExamType);
    if (examTypeCandidates.length > 0) {
        where.examType = { in: examTypeCandidates };
    }
    
    if (date) {
        const d = new Date(date as string);
        const nextDay = new Date(d);
        nextDay.setDate(d.getDate() + 1);
        where.startTime = {
            gte: d,
            lt: nextDay
        };
    }

    const sittings = await prisma.examSitting.findMany({
        where,
        include: {
            proctor: { select: { id: true, name: true } },
            programSession: { select: { id: true, label: true, displayOrder: true } },
            layout: { select: { id: true, rows: true, columns: true, generatedAt: true, updatedAt: true } },
            _count: { select: { students: true } }
        },
        orderBy: { startTime: 'desc' }
    });

    res.json(new ApiResponse(200, sittings));
});

export const getExamSittingRoomSlots = asyncHandler(async (req: Request, res: Response) => {
    const { academicYearId, examType, programCode, semester, date } = req.query;
    const parsedAcademicYearId = Number(academicYearId);
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
        throw new ApiError(400, 'academicYearId tidak valid.');
    }

    const resolvedSemester = parseOptionalSemester(semester);
    const parsedDate = date ? new Date(String(date)) : null;
    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
        throw new ApiError(400, 'date tidak valid.');
    }

    const payload = await listExamSittingRoomSlots({
        academicYearId: parsedAcademicYearId,
        examType: String(examType || '').trim().toUpperCase() || null,
        programCode: String(programCode || '').trim().toUpperCase() || null,
        semester: resolvedSemester || null,
        date: parsedDate,
    });

    res.json(new ApiResponse(200, payload));
});

export const getAssignedSittingStudents = asyncHandler(async (req: Request, res: Response) => {
    const { academicYearId, examType, programCode, excludeSittingId, semester } = req.query;

    const where: Prisma.ExamSittingWhereInput = {};

    if (academicYearId !== undefined) {
        const parsedAcademicYearId = Number(academicYearId);
        if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
            throw new ApiError(400, 'academicYearId tidak valid.');
        }
        where.academicYearId = parsedAcademicYearId;
    }

    const resolvedExamType = String(programCode || examType || '').trim().toUpperCase();
    const examTypeCandidates = resolveExamTypeCandidates(resolvedExamType);
    if (examTypeCandidates.length > 0) {
        where.examType = { in: examTypeCandidates };
    }
    const resolvedSemester = parseOptionalSemester(semester);
    if (resolvedSemester) {
        where.semester = resolvedSemester;
    }

    if (excludeSittingId !== undefined) {
        const parsedExcludeSittingId = Number(excludeSittingId);
        if (!Number.isFinite(parsedExcludeSittingId) || parsedExcludeSittingId <= 0) {
            throw new ApiError(400, 'excludeSittingId tidak valid.');
        }
        where.id = { not: parsedExcludeSittingId };
    }

    const assignedRows = await prisma.examSittingStudent.findMany({
        where: { sitting: where },
        select: {
            studentId: true,
            sittingId: true,
        },
    });

    const uniqueStudentIds = Array.from(new Set(assignedRows.map((row) => row.studentId)));

    res.json(
        new ApiResponse(
            200,
            {
                studentIds: uniqueStudentIds,
                totalStudents: uniqueStudentIds.length,
                totalAssignments: assignedRows.length,
            },
            'Assigned student IDs retrieved successfully',
        ),
    );
});

export const getExamSittingDetail = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const sitting = await prisma.examSitting.findUnique({
        where: { id: parseInt(id) },
        include: {
            proctor: { select: { id: true, name: true } },
            programSession: { select: { id: true, label: true, displayOrder: true } },
            layout: { select: { id: true, rows: true, columns: true, generatedAt: true, updatedAt: true } },
            students: {
                include: {
                    student: {
                        select: { 
                            id: true, 
                            name: true, 
                            username: true,
                            studentClass: { select: { name: true } } 
                        }
                    }
                }
            }
        }
    });

    if (!sitting) throw new ApiError(404, 'Exam Sitting not found');

    // Fetch active sessions for these students during this sitting
    // Logic: Find sessions that overlap with sitting time
    const sittingAny = sitting as any;
    const studentIds = sittingAny.students.map((s: any) => s.studentId);
    const historicalStudents = await listHistoricalSittingStudentsByIds(studentIds, sitting.academicYearId);
    const historicalStudentMap = new Map(historicalStudents.map((student) => [student.id, student]));
    
    let sessions: any[] = [];
    if (sitting.startTime && sitting.endTime) {
        const examTypeCandidates = resolveExamTypeCandidates(sitting.examType);
        sessions = await prisma.studentExamSession.findMany({
            where: {
                studentId: { in: studentIds },
                createdAt: {
                    gte: new Date(sitting.startTime.getTime() - 2 * 60 * 60 * 1000), // Look back 2 hours just in case
                    lte: sitting.endTime
                },
                schedule: {
                    room: sitting.roomName,
                    ...(examTypeCandidates.length > 0 ? { examType: { in: examTypeCandidates } } : { examType: sitting.examType }),
                    ...buildScheduleSessionScope(sitting.sessionId ?? null, sitting.sessionLabel ?? null),
                },
            },
            include: {
                schedule: {
                    include: {
                        packet: { select: { title: true, subject: { select: { name: true } } } }
                    }
                }
            }
        });
    }
    
    // Merge session info
    const studentList = sittingAny.students.map((item: any) => {
        const historicalStudent = historicalStudentMap.get(item.studentId);
        const session = sessions.find((s: any) => s.studentId === item.studentId);
        return {
            ...item.student,
            studentClass: buildHistoricalClassSummary(historicalStudent) || item.student.studentClass,
            sessionStatus: session ? session.status : 'NOT_STARTED',
            examTitle: session?.schedule?.packet?.title || '-',
            startTime: session?.startTime,
            submitTime: session?.submitTime,
            score: session?.score
        };
    });

    res.json(new ApiResponse(200, {
        ...sitting,
        students: studentList
    }));
});

export const updateExamSitting = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { roomName, academicYearId, examType, programCode, semester, sessionId, sessionLabel, startTime, endTime, proctorId } = req.body;
    const sittingId = parseInt(id);
    if (!Number.isFinite(sittingId) || sittingId <= 0) {
        throw new ApiError(400, 'Sitting ID tidak valid');
    }

    const resolvedRoomName = await resolveRoomNameFromSarpras(roomName);
    const existingSitting = await prisma.examSitting.findUnique({
        where: { id: sittingId },
        include: {
            students: {
                select: { studentId: true },
            },
        },
    });
    if (!existingSitting) {
        throw new ApiError(404, 'Exam Sitting not found');
    }

    const requestedExamType = String(programCode || examType || '').trim().toUpperCase();
    const resolvedAcademicYearId = academicYearId ? Number(academicYearId) : existingSitting.academicYearId;
    if (!Number.isFinite(resolvedAcademicYearId) || resolvedAcademicYearId <= 0) {
        throw new ApiError(400, 'Tahun ajaran tidak valid.');
    }
    const resolvedExamType =
        (await resolveCanonicalProgramCode({
            academicYearId: resolvedAcademicYearId,
            rawProgramCode: programCode,
            rawExamType: requestedExamType || existingSitting.examType,
        })) ||
        requestedExamType ||
        existingSitting.examType;
    if (!resolvedExamType) {
        throw new ApiError(400, 'Program ujian wajib dipilih.');
    }
    if (isNonScheduledExamProgramCode(resolvedExamType)) {
        throw new ApiError(
            400,
            'Program Ulangan Harian (UH/Formatif) tidak menggunakan pengaturan ruang ujian terjadwal.',
        );
    }

    const studentIds = existingSitting.students.map((item) => item.studentId);
    const [previousHistoricalStudents, nextHistoricalStudents] = await Promise.all([
        listHistoricalSittingStudentsByIds(studentIds, existingSitting.academicYearId),
        listHistoricalSittingStudentsByIds(studentIds, resolvedAcademicYearId),
    ]);
    const previousClassIds = collectHistoricalClassIds(previousHistoricalStudents);
    const nextClassIds = collectHistoricalClassIds(nextHistoricalStudents);
    const hasSessionPayload = sessionId !== undefined || sessionLabel !== undefined;
    const resolvedProgramSession =
        hasSessionPayload
            ? await resolveProgramSessionReference({
                  academicYearId: resolvedAcademicYearId,
                  programCode: resolvedExamType,
                  sessionId,
                  sessionLabel,
              })
            : existingSitting.sessionId
              ? {
                    id: existingSitting.sessionId,
                    label: existingSitting.sessionLabel || '',
                }
              : null;

    await assertSittingClassLevelScope({
        academicYearId: resolvedAcademicYearId,
        programCode: resolvedExamType,
        classIds: nextClassIds,
    });

    const sitting = await prisma.$transaction(async (tx) => {
        const updated = await tx.examSitting.update({
            where: { id: sittingId },
            data: {
                roomName: resolvedRoomName,
                academicYearId: resolvedAcademicYearId,
                examType: resolvedExamType,
                semester: semester || undefined,
                sessionId: hasSessionPayload ? resolvedProgramSession?.id ?? null : undefined,
                sessionLabel: hasSessionPayload ? resolvedProgramSession?.label ?? null : undefined,
                startTime: startTime ? new Date(startTime) : undefined,
                endTime: endTime ? new Date(endTime) : undefined,
                proctorId: proctorId ? parseInt(proctorId) : undefined,
            },
        });

        await syncExamScheduleRoomsForSitting(tx, {
            previousScope:
                previousClassIds.length > 0
                    ? {
                          academicYearId: existingSitting.academicYearId,
                          examType: existingSitting.examType,
                          semester: existingSitting.semester,
                          sessionId: existingSitting.sessionId,
                          sessionLabel: existingSitting.sessionLabel,
                          roomName: existingSitting.roomName,
                          classIds: previousClassIds,
                      }
                    : null,
            nextScope:
                nextClassIds.length > 0
                    ? {
                          academicYearId: updated.academicYearId,
                          examType: updated.examType,
                          semester: updated.semester,
                          sessionId: updated.sessionId,
                          sessionLabel: updated.sessionLabel,
                          roomName: updated.roomName,
                          classIds: nextClassIds,
                      }
                    : null,
        });

        return updated;
    });

    res.json(new ApiResponse(200, sitting, 'Exam Sitting updated successfully'));
});

export const updateExamSittingProctor = asyncHandler(async (req: Request, res: Response) => {
    const sittingId = Number(req.params.id);
    if (!Number.isFinite(sittingId) || sittingId <= 0) {
        throw new ApiError(400, 'Sitting ID tidak valid');
    }

    const incomingProctorId =
        req.body?.proctorId === null || req.body?.proctorId === ''
            ? null
            : req.body?.proctorId === undefined
              ? undefined
              : Number(req.body.proctorId);

    if (incomingProctorId !== undefined && incomingProctorId !== null) {
        if (!Number.isFinite(incomingProctorId) || incomingProctorId <= 0) {
            throw new ApiError(400, 'proctorId tidak valid.');
        }
        const proctor = await prisma.user.findFirst({
            where: {
                id: incomingProctorId,
                role: 'TEACHER',
            },
            select: { id: true },
        });
        if (!proctor) {
            throw new ApiError(404, 'Guru pengawas tidak ditemukan.');
        }
    }

    const updated = await prisma.examSitting.update({
        where: { id: sittingId },
        data: {
            proctorId: incomingProctorId === undefined ? undefined : incomingProctorId,
        },
        include: {
            proctor: { select: { id: true, name: true } },
            programSession: { select: { id: true, label: true, displayOrder: true } },
            layout: { select: { id: true, rows: true, columns: true, generatedAt: true, updatedAt: true } },
            _count: { select: { students: true } },
        },
    });

    res.json(new ApiResponse(200, updated, 'Pengawas ruang ujian berhasil diperbarui.'));
});

export const updateExamSittingRoomSlotProctor = asyncHandler(async (req: Request, res: Response) => {
    const sittingId = Number(req.body?.sittingId);
    const academicYearId = Number(req.body?.academicYearId);
    const roomName = String(req.body?.roomName || '').trim();
    const examType = String(req.body?.examType || '').trim().toUpperCase();
    const subjectName = String(req.body?.subjectName || '').trim() || 'Mata Pelajaran';
    const rawStartTime = new Date(String(req.body?.startTime || ''));
    const rawEndTime = new Date(String(req.body?.endTime || ''));
    const periodNumber =
        Number.isFinite(Number(req.body?.periodNumber)) && Number(req.body?.periodNumber) > 0
            ? Number(req.body?.periodNumber)
            : null;
    const sessionId =
        Number.isFinite(Number(req.body?.sessionId)) && Number(req.body?.sessionId) > 0
            ? Number(req.body?.sessionId)
            : null;
    const subjectId =
        Number.isFinite(Number(req.body?.subjectId)) && Number(req.body?.subjectId) > 0
            ? Number(req.body?.subjectId)
            : null;
    const sessionLabel = normalizeOptionalSessionLabel(req.body?.sessionLabel);
    const semester = parseOptionalSemester(req.body?.semester) || null;
    const incomingProctorId =
        req.body?.proctorId === null || req.body?.proctorId === ''
            ? null
            : req.body?.proctorId === undefined
              ? undefined
              : Number(req.body.proctorId);

    if (!Number.isFinite(sittingId) || sittingId <= 0) {
        throw new ApiError(400, 'Sitting ID tidak valid.');
    }
    if (!Number.isFinite(academicYearId) || academicYearId <= 0) {
        throw new ApiError(400, 'academicYearId tidak valid.');
    }
    if (!roomName) {
        throw new ApiError(400, 'roomName wajib diisi.');
    }
    if (!examType) {
        throw new ApiError(400, 'examType wajib diisi.');
    }
    if (Number.isNaN(rawStartTime.getTime()) || Number.isNaN(rawEndTime.getTime())) {
        throw new ApiError(400, 'Waktu slot pengawas tidak valid.');
    }
    if (rawEndTime <= rawStartTime) {
        throw new ApiError(400, 'Waktu selesai harus setelah waktu mulai.');
    }

    if (incomingProctorId !== undefined && incomingProctorId !== null) {
        if (!Number.isFinite(incomingProctorId) || incomingProctorId <= 0) {
            throw new ApiError(400, 'proctorId tidak valid.');
        }
        const proctor = await prisma.user.findFirst({
            where: {
                id: incomingProctorId,
                role: 'TEACHER',
            },
            select: { id: true },
        });
        if (!proctor) {
            throw new ApiError(404, 'Guru pengawas tidak ditemukan.');
        }
    }

    const sitting = await prisma.examSitting.findUnique({
        where: { id: sittingId },
        select: {
            id: true,
            academicYearId: true,
            examType: true,
            semester: true,
            roomName: true,
        },
    });
    if (!sitting) {
        throw new ApiError(404, 'Ruang ujian tidak ditemukan.');
    }
    if (Number(sitting.academicYearId) !== academicYearId) {
        throw new ApiError(400, 'academicYearId slot tidak sesuai dengan ruang ujian.');
    }
    if (normalizeRoomLookupKey(sitting.roomName) !== normalizeRoomLookupKey(roomName)) {
        throw new ApiError(400, 'roomName slot tidak sesuai dengan ruang ujian.');
    }

    const assignment = await saveExamSittingSlotProctorAssignment({
        sittingId,
        academicYearId,
        examType,
        semester,
        roomName,
        startTime: rawStartTime,
        endTime: rawEndTime,
        periodNumber,
        sessionId,
        sessionLabel,
        subjectId,
        subjectName,
        proctorId: incomingProctorId === undefined ? null : incomingProctorId,
    });

    const slotKey = buildExamSittingSlotProctorKey({
        sittingId,
        roomName,
        startTime: rawStartTime,
        endTime: rawEndTime,
        periodNumber,
        sessionId,
        sessionLabel,
        subjectId,
        subjectName,
    });

    res.json(
        new ApiResponse(
            200,
            {
                key: slotKey,
                proctorId: assignment.proctorId,
                proctor: assignment.proctor,
            },
            incomingProctorId ? 'Pengawas slot ruang ujian berhasil diperbarui.' : 'Pengawas slot ruang ujian berhasil dihapus.',
        ),
    );
});

export const updateSittingStudents = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { studentIds } = req.body; // Array of ALL student IDs to be in the room

    if (!Array.isArray(studentIds)) throw new ApiError(400, 'studentIds must be an array');
    const sittingId = parseInt(id);
    if (!Number.isFinite(sittingId) || sittingId <= 0) {
        throw new ApiError(400, 'Sitting ID tidak valid');
    }

    const targetSitting = await prisma.examSitting.findUnique({
        where: { id: sittingId },
        include: {
            students: {
                select: {
                    studentId: true,
                },
            },
        },
    });

    if (!targetSitting) {
        throw new ApiError(404, 'Exam Sitting not found');
    }

    const normalizedStudentIds = Array.from(
        new Set(
            studentIds
                .map((value: unknown) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value > 0),
        ),
    );

    const previousStudentIds = targetSitting.students.map((item) => item.studentId);

    const [previousStudents, nextStudents] = await Promise.all([
        listHistoricalSittingStudentsByIds(previousStudentIds, targetSitting.academicYearId),
        listHistoricalSittingStudentsByIds(normalizedStudentIds, targetSitting.academicYearId),
    ]);

    const previousClassIds = collectHistoricalClassIds(previousStudents);
    const nextClassIds = collectHistoricalClassIds(nextStudents);
    await assertSittingClassLevelScope({
        academicYearId: targetSitting.academicYearId,
        programCode: targetSitting.examType,
        classIds: nextClassIds,
    });
    const removedStudentIds = previousStudentIds.filter((studentId) => !normalizedStudentIds.includes(studentId));

    // Transaction to replace students
    await prisma.$transaction(async (tx) => {
        // Delete existing
        await tx.examSittingStudent.deleteMany({
            where: { sittingId }
        });

        // Add new
        if (normalizedStudentIds.length > 0) {
            await tx.examSittingStudent.createMany({
                data: normalizedStudentIds.map((sid: number) => ({
                    sittingId,
                    studentId: parseInt(sid.toString())
                }))
            });
        }

        await syncExamScheduleRoomsForSitting(tx, {
            previousScope:
                previousClassIds.length > 0
                    ? {
                          academicYearId: targetSitting.academicYearId,
                          examType: targetSitting.examType,
                          semester: targetSitting.semester,
                          sessionId: targetSitting.sessionId,
                          sessionLabel: targetSitting.sessionLabel,
                          roomName: targetSitting.roomName,
                          classIds: previousClassIds,
                      }
                    : null,
            nextScope:
                nextClassIds.length > 0
                    ? {
                          academicYearId: targetSitting.academicYearId,
                          examType: targetSitting.examType,
                          semester: targetSitting.semester,
                          sessionId: targetSitting.sessionId,
                          sessionLabel: targetSitting.sessionLabel,
                          roomName: targetSitting.roomName,
                          classIds: nextClassIds,
                      }
                    : null,
        });

        await revokeGeneratedCardsForStudentsWithoutSitting(tx, {
            academicYearId: targetSitting.academicYearId,
            examType: targetSitting.examType,
            semester: targetSitting.semester,
            studentIds: removedStudentIds,
            reason: 'Kartu dicabut karena penempatan ruang ujian siswa sudah tidak aktif.',
        });
    });

    res.json(new ApiResponse(200, null, 'Students updated successfully'));
});

export const deleteSitting = asyncHandler(async (req: Request, res: Response) => {
    const sittingId = Number(req.params.id);
    if (!Number.isFinite(sittingId) || sittingId <= 0) {
        throw new ApiError(400, 'Sitting ID tidak valid');
    }

    const targetSitting = await prisma.examSitting.findUnique({
        where: { id: sittingId },
        include: {
            students: {
                select: {
                    studentId: true,
                },
            },
        },
    });
    if (!targetSitting) {
        throw new ApiError(404, 'Exam Sitting not found');
    }

    const studentIds = targetSitting.students.map((item) => item.studentId);
    const previousStudents = await listHistoricalSittingStudentsByIds(studentIds, targetSitting.academicYearId);
    const previousClassIds = collectHistoricalClassIds(previousStudents);

    await prisma.$transaction(async (tx) => {
        await syncExamScheduleRoomsForSitting(tx, {
            previousScope:
                previousClassIds.length > 0
                    ? {
                          academicYearId: targetSitting.academicYearId,
                          examType: targetSitting.examType,
                          semester: targetSitting.semester,
                          sessionId: targetSitting.sessionId,
                          sessionLabel: targetSitting.sessionLabel,
                          roomName: targetSitting.roomName,
                          classIds: previousClassIds,
                      }
                    : null,
        });

        await tx.examSitting.delete({
            where: { id: sittingId },
        });

        await revokeGeneratedCardsForStudentsWithoutSitting(tx, {
            academicYearId: targetSitting.academicYearId,
            examType: targetSitting.examType,
            semester: targetSitting.semester,
            studentIds,
            reason: 'Kartu dicabut karena ruang ujian sudah dihapus dari Kelola Ruang Ujian.',
        });
    });

    res.json(new ApiResponse(200, null, 'Sitting deleted successfully'));
});
