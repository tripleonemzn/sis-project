import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';

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

    // Check if user is admin or wakasek to allow broader access
    const schedule = await prisma.examSchedule.findFirst({
        where: { 
            id: parseInt(scheduleId),
        },
        include: {
            packet: { select: { title: true, subject: { select: { name: true } }, authorId: true, subjectId: true, academicYearId: true } },
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

    // Get Students in that class + their session status
    const students = await prisma.user.findMany({
        where: {
            role: 'STUDENT',
            classId: schedule.class.id
        },
        select: { id: true, name: true, nis: true },
        orderBy: { name: 'asc' }
    });

    const sessions = await prisma.studentExamSession.findMany({
        where: { scheduleId: parseInt(scheduleId) },
        select: { studentId: true, status: true, startTime: true, submitTime: true, score: true }
    });

    const studentList = students.map((s: any) => {
        const session = sessions.find((sess: any) => sess.studentId === s.id);
        return {
            ...s,
            status: session ? session.status : 'NOT_STARTED',
            startTime: session?.startTime,
            submitTime: session?.submitTime,
            score: session?.score
        };
    });

    res.json(new ApiResponse(200, {
        schedule,
        students: studentList,
        isProctor,
        isAuthor,
        isSubjectTeacher
    }));
});

// Submit Berita Acara
export const submitBeritaAcara = asyncHandler(async (req: Request, res: Response) => {
    const { scheduleId } = req.params;
    const { notes, incident, studentCountPresent, studentCountAbsent } = req.body;
    const user = (req as any).user;

    const report = await prisma.examProctoringReport.create({
        data: {
            scheduleId: parseInt(scheduleId),
            proctorId: user.id,
            notes,
            incident,
            studentCountPresent: parseInt(studentCountPresent),
            studentCountAbsent: parseInt(studentCountAbsent)
        }
    });

    res.json(new ApiResponse(201, report, 'Berita acara berhasil disimpan'));
});
