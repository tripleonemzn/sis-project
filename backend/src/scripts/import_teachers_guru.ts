
import ExcelJS from 'exceljs';
import path from 'path';
import prisma from '../utils/prisma';
import bcrypt from 'bcryptjs';

async function importTeachers() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join('/var/www/sis-project/etc/DATABASE-SIS-KGB2.xlsx');
  
  try {
    console.log(`Reading file: ${filePath}`);
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('GURU');
    
    if (!worksheet) {
      console.error('Sheet "GURU" not found');
      return;
    }

    const hashedPassword = await bcrypt.hash('P@ssw0rd', 10);
    let count = 0;
    let updated = 0;

    // Iterate starting from row 2 (skipping header)
    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const username = row.getCell(1).value?.toString().trim();
      const name = row.getCell(2).value?.toString().trim();

      if (username && name) {
        rows.push({ username, name });
      }
    });

    console.log(`Found ${rows.length} teachers to import.`);

    for (const row of rows) {
      const { username, name } = row;

      try {
        const existingUser = await prisma.user.findUnique({
          where: { username },
        });

        if (existingUser) {
          await prisma.user.update({
            where: { username },
            data: {
              name,
              role: 'TEACHER', // Ensure role is TEACHER
            },
          });
          updated++;
          // console.log(`Updated teacher: ${username}`);
        } else {
          await prisma.user.create({
            data: {
              username,
              name,
              password: hashedPassword,
              role: 'TEACHER',
            },
          });
          count++;
          // console.log(`Created teacher: ${username}`);
        }
      } catch (err) {
        console.error(`Error importing ${username}:`, err);
      }
    }

    console.log(`Import completed.`);
    console.log(`Created: ${count}`);
    console.log(`Updated: ${updated}`);

  } catch (error) {
    console.error('Error importing teachers:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importTeachers();
