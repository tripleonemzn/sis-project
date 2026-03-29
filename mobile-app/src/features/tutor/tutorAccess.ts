import type { AuthUser } from '../auth/types';
import type { TutorAssignment } from './tutorApi';
import { isOsisExtracurricularCategory } from '../extracurricular/category';

function normalizeRole(role: unknown): string {
  return String(role || '').trim().toUpperCase();
}

export function canAccessTutorWorkspace(user?: Pick<AuthUser, 'role'> | null): boolean {
  return ['TEACHER', 'EXTRACURRICULAR_TUTOR'].includes(normalizeRole(user?.role));
}

export function getActiveTutorAssignments(assignments?: TutorAssignment[] | null): TutorAssignment[] {
  if (!Array.isArray(assignments)) return [];
  return assignments.filter((assignment) => assignment && assignment.isActive !== false);
}

export function hasTutorAssignments(assignments?: TutorAssignment[] | null): boolean {
  return getExtracurricularTutorAssignments(assignments).length > 0;
}

export function isOsisTutorAssignment(assignment?: TutorAssignment | null): boolean {
  return isOsisExtracurricularCategory(assignment?.ekskul?.category);
}

export function getOsisTutorAssignments(assignments?: TutorAssignment[] | null): TutorAssignment[] {
  return getActiveTutorAssignments(assignments).filter((assignment) => isOsisTutorAssignment(assignment));
}

export function getExtracurricularTutorAssignments(assignments?: TutorAssignment[] | null): TutorAssignment[] {
  return getActiveTutorAssignments(assignments).filter((assignment) => !isOsisTutorAssignment(assignment));
}
