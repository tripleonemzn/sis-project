import { Request, Response } from 'express';
import { aiService } from '../services/ai.service';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

const analyzeCpSchema = z.object({
  text: z.string().min(10, 'Teks CP terlalu pendek'),
  context: z.object({
    subject: z.string().optional(),
    phase: z.string().optional(),
    level: z.string().optional(),
  }).optional(),
});

export const checkAiStatus = asyncHandler(async (req: Request, res: Response) => {
  const isAvailable = aiService.isAvailable();
  res.status(200).json(new ApiResponse(200, { available: isAvailable }));
});

export const analyzeCp = asyncHandler(async (req: Request, res: Response) => {
  const { text, context } = analyzeCpSchema.parse(req.body);

  if (!aiService.isAvailable()) {
    throw new ApiError(503, 'Layanan AI tidak tersedia. Mohon hubungi admin untuk konfigurasi API Key.');
  }

  try {
    const result = await aiService.analyzeCp(text, context);
    res.status(200).json(new ApiResponse(200, result, 'Analisis CP berhasil'));
  } catch (error: any) {
    throw new ApiError(500, `Gagal memproses AI: ${error.message}`);
  }
});
