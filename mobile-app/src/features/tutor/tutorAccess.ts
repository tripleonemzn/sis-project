import type { AuthUser } from '../auth/types';
import type { TutorAssignment } from './tutorApi';

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
  return getActiveTutorAssignments(assignments).length > 0;
}
