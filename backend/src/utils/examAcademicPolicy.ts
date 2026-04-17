type ExamAcademicRestrictionMode = 'IGNORE' | 'WARN' | 'BLOCK';

export type ExamAcademicIssuePreviewSubject = {
  subjectName: string;
  score?: number | null;
  kkm?: number | null;
};

export type ResolvedExamAcademicEligibilityPolicy = {
  belowKkmMode: ExamAcademicRestrictionMode;
  missingScoreMode: ExamAcademicRestrictionMode;
};

export type ResolvedExamAcademicEligibilityEvaluation = {
  academicBlocked: boolean;
  academicReason: string;
  warningOnly: boolean;
};

function normalizePolicyToken(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildBelowKkmReason(subjects: ExamAcademicIssuePreviewSubject[]): string {
  const subjectPreview = subjects
    .slice(0, 3)
    .map((subject) => {
      const score = Number(subject.score);
      const kkm = Number(subject.kkm);
      if (Number.isFinite(score) && Number.isFinite(kkm)) {
        return `${subject.subjectName} (${Number(score.toFixed(2))}/${Number(kkm.toFixed(2))})`;
      }
      return subject.subjectName;
    })
    .join(', ');
  return `Nilai di bawah KKM${subjectPreview ? `: ${subjectPreview}` : ''}${subjects.length > 3 ? ' dan lainnya' : ''}`;
}

function buildMissingScoreReason(subjects: ExamAcademicIssuePreviewSubject[]): string {
  const subjectPreview = subjects
    .slice(0, 3)
    .map((subject) => subject.subjectName)
    .filter(Boolean)
    .join(', ');
  return `Nilai belum lengkap${subjectPreview ? `: ${subjectPreview}` : ''}${subjects.length > 3 ? ' dan lainnya' : ''}`;
}

export function resolveExamAcademicEligibilityPolicy(params: {
  programCode?: string | null;
  examType?: string | null;
}): ResolvedExamAcademicEligibilityPolicy {
  const programCode = normalizePolicyToken(params.programCode);
  const examType = normalizePolicyToken(params.examType);
  const isSbtsProgram =
    programCode === 'SBTS' ||
    programCode === 'MIDTERM' ||
    programCode === 'SUMATIF_BERSAMA_TENGAH_SEMESTER' ||
    examType === 'SBTS' ||
    examType === 'MIDTERM';

  if (isSbtsProgram) {
    return {
      belowKkmMode: 'WARN',
      missingScoreMode: 'WARN',
    };
  }

  return {
    belowKkmMode: 'BLOCK',
    missingScoreMode: 'IGNORE',
  };
}

export function evaluateExamAcademicEligibility(params: {
  policy: ResolvedExamAcademicEligibilityPolicy;
  belowKkmSubjects: ExamAcademicIssuePreviewSubject[];
  missingScoreSubjects: ExamAcademicIssuePreviewSubject[];
}): ResolvedExamAcademicEligibilityEvaluation {
  const blockedParts: string[] = [];
  const warningParts: string[] = [];

  if (params.belowKkmSubjects.length > 0) {
    const reason = buildBelowKkmReason(params.belowKkmSubjects);
    if (params.policy.belowKkmMode === 'BLOCK') {
      blockedParts.push(reason);
    } else if (params.policy.belowKkmMode === 'WARN') {
      warningParts.push(reason);
    }
  }

  if (params.missingScoreSubjects.length > 0) {
    const reason = buildMissingScoreReason(params.missingScoreSubjects);
    if (params.policy.missingScoreMode === 'BLOCK') {
      blockedParts.push(reason);
    } else if (params.policy.missingScoreMode === 'WARN') {
      warningParts.push(reason);
    }
  }

  return {
    academicBlocked: blockedParts.length > 0,
    academicReason: blockedParts.length > 0 ? blockedParts.join(' • ') : warningParts.join(' • '),
    warningOnly: blockedParts.length === 0 && warningParts.length > 0,
  };
}
