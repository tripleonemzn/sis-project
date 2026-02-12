
import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const filePath = path.join(__dirname, '../../../etc/DATABASE-SIS-KGB2.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('SISWA');

  if (!sheet) return;

  const nisMap: { [key: string]: number[] } = {};
  const nisnMap: { [key: string]: number[] } = {};

  const rowCount = sheet.rowCount;
  for (let i = 2; i <= rowCount; i++) {
    const row = sheet.getRow(i);
    const nis = row.getCell(2).value?.toString().trim();
    const nisn = row.getCell(3).value?.toString().trim();
    const name = row.getCell(4).value?.toString().trim();

    if (nis) {
      if (!nisMap[nis]) nisMap[nis] = [];
      nisMap[nis].push(i);
    }
    
    // Check for empty string or 0 or just spaces
    if (nisn && nisn !== '0' && nisn !== '-') {
         if (!nisnMap[nisn]) nisnMap[nisn] = [];
         nisnMap[nisn].push(i);
    }
  }

  console.log('--- Checking for Duplicate NIS in Excel ---');
  let duplicateNisCount = 0;
  for (const [nis, rows] of Object.entries(nisMap)) {
    if (rows.length > 1) {
      console.log(`Duplicate NIS '${nis}' found at rows: ${rows.join(', ')}`);
      duplicateNisCount++;
    }
  }
  if (duplicateNisCount === 0) console.log('No duplicate NIS found.');

  console.log('\n--- Checking for Duplicate NISN in Excel ---');
  let duplicateNisnCount = 0;
  for (const [nisn, rows] of Object.entries(nisnMap)) {
    if (rows.length > 1) {
       // Get names for these rows to see who they are
       const names = rows.map(r => sheet.getRow(r).getCell(4).value);
       console.log(`Duplicate NISN '${nisn}' found at rows: ${rows.join(', ')} (${names.join(', ')})`);
       duplicateNisnCount++;
    }
  }
}

main();
