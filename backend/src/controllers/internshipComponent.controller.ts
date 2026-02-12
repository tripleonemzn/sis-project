import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiResponse, ApiError, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { InternshipAssessmentComponent } from '@prisma/client';

const createComponentSchema = z.object({
  name: z.string().min(1, 'Nama komponen wajib diisi'),
  description: z.string().optional(),
  weight: z.number().min(0).max(100, 'Bobot harus antara 0-100'),
  isActive: z.boolean().default(true),
});

const updateComponentSchema = createComponentSchema.partial();

export const getComponents = asyncHandler(async (req: Request, res: Response) => {
  const { activeOnly } = req.query;

  const where: any = {};
  if (activeOnly === 'true') {
    where.isActive = true;
  }

  const components = await prisma.internshipAssessmentComponent.findMany({
    where,
    orderBy: { createdAt: 'asc' }
  });

  res.status(200).json(new ApiResponse(200, components, 'Data komponen penilaian berhasil diambil'));
});

export const createComponent = asyncHandler(async (req: Request, res: Response) => {
  const body = createComponentSchema.parse(req.body);

  // Validate total weight of active components
  if (body.isActive) {
    const activeComponents = await prisma.internshipAssessmentComponent.findMany({
      where: { isActive: true }
    });
    
    const currentTotalWeight = activeComponents.reduce((sum: number, c: InternshipAssessmentComponent) => sum + c.weight, 0);
    
    if (currentTotalWeight + body.weight > 100) {
      throw new ApiError(400, `Total bobot komponen aktif tidak boleh melebihi 100%. Saat ini: ${currentTotalWeight}%`);
    }
  }

  const component = await prisma.internshipAssessmentComponent.create({
    data: body
  });

  res.status(201).json(new ApiResponse(201, component, 'Komponen penilaian berhasil dibuat'));
});

export const updateComponent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateComponentSchema.parse(req.body);

  const existing = await prisma.internshipAssessmentComponent.findUnique({
    where: { id: Number(id) }
  });

  if (!existing) {
    throw new ApiError(404, 'Komponen penilaian tidak ditemukan');
  }

  // Validate total weight if updating weight or status
  if (body.isActive !== false && (body.weight !== undefined || body.isActive === true)) {
    const activeComponents = await prisma.internshipAssessmentComponent.findMany({
      where: { 
        isActive: true,
        id: { not: Number(id) } // Exclude current component
      }
    });
    
    const currentTotalWeight = activeComponents.reduce((sum: number, c: InternshipAssessmentComponent) => sum + c.weight, 0);
    const newWeight = body.weight !== undefined ? body.weight : existing.weight;
    
    if (currentTotalWeight + newWeight > 100) {
      throw new ApiError(400, `Total bobot komponen aktif tidak boleh melebihi 100%. Saat ini: ${currentTotalWeight}%`);
    }
  }

  const component = await prisma.internshipAssessmentComponent.update({
    where: { id: Number(id) },
    data: body
  });

  res.status(200).json(new ApiResponse(200, component, 'Komponen penilaian berhasil diperbarui'));
});

export const deleteComponent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if grades exist for this component
  const gradesCount = await prisma.internshipGrade.count({
    where: { componentId: Number(id) }
  });

  if (gradesCount > 0) {
    throw new ApiError(400, 'Komponen tidak dapat dihapus karena sudah digunakan dalam penilaian. Silakan non-aktifkan saja.');
  }

  await prisma.internshipAssessmentComponent.delete({
    where: { id: Number(id) }
  });

  res.status(200).json(new ApiResponse(200, null, 'Komponen penilaian berhasil dihapus'));
});
