import prisma from '../utils/prisma';
import { ApiError } from '../utils/api';
import { Semester, Prisma, ExamType } from '@prisma/client';

export class TutorService {
  /**
   * Get extracurricular assignments for a tutor
   */
  async getAssignments(tutorId: number, academicYearId?: number) {
    // If academicYearId is not provided, use the active one
    let targetAcademicYearId = academicYearId;
    if (!targetAcademicYearId) {
      const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
      });
      if (activeYear) {
        targetAcademicYearId = activeYear.id;
      }
    }

    if (!targetAcademicYearId) {
      return [];
    }

    // Cast prisma to any because Typescript definitions might be out of sync
    // verified runtime existence via check_prisma_keys.ts
    const assignments = await (prisma as any).ekstrakurikulerTutorAssignment.findMany({
      where: {
        tutorId,
        academicYearId: targetAcademicYearId,
        isActive: true,
      },
      include: {
        ekskul: true,
        academicYear: true,
      },
    });

    return assignments;
  }

  /**
   * Get members (students) of an extracurricular
   */
  async getMembers(tutorId: number, ekskulId: number, academicYearId: number) {
    // Verify assignment first
    const assignment = await (prisma as any).ekstrakurikulerTutorAssignment.findUnique({
      where: {
        tutorId_ekskulId_academicYearId: {
          tutorId,
          ekskulId,
          academicYearId,
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ApiError(403, 'Anda tidak memiliki akses ke ekstrakurikuler ini');
    }

    // Fetch enrollments
    const enrollments = await prisma.ekstrakurikulerEnrollment.findMany({
      where: {
        ekskulId,
        academicYearId,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            studentClass: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        student: {
          name: 'asc',
        },
      },
    });

    return enrollments;
  }

  /**
   * Update grade for a student in an extracurricular
   */
  async updateGrade(
    tutorId: number, 
    enrollmentId: number, 
    data: { 
      grade: string; 
      description: string;
      semester?: Semester;
      reportType?: ExamType;
    }
  ) {
    // Verify ownership
    const enrollment = await prisma.ekstrakurikulerEnrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      throw new ApiError(404, 'Data anggota tidak ditemukan');
    }

    const assignment = await (prisma as any).ekstrakurikulerTutorAssignment.findUnique({
      where: {
        tutorId_ekskulId_academicYearId: {
          tutorId,
          ekskulId: enrollment.ekskulId,
          academicYearId: enrollment.academicYearId,
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ApiError(403, 'Anda tidak memiliki akses untuk menilai siswa ini');
    }

    let updateData: any = {};
    const { semester, reportType, grade, description } = data;

    if (semester && reportType) {
      if (semester === Semester.ODD) {
        if (reportType === ExamType.SBTS) {
          updateData = { gradeSbtsOdd: grade, descSbtsOdd: description };
        } else if (reportType === ExamType.SAS) {
          updateData = { gradeSas: grade, descSas: description };
        }
      } else {
        if (reportType === ExamType.SBTS) {
          updateData = { gradeSbtsEven: grade, descSbtsEven: description };
        } else if (reportType === ExamType.SAT) {
          updateData = { gradeSat: grade, descSat: description };
        }
      }
    } else {
      // Fallback
      updateData = { grade, description };
    }

    return prisma.ekstrakurikulerEnrollment.update({
      where: { id: enrollmentId },
      data: updateData,
    });
  }
}

export const tutorService = new TutorService();
