import { DailyPresenceCaptureSource, DailyPresenceEventType, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { broadcastDomainEvent } from '../realtime/realtimeGateway';
import { createManyInAppNotifications } from '../services/mobilePushNotification.service';

function normalizeCode(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

async function getPresenceManagerProfile(userId: number) {
  const profile = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      role: true,
      name: true,
      username: true,
      ptkType: true,
    },
  });

  if (!profile) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  if (profile.role === 'ADMIN') {
    return profile;
  }

  if (profile.role === 'STAFF') {
    const ptkType = normalizeCode(profile.ptkType);
    if (
      ptkType === 'STAFF_ADMINISTRASI' ||
      ptkType === 'KEPALA_TU' ||
      ptkType === 'KEPALA_TATA_USAHA'
    ) {
      return profile;
    }
  }

  throw new ApiError(403, 'Akses presensi harian hanya untuk administrasi sekolah.');
}

async function getActiveAcademicYearOrThrow() {
  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  if (!activeAcademicYear) {
    throw new ApiError(400, 'Tahun ajaran aktif belum tersedia.');
  }

  return activeAcademicYear;
}

function getJakartaDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function toDateOnly(dateKey: string) {
  return new Date(dateKey);
}

function formatTime(value?: Date | null) {
  if (!value) return null;
  return value.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

const getDailyPresenceOverviewSchema = z.object({
  date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const getStudentDailyPresenceSchema = z.object({
  studentId: z.coerce.number().int(),
  date: z.string().optional(),
});

const saveAssistedDailyPresenceSchema = z.object({
  studentId: z.number().int(),
  checkpoint: z.enum(['CHECK_IN', 'CHECK_OUT']),
  reason: z.string().trim().min(3).max(500),
  gateLabel: z.string().trim().max(100).optional().nullable(),
});

function buildPresencePayload(
  attendance: {
    id: number;
    date: Date;
    status: string;
    note: string | null;
    checkInTime: Date | null;
    checkOutTime: Date | null;
    checkInSource: DailyPresenceCaptureSource | null;
    checkOutSource: DailyPresenceCaptureSource | null;
    checkInReason: string | null;
    checkOutReason: string | null;
  } | null,
) {
  if (!attendance) {
    return {
      id: null,
      date: null,
      status: null,
      note: null,
      checkInTime: null,
      checkOutTime: null,
      checkInSource: null,
      checkOutSource: null,
      checkInReason: null,
      checkOutReason: null,
    };
  }

  return {
    id: attendance.id,
    date: formatDate(attendance.date),
    status: attendance.status,
    note: attendance.note,
    checkInTime: formatTime(attendance.checkInTime),
    checkOutTime: formatTime(attendance.checkOutTime),
    checkInSource: attendance.checkInSource,
    checkOutSource: attendance.checkOutSource,
    checkInReason: attendance.checkInReason,
    checkOutReason: attendance.checkOutReason,
  };
}

async function getOperationalStudentOrThrow(studentId: number, activeAcademicYearId: number) {
  const student = await prisma.user.findUnique({
    where: { id: Number(studentId) },
    select: {
      id: true,
      name: true,
      nis: true,
      nisn: true,
      role: true,
      studentStatus: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          academicYearId: true,
        },
      },
    },
  });

  if (!student || student.role !== 'STUDENT') {
    throw new ApiError(404, 'Siswa tidak ditemukan.');
  }

  if (!student.studentClass || student.studentClass.academicYearId !== activeAcademicYearId) {
    throw new ApiError(400, 'Siswa belum terhubung ke kelas aktif pada tahun ajaran berjalan.');
  }

  return student;
}

async function safeNotifyParentDailyPresence(params: {
  studentId: number;
  studentName: string;
  classId: number;
  checkpoint: 'CHECK_IN' | 'CHECK_OUT';
  recordedAt: Date | null;
  dateKey: string;
}) {
  if (!params.recordedAt) return;

  const studentLink = await prisma.user.findUnique({
    where: { id: params.studentId },
    select: {
      parents: {
        select: {
          id: true,
        },
      },
    },
  });

  const parentIds = Array.from(
    new Set(
      (studentLink?.parents || [])
        .map((parent) => Number(parent.id))
        .filter((parentId) => Number.isInteger(parentId) && parentId > 0),
    ),
  );

  if (parentIds.length === 0) return;

  const timeLabel = formatTime(params.recordedAt) || '-';
  const route = `/parent/attendance?childId=${params.studentId}`;
  const message =
    params.checkpoint === 'CHECK_IN'
      ? `${params.studentName} tercatat masuk pukul ${timeLabel}.`
      : `${params.studentName} tercatat pulang pukul ${timeLabel}.`;

  const rows: Prisma.NotificationCreateManyInput[] = parentIds.map((parentId) => ({
    userId: parentId,
    title: 'Absensi Harian Anak',
    message,
    type: 'ATTENDANCE_DAILY_PRESENCE',
    data: {
      route,
      module: 'ATTENDANCE',
      attendanceMode: 'DAILY_PRESENCE',
      studentId: params.studentId,
      classId: params.classId,
      date: params.dateKey,
      checkpoint: params.checkpoint,
      recordedTime: timeLabel,
    },
  }));

  try {
    await createManyInAppNotifications({ data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[daily-presence] gagal mengirim notifikasi orang tua: ${message}`);
  }
}

export const getDailyPresenceOverview = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { date, limit } = getDailyPresenceOverviewSchema.parse(req.query);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = date || getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);
  const take = limit ?? 12;

  const [checkInCount, checkOutCount, openDayCount, assistedEventCount, recentEvents] = await Promise.all([
    prisma.dailyAttendance.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkInTime: { not: null },
      },
    }),
    prisma.dailyAttendance.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkOutTime: { not: null },
      },
    }),
    prisma.dailyAttendance.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        checkInTime: { not: null },
        checkOutTime: null,
      },
    }),
    prisma.dailyPresenceEvent.count({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        source: DailyPresenceCaptureSource.ASSISTED_SCAN,
      },
    }),
    prisma.dailyPresenceEvent.findMany({
      where: {
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { recordedAt: 'desc' },
      take,
      select: {
        id: true,
        eventType: true,
        source: true,
        reason: true,
        gateLabel: true,
        recordedAt: true,
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        summary: {
          checkInCount,
          checkOutCount,
          openDayCount,
          assistedEventCount,
        },
        recentEvents: recentEvents.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          source: event.source,
          reason: event.reason,
          gateLabel: event.gateLabel,
          recordedAt: event.recordedAt.toISOString(),
          recordedTime: formatTime(event.recordedAt),
          student: event.student,
          class: event.class,
          actor: event.actor,
        })),
      },
      'Ringkasan presensi harian berhasil diambil',
    ),
  );
});

export const getStudentDailyPresence = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { studentId, date } = getStudentDailyPresenceSchema.parse(req.query);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = date || getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);
  const student = await getOperationalStudentOrThrow(studentId, activeAcademicYear.id);

  const [attendance, recentEvents] = await Promise.all([
    prisma.dailyAttendance.findFirst({
      where: {
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        date: true,
        status: true,
        note: true,
        checkInTime: true,
        checkOutTime: true,
        checkInSource: true,
        checkOutSource: true,
        checkInReason: true,
        checkOutReason: true,
      },
    }),
    prisma.dailyPresenceEvent.findMany({
      where: {
        studentId: student.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { recordedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        eventType: true,
        source: true,
        reason: true,
        gateLabel: true,
        recordedAt: true,
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        student: {
          id: student.id,
          name: student.name,
          nis: student.nis,
          nisn: student.nisn,
          class: student.studentClass
            ? {
                id: student.studentClass.id,
                name: student.studentClass.name,
              }
            : null,
        },
        presence: buildPresencePayload(attendance),
        recentEvents: recentEvents.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          source: event.source,
          reason: event.reason,
          gateLabel: event.gateLabel,
          recordedAt: event.recordedAt.toISOString(),
          recordedTime: formatTime(event.recordedAt),
          actor: event.actor,
        })),
      },
      'Status presensi siswa berhasil diambil',
    ),
  );
});

export const saveAssistedDailyPresence = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const actor = await getPresenceManagerProfile(Number(user?.id || 0));
  const { studentId, checkpoint, reason, gateLabel } = saveAssistedDailyPresenceSchema.parse(req.body);

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);
  const student = await getOperationalStudentOrThrow(studentId, activeAcademicYear.id);
  const now = new Date();

  const attendanceResult = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyAttendance.findFirst({
      where: {
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
      },
      orderBy: { id: 'desc' },
    });

    const nextStatus =
      existing?.status === 'PRESENT' || existing?.status === 'LATE' ? existing.status : 'PRESENT';
    const shouldNotifyParent =
      checkpoint === 'CHECK_IN' ? !existing?.checkInTime : !existing?.checkOutTime;

    const data =
      checkpoint === 'CHECK_IN'
        ? {
            status: nextStatus,
            checkInTime: now,
            checkInSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
            checkInReason: reason,
            checkInActorId: actor.id,
          }
        : {
            status: nextStatus,
            checkOutTime: now,
            checkOutSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
            checkOutReason: reason,
            checkOutActorId: actor.id,
          };

    const upserted = existing
      ? await tx.dailyAttendance.update({
          where: { id: existing.id },
          data,
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        })
      : await tx.dailyAttendance.create({
          data: {
            date: targetDate,
            studentId: student.id,
            classId: student.studentClass!.id,
            academicYearId: activeAcademicYear.id,
            status: nextStatus,
            note: null,
            ...(checkpoint === 'CHECK_IN'
              ? {
                  checkInTime: now,
                  checkInSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
                  checkInReason: reason,
                  checkInActorId: actor.id,
                }
              : {
                  checkOutTime: now,
                  checkOutSource: DailyPresenceCaptureSource.ASSISTED_SCAN,
                  checkOutReason: reason,
                  checkOutActorId: actor.id,
                }),
          },
          select: {
            id: true,
            date: true,
            status: true,
            note: true,
            checkInTime: true,
            checkOutTime: true,
            checkInSource: true,
            checkOutSource: true,
            checkInReason: true,
            checkOutReason: true,
          },
        });

    await tx.dailyPresenceEvent.create({
      data: {
        dailyAttendanceId: upserted.id,
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: activeAcademicYear.id,
        date: targetDate,
        eventType:
          checkpoint === 'CHECK_IN'
            ? DailyPresenceEventType.CHECK_IN
            : DailyPresenceEventType.CHECK_OUT,
        source: DailyPresenceCaptureSource.ASSISTED_SCAN,
        reason,
        gateLabel: gateLabel || null,
        actorId: actor.id,
        recordedAt: now,
      },
    });

    return {
      attendance: upserted,
      shouldNotifyParent,
    };
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      attendanceMode: 'DAILY_PRESENCE',
      academicYearIds: [activeAcademicYear.id],
      classIds: [student.studentClass!.id],
      studentIds: [student.id],
      dates: [dateKey],
    },
  });

  if (attendanceResult.shouldNotifyParent) {
    const recordedAt =
      checkpoint === 'CHECK_IN'
        ? attendanceResult.attendance.checkInTime
        : attendanceResult.attendance.checkOutTime;
    await safeNotifyParentDailyPresence({
      studentId: student.id,
      studentName: student.name,
      classId: student.studentClass!.id,
      checkpoint,
      recordedAt,
      dateKey,
    });
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        student: {
          id: student.id,
          name: student.name,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        presence: buildPresencePayload(attendanceResult.attendance),
      },
      checkpoint === 'CHECK_IN'
        ? 'Absen masuk berhasil dibantu oleh petugas.'
        : 'Absen pulang berhasil dibantu oleh petugas.',
    ),
  );
});
