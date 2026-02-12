
import re

file_path = 'prisma/schema.prisma'

with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []

# Mappings for generic field names based on Foreign Key
# FK suffix -> Field Name
fk_map = {
    'studentId': 'student',
    'teacherId': 'teacher',
    'authorId': 'author',
    'academicYearId': 'academicYear',
    'classId': 'class',
    'subjectId': 'subject',
    'majorId': 'major',
    'parentId': 'parent',
    'assignmentId': 'assignment',
}

# Specific fix for ScheduleEntry in TeacherAssignment
# It was renamed to `ScheduleEntry ScheduleEntry[]` by previous script.
# We want `scheduleEntries ScheduleEntry[]`.

for line in lines:
    # Fix ScheduleEntry field
    if 'ScheduleEntry ScheduleEntry[]' in line:
        line = line.replace('ScheduleEntry ScheduleEntry[]', 'scheduleEntries ScheduleEntry[]')
    
    # Generic Relation Fixer
    # Matches: fieldName Type? @relation(fields: [fkName], ...)
    match = re.search(r'^\s*(\w+)\s+(\w+\??)\s+@relation\(.*fields:\s*\[(\w+)\].*\)', line)
    if match:
        current_field = match.group(1)
        type_name = match.group(2)
        fk_name = match.group(3)
        
        if fk_name in fk_map:
            desired_field = fk_map[fk_name]
            if current_field != desired_field:
                # Replace the field name
                # We use specific replacement to avoid matching other parts
                line = re.sub(r'^\s*' + current_field + r'\b', '  ' + desired_field, line)
                print(f"Fixed relation: {current_field} -> {desired_field} (FK: {fk_name})")

    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
