
import ExcelJS from 'exceljs';
import path from 'path';

async function readDesignRequirements() {
  const filePath = '/var/www/sis-project/etc/DATABASE-SIS-KGB2.xlsx';
  const workbook = new ExcelJS.Workbook();
  
  try {
    console.log(`Reading file: ${filePath}`);
    await workbook.xlsx.readFile(filePath);
    
    const sheetName = 'Design Tabel Rapor SBTS';
    const worksheet = workbook.getWorksheet(sheetName);
    
    if (!worksheet) {
      console.error(`Sheet "${sheetName}" not found!`);
      return;
    }

    console.log(`Sheet Row Count: ${worksheet.rowCount}`);

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
       console.log(`[ROW ${rowNumber}]:`, JSON.stringify(row.values));
    });

  } catch (error) {
    console.error('Error reading file:', error);
  }
}

readDesignRequirements();
