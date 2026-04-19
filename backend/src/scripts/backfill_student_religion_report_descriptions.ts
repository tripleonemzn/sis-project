import { Role } from '@prisma/client'
import prisma from '../utils/prisma'
import { resyncStudentReligionReportDescriptions } from '../controllers/grade.controller'

const BATCH_SIZE = Number(process.env.BACKFILL_RELIGION_DESCRIPTION_BATCH_SIZE || 50)

async function main() {
  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  })

  if (!activeAcademicYear) {
    throw new Error('Tahun ajaran aktif tidak ditemukan.')
  }

  console.log(
    `[religion-description-backfill] activeAcademicYear=${activeAcademicYear.id} (${activeAcademicYear.name}) batchSize=${BATCH_SIZE}`,
  )

  let lastId = 0
  let processed = 0
  let updatedRows = 0

  while (true) {
    const rows = await prisma.reportGrade.findMany({
      where: {
        studentId: { gt: lastId },
        academicYearId: activeAcademicYear.id,
      },
      select: {
        studentId: true,
      },
      orderBy: { studentId: 'asc' },
      distinct: ['studentId'],
      take: BATCH_SIZE,
    })

    if (rows.length === 0) {
      break
    }

    const studentIds = rows.map((row) => row.studentId)
    const students = await prisma.user.findMany({
      where: {
        id: { in: studentIds },
        role: Role.STUDENT,
        religion: { not: null },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { id: 'asc' },
    })

    for (const student of students) {
      const result = await resyncStudentReligionReportDescriptions(student.id)
      processed += 1
      updatedRows += result.updated
      lastId = student.id
      console.log(
        `[religion-description-backfill] studentId=${student.id} name=${student.name} scanned=${result.scanned} updated=${result.updated}`,
      )
    }

    lastId = rows[rows.length - 1]?.studentId || lastId
  }

  console.log(
    `[religion-description-backfill] completed students=${processed} updatedRows=${updatedRows}`,
  )
}

main()
  .catch((error) => {
    console.error('[religion-description-backfill] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
