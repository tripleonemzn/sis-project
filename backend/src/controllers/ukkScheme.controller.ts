import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiResponseHelper } from '../utils/ApiResponse';
import { ApiError } from '../utils/api';

const buildVocationalSubjectWhere = () => ({
  OR: [
    {
      category: {
        is: {
          code: {
            in: ['PRODUKTIF', 'KEJURUAN', 'KOMPETENSI_KEAHLIAN', 'UKK'],
          },
        },
      },
    },
    {
      category: {
        is: {
          name: { contains: 'KEJURUAN', mode: 'insensitive' as const },
        },
      },
    },
    {
      category: {
        is: {
          name: { contains: 'KOMPETENSI', mode: 'insensitive' as const },
        },
      },
    },
    { name: { contains: 'KEJURUAN', mode: 'insensitive' as const } },
    { name: { contains: 'KOMPETENSI', mode: 'insensitive' as const } },
    { name: { contains: 'PRODUKTIF', mode: 'insensitive' as const } },
    { name: { contains: 'UKK', mode: 'insensitive' as const } },
  ],
});

export const createScheme = async (req: Request, res: Response) => {
  try {
    const examinerId = (req as any).user.id;
    const { name, subjectId, majorId, academicYearId, criteria, examinerIds } = req.body;

    if (!name || !subjectId || !academicYearId || !criteria) {
      throw new ApiError(400, 'Missing required fields');
    }

    const vocationalSubject = await prisma.subject.findFirst({
      where: {
        id: Number(subjectId),
        ...buildVocationalSubjectWhere(),
      },
      select: { id: true },
    });
    if (!vocationalSubject) {
      throw new ApiError(
        400,
        'Mata pelajaran yang dipilih bukan mapel UKK/kejuruan. Pilih mapel kejuruan yang valid.',
      );
    }

    const scheme = await prisma.ukkScheme.create({
      data: {
        name,
        subjectId: Number(subjectId),
        majorId: majorId ? Number(majorId) : null,
        academicYearId: Number(academicYearId),
        examinerId,
        criteria,
        assignedExaminers: examinerIds && Array.isArray(examinerIds) ? {
          connect: examinerIds.map((id: number) => ({ id: Number(id) }))
        } : undefined
      }
    });

    return ApiResponseHelper.success(res, scheme, 'Scheme created successfully');
  } catch (error) {
    console.error('Create Scheme error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to create scheme');
  }
};

export const getSchemes = async (req: Request, res: Response) => {
  try {
    const examinerId = (req as any).user.id;
    const { academicYearId } = req.query;

    const where: any = {
      OR: [{ examinerId }, { assignedExaminers: { some: { id: examinerId } } }],
    };
    if (academicYearId) where.academicYearId = Number(academicYearId);

    const schemes = await prisma.ukkScheme.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        major: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        assignedExaminers: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return ApiResponseHelper.success(res, schemes, 'Schemes retrieved successfully');
  } catch (error) {
    console.error('Get Schemes error:', error);
    throw new ApiError(500, 'Failed to retrieve schemes');
  }
};

export const getSchemeDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const scheme = await prisma.ukkScheme.findUnique({
      where: { id: Number(id) },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        major: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        assignedExaminers: { select: { id: true, name: true } }
      }
    });

    if (!scheme) throw new ApiError(404, 'Scheme not found');

    return ApiResponseHelper.success(res, scheme, 'Scheme detail retrieved successfully');
  } catch (error) {
    console.error('Get Scheme Detail error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve scheme detail');
  }
};

export const updateScheme = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, criteria, examinerIds } = req.body;

    const scheme = await prisma.ukkScheme.update({
      where: { id: Number(id) },
      data: {
        name,
        criteria,
        assignedExaminers: examinerIds ? {
          set: examinerIds.map((id: number) => ({ id: Number(id) }))
        } : undefined
      }
    });

    return ApiResponseHelper.success(res, scheme, 'Scheme updated successfully');
  } catch (error) {
    console.error('Update Scheme error:', error);
    throw new ApiError(500, 'Failed to update scheme');
  }
};

export const deleteScheme = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.ukkScheme.delete({ where: { id: Number(id) } });
    return ApiResponseHelper.success(res, null, 'Scheme deleted successfully');
  } catch (error) {
    console.error('Delete Scheme error:', error);
    throw new ApiError(500, 'Failed to delete scheme');
  }
};
