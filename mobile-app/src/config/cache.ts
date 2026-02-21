export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CACHE_MAX_SNAPSHOTS_PER_FEATURE = 6;

export const CACHE_PREFIXES = [
  'mobile_cache_profile',
  'mobile_cache_schedule_',
  'mobile_cache_grades_',
  'mobile_cache_attendance_',
  'mobile_cache_teacher_assignments_',
  'mobile_cache_learning_',
  'mobile_cache_permissions_',
  'mobile_cache_student_exams_',
  'mobile_cache_examiner_schemes_',
  'mobile_cache_examiner_assessments_',
  'mobile_cache_staff_payments_',
  'mobile_cache_staff_students_',
  'mobile_cache_parent_children_',
  'mobile_cache_parent_attendance_',
  'mobile_cache_parent_report_',
  'mobile_cache_principal_overview_',
  'mobile_cache_principal_approvals_',
  'mobile_cache_principal_attendance_',
] as const;
