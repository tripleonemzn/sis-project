import prisma from '../utils/prisma';
import { Semester, ExamType, Prisma, GradeComponentType } from '@prisma/client';
import { ApiError } from '../utils/api';
import {
  getHistoricalStudentSnapshot,
  listHistoricalStudentsForClass,
} from '../utils/studentAcademicHistory';
import {
  computeFixedWeightedAverage,
  computeNormalizedWeightedAverage,
  normalizeRoundedFinalScore,
} from '../utils/gradeWeights';
import { summarizeDailyPresenceRows } from '../utils/dailyPresenceSummary';

const normalizeLedgerCode = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const parseScoreNumber = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
};

const calculateAverage = (values: number[]): number | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const parseSlotScoreMap = (raw: unknown): Record<string, number | null> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, number | null> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const normalizedKey = normalizeLedgerCode(key);
    if (!normalizedKey) return;
    const parsed = parseScoreNumber(value);
    result[normalizedKey] = parsed;
  });
  return result;
};

type ReportScoreCarrier = {
  formatifScore?: number | null;
  sbtsScore?: number | null;
  sasScore?: number | null;
  satScore?: number | null;
  usScore?: number | null;
  slotScores?: unknown;
};

const isUsAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  return normalized === 'US_THEORY' || normalized === 'US_PRACTICE' || normalized === 'US_TEORI' || normalized === 'US_PRAKTEK';
};

const hasUsSlotScore = (rawSlotScores: unknown): boolean => {
  const slotScores = parseSlotScoreMap(rawSlotScores);
  return Object.entries(slotScores).some(([slotCode, score]) => {
    if (score === null || score === undefined) return false;
    return isUsAliasCode(slotCode);
  });
};

const hasPrimaryFinalSlotScore = (rawSlotScores: unknown): boolean => {
  const slotScores = parseSlotScoreMap(rawSlotScores);
  return Object.entries(slotScores).some(([slotCode, score]) => {
    if (score === null || score === undefined) return false;
    const normalizedSlotCode = normalizeLedgerCode(slotCode);
    if (!normalizedSlotCode || normalizedSlotCode === 'NONE') return false;
    if (normalizedSlotCode.endsWith('_REF')) return false;
    return isFinalAliasCode(normalizedSlotCode);
  });
};

const hasPersistedFinalReportEvidence = (
  grade: { sasScore?: number | null; satScore?: number | null; slotScores?: unknown } | null | undefined,
): boolean => {
  if (!grade) return false;
  if (hasPrimaryFinalSlotScore(grade.slotScores)) return true;
  if (parseScoreNumber(grade.sasScore) !== null) return true;
  if (parseScoreNumber(grade.satScore) !== null) return true;
  return false;
};

const readSlotScoreByMatcher = (
  slotScores: Record<string, number | null>,
  matcher: (slotCode: string) => boolean,
): number | null => {
  for (const [rawSlotCode, rawScore] of Object.entries(slotScores)) {
    const score = parseScoreNumber(rawScore);
    if (score === null) continue;
    const normalizedSlotCode = normalizeLedgerCode(rawSlotCode);
    if (!normalizedSlotCode || normalizedSlotCode === 'NONE') continue;
    if (normalizedSlotCode.endsWith('_REF')) continue;
    if (matcher(normalizedSlotCode)) return score;
  }
  return null;
};

const resolvePreferredFinalComponentScore = (
  grade: {
    semester?: Semester | null;
    sasScore?: number | null;
    satScore?: number | null;
    slotScores?: unknown;
  } | null | undefined,
): { slotCode: 'SAS' | 'SAT'; score: number | null } => {
  const slotScores = parseSlotScoreMap(grade?.slotScores);
  const satScore =
    readSlotScoreByMatcher(slotScores, isFinalEvenAliasCode) ??
    parseScoreNumber(grade?.satScore);
  const sasScore =
    readSlotScoreByMatcher(slotScores, isFinalOddAliasCode) ??
    parseScoreNumber(grade?.sasScore);

  if (grade?.semester === Semester.EVEN) {
    return { slotCode: 'SAT', score: satScore ?? sasScore };
  }
  if (grade?.semester === Semester.ODD) {
    return { slotCode: 'SAS', score: sasScore ?? satScore };
  }
  if (satScore !== null) {
    return { slotCode: 'SAT', score: satScore };
  }
  return { slotCode: 'SAS', score: sasScore };
};

const resolveEffectiveReportFinalScore = (
  grade: {
    semester?: Semester | null;
    formatifScore?: number | null;
    sbtsScore?: number | null;
    usScore?: number | null;
    finalScore?: number | null;
    sasScore?: number | null;
    satScore?: number | null;
    slotScores?: unknown;
  } | null | undefined,
): number | null => {
  if (!grade) return null;
  const slotScores = parseSlotScoreMap(grade.slotScores);
  const finalScore = parseScoreNumber(grade.finalScore);
  const usScore = parseScoreNumber(grade.usScore);
  const hasUsEvidence = hasUsSlotScore(slotScores) || usScore !== null;

  if (usScore !== null && hasUsEvidence) {
    return normalizeRoundedFinalScore(usScore) ?? usScore;
  }

  const formativeScore =
    readSlotOrLegacyScore(
      slotScores,
      buildFormativeReferenceSlotCode('FORMATIF', 'FINAL'),
      null,
    ) ??
    readSlotScoreByMatcher(slotScores, isFormativeAliasCode) ??
    parseScoreNumber(grade.formatifScore);
  const midtermScore =
    readSlotScoreByMatcher(slotScores, isMidtermAliasCode) ??
    parseScoreNumber(grade.sbtsScore);
  const finalComponent = resolvePreferredFinalComponentScore(grade);
  const hasAnyFinalComputationEvidence =
    formativeScore !== null ||
    midtermScore !== null ||
    finalComponent.score !== null;

  if (hasAnyFinalComputationEvidence) {
    const recomputedScore = computeFixedWeightedAverage([
      { code: 'FORMATIF', score: formativeScore },
      { code: 'SBTS', score: midtermScore },
      { code: finalComponent.slotCode, score: finalComponent.score },
    ]);
    if (recomputedScore !== null) {
      return normalizeRoundedFinalScore(recomputedScore) ?? recomputedScore;
    }
  }
  if (finalScore !== null) {
    return normalizeRoundedFinalScore(finalScore) ?? finalScore;
  }
  return null;
};

const readSlotOrLegacyScore = (
  slotScores: Record<string, number | null>,
  slotCode: string | null | undefined,
  legacyValue: number | null | undefined,
): number | null => {
  const normalizedSlotCode = normalizeLedgerCode(slotCode);
  if (
    normalizedSlotCode &&
    Object.prototype.hasOwnProperty.call(slotScores, normalizedSlotCode)
  ) {
    return slotScores[normalizedSlotCode] ?? null;
  }
  return legacyValue ?? null;
};

const buildFormativeReferenceSlotCode = (formativeSlotCode: string | null | undefined, stage: 'MIDTERM' | 'FINAL') => {
  const normalized = normalizeLedgerCode(formativeSlotCode);
  const suffix = stage === 'MIDTERM' ? 'SBTS_REF' : 'FINAL_REF';
  return normalized ? `${normalized}_${suffix}` : suffix;
};

const sanitizeLegacyFormativeSeries = (rawValues: unknown[], _storedScore?: unknown): number[] => {
  const values = rawValues
    .filter((item) => item !== null && item !== undefined && item !== '')
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));

  if (values.length === 0) return [];
  if (values.every((value) => value === 0)) return [];

  const trimmedTrailingPadding = (() => {
    let lastNonZeroIndex = -1;
    values.forEach((value, index) => {
      if (value !== 0) lastNonZeroIndex = index;
    });
    if (lastNonZeroIndex < 0) return [];
    return values.slice(0, lastNonZeroIndex + 1);
  })();

  if (
    trimmedTrailingPadding.length > 0 &&
    trimmedTrailingPadding.length < values.length
  ) {
    return trimmedTrailingPadding;
  }

  return values;
};

const resolveLegacyFinalScore = (
  reportScore: ReportScoreCarrier | null | undefined,
  finalSlotCode: string | null | undefined,
): number | null => {
  const normalizedFinalSlot = canonicalizeReportSlotAlias(finalSlotCode);
  if (normalizedFinalSlot === 'SAT') {
    if (reportScore?.satScore !== null && reportScore?.satScore !== undefined) {
      return reportScore.satScore;
    }
    return reportScore?.sasScore ?? null;
  }
  if (reportScore?.sasScore !== null && reportScore?.sasScore !== undefined) {
    return reportScore.sasScore;
  }
  return reportScore?.satScore ?? null;
};

const isMidtermAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  if (['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(normalized)) return true;
  return normalized.includes('MIDTERM');
};

const isFormativeAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  return normalized === 'FORMATIF' || normalized === 'FORMATIVE' || normalized.startsWith('NF');
};

const isFinalAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  if (['SAS', 'SAT', 'FINAL', 'PAS', 'PAT', 'PSAS', 'PSAT'].includes(normalized)) return true;
  return normalized.includes('FINAL');
};

const isFinalEvenAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(normalized)) return true;
  return normalized.includes('FINAL_EVEN');
};

const isFinalOddAliasCode = (raw: unknown): boolean => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(normalized)) return true;
  return normalized.includes('FINAL_ODD');
};

const inferExamTypeFromAlias = (raw: unknown): ExamType | null => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized) return null;
  if ((Object.values(ExamType) as string[]).includes(normalized)) return normalized as ExamType;
  if (isFormativeAliasCode(normalized)) return ExamType.FORMATIF;
  if (isMidtermAliasCode(normalized)) return ExamType.SBTS;
  if (isFinalEvenAliasCode(normalized)) return ExamType.SAT;
  if (isFinalOddAliasCode(normalized)) return ExamType.SAS;
  if (isFinalAliasCode(normalized)) return ExamType.SAS;
  return null;
};

const inferMidtermByReportType = (raw: unknown): boolean => {
  return isMidtermAliasCode(raw);
};

const resolveMidtermMode = (
  programComponentType: string | null | undefined,
  reportSlotCode: string | null | undefined,
  reportTypeFallback: unknown,
): boolean => {
  const normalizedComponentType = normalizeLedgerCode(programComponentType);
  if (isMidtermAliasCode(normalizedComponentType)) return true;
  if (isFinalAliasCode(normalizedComponentType)) return false;

  const normalizedSlotCode = normalizeLedgerCode(reportSlotCode);
  if (isMidtermAliasCode(normalizedSlotCode)) return true;
  if (isFinalAliasCode(normalizedSlotCode)) return false;

  return inferMidtermByReportType(reportTypeFallback);
};

type ExtracurricularScoreCarrier = {
  grade?: string | null;
  description?: string | null;
  gradeSbtsOdd?: string | null;
  descSbtsOdd?: string | null;
  gradeSas?: string | null;
  descSas?: string | null;
  gradeSbtsEven?: string | null;
  descSbtsEven?: string | null;
  gradeSat?: string | null;
  descSat?: string | null;
};

type ExtracurricularFieldPair = {
  gradeField: keyof ExtracurricularScoreCarrier;
  descriptionField: keyof ExtracurricularScoreCarrier;
};

type ExtracurricularReportContext = {
  reportSlotCode?: string | null;
  programComponentType?: string | null;
  fixedSemester?: Semester | null;
};

type OrganizationReportRow = {
  sourceType: 'OSIS';
  name: string;
  positionName: string | null;
  divisionName: string | null;
  grade: string;
  description: string;
};

type ResolvedReportProgramContext = {
  reportSlotCode: string;
  programComponentType: string;
  fixedSemester: Semester | null;
  programCode: string | null;
  programLabel: string | null;
};

type ProgramReportAliasSource = {
  baseType?: ExamType | string | null;
  baseTypeCode?: string | null;
  gradeComponentType?: GradeComponentType | string | null;
  gradeComponentTypeCode?: string | null;
  fixedSemester?: Semester | null;
};

type ExamGradeComponentLite = {
  code: string;
  type: GradeComponentType | string;
  reportSlot: string | null;
  reportSlotCode: string | null;
  entryMode?: string | null;
  entryModeCode?: string | null;
};

const isFormativeComponentLike = (component: ExamGradeComponentLite): boolean => {
  const typeCode = normalizeLedgerCode(component.type);
  if (isFormativeAliasCode(typeCode)) return true;
  const entryModeCode = normalizeLedgerCode(component.entryModeCode || component.entryMode);
  if (entryModeCode === 'NF_SERIES') return true;
  const componentCode = normalizeLedgerCode(component.code);
  return isFormativeAliasCode(componentCode);
};

const isMidtermComponentLike = (component: ExamGradeComponentLite): boolean => {
  const typeCode = normalizeLedgerCode(component.type);
  if (isMidtermAliasCode(typeCode)) return true;
  const slotCode = normalizeLedgerCode(component.reportSlotCode || component.reportSlot);
  if (isMidtermAliasCode(slotCode)) return true;
  const componentCode = normalizeLedgerCode(component.code);
  return isMidtermAliasCode(componentCode);
};

const isFinalComponentLike = (component: ExamGradeComponentLite): boolean => {
  const typeCode = normalizeLedgerCode(component.type);
  if (isFinalAliasCode(typeCode)) return true;
  const slotCode = normalizeLedgerCode(component.reportSlotCode || component.reportSlot);
  if (isFinalAliasCode(slotCode)) return true;
  const componentCode = normalizeLedgerCode(component.code);
  return isFinalAliasCode(componentCode);
};

const canonicalizeReportSlotAlias = (raw: unknown, fixedSemester?: Semester | null): string => {
  const normalized = normalizeLedgerCode(raw);
  if (!normalized || normalized === 'NONE') return '';
  if (isMidtermAliasCode(normalized)) return 'SBTS';
  if (isFinalEvenAliasCode(normalized)) return 'SAT';
  if (isFinalOddAliasCode(normalized)) return 'SAS';
  if (isFinalAliasCode(normalized)) {
    return fixedSemester === Semester.EVEN ? 'SAT' : 'SAS';
  }
  return normalized;
};

const pickReportComponentLike = <T extends ExamGradeComponentLite>(
  components: T[],
  matcher: (component: T) => boolean,
  resolveSlotCode: (component?: T | null, fallback?: string) => string,
  fallbackSlot?: string,
): T | null => {
  const withSlot =
    components.find(
      (item) => matcher(item) && resolveSlotCode(item, fallbackSlot) !== 'NONE',
    ) || null;
  if (withSlot) return withSlot;
  return components.find((item) => matcher(item)) || null;
};

const pickPreferredFinalComponent = <T extends ExamGradeComponentLite>(
  components: T[],
  resolveSlotCode: (component?: T | null, fallback?: string) => string,
  preferredSlot?: string | null,
): T | null => {
  const normalizedPreferredSlot = normalizeLedgerCode(preferredSlot);
  if (normalizedPreferredSlot && normalizedPreferredSlot !== 'NONE') {
    const exactMatch =
      components.find(
        (item) =>
          isFinalComponentLike(item) &&
          normalizeLedgerCode(resolveSlotCode(item, normalizedPreferredSlot)) === normalizedPreferredSlot,
      ) || null;
    if (exactMatch) return exactMatch;
  }

  return pickReportComponentLike(
    components,
    isFinalComponentLike,
    resolveSlotCode,
    normalizedPreferredSlot || undefined,
  );
};

const resolveCoreReportComponents = <T extends ExamGradeComponentLite>(
  components: T[],
  resolveSlotCode: (component?: T | null, fallback?: string) => string,
  resolvedReportSlotCode?: string | null,
): { formativeComponent: T | null; midtermComponent: T | null; finalComponent: T | null } => {
  const normalizedResolvedSlot = normalizeLedgerCode(resolvedReportSlotCode);
  const firstFormativeSlot =
    components
      .map((component) => resolveSlotCode(component))
      .find((slotCode, index) => slotCode !== 'NONE' && isFormativeComponentLike(components[index])) || '';
  const formativeFallbackSlot = normalizedResolvedSlot || firstFormativeSlot || 'FORMATIF';
  const finalFallbackSlot = normalizedResolvedSlot || undefined;

  const formativeComponent = pickReportComponentLike(
    components,
    isFormativeComponentLike,
    resolveSlotCode,
    formativeFallbackSlot,
  );
  const midtermComponent = pickReportComponentLike(
    components,
    isMidtermComponentLike,
    resolveSlotCode,
  );
  const finalComponent = pickPreferredFinalComponent(
    components,
    resolveSlotCode,
    finalFallbackSlot,
  );

  return { formativeComponent, midtermComponent, finalComponent };
};

const isSubjectAllowedForReportContext = (params: {
  subjectId: number;
  subjectCategoryCode: string | null | undefined;
  allowedSubjectIds: Set<number>;
  reportSlotCode: string | null | undefined;
  programComponentType: string | null | undefined;
}): boolean => {
  if (params.allowedSubjectIds.size > 0 && !params.allowedSubjectIds.has(Number(params.subjectId))) {
    return false;
  }

  const normalizedReportSlotCode = normalizeLedgerCode(params.reportSlotCode);
  const normalizedProgramComponentType = normalizeLedgerCode(params.programComponentType);
  const isUsTheoryContext =
    isUsAliasCode(normalizedReportSlotCode) || normalizedProgramComponentType === 'US_THEORY';

  if (!isUsTheoryContext && String(params.subjectCategoryCode || '').trim().toUpperCase() === 'TEORI_KEJURUAN') {
    return false;
  }

  return true;
};

const buildProgramReportAliases = (program: ProgramReportAliasSource): string[] => {
  const aliases = new Set<string>();
  const addAlias = (value: unknown) => {
    const normalized = normalizeLedgerCode(value);
    if (!normalized || normalized === 'NONE') return;
    aliases.add(normalized);
  };

  addAlias(program.baseTypeCode);
  addAlias(program.baseType);

  const componentType = normalizeLedgerCode(
    program.gradeComponentTypeCode || program.gradeComponentType,
  );
  if (isMidtermAliasCode(componentType)) {
    addAlias('MIDTERM');
    addAlias('SBTS');
  }
  if (isFinalAliasCode(componentType)) {
    addAlias('FINAL');
    if (program.fixedSemester === Semester.EVEN) {
      addAlias('SAT');
      addAlias('FINAL_EVEN');
    } else if (program.fixedSemester === Semester.ODD) {
      addAlias('SAS');
      addAlias('FINAL_ODD');
    } else {
      addAlias('SAS');
      addAlias('SAT');
      addAlias('FINAL_ODD');
      addAlias('FINAL_EVEN');
    }
  }

  return Array.from(aliases);
};

const isProgramMatchReportType = (
  program: ProgramReportAliasSource,
  reportType: unknown,
): boolean => {
  const normalizedReportType = normalizeLedgerCode(reportType);
  if (!normalizedReportType) return false;
  return buildProgramReportAliases(program).includes(normalizedReportType);
};

const inferReportSlotFromProgramContext = (params: {
  programComponentType?: string | null;
  fixedSemester?: Semester | null;
  baseTypeCode?: string | null;
  baseType?: ExamType | string | null;
}): string => {
  const baseTypeCode =
    canonicalizeReportSlotAlias(params.baseTypeCode, params.fixedSemester) ||
    canonicalizeReportSlotAlias(params.baseType, params.fixedSemester);
  if (baseTypeCode && baseTypeCode !== 'NONE') return baseTypeCode;

  const componentType = normalizeLedgerCode(params.programComponentType);
  if (isMidtermAliasCode(componentType)) return 'SBTS';
  if (isFinalAliasCode(componentType)) {
    if (params.fixedSemester === Semester.EVEN) return 'SAT';
    if (params.fixedSemester === Semester.ODD) return 'SAS';
    return 'SAS';
  }
  return 'NONE';
};

const resolveFinalSlotByFallback = (params: {
  inferredSlot: string;
  fallbackSlot: string;
  fixedSemester?: Semester | null;
}): string => {
  const normalizedInferred = canonicalizeReportSlotAlias(params.inferredSlot, params.fixedSemester);
  if (!normalizedInferred) return '';
  if (params.fixedSemester || !isFinalAliasCode(normalizedInferred)) return normalizedInferred;
  const normalizedFallback = canonicalizeReportSlotAlias(params.fallbackSlot, params.fixedSemester);
  if (normalizedFallback && isFinalAliasCode(normalizedFallback)) {
    return normalizedFallback;
  }
  return normalizedInferred;
};

const EXTRACURRICULAR_FIELDS_BY_SLOT: Record<'ODD' | 'EVEN', Record<string, ExtracurricularFieldPair>> = {
  ODD: {
    SBTS: { gradeField: 'gradeSbtsOdd', descriptionField: 'descSbtsOdd' },
    SAS: { gradeField: 'gradeSas', descriptionField: 'descSas' },
    SAT: { gradeField: 'gradeSat', descriptionField: 'descSat' },
  },
  EVEN: {
    SBTS: { gradeField: 'gradeSbtsEven', descriptionField: 'descSbtsEven' },
    SAS: { gradeField: 'gradeSas', descriptionField: 'descSas' },
    SAT: { gradeField: 'gradeSat', descriptionField: 'descSat' },
  },
};

const resolveExtracurricularFields = (
  semester: Semester,
  context: ExtracurricularReportContext,
): ExtracurricularFieldPair | null => {
  const normalizedSemester = semester === Semester.EVEN ? 'EVEN' : 'ODD';
  const normalizedSlot = canonicalizeReportSlotAlias(
    context.reportSlotCode,
    context.fixedSemester || semester,
  );
  if (normalizedSlot) {
    const bySlot = EXTRACURRICULAR_FIELDS_BY_SLOT[normalizedSemester][normalizedSlot];
    if (bySlot) return bySlot;
  }

  const componentType = normalizeLedgerCode(context.programComponentType);
  if (isMidtermAliasCode(componentType)) {
    return normalizedSemester === 'EVEN'
      ? { gradeField: 'gradeSbtsEven', descriptionField: 'descSbtsEven' }
      : { gradeField: 'gradeSbtsOdd', descriptionField: 'descSbtsOdd' };
  }

  if (isFinalAliasCode(componentType)) {
    const finalSemester = context.fixedSemester || semester;
    const normalizedFinalSemester = finalSemester === Semester.EVEN ? 'EVEN' : 'ODD';
    return normalizedFinalSemester === 'EVEN'
      ? { gradeField: 'gradeSat', descriptionField: 'descSat' }
      : { gradeField: 'gradeSas', descriptionField: 'descSas' };
  }

  return null;
};

const readExtracurricularScore = (
  enrollment: ExtracurricularScoreCarrier,
  semester: Semester,
  context: ExtracurricularReportContext,
): { grade: string | null; description: string | null } => {
  const fields = resolveExtracurricularFields(semester, context);
  if (fields) {
    const grade = enrollment[fields.gradeField];
    const description = enrollment[fields.descriptionField];
    if (grade || description) {
      return { grade: grade || null, description: description || null };
    }
  }
  return {
    grade: enrollment.grade || null,
    description: enrollment.description || null,
  };
};

const buildExtracurricularUpdateData = (
  semester: Semester,
  context: ExtracurricularReportContext,
  grade: string,
  description: string,
): Record<string, string> => {
  const fields = resolveExtracurricularFields(semester, context);
  if (fields) {
    return {
      grade,
      description,
      [fields.gradeField]: grade,
      [fields.descriptionField]: description,
    };
  }
  return { grade, description };
};

const resolveNonAcademicReportSlot = (
  semester: Semester,
  context: ExtracurricularReportContext,
): string => {
  const normalizedSlot = canonicalizeReportSlotAlias(
    context.reportSlotCode,
    context.fixedSemester || semester,
  );
  if (normalizedSlot) return normalizedSlot;

  const inferredSlot = inferReportSlotFromProgramContext({
    programComponentType: context.programComponentType,
    fixedSemester: context.fixedSemester || semester,
    baseTypeCode: context.reportSlotCode,
  });

  return canonicalizeReportSlotAlias(inferredSlot, context.fixedSemester || semester) || '';
};

interface ReportSignature {
  title: string;
  name: string;
  nip?: string;
  date?: string;
  place?: string;
}

type ReportProgramContextSource = {
  code?: string | null;
  displayLabel?: string | null;
  shortLabel?: string | null;
  gradeComponentCode?: string | null;
  gradeComponentType?: GradeComponentType | string | null;
  gradeComponentTypeCode?: string | null;
  baseType?: ExamType | string | null;
  baseTypeCode?: string | null;
  fixedSemester?: Semester | null;
};

export class ReportService {
  private async buildReportProgramContext(
    academicYearId: number,
    fallback: string,
    program: ReportProgramContextSource | null,
  ): Promise<ResolvedReportProgramContext> {
    if (!program) {
      return {
        reportSlotCode: fallback,
        programComponentType: '',
        fixedSemester: null,
        programCode: null,
        programLabel: null,
      };
    }

    const programCode = normalizeLedgerCode(program.code) || null;
    const programLabel =
      String(program.displayLabel || program.shortLabel || program.code || '').trim() || null;
    const componentCode = normalizeLedgerCode(program.gradeComponentCode);
    const programComponentType = normalizeLedgerCode(
      program.gradeComponentTypeCode || program.gradeComponentType,
    );
    if (componentCode) {
      const component = await prisma.examGradeComponent.findFirst({
        where: {
          academicYearId,
          code: componentCode,
        },
        select: {
          reportSlot: true,
          reportSlotCode: true,
        },
      });
      const slotFromComponent =
        normalizeLedgerCode(component?.reportSlotCode) || normalizeLedgerCode(component?.reportSlot);
      if (slotFromComponent && slotFromComponent !== 'NONE') {
        return {
          reportSlotCode: slotFromComponent,
          programComponentType,
          fixedSemester: program.fixedSemester || null,
          programCode,
          programLabel,
        };
      }
    }

    const inferredSlot = inferReportSlotFromProgramContext({
      programComponentType,
      fixedSemester: program.fixedSemester || null,
      baseTypeCode: program.baseTypeCode,
      baseType: program.baseType,
    });
    const preferredInferredSlot = resolveFinalSlotByFallback({
      inferredSlot,
      fallbackSlot: fallback,
      fixedSemester: program.fixedSemester || null,
    });
    const reportSlotCode =
      preferredInferredSlot && preferredInferredSlot !== 'NONE' ? preferredInferredSlot : fallback;
    return {
      reportSlotCode,
      programComponentType,
      fixedSemester: program.fixedSemester || null,
      programCode,
      programLabel,
    };
  }

  private async resolveReportProgramContext(
    academicYearId: number,
    reportType: ExamType,
    reportProgramCode?: string | null,
  ): Promise<ResolvedReportProgramContext> {
    const fallback = normalizeLedgerCode(reportType) || 'NONE';
    const mappedFallbackType = inferExamTypeFromAlias(fallback);
    const normalizedProgramCode = normalizeLedgerCode(reportProgramCode);
    const programSelect = {
      code: true,
      displayLabel: true,
      shortLabel: true,
      gradeComponentCode: true,
      gradeComponentType: true,
      gradeComponentTypeCode: true,
      baseType: true,
      baseTypeCode: true,
      fixedSemester: true,
    } satisfies Prisma.ExamProgramConfigSelect;

    const programByCode = normalizedProgramCode
      ? await prisma.examProgramConfig.findFirst({
          where: {
            academicYearId,
            code: normalizedProgramCode,
          },
          select: programSelect,
        })
      : null;

    if (programByCode) {
      return this.buildReportProgramContext(academicYearId, fallback, programByCode);
    }

    const semesterScopedFilter =
      reportType === ExamType.SAT
        ? [{ fixedSemester: null }, { fixedSemester: Semester.EVEN }]
        : reportType === ExamType.SAS
          ? [{ fixedSemester: null }, { fixedSemester: Semester.ODD }]
          : null;

    const aliasFilter: Prisma.ExamProgramConfigWhereInput = {
      OR: [
        { baseTypeCode: fallback },
        { code: fallback },
        ...(mappedFallbackType ? [{ baseType: mappedFallbackType }] : []),
      ],
    };

    const programByType =
      fallback && fallback !== 'NONE'
        ? await prisma.examProgramConfig.findFirst({
            where: {
              academicYearId,
              isActive: true,
              ...(semesterScopedFilter
                ? {
                    AND: [{ OR: semesterScopedFilter }, aliasFilter],
                  }
                : aliasFilter),
            },
            orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
            select: programSelect,
          })
        : null;

    return this.buildReportProgramContext(academicYearId, fallback, programByType);
  }

  async getStudentReport(
    studentId: number,
    academicYearId: number,
    semester: Semester,
    type: ExamType,
    reportProgramCode?: string | null,
  ) {
    // 1. Fetch Student Info using historical membership when available.
    const student = await getHistoricalStudentSnapshot(studentId, academicYearId);

    if (!student || !student.studentClass) {
      throw new ApiError(404, 'Siswa atau kelas tidak ditemukan');
    }

    const classData = student.studentClass;
    const waliKelas = classData.teacher;
    const parent = student.guardianName || (student.fatherName ?? student.motherName ?? '.......................');

    // 2. Fetch Report Date/Config
    const reportDate = await prisma.reportDate.findUnique({
      where: {
        academicYearId_semester_reportType: {
          academicYearId,
          semester,
          reportType: type,
        },
      },
    });
    const reportProgramContext = await this.resolveReportProgramContext(
      academicYearId,
      type,
      reportProgramCode,
    );
    const resolvedReportSlotCode = reportProgramContext.reportSlotCode;

    // 3. Fetch subject grades and report-grade snapshots for selected report context.
    // We need all subjects assigned to this class
    const teacherAssignments = await prisma.teacherAssignment.findMany({
      where: {
        classId: classData.id,
        academicYearId,
      },
      include: {
        subject: {
          include: {
            category: true,
          },
        },
        teacher: true, // Subject Teacher
      },
      orderBy: {
        subject: {
          code: 'asc',
        },
      },
    });

    // Fetch Student Grades (Formatif NF1-NF6)
    const studentGrades = await prisma.studentGrade.findMany({
      where: {
        studentId,
        academicYearId,
        semester,
      },
    });

    // Fetch report-grade rows (slot-based values + legacy fallback columns)
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId,
        academicYearId,
        semester,
      },
    });

    const [examGradeComponents, examPrograms] = await Promise.all([
      prisma.examGradeComponent.findMany({
        where: {
          academicYearId,
          isActive: true,
        },
        select: {
          code: true,
          label: true,
          type: true,
          reportSlot: true,
          reportSlotCode: true,
          displayOrder: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.examProgramConfig.findMany({
        where: {
          academicYearId,
          isActive: true,
        },
        select: {
          code: true,
          displayLabel: true,
          shortLabel: true,
          baseType: true,
          baseTypeCode: true,
          gradeComponentType: true,
          gradeComponentTypeCode: true,
          fixedSemester: true,
          allowedSubjectIds: true,
          displayOrder: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
    ]);

    const resolveSlotCode = (component?: (typeof examGradeComponents)[number] | null, fallback?: string) => {
      const normalized =
        normalizeLedgerCode(component?.reportSlotCode) ||
        normalizeLedgerCode(component?.reportSlot) ||
        normalizeLedgerCode(fallback);
      return normalized || normalizeLedgerCode(fallback) || 'NONE';
    };

    const { formativeComponent, midtermComponent, finalComponent } = resolveCoreReportComponents(
      examGradeComponents,
      resolveSlotCode,
      resolvedReportSlotCode,
    );

    const normalizedReportType = normalizeLedgerCode(type);
    const normalizedReportProgramCode =
      normalizeLedgerCode(reportProgramCode) || normalizeLedgerCode(reportProgramContext.programCode);
    const activeProgram =
      (normalizedReportProgramCode
        ? examPrograms.find((item) => normalizeLedgerCode(item.code) === normalizedReportProgramCode)
        : null) ??
      examPrograms.find((item) => isProgramMatchReportType(item, normalizedReportType)) ??
      null;
    const activeProgramComponentType =
      normalizeLedgerCode(activeProgram?.gradeComponentTypeCode || activeProgram?.gradeComponentType) ||
      reportProgramContext.programComponentType;
    const activeProgramAllowedSubjectIds = new Set(
      Array.isArray(activeProgram?.allowedSubjectIds)
        ? activeProgram.allowedSubjectIds
            .map((subjectId) => Number(subjectId))
            .filter((subjectId) => Number.isFinite(subjectId) && subjectId > 0)
        : [],
    );
    const isMidtermReport = resolveMidtermMode(
      activeProgramComponentType,
      resolvedReportSlotCode,
      type,
    );
    const responseComponentType =
      normalizeLedgerCode(activeProgramComponentType) || (isMidtermReport ? 'MIDTERM' : 'FINAL');
    const responseComponentMode = isMidtermReport ? 'MIDTERM' : 'FINAL';
    const isUsReport = isUsAliasCode(type) || isUsAliasCode(resolvedReportSlotCode) || isUsAliasCode(activeProgramComponentType);
    const defaultPrimarySlot = resolveSlotCode(
      formativeComponent || examGradeComponents[0] || null,
      resolvedReportSlotCode || 'FORMATIF',
    );
    const formativeSlotCode = resolveSlotCode(formativeComponent, defaultPrimarySlot);
    const midtermSlotCode = resolveSlotCode(midtermComponent);
    const finalSlotCode = resolveSlotCode(
      finalComponent,
      isMidtermReport ? undefined : resolvedReportSlotCode,
    );
    const col1Label =
      isMidtermReport ? String(formativeComponent?.label || 'Komponen 1').trim() : 'Nilai Akhir';
    const col2Label =
      isMidtermReport
        ? String(
            midtermComponent?.label ||
              reportProgramContext.programLabel ||
              activeProgram?.displayLabel ||
              activeProgram?.shortLabel ||
              'Komponen 2',
          ).trim()
        : 'Capaian Kompetensi';
    const scopedTeacherAssignments = teacherAssignments.filter((assignment) =>
      isSubjectAllowedForReportContext({
        subjectId: Number(assignment.subjectId),
        subjectCategoryCode: assignment.subject?.category?.code || null,
        allowedSubjectIds: activeProgramAllowedSubjectIds,
        reportSlotCode: resolvedReportSlotCode,
        programComponentType: activeProgramComponentType,
      }),
    );

    // Fetch non-academic activities
    const nonAcademicReportSlot = resolveNonAcademicReportSlot(semester, {
      reportSlotCode: resolvedReportSlotCode,
      programComponentType: activeProgramComponentType,
      fixedSemester: activeProgram?.fixedSemester || reportProgramContext.fixedSemester,
    });

    const [enrollments, osisMemberships] = await Promise.all([
      prisma.ekstrakurikulerEnrollment.findMany({
        where: {
          studentId,
          academicYearId,
        },
        include: {
          ekskul: true,
        },
      }),
      prisma.osisMembership.findMany({
        where: {
          studentId,
          period: {
            academicYearId,
          },
        },
        include: {
          division: {
            select: {
              id: true,
              name: true,
            },
          },
          position: {
            select: {
              id: true,
              name: true,
              division: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assessments: {
            where: nonAcademicReportSlot
              ? {
                  academicYearId,
                  semester,
                  reportSlot: nonAcademicReportSlot,
                }
              : {
                  id: -1,
                },
            orderBy: [{ gradedAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
      }),
    ]);

    const extracurriculars = enrollments
      .map((e) => {
        const score = readExtracurricularScore(
          e as unknown as ExtracurricularScoreCarrier,
          semester,
          {
            reportSlotCode: resolvedReportSlotCode,
            programComponentType: activeProgramComponentType,
            fixedSemester: activeProgram?.fixedSemester || reportProgramContext.fixedSemester,
          },
        );
        return {
          name: e.ekskul?.name || '',
          grade: score.grade || '-',
          description: score.description || '-',
        };
      })
      .filter((e) => e.grade !== '-' || e.description !== '-');

    const organizations: OrganizationReportRow[] = osisMemberships
      .map((membership) => {
        const assessment = membership.assessments?.[0] || null;
        const divisionName =
          membership.division?.name || membership.position?.division?.name || null;

        return {
          sourceType: 'OSIS' as const,
          name: 'OSIS',
          positionName: membership.position?.name || null,
          divisionName,
          grade: assessment?.grade || '-',
          description: assessment?.description || '-',
        };
      })
      .filter((row) => row.grade !== '-' || row.description !== '-');

    // 4. Map Data
    const groups: Record<string, any[]> = {
      'A': [],
      'B': [],
      'C': [],
    };

    // Helper buckets
    const bucketA: any[] = [];
    const bucketC: any[] = [];
    const bucketB_Kejuruan: any[] = [];
    const bucketB_Kompetensi: any[] = [];
    const bucketB_Pilihan: any[] = [];

    scopedTeacherAssignments.forEach((assignment) => {
      const subject = assignment.subject;
      const grade = studentGrades.find((g) => g.subjectId === subject.id);
      const report = reportGrades.find((r) => r.subjectId === subject.id);
      const reportScore = report as unknown as ReportScoreCarrier;
      const kkm = assignment.kkm || 75;
      const slotScores = parseSlotScoreMap((report as any)?.slotScores);

      let col1Score: number | null = null;
      let col1Predicate: string | null = null;
      let col2Score: number | null = null;
      let col2Predicate: string | null = null;
      let finalScoreVal: number | null = null;
      let finalPredicateVal: string | null = null;
      let description: string = '-';

      const getPredicate = (score: number, kkmVal: number) => {
          if (score >= 86) return 'A';
          if (score >= kkmVal) return 'B';
          if (score >= 60) return 'C';
          return 'D';
      };

      if (isMidtermReport) {
        // MIDTERM-like report: component-1 (formatif aggregate) + exam component.
        
        const nfs = sanitizeLegacyFormativeSeries(
          [grade?.nf1, grade?.nf2, grade?.nf3, grade?.nf4, grade?.nf5, grade?.nf6],
          grade?.score ?? reportScore?.formatifScore ?? null,
        );
        const fallbackFormative = nfs.length > 0 ? nfs.reduce((a, b) => a + b, 0) / nfs.length : 0;
        const formativeMidtermReference = readSlotOrLegacyScore(
          slotScores,
          buildFormativeReferenceSlotCode(formativeSlotCode, 'MIDTERM'),
          null,
        );
        let formatifAvg =
          formativeMidtermReference ??
          readSlotOrLegacyScore(slotScores, formativeSlotCode, reportScore?.formatifScore) ??
          fallbackFormative;
        const sbtsScore =
          readSlotOrLegacyScore(slotScores, midtermSlotCode, reportScore?.sbtsScore) ?? 0;
        const normalizedSbtsScore =
          sbtsScore > 0 ? normalizeRoundedFinalScore(sbtsScore) ?? sbtsScore : null;

        // Fallback calculation if reportGrade is not synced yet (though syncReportGrade should handle it)
        if (!report) {
            formatifAvg = fallbackFormative;
        }

        // Final score for midterm report follows the active component weighting,
        // normalized against whichever slots are already available.
        const finalScore =
          computeNormalizedWeightedAverage([
            { code: formativeSlotCode, score: formatifAvg },
            { code: midtermSlotCode, score: sbtsScore },
          ]) ?? 0;

        col1Score = formatifAvg > 0 ? Math.round(formatifAvg) : null;
        col1Predicate = formatifAvg > 0 ? getPredicate(formatifAvg, kkm) : null;
        
        col2Score = normalizedSbtsScore;
        col2Predicate = normalizedSbtsScore !== null ? getPredicate(normalizedSbtsScore, kkm) : null;

        finalScoreVal =
          finalScore > 0
            ? normalizeRoundedFinalScore(finalScore)
            : null;
        finalPredicateVal = finalScore > 0 ? getPredicate(finalScore, kkm) : null;
        
        // Midterm report keeps KET empty.
        description = '';

      } else {
        // FINAL-like report: column-1 final score, column-2 competency narrative.

        const effectiveFinalScore = resolveEffectiveReportFinalScore(report as any);

        col1Score =
          effectiveFinalScore !== null
            ? normalizeRoundedFinalScore(effectiveFinalScore)
            : null;
        col1Predicate = effectiveFinalScore !== null
          ? getPredicate(effectiveFinalScore, kkm)
          : null;
        finalScoreVal = col1Score;
        finalPredicateVal = col1Predicate;

        col2Score = null;
        col2Predicate = effectiveFinalScore !== null ? report?.predicate ?? null : null;
        description = effectiveFinalScore !== null ? report?.description || '-' : '-';
      }

      const item = {
        id: subject.id,
        name: subject.name,
        kkm: kkm,
        // Generic mapping based on type
        col1: {
          score: col1Score,
          predicate: col1Predicate,
        },
        col2: {
          score: col2Score,
          predicate: col2Predicate,
          description: description
        },
        final: {
          score: finalScoreVal,
          predicate: finalPredicateVal,
        },
        // Backward compatibility aliases for existing UI consumers
        formatif: {
          score: col1Score,
          predicate: col1Predicate,
        },
        sbts: {
          score: col2Score,
          predicate: col2Predicate,
        },
        teacherName: assignment.teacher.name,
        description: description,
        slotScores,
      };

      const catCode = subject.category?.code;
      if (catCode === 'UMUM') bucketA.push(item);
      else if (catCode === 'MUATAN_LOKAL') bucketC.push(item);
      else if (catCode === 'KOMPETENSI_KEAHLIAN') bucketB_Kompetensi.push(item);
      else if (catCode === 'PILIHAN') bucketB_Pilihan.push(item);
      else bucketB_Kejuruan.push(item);
    });

    // Numbering & Assembly
    bucketA.forEach((item, i) => (item as any).no = i + 1);
    bucketC.forEach((item, i) => (item as any).no = i + 1);

    let bCounter = 1;
    bucketB_Kejuruan.forEach((item) => (item as any).no = bCounter++);

    const finalB = [...bucketB_Kejuruan];

    if (bucketB_Kompetensi.length > 0) {
      finalB.push({ 
        name: 'Mata Pelajaran Kompetensi Keahlian:', 
        isHeader: true, 
        no: bCounter++,
        rowCount: bucketB_Kompetensi.length
      });
      bucketB_Kompetensi.forEach((item, i) => {
         item.name = `${String.fromCharCode(65 + i)}. ${item.name}`;
         (item as any).no = '';
         (item as any).skipNoColumn = true;
      }); 
      finalB.push(...bucketB_Kompetensi);
    }

    if (bucketB_Pilihan.length > 0) {
      finalB.push({ 
        name: 'Mata Pelajaran Pilihan:', 
        isHeader: true, 
        no: bCounter++,
        rowCount: bucketB_Pilihan.length
      });
      bucketB_Pilihan.forEach((item, i) => {
         item.name = `${String.fromCharCode(65 + i)}. ${item.name}`;
         (item as any).no = '';
         (item as any).skipNoColumn = true;
      });
      finalB.push(...bucketB_Pilihan);
    }

    groups['A'] = bucketA;
    groups['B'] = finalB;
    groups['C'] = bucketC;

    const academicYearObj = await prisma.academicYear.findUnique({
        where: { id: academicYearId },
    });

    // Fetch Principal
    const principal = await prisma.user.findFirst({
      where: { role: 'PRINCIPAL' }
    });

    const achievementYear = academicYearObj
      ? parseInt(String(academicYearObj.name || '').split('/')[0], 10)
      : new Date().getFullYear();

    // Fetch Achievements (Prestasi) from StudentBehavior (POSITIVE) and StudentAchievement
    const behaviors = await prisma.studentBehavior.findMany({
      where: {
        studentId,
        academicYearId,
        type: 'POSITIVE'
      }
    });

    const studentAchievements = await prisma.studentAchievement.findMany({
      where: {
        studentId,
        year: achievementYear,
      },
      orderBy: [{ year: 'desc' }, { id: 'desc' }],
    });

    const achievements = [
      ...studentAchievements.map((item) => ({
        name: item.name,
        description:
          [
            item.rank ? `Juara ${item.rank}` : null,
            item.level ? `Tingkat ${item.level}` : null,
            item.year ? `(${item.year})` : null,
          ]
            .filter(Boolean)
            .join(' • ') || '-',
        rank: item.rank,
        level: item.level,
        year: item.year,
      })),
      ...behaviors.map((b) => ({
        name: b.description,
        description: b.category || '-',
      })),
    ].filter((item, index, rows) => {
      const key = `${String(item.name || '').trim().toLowerCase()}::${String(item.description || '')
        .trim()
        .toLowerCase()}`;
      return rows.findIndex((candidate) => {
        const candidateKey = `${String(candidate.name || '').trim().toLowerCase()}::${String(
          candidate.description || '',
        )
          .trim()
          .toLowerCase()}`;
        return candidateKey === key;
      }) === index;
    });

    // Fetch Attendance
    let dateFilter = {};
    if (academicYearObj) {
        if (semester === Semester.ODD) {
            dateFilter = {
                gte: academicYearObj.semester1Start,
                lte: academicYearObj.semester1End,
            };
        } else {
            dateFilter = {
                gte: academicYearObj.semester2Start,
                lte: academicYearObj.semester2End,
            };
        }
    }

    const [attendanceStats, dailyPresenceRows, homeroomNote] = await Promise.all([
      prisma.dailyAttendance.groupBy({
        by: ['status'],
        where: {
          studentId,
          academicYearId,
          date: dateFilter
        },
        _count: { status: true }
      }),
      prisma.dailyAttendance.findMany({
        where: {
          studentId,
          academicYearId,
          date: dateFilter,
        },
        select: {
          checkInTime: true,
          checkOutTime: true,
        },
      }),
      prisma.reportNote.findFirst({
        where: {
          studentId,
          academicYearId,
          semester,
          type: 'CATATAN_WALI_KELAS'
        }
      }),
    ]);

    const attSick = attendanceStats.find(a => a.status === 'SICK')?._count.status || 0;
    const attPerm = attendanceStats.find(a => a.status === 'PERMISSION')?._count.status || 0;
    const attAbsent = attendanceStats.find(a => a.status === 'ABSENT')?._count.status || 0;
    const presenceSummary = summarizeDailyPresenceRows(dailyPresenceRows);

    // Determine Fase based on class name
    let fase = '-';
    const cName = classData.name.toUpperCase();
    if (cName.startsWith('X ') || cName.startsWith('10 ') || cName === 'X') fase = 'E';
    else if (cName.startsWith('XI ') || cName.startsWith('11 ') || cName.startsWith('XII ') || cName.startsWith('12 ')) fase = 'F';

    return {
      header: {
        schoolName: 'SMKS KARYA GUNA BHAKTI 2',
        semester: semester === Semester.ODD ? 'Ganjil' : 'Genap',
        academicYear: academicYearObj?.name || '2024/2025',
        studentName: student.name,
        nis: student.nis || '-',
        nisn: student.nisn || '-',
        class: classData.name,
        major: classData.major.name,
        fase: fase,
      },
      body: { 
        groups, 
        extracurriculars,
        organizations,
        achievements,
        attendance: { sick: attSick, permission: attPerm, absent: attAbsent },
        presenceSummary,
        homeroomNote: homeroomNote?.note || '',
        meta: {
          reportType: normalizedReportType,
          reportComponentType: responseComponentType,
          reportComponentMode: responseComponentMode,
          reportProgramCode:
            activeProgram?.code ||
            reportProgramContext.programCode ||
            normalizedReportProgramCode ||
            null,
          reportProgramLabel:
            String(
              activeProgram?.displayLabel ||
                activeProgram?.shortLabel ||
                activeProgram?.code ||
                reportProgramContext.programLabel ||
                reportProgramContext.programCode ||
                '',
            ).trim() || null,
          resolvedReportSlotCode,
          col1Label,
          col2Label,
          formativeSlotCode,
          midtermSlotCode,
          finalSlotCode,
        },
      },
      footer: {
        date: reportDate?.date
          ? new Date(reportDate.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
          : '',
        place: reportDate?.place || 'Bekasi',
        legality: null,
        signatures: {
          homeroom: {
            title: 'Wali Kelas',
            name: waliKelas?.name || '.......................',
            nip: waliKelas?.nip || waliKelas?.nuptk || '-',
          },
          parent: {
            title: 'Orang Tua / Wali',
            name: parent,
          },
          principal: {
            title: 'Kepala Sekolah',
            name: principal?.name || '.......................',
            nip: principal?.nip || '-',
          }
        }
      }
    };
  }

  async getStudentSbtsReport(
    studentId: number,
    academicYearId: number,
    semester: Semester,
    type: ExamType,
    reportProgramCode?: string | null,
  ) {
    return this.getStudentReport(
      studentId,
      academicYearId,
      semester,
      type,
      reportProgramCode,
    );
  }

  async getClassLedger(
    classId: number,
    academicYearId: number,
    semester: Semester,
    reportType: ExamType,
    reportProgramCode?: string | null,
  ) {
    const reportProgramContext = await this.resolveReportProgramContext(
      academicYearId,
      reportType,
      reportProgramCode,
    );
    const resolvedReportSlotCode = reportProgramContext.reportSlotCode;

    // 1. Fetch Class & Students
    const classData = await prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classData) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }

    const classStudents = await listHistoricalStudentsForClass(classId, academicYearId);

    // 2. Fetch Subjects assigned to this class
    const teacherAssignments = await prisma.teacherAssignment.findMany({
      where: {
        classId,
        academicYearId,
      },
      include: {
        subject: {
          include: {
            category: true,
          },
        },
      },
    });

    const categoryOrder: Record<string, number> = {
      'UMUM': 1,
      'KEJURUAN': 2,
      'KOMPETENSI_KEAHLIAN': 3,
      'PILIHAN': 4,
      'MUATAN_LOKAL': 5,
    };

    // 3. Fetch Grades & dynamic exam config for this class context
    const studentIds = classStudents.map(s => s.id);
    
    const [studentGrades, reportGrades, examGradeComponents, examPrograms] = await Promise.all([
      prisma.studentGrade.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId,
          semester,
        },
      }),
      prisma.reportGrade.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId,
          semester,
        },
      }),
      prisma.examGradeComponent.findMany({
        where: {
          academicYearId,
          isActive: true,
        },
        select: {
          code: true,
          label: true,
          type: true,
          reportSlot: true,
          reportSlotCode: true,
          displayOrder: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.examProgramConfig.findMany({
        where: {
          academicYearId,
          isActive: true,
        },
        select: {
          code: true,
          displayLabel: true,
          shortLabel: true,
          baseType: true,
          baseTypeCode: true,
          gradeComponentType: true,
          gradeComponentTypeCode: true,
          fixedSemester: true,
          allowedSubjectIds: true,
          displayOrder: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      }),
    ]);

    const resolveSlotCode = (component?: (typeof examGradeComponents)[number] | null, fallback?: string) => {
      const normalized =
        normalizeLedgerCode(component?.reportSlotCode) ||
        normalizeLedgerCode(component?.reportSlot) ||
        normalizeLedgerCode(fallback);
      return normalized || normalizeLedgerCode(fallback) || 'NONE';
    };

    const { formativeComponent, midtermComponent, finalComponent } = resolveCoreReportComponents(
      examGradeComponents,
      resolveSlotCode,
      resolvedReportSlotCode,
    );

    const normalizedReportType = normalizeLedgerCode(reportType);
    const normalizedReportProgramCode =
      normalizeLedgerCode(reportProgramCode) || normalizeLedgerCode(reportProgramContext.programCode);
    const activeProgram =
      (normalizedReportProgramCode
        ? examPrograms.find((item) => normalizeLedgerCode(item.code) === normalizedReportProgramCode)
        : null) ??
      examPrograms.find((item) => isProgramMatchReportType(item, normalizedReportType)) ??
      null;
    const activeProgramComponentType =
      normalizeLedgerCode(activeProgram?.gradeComponentTypeCode || activeProgram?.gradeComponentType) ||
      reportProgramContext.programComponentType;
    const activeProgramAllowedSubjectIds = new Set(
      Array.isArray(activeProgram?.allowedSubjectIds)
        ? activeProgram.allowedSubjectIds
            .map((subjectId) => Number(subjectId))
            .filter((subjectId) => Number.isFinite(subjectId) && subjectId > 0)
        : [],
    );
    const isMidtermReport = resolveMidtermMode(
      activeProgramComponentType,
      resolvedReportSlotCode,
      reportType,
    );
    const responseComponentType =
      normalizeLedgerCode(activeProgramComponentType) || (isMidtermReport ? 'MIDTERM' : 'FINAL');
    const responseComponentMode = isMidtermReport ? 'MIDTERM' : 'FINAL';
    const isUsReport =
      isUsAliasCode(reportType) ||
      isUsAliasCode(resolvedReportSlotCode) ||
      isUsAliasCode(activeProgramComponentType);
    const defaultPrimarySlot = resolveSlotCode(
      formativeComponent || examGradeComponents[0] || null,
      resolvedReportSlotCode || 'FORMATIF',
    );
    const formativeSlotCode = resolveSlotCode(formativeComponent, defaultPrimarySlot);
    const midtermSlotCode = resolveSlotCode(midtermComponent);
    const finalSlotCode = resolveSlotCode(
      finalComponent,
      isMidtermReport ? undefined : resolvedReportSlotCode,
    );

    const col1Label =
      isMidtermReport
        ? String(formativeComponent?.label || 'Komponen 1').trim()
        : 'Nilai Akhir';
    const col2Label =
      isMidtermReport
        ? String(
            midtermComponent?.label ||
              reportProgramContext.programLabel ||
              activeProgram?.displayLabel ||
              activeProgram?.shortLabel ||
              'Komponen 2',
          ).trim()
        : 'Capaian Kompetensi';
    const scopedTeacherAssignments = teacherAssignments.filter((assignment) =>
      isSubjectAllowedForReportContext({
        subjectId: Number(assignment.subjectId),
        subjectCategoryCode: assignment.subject?.category?.code || null,
        allowedSubjectIds: activeProgramAllowedSubjectIds,
        reportSlotCode: resolvedReportSlotCode,
        programComponentType: activeProgramComponentType,
      }),
    );
    const subjects = scopedTeacherAssignments
      .map((ta) => ta.subject)
      .sort((a, b) => {
        const codeA = a.category?.code || '';
        const codeB = b.category?.code || '';

        const orderA = categoryOrder[codeA] ?? 99;
        const orderB = categoryOrder[codeB] ?? 99;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return a.code.localeCompare(b.code);
      });

    const hasAnyNumericValue = (values: Array<number | null | undefined>) =>
      values.some((value) => value !== null && value !== undefined);

    const hasSlotScoreEvidence = (slotScores: Record<string, number | null>) =>
      Object.values(slotScores).some((value) => value !== null && value !== undefined);

    // 4. Transform data
    const students = classStudents.map(student => {
      const grades: Record<number, any> = {};
      
      subjects.forEach(subject => {
        const sGrade = studentGrades.find(sg => sg.studentId === student.id && sg.subjectId === subject.id);
        const rGrade = reportGrades.find(rg => rg.studentId === student.id && rg.subjectId === subject.id);
        const reportScore = rGrade as unknown as ReportScoreCarrier;
        
        const nfs = sanitizeLegacyFormativeSeries(
          [sGrade?.nf1, sGrade?.nf2, sGrade?.nf3, sGrade?.nf4, sGrade?.nf5, sGrade?.nf6],
          sGrade?.score ?? rGrade?.formatifScore ?? null,
        );
        const formativeFallback = nfs.length > 0 ? nfs.reduce((a, b) => a + b, 0) / nfs.length : null;
        const slotScores = parseSlotScoreMap((rGrade as any)?.slotScores);
        const formativeFinalReference = readSlotOrLegacyScore(
          slotScores,
          buildFormativeReferenceSlotCode(formativeSlotCode, 'FINAL'),
          null,
        );
        const formatifAvg =
          formativeFinalReference ??
          readSlotOrLegacyScore(slotScores, formativeSlotCode, reportScore?.formatifScore) ??
          formativeFallback;
        const midtermScore = readSlotOrLegacyScore(slotScores, midtermSlotCode, reportScore?.sbtsScore);
        const finalComponentScore = readSlotOrLegacyScore(
          slotScores,
          finalSlotCode,
          resolveLegacyFinalScore(reportScore, finalSlotCode),
        );
        const hasStudentGradeEvidence = hasAnyNumericValue([
          sGrade?.score,
          sGrade?.nf1,
          sGrade?.nf2,
          sGrade?.nf3,
          sGrade?.nf4,
          sGrade?.nf5,
          sGrade?.nf6,
        ]);
        const hasReportComponentEvidence = hasAnyNumericValue([
          rGrade?.formatifScore,
          rGrade?.sbtsScore,
          rGrade?.sasScore,
          reportScore?.satScore ?? null,
          reportScore?.usScore ?? null,
        ]);
        const hasAnyEvidence =
          hasStudentGradeEvidence ||
          hasReportComponentEvidence ||
          hasSlotScoreEvidence(slotScores) ||
          (rGrade?.finalScore !== null && rGrade?.finalScore !== undefined && rGrade.finalScore !== 0);
        const effectiveFinalScore = resolveEffectiveReportFinalScore(rGrade as any);
        const hasEffectiveFinalScore = effectiveFinalScore !== null;

        grades[subject.id] = {
          nf1: sGrade?.nf1 ?? null,
          nf2: sGrade?.nf2 ?? null,
          nf3: sGrade?.nf3 ?? null,
          nf4: sGrade?.nf4 ?? null,
          nf5: sGrade?.nf5 ?? null,
          nf6: sGrade?.nf6 ?? null,
          formatif: hasAnyEvidence ? formatifAvg : null,
          sbts: hasAnyEvidence ? midtermScore : null,
          finalComponent: hasAnyEvidence ? finalComponentScore : null,
          finalScore: hasEffectiveFinalScore ? effectiveFinalScore : null,
          usScore: hasEffectiveFinalScore ? reportScore?.usScore ?? null : null,
          predicate: hasEffectiveFinalScore ? rGrade?.predicate ?? null : null,
          description: hasEffectiveFinalScore ? rGrade?.description ?? null : null,
          slotScores,
        };
      });

      return {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
        grades,
      };
    });

    return {
      subjects: subjects.map(s => ({ id: s.id, name: s.name, code: s.code })),
      students,
      meta: {
        reportType: normalizedReportType,
        reportComponentType: responseComponentType,
        reportComponentMode: responseComponentMode,
        reportProgramCode:
          activeProgram?.code ||
          reportProgramContext.programCode ||
          normalizedReportProgramCode ||
          null,
        reportProgramLabel:
          String(
            activeProgram?.displayLabel ||
              activeProgram?.shortLabel ||
              activeProgram?.code ||
              reportProgramContext.programLabel ||
              reportProgramContext.programCode ||
              '',
          ).trim() || null,
        resolvedReportSlotCode,
        col1Label,
        col2Label,
        formativeSlotCode,
        midtermSlotCode,
        finalSlotCode,
      },
    };
  }

  async getClassExtracurricularReport(
    classId: number,
    academicYearId: number,
    semester: Semester,
    reportType: ExamType,
    reportProgramCode?: string | null,
  ) {
    const reportProgramContext = await this.resolveReportProgramContext(
      academicYearId,
      reportType,
      reportProgramCode,
    );
    const resolvedReportSlotCode = reportProgramContext.reportSlotCode;

    // 1. Fetch Class & Students
    const classData = await prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classData) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }

    const classStudents = await listHistoricalStudentsForClass(classId, academicYearId);
    const studentIds = classStudents.map(s => s.id);

    // 2. Fetch Attendance Stats
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId }
    });

    if (!academicYear) {
      throw new ApiError(404, 'Tahun ajaran tidak ditemukan');
    }

    let dateFilter = {};

    if (semester === Semester.ODD) {
      dateFilter = {
        gte: academicYear.semester1Start,
        lte: academicYear.semester1End,
      };
    } else {
      dateFilter = {
        gte: academicYear.semester2Start,
        lte: academicYear.semester2End,
      };
    }

    const attendanceStats = await prisma.dailyAttendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        classId,
        academicYearId,
        date: dateFilter,
        studentId: { in: studentIds }
      },
      _count: {
        status: true
      }
    });

    // 3. Fetch Report Notes (Only CATATAN_WALI_KELAS)
    const reportNotes = await prisma.reportNote.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId,
        semester,
        type: 'CATATAN_WALI_KELAS'
      }
    });

    // 4. Fetch non-academic activities
    const nonAcademicReportSlot = resolveNonAcademicReportSlot(semester, {
      reportSlotCode: resolvedReportSlotCode,
      programComponentType: reportProgramContext.programComponentType,
      fixedSemester: reportProgramContext.fixedSemester,
    });

    const [enrollments, osisMemberships] = await Promise.all([
      prisma.ekstrakurikulerEnrollment.findMany({
        where: {
          studentId: { in: studentIds },
          academicYearId,
        },
        include: {
          ekskul: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      }),
      prisma.osisMembership.findMany({
        where: {
          studentId: { in: studentIds },
          period: {
            academicYearId,
          },
        },
        include: {
          division: {
            select: {
              id: true,
              name: true,
            },
          },
          position: {
            select: {
              id: true,
              name: true,
              division: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assessments: {
            where: nonAcademicReportSlot
              ? {
                  academicYearId,
                  semester,
                  reportSlot: nonAcademicReportSlot,
                }
              : {
                  id: -1,
                },
            orderBy: [{ gradedAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
      }),
    ]);

    // 5. Fetch Achievements
    const achievements = await prisma.studentAchievement.findMany({
      where: {
        studentId: { in: studentIds },
        year: parseInt(academicYear.name.split('/')[0]) // Filter by start year of academic year
      }
    });

    // 6. Map Data
    const students = classStudents.map(student => {
      // Attendance
      const studentAttendance = attendanceStats.filter(a => a.studentId === student.id);
      const s = studentAttendance.find(a => a.status === 'SICK')?._count.status || 0;
      const i = studentAttendance.find(a => a.status === 'PERMISSION')?._count.status || 0;
      const a = studentAttendance.find(a => a.status === 'ABSENT')?._count.status || 0;

      // Notes
      const catatan = reportNotes.find(n => n.studentId === student.id && n.type === 'CATATAN_WALI_KELAS')?.note || '';

      // Extracurriculars
      const studentEnrollments = enrollments
        .filter(e => e.studentId === student.id)
        .map(e => {
          const score = readExtracurricularScore(
            e as unknown as ExtracurricularScoreCarrier,
            semester,
            {
              reportSlotCode: resolvedReportSlotCode,
              programComponentType: reportProgramContext.programComponentType,
              fixedSemester: reportProgramContext.fixedSemester,
            },
          );

          return {
            id: e.id,
            ekskulName: e.ekskul?.name || '',
            grade: score.grade || '',
            description: score.description || ''
          };
        });

      const studentOrganizations: OrganizationReportRow[] = osisMemberships
        .filter((membership) => membership.studentId === student.id)
        .map((membership) => {
          const assessment = membership.assessments?.[0] || null;
          return {
            sourceType: 'OSIS' as const,
            name: 'OSIS',
            positionName: membership.position?.name || null,
            divisionName:
              membership.division?.name || membership.position?.division?.name || null,
            grade: assessment?.grade || '',
            description: assessment?.description || '',
          };
        });

      // Achievements
      const studentAchievements = achievements
        .filter(a => a.studentId === student.id)
        .map(a => ({
          id: a.id,
          name: a.name,
          rank: a.rank,
          level: a.level
        }));

      return {
        id: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
        attendance: { s, i, a },
        catatan,
        extracurriculars: studentEnrollments,
        organizations: studentOrganizations,
        achievements: studentAchievements
      };
    });

    return students;
  }

  async updateExtracurricularGrade(
    enrollmentId: number, 
    grade: string, 
    description: string,
    semester: Semester,
    reportType: ExamType,
    academicYearId?: number,
    reportProgramCode?: string | null,
  ) {
    const reportProgramContext =
      Number.isFinite(Number(academicYearId)) && Number(academicYearId) > 0
        ? await this.resolveReportProgramContext(Number(academicYearId), reportType, reportProgramCode)
        : {
            reportSlotCode: normalizeLedgerCode(reportType) || 'NONE',
            programComponentType: '',
            fixedSemester: null,
          };

    const data = buildExtracurricularUpdateData(
      semester,
      {
        reportSlotCode: reportProgramContext.reportSlotCode,
        programComponentType: reportProgramContext.programComponentType,
        fixedSemester: reportProgramContext.fixedSemester,
      },
      grade,
      description,
    );

    const enrollment = await prisma.ekstrakurikulerEnrollment.update({
      where: { id: enrollmentId },
      data
    });

    return enrollment;
  }

  async getClassRankings(classId: number, academicYearId: number, semester: Semester) {
    // 1. Fetch Class & Students
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: true, // Wali Kelas
        academicYear: true, // For default signing date if needed
      },
    });

    if (!classData) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }

    // 2. Fetch All Report Grades for these students
    const classStudents = await listHistoricalStudentsForClass(classId, academicYearId);
    const studentIds = classStudents.map((s) => s.id);
    const reportGrades = await prisma.reportGrade.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId,
        semester,
      },
    });

    // 3. Aggregate Scores
    const rankingMap = new Map<number, { 
      student: (typeof classStudents)[number],
      totalScore: number,
      subjectCount: number
    }>();

    // Initialize map
    classStudents.forEach((s) => {
      rankingMap.set(s.id, {
        student: s,
        totalScore: 0,
        subjectCount: 0,
      });
    });

    // Sum scores
    reportGrades.forEach((g) => {
      const entry = rankingMap.get(g.studentId);
      const effectiveScore = resolveEffectiveReportFinalScore(g as any);
      if (entry && effectiveScore !== null) {
        entry.totalScore += effectiveScore;
        entry.subjectCount += 1;
      }
    });

    // 4. Calculate Average & Sort
    const rankings = Array.from(rankingMap.values())
      .map((item) => ({
        student: item.student,
        totalScore: Number(item.totalScore.toFixed(2)),
        averageScore: item.subjectCount > 0 ? Number((item.totalScore / item.subjectCount).toFixed(2)) : 0,
        subjectCount: item.subjectCount,
      }))
      .sort((a, b) => b.totalScore - a.totalScore); // Descending by Total Score

    // 5. Assign Rank
    const result = rankings.map((item, index) => ({
      ...item,
      rank: index + 1,
    })).sort((a, b) => a.student.name.localeCompare(b.student.name));

    // 6. Get Principal (Kepala Sekolah)
    // Assuming Principal is a User with role PRINCIPAL or configured somewhere.
    // For now, try to find a user with role PRINCIPAL or hardcode based on user request "Yulia Venny Susanti, S.E., M.M."
    // Ideally, this should be in SchoolConfig.
    // We'll return the hardcoded name as default fallback or look for principal.
    const principal = await prisma.user.findFirst({
      where: { role: 'PRINCIPAL' },
    });

    return {
      className: classData.name,
      academicYear: classData.academicYear?.name || '',
      semester: semester,
      homeroomTeacher: classData.teacher,
      principalName: principal?.name || 'Yulia Venny Susanti, S.E., M.M.',
      principalNip: principal?.nip || principal?.nuptk || '-',
      rankings: result,
    };
  }

  async createAchievement(studentId: number, name: string, rank: string, level: string, year: number) {
    return prisma.studentAchievement.create({
      data: {
        studentId,
        name,
        rank,
        level,
        year
      }
    });
  }
  
  async deleteAchievement(id: number) {
    return prisma.studentAchievement.delete({ where: { id } });
  }

  async upsertReportNote(
    studentId: number,
    academicYearId: number,
    semester: Semester,
    type: string,
    note: string
  ) {
    const existingNote = await prisma.reportNote.findFirst({
      where: {
        studentId,
        academicYearId,
        semester,
        type
      }
    });

    if (existingNote) {
      return prisma.reportNote.update({
        where: { id: existingNote.id },
        data: { note }
      });
    } else {
      return prisma.reportNote.create({
        data: {
          studentId,
          academicYearId,
          semester,
          type,
          note
        }
      });
    }
  }
}

export const reportService = new ReportService();
