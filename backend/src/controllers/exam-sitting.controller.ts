import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';
import { ExamType, Semester } from '@prisma/client';

export const createExamSitting = asyncHandler(async (req: Request, res: Response) => {
    const { 
        roomName, 
        academicYearId, 
        examType, 
        programCode,
        semester,
        startTime, 
        endTime, 
        proctorId, 
        studentIds 
    } = req.body;

    if (!roomName) {
        throw new ApiError(400, 'Room name is required');
    }

    // Validate Academic Year
    let targetAcademicYearId = academicYearId;
    if (!targetAcademicYearId) {
        const activeAY = await prisma.academicYear.findFirst({ where: { isActive: true } });
        if (!activeAY) throw new ApiError(400, 'No active academic year found');
        targetAcademicYearId = activeAY.id;
    }

    const resolvedExamType = String(programCode || examType || '').trim().toUpperCase();
    if (!resolvedExamType) {
        throw new ApiError(400, 'Program ujian wajib dipilih.');
    }

    // Create Sitting
    const sitting = await prisma.examSitting.create({
        data: {
            roomName,
            academicYearId: parseInt(targetAcademicYearId),
            examType: resolvedExamType,
            semester: semester || null,
            startTime: startTime ? new Date(startTime) : null,
            endTime: endTime ? new Date(endTime) : null,
            proctorId: proctorId ? parseInt(proctorId) : null,
            // Create student relations
            students: {
                createMany: {
                    data: (studentIds || []).map((sid: number) => ({
                        studentId: parseInt(sid.toString())
                    }))
                }
            }
        },
        include: {
            students: {
                include: {
                    student: {
                        select: { id: true, name: true, studentClass: { select: { name: true } } }
                    }
                }
            }
        }
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
    if (resolvedExamType) where.examType = resolvedExamType;
    
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
            _count: { select: { students: true } }
        },
        orderBy: { startTime: 'desc' }
    });

    res.json(new ApiResponse(200, sittings));
});

export const getExamSittingDetail = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const sitting = await prisma.examSitting.findUnique({
        where: { id: parseInt(id) },
        include: {
            proctor: { select: { id: true, name: true } },
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
        sessions = await prisma.studentExamSession.findMany({
            where: {
                studentId: { in: studentIds },
                createdAt: {
                    gte: new Date(sitting.startTime.getTime() - 2 * 60 * 60 * 1000), // Look back 2 hours just in case
                    lte: sitting.endTime
                }
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
    const { roomName, academicYearId, examType, programCode, semester, startTime, endTime, proctorId } = req.body;

    if (!roomName) {
        throw new ApiError(400, 'Room name is required');
    }

    const resolvedExamType = String(programCode || examType || '').trim().toUpperCase();
    if (!resolvedExamType) {
        throw new ApiError(400, 'Program ujian wajib dipilih.');
    }

    const sitting = await prisma.examSitting.update({
        where: { id: parseInt(id) },
        data: {
            roomName,
            academicYearId: academicYearId ? parseInt(academicYearId) : undefined,
            examType: resolvedExamType,
            semester: semester || undefined,
            startTime: startTime ? new Date(startTime) : undefined, // Keep existing if not provided? Or allow null? User wants to REMOVE time. So if provided null, set null.
            endTime: endTime ? new Date(endTime) : undefined,
            proctorId: proctorId ? parseInt(proctorId) : undefined
        }
    });

    res.json(new ApiResponse(200, sitting, 'Exam Sitting updated successfully'));
});

export const updateSittingStudents = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { studentIds } = req.body; // Array of ALL student IDs to be in the room

    if (!Array.isArray(studentIds)) throw new ApiError(400, 'studentIds must be an array');

    // Transaction to replace students
    await prisma.$transaction(async (tx) => {
        // Delete existing
        await tx.examSittingStudent.deleteMany({
            where: { sittingId: parseInt(id) }
        });

        // Add new
        if (studentIds.length > 0) {
            await tx.examSittingStudent.createMany({
                data: studentIds.map((sid: number) => ({
                    sittingId: parseInt(id),
                    studentId: parseInt(sid.toString())
                }))
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
