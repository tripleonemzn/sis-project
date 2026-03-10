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
  reportType: z.string().optional(),
  programCode: z.string().optional(),
});

const gradeTemplateQuerySchema = z.object({
  ekskulId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
  semester: z.enum(['ODD', 'EVEN']),
  reportType: z.string().optional(),
  programCode: z.string().optional(),
});

const saveGradeTemplateSchema = gradeTemplateQuerySchema.extend({
  templates: z.object({
    SB: z.string().optional().default(''),
    B: z.string().optional().default(''),
    C: z.string().optional().default(''),
    K: z.string().optional().default(''),
  }),
});

const tutorInventoryQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
});

const createTutorInventoryItemSchema = z.object({
  assignmentId: z.coerce.number().int(),
  name: z.string().min(1, 'Nama barang wajib diisi'),
  code: z.string().optional(),
  brand: z.string().optional(),
  source: z.string().optional(),
  description: z.string().optional(),
  goodQty: z.coerce.number().int().min(0).optional().default(0),
  minorDamageQty: z.coerce.number().int().min(0).optional().default(0),
  majorDamageQty: z.coerce.number().int().min(0).optional().default(0),
});

export const inputTutorGrade = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId, grade, description, semester, reportType, programCode } = inputGradeSchema.parse(req.body);
  const tutorId = req.user!.id;

  // Convert string enums to Prisma enums if needed, or Zod will handle if they match strings
  // Prisma expects 'ODD' | 'EVEN' etc.

  const result = await tutorService.updateGrade(tutorId, enrollmentId, { 
    grade, 
    description,
    semester: semester as any, 
    reportType: reportType || undefined,
    programCode: programCode || undefined,
  });

  res.status(200).json(new ApiResponse(200, result, 'Nilai berhasil disimpan'));
});

export const getTutorGradeTemplates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = gradeTemplateQuerySchema.parse(req.query);
  const tutorId = req.user!.id;

  const templates = await tutorService.getGradeTemplates(tutorId, {
    ekskulId: payload.ekskulId,
    academicYearId: payload.academicYearId,
    semester: payload.semester as any,
    reportType: payload.reportType,
    programCode: payload.programCode,
  });

  res.status(200).json(new ApiResponse(200, templates, 'Template deskripsi nilai berhasil diambil'));
});

export const saveTutorGradeTemplates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = saveGradeTemplateSchema.parse(req.body);
  const tutorId = req.user!.id;

  const templates = await tutorService.saveGradeTemplates(tutorId, {
    ekskulId: payload.ekskulId,
    academicYearId: payload.academicYearId,
    semester: payload.semester as any,
    reportType: payload.reportType,
    programCode: payload.programCode,
    templates: payload.templates,
  });

  res.status(200).json(new ApiResponse(200, templates, 'Template deskripsi nilai berhasil disimpan'));
});

export const getTutorInventoryOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { academicYearId } = tutorInventoryQuerySchema.parse(req.query);
  const tutorId = req.user!.id;

  const data = await tutorService.getInventoryOverview(tutorId, academicYearId);

  res.status(200).json(new ApiResponse(200, data, 'Inventaris ekstrakurikuler berhasil diambil'));
});

export const createTutorInventoryItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = createTutorInventoryItemSchema.parse(req.body);
  const tutorId = req.user!.id;

  const item = await tutorService.createInventoryItem(tutorId, payload);

  res.status(201).json(new ApiResponse(201, item, 'Item inventaris ekskul berhasil ditambahkan'));
});
