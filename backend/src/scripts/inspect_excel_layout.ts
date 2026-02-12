
import ExcelJS from 'exceljs';
import path from 'path';

async function inspect() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(process.cwd(), '../etc/DATABASE-SIS-KGB2.xlsx');
  
  console.log(`Reading file: ${filePath}`);
  await workbook.xlsx.readFile(filePath);
  
  const sheets = ['Design Tabel Rapor SBTS', 'Rapor 1'];
  
  for (const sheetName of sheets) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      console.log(`Sheet ${sheetName} not found`);
      continue;
    }
    
    console.log(`\n--- Inspecting Sheet: ${sheetName} ---`);
    
    // Scan rows
    sheet.eachRow((row, rowNumber) => {
      const rowValues = row.values as any[];
      const jsonRow = JSON.stringify(rowValues);
      
      // Look for Group Headers
      if (jsonRow.includes('Muatan Nasional') || jsonRow.includes('Kelompok A') || jsonRow.includes('Kejuruan')) {
        console.log(`\nRow ${rowNumber} (Group Header Candidate):`);
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
             console.log(`  Col ${colNumber}: "${cell.value}" (Merged: ${cell.isMerged}, Master: ${cell.master.address})`);
        });
      }

      // Look for Footer
      if (jsonRow.includes('Bekasi') || jsonRow.includes('Wali Kelas') || jsonRow.includes('Mengetahui')) {
        console.log(`\nRow ${rowNumber} (Footer Candidate):`);
         row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
             console.log(`  Col ${colNumber}: "${cell.value}" (Style: ${JSON.stringify(cell.alignment)})`);
        });
      }
    });
  }
}

inspect().catch(console.error);
