import { DailyPresenceCaptureSource, DailyPresenceEventType, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { broadcastDomainEvent } from '../realtime/realtimeGateway';
import { createManyInAppNotifications } from '../services/mobilePushNotification.service';
import {
  DAILY_PRESENCE_SELF_SCAN_QR_TOKEN_TTL_SECONDS,
  buildDailyPresenceSelfScanQrToken,
  buildDailyPresenceSelfScanSessionManagerPayload,
  buildDailyPresenceSelfScanSessionPublicPayload,
  closeActiveDailyPresenceSelfScanSession,
  consumeDailyPresenceSelfScanQrToken,
  createActiveDailyPresenceSelfScanSession,
  getActiveDailyPresenceSelfScanSession,
  verifyDailyPresenceChallengeCode,
  verifyDailyPresenceSelfScanQrToken,
} from '../utils/dailyPresenceSelfScan';

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

const selfScanSessionSchema = z.object({
  checkpoint: z.enum(['CHECK_IN', 'CHECK_OUT']),
  gateLabel: z.string().trim().max(100).optional().nullable(),
});

const selfScanPassSchema = z.object({
  checkpoint: z.enum(['CHECK_IN', 'CHECK_OUT']),
  challengeCode: z.string().trim().min(4).max(16),
});

const selfScanPreviewSchema = z.object({
  qrToken: z.string().trim().min(16),
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
      photo: true,
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

async function buildStudentDailyPresenceStatePayload(params: {
  studentId: number;
  activeAcademicYear: {
    id: number;
    name: string;
  };
  dateKey: string;
}) {
  const targetDate = toDateOnly(params.dateKey);
  const student = await getOperationalStudentOrThrow(params.studentId, params.activeAcademicYear.id);

  const [attendance, recentEvents] = await Promise.all([
    prisma.dailyAttendance.findFirst({
      where: {
        studentId: student.id,
        classId: student.studentClass!.id,
        academicYearId: params.activeAcademicYear.id,
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
        academicYearId: params.activeAcademicYear.id,
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

  return {
    date: params.dateKey,
    academicYear: params.activeAcademicYear,
    student: {
      id: student.id,
      name: student.name,
      photo: student.photo || null,
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
  };
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
  const payload = await buildStudentDailyPresenceStatePayload({
    studentId,
    activeAcademicYear,
    dateKey,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      payload,
      'Status presensi siswa berhasil diambil',
    ),
  );
});

export const getOwnDailyPresence = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (String(user?.role || '').trim().toUpperCase() !== 'STUDENT') {
    throw new ApiError(403, 'Fitur ini khusus untuk siswa.');
  }

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const date = z.object({ date: z.string().optional() }).parse(req.query).date;
  const dateKey = date || getJakartaDateKey();
  const payload = await buildStudentDailyPresenceStatePayload({
    studentId: Number(user?.id || 0),
    activeAcademicYear,
    dateKey,
  });

  res.status(200).json(new ApiResponse(200, payload, 'Status presensi pribadi berhasil diambil'));
});

export const getActiveSelfScanSession = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { checkpoint } = selfScanSessionSchema.parse(req.query);
  const normalizedRole = String(user?.role || '').trim().toUpperCase();
  const isStudent = normalizedRole === 'STUDENT';
  if (normalizedRole === 'STUDENT') {
    if (!user?.id) {
      throw new ApiError(401, 'Sesi siswa tidak valid.');
    }
  } else {
    await getPresenceManagerProfile(Number(user?.id || 0));
  }

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  const session = await getActiveDailyPresenceSelfScanSession(checkpoint);

  const data =
    session && session.academicYearId === activeAcademicYear.id && session.dateKey === dateKey
      ? isStudent
        ? buildDailyPresenceSelfScanSessionPublicPayload(session)
        : buildDailyPresenceSelfScanSessionManagerPayload(session)
      : null;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeAcademicYear,
        session: data,
      },
      data ? 'Sesi scan mandiri aktif berhasil diambil' : 'Belum ada sesi scan mandiri yang aktif',
    ),
  );
});

export const startSelfScanSession = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const actor = await getPresenceManagerProfile(Number(user?.id || 0));
  const { checkpoint, gateLabel } = selfScanSessionSchema.parse(req.body);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();

  const session = await createActiveDailyPresenceSelfScanSession({
    checkpoint,
    gateLabel,
    actorId: actor.id,
    actorName: actor.name,
    academicYearId: activeAcademicYear.id,
    dateKey,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeAcademicYear,
        session: buildDailyPresenceSelfScanSessionManagerPayload(session),
      },
      checkpoint === 'CHECK_IN'
        ? 'Sesi scan mandiri masuk berhasil dibuka.'
        : 'Sesi scan mandiri pulang berhasil dibuka.',
    ),
  );
});

export const closeSelfScanSession = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { checkpoint } = selfScanSessionSchema.parse(req.body);
  await closeActiveDailyPresenceSelfScanSession(checkpoint);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        checkpoint,
      },
      checkpoint === 'CHECK_IN'
        ? 'Sesi scan mandiri masuk berhasil ditutup.'
        : 'Sesi scan mandiri pulang berhasil ditutup.',
    ),
  );
});

export const createSelfScanPass = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (String(user?.role || '').trim().toUpperCase() !== 'STUDENT') {
    throw new ApiError(403, 'QR scan mandiri hanya dapat dibuat oleh siswa.');
  }

  const { checkpoint, challengeCode } = selfScanPassSchema.parse(req.body);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const dateKey = getJakartaDateKey();
  const session = await getActiveDailyPresenceSelfScanSession(checkpoint);

  if (!session || session.academicYearId !== activeAcademicYear.id || session.dateKey !== dateKey) {
    throw new ApiError(400, 'Petugas belum membuka sesi scan untuk checkpoint ini.');
  }

  if (!verifyDailyPresenceChallengeCode(session, challengeCode, new Date())) {
    throw new ApiError(400, 'Kode challenge tidak cocok atau sudah kadaluarsa.');
  }

  const student = await getOperationalStudentOrThrow(Number(user?.id || 0), activeAcademicYear.id);
  const existingAttendance = await prisma.dailyAttendance.findFirst({
    where: {
      studentId: student.id,
      classId: student.studentClass!.id,
      academicYearId: activeAcademicYear.id,
      date: toDateOnly(dateKey),
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });

  if (checkpoint === 'CHECK_IN' && existingAttendance?.checkInTime) {
    throw new ApiError(400, 'Absen masuk hari ini sudah tercatat.');
  }
  if (checkpoint === 'CHECK_OUT' && existingAttendance?.checkOutTime) {
    throw new ApiError(400, 'Absen pulang hari ini sudah tercatat.');
  }

  const qrToken = buildDailyPresenceSelfScanQrToken({
    session,
    studentId: student.id,
    classId: student.studentClass!.id,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(qrToken, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        student: {
          id: student.id,
          name: student.name,
          photo: student.photo || null,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        session: buildDailyPresenceSelfScanSessionPublicPayload(session),
        checkpoint,
        qrToken,
        qrCodeDataUrl,
        qrExpiresAt: new Date(Date.now() + DAILY_PRESENCE_SELF_SCAN_QR_TOKEN_TTL_SECONDS * 1000).toISOString(),
      },
      checkpoint === 'CHECK_IN'
        ? 'QR absen masuk berhasil dibuat.'
        : 'QR absen pulang berhasil dibuat.',
    ),
  );
});

export const previewSelfScanPass = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await getPresenceManagerProfile(Number(user?.id || 0));
  const { qrToken } = selfScanPreviewSchema.parse(req.body);
  const decoded = verifyDailyPresenceSelfScanQrToken(qrToken);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const session = await getActiveDailyPresenceSelfScanSession(decoded.checkpoint);
  const dateKey = getJakartaDateKey();

  if (
    !session ||
    session.sessionId !== decoded.sessionId ||
    session.academicYearId !== activeAcademicYear.id ||
    session.dateKey !== dateKey
  ) {
    throw new ApiError(400, 'Sesi scan mandiri sudah tidak aktif.');
  }

  const student = await getOperationalStudentOrThrow(decoded.studentId, activeAcademicYear.id);
  if (student.studentClass!.id !== decoded.classId) {
    throw new ApiError(400, 'Data kelas siswa pada QR tidak cocok.');
  }

  const existingAttendance = await prisma.dailyAttendance.findFirst({
    where: {
      studentId: student.id,
      classId: student.studentClass!.id,
      academicYearId: activeAcademicYear.id,
      date: toDateOnly(dateKey),
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });

  const alreadyRecorded =
    decoded.checkpoint === 'CHECK_IN'
      ? Boolean(existingAttendance?.checkInTime)
      : Boolean(existingAttendance?.checkOutTime);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateKey,
        academicYear: activeAcademicYear,
        checkpoint: decoded.checkpoint,
        gateLabel: session.gateLabel,
        student: {
          id: student.id,
          name: student.name,
          photo: student.photo || null,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        alreadyRecorded,
      },
      'QR presensi berhasil dipindai. Silakan verifikasi identitas siswa.',
    ),
  );
});

export const confirmSelfScanPass = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const actor = await getPresenceManagerProfile(Number(user?.id || 0));
  const { qrToken } = selfScanPreviewSchema.parse(req.body);
  const decoded = verifyDailyPresenceSelfScanQrToken(qrToken);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const session = await getActiveDailyPresenceSelfScanSession(decoded.checkpoint);
  const dateKey = getJakartaDateKey();
  const targetDate = toDateOnly(dateKey);

  if (
    !session ||
    session.sessionId !== decoded.sessionId ||
    session.academicYearId !== activeAcademicYear.id ||
    session.dateKey !== dateKey
  ) {
    throw new ApiError(400, 'Sesi scan mandiri sudah tidak aktif.');
  }

  if (!(await consumeDailyPresenceSelfScanQrToken(qrToken))) {
    throw new ApiError(400, 'QR ini sudah pernah dipakai. Minta siswa buat QR baru.');
  }

  const student = await getOperationalStudentOrThrow(decoded.studentId, activeAcademicYear.id);
  if (student.studentClass!.id !== decoded.classId) {
    throw new ApiError(400, 'Data kelas siswa pada QR tidak cocok.');
  }

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

    if (decoded.checkpoint === 'CHECK_IN' && existing?.checkInTime) {
      throw new ApiError(400, 'Absen masuk hari ini sudah tercatat.');
    }
    if (decoded.checkpoint === 'CHECK_OUT' && existing?.checkOutTime) {
      throw new ApiError(400, 'Absen pulang hari ini sudah tercatat.');
    }

    const nextStatus =
      existing?.status === 'PRESENT' || existing?.status === 'LATE' ? existing.status : 'PRESENT';
    const shouldNotifyParent =
      decoded.checkpoint === 'CHECK_IN' ? !existing?.checkInTime : !existing?.checkOutTime;
    const upserted = existing
      ? await tx.dailyAttendance.update({
          where: { id: existing.id },
          data:
            decoded.checkpoint === 'CHECK_IN'
              ? {
                  status: nextStatus,
                  checkInTime: now,
                  checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkInReason: `Self scan ${session.gateLabel ? `(${session.gateLabel})` : 'mobile'}`,
                  checkInActorId: actor.id,
                }
              : {
                  status: nextStatus,
                  checkOutTime: now,
                  checkOutSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkOutReason: `Self scan ${session.gateLabel ? `(${session.gateLabel})` : 'mobile'}`,
                  checkOutActorId: actor.id,
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
        })
      : await tx.dailyAttendance.create({
          data: {
            date: targetDate,
            studentId: student.id,
            classId: student.studentClass!.id,
            academicYearId: activeAcademicYear.id,
            status: nextStatus,
            note: null,
            ...(decoded.checkpoint === 'CHECK_IN'
              ? {
                  checkInTime: now,
                  checkInSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkInReason: `Self scan ${session.gateLabel ? `(${session.gateLabel})` : 'mobile'}`,
                  checkInActorId: actor.id,
                }
              : {
                  checkOutTime: now,
                  checkOutSource: DailyPresenceCaptureSource.SELF_SCAN,
                  checkOutReason: `Self scan ${session.gateLabel ? `(${session.gateLabel})` : 'mobile'}`,
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
          decoded.checkpoint === 'CHECK_IN'
            ? DailyPresenceEventType.CHECK_IN
            : DailyPresenceEventType.CHECK_OUT,
        source: DailyPresenceCaptureSource.SELF_SCAN,
        reason: `Self scan terverifikasi petugas${session.gateLabel ? ` di ${session.gateLabel}` : ''}`,
        gateLabel: session.gateLabel || null,
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
      decoded.checkpoint === 'CHECK_IN'
        ? attendanceResult.attendance.checkInTime
        : attendanceResult.attendance.checkOutTime;
    await safeNotifyParentDailyPresence({
      studentId: student.id,
      studentName: student.name,
      classId: student.studentClass!.id,
      checkpoint: decoded.checkpoint,
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
          photo: student.photo || null,
          nis: student.nis,
          nisn: student.nisn,
          class: {
            id: student.studentClass!.id,
            name: student.studentClass!.name,
          },
        },
        presence: buildPresencePayload(attendanceResult.attendance),
      },
      decoded.checkpoint === 'CHECK_IN'
        ? 'Absen masuk scan mandiri berhasil diverifikasi.'
        : 'Absen pulang scan mandiri berhasil diverifikasi.',
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
