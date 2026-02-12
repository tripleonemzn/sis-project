
import os
import re

files_to_clean = [
    '/var/www/sis-project/frontend/src/pages/examiner/UKKAssessmentPage.tsx',
    '/var/www/sis-project/frontend/src/pages/examiner/UKKSchemeListPage.tsx',
    '/var/www/sis-project/frontend/src/pages/teacher/MyClassesPage.tsx',
    '/var/www/sis-project/frontend/src/pages/teacher/TeacherAttendanceListPage.tsx',
    '/var/www/sis-project/frontend/src/pages/teacher/homeroom/HomeroomBehaviorPage.tsx',
    '/var/www/sis-project/frontend/src/pages/teacher/homeroom/TeacherHomeroomSasPage.tsx',
    '/var/www/sis-project/frontend/src/pages/teacher/homeroom/TeacherHomeroomSatPage.tsx',
    '/var/www/sis-project/frontend/src/pages/teacher/homeroom/TeacherHomeroomSbtsPage.tsx'
]

for file_path in files_to_clean:
    if not os.path.exists(file_path):
        print(f"Skipping {file_path} (not found)")
        continue

    with open(file_path, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Remove 'Calendar,' or 'Calendar' from imports
    # Regex for imports from 'lucide-react'
    # It might be multiline
    
    # Simple replace for "  Calendar," (common in multiline)
    content = content.replace('  Calendar,\n', '')
    content = content.replace('  Calendar\n', '') # if last item
    
    # Also handle single line imports if any (though usually lucide imports are multiline or destructive)
    # But let's be careful not to break the import statement.
    
    # Remove setSelectedAcademicYearId from useState
    # const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | ''>('');
    # -> const [selectedAcademicYearId] = useState<number | ''>('');
    
    content = re.sub(
        r'const \[selectedAcademicYearId, setSelectedAcademicYearId\]', 
        'const [selectedAcademicYearId]', 
        content
    )
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Cleaned {file_path}")
    else:
        print(f"No changes in {file_path}")
