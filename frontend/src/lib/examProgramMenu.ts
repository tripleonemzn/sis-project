import type { ExamProgram } from '../services/exam.service';

const normalizeProgramToken = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

const collectProgramTokens = (program: ExamProgram): Set<string> => {
  const tokens = new Set<string>();
  [program.code, program.shortLabel, program.label].forEach((value) => {
    const normalized = normalizeProgramToken(value);
    if (normalized) tokens.add(normalized);
  });
  return tokens;
};

export const resolveProgramCodeFromParam = (programs: ExamProgram[], rawParam: string): string => {
  const requested = normalizeProgramToken(rawParam);
  if (!requested) return '';

  const matched = programs.find((program) => collectProgramTokens(program).has(requested));
  return matched?.code || '';
};

export const isNonScheduledExamProgram = (program: ExamProgram): boolean => {
  const codeToken = normalizeProgramToken(program?.code);
  if (codeToken === 'FORMATIF') return true;
  if (codeToken === 'UH' || codeToken === 'ULANGANHARIAN') return true;

  const labelToken = normalizeProgramToken(program?.label);
  const shortLabelToken = normalizeProgramToken(program?.shortLabel);
  const tokens = [codeToken, shortLabelToken, labelToken].filter(Boolean);

  // Exclude formative/daily tests from schedule-proctor-room pages.
  // Do not rely on baseType because legacy rows may store wrong baseType values.
  if (tokens.some((token) => token.includes('FORMATIF'))) return true;
  if (tokens.some((token) => token.includes('ULANGANHARIAN'))) return true;
  return (
    labelToken === 'ULANGANHARIAN' ||
    labelToken === 'FORMATIF' ||
    shortLabelToken === 'ULANGANHARIAN' ||
    shortLabelToken === 'UH' ||
    shortLabelToken === 'FORMATIF'
  );
};
