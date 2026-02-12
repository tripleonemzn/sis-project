import re

file_path = 'prisma/migrations/20260131085724_add_report_date_and_fixes/migration.sql'

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to match ALTER TABLE ... ADD CONSTRAINT ...;
# We assume it ends with ; and is on one line or spans multiple lines.
# Prisma usually formats it nicely.
# But let's handle the simple case where it starts with ALTER TABLE and contains ADD CONSTRAINT and ends with ;
pattern = re.compile(r'(ALTER TABLE ".*?" ADD CONSTRAINT ".*?" .*?;)', re.DOTALL)

def replace_func(match):
    stmt = match.group(1)
    return f"""DO $$ BEGIN
    {stmt}
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;"""

new_content = pattern.sub(replace_func, content)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Migration file patched.")
