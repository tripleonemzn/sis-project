
import ExcelJS from 'exceljs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(__dirname, '../../../etc/DATABASE-SIS-KGB2.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('SISWA');
  
  const row = sheet?.getRow(554);
  const nis = row?.getCell(2).value;
  const nisn = row?.getCell(3).value;
  const name = row?.getCell(4).value;

  console.log(`Row 554: Name=${name}, NIS=${nis}, NISN=${nisn}`);

  if (nisn) {
    const user = await prisma.user.findUnique({
      where: { nisn: nisn.toString() }
    });
    if (user) {
      console.log('User with this NISN already exists:', user);
    } else {
      console.log('No user found with this NISN.');
    }
  }
}

main().finally(() => prisma.$disconnect());
