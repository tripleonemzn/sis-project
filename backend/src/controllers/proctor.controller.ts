import { Request, Response } from 'express';
import { AdditionalDuty, ExamSessionStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';

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

type ProctorRoomScheduleScope = {
    id: number;
    classId: number;
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
    const monitoredClassIds = Array.from(new Set(monitoredSchedules.map((item) => item.classId)));
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

        if (subjectId) {
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
    const monitoredClassIds = Array.from(new Set(monitoredSchedules.map((row: any) => row.classId)));
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
    const students = await prisma.user.findMany({
        where: {
            role: 'STUDENT',
            classId: { in: monitoredClassIds },
        },
        select: { id: true, name: true, nis: true, studentClass: { select: { name: true } } },
        orderBy: { name: 'asc' }
    });

    const sessions = await prisma.studentExamSession.findMany({
        where: { scheduleId: { in: monitoredScheduleIds } },
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
            scheduleId: { in: monitoredScheduleIds },
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
            className: s.studentClass?.name || '-',
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
                            classId: { in: monitoredClassIds },
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
            classNames: monitoredClassNames,
            teacherNames,
            monitoredScheduleIds,
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

    const [roomStudents, roomSessions] = await Promise.all([
        scope.monitoredClassIds.length > 0
            ? prisma.user.findMany({
                  where: {
                      role: 'STUDENT',
                      classId: { in: scope.monitoredClassIds },
                  },
                  select: { id: true },
              })
            : Promise.resolve([]),
        scope.monitoredScheduleIds.length > 0
            ? prisma.studentExamSession.findMany({
                  where: {
                      scheduleId: { in: scope.monitoredScheduleIds },
                      status: { in: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT] },
                  },
                  select: {
                      studentId: true,
                  },
              })
            : Promise.resolve([]),
    ]);

    const expectedCount = roomStudents.length;
    const presentCount = new Set(roomSessions.map((row) => row.studentId)).size;
    const absentCount = Math.max(0, expectedCount - presentCount);

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
                    classNames: scope.monitoredClassNames,
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
                    classNames: scope.monitoredClassNames,
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
    const where: any = {
        isActive: true,
    };
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
    }

    const schedules = await prisma.examSchedule.findMany({
        where,
        select: {
            id: true,
            room: true,
            startTime: true,
            endTime: true,
            sessionLabel: true,
            examType: true,
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
            sessionLabel: string | null;
            examType: string | null;
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
        const sessionKey = normalizeSessionLabel(schedule.sessionLabel) || '__no_session__';
        const groupKey = `${roomKey}::${schedule.startTime.toISOString()}::${schedule.endTime.toISOString()}::${sessionKey}::${String(schedule.examType || '').trim().toUpperCase()}`;
        const current = groupedByRoomSlot.get(groupKey) || {
            room: schedule.room || null,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            sessionLabel: schedule.sessionLabel || null,
            examType: schedule.examType || null,
            scheduleIds: [],
            classIds: [],
            classNames: [],
            reportRows: [],
            latestReportAt: null,
        };
        current.scheduleIds.push(schedule.id);
        current.classIds.push(schedule.classId);
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

    const allClassIds = Array.from(
        new Set(
            Array.from(groupedByRoomSlot.values())
                .flatMap((group) => group.classIds)
                .filter((classId) => Number.isFinite(classId) && classId > 0),
        ),
    );
    const classStudentCounts = allClassIds.length > 0
        ? await prisma.user.groupBy({
              by: ['classId'],
              where: {
                  role: 'STUDENT',
                  classId: { in: allClassIds },
              },
              _count: {
                  _all: true,
              },
          })
        : [];
    const classStudentCountMap = new Map<number, number>(
        classStudentCounts.map((row) => [Number(row.classId), Number(row._count?._all || 0)]),
    );

    const allScheduleIds = Array.from(
        new Set(Array.from(groupedByRoomSlot.values()).flatMap((group) => group.scheduleIds)),
    );
    const sessionRows = allScheduleIds.length > 0
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
    sessionRows.forEach((row) => {
        const bucket = studentIdsBySchedule.get(row.scheduleId) || new Set<number>();
        bucket.add(row.studentId);
        studentIdsBySchedule.set(row.scheduleId, bucket);
    });

    const reportRows = Array.from(groupedByRoomSlot.values())
        .map((group) => {
            const uniqueClassIds = Array.from(new Set(group.classIds));
            const uniqueClassNames = Array.from(new Set(group.classNames)).sort((a, b) => a.localeCompare(b, 'id'));
            const expectedParticipants = uniqueClassIds.reduce(
                (total, classId) => total + (classStudentCountMap.get(classId) || 0),
                0,
            );
            const presentSet = new Set<number>();
            group.scheduleIds.forEach((scheduleId) => {
                const students = studentIdsBySchedule.get(scheduleId);
                if (!students) return;
                students.forEach((studentId) => presentSet.add(studentId));
            });
            const computedPresent = presentSet.size;
            const computedAbsent = Math.max(0, expectedParticipants - computedPresent);

            const latestReport =
                group.reportRows
                    .slice()
                    .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0] || null;
            const presentParticipants =
                latestReport && (latestReport.studentCountPresent > 0 || latestReport.studentCountAbsent > 0)
                    ? latestReport.studentCountPresent
                    : computedPresent;
            const absentParticipants =
                latestReport && (latestReport.studentCountPresent > 0 || latestReport.studentCountAbsent > 0)
                    ? latestReport.studentCountAbsent
                    : computedAbsent;

            return {
                room: group.room,
                startTime: group.startTime,
                endTime: group.endTime,
                sessionLabel: group.sessionLabel,
                examType: group.examType,
                classNames: uniqueClassNames,
                scheduleIds: group.scheduleIds,
                expectedParticipants,
                presentParticipants,
                absentParticipants,
                totalParticipants: expectedParticipants,
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
        })
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
