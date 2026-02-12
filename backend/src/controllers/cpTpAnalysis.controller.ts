import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';

// Get Analysis
export const getCpTpAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { teacherId, subjectId, level, academicYearId } = req.query;

  console.log('----------------------------------------------------');
  console.log('🚀 [CP/TP] GET REQUEST RECEIVED');
  console.log('PARAMS:', { teacherId, subjectId, level, academicYearId });
  console.log('----------------------------------------------------');

  if (!teacherId || !subjectId || !level || !academicYearId) {
    throw new ApiError(400, 'Missing required query parameters: teacherId, subjectId, level, academicYearId');
  }

  const analysis = await prisma.cpTpAnalysis.findUnique({
    where: {
      teacherId_subjectId_level_academicYearId: {
        teacherId: parseInt(teacherId as string),
        subjectId: parseInt(subjectId as string),
        level: level as string,
        academicYearId: parseInt(academicYearId as string),
      },
    },
    include: {
        teacher: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
    }
  });

  if (analysis) {
      console.log('✅ [CP/TP] DATA FOUND:', analysis.id);
  } else {
      console.log('❌ [CP/TP] DATA NOT FOUND');
  }

  res.status(200).json(new ApiResponse(200, analysis, 'Data successfully retrieved'));
});

// Upsert Analysis
export const saveCpTpAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { teacherId, subjectId, level, academicYearId, content, principalName, titimangsa } = req.body;

  console.log('----------------------------------------------------');
  console.log('🚀 [CP/TP] SAVE REQUEST RECEIVED');
  console.log('PARAMS:', { teacherId, subjectId, level, academicYearId });
  console.log('CONTENT LENGTH:', Array.isArray(content) ? content.length : 'Not Array');
  console.log('----------------------------------------------------');

  if (!teacherId || !subjectId || !level || !academicYearId) {
    console.error('❌ [CP/TP] MISSING REQUIRED FIELDS');
    throw new ApiError(400, 'Missing required fields');
  }

  try {
    const analysis = await prisma.cpTpAnalysis.upsert({
      where: {
        teacherId_subjectId_level_academicYearId: {
          teacherId: parseInt(teacherId),
          subjectId: parseInt(subjectId),
          level: level,
          academicYearId: parseInt(academicYearId),
        },
      },
      update: {
        content: content, // Json
        principalName: principalName,
        titimangsa: titimangsa,
      },
      create: {
        teacherId: parseInt(teacherId),
        subjectId: parseInt(subjectId),
        level: level,
        academicYearId: parseInt(academicYearId),
        phase: level === 'X' ? 'E' : 'F', // Simple logic for now
        content: content,
        principalName: principalName,
        titimangsa: titimangsa,
      },
    });

    console.log('✅ [CP/TP] SAVED SUCCESSFULLY:', analysis.id);
    res.status(200).json(new ApiResponse(200, analysis, 'Data saved successfully'));
  } catch (error) {
    console.error('❌ [CP/TP] SAVE ERROR:', error);
    throw new ApiError(500, 'Failed to save analysis data');
  }
});
