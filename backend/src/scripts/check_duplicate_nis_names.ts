
import ExcelJS from 'exceljs';

const filePath = '/var/www/sis-project/etc/DATABASE-SIS-KGB2.xlsx';

async function checkDuplicateNames() {
  const workbook = new ExcelJS.Workbook();
  console.log(`Reading file: ${filePath}`);
  try {
    await workbook.xlsx.readFile(filePath);
    
    console.log('Worksheets found:');
    workbook.eachSheet((sheet, id) => {
        console.log(`${id}: ${sheet.name}`);
    });

    const sheet = workbook.getWorksheet('SISWA');
    if (!sheet) {
        console.error('Sheet "SISWA" not found!');
        // Try to find a sheet that looks like it contains student data
        return;
    }

    console.log(`Sheet "DATA SISWA" has ${sheet.rowCount} rows`);

    const targetNIS = ['2425.10.304', '2425.10.305', '2425.10.306'];
    const results: any[] = [];

    sheet.eachRow((row, rowNumber) => {
        // Log first few rows to debug column indices
        if (rowNumber <= 3) {
            console.log(`Row ${rowNumber}:`, JSON.stringify(row.values));
        }

        // Try to be more flexible with column index
        // Iterate cells to find NIS
        let nis = '';
        let name = '';
        let className = '';

        // Based on previous valid imports, let's look at the cells directly
        // Usually index 2 is NIS, 3 is Name
        const cell2 = row.getCell(2).text;
        const cell4 = row.getCell(4).text;
        const cell5 = row.getCell(5).text;
        
        if (cell2) nis = cell2.toString().trim();
        if (cell4) name = cell4.toString().trim();
        if (cell5) className = cell5.toString().trim();

        if (targetNIS.includes(nis)) {
            results.push({
                row: rowNumber,
                nis,
                name,
                className
            });
        }
    });

    // Sort by NIS
    results.sort((a, b) => a.nis.localeCompare(b.nis));

    console.log('--- Duplicate NIS Details ---');
    if (results.length === 0) {
        console.log("No matches found. Please check column indices.");
    }
    results.forEach(r => {
        console.log(`Row ${r.row}: NIS ${r.nis} - ${r.name} (Kelas: ${r.className})`);
    });

  } catch (error) {
    console.error("Error reading file:", error);
  }
}

checkDuplicateNames();
