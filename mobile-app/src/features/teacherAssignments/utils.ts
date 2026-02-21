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
  return `${assignment.class.name} - ${assignment.subject.name}`;
}
