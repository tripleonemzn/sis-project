import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { AuthRequest } from '../types';

// Partners
export const getPartners = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, status } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (status) where.cooperationStatus = status;
  if (search) {
    where.name = { contains: String(search), mode: 'insensitive' };
  }

  const [total, partners] = await Promise.all([
    prisma.industryPartner.count({ where }),
    prisma.industryPartner.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  res.status(200).json(new ApiResponse(200, { partners, total, page: pageNum, totalPages: Math.ceil(total / limitNum) }, 'Data mitra berhasil diambil'));
});

export const createPartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const partner = await prisma.industryPartner.create({
    data: req.body
  });
  res.status(201).json(new ApiResponse(201, partner, 'Mitra berhasil ditambahkan'));
});

export const updatePartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const partner = await prisma.industryPartner.update({
    where: { id: Number(id) },
    data: req.body
  });
  res.status(200).json(new ApiResponse(200, partner, 'Mitra berhasil diperbarui'));
});

export const deletePartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await prisma.industryPartner.delete({ where: { id: Number(id) } });
  res.status(200).json(new ApiResponse(200, null, 'Mitra berhasil dihapus'));
});

// Vacancies (BKK)
export const getVacancies = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, isOpen } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (isOpen !== undefined) where.isOpen = isOpen === 'true';
  if (search) {
    where.title = { contains: String(search), mode: 'insensitive' };
  }

  const [total, vacancies] = await Promise.all([
    prisma.jobVacancy.count({ where }),
    prisma.jobVacancy.findMany({
      where,
      include: { industryPartner: true },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  res.status(200).json(new ApiResponse(200, { vacancies, total, page: pageNum, totalPages: Math.ceil(total / limitNum) }, 'Lowongan berhasil diambil'));
});

export const createVacancy = asyncHandler(async (req: AuthRequest, res: Response) => {
  const vacancy = await prisma.jobVacancy.create({
    data: req.body
  });
  res.status(201).json(new ApiResponse(201, vacancy, 'Lowongan berhasil ditambahkan'));
});

export const updateVacancy = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const vacancy = await prisma.jobVacancy.update({
    where: { id: Number(id) },
    data: req.body
  });
  res.status(200).json(new ApiResponse(200, vacancy, 'Lowongan berhasil diperbarui'));
});

export const deleteVacancy = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await prisma.jobVacancy.delete({ where: { id: Number(id) } });
  res.status(200).json(new ApiResponse(200, null, 'Lowongan berhasil dihapus'));
});
