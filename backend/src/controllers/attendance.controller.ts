import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { broadcastDomainEvent } from '../realtime/realtimeGateway';
import { listHistoricalStudentsForClass } from '../utils/studentAcademicHistory';
import {
  ensureAcademicYearArchiveReadAccess,
  ensureAcademicYearArchiveWriteAccess,
} from '../utils/academicYearArchiveAccess';

function formatAttendanceTime(value?: Date | null) {
  if (!value) return null;
  return value.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ATTENDANCE_STATUS_VALUES = ['PRESENT', 'ABSENT', 'SICK', 'PERMISSION', 'LATE'] as const;
const ATTENDANCE_SUPERVISOR_DUTIES = new Set([
  'WAKASEK_KURIKULUM',
  'SEKRETARIS_KURIKULUM',
  'WAKASEK_KESISWAAN',
  'SEKRETARIS_KESISWAAN',
]);
const DAY_OF_WEEK_BY_UTC_INDEX = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type AttendanceStatusValue = (typeof ATTENDANCE_STATUS_VALUES)[number];
type AttendancePeriod = 'YEAR' | 'SEMESTER' | 'MONTH' | 'WEEK';

function normalizeDuties(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean);
}

async function isAttendanceSupervisor(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'PRINCIPAL') return true;

  const duties = normalizeDuties(user?.additionalDuties);
  if (duties.some((duty) => ATTENDANCE_SUPERVISOR_DUTIES.has(duty))) return true;

  if (!user?.id) return false;
  const actor = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { role: true, additionalDuties: true },
  });

  if (!actor) return false;
  const dbRole = String(actor.role || '').toUpperCase();
  if (dbRole === 'ADMIN' || dbRole === 'PRINCIPAL') return true;

  return normalizeDuties(actor.additionalDuties).some((duty) =>
    ATTENDANCE_SUPERVISOR_DUTIES.has(duty),
  );
}

function parseDateOnly(raw: string | Date) {
  if (raw instanceof Date) {
    return new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  }
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const parsed = new Date(raw);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

function toDateKey(date: Date) {
  return parseDateOnly(date).toISOString().slice(0, 10);
}

function maxDate(a: Date, b: Date) {
  return a.getTime() > b.getTime() ? a : b;
}

function minDate(a: Date, b: Date) {
  return a.getTime() < b.getTime() ? a : b;
}

async function resolveAcademicYear(academicYearId?: number | null) {
  const academicYear = academicYearId
    ? await prisma.academicYear.findUnique({ where: { id: Number(academicYearId) } })
    : await prisma.academicYear.findFirst({ where: { isActive: true } });

  if (!academicYear) {
    throw new ApiError(404, academicYearId ? 'Tahun akademik tidak ditemukan' : 'Tidak ada tahun akademik aktif');
  }

  return academicYear;
}

function resolvePeriodRange(params: {
  academicYear: {
    semester1Start: Date;
    semester1End: Date;
    semester2Start: Date;
    semester2End: Date;
  };
  period?: string | null;
  semester?: string | null;
  month?: number | null;
  year?: number | null;
  weekStart?: string | null;
}) {
  const academicStart = parseDateOnly(params.academicYear.semester1Start);
  const academicEnd = parseDateOnly(params.academicYear.semester2End);
  const period = String(params.period || 'YEAR').toUpperCase() as AttendancePeriod;
  const today = parseDateOnly(new Date());
  let startDate = academicStart;
  let endDate = academicEnd;
  let semester: 'ODD' | 'EVEN' | null = null;

  if (period === 'SEMESTER') {
    const requestedSemester = String(params.semester || '').toUpperCase();
    semester =
      requestedSemester === 'ODD' || requestedSemester === 'EVEN'
        ? requestedSemester
        : today.getTime() <= parseDateOnly(params.academicYear.semester1End).getTime()
          ? 'ODD'
          : 'EVEN';
    startDate = semester === 'ODD'
      ? parseDateOnly(params.academicYear.semester1Start)
      : parseDateOnly(params.academicYear.semester2Start);
    endDate = semester === 'ODD'
      ? parseDateOnly(params.academicYear.semester1End)
      : parseDateOnly(params.academicYear.semester2End);
  } else if (period === 'MONTH') {
    const month = Number(params.month || today.getUTCMonth() + 1);
    const year = Number(params.year || today.getUTCFullYear());
    startDate = new Date(Date.UTC(year, month - 1, 1));
    endDate = new Date(Date.UTC(year, month, 0));
  } else if (period === 'WEEK') {
    const base = params.weekStart ? parseDateOnly(params.weekStart) : today;
    const dayIndex = base.getUTCDay();
    const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
    startDate = addDays(base, mondayOffset);
    endDate = addDays(startDate, 6);
  }

  startDate = maxDate(startDate, academicStart);
  endDate = minDate(endDate, academicEnd);

  return {
    period: ['YEAR', 'SEMESTER', 'MONTH', 'WEEK'].includes(period) ? period : 'YEAR',
    semester,
    startDate,
    endDate,
    isEmpty: startDate.getTime() > endDate.getTime(),
  };
}

function createEmptyAttendanceSummary() {
  return {
    present: 0,
    late: 0,
    sick: 0,
    permission: 0,
    absent: 0,
    total: 0,
    percentage: 0,
  };
}

function applyStatusToSummary(summary: ReturnType<typeof createEmptyAttendanceSummary>, status: AttendanceStatusValue) {
  summary.total += 1;
  switch (status) {
    case 'PRESENT':
      summary.present += 1;
      break;
    case 'LATE':
      summary.late += 1;
      break;
    case 'SICK':
      summary.sick += 1;
      break;
    case 'PERMISSION':
      summary.permission += 1;
      break;
    case 'ABSENT':
      summary.absent += 1;
      break;
    default:
      break;
  }
  summary.percentage =
    summary.total > 0 ? Math.round(((summary.present + summary.late) / summary.total) * 100) : 0;
}

const saveSubjectAttendanceSchema = z.object({
  date: z.string().transform((str) => new Date(str)),
  classId: z.number().int(),
  subjectId: z.number().int(),
  academicYearId: z.number().int(),
  teacherAssignmentId: z.number().int().optional().nullable(),
  scheduleEntryId: z.number().int().optional().nullable(),
  records: z.array(
    z.object({
      studentId: z.number().int(),
      status: z.enum(['PRESENT', 'ABSENT', 'SICK', 'PERMISSION', 'LATE']),
      note: z.string().optional().nullable(),
    }),
  ),
});

const attendanceRecapQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
  classId: z.coerce.number().int().optional(),
  subjectId: z.coerce.number().int().optional(),
  teacherId: z.coerce.number().int().optional(),
  studentId: z.coerce.number().int().optional(),
  period: z.enum(['YEAR', 'SEMESTER', 'MONTH', 'WEEK']).optional(),
  semester: z.enum(['ODD', 'EVEN']).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
  weekStart: z.string().optional(),
  status: z.enum(ATTENDANCE_STATUS_VALUES).optional(),
  monitorStatus: z.enum(['SUBMITTED', 'MISSING', 'LATE_INPUT', 'EDITED']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

const saveDailyAttendanceSchema = z.object({
  date: z.string().transform((str) => new Date(str)),
  classId: z.number().int(),
  academicYearId: z.number().int(),
  records: z.array(
    z.object({
      studentId: z.number().int(),
      status: z.enum(['PRESENT', 'ABSENT', 'SICK', 'PERMISSION', 'LATE']),
      note: z.string().optional().nullable(),
    }),
  ),
});

export const saveDailyAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { date, classId, academicYearId, records } = saveDailyAttendanceSchema.parse(req.body);
  const user = (req as any).user;

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId,
    module: 'ATTENDANCE',
  });

  // Authorization Check
  if (user.role === 'STUDENT') {
     const classData = await prisma.class.findUnique({
        where: { id: classId },
        select: { presidentId: true }
     });
     if (classData?.presidentId !== user.id) {
        throw new ApiError(403, 'Anda bukan Ketua Murid di kelas ini.');
     }
  }

  // Transaction to save daily attendance
  await prisma.$transaction(async (tx) => {
      for (const record of records) {
          const existing = await tx.dailyAttendance.findFirst({
              where: {
                  date: { equals: date },
                  studentId: record.studentId,
                  classId, 
                  academicYearId
              }
          });

          if (existing) {
              await tx.dailyAttendance.update({
                  where: { id: existing.id },
                  data: { status: record.status, note: record.note }
              });
          } else {
              await tx.dailyAttendance.create({
                  data: {
                      date,
                      studentId: record.studentId,
                      classId,
                      academicYearId,
                      status: record.status,
                      note: record.note
                  }
              });
          }
      }
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      classIds: [classId],
      academicYearIds: [academicYearId],
      dates: [date.toISOString().slice(0, 10)],
      attendanceMode: 'DAILY',
    },
  });
  
  res.status(200).json(new ApiResponse(200, null, 'Presensi harian berhasil disimpan'));
});

const getDailyAttendanceSchema = z.object({
  date: z.string(),
  classId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
});

export const getDailyAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { date, classId, academicYearId } = getDailyAttendanceSchema.parse(req.query);
  const targetDate = new Date(date);
  const user = (req as any).user;
  const canViewPresenceTime = user?.role !== 'STUDENT';

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId,
    module: 'ATTENDANCE',
    classId,
  });

  // 1. Fetch students from the requested academic year/class snapshot.
  const students = await listHistoricalStudentsForClass(Number(classId), academicYearId);

  // 2. Fetch attendance records
  const attendances = await prisma.dailyAttendance.findMany({
    where: {
      classId,
      academicYearId,
      date: {
        equals: targetDate,
      },
    },
    select: {
      studentId: true,
      status: true,
      note: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });

  // 3. Map records to students
  const result = students.map((student) => {
    const record = attendances.find((a) => a.studentId === student.id);
    return {
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
      },
      status: record?.status || null,
      note: record?.note || null,
      checkInTime: canViewPresenceTime ? formatAttendanceTime(record?.checkInTime) : null,
      checkOutTime: canViewPresenceTime ? formatAttendanceTime(record?.checkOutTime) : null,
    };
  });

  res.status(200).json(new ApiResponse(200, result, 'Data presensi harian berhasil diambil'));
});

const getSubjectAttendanceSchema = z.object({
  date: z.string(),
  classId: z.coerce.number().int(),
  subjectId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
});

export const getSubjectAttendanceByDate = asyncHandler(async (req: Request, res: Response) => {
  const { date, classId, subjectId, academicYearId } = getSubjectAttendanceSchema.parse(req.query);
  const user = (req as any).user;

  const targetDate = new Date(date);
  // Set to start of day in UTC or consistent timezone handling
  // For now, assuming date string is YYYY-MM-DD

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId,
    module: 'ATTENDANCE',
    classId,
    subjectId,
  });
  
  const attendance = await prisma.attendance.findFirst({
    where: {
      classId,
      subjectId,
      academicYearId,
      date: {
        equals: targetDate,
      },
    },
    include: {
      records: {
        select: {
          studentId: true,
          status: true,
          note: true,
        },
      },
    },
  });

  res.status(200).json(new ApiResponse(200, attendance, 'Data presensi mapel berhasil diambil'));
});

export const saveSubjectAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { date, classId, subjectId, academicYearId, records, teacherAssignmentId, scheduleEntryId } =
    saveSubjectAttendanceSchema.parse(req.body);
  const user = (req as any).user;

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId,
    module: 'ATTENDANCE',
  });

  const requestedScheduleEntry = scheduleEntryId
    ? await prisma.scheduleEntry.findFirst({
        where: {
          id: scheduleEntryId,
          academicYearId,
          classId,
          teacherAssignment: {
            subjectId,
          },
        },
        select: {
          id: true,
          teacherAssignmentId: true,
        },
      })
    : null;

  if (scheduleEntryId && !requestedScheduleEntry) {
    throw new ApiError(400, 'Jadwal mengajar tidak sesuai dengan kelas/mapel/tahun ajaran.');
  }

  const resolvedTeacherAssignment = await prisma.teacherAssignment.findFirst({
    where: {
      id: teacherAssignmentId || requestedScheduleEntry?.teacherAssignmentId || undefined,
      classId,
      subjectId,
      academicYearId,
      ...(String(user?.role || '').toUpperCase() === 'TEACHER'
        ? { teacherId: Number(user.id) }
        : {}),
    },
    select: { id: true },
  });

  const fallbackTeacherAssignment = resolvedTeacherAssignment
    ? null
    : await prisma.teacherAssignment.findFirst({
        where: {
          classId,
          subjectId,
          academicYearId,
          ...(String(user?.role || '').toUpperCase() === 'TEACHER'
            ? { teacherId: Number(user.id) }
            : {}),
        },
        select: { id: true },
      });

  const effectiveTeacherAssignmentId =
    resolvedTeacherAssignment?.id || fallbackTeacherAssignment?.id || null;
  const actorId = Number(user?.id || 0) || null;
  const submittedStudentIds = records.map((record) => record.studentId);

  // Transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // 1. Find or Create Attendance Header
    let attendance = await tx.attendance.findFirst({
      where: {
        classId,
        subjectId,
        academicYearId,
        date: {
          equals: date,
        },
      },
    });

    if (!attendance) {
      attendance = await tx.attendance.create({
        data: {
          date,
          classId,
          subjectId,
          academicYearId,
          teacherAssignmentId: effectiveTeacherAssignmentId,
          scheduleEntryId: requestedScheduleEntry?.id || null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
    } else {
      attendance = await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          teacherAssignmentId: effectiveTeacherAssignmentId || attendance.teacherAssignmentId,
          scheduleEntryId: requestedScheduleEntry?.id || attendance.scheduleEntryId,
          updatedById: actorId,
        },
      });
    }

    // 2. Preserve existing rows where possible so future audit can remain stable.
    const existingRecords = await tx.attendanceRecord.findMany({
      where: { attendanceId: attendance.id },
      select: { id: true, studentId: true },
    });
    const existingByStudentId = new Map(existingRecords.map((record) => [record.studentId, record]));

    for (const record of records) {
      const existing = existingByStudentId.get(record.studentId);
      if (existing) {
        await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            status: record.status,
            note: record.note,
          },
        });
      } else {
        await tx.attendanceRecord.create({
          data: {
            attendanceId: attendance.id,
            studentId: record.studentId,
            status: record.status,
            note: record.note,
          },
        });
      }
    }

    await tx.attendanceRecord.deleteMany({
      where: {
        attendanceId: attendance.id,
        ...(submittedStudentIds.length > 0 ? { studentId: { notIn: submittedStudentIds } } : {}),
      },
    });

    return attendance;
  });

  broadcastDomainEvent({
    domain: 'ATTENDANCE',
    action: 'UPDATED',
    scope: {
      classIds: [classId],
      subjectIds: [subjectId],
      academicYearIds: [academicYearId],
      dates: [date.toISOString().slice(0, 10)],
      attendanceMode: 'SUBJECT',
    },
  });

  res.status(200).json(new ApiResponse(200, result, 'Presensi mapel berhasil disimpan'));
});

export const getDailyAttendanceRecap = asyncHandler(async (req: Request, res: Response) => {
  const { classId, academicYearId, semester } = req.query;
  const user = (req as any).user;

  if (!classId) {
    throw new ApiError(400, 'classId wajib diisi');
  }

  let academicYear: any;

  if (academicYearId) {
    academicYear = await prisma.academicYear.findUnique({
      where: { id: Number(academicYearId) },
    });

    if (!academicYear) {
      throw new ApiError(404, 'Tahun akademik tidak ditemukan');
    }
  } else {
    academicYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });

    if (!academicYear) {
      throw new ApiError(404, 'Tidak ada tahun akademik aktif');
    }
  }

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId: academicYear.id,
    module: 'ATTENDANCE',
    classId: Number(classId),
  });

  const sem = semester ? String(semester).toUpperCase() : null;

  let startDate: Date;
  let endDate: Date;

  if (sem === 'ODD') {
    startDate = academicYear.semester1Start;
    endDate = academicYear.semester1End;
  } else if (sem === 'EVEN') {
    startDate = academicYear.semester2Start;
    endDate = academicYear.semester2End;
  } else {
    startDate = academicYear.semester1Start;
    endDate = academicYear.semester2End;
  }

  // 1. Fetch students from the requested academic year/class snapshot.
  const students = await listHistoricalStudentsForClass(Number(classId), academicYear.id);

  // 2. Initialize map with all students
  const studentMap = new Map<
    number,
    {
      student: {
        id: number;
        name: string;
        nis: string | null;
        nisn: string | null;
      };
      present: number;
      late: number;
      sick: number;
      permission: number;
      absent: number;
      total: number;
      percentage: number;
    }
  >();

  for (const student of students) {
    studentMap.set(student.id, {
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
      },
      present: 0,
      late: 0,
      sick: 0,
      permission: 0,
      absent: 0,
      total: 0,
      percentage: 0,
    });
  }

  // 3. Fetch attendance records
  const records = await prisma.dailyAttendance.findMany({
    where: {
      classId: Number(classId),
      academicYearId: academicYear.id,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      studentId: true,
      status: true,
    },
  });

  // 4. Update counts based on records
  for (const record of records) {
    const studentId = record.studentId;

    if (studentMap.has(studentId)) {
      const summary = studentMap.get(studentId)!;

      summary.total += 1;

      switch (record.status) {
        case 'PRESENT':
          summary.present += 1;
          break;
        case 'LATE':
          summary.late += 1;
          break;
        case 'SICK':
          summary.sick += 1;
          break;
        case 'PERMISSION':
          summary.permission += 1;
          break;
        case 'ABSENT':
          summary.absent += 1;
          break;
        default:
          break;
      }
    }
  }

  for (const summary of studentMap.values()) {
    const countedPresent = summary.present + summary.late;
    summary.percentage =
      summary.total > 0 ? Math.round((countedPresent / summary.total) * 100) : 0;
  }

  const recap = Array.from(studentMap.values());

  res.status(200).json(
    new ApiResponse(
      200,
      {
        recap,
        meta: {
          classId: Number(classId),
          academicYearId: academicYear.id,
          semester: sem,
          dateRange: {
            start: startDate,
            end: endDate,
          },
        },
      },
      'Rekap absensi harian berhasil diambil',
    ),
  );
});

export const getDailyAttendanceRecapDetail = asyncHandler(async (req: Request, res: Response) => {
  const query = attendanceRecapQuerySchema.parse(req.query);
  const user = (req as any).user;

  if (!query.classId) {
    throw new ApiError(400, 'classId wajib diisi');
  }

  const academicYear = await resolveAcademicYear(query.academicYearId || null);
  const periodRange = resolvePeriodRange({
    academicYear,
    period: query.period,
    semester: query.semester,
    month: query.month,
    year: query.year,
    weekStart: query.weekStart,
  });

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId: academicYear.id,
    module: 'ATTENDANCE',
    classId: query.classId,
  });

  const students = await listHistoricalStudentsForClass(query.classId, academicYear.id);
  const studentMap = new Map<
    number,
    {
      student: {
        id: number;
        name: string;
        nis: string | null;
        nisn: string | null;
      };
      summary: ReturnType<typeof createEmptyAttendanceSummary>;
      details: Array<{
        id: number;
        date: Date;
        status: AttendanceStatusValue;
        note: string | null;
        checkInTime: string | null;
        checkOutTime: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>;
    }
  >();

  for (const student of students) {
    studentMap.set(student.id, {
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
      },
      summary: createEmptyAttendanceSummary(),
      details: [],
    });
  }

  if (!periodRange.isEmpty) {
    const records = await prisma.dailyAttendance.findMany({
      where: {
        classId: query.classId,
        academicYearId: academicYear.id,
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.status ? { status: query.status } : {}),
        date: {
          gte: periodRange.startDate,
          lte: periodRange.endDate,
        },
      },
      orderBy: [{ date: 'asc' }, { student: { name: 'asc' } }],
      select: {
        id: true,
        studentId: true,
        date: true,
        status: true,
        note: true,
        checkInTime: true,
        checkOutTime: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    for (const record of records) {
      const row = studentMap.get(record.studentId);
      if (!row) continue;
      applyStatusToSummary(row.summary, record.status as AttendanceStatusValue);
      row.details.push({
        id: record.id,
        date: record.date,
        status: record.status as AttendanceStatusValue,
        note: record.note,
        checkInTime: formatAttendanceTime(record.checkInTime),
        checkOutTime: formatAttendanceTime(record.checkOutTime),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }
  }

  const studentsWithDetails = Array.from(studentMap.values()).filter((row) =>
    query.studentId ? row.student.id === query.studentId : true,
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        students: studentsWithDetails,
        meta: {
          classId: query.classId,
          academicYearId: academicYear.id,
          period: periodRange.period,
          semester: periodRange.semester,
          status: query.status || null,
          dateRange: {
            start: periodRange.startDate,
            end: periodRange.endDate,
          },
        },
      },
      'Detail rekap absensi harian berhasil diambil',
    ),
  );
});

export const getSubjectAttendanceRecap = asyncHandler(async (req: Request, res: Response) => {
  const query = attendanceRecapQuerySchema.parse(req.query);
  const user = (req as any).user;

  if (!query.classId || !query.subjectId) {
    throw new ApiError(400, 'classId dan subjectId wajib diisi');
  }

  const academicYear = await resolveAcademicYear(query.academicYearId || null);
  const periodRange = resolvePeriodRange({
    academicYear,
    period: query.period,
    semester: query.semester,
    month: query.month,
    year: query.year,
    weekStart: query.weekStart,
  });

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId: academicYear.id,
    module: 'ATTENDANCE',
    classId: query.classId,
    subjectId: query.subjectId,
  });

  const supervisor = await isAttendanceSupervisor(user);
  if (!supervisor && String(user?.role || '').toUpperCase() === 'TEACHER') {
    const ownsAssignment = await prisma.teacherAssignment.count({
      where: {
        teacherId: Number(user.id),
        academicYearId: academicYear.id,
        classId: query.classId,
        subjectId: query.subjectId,
      },
    });
    if (!ownsAssignment) {
      throw new ApiError(403, 'Anda hanya dapat melihat rekap presensi mapel yang Anda ampu.');
    }
  }

  const students = await listHistoricalStudentsForClass(query.classId, academicYear.id);
  const studentMap = new Map<
    number,
    {
      student: {
        id: number;
        name: string;
        nis: string | null;
        nisn: string | null;
      };
      summary: ReturnType<typeof createEmptyAttendanceSummary>;
      details: Array<{
        attendanceId: number;
        date: Date;
        status: AttendanceStatusValue;
        note: string | null;
        recordedAt: Date;
        editedAt: Date;
        recordedById: number | null;
        editedById: number | null;
        recordedByName: string | null;
        editedByName: string | null;
      }>;
    }
  >();

  for (const student of students) {
    studentMap.set(student.id, {
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
      },
      summary: createEmptyAttendanceSummary(),
      details: [],
    });
  }

  if (!periodRange.isEmpty) {
    const attendances = await prisma.attendance.findMany({
      where: {
        classId: query.classId,
        subjectId: query.subjectId,
        academicYearId: academicYear.id,
        date: {
          gte: periodRange.startDate,
          lte: periodRange.endDate,
        },
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
        updatedById: true,
        records: {
          where: {
            ...(query.studentId ? { studentId: query.studentId } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
          select: {
            studentId: true,
            status: true,
            note: true,
          },
        },
      },
    });

    const actorIds = Array.from(
      new Set(
        attendances
          .flatMap((attendance) => [attendance.createdById, attendance.updatedById])
          .filter((id): id is number => Boolean(id)),
      ),
    );
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));

    for (const attendance of attendances) {
      for (const record of attendance.records) {
        const row = studentMap.get(record.studentId);
        if (!row) continue;
        applyStatusToSummary(row.summary, record.status as AttendanceStatusValue);
        row.details.push({
          attendanceId: attendance.id,
          date: attendance.date,
          status: record.status as AttendanceStatusValue,
          note: record.note,
          recordedAt: attendance.createdAt,
          editedAt: attendance.updatedAt,
          recordedById: attendance.createdById,
          editedById: attendance.updatedById,
          recordedByName: attendance.createdById
            ? actorNameById.get(attendance.createdById) || null
            : null,
          editedByName: attendance.updatedById
            ? actorNameById.get(attendance.updatedById) || null
            : null,
        });
      }
    }
  }

  const studentsWithDetails = Array.from(studentMap.values()).filter((row) =>
    query.studentId ? row.student.id === query.studentId : true,
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        students: studentsWithDetails,
        meta: {
          classId: query.classId,
          subjectId: query.subjectId,
          academicYearId: academicYear.id,
          period: periodRange.period,
          semester: periodRange.semester,
          status: query.status || null,
          dateRange: {
            start: periodRange.startDate,
            end: periodRange.endDate,
          },
        },
      },
      'Rekap presensi mapel berhasil diambil',
    ),
  );
});

export const getTeacherClassAttendanceRecap = asyncHandler(async (req: Request, res: Response) => {
  const query = attendanceRecapQuerySchema.parse(req.query);
  const user = (req as any).user;
  const academicYear = await resolveAcademicYear(query.academicYearId || null);
  const supervisor = await isAttendanceSupervisor(user);
  const actorRole = String(user?.role || '').toUpperCase();
  const effectiveTeacherId = supervisor ? query.teacherId : actorRole === 'TEACHER' ? Number(user.id) : query.teacherId;

  if (!supervisor && actorRole !== 'TEACHER') {
    throw new ApiError(403, 'Anda tidak memiliki akses monitoring presensi guru.');
  }

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId: academicYear.id,
    module: 'ATTENDANCE',
    teacherId: effectiveTeacherId || undefined,
    classId: query.classId,
    subjectId: query.subjectId,
  });

  const periodRange = resolvePeriodRange({
    academicYear,
    period: query.period || 'WEEK',
    semester: query.semester,
    month: query.month,
    year: query.year,
    weekStart: query.weekStart,
  });

  const scheduleEntries = periodRange.isEmpty
    ? []
    : await prisma.scheduleEntry.findMany({
        where: {
          academicYearId: academicYear.id,
          ...(query.classId ? { classId: query.classId } : {}),
          teacherAssignment: {
            ...(effectiveTeacherId ? { teacherId: effectiveTeacherId } : {}),
            ...(query.subjectId ? { subjectId: query.subjectId } : {}),
          },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }, { class: { name: 'asc' } }],
        include: {
          teacherAssignment: {
            include: {
              teacher: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true, code: true } },
              class: { select: { id: true, name: true, level: true } },
            },
          },
        },
      });

  const assignmentIds = Array.from(new Set(scheduleEntries.map((entry) => entry.teacherAssignmentId)));
  const classSubjectScopes = Array.from(
    new Map(
      scheduleEntries.map((entry) => [
        `${entry.classId}|${entry.teacherAssignment.subjectId}`,
        { classId: entry.classId, subjectId: entry.teacherAssignment.subjectId },
      ]),
    ).values(),
  );
  const teacherAttendanceScope =
    effectiveTeacherId && scheduleEntries.length > 0
      ? {
          OR: [
            ...(assignmentIds.length > 0 ? [{ teacherAssignmentId: { in: assignmentIds } }] : []),
            ...classSubjectScopes.map((scope) => ({
              classId: scope.classId,
              subjectId: scope.subjectId,
            })),
          ],
        }
      : effectiveTeacherId
        ? { id: -1 }
        : {};

  const [attendanceRows, holidays] = periodRange.isEmpty
    ? [[], []]
    : await Promise.all([
        prisma.attendance.findMany({
          where: {
            academicYearId: academicYear.id,
            ...(query.classId ? { classId: query.classId } : {}),
            ...(query.subjectId ? { subjectId: query.subjectId } : {}),
            date: {
              gte: periodRange.startDate,
              lte: periodRange.endDate,
            },
            ...teacherAttendanceScope,
          },
          select: {
            id: true,
            date: true,
            classId: true,
            subjectId: true,
            teacherAssignmentId: true,
            scheduleEntryId: true,
            createdAt: true,
            updatedAt: true,
            createdById: true,
            updatedById: true,
          },
        }),
        prisma.academicEvent.findMany({
          where: {
            academicYearId: academicYear.id,
            isHoliday: true,
            startDate: { lte: periodRange.endDate },
            endDate: { gte: periodRange.startDate },
          },
          select: { startDate: true, endDate: true },
        }),
      ]);

  const holidayDateKeys = new Set<string>();
  for (const holiday of holidays) {
    let cursor = maxDate(parseDateOnly(holiday.startDate), periodRange.startDate);
    const holidayEnd = minDate(parseDateOnly(holiday.endDate), periodRange.endDate);
    while (cursor.getTime() <= holidayEnd.getTime()) {
      holidayDateKeys.add(toDateKey(cursor));
      cursor = addDays(cursor, 1);
    }
  }

  const attendanceByScheduleDate = new Map<string, (typeof attendanceRows)[number]>();
  const attendanceByAssignmentDate = new Map<string, (typeof attendanceRows)[number]>();
  const attendanceByClassSubjectDate = new Map<string, (typeof attendanceRows)[number]>();
  for (const attendance of attendanceRows) {
    const dateKey = toDateKey(attendance.date);
    if (attendance.scheduleEntryId) {
      attendanceByScheduleDate.set(`${attendance.scheduleEntryId}|${dateKey}`, attendance);
    }
    if (attendance.teacherAssignmentId) {
      attendanceByAssignmentDate.set(`${attendance.teacherAssignmentId}|${dateKey}`, attendance);
    }
    attendanceByClassSubjectDate.set(
      `${attendance.classId}|${attendance.subjectId}|${dateKey}`,
      attendance,
    );
  }

  const sessions: Array<{
    date: Date;
    dayOfWeek: string;
    period: number;
    room: string | null;
    teacher: { id: number; name: string };
    class: { id: number; name: string; level: string | null };
    subject: { id: number; name: string; code: string | null };
    status: 'SUBMITTED' | 'MISSING';
    isLateInput: boolean;
    isEdited: boolean;
    attendance: null | {
      id: number;
      recordedAt: Date;
      editedAt: Date;
      recordedById: number | null;
      editedById: number | null;
    };
  }> = [];

  for (const entry of scheduleEntries) {
    let cursor = periodRange.startDate;
    while (cursor.getTime() <= periodRange.endDate.getTime()) {
      const dateKey = toDateKey(cursor);
      if (
        DAY_OF_WEEK_BY_UTC_INDEX[cursor.getUTCDay()] === entry.dayOfWeek &&
        !holidayDateKeys.has(dateKey)
      ) {
        const attendance =
          attendanceByScheduleDate.get(`${entry.id}|${dateKey}`) ||
          attendanceByAssignmentDate.get(`${entry.teacherAssignmentId}|${dateKey}`) ||
          attendanceByClassSubjectDate.get(
            `${entry.classId}|${entry.teacherAssignment.subjectId}|${dateKey}`,
          ) ||
          null;
        const isLateInput = attendance ? toDateKey(attendance.createdAt) > dateKey : false;
        const isEdited = attendance
          ? attendance.updatedAt.getTime() - attendance.createdAt.getTime() > 1000
          : false;

        sessions.push({
          date: cursor,
          dayOfWeek: entry.dayOfWeek,
          period: entry.period,
          room: entry.room,
          teacher: {
            id: entry.teacherAssignment.teacher.id,
            name: entry.teacherAssignment.teacher.name,
          },
          class: {
            id: entry.teacherAssignment.class.id,
            name: entry.teacherAssignment.class.name,
            level: entry.teacherAssignment.class.level,
          },
          subject: {
            id: entry.teacherAssignment.subject.id,
            name: entry.teacherAssignment.subject.name,
            code: entry.teacherAssignment.subject.code,
          },
          status: attendance ? 'SUBMITTED' : 'MISSING',
          isLateInput,
          isEdited,
          attendance: attendance
            ? {
                id: attendance.id,
                recordedAt: attendance.createdAt,
                editedAt: attendance.updatedAt,
                recordedById: attendance.createdById,
                editedById: attendance.updatedById,
              }
            : null,
        });
      }
      cursor = addDays(cursor, 1);
    }
  }

  const filteredSessions = sessions.filter((session) => {
    if (query.monitorStatus === 'SUBMITTED') return session.status === 'SUBMITTED';
    if (query.monitorStatus === 'MISSING') return session.status === 'MISSING';
    if (query.monitorStatus === 'LATE_INPUT') return session.isLateInput;
    if (query.monitorStatus === 'EDITED') return session.isEdited;
    return true;
  });

  const page = query.page || 1;
  const pageSize = query.pageSize || 100;
  const startIndex = (page - 1) * pageSize;
  const pagedSessions = filteredSessions.slice(startIndex, startIndex + pageSize);

  const summary = sessions.reduce(
    (acc, session) => {
      acc.expected += 1;
      if (session.status === 'SUBMITTED') acc.submitted += 1;
      if (session.status === 'MISSING') acc.missing += 1;
      if (session.isLateInput) acc.lateInput += 1;
      if (session.isEdited) acc.edited += 1;
      return acc;
    },
    { expected: 0, submitted: 0, missing: 0, lateInput: 0, edited: 0 },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        summary,
        sessions: pagedSessions,
        pagination: {
          page,
          pageSize,
          total: filteredSessions.length,
          totalPages: Math.max(1, Math.ceil(filteredSessions.length / pageSize)),
        },
        meta: {
          academicYearId: academicYear.id,
          classId: query.classId || null,
          subjectId: query.subjectId || null,
          teacherId: effectiveTeacherId || null,
          period: periodRange.period,
          semester: periodRange.semester,
          monitorStatus: query.monitorStatus || null,
          dateRange: {
            start: periodRange.startDate,
            end: periodRange.endDate,
          },
        },
      },
      'Monitoring presensi guru berhasil diambil',
    ),
  );
});

export const getLateSummaryByClass = asyncHandler(async (req: Request, res: Response) => {
  const { classId, academicYearId } = req.query;
  const user = (req as any).user;

  if (!classId) {
    throw new ApiError(400, 'classId wajib diisi');
  }

  let academicYear: any;

  if (academicYearId) {
    academicYear = await prisma.academicYear.findUnique({
      where: { id: Number(academicYearId) },
    });

    if (!academicYear) {
      throw new ApiError(404, 'Tahun akademik tidak ditemukan');
    }
  } else {
    academicYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });

    if (!academicYear) {
      throw new ApiError(404, 'Tidak ada tahun akademik aktif');
    }
  }

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId: academicYear.id,
    module: 'ATTENDANCE',
    classId: Number(classId),
  });

  // 1. Fetch students from the requested academic year/class snapshot.
  const students = await listHistoricalStudentsForClass(Number(classId), academicYear.id);

  const studentMap = new Map<
    number,
    {
      student: {
        id: number;
        name: string;
        nis: string | null;
        nisn: string | null;
      };
      semester1Late: number;
      semester2Late: number;
      totalLate: number;
    }
  >();

  // 2. Initialize map
  for (const student of students) {
    studentMap.set(student.id, {
      student: {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
      },
      semester1Late: 0,
      semester2Late: 0,
      totalLate: 0,
    });
  }

  const semester1Start = academicYear.semester1Start;
  const semester1End = academicYear.semester1End;
  const semester2Start = academicYear.semester2Start;
  const semester2End = academicYear.semester2End;

  // 3. Fetch LATE records
  const records = await prisma.dailyAttendance.findMany({
    where: {
      classId: Number(classId),
      academicYearId: academicYear.id,
      status: 'LATE',
      date: {
        gte: semester1Start,
        lte: semester2End,
      },
    },
    select: {
      studentId: true,
      date: true,
    },
  });

  // 4. Update counts
  for (const record of records) {
    const summary = studentMap.get(record.studentId);
    if (!summary) continue;

    const date = record.date;

    if (date >= semester1Start && date <= semester1End) {
      summary.semester1Late += 1;
    } else if (date >= semester2Start && date <= semester2End) {
      summary.semester2Late += 1;
    }

    summary.totalLate = summary.semester1Late + summary.semester2Late;
  }

  const recap = Array.from(studentMap.values());

  res.status(200).json(
    new ApiResponse(
      200,
      {
        recap,
        meta: {
          classId: Number(classId),
          academicYearId: academicYear.id,
        },
      },
      'Rekap keterlambatan berhasil diambil',
    ),
  );
});

const getStudentAttendanceHistorySchema = z.object({
  month: z.coerce.number().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  studentId: z.coerce.number().int().optional(),
  student_id: z.coerce.number().int().optional(),
});

export const getStudentAttendanceHistory = asyncHandler(async (req: Request, res: Response) => {
  const { month, year, startDate, endDate, studentId, student_id } = getStudentAttendanceHistorySchema.parse(req.query);
  const user = (req as any).user;
  const requestedStudentId = studentId ?? student_id;

  let targetStudentId = user.id as number;

  if (user.role === 'STUDENT') {
    if (requestedStudentId && Number(requestedStudentId) !== Number(user.id)) {
      throw new ApiError(403, 'Siswa hanya dapat melihat riwayat presensi miliknya sendiri');
    }
    targetStudentId = Number(user.id);
  } else if (user.role === 'PARENT') {
    if (!requestedStudentId) {
      throw new ApiError(400, 'student_id wajib diisi untuk role orang tua');
    }

    const parent = await prisma.user.findUnique({
      where: { id: Number(user.id) },
      select: {
        children: {
          select: {
            id: true,
          },
        },
      },
    });

    const childIds = new Set((parent?.children || []).map((child) => child.id));
    if (!childIds.has(Number(requestedStudentId))) {
      throw new ApiError(403, 'Anda tidak memiliki akses ke data presensi siswa ini');
    }

    targetStudentId = Number(requestedStudentId);
  } else {
    throw new ApiError(403, 'Role ini tidak memiliki akses ke endpoint riwayat presensi siswa');
  }

  let start: Date, end: Date;

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else if (month && year) {
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0);
  } else {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  const attendances = await prisma.dailyAttendance.findMany({
    where: {
      studentId: targetStudentId,
      date: {
        gte: start,
        lte: end,
      },
    },
    orderBy: {
      date: 'desc',
    },
    select: {
      id: true,
      date: true,
      status: true,
      note: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });

  const result = attendances.map((attendance) => ({
    id: attendance.id,
    date: attendance.date,
    status: attendance.status,
    note: attendance.note,
    notes: attendance.note,
    checkInTime: formatAttendanceTime(attendance.checkInTime),
    checkOutTime: formatAttendanceTime(attendance.checkOutTime),
  }));

  res.status(200).json(new ApiResponse(200, result, 'Data presensi berhasil diambil'));
});
