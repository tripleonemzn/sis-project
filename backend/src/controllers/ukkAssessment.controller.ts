import { Request, Response } from 'express';
import { Semester, GradeComponentType } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiResponseHelper } from '../utils/ApiResponse';
import { ApiError } from '../utils/api';
import { syncReportGrade } from './grade.controller';

export const upsertUKKAssessment = async (req: Request, res: Response) => {
  try {
    const { 
      studentId, 
      subjectId, 
      academicYearId, 
      criteria, 
      scores, 
      finalScore 
    } = req.body;
    
    const examinerId = (req as any).user.id;

    if (!studentId || !subjectId || !academicYearId || !criteria || !scores) {
      throw new ApiError(400, 'Missing required fields');
    }

    // Check if assessment already exists for this student+subject+year
    const existing = await prisma.ukkAssessment.findFirst({
      where: {
        studentId: Number(studentId),
        subjectId: Number(subjectId),
        academicYearId: Number(academicYearId)
      }
    });

    let result;
    if (existing) {
      result = await prisma.ukkAssessment.update({
        where: { id: existing.id },
        data: {
          criteria,
          scores,
          finalScore: Number(finalScore),
          examinerId: Number(examinerId)
        }
      });
    } else {
      result = await prisma.ukkAssessment.create({
        data: {
          studentId: Number(studentId),
          subjectId: Number(subjectId),
          academicYearId: Number(academicYearId),
          examinerId: Number(examinerId),
          criteria,
          scores,
          finalScore: Number(finalScore)
        }
      });
    }

    // ==========================================
    // SYNC TO STUDENT GRADE (US_PRACTICE)
    // ==========================================
    try {
      // Find GradeComponent for US_PRACTICE for this subject
      // We assume US_PRACTICE is the component type for UKK
      const usPracticeComponent = await prisma.gradeComponent.findFirst({
        where: {
          subjectId: Number(subjectId),
          type: GradeComponentType.US_PRACTICE,
          isActive: true
        }
      });

      if (usPracticeComponent) {
        // Find existing grade
        const existingGrade = await prisma.studentGrade.findFirst({
          where: {
            studentId: Number(studentId),
            componentId: usPracticeComponent.id,
            academicYearId: Number(academicYearId),
            semester: Semester.EVEN // Default to EVEN for US/UKK
          }
        });

        if (existingGrade) {
          await prisma.studentGrade.update({
            where: { id: existingGrade.id },
            data: { score: Number(finalScore) }
          });
        } else {
          await prisma.studentGrade.create({
            data: {
              studentId: Number(studentId),
              subjectId: Number(subjectId),
              componentId: usPracticeComponent.id,
              academicYearId: Number(academicYearId),
              semester: Semester.EVEN,
              score: Number(finalScore)
            }
          });
        }
        console.log(`Synced UKK Score to StudentGrade (Component: ${usPracticeComponent.name})`);

        try {
          await syncReportGrade(
            Number(studentId),
            Number(subjectId),
            Number(academicYearId),
            Semester.EVEN,
          );
        } catch (reportSyncError) {
          console.error('Failed to sync report grade after UKK score update:', reportSyncError);
        }
      }
    } catch (syncError) {
      console.error('Failed to sync UKK score to StudentGrade:', syncError);
      // Don't fail the main request, just log
    }

    return ApiResponseHelper.success(res, result, 'UKK Assessment saved successfully');
  } catch (error) {
    console.error('Upsert UKK Assessment error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to save UKK Assessment');
  }
};

export const getUKKAssessment = async (req: Request, res: Response) => {
  try {
    const { studentId, subjectId, academicYearId } = req.query;

    if (!studentId || !subjectId || !academicYearId) {
      throw new ApiError(400, 'Missing required query parameters');
    }

    const assessment = await prisma.ukkAssessment.findFirst({
      where: {
        studentId: Number(studentId),
        subjectId: Number(subjectId),
        academicYearId: Number(academicYearId)
      },
      include: {
        examiner: {
          select: { id: true, name: true, username: true }
        },
        student: {
          select: { id: true, name: true, nis: true, nisn: true }
        }
      }
    });

    return ApiResponseHelper.success(res, assessment, 'UKK Assessment retrieved successfully');
  } catch (error) {
    console.error('Get UKK Assessment error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve UKK Assessment');
  }
};

export const getAssessmentsByExaminer = async (req: Request, res: Response) => {
  try {
    const examinerId = (req as any).user.id;
    const { academicYearId } = req.query;

    const where: any = { examinerId };
    if (academicYearId) where.academicYearId = Number(academicYearId);

    const assessments = await prisma.ukkAssessment.findMany({
      where,
      include: {
        student: {
          select: { 
            id: true, 
            name: true, 
            studentClass: {
              select: { name: true }
            }
          }
        },
        subject: {
          select: { id: true, name: true }
        }
      }
    });

    const formattedAssessments = assessments.map(a => ({
      ...a,
      studentName: a.student.name,
      className: a.student.studentClass?.name || '-',
      subjectName: a.subject.name
    }));

    return ApiResponseHelper.success(res, formattedAssessments, 'Examiner assessments retrieved successfully');
  } catch (error) {
    console.error('Get Examiner Assessments error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve assessments');
  }
};
