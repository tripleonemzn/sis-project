
import re

file_path = 'prisma/schema.prisma'

with open(file_path, 'r') as f:
    content = f.read()

# Remove enum SubjectCategory { ... }
# It might be multi-line.
# Pattern: enum SubjectCategory\s*\{[^}]*\}
content = re.sub(r'enum SubjectCategory\s*\{[^}]*\}', '', content, flags=re.DOTALL)

# Rename field SubjectCategory in Subject model
# Find `SubjectCategory SubjectCategory?`
content = content.replace('SubjectCategory SubjectCategory?', 'subjectCategory SubjectCategory?')

with open(file_path, 'w') as f:
    f.write(content)
