import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

const academicEventTypeSchema = z.enum([
  'LIBUR_NASIONAL',
  'LIBUR_SEKOLAH',
  'UJIAN_PTS',
  'UJIAN_PAS',
  'UJIAN_PAT',
  'MPLS',
  'RAPOR',
  'KEGIATAN_SEKOLAH',
  'LAINNYA',
]);

const semesterSchema = z.enum(['ODD', 'EVEN']);

const createAcademicEventSchema = z.object({
  academicYearId: z.number(),
  title: z.string().min(1),
  type: academicEventTypeSchema,
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  semester: semesterSchema.optional(),
  isHoliday: z.boolean().optional(),
  description: z.string().optional().nullable(),
});

const updateAcademicEventSchema = createAcademicEventSchema.partial();

export const getAcademicEvents = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, semester, type } = req.query;

  if (!academicYearId) {
    throw new ApiError(400, 'academicYearId wajib diisi');
  }

  const where: any = {
    academicYearId: Number(academicYearId),
  };

  if (semester && typeof semester === 'string' && (semester === 'ODD' || semester === 'EVEN')) {
    where.semester = semester;
  }

  if (type && typeof type === 'string') {
    where.type = type;
  }

  const events = await (prisma as any).academicEvent.findMany({
    where,
    orderBy: { startDate: 'asc' },
  });

  res
    .status(200)
    .json(new ApiResponse(200, { events }, 'Data kalender akademik berhasil diambil'));
});

export const createAcademicEvent = asyncHandler(async (req: Request, res: Response) => {
  const body = createAcademicEventSchema.parse(req.body);

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: body.academicYearId },
  });

  if (!academicYear) {
    throw new ApiError(404, 'Tahun akademik tidak ditemukan');
  }

  if (body.startDate > body.endDate) {
    throw new ApiError(400, 'Tanggal mulai harus sebelum atau sama dengan tanggal berakhir');
  }

  if (body.startDate < academicYear.semester1Start || body.endDate > academicYear.semester2End) {
    throw new ApiError(400, 'Rentang tanggal harus berada dalam tahun akademik yang dipilih');
  }

  const event = await (prisma as any).academicEvent.create({
    data: {
      academicYearId: body.academicYearId,
      title: body.title,
      type: body.type as any,
      startDate: body.startDate,
      endDate: body.endDate,
      semester: body.semester as any,
      isHoliday: body.isHoliday ?? false,
      description: body.description ?? null,
    },
  });

  res.status(201).json(new ApiResponse(201, event, 'Event kalender akademik berhasil dibuat'));
});

export const updateAcademicEvent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateAcademicEventSchema.parse(req.body);

  const existing = await (prisma as any).academicEvent.findUnique({
    where: { id: Number(id) },
  });

  if (!existing) {
    throw new ApiError(404, 'Event kalender akademik tidak ditemukan');
  }

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: existing.academicYearId },
  });

  if (!academicYear) {
    throw new ApiError(404, 'Tahun akademik tidak ditemukan');
  }

  const startDate = body.startDate ?? existing.startDate;
  const endDate = body.endDate ?? existing.endDate;

  if (startDate > endDate) {
    throw new ApiError(400, 'Tanggal mulai harus sebelum atau sama dengan tanggal berakhir');
  }

  if (startDate < academicYear.semester1Start || endDate > academicYear.semester2End) {
    throw new ApiError(400, 'Rentang tanggal harus berada dalam tahun akademik yang dipilih');
  }

  const data: any = { ...body };
  delete data.academicYearId;

  const updated = await (prisma as any).academicEvent.update({
    where: { id: Number(id) },
    data,
  });

  res
    .status(200)
    .json(new ApiResponse(200, updated, 'Event kalender akademik berhasil diperbarui'));
});

export const deleteAcademicEvent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await (prisma as any).academicEvent.findUnique({
    where: { id: Number(id) },
  });

  if (!existing) {
    throw new ApiError(404, 'Event kalender akademik tidak ditemukan');
  }

  await (prisma as any).academicEvent.delete({
    where: { id: Number(id) },
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Event kalender akademik berhasil dihapus'));
});
