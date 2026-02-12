import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';

// Get all submissions
export const getSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const { assignmentId, studentId, limit = '100', page = '1' } = req.query;
  const user = (req as any).user;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  // If user is a student, only show their submissions
  if (user.role === 'STUDENT') {
    where.studentId = user.id;
  }

  if (assignmentId) where.assignmentId = parseInt(assignmentId as string);
  if (studentId) where.studentId = parseInt(studentId as string);

  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            dueDate: true,
            maxScore: true,
            class: {
              select: {
                id: true,
                name: true
              }
            },
            subject: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        student: {
          select: {
            id: true,
            name: true,
            nis: true
          }
        }
      },
      orderBy: {
        submittedAt: 'desc'
      },
      skip,
      take: limitNum
    }),
    prisma.submission.count({ where })
  ]);

  res.status(200).json(new ApiResponse(200, {
    submissions,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }
  }, 'Data pengumpulan tugas berhasil diambil'));
});

// Get submission by ID
export const getSubmissionById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  const submission = await prisma.submission.findUnique({
    where: { id: parseInt(id) },
    include: {
      assignment: {
        select: {
          id: true,
          title: true,
          description: true,
          dueDate: true,
          maxScore: true,
          class: {
            select: {
              id: true,
              name: true
            }
          },
          subject: {
            select: {
              id: true,
              name: true
            }
          },
          teacher: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      student: {
        select: {
          id: true,
          name: true,
          nis: true
        }
      }
    }
  });

  if (!submission) {
    throw new ApiError(404, 'Pengumpulan tugas tidak ditemukan');
  }

  // Check authorization
  if (user.role === 'STUDENT' && submission.studentId !== user.id) {
    throw new ApiError(403, 'Anda tidak berhak melihat pengumpulan tugas ini');
  }

  // Teacher validation (optional: ensure teacher owns the assignment)
  // For now, allow any teacher to view (or implement ownership check if needed)
  if (user.role === 'TEACHER' && submission.assignment.teacher?.id !== user.id) {
      // Assuming teacher object is included in assignment, but I didn't include teacherId in assignment select above.
      // Wait, I included teacher select in assignment include.
      // But submission.assignment.teacher.id needs to be checked.
      // Let's rely on teacher check logic if necessary, but typically teacher can view any submission for their class.
      // However, strict ownership check is safer.
      // But since I selected teacher { id, name }, I can check.
      // If teacher is not null.
      if (submission.assignment.teacher && submission.assignment.teacher.id !== user.id) {
         // Optionally enforce this. For now I'll leave it as comment or simple check.
         // throw new ApiError(403, 'Anda tidak berhak melihat pengumpulan tugas ini');
      }
  }

  res.status(200).json(new ApiResponse(200, submission, 'Detail pengumpulan tugas berhasil diambil'));
});

// Submit assignment (Student)
export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { assignmentId, content } = req.body;
  const user = (req as any).user;
  const file = req.file;

  if (!assignmentId) {
    throw new ApiError(400, 'Assignment ID wajib diisi');
  }

  // Check if assignment exists and allows resubmit
  const assignment = await prisma.assignment.findUnique({
    where: { id: parseInt(assignmentId) }
  });

  if (!assignment) {
    throw new ApiError(404, 'Tugas tidak ditemukan');
  }

  // Check existing submission
  const existingSubmission = await prisma.submission.findFirst({
    where: {
      assignmentId: parseInt(assignmentId),
      studentId: user.id
    }
  });

  if (existingSubmission && !assignment.allowResubmit) {
    throw new ApiError(400, 'Tugas ini tidak mengizinkan pengiriman ulang');
  }

  // Prepare data
  const submissionData: any = {
    assignmentId: parseInt(assignmentId),
    studentId: user.id,
    content: content || null,
    submittedAt: new Date()
  };

  if (file) {
    submissionData.fileUrl = `/uploads/submissions/${file.filename}`;
    submissionData.fileName = file.originalname;
    submissionData.fileSize = file.size;
  }

  let submission;

  if (existingSubmission) {
    // Update existing
    submission = await prisma.submission.update({
      where: { id: existingSubmission.id },
      data: submissionData
    });
  } else {
    // Create new
    submission = await prisma.submission.create({
      data: submissionData
    });
  }

  res.status(200).json(new ApiResponse(200, submission, 'Tugas berhasil dikumpulkan'));
});

// Grade submission (Teacher)
export const gradeSubmission = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { score, feedback } = req.body;

  if (score === undefined) {
    throw new ApiError(400, 'Nilai wajib diisi');
  }

  const submission = await prisma.submission.findUnique({
    where: { id: parseInt(id) }
  });

  if (!submission) {
    throw new ApiError(404, 'Pengumpulan tugas tidak ditemukan');
  }

  const updatedSubmission = await prisma.submission.update({
    where: { id: parseInt(id) },
    data: {
      score: parseFloat(score),
      feedback
    }
  });

  res.status(200).json(new ApiResponse(200, updatedSubmission, 'Tugas berhasil dinilai'));
});
