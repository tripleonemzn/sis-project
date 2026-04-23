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

const saveSubjectAttendanceSchema = z.object({
  date: z.string().transform((str) => new Date(str)),
  classId: z.number().int(),
  subjectId: z.number().int(),
  academicYearId: z.number().int(),
  records: z.array(
    z.object({
      studentId: z.number().int(),
      status: z.enum(['PRESENT', 'ABSENT', 'SICK', 'PERMISSION', 'LATE']),
      note: z.string().optional().nullable(),
    }),
  ),
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
  const { date, classId, subjectId, academicYearId, records } = saveSubjectAttendanceSchema.parse(
    req.body,
  );

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId,
    module: 'ATTENDANCE',
  });

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
        },
      });
    }

    // 2. Delete existing records for this attendance (to handle updates cleanly)
    await tx.attendanceRecord.deleteMany({
      where: {
        attendanceId: attendance.id,
      },
    });

    // 3. Create new records
    if (records.length > 0) {
      await tx.attendanceRecord.createMany({
        data: records.map((record) => ({
          attendanceId: attendance!.id,
          studentId: record.studentId,
          status: record.status,
          note: record.note,
        })),
      });
    }

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
