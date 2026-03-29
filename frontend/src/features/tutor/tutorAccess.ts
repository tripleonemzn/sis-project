import type { TutorAssignmentSummary } from '../../services/tutor.service';

function normalizeRole(role: unknown): string {
  return String(role || '').trim().toUpperCase();
}

export function canAccessTutorWorkspace(role: unknown): boolean {
  return ['TEACHER', 'EXTRACURRICULAR_TUTOR'].includes(normalizeRole(role));
}

export function getActiveTutorAssignments(assignments?: TutorAssignmentSummary[] | null): TutorAssignmentSummary[] {
  if (!Array.isArray(assignments)) return [];
  return assignments.filter((assignment) => assignment && assignment.isActive !== false);
}

export function hasTutorAssignments(assignments?: TutorAssignmentSummary[] | null): boolean {
  return getActiveTutorAssignments(assignments).length > 0;
}

export function isOsisTutorAssignment(assignment?: TutorAssignmentSummary | null): boolean {
  return String(assignment?.ekskul?.name || '')
    .trim()
    .toUpperCase()
    .includes('OSIS');
}

export function hasOsisTutorAssignments(assignments?: TutorAssignmentSummary[] | null): boolean {
  return getActiveTutorAssignments(assignments).some((assignment) => isOsisTutorAssignment(assignment));
}

export function buildTutorMembersHref(assignment?: TutorAssignmentSummary | null): string {
  if (!assignment) return '/tutor/members';

  const params = new URLSearchParams();
  params.set('assignmentId', String(assignment.id));
  params.set('ekskulId', String(assignment.ekskulId));
  params.set('academicYearId', String(assignment.academicYearId));

  return `/tutor/members?${params.toString()}`;
}
