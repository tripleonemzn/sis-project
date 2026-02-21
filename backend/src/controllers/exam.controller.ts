import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { asyncHandler, ApiError, ApiResponse } from '../utils/api';
import { ExamType, Semester, GradeComponentType } from '@prisma/client';
import { syncReportGrade } from './grade.controller';

// ==========================================
// Exam Packet Management
// ==========================================

export const getPackets = asyncHandler(async (req: Request, res: Response) => {
    const { type, subjectId, academicYearId, semester } = req.query;
    
    const where: any = {};
    
    if (type) where.type = type;
    if (subjectId) where.subjectId = parseInt(subjectId as string);
    if (academicYearId) where.academicYearId = parseInt(academicYearId as string);
    if (semester) where.semester = semester;

    const packets = await prisma.examPacket.findMany({
        where,
        include: {
            subject: true,
            author: { select: { name: true } },
            academicYear: true
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(new ApiResponse(200, packets));
});

export const getPacketById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const packet = await prisma.examPacket.findUnique({
        where: { id: parseInt(id) },
        include: {
            subject: true,
            author: { select: { name: true } },
            academicYear: true,
            schedules: true
        }
    });
    if (!packet) throw new ApiError(404, 'Exam packet not found');
    res.json(new ApiResponse(200, packet));
});

export const createPacket = asyncHandler(async (req: Request, res: Response) => {
    const { title, subjectId, academicYearId, type, semester, duration, description, questions, instructions, saveToBank, kkm } = req.body;
    const user = (req as any).user;
    const packet = await prisma.examPacket.create({
        data: {
            title,
            subjectId: parseInt(subjectId),
            academicYearId: parseInt(academicYearId),
            type,
            semester,
            duration: parseInt(duration),
            description,
            instructions,
            kkm: kkm ? parseFloat(kkm) : 75,
            questions,
            authorId: user.id
        }
    });

    // Handle Save to Question Bank
    if (saveToBank && questions && Array.isArray(questions)) {
        try {
            // Create a new Question Bank for this exam
            const bank = await prisma.questionBank.create({
                data: {
                    title: `Bank Soal: ${title}`,
                    subjectId: parseInt(subjectId),
                    academicYearId: parseInt(academicYearId),
                    semester: semester,
                    classLevel: 'ALL', // Default or derived if possible
                    authorId: user.id
                }
            });

            // Create Questions
            const questionPromises = questions.map((q: any) => {
                return prisma.question.create({
                    data: {
                        bankId: bank.id,
                        type: q.type,
                        content: q.content,
                        options: q.options || [],
                        answerKey: q.answerKey, // Ensure frontend sends this or derived
                        points: q.score || 1,
                        mediaUrl: q.question_image_url || q.question_video_url,
                        mediaType: q.question_video_type || (q.question_image_url ? 'image' : null)
                    }
                });
            });

            await Promise.all(questionPromises);
        } catch (error) {
            console.error('Failed to save questions to bank:', error);
            // Don't fail the request, just log error
        }
    }

    res.json(new ApiResponse(201, packet, 'Exam packet created successfully'));
});

export const updatePacket = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, subjectId, academicYearId, type, semester, duration, description, questions, instructions, saveToBank, kkm } = req.body;
    const packet = await prisma.examPacket.update({
        where: { id: parseInt(id) },
        data: {
            title,
            subjectId: parseInt(subjectId),
            academicYearId: parseInt(academicYearId),
            type,
            semester,
            duration: parseInt(duration),
            description,
            instructions,
            kkm: kkm ? parseFloat(kkm) : undefined,
            questions
        }
    });

    // Handle Save to Question Bank
    if (saveToBank && questions && Array.isArray(questions)) {
        try {
            // Check if a bank already exists for this packet title to avoid duplicates
            // Ideally we might want to update it, but for simplicity let's create new or skip
            // Let's create a new one with timestamp to be safe or append (Copy)
            
            const bank = await prisma.questionBank.create({
                data: {
                    title: `Bank Soal: ${title} (Copy)`,
                    subjectId: parseInt(subjectId),
                    academicYearId: parseInt(academicYearId),
                    semester: semester,
                    classLevel: 'ALL',
                    authorId: (req as any).user.id
                }
            });

            const questionPromises = questions.map((q: any) => {
                return prisma.question.create({
                    data: {
                        bankId: bank.id,
                        type: q.type,
                        content: q.content,
                        options: q.options || [],
                        answerKey: q.answerKey,
                        points: q.score || 1,
                        mediaUrl: q.question_image_url || q.question_video_url,
                        mediaType: q.question_video_type || (q.question_image_url ? 'image' : null)
                    }
                });
            });

            await Promise.all(questionPromises);
        } catch (error) {
            console.error('Failed to save questions to bank during update:', error);
        }
    }

    res.json(new ApiResponse(200, packet, 'Exam packet updated successfully'));
});

export const deletePacket = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.examPacket.delete({ where: { id: parseInt(id) } });
    res.json(new ApiResponse(200, null, 'Exam packet deleted successfully'));
});

// ==========================================
// Question Management
// ==========================================

export const getQuestions = asyncHandler(async (req: Request, res: Response) => {
    const { 
        page = 1, 
        limit = 20, 
        search, 
        type, 
        subjectId, 
        academicYearId, 
        semester 
    } = req.query;

    const user = (req as any).user;
    
    // Base Where Clause
    const where: any = {};

    // Filter by Type
    if (type) {
        where.type = type;
    }

    // Filter by Content (Search)
    if (search) {
        where.content = { contains: search as string, mode: 'insensitive' };
    }

    // Bank Filters
    const bankWhere: any = {};

    if (academicYearId) {
        bankWhere.academicYearId = parseInt(academicYearId as string);
    }

    if (semester) {
        bankWhere.semester = semester;
    }

    // Role-Based Filtering
    if (user.role === 'TEACHER') {
        // Get teacher assignments to filter subjects
        // We fetch assignments from ALL academic years to ensure teachers can see their questions from previous years
        const assignments = await prisma.teacherAssignment.findMany({
            where: { teacherId: user.id },
            select: { subjectId: true }
        });

        const assignedSubjectIds = assignments.map(a => a.subjectId);

        // If teacher has NO assignments, they see NOTHING
        if (assignedSubjectIds.length === 0) {
            return res.json(new ApiResponse(200, {
                questions: [],
                meta: {
                    page: Number(page),
                    limit: Number(limit),
                    total: 0,
                    totalPages: 0
                }
            }));
        }

        if (subjectId) {
            const requestedSubjectId = parseInt(subjectId as string);
            // Strict check: Teacher MUST be assigned to the requested subject
            if (!assignedSubjectIds.includes(requestedSubjectId)) {
                return res.json(new ApiResponse(200, {
                    questions: [],
                    meta: {
                        page: Number(page),
                        limit: Number(limit),
                        total: 0,
                        totalPages: 0
                    }
                }));
            }
            bankWhere.subjectId = requestedSubjectId;
        } else {
            // If no subject specified, limit to ALL assigned subjects
            bankWhere.subjectId = { in: assignedSubjectIds };
        }
    } else {
        // For ADMIN or others, just use the requested subjectId if present
        if (subjectId) {
            bankWhere.subjectId = parseInt(subjectId as string);
        }
    }

    // Attach bank filters to main where clause
    // Ensure we always filter by bank if bankWhere has keys OR if we are forcing subject filtering
    if (Object.keys(bankWhere).length > 0) {
        where.bank = bankWhere;
    }

    // Pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute Query
    const [questions, total] = await Promise.all([
        prisma.question.findMany({
            where,
            include: { 
                bank: {
                    include: {
                        subject: true,
                        academicYear: true,
                        author: { select: { name: true, username: true } } // Include author info
                    }
                } 
            },
            orderBy: { id: 'desc' },
            skip,
            take: limitNum
        }),
        prisma.question.count({ where })
    ]);

    res.json(new ApiResponse(200, {
        questions,
        meta: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    }));
});

// ==========================================
// Schedule Management
// ==========================================

export const getSchedules = asyncHandler(async (req: Request, res: Response) => {
    const schedules = await prisma.examSchedule.findMany({
        include: {
            class: true,
            packet: { include: { subject: true } },
            academicYear: true
        },
        orderBy: { startTime: 'desc' }
    });
    res.json(new ApiResponse(200, schedules));
});

export const createSchedule = asyncHandler(async (req: Request, res: Response) => {
    const { classId, classIds, packetId, startTime, endTime, proctorId, room } = req.body;
    
    // Validate Packet & Get Metadata
    const packet = await prisma.examPacket.findUnique({
        where: { id: parseInt(packetId) }
    });

    if (!packet) {
        throw new ApiError(404, 'Exam packet not found');
    }

    const targetClassIds = classIds || (classId ? [classId] : []);
    
    if (targetClassIds.length === 0) {
        throw new ApiError(400, 'Class ID is required');
    }

    const createdSchedules = [];

    for (const cId of targetClassIds) {
        const schedule = await prisma.examSchedule.create({
            data: {
                classId: parseInt(cId),
                packetId: packet.id,
                subjectId: packet.subjectId,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                proctorId: proctorId ? parseInt(proctorId) : null,
                academicYearId: packet.academicYearId,
                semester: packet.semester,
                room
            }
        });
        createdSchedules.push(schedule);
    }

    res.json(new ApiResponse(201, createdSchedules, 'Exam schedules created successfully'));
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { startTime, endTime, proctorId, room, isActive } = req.body;
    const schedule = await prisma.examSchedule.update({
        where: { id: parseInt(id) },
        data: {
            startTime: startTime ? new Date(startTime) : undefined,
            endTime: endTime ? new Date(endTime) : undefined,
            proctorId: proctorId ? parseInt(proctorId) : undefined,
            room,
            isActive
        }
    });
    res.json(new ApiResponse(200, schedule, 'Exam schedule updated successfully'));
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const scheduleId = parseInt(id);

    // Check schedule and packet existence
    const schedule = await prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        include: { packet: true }
    });

    if (!schedule) {
        throw new ApiError(404, 'Jadwal tidak ditemukan');
    }

    // Only block if packet exists AND has content AND has completed sessions
    // If packet is missing or has no questions, we allow cleanup of broken schedules
    if (schedule.packet) {
        const questions = schedule.packet.questions as any;
        const hasQuestions = questions && Array.isArray(questions) && questions.length > 0;

        if (hasQuestions) {
            const completedSessions = await prisma.studentExamSession.count({
                where: {
                    scheduleId,
                    status: 'COMPLETED'
                }
            });

            if (completedSessions > 0) {
                throw new ApiError(400, 'Tidak dapat menghapus jadwal yang sudah memiliki hasil ujian siswa.');
            }
        }
    }

    // Delete dependencies in transaction
    await prisma.$transaction(async (tx) => {
        // Delete sessions (in-progress or others)
        await tx.studentExamSession.deleteMany({
            where: { scheduleId }
        });

        // Delete proctoring reports
        await tx.examProctoringReport.deleteMany({
            where: { scheduleId }
        });

        // Delete schedule
        await tx.examSchedule.delete({
            where: { id: scheduleId }
        });
    });

    res.json(new ApiResponse(200, null, 'Exam schedule deleted successfully'));
});

// ==========================================
// Student Exam Access
// ==========================================

export const getAvailableExams = asyncHandler(async (req: Request, res: Response) => {
    const studentId = (req as any).user!.id;
    const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { classId: true }
    });

    if (!student?.classId) {
        throw new ApiError(400, 'Student is not assigned to a class');
    }

    const now = new Date();

    // Find schedules for the student's class
    const schedules = await prisma.examSchedule.findMany({
        where: {
            classId: student.classId,
            isActive: true,
            // You might want to filter by time, but user might want to see upcoming/past exams too
            // For "Available" we usually mean exams they can take or see results for
        },
        include: {
            packet: {
                include: { subject: true }
            },
            sessions: {
                where: { studentId }
            }
        },
        orderBy: { startTime: 'asc' }
    });

    // Check restrictions
    const examsWithStatus = await Promise.all(schedules.map(async (schedule) => {
        let isBlocked = false;
        let blockReason = '';

        if (schedule.packet) {
            const restriction = await prisma.studentExamRestriction.findUnique({
                where: {
                    studentId_academicYearId_semester_examType: {
                        studentId,
                        academicYearId: schedule.packet.academicYearId,
                        semester: schedule.packet.semester,
                        examType: schedule.packet.type
                    }
                }
            });

            if (restriction && restriction.isBlocked) {
                isBlocked = true;
                blockReason = restriction.reason || 'Anda tidak diizinkan mengikuti ujian ini.';
            }
        }

        const session = schedule.sessions[0];
        const status = session ? session.status : (now > schedule.endTime ? 'MISSED' : (now < schedule.startTime ? 'UPCOMING' : 'OPEN'));

        return {
            ...schedule,
            status,
            has_submitted: session?.status === 'COMPLETED',
            isBlocked,
            blockReason
        };
    }));

    res.json(new ApiResponse(200, examsWithStatus));
});

export const startExam = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params; // scheduleId
    const studentId = (req as any).user!.id;

    const schedule = await prisma.examSchedule.findUnique({
        where: { id: parseInt(id) },
        include: { 
            packet: {
                include: {
                    subject: true
                }
            }
        }
    });

    if (!schedule || !schedule.packet) throw new ApiError(404, 'Exam not found');

    // Check restriction
    const restriction = await prisma.studentExamRestriction.findUnique({
        where: {
            studentId_academicYearId_semester_examType: {
                studentId,
                academicYearId: schedule.packet.academicYearId,
                semester: schedule.packet.semester,
                examType: schedule.packet.type
            }
        }
    });

    if (restriction && restriction.isBlocked) {
        throw new ApiError(403, restriction.reason || 'Access denied by homeroom teacher');
    }

    const now = new Date();
    if (now < schedule.startTime) throw new ApiError(400, 'Exam has not started yet');
    if (now > schedule.endTime) throw new ApiError(400, 'Exam has ended');

    // Create or get session
          let session = await prisma.studentExamSession.findFirst({
            where: { scheduleId: schedule.id, studentId }
          });

          if (session && (session.status === 'COMPLETED' || session.status === 'TIMEOUT')) {
            throw new ApiError(400, 'Anda sudah mengerjakan ujian ini.');
          }

          if (!session) {
        session = await prisma.studentExamSession.create({
            data: {
                scheduleId: schedule.id,
                studentId,
                startTime: now,
                status: 'IN_PROGRESS'
            }
        });
    }

    // Return packet with questions
    res.json(new ApiResponse(200, {
        session,
        packet: schedule.packet
    }));
});

// Helper to calculate score
const calculateScore = (questions: any[], answers: any): number => {
    let totalScore = 0;
    let maxScore = 0;

    if (!questions || !Array.isArray(questions)) return 0;

    questions.forEach(q => {
        const points = q.score || 1; // Default to 1 point
        maxScore += points;

        const studentAnswerId = answers[q.id];
        
        // Find correct option
        if (q.options && Array.isArray(q.options)) {
            const correctOption = q.options.find((opt: any) => opt.isCorrect);
            if (correctOption && correctOption.id === studentAnswerId) {
                totalScore += points;
            }
        }
    });

    if (maxScore === 0) return 0;
    return (totalScore / maxScore) * 100;
};

export const submitAnswers = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params; // scheduleId
    const { answers, finish, is_final_submit } = req.body;
    const user = (req as any).user;
    const studentId = user.id;

    // Support both flags
    const isFinished = finish || is_final_submit;

    const session = await prisma.studentExamSession.findFirst({
        where: { scheduleId: parseInt(id), studentId }
    });

    if (!session) throw new ApiError(404, 'Session not found');

    // Calculate score if finishing
    let finalScore: number | undefined = undefined;
    
    if (isFinished) {
        // Get Exam Packet Questions
        const schedule = await prisma.examSchedule.findUnique({
            where: { id: parseInt(id) },
            include: { packet: true }
        });
        
        if (schedule && schedule.packet && schedule.packet.questions) {
             const questions = schedule.packet.questions as any[];
             finalScore = calculateScore(questions, answers);
        }
    }

    const updatedSession = await prisma.studentExamSession.update({
        where: { id: session.id },
        data: {
            answers,
            status: isFinished ? 'COMPLETED' : 'IN_PROGRESS',
            submitTime: isFinished ? new Date() : undefined,
            endTime: isFinished ? new Date() : undefined,
            score: finalScore
        }
    });

    // Auto-fill StudentGrade if finished and score calculated
    if (isFinished && finalScore !== undefined) {
        try {
            const schedule = await prisma.examSchedule.findUnique({
                where: { id: parseInt(id) },
                include: { packet: true }
            });

            if (schedule && schedule.packet) {
                const { subjectId, academicYearId, semester, type } = schedule.packet;
                
                // Map ExamType to GradeComponentType
                let componentType: GradeComponentType | undefined;
                if (type === 'FORMATIF') componentType = 'FORMATIVE';
                else if (type === 'SBTS') componentType = 'MIDTERM';
                else if (type === 'SAS' || type === 'SAT') componentType = 'FINAL';
                else if (type === 'US_PRACTICE') componentType = 'US_PRACTICE';
                else if (type === 'US_THEORY') componentType = 'US_THEORY';

                if (componentType) {
                    // Find or Create Grade Component
                    let component = await prisma.gradeComponent.findFirst({
                        where: { subjectId, type: componentType, isActive: true }
                    });

                    // Auto-create component if missing (essential for auto-grading)
                    if (!component) {
                        const componentName = 
                             componentType === 'MIDTERM' ? 'SBTS' : 
                             (componentType === 'FINAL' ? 'SAS/SAT' : 
                             (componentType === 'FORMATIVE' ? 'Formatif' : type));

                        try {
                            component = await prisma.gradeComponent.create({
                                data: {
                                    subjectId,
                                    type: componentType,
                                    name: componentName,
                                    weight: 1,
                                    isActive: true
                                }
                            });
                        } catch (e) {
                            console.error('Failed to auto-create grade component:', e);
                        }
                    }

                    if (component) {
                        // Find existing grade
                        const grade = await prisma.studentGrade.findFirst({
                            where: {
                                studentId,
                                subjectId,
                                academicYearId,
                                componentId: component.id,
                                semester
                            }
                        });

                        if (grade) {
                            // Update existing
                            const updateData: any = {};
                            if (componentType === 'FORMATIVE') {
                                // Fill first empty NF
                                if (grade.nf1 === null) updateData.nf1 = finalScore;
                                else if (grade.nf2 === null) updateData.nf2 = finalScore;
                                else if (grade.nf3 === null) updateData.nf3 = finalScore;
                                else if (grade.nf4 === null) updateData.nf4 = finalScore;
                                else if (grade.nf5 === null) updateData.nf5 = finalScore;
                                else if (grade.nf6 === null) updateData.nf6 = finalScore;
                                
                                // Recalculate Average Score
                                const nfs = [
                                    updateData.nf1 ?? grade.nf1,
                                    updateData.nf2 ?? grade.nf2,
                                    updateData.nf3 ?? grade.nf3,
                                    updateData.nf4 ?? grade.nf4,
                                    updateData.nf5 ?? grade.nf5,
                                    updateData.nf6 ?? grade.nf6
                                ].filter((n: number | null) => n !== null) as number[];
                                
                                if (nfs.length > 0) {
                                    updateData.score = nfs.reduce((a: number, b: number) => a + b, 0) / nfs.length;
                                }
                            } else {
                                // For MIDTERM / FINAL / US, just update score
                                updateData.score = finalScore;
                            }

                            if (Object.keys(updateData).length > 0) {
                                await prisma.studentGrade.update({
                                    where: { id: grade.id },
                                    data: updateData
                                });
                            }
                        } else {
                            // Create new
                            const createData: any = {
                                studentId,
                                subjectId,
                                academicYearId,
                                componentId: component.id,
                                semester,
                                score: finalScore
                            };

                            if (componentType === 'FORMATIVE') {
                                createData.nf1 = finalScore;
                            }

                            await prisma.studentGrade.create({
                                data: createData
                            });
                        }

                        // Sync Report Grade
                        await syncReportGrade(studentId, subjectId, academicYearId, semester);
                    }
                }
            }
        } catch (error) {
            console.error('Auto-fill grade error:', error);
            // Don't fail the response, just log
        }
    }

    res.json(new ApiResponse(200, updatedSession, 'Answers saved'));
});

// ==========================================
// Exam Restriction (Homeroom)
// ==========================================

export const getExamRestrictions = asyncHandler(async (req: Request, res: Response) => {
    const { classId, academicYearId, semester, examType, page = 1, limit = 10, search } = req.query;
    
    if (!classId || !academicYearId || !semester || !examType) {
        throw new ApiError(400, 'Missing required query parameters');
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { 
        classId: parseInt(classId as string), 
        role: 'STUDENT', 
        studentStatus: 'ACTIVE' 
    };

    if (search) {
        where.OR = [
            { name: { contains: search as string, mode: 'insensitive' } },
            { nis: { contains: search as string, mode: 'insensitive' } },
            { nisn: { contains: search as string, mode: 'insensitive' } }
        ];
    }

    // Get paginated students in class
    const [students, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: { id: true, nisn: true, name: true },
            orderBy: { name: 'asc' },
            skip,
            take: limitNum
        }),
        prisma.user.count({
            where
        })
    ]);

    // Get existing restrictions for these students
    const restrictions = await prisma.studentExamRestriction.findMany({
        where: {
            academicYearId: parseInt(academicYearId as string),
            semester: semester as Semester,
            examType: examType as ExamType,
            studentId: { in: students.map(s => s.id) }
        }
    });

    // Merge
    const result = students.map(student => {
        const r = restrictions.find(res => res.studentId === student.id);
        return {
            student,
            isBlocked: r ? r.isBlocked : false,
            reason: r ? r.reason : ''
        };
    });

    res.json(new ApiResponse(200, {
        restrictions: result,
        meta: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    }));
});

export const updateExamRestriction = asyncHandler(async (req: Request, res: Response) => {
    const { studentId, academicYearId, semester, examType, isBlocked, reason } = req.body;

    const restriction = await prisma.studentExamRestriction.upsert({
        where: {
            studentId_academicYearId_semester_examType: {
                studentId,
                academicYearId,
                semester,
                examType
            }
        },
        update: {
            isBlocked,
            reason
        },
        create: {
            studentId,
            academicYearId,
            semester,
            examType,
            isBlocked,
            reason
        }
    });

    res.json(new ApiResponse(200, restriction, 'Status akses ujian berhasil diperbarui'));
});
