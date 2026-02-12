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

export const createScheduleEntry = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, classId, teacherAssignmentId, dayOfWeek, period, room } =
    createScheduleEntrySchema.parse(req.body);

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

  res
    .status(200)
    .json(new ApiResponse(200, { entries }, 'Data jadwal pelajaran berhasil diambil'));
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

  // Fetch schedule time config to exclude non-teaching periods
  const timeConfig = await (prisma as any).scheduleTimeConfig.findUnique({
    where: { academicYearId },
  });
  
  const periodNotes = timeConfig?.config?.periodNotes || {};

  const isNonTeachingNote = (note: string | undefined) => {
    if (!note) return false;
    const n = note.toUpperCase();
    return n.includes('UPACARA') || n.includes('ISTIRAHAT') || n.includes('TADARUS');
  };

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
    // Check if this entry falls on a non-teaching period
    const day = entry.dayOfWeek;
    const period = entry.period;
    const note = periodNotes[day]?.[period];
    
    if (isNonTeachingNote(note)) {
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

  await (prisma as any).scheduleEntry.delete({
    where: { id },
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Entri jadwal pelajaran berhasil dihapus'));
});
