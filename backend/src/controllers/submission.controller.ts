import { Request, Response } from 'express';
import { Semester } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';
import { syncReportGrade } from './grade.controller';
import { upsertScoreEntryFromAssignmentSubmission } from '../services/scoreEntry.service';

const resolveSemesterForAssignment = async (
  academicYearId: number,
  assignmentDate: Date,
): Promise<Semester | null> => {
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: {
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
  });

  if (!academicYear) return null;

  const dateValue = assignmentDate.getTime();
  const sem1Start = academicYear.semester1Start.getTime();
  const sem1End = academicYear.semester1End.getTime();
  const sem2Start = academicYear.semester2Start.getTime();
  const sem2End = academicYear.semester2End.getTime();

  if (dateValue >= sem1Start && dateValue <= sem1End) return Semester.ODD;
  if (dateValue >= sem2Start && dateValue <= sem2End) return Semester.EVEN;
  return dateValue < sem2Start ? Semester.ODD : Semester.EVEN;
};

// Get all submissions
export const getSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const { assignmentId, studentId, limit = '100', page = '1' } = req.query;
  const user = (req as any).user;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  // Role-based visibility
  if (user.role === 'STUDENT') {
    where.studentId = user.id;
  } else if (user.role === 'TEACHER') {
    where.assignment = {
      teacherId: user.id
    };
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

  if (user.role === 'TEACHER' && submission.assignment.teacher?.id !== user.id) {
    throw new ApiError(403, 'Anda tidak berhak melihat pengumpulan tugas ini');
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
    where: { id: parseInt(assignmentId) },
    select: {
      id: true,
      classId: true,
      dueDate: true,
      allowResubmit: true,
      isPublished: true
    }
  });

  if (!assignment) {
    throw new ApiError(404, 'Tugas tidak ditemukan');
  }

  if (!assignment.isPublished) {
    throw new ApiError(400, 'Tugas belum dipublikasikan oleh guru.');
  }

  const now = new Date();
  if (assignment.dueDate && now.getTime() > assignment.dueDate.getTime()) {
    throw new ApiError(400, 'Deadline tugas telah lewat.');
  }

  const student = await prisma.user.findUnique({
    where: { id: user.id },
    select: { classId: true }
  });
  if (!student?.classId || student.classId !== assignment.classId) {
    throw new ApiError(403, 'Anda tidak terdaftar pada kelas tugas ini.');
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
  const user = (req as any).user;

  if (score === undefined) {
    throw new ApiError(400, 'Nilai wajib diisi');
  }

  const submission = await prisma.submission.findUnique({
    where: { id: parseInt(id) },
    include: {
      assignment: {
        select: {
          teacherId: true,
          maxScore: true,
          subjectId: true,
          academicYearId: true,
          dueDate: true,
        }
      }
    }
  });

  if (!submission) {
    throw new ApiError(404, 'Pengumpulan tugas tidak ditemukan');
  }

  if (user.role === 'TEACHER' && submission.assignment.teacherId !== user.id) {
    throw new ApiError(403, 'Anda tidak berhak menilai pengumpulan tugas ini.');
  }

  const parsedScore = parseFloat(score);
  if (Number.isNaN(parsedScore)) {
    throw new ApiError(400, 'Nilai harus berupa angka.');
  }
  if (parsedScore < 0) {
    throw new ApiError(400, 'Nilai minimal 0.');
  }
  if (parsedScore > submission.assignment.maxScore) {
    throw new ApiError(400, `Nilai maksimal ${submission.assignment.maxScore}.`);
  }

  const updatedSubmission = await prisma.submission.update({
    where: { id: parseInt(id) },
    data: {
      score: parsedScore,
      feedback
    }
  });

  try {
    const semester = await resolveSemesterForAssignment(
      submission.assignment.academicYearId,
      submission.assignment.dueDate,
    );
    if (semester) {
      try {
        await upsertScoreEntryFromAssignmentSubmission({
          submissionId: updatedSubmission.id,
          studentId: submission.studentId,
          subjectId: submission.assignment.subjectId,
          academicYearId: submission.assignment.academicYearId,
          semester,
          score: parsedScore,
          maxScore: submission.assignment.maxScore,
        });
      } catch (scoreEntryError) {
        console.error('Failed to upsert score entry from assignment submission:', scoreEntryError);
      }

      await syncReportGrade(
        submission.studentId,
        submission.assignment.subjectId,
        submission.assignment.academicYearId,
        semester,
      );
    }
  } catch (syncError) {
    console.error('Failed to sync report grade from assignment submission:', syncError);
  }

  res.status(200).json(new ApiResponse(200, updatedSubmission, 'Tugas berhasil dinilai'));
});
