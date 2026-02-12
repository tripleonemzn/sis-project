
import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const filePath = path.join(__dirname, '../../../etc/DATABASE-SIS-KGB2.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheetName = 'SISWA';
  const sheet = workbook.getWorksheet(sheetName);

  if (!sheet) {
    console.error(`Sheet '${sheetName}' not found`);
    return;
  }

  console.log(`Sheet '${sheetName}' found. Row Count: ${sheet.rowCount}`);
  
  // Get header row (assuming row 1)
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers.push(`Col ${colNumber}: ${cell.value}`);
  });

  console.log('Headers:', headers);

  // Preview first few rows
  console.log('\nFirst 3 data rows:');
  for (let i = 2; i <= 4; i++) {
    const row = sheet.getRow(i);
    const rowData: any[] = [];
    row.eachCell((cell, colNumber) => {
      rowData.push(`[${colNumber}] ${cell.value}`);
    });
    console.log(`Row ${i}:`, rowData);
  }
}

main();
