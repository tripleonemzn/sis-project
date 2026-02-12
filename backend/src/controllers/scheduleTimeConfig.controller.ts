import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';

export const getScheduleTimeConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId } = req.query;

    if (!academicYearId) {
      // Try to get active academic year if not provided
      const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
      });

      if (!activeYear) {
         return res.status(400).json({
          success: false,
          message: 'No active academic year found and no ID provided',
        });
      }

      const config = await prisma.scheduleTimeConfig.findUnique({
        where: {
          academicYearId: activeYear.id,
        },
      });

      return res.json({
        success: true,
        data: config,
        academicYearId: activeYear.id
      });
    }

    const config = await prisma.scheduleTimeConfig.findUnique({
      where: {
        academicYearId: Number(academicYearId),
      },
    });

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

export const upsertScheduleTimeConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { academicYearId, config } = req.body;

    if (!academicYearId || !config) {
      return res.status(400).json({
        success: false,
        message: 'Academic Year ID and config are required',
      });
    }

    const result = await prisma.scheduleTimeConfig.upsert({
      where: {
        academicYearId: Number(academicYearId),
      },
      update: {
        config,
      },
      create: {
        academicYearId: Number(academicYearId),
        config,
      },
    });

    res.json({
      success: true,
      message: 'Schedule time configuration saved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
