import { Request, Response } from 'express';
import { AdditionalDuty, ExamSessionStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';
import {
    listHistoricalStudentsByIdsForAcademicYear,
    listHistoricalStudentsForClass,
} from '../utils/studentAcademicHistory';

function countAnsweredEntries(rawAnswers: unknown): number {
    if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return 0;
    const entries = Object.entries(rawAnswers as Record<string, unknown>).filter(([key]) => !key.startsWith('__'));
    return entries.reduce((total, [, value]) => {
        if (value === null || value === undefined) return total;
        if (Array.isArray(value)) return total + (value.length > 0 ? 1 : 0);
        if (typeof value === 'string') return total + (value.trim() !== '' ? 1 : 0);
        return total + 1;
    }, 0);
}

function parseMonitoringSummary(rawAnswers: unknown): {
    totalViolations: number;
    tabSwitchCount: number;
    fullscreenExitCount: number;
    appSwitchCount: number;
    lastViolationType: string | null;
    lastViolationAt: string | null;
    currentQuestionIndex: number;
    currentQuestionNumber: number;
    currentQuestionId: string | null;
    lastSyncAt: string | null;
} {
    const defaultValue = {
        totalViolations: 0,
        tabSwitchCount: 0,
        fullscreenExitCount: 0,
        appSwitchCount: 0,
        lastViolationType: null,
        lastViolationAt: null,
        currentQuestionIndex: 0,
        currentQuestionNumber: 1,
        currentQuestionId: null,
        lastSyncAt: null,
    };
    if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return defaultValue;
    const monitoring = (rawAnswers as Record<string, any>).__monitoring;
    if (!monitoring || typeof monitoring !== 'object') return defaultValue;
    return {
        totalViolations: Number(monitoring.totalViolations || 0),
        tabSwitchCount: Number(monitoring.tabSwitchCount || 0),
        fullscreenExitCount: Number(monitoring.fullscreenExitCount || 0),
        appSwitchCount: Number(monitoring.appSwitchCount || 0),
        lastViolationType: monitoring.lastViolationType ? String(monitoring.lastViolationType) : null,
        lastViolationAt: monitoring.lastViolationAt ? String(monitoring.lastViolationAt) : null,
        currentQuestionIndex: Number.isFinite(Number(monitoring.currentQuestionIndex))
            ? Number(monitoring.currentQuestionIndex)
            : 0,
        currentQuestionNumber: Number.isFinite(Number(monitoring.currentQuestionNumber))
            ? Number(monitoring.currentQuestionNumber)
            : 1,
        currentQuestionId: monitoring.currentQuestionId ? String(monitoring.currentQuestionId) : null,
        lastSyncAt: monitoring.lastSyncAt ? String(monitoring.lastSyncAt) : null,
    };
}

function normalizeSessionLabel(rawValue: unknown): string | null {
    const normalized = String(rawValue || '')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized ? normalized.toLowerCase() : null;
}

function normalizeExamTypeKey(rawValue: unknown): string {
    return String(rawValue || '')
        .trim()
        .toUpperCase()
        .replace(/QUIZ/g, 'FORMATIF')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function resolveExamTypeCandidates(rawValue: unknown): string[] {
    const normalized = normalizeExamTypeKey(rawValue);
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

function hasExamTypeIntersection(left: unknown, right: unknown): boolean {
    const leftCandidates = new Set(resolveExamTypeCandidates(left));
    const rightCandidates = resolveExamTypeCandidates(right);
    return rightCandidates.some((candidate) => leftCandidates.has(candidate));
}

function isSameSlotTime(
    leftStart: Date | null | undefined,
    leftEnd: Date | null | undefined,
    rightStart: Date | null | undefined,
    rightEnd: Date | null | undefined,
): boolean {
    if (!leftStart || !leftEnd || !rightStart || !rightEnd) return true;
    const toleranceMs = 60_000; // toleransi 1 menit
    return (
        Math.abs(leftStart.getTime() - rightStart.getTime()) <= toleranceMs &&
        Math.abs(leftEnd.getTime() - rightEnd.getTime()) <= toleranceMs
    );
}

function isSameSessionScope(params: {
    leftSessionId?: number | null;
    leftSessionLabel?: string | null;
    rightSessionId?: number | null;
    rightSessionLabel?: string | null;
}): boolean {
    const leftSessionId =
        Number.isFinite(Number(params.leftSessionId)) && Number(params.leftSessionId) > 0
            ? Number(params.leftSessionId)
            : null;
    const rightSessionId =
        Number.isFinite(Number(params.rightSessionId)) && Number(params.rightSessionId) > 0
            ? Number(params.rightSessionId)
            : null;

    if (leftSessionId && rightSessionId) return leftSessionId === rightSessionId;
    if (leftSessionId || rightSessionId) return false;

    const leftLabel = normalizeSessionLabel(params.leftSessionLabel);
    const rightLabel = normalizeSessionLabel(params.rightSessionLabel);
    if (leftLabel || rightLabel) return leftLabel === rightLabel;
    return true;
}

function parseDateOnly(value: unknown): Date | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateRangeByDay(date: Date): { start: Date; end: Date } {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
}

type PermissionSnapshot = {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason: string | null;
    approvalNote: string | null;
    approvedBy: {
        id: number;
        name: string;
        additionalDuties: AdditionalDuty[];
        role: string;
    } | null;
};

function resolveAbsentReason(permission: PermissionSnapshot | null): string {
    if (!permission) return 'Tidak ada pengajuan izin pada jadwal ini.';

    const requestedReason = String(permission.reason || '').trim();
    const approvalReason = String(permission.approvalNote || '').trim();
    const resolvedReason = approvalReason || requestedReason || 'Tanpa catatan.';
    const approverName = String(permission.approvedBy?.name || '').trim();
    const approverSuffix = approverName ? ` (${approverName})` : '';

    if (permission.status === 'REJECTED') {
        return `Izin ditolak wali kelas${approverSuffix}: ${resolvedReason}`;
    }
    if (permission.status === 'APPROVED') {
        return `Izin disetujui wali kelas${approverSuffix}: ${resolvedReason}`;
    }
    return `Pengajuan izin masih menunggu persetujuan wali kelas: ${resolvedReason}`;
}

type ProctorRoomScheduleScope = {
    id: number;
    classId: number | null;
    packetId: number | null;
    room: string | null;
    startTime: Date;
    endTime: Date;
    sessionId: number | null;
    sessionLabel: string | null;
    examType: string | null;
    academicYearId: number | null;
    subjectId: number | null;
    proctorId: number | null;
    class: {
        id: number;
        name: string;
    } | null;
};

type ProctorRoomSittingRow = {
    id: number;
    roomName: string;
    academicYearId: number;
    examType: string;
    sessionId: number | null;
    sessionLabel: string | null;
    startTime: Date | null;
    endTime: Date | null;
    students: Array<{
        studentId: number;
    }>;
};

type ProctorHistoricalStudentRow = {
    id: number;
    name: string;
    nis: string | null;
    classId: number | null;
    className: string | null;
};

function buildProctorHistoricalStudentRowFromCurrentStudent(student: {
    id: number;
    name: string | null;
    nis: string | null;
    classId: number | null;
    studentClass?: { name?: string | null } | null;
}): ProctorHistoricalStudentRow {
    return {
        id: Number(student.id),
        name: String(student.name || '-'),
        nis: student.nis ? String(student.nis) : null,
        classId: Number.isFinite(Number(student.classId)) && Number(student.classId) > 0 ? Number(student.classId) : null,
        className: student.studentClass?.name ? String(student.studentClass.name) : null,
    };
}

function buildProctorHistoricalStudentRow(snapshot: {
    id: number;
    name: string;
    nis: string | null;
    studentClass?: { id?: number | null; name?: string | null } | null;
}): ProctorHistoricalStudentRow {
    return {
        id: Number(snapshot.id),
        name: String(snapshot.name || '-'),
        nis: snapshot.nis ? String(snapshot.nis) : null,
        classId:
            Number.isFinite(Number(snapshot.studentClass?.id)) && Number(snapshot.studentClass?.id) > 0
                ? Number(snapshot.studentClass?.id)
                : null,
        className: snapshot.studentClass?.name ? String(snapshot.studentClass.name) : null,
    };
}

function sortProctorHistoricalStudents(rows: ProctorHistoricalStudentRow[]): ProctorHistoricalStudentRow[] {
    return [...rows].sort((a, b) => {
        const classCompare = String(a.className || '').localeCompare(String(b.className || ''), 'id', {
            numeric: true,
            sensitivity: 'base',
        });
        if (classCompare !== 0) return classCompare;
        return String(a.name || '').localeCompare(String(b.name || ''), 'id', {
            numeric: true,
            sensitivity: 'base',
        });
    });
}

function collectHistoricalClassNames(rows: Array<{ className: string | null }>): string[] {
    return Array.from(new Set(rows.map((row) => String(row.className || '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }),
    );
}

async function listHistoricalProctorStudentsByIds(
    studentIds: number[],
    academicYearId: number | null | undefined,
): Promise<ProctorHistoricalStudentRow[]> {
    const normalizedStudentIds = Array.from(
        new Set(
            studentIds
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );
    if (normalizedStudentIds.length === 0) return [];

    if (Number.isFinite(Number(academicYearId)) && Number(academicYearId) > 0) {
        return sortProctorHistoricalStudents(
            (
                await listHistoricalStudentsByIdsForAcademicYear(normalizedStudentIds, Number(academicYearId))
            ).map((snapshot) => buildProctorHistoricalStudentRow(snapshot)),
        );
    }

    return sortProctorHistoricalStudents(
        (
            await prisma.user.findMany({
                where: {
                    id: { in: normalizedStudentIds },
                    role: 'STUDENT',
                },
                select: {
                    id: true,
                    name: true,
                    nis: true,
                    classId: true,
                    studentClass: {
                        select: {
                            name: true,
                        },
                    },
                },
            })
        ).map((student) => buildProctorHistoricalStudentRowFromCurrentStudent(student)),
    );
}

async function listHistoricalProctorStudentsForClasses(
    classIds: number[],
    academicYearId: number | null | undefined,
): Promise<ProctorHistoricalStudentRow[]> {
    const normalizedClassIds = Array.from(
        new Set(
            classIds
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );
    if (normalizedClassIds.length === 0) return [];

    if (Number.isFinite(Number(academicYearId)) && Number(academicYearId) > 0) {
        const seenStudentIds = new Set<number>();
        const rosterGroups = await Promise.all(
            normalizedClassIds.map(async (classId) => listHistoricalStudentsForClass(classId, Number(academicYearId))),
        );

        return sortProctorHistoricalStudents(
            rosterGroups
                .flatMap((rows) => rows)
                .map((snapshot) => buildProctorHistoricalStudentRow(snapshot))
                .filter((row) => {
                    if (seenStudentIds.has(row.id)) return false;
                    seenStudentIds.add(row.id);
                    return true;
                }),
        );
    }

    return sortProctorHistoricalStudents(
        (
            await prisma.user.findMany({
                where: {
                    role: 'STUDENT',
                    classId: { in: normalizedClassIds },
                },
                select: {
                    id: true,
                    name: true,
                    nis: true,
                    classId: true,
                    studentClass: {
                        select: {
                            name: true,
                        },
                    },
                },
            })
        ).map((student) => buildProctorHistoricalStudentRowFromCurrentStudent(student)),
    );
}

async function resolveRoomScopeSchedules(baseScheduleId: number): Promise<{
    baseSchedule: ProctorRoomScheduleScope | null;
    monitoredSchedules: ProctorRoomScheduleScope[];
    monitoredScheduleIds: number[];
    monitoredClassIds: number[];
    monitoredClassNames: string[];
}> {
    const baseSchedule = await prisma.examSchedule.findUnique({
        where: { id: baseScheduleId },
        select: {
            id: true,
            classId: true,
            packetId: true,
            room: true,
            startTime: true,
            endTime: true,
            sessionId: true,
            sessionLabel: true,
            examType: true,
            academicYearId: true,
            subjectId: true,
            proctorId: true,
            class: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!baseSchedule) {
        return {
            baseSchedule: null,
            monitoredSchedules: [],
            monitoredScheduleIds: [],
            monitoredClassIds: [],
            monitoredClassNames: [],
        };
    }

    const roomScopeWhere: any = {
        isActive: true,
        startTime: baseSchedule.startTime,
        endTime: baseSchedule.endTime,
        room: baseSchedule.room ?? null,
    };

    if (baseSchedule.sessionId && Number.isFinite(baseSchedule.sessionId)) {
        roomScopeWhere.OR = [{ sessionId: baseSchedule.sessionId }];
        if (baseSchedule.sessionLabel) {
            roomScopeWhere.OR.push({
                sessionId: null,
                sessionLabel: baseSchedule.sessionLabel,
            });
        }
    } else {
        roomScopeWhere.sessionId = null;
        roomScopeWhere.sessionLabel = baseSchedule.sessionLabel ?? null;
    }

    if (baseSchedule.examType) {
        roomScopeWhere.examType = baseSchedule.examType;
    }
    if (baseSchedule.academicYearId) {
        roomScopeWhere.academicYearId = baseSchedule.academicYearId;
    }
    if (baseSchedule.subjectId) {
        roomScopeWhere.subjectId = baseSchedule.subjectId;
    }
    if (baseSchedule.proctorId) {
        roomScopeWhere.proctorId = baseSchedule.proctorId;
    }

    const roomSchedules = await prisma.examSchedule.findMany({
        where: roomScopeWhere,
        select: {
            id: true,
            classId: true,
            packetId: true,
            room: true,
            startTime: true,
            endTime: true,
            sessionId: true,
            sessionLabel: true,
            examType: true,
            academicYearId: true,
            subjectId: true,
            proctorId: true,
            class: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        orderBy: { classId: 'asc' },
    });

    const monitoredSchedules: ProctorRoomScheduleScope[] =
        roomSchedules.length > 0
            ? roomSchedules
            : [baseSchedule];
    const monitoredScheduleIds = Array.from(new Set(monitoredSchedules.map((item) => item.id)));
    const monitoredClassIds = Array.from(
        new Set(
            monitoredSchedules
                .map((item) => Number(item.classId))
                .filter((classId) => Number.isFinite(classId) && classId > 0),
        ),
    );
    const monitoredClassNames = Array.from(
        new Set(monitoredSchedules.map((item) => item.class?.name || '').filter(Boolean)),
    );

    return {
        baseSchedule,
        monitoredSchedules,
        monitoredScheduleIds,
        monitoredClassIds,
        monitoredClassNames,
    };
}

function filterMatchedSittingsForSlot(params: {
    sittings: ProctorRoomSittingRow[];
    roomName: string | null;
    academicYearId: number | null;
    examType: string | null;
    startTime: Date | null;
    endTime: Date | null;
    sessionId: number | null;
    sessionLabel: string | null;
}): ProctorRoomSittingRow[] {
    const roomLookup = String(params.roomName || '').trim().toLowerCase();
    if (!roomLookup) return [];

    return params.sittings.filter((sitting) => {
        if (String(sitting.roomName || '').trim().toLowerCase() !== roomLookup) return false;
        if (
            Number.isFinite(Number(params.academicYearId)) &&
            Number(params.academicYearId) > 0 &&
            Number(sitting.academicYearId) !== Number(params.academicYearId)
        ) {
            return false;
        }
        if (!hasExamTypeIntersection(params.examType, sitting.examType)) return false;
        if (
            !isSameSessionScope({
                leftSessionId: params.sessionId,
                leftSessionLabel: params.sessionLabel,
                rightSessionId: sitting.sessionId,
                rightSessionLabel: sitting.sessionLabel,
            })
        ) {
            return false;
        }
        if (!isSameSlotTime(params.startTime, params.endTime, sitting.startTime, sitting.endTime)) {
            return false;
        }
        return true;
    });
}

function collectSittingParticipants(sittings: ProctorRoomSittingRow[]): {
    studentIds: Set<number>;
} {
    const studentIds = new Set<number>();

    sittings.forEach((sitting) => {
        sitting.students.forEach((row) => {
            if (Number.isFinite(Number(row.studentId)) && Number(row.studentId) > 0) {
                studentIds.add(Number(row.studentId));
            }
        });
    });

    return {
        studentIds,
    };
}

// Get schedules assigned to me as Proctor or Author
export const getProctorSchedules = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { mode } = req.query; // 'proctor' (default) or 'author'

    const where: any = { isActive: true };

    if (mode === 'author') {
        where.packet = { authorId: user.id };
    } else {
        where.proctorId = user.id;
    }

    const schedules = await prisma.examSchedule.findMany({
        where,
        include: {
            packet: {
                select: { title: true, subject: { select: { name: true } }, duration: true, type: true }
            },
            subject: {
                select: { name: true }
            },
            class: {
                select: { name: true }
            },
            _count: {
                select: { sessions: true }
            }
        },
        orderBy: { startTime: 'asc' }
    });

    res.json(new ApiResponse(200, schedules));
});

// Get details for a specific exam room (Proctor View)
export const getProctoringDetail = asyncHandler(async (req: Request, res: Response) => {
    const { scheduleId } = req.params;
    const user = (req as any).user;
    const scheduleIdNumber = Number.parseInt(scheduleId, 10);

    if (!Number.isInteger(scheduleIdNumber) || scheduleIdNumber <= 0) {
        throw new ApiError(400, 'ID jadwal ujian tidak valid');
    }

    // Check if user is admin or wakasek to allow broader access
    const schedule = await prisma.examSchedule.findFirst({
        where: { 
            id: scheduleIdNumber,
        },
        include: {
            packet: { select: { title: true, subject: { select: { name: true } }, authorId: true, subjectId: true, academicYearId: true } },
            subject: { select: { id: true, name: true } },
            class: { select: { id: true, name: true } },
            proctor: { select: { id: true, name: true } },
            proctoringReports: true
        }
    });

    if (!schedule) throw new ApiError(404, 'Jadwal tidak ditemukan');

    // Access Control Logic
    const isProctor = schedule.proctorId === user.id;
    const isAuthor = schedule.packet?.authorId === user.id;
    const isAdmin = user.role === 'ADMIN';
    
    let isSubjectTeacher = false;
    if (!isProctor && !isAuthor && !isAdmin) {
        // Check if user is the teacher for this subject in this class
        const subjectId = schedule.packet?.subjectId || schedule.subjectId;
        const academicYearId = schedule.packet?.academicYearId || schedule.academicYearId;

        if (subjectId && schedule.class?.id) {
            const assignment = await prisma.teacherAssignment.findFirst({
                where: {
                    teacherId: user.id,
                    classId: schedule.class.id,
                    subjectId: subjectId,
                    academicYearId: academicYearId || undefined
                }
            });
            if (assignment) {
                isSubjectTeacher = true;
            }
        }
    }

    if (!isProctor && !isAuthor && !isAdmin && !isSubjectTeacher) {
        throw new ApiError(403, 'Anda tidak memiliki akses untuk memantau ujian ini');
    }

    const resolvedSubjectId = schedule.packet?.subjectId || schedule.subjectId || null;
    const resolvedAcademicYearId = schedule.packet?.academicYearId || schedule.academicYearId || null;

    const roomScopeWhere: any = {
        isActive: true,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        room: schedule.room ?? null,
    };
    if (schedule.sessionId && Number.isFinite(schedule.sessionId)) {
        roomScopeWhere.OR = [{ sessionId: schedule.sessionId }];
        if (schedule.sessionLabel) {
            roomScopeWhere.OR.push({
                sessionId: null,
                sessionLabel: schedule.sessionLabel,
            });
        }
    } else {
        roomScopeWhere.sessionId = null;
        roomScopeWhere.sessionLabel = schedule.sessionLabel ?? null;
    }

    if (schedule.examType) {
        roomScopeWhere.examType = schedule.examType;
    }
    if (resolvedAcademicYearId) {
        roomScopeWhere.academicYearId = resolvedAcademicYearId;
    }
    if (resolvedSubjectId) {
        roomScopeWhere.subjectId = resolvedSubjectId;
    }
    if (schedule.proctorId) {
        roomScopeWhere.proctorId = schedule.proctorId;
    }

    // Ambil semua schedule dalam ruang+slot yang sama agar monitor lintas kelas tetap terlihat.
    const sameRoomSchedules = await prisma.examSchedule.findMany({
        where: roomScopeWhere,
        select: {
            id: true,
            classId: true,
            packetId: true,
            class: { select: { id: true, name: true } },
        },
        orderBy: { classId: 'asc' },
    });

    const monitoredSchedules = sameRoomSchedules.length > 0
        ? sameRoomSchedules
        : [{ id: schedule.id, classId: schedule.classId, packetId: schedule.packetId, class: schedule.class }];

    const monitoredScheduleIds = Array.from(new Set(monitoredSchedules.map((row: any) => row.id)));
    const monitoredClassIds = Array.from(
        new Set(
            monitoredSchedules
                .map((row: any) => Number(row.classId))
                .filter((classId: number) => Number.isFinite(classId) && classId > 0),
        ),
    );
    const monitoredClassNames = Array.from(
        new Set(monitoredSchedules.map((row: any) => row.class?.name).filter(Boolean)),
    ) as string[];
    const monitoredPacketIds = Array.from(
        new Set(
            monitoredSchedules
                .map((row: any) => Number(row.packetId))
                .filter((packetId: number) => Number.isFinite(packetId) && packetId > 0),
        ),
    );
    const sittingExamTypeCandidates = resolveExamTypeCandidates(schedule.examType);

    const roomSittings: ProctorRoomSittingRow[] = schedule.room
        ? await prisma.examSitting.findMany({
              where: {
                  roomName: {
                      equals: schedule.room,
                      mode: 'insensitive',
                  },
                  ...(resolvedAcademicYearId ? { academicYearId: resolvedAcademicYearId } : {}),
                  ...(sittingExamTypeCandidates.length > 0
                      ? {
                            examType: {
                                in: sittingExamTypeCandidates,
                            },
                        }
                      : {}),
              },
              select: {
                  id: true,
                  roomName: true,
                  academicYearId: true,
                  examType: true,
                  sessionId: true,
                  sessionLabel: true,
                  startTime: true,
                  endTime: true,
                  students: {
                      select: {
                          studentId: true,
                      },
                  },
              },
          })
        : [];

    const matchedSittings = filterMatchedSittingsForSlot({
        sittings: roomSittings,
        roomName: schedule.room,
        academicYearId: resolvedAcademicYearId,
        examType: schedule.examType,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        sessionId: schedule.sessionId,
        sessionLabel: schedule.sessionLabel,
    });
    const sittingParticipants = collectSittingParticipants(matchedSittings);
    const sittingParticipantIds = Array.from(sittingParticipants.studentIds.values());

    const packetQuestionCounts = monitoredPacketIds.length > 0
        ? await prisma.examPacket.findMany({
            where: { id: { in: monitoredPacketIds } },
            select: { id: true, questions: true },
        })
        : [];
    const questionCountByPacketId = new Map<number, number>();
    packetQuestionCounts.forEach((packet) => {
        const questions = packet.questions;
        questionCountByPacketId.set(packet.id, Array.isArray(questions) ? questions.length : 0);
    });

    // Get Students in all monitored classes + their session status.
    const students =
        sittingParticipantIds.length > 0
            ? await listHistoricalProctorStudentsByIds(sittingParticipantIds, resolvedAcademicYearId)
            : await listHistoricalProctorStudentsForClasses(monitoredClassIds, resolvedAcademicYearId);

    const monitoredStudentIds = students
        .map((row) => Number(row.id))
        .filter((studentId) => Number.isFinite(studentId) && studentId > 0);
    const monitoredClassIdsFromRoom = Array.from(
        new Set(
            students
                .map((row) => Number(row.classId))
                .filter((classId) => Number.isFinite(classId) && classId > 0),
        ),
    );
    const effectiveMonitoredClassIds =
        monitoredClassIdsFromRoom.length > 0 ? monitoredClassIdsFromRoom : monitoredClassIds;
    const sittingParticipantClassNames = collectHistoricalClassNames(students);

    const sessionScheduleScope: any = {
        isActive: true,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        ...(resolvedAcademicYearId ? { academicYearId: resolvedAcademicYearId } : {}),
        ...(resolvedSubjectId ? { subjectId: resolvedSubjectId } : {}),
        ...(sittingExamTypeCandidates.length > 0 ? { examType: { in: sittingExamTypeCandidates } } : {}),
    };
    if (schedule.sessionId && Number.isFinite(schedule.sessionId)) {
        sessionScheduleScope.OR = [{ sessionId: schedule.sessionId }];
        if (schedule.sessionLabel) {
            sessionScheduleScope.OR.push({ sessionId: null, sessionLabel: schedule.sessionLabel });
        }
    } else {
        sessionScheduleScope.sessionId = null;
        sessionScheduleScope.sessionLabel = schedule.sessionLabel ?? null;
    }

    const sessions = await prisma.studentExamSession.findMany({
        where:
            monitoredStudentIds.length > 0
                ? {
                      studentId: { in: monitoredStudentIds },
                      schedule: { is: sessionScheduleScope },
                  }
                : { scheduleId: { in: monitoredScheduleIds } },
        select: {
            studentId: true,
            scheduleId: true,
            status: true,
            startTime: true,
            submitTime: true,
            score: true,
            updatedAt: true,
        }
    });
    const progressSessions = await prisma.studentExamSession.findMany({
        where: {
            ...(monitoredStudentIds.length > 0
                ? {
                      studentId: { in: monitoredStudentIds },
                      schedule: { is: sessionScheduleScope },
                  }
                : { scheduleId: { in: monitoredScheduleIds } }),
            status: { in: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.TIMEOUT, ExamSessionStatus.COMPLETED] },
        },
        select: {
            studentId: true,
            scheduleId: true,
            answers: true,
        },
    });

    const questionCountByScheduleId = new Map<number, number>();
    monitoredSchedules.forEach((row: any) => {
        const packetId = Number(row.packetId);
        const total = Number.isFinite(packetId)
            ? (questionCountByPacketId.get(packetId) || 0)
            : 0;
        questionCountByScheduleId.set(row.id, total);
    });
    const sessionScheduleIds = Array.from(
        new Set(
            sessions
                .map((row) => Number(row.scheduleId))
                .filter((scheduleId) => Number.isFinite(scheduleId) && scheduleId > 0),
        ),
    );
    const missingScheduleIds = sessionScheduleIds.filter((scheduleId) => !questionCountByScheduleId.has(scheduleId));
    if (missingScheduleIds.length > 0) {
        const sessionScheduleRows = await prisma.examSchedule.findMany({
            where: { id: { in: missingScheduleIds } },
            select: { id: true, packetId: true },
        });
        const missingPacketIds = Array.from(
            new Set(
                sessionScheduleRows
                    .map((row) => Number(row.packetId))
                    .filter((packetId) => Number.isFinite(packetId) && packetId > 0),
            ),
        );
        const missingPacketRows = missingPacketIds.length
            ? await prisma.examPacket.findMany({
                  where: { id: { in: missingPacketIds } },
                  select: { id: true, questions: true },
              })
            : [];
        const missingPacketCountMap = new Map<number, number>();
        missingPacketRows.forEach((packet) => {
            const questions = packet.questions;
            missingPacketCountMap.set(packet.id, Array.isArray(questions) ? questions.length : 0);
        });
        sessionScheduleRows.forEach((row) => {
            const packetId = Number(row.packetId);
            const total = Number.isFinite(packetId) ? missingPacketCountMap.get(packetId) || 0 : 0;
            questionCountByScheduleId.set(row.id, total);
        });
    }
    const progressSessionMap = new Map<string, (typeof progressSessions)[number]>();
    progressSessions.forEach((row) => {
        progressSessionMap.set(`${row.studentId}:${row.scheduleId}`, row);
    });

    const bestSessionByStudent = new Map<number, (typeof sessions)[number]>();
    const sessionRank: Record<string, number> = {
        COMPLETED: 4,
        IN_PROGRESS: 3,
        TIMEOUT: 2,
        NOT_STARTED: 1,
    };

    sessions.forEach((sess: any) => {
        const current = bestSessionByStudent.get(sess.studentId);
        if (!current) {
            bestSessionByStudent.set(sess.studentId, sess);
            return;
        }
        const currentRank = sessionRank[current.status] || 0;
        const nextRank = sessionRank[sess.status] || 0;
        if (nextRank > currentRank) {
            bestSessionByStudent.set(sess.studentId, sess);
            return;
        }
        if (nextRank === currentRank && new Date(sess.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
            bestSessionByStudent.set(sess.studentId, sess);
        }
    });

    const studentList = students.map((s: any) => {
        const session = bestSessionByStudent.get(s.id);
        const totalQuestions = session ? (questionCountByScheduleId.get(session.scheduleId) || 0) : 0;
        const progressSession = session
            ? progressSessionMap.get(`${session.studentId}:${session.scheduleId}`)
            : null;
        const answeredCount = progressSession
            ? countAnsweredEntries(progressSession.answers)
            : session?.status === 'COMPLETED'
                ? totalQuestions
                : 0;
        return {
            id: s.id,
            name: s.name,
            nis: s.nis,
            className: s.className || '-',
            status: session ? session.status : 'NOT_STARTED',
            startTime: session?.startTime,
            submitTime: session?.submitTime,
            score: session?.score,
            answeredCount,
            totalQuestions,
            monitoring: progressSession ? parseMonitoringSummary(progressSession.answers) : parseMonitoringSummary(null),
        };
    });

    const teacherNames = resolvedSubjectId
        ? Array.from(
            new Set(
                (
                    await prisma.teacherAssignment.findMany({
                        where: {
                            classId: { in: effectiveMonitoredClassIds },
                            subjectId: resolvedSubjectId,
                            ...(resolvedAcademicYearId ? { academicYearId: resolvedAcademicYearId } : {}),
                        },
                        select: {
                            teacher: { select: { name: true } },
                        },
                    })
                )
                    .map((row: any) => row.teacher?.name)
                    .filter(Boolean),
            ),
        )
        : [];

    const subjectName = schedule.packet?.subject?.name || schedule.subject?.name || '-';
    const displayTitle = schedule.packet?.title || `Ujian ${subjectName}`;

    res.json(new ApiResponse(200, {
        schedule: {
            ...schedule,
            subjectName,
            displayTitle,
            classNames:
                sittingParticipantClassNames.length > 0 ? sittingParticipantClassNames : monitoredClassNames,
            teacherNames,
            monitoredScheduleIds,
            serverNow: new Date().toISOString(),
        },
        students: studentList,
        isProctor,
        isAuthor,
        isSubjectTeacher
    }));
});

// Submit Berita Acara
export const submitBeritaAcara = asyncHandler(async (req: Request, res: Response) => {
    const { scheduleId } = req.params;
    const parsedScheduleId = Number.parseInt(String(scheduleId), 10);
    if (!Number.isInteger(parsedScheduleId) || parsedScheduleId <= 0) {
        throw new ApiError(400, 'ID jadwal ujian tidak valid');
    }

    const { notes, incident } = req.body;
    const user = (req as any).user;

    const schedule = await prisma.examSchedule.findUnique({
        where: { id: parsedScheduleId },
        select: {
            id: true,
            proctorId: true,
            room: true,
            startTime: true,
            endTime: true,
            class: { select: { name: true } },
        },
    });
    if (!schedule) {
        throw new ApiError(404, 'Jadwal ujian tidak ditemukan');
    }

    const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
    if (!isAdmin && Number(schedule.proctorId) !== Number(user?.id)) {
        throw new ApiError(403, 'Hanya pengawas ruangan yang dapat menyimpan berita acara');
    }

    const scope = await resolveRoomScopeSchedules(parsedScheduleId);
    if (!scope.baseSchedule || scope.monitoredScheduleIds.length === 0) {
        throw new ApiError(404, 'Data ruang ujian tidak ditemukan');
    }
    const sittingExamTypeCandidates = resolveExamTypeCandidates(scope.baseSchedule.examType);

    const [roomStudents, roomSittings] = await Promise.all([
        scope.monitoredClassIds.length > 0
            ? listHistoricalProctorStudentsForClasses(scope.monitoredClassIds, scope.baseSchedule.academicYearId)
            : Promise.resolve([]),
        schedule.room
            ? prisma.examSitting.findMany({
                  where: {
                      roomName: {
                          equals: schedule.room,
                          mode: 'insensitive',
                      },
                      ...(scope.baseSchedule?.academicYearId
                          ? { academicYearId: scope.baseSchedule.academicYearId }
                          : {}),
                      ...(sittingExamTypeCandidates.length > 0
                          ? {
                                examType: {
                                    in: sittingExamTypeCandidates,
                                },
                            }
                          : {}),
                  },
                  select: {
                      id: true,
                      roomName: true,
                      academicYearId: true,
                      examType: true,
                      sessionId: true,
                      sessionLabel: true,
                      startTime: true,
                      endTime: true,
                      students: {
                          select: {
                              studentId: true,
                          },
                      },
                  },
              })
            : Promise.resolve([]),
    ]);

    const matchedSittings = filterMatchedSittingsForSlot({
        sittings: roomSittings as ProctorRoomSittingRow[],
        roomName: schedule.room,
        academicYearId: scope.baseSchedule?.academicYearId ?? null,
        examType: scope.baseSchedule?.examType ?? null,
        startTime: scope.baseSchedule?.startTime ?? null,
        endTime: scope.baseSchedule?.endTime ?? null,
        sessionId: scope.baseSchedule?.sessionId ?? null,
        sessionLabel: scope.baseSchedule?.sessionLabel ?? null,
    });
    const sittingParticipants = collectSittingParticipants(matchedSittings);
    const sittingParticipantProfiles = await listHistoricalProctorStudentsByIds(
        Array.from(sittingParticipants.studentIds.values()),
        scope.baseSchedule.academicYearId,
    );
    const sittingParticipantClassNames = collectHistoricalClassNames(sittingParticipantProfiles);

    const expectedStudentIds =
        sittingParticipants.studentIds.size > 0
            ? sittingParticipants.studentIds
            : new Set(roomStudents.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0));
    const expectedCount = expectedStudentIds.size;

    const expectedStudentIdList = Array.from(expectedStudentIds.values());
    const sessionScheduleScope: any = {
        isActive: true,
        startTime: scope.baseSchedule.startTime,
        endTime: scope.baseSchedule.endTime,
        ...(scope.baseSchedule.academicYearId ? { academicYearId: scope.baseSchedule.academicYearId } : {}),
        ...(scope.baseSchedule.subjectId ? { subjectId: scope.baseSchedule.subjectId } : {}),
        ...(sittingExamTypeCandidates.length > 0 ? { examType: { in: sittingExamTypeCandidates } } : {}),
    };
    if (scope.baseSchedule.sessionId && Number.isFinite(scope.baseSchedule.sessionId)) {
        sessionScheduleScope.OR = [{ sessionId: scope.baseSchedule.sessionId }];
        if (scope.baseSchedule.sessionLabel) {
            sessionScheduleScope.OR.push({
                sessionId: null,
                sessionLabel: scope.baseSchedule.sessionLabel,
            });
        }
    } else {
        sessionScheduleScope.sessionId = null;
        sessionScheduleScope.sessionLabel = scope.baseSchedule.sessionLabel ?? null;
    }

    const roomSessions =
        expectedStudentIdList.length > 0
            ? await prisma.studentExamSession.findMany({
                  where: {
                      studentId: { in: expectedStudentIdList },
                      status: { in: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT] },
                      schedule: { is: sessionScheduleScope },
                  },
                  select: {
                      studentId: true,
                  },
              })
            : scope.monitoredScheduleIds.length > 0
                ? await prisma.studentExamSession.findMany({
                      where: {
                          scheduleId: { in: scope.monitoredScheduleIds },
                          status: {
                              in: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT],
                          },
                      },
                      select: {
                          studentId: true,
                      },
                  })
                : [];

    const presentSet = new Set<number>();
    roomSessions.forEach((row) => {
        const studentId = Number(row.studentId);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        if (expectedStudentIds.size > 0 && !expectedStudentIds.has(studentId)) return;
        presentSet.add(studentId);
    });
    const presentCount = presentSet.size;
    const absentCount = Math.max(0, expectedCount - presentCount);

    const monitoredClassNames =
        sittingParticipantClassNames.length > 0 ? sittingParticipantClassNames : scope.monitoredClassNames;

    const normalizedNotes = String(notes || '').trim();
    const normalizedIncident = String(incident || '').trim();

    const existingReport = await prisma.examProctoringReport.findFirst({
        where: {
            scheduleId: parsedScheduleId,
            proctorId: Number(user.id),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
    });

    const report = existingReport
        ? await prisma.examProctoringReport.update({
              where: { id: existingReport.id },
              data: {
                  notes: normalizedNotes || null,
                  incident: normalizedIncident || null,
                  studentCountPresent: presentCount,
                  studentCountAbsent: absentCount,
                  signedAt: new Date(),
              },
              include: {
                  proctor: { select: { id: true, name: true } },
              },
          })
        : await prisma.examProctoringReport.create({
              data: {
                  scheduleId: parsedScheduleId,
                  proctorId: Number(user.id),
                  notes: normalizedNotes || null,
                  incident: normalizedIncident || null,
                  studentCountPresent: presentCount,
                  studentCountAbsent: absentCount,
                  signedAt: new Date(),
              },
              include: {
                  proctor: { select: { id: true, name: true } },
              },
          });

    const curriculumReceivers = await prisma.user.findMany({
        where: {
            OR: [
                { role: 'ADMIN' },
                {
                    role: 'TEACHER',
                    additionalDuties: {
                        has: AdditionalDuty.WAKASEK_KURIKULUM,
                    },
                },
            ],
        },
        select: { id: true },
    });
    if (curriculumReceivers.length > 0) {
        await prisma.notification.createMany({
            data: curriculumReceivers.map((receiver) => ({
                userId: receiver.id,
                title: 'Berita Acara Pengawas Baru',
                message: `Berita acara ruang ${schedule.room || '-'} telah dikirim pengawas untuk slot ${new Date(schedule.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - ${new Date(schedule.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`,
                type: 'EXAM_PROCTOR_REPORT',
                data: {
                    scheduleId: parsedScheduleId,
                    reportId: report.id,
                    room: schedule.room,
                    classNames: monitoredClassNames,
                    expectedCount,
                    presentCount,
                    absentCount,
                } as any,
            })),
            skipDuplicates: false,
        });
    }

    res.json(
        new ApiResponse(
            existingReport ? 200 : 201,
            {
                ...report,
                summary: {
                    room: schedule.room,
                    classNames: monitoredClassNames,
                    expectedParticipants: expectedCount,
                    presentParticipants: presentCount,
                    absentParticipants: absentCount,
                    totalParticipants: expectedCount,
                },
            },
            existingReport ? 'Berita acara berhasil diperbarui' : 'Berita acara berhasil disimpan',
        ),
    );
});

// Receive proctor reports in curriculum monitoring flow
export const getProctoringReports = asyncHandler(async (req: Request, res: Response) => {
    const parsedAcademicYearId = Number(req.query.academicYearId);
    const examType = String(req.query.examType || req.query.programCode || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    const date = parseDateOnly(req.query.date);
    const dateFrom = parseDateOnly(req.query.dateFrom);
    const dateTo = parseDateOnly(req.query.dateTo);
    const includeInactiveRaw = String(req.query.includeInactive || '').trim().toLowerCase();
    const includeInactive = ['1', 'true', 'yes', 'y'].includes(includeInactiveRaw);

    const where: any = {};
    if (!includeInactive) {
        where.isActive = true;
    }
    if (Number.isFinite(parsedAcademicYearId) && parsedAcademicYearId > 0) {
        where.academicYearId = parsedAcademicYearId;
    }
    if (examType) {
        where.examType = examType;
    }
    if (date) {
        const range = toDateRangeByDay(date);
        where.startTime = {
            gte: range.start,
            lt: range.end,
        };
    } else if (dateFrom || dateTo) {
        const startDate = dateFrom || dateTo;
        const endDate = dateTo || dateFrom;
        if (startDate && endDate) {
            const rangeStart = toDateRangeByDay(startDate).start;
            const rangeEnd = toDateRangeByDay(endDate).end;
            where.startTime = {
                gte: rangeStart <= rangeEnd ? rangeStart : rangeEnd,
                lt: rangeStart <= rangeEnd ? rangeEnd : rangeStart,
            };
        }
    }

    const schedules = await prisma.examSchedule.findMany({
        where,
        select: {
            id: true,
            room: true,
            startTime: true,
            endTime: true,
            sessionId: true,
            sessionLabel: true,
            examType: true,
            academicYearId: true,
            classId: true,
            class: {
                select: {
                    id: true,
                    name: true,
                },
            },
            proctoringReports: {
                orderBy: [{ updatedAt: 'desc' }, { signedAt: 'desc' }, { id: 'desc' }],
                include: {
                    proctor: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
        orderBy: [{ startTime: 'asc' }, { room: 'asc' }],
    });

    const groupedByRoomSlot = new Map<
        string,
        {
            room: string | null;
            startTime: Date;
            endTime: Date;
            sessionId: number | null;
            sessionLabel: string | null;
            examType: string | null;
            academicYearId: number | null;
            scheduleIds: number[];
            classIds: number[];
            classNames: string[];
            reportRows: Array<{
                id: number;
                signedAt: Date;
                notes: string | null;
                incident: string | null;
                studentCountPresent: number;
                studentCountAbsent: number;
                proctor: { id: number; name: string } | null;
            }>;
            latestReportAt: Date | null;
        }
    >();

    schedules.forEach((schedule) => {
        const roomKey = String(schedule.room || '').trim().toLowerCase();
        const sessionIdKey =
            Number.isFinite(Number(schedule.sessionId)) && Number(schedule.sessionId) > 0
                ? String(schedule.sessionId)
                : '__no_session_id__';
        const sessionKey = normalizeSessionLabel(schedule.sessionLabel) || '__no_session__';
        const groupKey = `${roomKey}::${schedule.startTime.toISOString()}::${schedule.endTime.toISOString()}::${sessionIdKey}::${sessionKey}::${String(schedule.examType || '').trim().toUpperCase()}`;
        const current = groupedByRoomSlot.get(groupKey) || {
            room: schedule.room || null,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            sessionId: Number.isFinite(Number(schedule.sessionId)) ? Number(schedule.sessionId) : null,
            sessionLabel: schedule.sessionLabel || null,
            examType: schedule.examType || null,
            academicYearId: Number.isFinite(Number(schedule.academicYearId)) ? Number(schedule.academicYearId) : null,
            scheduleIds: [],
            classIds: [],
            classNames: [],
            reportRows: [],
            latestReportAt: null,
        };
        current.scheduleIds.push(schedule.id);
        if (Number.isFinite(Number(schedule.classId)) && Number(schedule.classId) > 0) {
            current.classIds.push(Number(schedule.classId));
        }
        if (schedule.class?.name) {
            current.classNames.push(schedule.class.name);
        }
        if (Array.isArray(schedule.proctoringReports)) {
            schedule.proctoringReports.forEach((report) => {
                current.reportRows.push({
                    id: report.id,
                    signedAt: report.signedAt,
                    notes: report.notes,
                    incident: report.incident,
                    studentCountPresent: report.studentCountPresent,
                    studentCountAbsent: report.studentCountAbsent,
                    proctor: report.proctor
                        ? {
                              id: report.proctor.id,
                              name: report.proctor.name,
                          }
                        : null,
                });
                if (!current.latestReportAt || report.signedAt > current.latestReportAt) {
                    current.latestReportAt = report.signedAt;
                }
            });
        }
        groupedByRoomSlot.set(groupKey, current);
    });

    const groupedRows = Array.from(groupedByRoomSlot.values());

    const allClassIds = Array.from(
        new Set(
            groupedRows
                .flatMap((group) => group.classIds)
                .filter((classId) => Number.isFinite(classId) && classId > 0),
        ),
    );
    const classRosterByClassId = new Map<number, ProctorHistoricalStudentRow[]>();
    await Promise.all(
        allClassIds.map(async (classId) => {
            const classAcademicYearId =
                groupedRows.find((group) => group.classIds.includes(classId))?.academicYearId ?? parsedAcademicYearId ?? null;
            classRosterByClassId.set(
                classId,
                await listHistoricalProctorStudentsForClasses([classId], classAcademicYearId),
            );
        }),
    );
    const classStudentCountMap = new Map<number, number>(
        Array.from(classRosterByClassId.entries()).map(([classId, rows]) => [classId, rows.length]),
    );
    const classStudentsByClassId = new Map<
        number,
        Array<{ id: number; name: string; nis: string | null; className: string | null }>
    >();
    const studentInfoById = new Map<number, { id: number; name: string; nis: string | null; className: string | null }>();
    classRosterByClassId.forEach((students, classId) => {
        const bucket = students.map((student) => ({
            id: Number(student.id),
            name: String(student.name || '-'),
            nis: student.nis ? String(student.nis) : null,
            className: student.className || null,
        }));
        classStudentsByClassId.set(classId, bucket);
        bucket.forEach((row) => {
            studentInfoById.set(row.id, row);
        });
    });

    const uniqueRooms = Array.from(
        new Set(
            groupedRows
                .map((group) => String(group.room || '').trim())
                .filter((roomName): roomName is string => Boolean(roomName)),
        ),
    );
    const allStartTimes = groupedRows.map((group) => group.startTime.getTime());
    const allEndTimes = groupedRows.map((group) => group.endTime.getTime());
    const minStart = allStartTimes.length > 0 ? new Date(Math.min(...allStartTimes) - 3 * 60 * 60 * 1000) : null;
    const maxEnd = allEndTimes.length > 0 ? new Date(Math.max(...allEndTimes) + 3 * 60 * 60 * 1000) : null;
    const examTypeCandidatesForSitting = resolveExamTypeCandidates(examType);

    const roomSittings: ProctorRoomSittingRow[] =
        uniqueRooms.length > 0
            ? await prisma.examSitting.findMany({
                  where: {
                      roomName: { in: uniqueRooms },
                      ...(Number.isFinite(parsedAcademicYearId) && parsedAcademicYearId > 0
                          ? { academicYearId: parsedAcademicYearId }
                          : {}),
                      ...(examTypeCandidatesForSitting.length > 0
                          ? {
                                examType: {
                                    in: examTypeCandidatesForSitting,
                                },
                            }
                          : {}),
                      ...((minStart && maxEnd)
                          ? {
                                OR: [
                                    {
                                        startTime: {
                                            gte: minStart,
                                            lte: maxEnd,
                                        },
                                    },
                                    { startTime: null },
                                ],
                            }
                          : {}),
                  },
                  select: {
                      id: true,
                      roomName: true,
                      academicYearId: true,
                      examType: true,
                      sessionId: true,
                      sessionLabel: true,
                      startTime: true,
                      endTime: true,
                      students: {
                          select: {
                              studentId: true,
                          },
                      },
                  },
              })
            : [];

    const matchedSittingsByGroup = groupedRows.map((group) =>
        filterMatchedSittingsForSlot({
            sittings: roomSittings,
            roomName: group.room,
            academicYearId: group.academicYearId,
            examType: group.examType,
            startTime: group.startTime,
            endTime: group.endTime,
            sessionId: group.sessionId,
            sessionLabel: group.sessionLabel,
        }),
    );
    const sittingParticipantsByGroup = matchedSittingsByGroup.map((sittings) => collectSittingParticipants(sittings));
    const sittingParticipantProfilesByGroup = await Promise.all(
        groupedRows.map(async (group, index) =>
            listHistoricalProctorStudentsByIds(
                Array.from((sittingParticipantsByGroup[index]?.studentIds || new Set<number>()).values()),
                group.academicYearId,
            ),
        ),
    );
    const sittingParticipantClassNamesByGroup = sittingParticipantProfilesByGroup.map((rows) =>
        collectHistoricalClassNames(rows),
    );
    sittingParticipantProfilesByGroup.forEach((rows) => {
        rows.forEach((row) => {
            studentInfoById.set(row.id, {
                id: row.id,
                name: row.name,
                nis: row.nis,
                className: row.className,
            });
        });
    });
    const allSittingStudentIds = Array.from(
        new Set(
            sittingParticipantsByGroup.flatMap((bucket) => Array.from(bucket.studentIds.values())),
        ),
    );

    const slotScopedSessionRows =
        allSittingStudentIds.length > 0
            ? await prisma.studentExamSession.findMany({
                  where: {
                      studentId: { in: allSittingStudentIds },
                      status: { in: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT] },
                      schedule: {
                          is: {
                              ...(Number.isFinite(parsedAcademicYearId) && parsedAcademicYearId > 0
                                  ? {
                                        academicYearId: parsedAcademicYearId,
                                    }
                                  : {}),
                              ...(minStart && maxEnd
                                  ? {
                                        startTime: {
                                            gte: minStart,
                                            lte: maxEnd,
                                        },
                                    }
                                  : {}),
                          },
                      },
                  },
                  select: {
                      studentId: true,
                      schedule: {
                          select: {
                              room: true,
                              academicYearId: true,
                              examType: true,
                              sessionId: true,
                              sessionLabel: true,
                              startTime: true,
                              endTime: true,
                          },
                      },
                  },
              })
            : [];

    const presentStudentIdsByGroup = groupedRows.map(() => new Set<number>());
    slotScopedSessionRows.forEach((row) => {
        const studentId = Number(row.studentId);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        groupedRows.forEach((group, index) => {
            const expectedIds = sittingParticipantsByGroup[index]?.studentIds || new Set<number>();
            if (!expectedIds.has(studentId)) return;
            const schedule = row.schedule;
            if (
                Number.isFinite(Number(group.academicYearId)) &&
                Number(group.academicYearId) > 0 &&
                Number(schedule?.academicYearId) !== Number(group.academicYearId)
            ) {
                return;
            }
            if (!hasExamTypeIntersection(group.examType, schedule?.examType)) return;
            if (
                !isSameSessionScope({
                    leftSessionId: group.sessionId,
                    leftSessionLabel: group.sessionLabel,
                    rightSessionId: schedule?.sessionId ?? null,
                    rightSessionLabel: schedule?.sessionLabel ?? null,
                })
            ) {
                return;
            }
            if (!isSameSlotTime(group.startTime, group.endTime, schedule?.startTime ?? null, schedule?.endTime ?? null)) {
                return;
            }
            presentStudentIdsByGroup[index].add(studentId);
        });
    });

    const allScheduleIds = Array.from(new Set(groupedRows.flatMap((group) => group.scheduleIds)));
    const scheduleScopedSessionRows =
        allScheduleIds.length > 0
            ? await prisma.studentExamSession.findMany({
                  where: {
                      scheduleId: { in: allScheduleIds },
                      status: { in: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT] },
                  },
                  select: {
                      scheduleId: true,
                      studentId: true,
                  },
              })
            : [];

    const studentIdsBySchedule = new Map<number, Set<number>>();
    scheduleScopedSessionRows.forEach((row) => {
        const bucket = studentIdsBySchedule.get(row.scheduleId) || new Set<number>();
        bucket.add(row.studentId);
        studentIdsBySchedule.set(row.scheduleId, bucket);
    });

    const reportRows = (
        await Promise.all(
            groupedRows.map(async (group, groupIndex) => {
            const uniqueClassIds = Array.from(new Set(group.classIds));
            const fallbackClassNames = Array.from(new Set(group.classNames)).sort((a, b) => a.localeCompare(b, 'id'));
            const fallbackExpectedParticipants = uniqueClassIds.reduce(
                (total, classId) => total + (classStudentCountMap.get(classId) || 0),
                0,
            );
            const fallbackExpectedIds = new Set<number>();
            uniqueClassIds.forEach((classId) => {
                (classStudentsByClassId.get(classId) || []).forEach((student) => {
                    const studentId = Number(student.id);
                    if (!Number.isFinite(studentId) || studentId <= 0) return;
                    fallbackExpectedIds.add(studentId);
                });
            });

            const sittingParticipants = sittingParticipantsByGroup[groupIndex] || {
                studentIds: new Set<number>(),
            };
            const historicalClassNames = sittingParticipantClassNamesByGroup[groupIndex] || [];
            const expectedStudentIds =
                sittingParticipants.studentIds.size > 0 ? sittingParticipants.studentIds : fallbackExpectedIds;
            const expectedParticipants =
                expectedStudentIds.size > 0
                    ? expectedStudentIds.size
                    : fallbackExpectedParticipants;

            const presentSet = new Set<number>();
            group.scheduleIds.forEach((scheduleId) => {
                const students = studentIdsBySchedule.get(scheduleId);
                if (!students) return;
                students.forEach((studentId) => presentSet.add(studentId));
            });
            const slotPresentSet = presentStudentIdsByGroup[groupIndex] || new Set<number>();
            const effectivePresentSet = new Set<number>();
            if (expectedStudentIds.size > 0) {
                presentSet.forEach((studentId) => {
                    if (expectedStudentIds.has(studentId)) {
                        effectivePresentSet.add(studentId);
                    }
                });
                slotPresentSet.forEach((studentId) => {
                    if (expectedStudentIds.has(studentId)) {
                        effectivePresentSet.add(studentId);
                    }
                });
            } else {
                presentSet.forEach((studentId) => effectivePresentSet.add(studentId));
                slotPresentSet.forEach((studentId) => effectivePresentSet.add(studentId));
            }
            const computedPresent = effectivePresentSet.size;
            const computedAbsent = Math.max(0, expectedParticipants - computedPresent);
            const absentStudentIds =
                expectedStudentIds.size > 0
                    ? Array.from(expectedStudentIds.values()).filter((studentId) => !effectivePresentSet.has(studentId))
                    : [];

            const overlappingPermissions =
                absentStudentIds.length > 0
                    ? await prisma.studentPermission.findMany({
                          where: {
                              studentId: { in: absentStudentIds },
                              ...(group.academicYearId ? { academicYearId: group.academicYearId } : {}),
                              startDate: { lte: group.endTime },
                              endDate: { gte: group.startTime },
                          },
                          select: {
                              studentId: true,
                              status: true,
                              reason: true,
                              approvalNote: true,
                              updatedAt: true,
                              id: true,
                              approvedBy: {
                                  select: {
                                      id: true,
                                      name: true,
                                      additionalDuties: true,
                                      role: true,
                                  },
                              },
                          },
                          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
                      })
                    : [];

            const permissionByStudentId = new Map<number, PermissionSnapshot>();
            overlappingPermissions.forEach((permission) => {
                if (!permissionByStudentId.has(permission.studentId)) {
                    permissionByStudentId.set(permission.studentId, {
                        status: permission.status,
                        reason: permission.reason,
                        approvalNote: permission.approvalNote,
                        approvedBy: permission.approvedBy
                            ? {
                                  id: permission.approvedBy.id,
                                  name: permission.approvedBy.name,
                                  additionalDuties: permission.approvedBy.additionalDuties || [],
                                  role: permission.approvedBy.role,
                              }
                            : null,
                    });
                }
            });

            const absentStudents =
                absentStudentIds.length > 0
                    ? absentStudentIds
                          .map((studentId) => {
                              const profile = studentInfoById.get(studentId);
                              const permission = permissionByStudentId.get(studentId) || null;
                              return {
                                  id: studentId,
                                  name: profile?.name || `Siswa #${studentId}`,
                                  nis: profile?.nis || null,
                                  className: profile?.className || null,
                                  absentReason: resolveAbsentReason(permission),
                                  permissionStatus: permission?.status || null,
                              };
                          })
                          .sort((a, b) => {
                              const classCompare = String(a.className || '').localeCompare(
                                  String(b.className || ''),
                                  'id',
                                  { numeric: true, sensitivity: 'base' },
                              );
                              if (classCompare !== 0) return classCompare;
                              return String(a.name || '').localeCompare(String(b.name || ''), 'id');
                          })
                    : [];

            const latestReport =
                group.reportRows
                    .slice()
                    .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0] || null;
            // Gunakan hitungan realtime dari student_exam_sessions sebagai angka utama peserta.
            // Nilai yang tersimpan di berita acara dapat stale jika ditandatangani saat ujian belum selesai.
            const presentParticipants = computedPresent;
            const absentParticipants = computedAbsent;

                return {
                    room: group.room,
                    startTime: group.startTime,
                    endTime: group.endTime,
                    sessionLabel: group.sessionLabel,
                    examType: group.examType,
                    classNames:
                        historicalClassNames.length > 0
                            ? historicalClassNames
                            : fallbackClassNames,
                    scheduleIds: group.scheduleIds,
                    expectedParticipants,
                    presentParticipants,
                    absentParticipants,
                    totalParticipants: expectedParticipants,
                    absentStudents,
                    reportedPresentParticipants: latestReport?.studentCountPresent ?? null,
                    reportedAbsentParticipants: latestReport?.studentCountAbsent ?? null,
                    report: latestReport
                        ? {
                              id: latestReport.id,
                              signedAt: latestReport.signedAt,
                              notes: latestReport.notes,
                              incident: latestReport.incident,
                              proctor: latestReport.proctor,
                          }
                        : null,
                };
            }),
        )
    )
        .sort((a, b) => {
            const timeDiff = a.startTime.getTime() - b.startTime.getTime();
            if (timeDiff !== 0) return timeDiff;
            return String(a.room || '').localeCompare(String(b.room || ''), 'id');
        });

    res.json(
        new ApiResponse(200, {
            rows: reportRows,
            summary: {
                totalRooms: reportRows.length,
                totalExpected: reportRows.reduce((sum, row) => sum + row.expectedParticipants, 0),
                totalPresent: reportRows.reduce((sum, row) => sum + row.presentParticipants, 0),
                totalAbsent: reportRows.reduce((sum, row) => sum + row.absentParticipants, 0),
                reportedRooms: reportRows.filter((row) => !!row.report).length,
            },
        }),
    );
});
