import { TeacherAssignment } from './types';

type AssignmentLike = {
  subject: { name: string };
  class: { name: string };
};

function compareNaturalText(a: string, b: string) {
  return a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' });
}

export function compareTeacherAssignments(a: AssignmentLike, b: AssignmentLike) {
  const subjectCompare = compareNaturalText(a.subject.name || '', b.subject.name || '');
  if (subjectCompare !== 0) return subjectCompare;
  return compareNaturalText(a.class.name || '', b.class.name || '');
}

export function sortTeacherAssignments<T extends AssignmentLike>(assignments: T[]): T[] {
  return [...assignments].sort(compareTeacherAssignments);
}

export function formatAssignmentLabel(assignment: Pick<TeacherAssignment, 'class' | 'subject'>) {
  return `${assignment.subject.name} - ${assignment.class.name}`;
}

function normalizeAssignmentSubjectToken(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isGenericExamSubject(subject?: { name?: string | null; code?: string | null } | null) {
  const normalizedName = normalizeAssignmentSubjectToken(subject?.name);
  const normalizedCode = normalizeAssignmentSubjectToken(subject?.code);
  if (!normalizedName && !normalizedCode) return true;
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) return true;
  if (normalizedName === 'KONSENTRASI' || normalizedName === 'KEJURUAN') return true;
  if (normalizedName.includes('KONSENTRASI_KEAHLIAN')) return true;
  return false;
}

export function filterRegularTeacherAssignments<
  T extends { subject?: { name?: string | null; code?: string | null } | null },
>(assignments: T[]) {
  return assignments.filter((assignment) => !isGenericExamSubject(assignment.subject));
}

export function buildTeacherAssignmentOptionLabel(
  assignment: Pick<TeacherAssignment, 'class' | 'subject'>,
  order: 'subject-first' | 'class-first' = 'subject-first',
) {
  const subjectName = String(assignment.subject?.name || '-').trim() || '-';
  const className = String(assignment.class?.name || '-').trim() || '-';
  return order === 'class-first' ? `${className} • ${subjectName}` : `${subjectName} • ${className}`;
}
