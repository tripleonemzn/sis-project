
import re

file_path = 'prisma/schema.prisma'

replacements = {
    'work_programs': 'WorkProgram',
    'work_program_items': 'WorkProgramItem',
    'work_program_budgets': 'WorkProgramBudget',
    'ukk_assessments': 'UkkAssessment',
    'ukk_schemes': 'UkkScheme',
    'subject_categories': 'SubjectCategory',
    'academic_events': 'AcademicEvent',
    'budget_requests': 'BudgetRequest',
    'exam_packets': 'ExamPacket',
    'exam_proctoring_reports': 'ExamProctoringReport',
    'exam_schedules': 'ExamSchedule',
    'exam_sitting_students': 'ExamSittingStudent',
    'exam_sittings': 'ExamSitting',
    'notifications': 'Notification',
    'schedule_entries': 'ScheduleEntry',
    'schedule_time_configs': 'ScheduleTimeConfig',
    'student_exam_sessions': 'StudentExamSession',
    'teacher_documents': 'TeacherDocument',
}

with open(file_path, 'r') as f:
    content = f.read()

for table_name, model_name in replacements.items():
    # Replace model definition
    # Pattern: model table_name {
    pattern = f'model {table_name} {{'
    replacement = f'model {model_name} {{\n  @@map("{table_name}")'
    
    # Check if @@map already exists (it shouldn't for pure introspection unless generated)
    # Introspection doesn't add @@map if model name = table name.
    
    if pattern in content:
        content = content.replace(pattern, replacement)
        print(f"Fixed model {table_name} -> {model_name}")
    
    # Also replace references in other models
    # Type references: field Name Type[] or field Name Type
    # Regex word boundary to avoid partial matches
    content = re.sub(r'\b' + table_name + r'\b', model_name, content)

# Also fix the relation fields that use snake_case types
# e.g. `work_programs work_programs[]` -> `work_programs WorkProgram[]`
# The previous loop handles the type name replacement (re.sub).
# But we need to make sure the *field names* are compatible with what the code expects.
# The code usually expects snake_case field names for relations if that's what was there.
# e.g. `user.work_programs`.
# Introspection generates `work_programs work_programs[]`.
# After my replacement: `work_programs WorkProgram[]`.
# This is correct for the field name (keeps snake_case) and type name (PascalCase).
# BUT, if the code expects `user.workPrograms` (camelCase), I'm in trouble.
# Let's check `user.controller.ts` or `workProgram.controller.ts`.
# `prisma.workProgram` -> Model name.
# `user.work_programs` -> Relation field name.

# Let's check `TeacherAssignment` relations.
# The code had `scheduleEntries` error.
# `model TeacherAssignment` has `schedule_entries schedule_entries[]` (from introspection).
# My script changes it to `schedule_entries ScheduleEntry[]`.
# But the code expects `scheduleEntries` (camelCase).
# So I need to rename relation fields to camelCase too?
# This implies the original schema used `@relation("name")` or just camelCase field names mapping to snake_case tables?
# Introspection usually uses snake_case for fields if foreign keys are snake_case.

# If I need to fix field names to camelCase, that's much harder without knowing the exact mapping.
# However, the error log `Property 'scheduleEntries' does not exist...` confirms camelCase expectation.
# So I should also try to camelCase the field names for these relations.

def to_camel(s):
    return re.sub(r'_([a-z])', lambda x: x.group(1).upper(), s)

# We can try to replace field definitions.
# Pattern: `field_name Type`
# We want: `fieldName Type`
# But only for relations?
# Primitives usually match column names.
# If I change primitive field names, I need `@map`.
# Introspection adds `@map` for primitives if I rename field? No, introspection *gives* me `@map` if I use `prisma db pull`.
# Wait, `prisma db pull` gives me fields that match columns.
# If I want camelCase fields, I need to rename them and add `@map("column_name")`.
# That is too complex to script blindly.

# STRATEGY:
# The `update_all.sh` errors were mostly about Model Names (`prisma.workProgram`).
# The `scheduleEntries` error was one specific one.
# Maybe I should just fix the Model Names first, and see if that fixes the bulk of errors.
# For `scheduleEntries`, maybe I can fix the controller to use `schedule_entries` or fix the schema manually for that one.

with open(file_path, 'w') as f:
    f.write(content)
