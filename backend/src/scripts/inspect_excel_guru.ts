
import ExcelJS from 'exceljs';
import path from 'path';

async function inspectExcel() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join('/var/www/sis-project/etc/DATABASE-SIS-KGB2.xlsx');
  
  try {
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('GURU');
    
    if (!worksheet) {
      console.log('Sheet "GURU" not found');
      return;
    }

    const firstRow = worksheet.getRow(1);
    console.log('Headers:');
    firstRow.eachCell((cell, colNumber) => {
      console.log(`Column ${colNumber}: ${cell.value}`);
    });

    // Print first data row to see example data
    const secondRow = worksheet.getRow(2);
    console.log('\nFirst Data Row:');
    secondRow.eachCell((cell, colNumber) => {
      console.log(`Column ${colNumber}: ${cell.value}`);
    });

  } catch (error) {
    console.error('Error reading file:', error);
  }
}

inspectExcel();
