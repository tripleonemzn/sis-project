import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiResponse } from '../utils/api';
import { tutorService } from '../services/tutor.service';
import { AuthRequest } from '../middleware/auth';

const getAssignmentsQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
});

export const getTutorAssignments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { academicYearId } = getAssignmentsQuerySchema.parse(req.query);
  const tutorId = req.user!.id;

  const assignments = await tutorService.getAssignments(tutorId, academicYearId);

  res.status(200).json(new ApiResponse(200, assignments, 'Data penugasan pembina berhasil diambil'));
});

const getMembersQuerySchema = z.object({
  ekskulId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
});

export const getExtracurricularMembers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ekskulId, academicYearId } = getMembersQuerySchema.parse(req.query);
  const tutorId = req.user!.id;

  const members = await tutorService.getMembers(tutorId, ekskulId, academicYearId);

  res.status(200).json(new ApiResponse(200, members, 'Data anggota ekstrakurikuler berhasil diambil'));
});

const inputGradeSchema = z.object({
  enrollmentId: z.coerce.number().int(),
  grade: z.string(),
  description: z.string(),
  semester: z.enum(['ODD', 'EVEN']).optional(),
  reportType: z.enum(['SBTS', 'SAS', 'SAT']).optional(),
});

export const inputTutorGrade = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId, grade, description, semester, reportType } = inputGradeSchema.parse(req.body);
  const tutorId = req.user!.id;

  // Convert string enums to Prisma enums if needed, or Zod will handle if they match strings
  // Prisma expects 'ODD' | 'EVEN' etc.

  const result = await tutorService.updateGrade(tutorId, enrollmentId, { 
    grade, 
    description,
    semester: semester as any, 
    reportType: reportType as any
  });

  res.status(200).json(new ApiResponse(200, result, 'Nilai berhasil disimpan'));
});
