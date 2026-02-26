import { ExamSessionStatus, Semester } from '@prisma/client'
import prisma from '../utils/prisma'
import {
  syncScoreEntriesFromStudentGrade,
  upsertScoreEntryFromAssignmentSubmission,
  upsertScoreEntryFromExamSession,
} from '../services/scoreEntry.service'

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE || 200)

type AcademicYearRange = {
  semester1Start: Date
  semester1End: Date
  semester2Start: Date
  semester2End: Date
}

const academicYearCache = new Map<number, AcademicYearRange>()

async function resolveSemesterFromDate(academicYearId: number, date: Date): Promise<Semester | null> {
  let cached = academicYearCache.get(academicYearId)
  if (!cached) {
    const row = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: {
        semester1Start: true,
        semester1End: true,
        semester2Start: true,
        semester2End: true,
      },
    })
    if (!row) return null
    cached = row
    academicYearCache.set(academicYearId, row)
  }

  const value = date.getTime()
  if (value >= cached.semester1Start.getTime() && value <= cached.semester1End.getTime()) return Semester.ODD
  if (value >= cached.semester2Start.getTime() && value <= cached.semester2End.getTime()) return Semester.EVEN
  return value < cached.semester2Start.getTime() ? Semester.ODD : Semester.EVEN
}

async function backfillFromStudentGrades() {
  let lastId = 0
  let success = 0
  let failed = 0

  while (true) {
    const rows = await prisma.studentGrade.findMany({
      where: {
        id: { gt: lastId },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    })
    if (rows.length === 0) break

    for (const row of rows) {
      try {
        await syncScoreEntriesFromStudentGrade(row.id)
        success += 1
      } catch (error) {
        failed += 1
        console.error(`studentGrade id=${row.id} failed:`, error)
      }
      lastId = row.id
    }

    console.log(`[backfill] student_grades processed=${success + failed} success=${success} failed=${failed}`)
  }

  return { success, failed }
}

async function backfillFromExamSessions() {
  let lastId = 0
  let success = 0
  let failed = 0

  while (true) {
    const rows = await prisma.studentExamSession.findMany({
      where: {
        id: { gt: lastId },
        status: ExamSessionStatus.COMPLETED,
        score: { not: null },
      },
      select: {
        id: true,
        studentId: true,
        score: true,
        schedule: {
          select: {
            packet: {
              select: {
                subjectId: true,
                academicYearId: true,
                semester: true,
                type: true,
                programCode: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    })
    if (rows.length === 0) break

    for (const row of rows) {
      try {
        const packet = row.schedule?.packet
        if (!packet || row.score === null || row.score === undefined) {
          lastId = row.id
          continue
        }
        await upsertScoreEntryFromExamSession({
          sessionId: row.id,
          studentId: row.studentId,
          subjectId: packet.subjectId,
          academicYearId: packet.academicYearId,
          semester: packet.semester,
          examType: packet.type,
          programCode: packet.programCode || null,
          score: Number(row.score),
        })
        success += 1
      } catch (error) {
        failed += 1
        console.error(`examSession id=${row.id} failed:`, error)
      }
      lastId = row.id
    }

    console.log(`[backfill] exam_sessions processed=${success + failed} success=${success} failed=${failed}`)
  }

  return { success, failed }
}

async function backfillFromSubmissions() {
  let lastId = 0
  let success = 0
  let failed = 0

  while (true) {
    const rows = await prisma.submission.findMany({
      where: {
        id: { gt: lastId },
        score: { not: null },
      },
      select: {
        id: true,
        studentId: true,
        score: true,
        assignment: {
          select: {
            subjectId: true,
            academicYearId: true,
            dueDate: true,
            maxScore: true,
          },
        },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    })
    if (rows.length === 0) break

    for (const row of rows) {
      try {
        if (row.score === null || row.score === undefined) {
          lastId = row.id
          continue
        }
        const semester = await resolveSemesterFromDate(row.assignment.academicYearId, row.assignment.dueDate)
        if (!semester) {
          lastId = row.id
          continue
        }
        await upsertScoreEntryFromAssignmentSubmission({
          submissionId: row.id,
          studentId: row.studentId,
          subjectId: row.assignment.subjectId,
          academicYearId: row.assignment.academicYearId,
          semester,
          score: Number(row.score),
          maxScore: row.assignment.maxScore,
        })
        success += 1
      } catch (error) {
        failed += 1
        console.error(`submission id=${row.id} failed:`, error)
      }
      lastId = row.id
    }

    console.log(`[backfill] submissions processed=${success + failed} success=${success} failed=${failed}`)
  }

  return { success, failed }
}

async function main() {
  console.log('[backfill] start student_score_entries')
  const fromStudentGrades = await backfillFromStudentGrades()
  const fromExamSessions = await backfillFromExamSessions()
  const fromSubmissions = await backfillFromSubmissions()

  console.log('[backfill] done', {
    studentGrades: fromStudentGrades,
    examSessions: fromExamSessions,
    submissions: fromSubmissions,
  })
}

main()
  .catch((error) => {
    console.error('[backfill] fatal error', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
