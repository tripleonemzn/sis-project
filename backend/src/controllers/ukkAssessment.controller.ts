import { Request, Response } from 'express';
import { Semester, GradeComponentType } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiResponseHelper } from '../utils/ApiResponse';
import { ApiError } from '../utils/api';
import { syncReportGrade } from './grade.controller';
import {
  getHistoricalStudentSnapshotForAcademicYear,
  listHistoricalStudentsByIdsForAcademicYear,
} from '../utils/studentAcademicHistory';

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
    const normalizedStudentId = Number(studentId);
    const normalizedSubjectId = Number(subjectId);
    const normalizedAcademicYearId = Number(academicYearId);
    const normalizedExaminerId = Number(examinerId);
    const normalizedFinalScore = Number(finalScore);

    if (!studentId || !subjectId || !academicYearId || !criteria || !scores) {
      throw new ApiError(400, 'Missing required fields');
    }

    if (
      !Number.isFinite(normalizedStudentId) ||
      normalizedStudentId <= 0 ||
      !Number.isFinite(normalizedSubjectId) ||
      normalizedSubjectId <= 0 ||
      !Number.isFinite(normalizedAcademicYearId) ||
      normalizedAcademicYearId <= 0 ||
      !Number.isFinite(normalizedExaminerId) ||
      normalizedExaminerId <= 0 ||
      !Number.isFinite(normalizedFinalScore)
    ) {
      throw new ApiError(400, 'Invalid numeric payload');
    }

    const studentSnapshot = await getHistoricalStudentSnapshotForAcademicYear(
      normalizedStudentId,
      normalizedAcademicYearId,
    );
    if (!studentSnapshot) {
      throw new ApiError(400, 'Siswa tidak valid untuk tahun ajaran yang dipilih');
    }

    // Check if assessment already exists for this student+subject+year
    const existing = await prisma.ukkAssessment.findFirst({
      where: {
        studentId: normalizedStudentId,
        subjectId: normalizedSubjectId,
        academicYearId: normalizedAcademicYearId
      }
    });

    let result;
    if (existing) {
      result = await prisma.ukkAssessment.update({
        where: { id: existing.id },
        data: {
          criteria,
          scores,
          finalScore: normalizedFinalScore,
          examinerId: normalizedExaminerId
        }
      });
    } else {
      result = await prisma.ukkAssessment.create({
        data: {
          studentId: normalizedStudentId,
          subjectId: normalizedSubjectId,
          academicYearId: normalizedAcademicYearId,
          examinerId: normalizedExaminerId,
          criteria,
          scores,
          finalScore: normalizedFinalScore
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
          subjectId: normalizedSubjectId,
          type: GradeComponentType.US_PRACTICE,
          isActive: true
        }
      });

      if (usPracticeComponent) {
        // Find existing grade
        const existingGrade = await prisma.studentGrade.findFirst({
          where: {
            studentId: normalizedStudentId,
            componentId: usPracticeComponent.id,
            academicYearId: normalizedAcademicYearId,
            semester: Semester.EVEN // Default to EVEN for US/UKK
          }
        });

        if (existingGrade) {
          await prisma.studentGrade.update({
            where: { id: existingGrade.id },
            data: { score: normalizedFinalScore }
          });
        } else {
          await prisma.studentGrade.create({
            data: {
              studentId: normalizedStudentId,
              subjectId: normalizedSubjectId,
              componentId: usPracticeComponent.id,
              academicYearId: normalizedAcademicYearId,
              semester: Semester.EVEN,
              score: normalizedFinalScore
            }
          });
        }
        console.log(`Synced UKK Score to StudentGrade (Component: ${usPracticeComponent.name})`);

        try {
          await syncReportGrade(
            normalizedStudentId,
            normalizedSubjectId,
            normalizedAcademicYearId,
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
    const normalizedStudentId = Number(studentId);
    const normalizedSubjectId = Number(subjectId);
    const normalizedAcademicYearId = Number(academicYearId);

    if (!studentId || !subjectId || !academicYearId) {
      throw new ApiError(400, 'Missing required query parameters');
    }

    if (
      !Number.isFinite(normalizedStudentId) ||
      normalizedStudentId <= 0 ||
      !Number.isFinite(normalizedSubjectId) ||
      normalizedSubjectId <= 0 ||
      !Number.isFinite(normalizedAcademicYearId)
      ||
      normalizedAcademicYearId <= 0
    ) {
      throw new ApiError(400, 'Invalid numeric query parameters');
    }

    const assessment = await prisma.ukkAssessment.findFirst({
      where: {
        studentId: normalizedStudentId,
        subjectId: normalizedSubjectId,
        academicYearId: normalizedAcademicYearId
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

    const studentSnapshot = assessment
      ? await getHistoricalStudentSnapshotForAcademicYear(assessment.student.id, normalizedAcademicYearId)
      : null;

    const payload = assessment
      ? {
          ...assessment,
          student: {
            ...assessment.student,
            studentClass: studentSnapshot?.studentClass || null,
          },
        }
      : assessment;

    return ApiResponseHelper.success(res, payload, 'UKK Assessment retrieved successfully');
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
    const normalizedAcademicYearId =
      academicYearId !== undefined && academicYearId !== null && String(academicYearId).trim() !== ''
        ? Number(academicYearId)
        : null;

    if (
      normalizedAcademicYearId !== null &&
      (!Number.isFinite(normalizedAcademicYearId) || normalizedAcademicYearId <= 0)
    ) {
      throw new ApiError(400, 'Invalid academic year');
    }

    const where: any = { examinerId };
    if (normalizedAcademicYearId) where.academicYearId = normalizedAcademicYearId;

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

    const historicalStudents =
      normalizedAcademicYearId && assessments.length > 0
        ? await listHistoricalStudentsByIdsForAcademicYear(
            assessments.map((item) => item.student.id),
            normalizedAcademicYearId,
          )
        : [];
    const studentSnapshotMap = new Map(historicalStudents.map((item) => [item.id, item]));

    const formattedAssessments = assessments.map(a => ({
      ...a,
      student: studentSnapshotMap.has(a.student.id)
        ? {
            ...a.student,
            studentClass: studentSnapshotMap.get(a.student.id)?.studentClass || null,
          }
        : a.student,
      studentName: a.student.name,
      className:
        studentSnapshotMap.get(a.student.id)?.studentClass?.name || a.student.studentClass?.name || '-',
      subjectName: a.subject.name
    }));

    return ApiResponseHelper.success(res, formattedAssessments, 'Examiner assessments retrieved successfully');
  } catch (error) {
    console.error('Get Examiner Assessments error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve assessments');
  }
};
