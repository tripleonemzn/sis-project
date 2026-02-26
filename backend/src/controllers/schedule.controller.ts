import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiResponse, asyncHandler } from '../utils/api';

const dayOfWeekEnum = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]);

const createScheduleEntrySchema = z.object({
  academicYearId: z.number().int(),
  classId: z.number().int(),
  teacherAssignmentId: z.number().int(),
  dayOfWeek: dayOfWeekEnum,
  period: z.number().int().min(1),
  room: z.string().max(100).optional().nullable(),
});

const updateScheduleEntrySchema = z
  .object({
    teacherAssignmentId: z.number().int().optional(),
    room: z.string().max(100).optional().nullable(),
  })
  .refine((value) => value.teacherAssignmentId !== undefined || value.room !== undefined, {
    message: 'Minimal satu field harus diisi untuk update jadwal',
  });

const listScheduleSchema = z.object({
  academicYearId: z.coerce.number().int(),
  classId: z.coerce.number().int().optional(),
  teacherId: z.coerce.number().int().optional(),
});

const teachingLoadSummarySchema = z.object({
  academicYearId: z.coerce.number().int(),
  teacherId: z.coerce.number().int().optional(),
});

const scheduleEntryIdSchema = z.object({
  id: z.coerce.number().int(),
});

async function buildSchedulePeriodResolver(academicYearId: number) {
  const timeConfig = await (prisma as any).scheduleTimeConfig.findUnique({
    where: { academicYearId },
  });
  const periodNotes = (timeConfig as any)?.config?.periodNotes || {};
  const periodTypes = (timeConfig as any)?.config?.periodTypes || {};

  const resolvePeriodType = (day: string, period: number): string => {
    const type = periodTypes[day]?.[period];
    if (type) {
      const t = String(type).toUpperCase();
      if (
        t === 'TEACHING' ||
        t === 'UPACARA' ||
        t === 'ISTIRAHAT' ||
        t === 'TADARUS' ||
        t === 'OTHER'
      ) {
        return t;
      }
    }

    const note = periodNotes[day]?.[period];
    if (!note) {
      return 'TEACHING';
    }

    const n = String(note).toUpperCase();
    if (n.includes('UPACARA')) {
      return 'UPACARA';
    }
    if (n.includes('ISTIRAHAT')) {
      return 'ISTIRAHAT';
    }
    if (n.includes('TADARUS')) {
      return 'TADARUS';
    }
    return 'TEACHING';
  };

  const isNonTeachingPeriod = (day: string, period: number) => {
    const type = resolvePeriodType(day, period);
    return type !== 'TEACHING';
  };

  const teachingHourCache = new Map<string, number | null>();
  const getTeachingHour = (day: string, period: number) => {
    const cacheKey = `${day}-${period}`;
    if (teachingHourCache.has(cacheKey)) {
      return teachingHourCache.get(cacheKey) ?? null;
    }

    if (isNonTeachingPeriod(day, period)) {
      teachingHourCache.set(cacheKey, null);
      return null;
    }

    let teachingCounter = 0;
    for (let p = 1; p <= period; p += 1) {
      if (!isNonTeachingPeriod(day, p)) {
        teachingCounter += 1;
      }
    }

    const teachingHour = teachingCounter > 0 ? teachingCounter : null;
    teachingHourCache.set(cacheKey, teachingHour);
    return teachingHour;
  };

  return {
    resolvePeriodType,
    isNonTeachingPeriod,
    getTeachingHour,
  };
}

export const createScheduleEntry = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, classId, teacherAssignmentId, dayOfWeek, period, room } =
    createScheduleEntrySchema.parse(req.body);

  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  if (!dutyUser) {
    res.status(401).json(new ApiResponse(401, null, 'Tidak memiliki otorisasi'));
    return;
  }
  if (dutyUser.role !== 'ADMIN') {
    const duties = (dutyUser.additionalDuties || []).map((d: any) =>
      String(d).trim().toUpperCase(),
    );
    const allowed =
      duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    if (!allowed) {
      res
        .status(403)
        .json(new ApiResponse(403, null, 'Anda tidak memiliki hak akses untuk mengelola jadwal pelajaran'));
      return;
    }
  }

  const assignment = await prisma.teacherAssignment.findUnique({
    where: { id: teacherAssignmentId },
    include: {
      class: true,
      academicYear: true,
    },
  });

  if (!assignment) {
    res.status(400).json(new ApiResponse(400, null, 'Penugasan guru tidak ditemukan'));
    return;
  }

  if (assignment.academicYearId !== academicYearId) {
    res
      .status(400)
      .json(new ApiResponse(400, null, 'Tahun ajaran tidak sesuai dengan penugasan guru'));
    return;
  }

  if (assignment.classId !== classId) {
    res
      .status(400)
      .json(new ApiResponse(400, null, 'Kelas tidak sesuai dengan penugasan guru'));
    return;
  }

  const existing = await (prisma as any).scheduleEntry.findFirst({
    where: {
      academicYearId,
      classId,
      dayOfWeek,
      period,
    },
  });

  if (existing) {
    res
      .status(400)
      .json(new ApiResponse(400, null, 'Slot jadwal sudah terisi untuk kelas ini'));
    return;
  }

  const created = await (prisma as any).scheduleEntry.create({
    data: {
      academicYearId,
      classId,
      teacherAssignmentId,
      dayOfWeek,
      period,
      room: room ?? null,
    },
    include: {
      teacherAssignment: {
        include: {
          teacher: {
            select: { id: true, name: true, username: true },
          },
          subject: {
            select: { id: true, name: true, code: true },
          },
          class: {
            select: {
              id: true,
              name: true,
              level: true,
              major: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          academicYear: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, created, 'Entri jadwal pelajaran berhasil dibuat'));
});

export const listSchedules = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, classId, teacherId } = listScheduleSchema.parse(req.query);
  const user = (req as any).user;

  const where: any = {
    academicYearId,
  };

  if (classId) {
    where.classId = classId;
  }

  // Enforce class filter for students
  if (user?.role === 'STUDENT') {
    const student = await prisma.user.findUnique({
      where: { id: user.id },
      select: { classId: true }
    });

    if (student?.classId) {
      where.classId = student.classId;
    } else {
      where.classId = -1;
    }
  }

  if (teacherId) {
    where.teacherAssignment = {
      teacherId,
    };
  }

  const entries = await (prisma as any).scheduleEntry.findMany({
    where,
    orderBy: [
      { class: { level: 'asc' } },
      { class: { name: 'asc' } },
      { dayOfWeek: 'asc' },
      { period: 'asc' },
    ],
    include: {
      teacherAssignment: {
        include: {
          teacher: {
            select: { id: true, name: true, username: true },
          },
          subject: {
            select: { id: true, name: true, code: true },
          },
          class: {
            select: {
              id: true,
              name: true,
              level: true,
              major: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          academicYear: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  const periodResolver = await buildSchedulePeriodResolver(academicYearId);
  const entriesWithTeachingHour = entries.map((entry: any) => ({
    ...entry,
    teachingHour: periodResolver.getTeachingHour(entry.dayOfWeek as string, entry.period),
  }));

  res
    .status(200)
    .json(
      new ApiResponse(200, { entries: entriesWithTeachingHour }, 'Data jadwal pelajaran berhasil diambil'),
    );
});

export const getTeachingLoadSummary = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, teacherId } = teachingLoadSummarySchema.parse(req.query);

  const where: any = {
    academicYearId,
  };

  if (teacherId) {
    where.teacherAssignment = {
      teacherId,
    };
  }

  const entries = await (prisma as any).scheduleEntry.findMany({
    where,
    include: {
      teacherAssignment: {
        include: {
          teacher: {
            select: { id: true, name: true, username: true },
          },
          subject: {
            select: { id: true, name: true, code: true },
          },
          class: {
            select: { id: true, name: true, level: true },
          },
          academicYear: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  const periodResolver = await buildSchedulePeriodResolver(academicYearId);

  type SubjectSummary = {
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    classCount: number;
    sessionCount: number;
    hours: number;
  };

  type TeacherSummary = {
    teacherId: number;
    teacherName: string;
    teacherUsername: string;
    totalClasses: number;
    totalSubjects: number;
    totalSessions: number;
    totalHours: number;
    details: SubjectSummary[];
  };

  const teacherMap = new Map<number, TeacherSummary>();
  const teacherClassSets = new Map<number, Set<number>>();
  const teacherSubjectMaps = new Map<number, Map<number, { classIds: Set<number>; sessions: number }>>();

  for (const entry of entries) {
    const day = entry.dayOfWeek as string;
    const period = entry.period;
    if (periodResolver.isNonTeachingPeriod(day, period)) {
      continue;
    }

    const assignment = entry.teacherAssignment;
    const teacher = assignment.teacher;
    const subject = assignment.subject;
    const cls = assignment.class;

    const teacherIdKey = teacher.id;

    if (!teacherMap.has(teacherIdKey)) {
      teacherMap.set(teacherIdKey, {
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherUsername: teacher.username,
        totalClasses: 0,
        totalSubjects: 0,
        totalSessions: 0,
        totalHours: 0,
        details: [],
      });
      teacherClassSets.set(teacherIdKey, new Set<number>());
      teacherSubjectMaps.set(teacherIdKey, new Map<number, { classIds: Set<number>; sessions: number }>());
    }

    const summary = teacherMap.get(teacherIdKey)!;
    const classSet = teacherClassSets.get(teacherIdKey)!;
    const subjectMap = teacherSubjectMaps.get(teacherIdKey)!;

    classSet.add(cls.id);

    const subjectKey = subject.id;
    if (!subjectMap.has(subjectKey)) {
      subjectMap.set(subjectKey, { classIds: new Set<number>(), sessions: 0 });
    }

    const subjectAggregate = subjectMap.get(subjectKey)!;
    subjectAggregate.classIds.add(cls.id);
    subjectAggregate.sessions += 1;

    summary.totalSessions += 1;
  }

  const teachers: TeacherSummary[] = [];

  for (const [teacherIdKey, summary] of teacherMap.entries()) {
    const classSet = teacherClassSets.get(teacherIdKey)!;
    const subjectMap = teacherSubjectMaps.get(teacherIdKey)!;

    const details: SubjectSummary[] = [];

    for (const [subjectId, aggregate] of subjectMap.entries()) {
      const anyEntry = entries.find((entry: any) => {
        return (
          entry.teacherAssignment.teacher.id === teacherIdKey &&
          entry.teacherAssignment.subject.id === subjectId
        );
      });

      if (!anyEntry) {
        continue;
      }

      const subject = anyEntry.teacherAssignment.subject;

      details.push({
        subjectId,
        subjectCode: subject.code,
        subjectName: subject.name,
        classCount: aggregate.classIds.size,
        sessionCount: aggregate.sessions,
        hours: aggregate.sessions,
      });
    }

    details.sort((a, b) => {
      if (a.subjectCode === b.subjectCode) {
        return a.subjectName.localeCompare(b.subjectName, 'id');
      }
      return a.subjectCode.localeCompare(b.subjectCode, 'id');
    });

    summary.totalClasses = classSet.size;
    summary.totalSubjects = subjectMap.size;
    summary.totalHours = summary.totalSessions;
    summary.details = details;

    teachers.push(summary);
  }

  teachers.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'id'));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          teachers,
        },
        'Ringkasan jam mengajar guru berhasil diambil',
      ),
    );
});

export const deleteScheduleEntry = asyncHandler(async (req: Request, res: Response) => {
  const { id } = scheduleEntryIdSchema.parse(req.params);

  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  if (!dutyUser) {
    res.status(401).json(new ApiResponse(401, null, 'Tidak memiliki otorisasi'));
    return;
  }
  if (dutyUser.role !== 'ADMIN') {
    const duties = (dutyUser.additionalDuties || []).map((d: any) =>
      String(d).trim().toUpperCase(),
    );
    const allowed =
      duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    if (!allowed) {
      res
        .status(403)
        .json(new ApiResponse(403, null, 'Anda tidak memiliki hak akses untuk mengelola jadwal pelajaran'));
      return;
    }
  }

  await (prisma as any).scheduleEntry.delete({
    where: { id },
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Entri jadwal pelajaran berhasil dihapus'));
});

export const updateScheduleEntry = asyncHandler(async (req: Request, res: Response) => {
  const { id } = scheduleEntryIdSchema.parse(req.params);
  const payload = updateScheduleEntrySchema.parse(req.body);

  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  if (!dutyUser) {
    res.status(401).json(new ApiResponse(401, null, 'Tidak memiliki otorisasi'));
    return;
  }
  if (dutyUser.role !== 'ADMIN') {
    const duties = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
    const allowed = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    if (!allowed) {
      res
        .status(403)
        .json(new ApiResponse(403, null, 'Anda tidak memiliki hak akses untuk mengelola jadwal pelajaran'));
      return;
    }
  }

  const existing = await (prisma as any).scheduleEntry.findUnique({
    where: { id },
    include: {
      teacherAssignment: {
        select: {
          id: true,
          classId: true,
          academicYearId: true,
        },
      },
    },
  });

  if (!existing) {
    res.status(404).json(new ApiResponse(404, null, 'Entri jadwal pelajaran tidak ditemukan'));
    return;
  }

  if (payload.teacherAssignmentId !== undefined) {
    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id: payload.teacherAssignmentId },
      select: {
        id: true,
        classId: true,
        academicYearId: true,
      },
    });

    if (!assignment) {
      res.status(400).json(new ApiResponse(400, null, 'Penugasan guru tidak ditemukan'));
      return;
    }

    if (assignment.classId !== existing.classId) {
      res.status(400).json(new ApiResponse(400, null, 'Penugasan guru tidak sesuai kelas jadwal'));
      return;
    }

    if (assignment.academicYearId !== existing.academicYearId) {
      res
        .status(400)
        .json(new ApiResponse(400, null, 'Penugasan guru tidak sesuai tahun ajaran jadwal'));
      return;
    }
  }

  const updateData: Record<string, unknown> = {};
  if (payload.teacherAssignmentId !== undefined) {
    updateData.teacherAssignmentId = payload.teacherAssignmentId;
  }
  if (payload.room !== undefined) {
    updateData.room = payload.room ?? null;
  }

  const updated = await (prisma as any).scheduleEntry.update({
    where: { id },
    data: updateData,
    include: {
      teacherAssignment: {
        include: {
          teacher: {
            select: { id: true, name: true, username: true },
          },
          subject: {
            select: { id: true, name: true, code: true },
          },
          class: {
            select: {
              id: true,
              name: true,
              level: true,
              major: {
                select: { id: true, name: true, code: true },
              },
            },
          },
          academicYear: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  res.status(200).json(new ApiResponse(200, updated, 'Entri jadwal pelajaran berhasil diperbarui'));
});
