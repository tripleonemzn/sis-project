const normalizeGradeWeightCode = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

const isFormativeWeightCode = (raw: unknown): boolean => {
  const normalized = normalizeGradeWeightCode(raw)
  if (!normalized) return false
  return normalized === 'FORMATIF' || normalized === 'FORMATIVE' || normalized.startsWith('NF')
}

const isMidtermWeightCode = (raw: unknown): boolean => {
  const normalized = normalizeGradeWeightCode(raw)
  if (!normalized) return false
  if (['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(normalized)) return true
  return normalized.includes('MIDTERM')
}

const isFinalWeightCode = (raw: unknown): boolean => {
  const normalized = normalizeGradeWeightCode(raw)
  if (!normalized) return false
  if (['SAS', 'SAT', 'FINAL', 'PAS', 'PAT', 'PSAS', 'PSAT'].includes(normalized)) return true
  return normalized.includes('FINAL')
}

const isUsTheoryWeightCode = (raw: unknown): boolean => {
  const normalized = normalizeGradeWeightCode(raw)
  if (!normalized) return false
  return ['US_THEORY', 'US_TEORI', 'ASAJ'].includes(normalized)
}

const isUsPracticeWeightCode = (raw: unknown): boolean => {
  const normalized = normalizeGradeWeightCode(raw)
  if (!normalized) return false
  return ['US_PRACTICE', 'US_PRAKTEK', 'US_PRAKTIK', 'ASAJP', 'PSAJ'].includes(normalized)
}

const resolveDefaultGradeWeightByCode = (raw: unknown): number => {
  const normalized = normalizeGradeWeightCode(raw)
  if (!normalized) return 0
  if (isFormativeWeightCode(normalized)) return 50
  if (isMidtermWeightCode(normalized)) return 25
  if (isFinalWeightCode(normalized)) return 25
  if (isUsTheoryWeightCode(normalized)) return 50
  if (isUsPracticeWeightCode(normalized)) return 50
  return 0
}

const computeNormalizedWeightedAverage = (
  rows: Array<{ code?: unknown; score: number | null | undefined }>,
): number | null => {
  let weightedScoreTotal = 0
  let weightTotal = 0

  rows.forEach((row) => {
    const score = Number(row.score)
    if (!Number.isFinite(score)) return

    const weight = resolveDefaultGradeWeightByCode(row.code)
    if (!Number.isFinite(weight) || weight <= 0) return

    weightedScoreTotal += score * weight
    weightTotal += weight
  })

  if (weightTotal <= 0) return null
  return weightedScoreTotal / weightTotal
}

const normalizeRoundedFinalScore = (raw: number | null | undefined): number | null => {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null

  const fixedTwo = Number(parsed.toFixed(2))
  const fractional = fixedTwo - Math.trunc(fixedTwo)

  if (fractional > 0.5) {
    return Number(Math.ceil(fixedTwo).toFixed(2))
  }

  return fixedTwo
}

export {
  normalizeGradeWeightCode,
  isFormativeWeightCode,
  isMidtermWeightCode,
  isFinalWeightCode,
  isUsTheoryWeightCode,
  isUsPracticeWeightCode,
  resolveDefaultGradeWeightByCode,
  computeNormalizedWeightedAverage,
  normalizeRoundedFinalScore,
}
