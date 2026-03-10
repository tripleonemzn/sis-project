import { createHash } from 'crypto'
import prisma from '../utils/prisma'

type QuestionRow = {
  id: number
  bankId: number
  type: string
  content: string
  options: unknown
  bank: {
    id: number
    authorId: number | null
    subjectId: number
    academicYearId: number
    semester: string
    title: string
  }
}

function normalizeText(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeOptions(options: unknown): Array<{ text: string; isCorrect: boolean }> {
  if (!Array.isArray(options)) return []
  return options
    .map((option, idx) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) {
        return { text: normalizeText(option), isCorrect: false, idx }
      }
      const source = option as Record<string, unknown>
      const rawText =
        source.text ??
        source.content ??
        source.label ??
        source.optionText ??
        source.value ??
        source.option ??
        ''
      return {
        text: normalizeText(rawText),
        isCorrect: Boolean(source.isCorrect),
        idx,
      }
    })
    .sort((a, b) => {
      if (a.text !== b.text) return a.text.localeCompare(b.text, 'id')
      if (a.isCorrect !== b.isCorrect) return Number(a.isCorrect) - Number(b.isCorrect)
      return a.idx - b.idx
    })
    .map(({ text, isCorrect }) => ({ text, isCorrect }))
}

function signatureOfQuestion(question: Pick<QuestionRow, 'type' | 'content' | 'options'>): string {
  const payload = JSON.stringify({
    type: String(question.type || '').trim().toUpperCase(),
    content: normalizeText(question.content),
    options: normalizeOptions(question.options),
  })
  return createHash('sha256').update(payload).digest('hex')
}

function scopeKey(question: QuestionRow): string {
  const authorKey = question.bank.authorId ?? 0
  return `${authorKey}:${question.bank.subjectId}:${question.bank.academicYearId}:${question.bank.semester}`
}

async function deleteInChunks(ids: number[], chunkSize = 500): Promise<number> {
  let totalDeleted = 0
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize)
    if (!chunk.length) continue
    const result = await prisma.question.deleteMany({
      where: { id: { in: chunk } },
    })
    totalDeleted += result.count
  }
  return totalDeleted
}

async function main() {
  const questions = await prisma.question.findMany({
    select: {
      id: true,
      bankId: true,
      type: true,
      content: true,
      options: true,
      bank: {
        select: {
          id: true,
          authorId: true,
          subjectId: true,
          academicYearId: true,
          semester: true,
          title: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  })

  const seen = new Map<string, number>()
  const duplicateIds: number[] = []
  const deletedPerBank = new Map<number, number>()
  const duplicateSample: Array<{
    duplicateId: number
    keepId: number
    bankId: number
    bankTitle: string
    scope: string
  }> = []

  for (const row of questions as QuestionRow[]) {
    const key = `${scopeKey(row)}::${signatureOfQuestion(row)}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, row.id)
      continue
    }

    duplicateIds.push(row.id)
    deletedPerBank.set(row.bankId, (deletedPerBank.get(row.bankId) || 0) + 1)
    if (duplicateSample.length < 20) {
      duplicateSample.push({
        duplicateId: row.id,
        keepId: existing,
        bankId: row.bankId,
        bankTitle: row.bank.title,
        scope: scopeKey(row),
      })
    }
  }

  const deletedCount = await deleteInChunks(duplicateIds)

  const topBanks = await Promise.all(
    Array.from(deletedPerBank.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(async ([bankId, count]) => {
        const bank = await prisma.questionBank.findUnique({
          where: { id: bankId },
          select: { id: true, title: true, subjectId: true, academicYearId: true, semester: true, authorId: true },
        })
        return {
          bankId,
          deletedCount: count,
          bank,
        }
      }),
  )

  const remaining = await prisma.question.count()

  console.log(
    JSON.stringify(
      {
        scannedQuestions: questions.length,
        duplicateDetected: duplicateIds.length,
        deletedCount,
        remainingQuestions: remaining,
        affectedBanks: deletedPerBank.size,
        topBanks,
        duplicateSample,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error('CLEANUP QUESTION BANK DUPLICATES FAILED:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
