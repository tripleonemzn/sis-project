
import ExcelJS from 'exceljs';

const filePath = '/var/www/sis-project/etc/DATABASE-SIS-KGB2.xlsx';

async function inspectMapelSheet() {
  console.log("Starting inspection script...");
  const workbook = new ExcelJS.Workbook();
  console.log(`Reading file: ${filePath}`);
  try {
    await workbook.xlsx.readFile(filePath);
    console.log("File read successfully.");
    
    const sheet = workbook.getWorksheet('MAPEL_KKM_KATEGORI');
    if (!sheet) {
        console.error('Sheet "MAPEL_KKM_KATEGORI" not found!');
        console.log('Available sheets:');
        workbook.eachSheet((sheet, id) => {
            console.log(`${id}: ${sheet.name}`);
        });
        return;
    }

    console.log(`Sheet "MAPEL_KKM_KATEGORI" has ${sheet.rowCount} rows`);

    // Log first 5 rows to understand structure
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 5) {
            console.log(`Row ${rowNumber}:`, JSON.stringify(row.values));
        }
    });

  } catch (error) {
    console.error("Error reading file:", error);
  }
}

inspectMapelSheet();
