
import os

files = [
    '/var/www/sis-project/frontend/src/pages/teacher/MyClassesPage.tsx',
    '/var/www/sis-project/frontend/src/pages/teacher/TeacherAttendanceListPage.tsx'
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Define the start and end of the block to remove
    # We'll search for the container div and the Calendar icon closing div
    
    if 'id="academic-year-select"' in content:
        # MyClassesPage pattern
        start_marker = '<div className="flex flex-col sm:flex-row gap-3">'
        end_marker = '<Calendar className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />'
        
        # Find start index
        start_idx = content.find(start_marker)
        if start_idx != -1:
            # Find the end of the div closing the outer container
            # The structure is:
            # <div ... gap-3">
            #   <div ... relative">
            #     <select ...> ... </select>
            #     <Calendar ... />
            #   </div>
            # </div>
            
            # We can try to find the end_marker and then the next two </div> tags
            end_icon_idx = content.find(end_marker, start_idx)
            if end_icon_idx != -1:
                # Find the closing </div> for relative div
                div1 = content.find('</div>', end_icon_idx)
                # Find the closing </div> for gap-3 div
                div2 = content.find('</div>', div1 + 6)
                
                if div2 != -1:
                    # Remove the block
                    new_content = content[:start_idx] + content[div2 + 6:]
                    with open(file_path, 'w') as f:
                        f.write(new_content)
                    print(f"Updated {file_path}")
                else:
                    print(f"Could not find closing divs in {file_path}")
            else:
                print(f"Could not find end marker in {file_path}")
        else:
            print(f"Could not find start marker in {file_path}")

    elif 'id="attendance-academic-year"' in content:
        # TeacherAttendanceListPage pattern
        start_marker = '<div className="flex flex-col sm:flex-row gap-3">'
        end_marker = '<Calendar className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />'
        
        start_idx = content.find(start_marker)
        if start_idx != -1:
            end_icon_idx = content.find(end_marker, start_idx)
            if end_icon_idx != -1:
                div1 = content.find('</div>', end_icon_idx)
                div2 = content.find('</div>', div1 + 6)
                
                if div2 != -1:
                    new_content = content[:start_idx] + content[div2 + 6:]
                    with open(file_path, 'w') as f:
                        f.write(new_content)
                    print(f"Updated {file_path}")
