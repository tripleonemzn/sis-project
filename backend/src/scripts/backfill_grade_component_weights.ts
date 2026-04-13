import { GradeComponentType, Semester } from '@prisma/client'
import prisma from '../utils/prisma'
import { syncReportGrade } from '../controllers/grade.controller'

type ReportSyncTarget = {
  studentId: number
  subjectId: number
  semester: Semester
}

const ACTIVE_COMPONENT_WEIGHT_UPDATES: Array<{
  type: GradeComponentType
  weight: number
}> = [
  { type: GradeComponentType.FORMATIVE, weight: 50 },
  { type: GradeComponentType.MIDTERM, weight: 25 },
  { type: GradeComponentType.FINAL, weight: 25 },
  { type: GradeComponentType.US_THEORY, weight: 50 },
  { type: GradeComponentType.US_PRACTICE, weight: 50 },
]

async function main() {
  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { id: 'desc' },
    select: { id: true, name: true },
  })

  if (!activeAcademicYear) {
    throw new Error('Tahun ajaran aktif tidak ditemukan.')
  }

  console.log(
    `[grade-weight-backfill] Active year: ${activeAcademicYear.name} (#${activeAcademicYear.id})`,
  )

  for (const update of ACTIVE_COMPONENT_WEIGHT_UPDATES) {
    const result = await prisma.gradeComponent.updateMany({
      where: {
        type: update.type,
        isActive: true,
        NOT: { weight: update.weight },
      },
      data: { weight: update.weight },
    })
    console.log(
      `[grade-weight-backfill] Updated ${result.count} grade_component row(s) for ${update.type} -> ${update.weight}%`,
    )
  }

  const [studentGradeRows, reportGradeRows] = await Promise.all([
    prisma.studentGrade.findMany({
      where: {
        academicYearId: activeAcademicYear.id,
      },
      select: {
        studentId: true,
        subjectId: true,
        semester: true,
      },
    }),
    prisma.reportGrade.findMany({
      where: {
        academicYearId: activeAcademicYear.id,
      },
      select: {
        studentId: true,
        subjectId: true,
        semester: true,
      },
    }),
  ])

  const targetMap = new Map<string, ReportSyncTarget>()
  ;[...studentGradeRows, ...reportGradeRows].forEach((row) => {
    const studentId = Number(row.studentId)
    const subjectId = Number(row.subjectId)
    const semester = row.semester
    if (!Number.isFinite(studentId) || studentId <= 0) return
    if (!Number.isFinite(subjectId) || subjectId <= 0) return
    if (semester !== Semester.ODD && semester !== Semester.EVEN) return
    targetMap.set(`${studentId}:${subjectId}:${semester}`, {
      studentId,
      subjectId,
      semester,
    })
  })

  const targets = Array.from(targetMap.values())
  console.log(
    `[grade-weight-backfill] Recomputing ${targets.length} report_grade combination(s) in controlled batches.`,
  )

  const batchSize = 15
  for (let index = 0; index < targets.length; index += batchSize) {
    const batch = targets.slice(index, index + batchSize)
    await Promise.all(
      batch.map((target) =>
        syncReportGrade(
          target.studentId,
          target.subjectId,
          activeAcademicYear.id,
          target.semester,
        ),
      ),
    )
    console.log(
      `[grade-weight-backfill] Synced ${Math.min(index + batch.length, targets.length)}/${targets.length}`,
    )
  }

  console.log('[grade-weight-backfill] Completed successfully.')
}

main()
  .catch((error) => {
    console.error('[grade-weight-backfill] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
