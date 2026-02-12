
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(__dirname, '../../../etc/DATABASE-SIS-KGB2.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheetName = 'SISWA';
  const sheet = workbook.getWorksheet(sheetName);

  if (!sheet) {
    console.error(`Sheet '${sheetName}' not found`);
    process.exit(1);
  }

  // 1. Get Active Academic Year
  const academicYear = await prisma.academicYear.findFirst({
    where: { isActive: true }
  });

  if (!academicYear) {
    console.error('No active academic year found. Please set an active academic year first.');
    process.exit(1);
  }

  console.log(`Active Academic Year: ${academicYear.name}`);

  // 2. Get Classes for Active Academic Year
  const classes = await prisma.class.findMany({
    where: { academicYearId: academicYear.id }
  });

  // Normalize class name for matching (trim, maybe lowercase if needed, but strict is safer first)
  const classMap: { [key: string]: number } = {};
  classes.forEach(c => {
    classMap[c.name.trim()] = c.id;
  });

  console.log(`Found ${classes.length} classes in active academic year.`);

  // 3. Process Rows
  let successCount = 0;
  let failCount = 0;
  const hashedPassword = await bcrypt.hash('P@ssw0rd', 10);

  const rowCount = sheet.rowCount;
  // Start from row 2 (header is 1)
  for (let i = 2; i <= rowCount; i++) {
    const row = sheet.getRow(i);
    
    // Columns: 1:No, 2:NIS, 3:NISN, 4:NAMA, 5:KELAS
    const nis = row.getCell(2).value?.toString().trim();
    const nisn = row.getCell(3).value?.toString().trim();
    const name = row.getCell(4).value?.toString().trim();
    const className = row.getCell(5).value?.toString().trim();

    if (!nis || !name) {
      // Skip empty rows
      continue;
    }

    try {
      let classId: number | null = null;
      if (className) {
        if (classMap[className]) {
          classId = classMap[className];
        } else {
          console.warn(`[Row ${i}] Class '${className}' not found in active academic year.`);
        }
      }

      // Upsert User
      // Note: username MUST be unique. We use NIS as username.
      // If NISN is present, it should also be unique, but let's focus on username first.
      
      const existingUser = await prisma.user.findUnique({
        where: { username: nis }
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: name,
            nis: nis,
            nisn: nisn || null,
            classId: classId,
            role: 'STUDENT',
            studentStatus: 'ACTIVE',
            // Don't overwrite password if user exists
          }
        });
        process.stdout.write('.');
      } else {
        await prisma.user.create({
          data: {
            username: nis,
            password: hashedPassword,
            name: name,
            nis: nis,
            nisn: nisn || null,
            classId: classId,
            role: 'STUDENT',
            studentStatus: 'ACTIVE',
          }
        });
        process.stdout.write('+');
      }

      successCount++;
    } catch (error) {
      console.error(`\nError processing row ${i} (${name}):`, error);
      failCount++;
    }
  }

  console.log(`\n\nImport Finished.`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
