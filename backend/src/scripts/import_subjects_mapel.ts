
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const filePath = '/var/www/sis-project/etc/DATABASE-SIS-KGB2.xlsx';

async function importSubjects() {
  console.error('Starting subject import (stderr)...');
  console.log('Starting subject import...');
  
  // 1. Get Active Academic Year
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    console.error('No active academic year found. Please set an active academic year first.');
    return;
  }
  console.log(`Active Academic Year: ${activeYear.name}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheet = workbook.getWorksheet('MAPEL_KKM_KATEGORI');
  if (!sheet) {
    console.error('Sheet "MAPEL_KKM_KATEGORI" not found!');
    return;
  }

  // Cache for categories to reduce DB calls
  const categoryCache = new Map<string, number>();

  // Process rows
  // Row 1 is header
  let processedCount = 0;
  let errorCount = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;

    // ExcelJS indices (corrected):
    // Col 1: Kode
    // Col 2: Nama Mata Pelajaran
    // Col 3: KKM X
    // Col 4: KKM XI
    // Col 5: KKM XII
    // Col 6: Kategori
    
    const code = row.getCell(1).text?.toString().trim();
    const name = row.getCell(2).text?.toString().trim();
    const kkmX = row.getCell(3).value;
    const kkmXI = row.getCell(4).value;
    const kkmXII = row.getCell(5).value;
    const categoryName = row.getCell(6).text?.toString().trim();

    if (!code || !name) {
      console.warn(`Row ${rowNumber}: Missing code or name. Skipping.`);
      continue;
    }

    try {
      // 2. Handle Category
      let categoryId: number | null = null;
      if (categoryName) {
        if (categoryCache.has(categoryName)) {
          categoryId = categoryCache.get(categoryName)!;
        } else {
          // Check if exists
          // Generate a simple code from name if needed, e.g., "UMUM", "KEJURUAN"
          const categoryCode = categoryName.toUpperCase().replace(/\s+/g, '_');
          
          const category = await prisma.subjectCategory.upsert({
            where: { code: categoryCode },
            update: { name: categoryName },
            create: {
              code: categoryCode,
              name: categoryName,
            },
          });
          categoryId = category.id;
          categoryCache.set(categoryName, categoryId);
        }
      }

      // 3. Upsert Subject
      const subject = await prisma.subject.upsert({
        where: { code: code },
        update: {
          name: name,
          categoryId: categoryId,
        },
        create: {
          code: code,
          name: name,
          categoryId: categoryId,
        },
      });

      console.log(`Processed Subject: ${subject.code} - ${subject.name}`);

      // 4. Handle KKM
      // Helper to upsert KKM
      const upsertKKM = async (level: string, kkmValue: any) => {
        const kkmNum = typeof kkmValue === 'number' ? kkmValue : parseInt(kkmValue);
        if (!isNaN(kkmNum) && kkmNum > 0) {
          await prisma.subjectKKM.upsert({
            where: {
              subjectId_classLevel_academicYearId: {
                subjectId: subject.id,
                classLevel: level,
                academicYearId: activeYear.id,
              },
            },
            update: {
              kkm: kkmNum,
            },
            create: {
              subjectId: subject.id,
              classLevel: level,
              academicYearId: activeYear.id,
              kkm: kkmNum,
            },
          });
          // console.log(`  Updated KKM for ${level}: ${kkmNum}`);
        }
      };

      await upsertKKM('X', kkmX);
      await upsertKKM('XI', kkmXI);
      await upsertKKM('XII', kkmXII);

      processedCount++;
    } catch (error) {
      console.error(`Error processing row ${rowNumber} (${code}):`, error);
      errorCount++;
    }
  }

  console.log(`Import finished. Processed: ${processedCount}, Errors: ${errorCount}`);
  await prisma.$disconnect();
}

importSubjects();
