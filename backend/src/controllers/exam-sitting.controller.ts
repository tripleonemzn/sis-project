import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';
import { ExamType, Semester, Prisma } from '@prisma/client';

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
        normalized.includes('LABORATORIUM') ||
        normalized.includes('OLAHRAGA') ||
        normalized.includes('SPORT') ||
        normalized.includes('LAPANGAN')
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
        throw new ApiError(400, 'Ruang ujian hanya boleh dari kategori ruang kelas, praktik/lab, atau olahraga.');
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

    const students = normalizedStudentIds.length
        ? await prisma.user.findMany({
              where: { id: { in: normalizedStudentIds } },
              select: { classId: true },
          })
        : [];
    const classIds = Array.from(
        new Set(students.map((student) => student.classId).filter((value): value is number => Boolean(value))),
    );
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

        if (classIds.length > 0) {
            const scheduleExamTypeCandidates = resolveExamTypeCandidates(created.examType);
            await tx.examSchedule.updateMany({
                where: {
                    academicYearId: created.academicYearId,
                    examType:
                        scheduleExamTypeCandidates.length > 0
                            ? { in: scheduleExamTypeCandidates }
                            : created.examType,
                    classId: { in: classIds },
                    ...buildScheduleSessionScope(created.sessionId ?? null, created.sessionLabel ?? null),
                },
                data: {
                    room: created.roomName,
                },
            });
        }

        return created;
    });

    res.json(new ApiResponse(200, sitting, 'Exam Sitting created successfully'));
});

export const getMyExamSitting = asyncHandler(async (req: Request, res: Response) => {
    const studentId = (req as any).user.id;
    
    const activeAY = await prisma.academicYear.findFirst({ where: { isActive: true } });
    
    const whereClause: any = {
        students: {
            some: {
                studentId: parseInt(studentId)
            }
        }
    };
    
    if (activeAY) {
        whereClause.academicYearId = activeAY.id;
    }
    
    const sittings = await prisma.examSitting.findMany({
        where: whereClause,
        include: {
            proctor: { select: { name: true } }
        }
    });

    res.json(new ApiResponse(200, sittings));
});

export const getExamSittings = asyncHandler(async (req: Request, res: Response) => {
    const { academicYearId, proctorId, date, examType, programCode } = req.query;

    const where: any = {};
    if (academicYearId) where.academicYearId = parseInt(academicYearId as string);
    if (proctorId) where.proctorId = parseInt(proctorId as string);
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
            _count: { select: { students: true } }
        },
        orderBy: { startTime: 'desc' }
    });

    res.json(new ApiResponse(200, sittings));
});

export const getAssignedSittingStudents = asyncHandler(async (req: Request, res: Response) => {
    const { academicYearId, examType, programCode, excludeSittingId } = req.query;

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
        const session = sessions.find((s: any) => s.studentId === item.studentId);
        return {
            ...item.student,
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
    const students = studentIds.length
        ? await prisma.user.findMany({
              where: { id: { in: studentIds } },
              select: { classId: true },
          })
        : [];
    const classIds = Array.from(
        new Set(students.map((student) => student.classId).filter((value): value is number => Boolean(value))),
    );
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
        classIds,
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

        if (classIds.length > 0) {
            const scheduleExamTypeCandidates = resolveExamTypeCandidates(updated.examType);
            await tx.examSchedule.updateMany({
                where: {
                    academicYearId: updated.academicYearId,
                    examType:
                        scheduleExamTypeCandidates.length > 0
                            ? { in: scheduleExamTypeCandidates }
                            : updated.examType,
                    classId: { in: classIds },
                    ...buildScheduleSessionScope(updated.sessionId ?? null, updated.sessionLabel ?? null),
                },
                data: {
                    room: updated.roomName,
                },
            });
        }

        return updated;
    });

    res.json(new ApiResponse(200, sitting, 'Exam Sitting updated successfully'));
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
        previousStudentIds.length > 0
            ? prisma.user.findMany({
                  where: { id: { in: previousStudentIds } },
                  select: { id: true, classId: true },
              })
            : Promise.resolve([]),
        normalizedStudentIds.length > 0
            ? prisma.user.findMany({
                  where: { id: { in: normalizedStudentIds } },
                  select: { id: true, classId: true },
              })
            : Promise.resolve([]),
    ]);

    const previousClassIds = Array.from(
        new Set(previousStudents.map((student) => student.classId).filter((value): value is number => Boolean(value))),
    );
    const nextClassIds = Array.from(
        new Set(nextStudents.map((student) => student.classId).filter((value): value is number => Boolean(value))),
    );
    await assertSittingClassLevelScope({
        academicYearId: targetSitting.academicYearId,
        programCode: targetSitting.examType,
        classIds: nextClassIds,
    });
    const removedClassIds = previousClassIds.filter((classId) => !nextClassIds.includes(classId));
    const scheduleExamTypeCandidates = resolveExamTypeCandidates(targetSitting.examType);
    const scheduleExamTypeWhere =
        scheduleExamTypeCandidates.length > 0
            ? { in: scheduleExamTypeCandidates }
            : targetSitting.examType;
    const scheduleSessionScope = buildScheduleSessionScope(
        targetSitting.sessionId ?? null,
        targetSitting.sessionLabel ?? null,
    );

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

        if (removedClassIds.length > 0) {
            await tx.examSchedule.updateMany({
                where: {
                    academicYearId: targetSitting.academicYearId,
                    examType: scheduleExamTypeWhere,
                    classId: { in: removedClassIds },
                    room: targetSitting.roomName,
                    ...scheduleSessionScope,
                },
                data: {
                    room: null,
                },
            });
        }

        if (nextClassIds.length > 0) {
            await tx.examSchedule.updateMany({
                where: {
                    academicYearId: targetSitting.academicYearId,
                    examType: scheduleExamTypeWhere,
                    classId: { in: nextClassIds },
                    ...scheduleSessionScope,
                },
                data: {
                    room: targetSitting.roomName,
                },
            });
        }
    });

    res.json(new ApiResponse(200, null, 'Students updated successfully'));
});

export const deleteSitting = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.examSitting.delete({ where: { id: parseInt(id) } });
    res.json(new ApiResponse(200, null, 'Sitting deleted successfully'));
});
