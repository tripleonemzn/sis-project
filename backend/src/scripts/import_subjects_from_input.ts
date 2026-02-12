import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';

const prisma = new PrismaClient();

const EXCEL_PATH = path.join(process.cwd(), '../input.xlsx');

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).toString().trim().toUpperCase();
}

async function loadWorkbook() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  return workbook;
}

// function parseCategory(raw: string): SubjectCategoryType {
//   const v = raw.trim().toUpperCase();
//   if (v.includes('UMUM')) return SubjectCategoryType.UMUM;
//   if (v.includes('KEJURUAN')) return SubjectCategoryType.KEJURUAN;
//   if (v.includes('KOMPETENSI') || v.includes('KEAHLIAN')) {
//     return SubjectCategoryType.KOMPETENSI_KEAHLIAN;
//   }
//   if (v.includes('PILIHAN') || v === 'PIL') return SubjectCategoryType.PILIHAN;
//   if (v.includes('MUATAN') || v.includes('LOKAL')) return SubjectCategoryType.MUATAN_LOKAL;
//   return SubjectCategoryType.UMUM;
// }

function parseKKM(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  const str = normalizeString(value);
  if (!str) return null;
  const num = Number(str.replace(',', '.'));
  if (Number.isNaN(num)) return null;
  return num;
}

async function importSubjectsFromExcel() {
  console.log('Importing subjects from input.xlsx sheet MAPEL_KKM_KATEGORI...');
  console.log(`Using Excel path: ${EXCEL_PATH}`);

  const workbook = await loadWorkbook();

  let worksheet =
    workbook.getWorksheet('MAPEL_KKM_KATEGORI') ||
    workbook.getWorksheet('Mapel_KKM_Kategori') ||
    workbook.getWorksheet('MAPEL') ||
    workbook.worksheets.find((ws) =>
      normalizeHeader(ws.name).includes('MAPEL_KKM_KATEGORI')
    ) ||
    null;

  if (!worksheet) {
    console.log('Worksheet MAPEL_KKM_KATEGORI not found. Aborting subject import.');
    return;
  }

  const headerRow = worksheet.getRow(1);
  const headerValues = (headerRow.values as unknown[]).slice(1);
  const headers = headerValues.map((v) => normalizeHeader(v));

  console.log('Detected MAPEL headers:', headers);

  const codeIndex = headers.findIndex(
    (h) => h === 'KODE' || h.includes('KODE MAPEL') || h === 'KD' || h === 'KODE_MAPEL'
  );
  const nameIndex = headers.findIndex(
    (h) =>
      (h.includes('NAMA') || h.includes('MAPEL')) &&
      !h.includes('KATEGORI')
  );
  const categoryIndex = headers.findIndex((h) => h.includes('KATEGORI') || h === 'TIPE');
  const kkmXIndex = headers.findIndex((h) => h === 'KKM X' || h === 'KKM_X' || h.includes('KKM X'));
  const kkmXIIndex = headers.findIndex(
    (h) => h === 'KKM XI' || h === 'KKM_XI' || h.includes('KKM XI')
  );
  const kkmXIIIndex = headers.findIndex(
    (h) => h === 'KKM XII' || h === 'KKM_XII' || h.includes('KKM XII')
  );

  if (codeIndex === -1 || nameIndex === -1) {
    console.log('Cannot detect KODE or NAMA columns in MAPEL_KKM_KATEGORI sheet. Aborting.');
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = (row.values as unknown[]).slice(1);

    const rawCode = values[codeIndex];
    const rawName = values[nameIndex];

    const code = normalizeString(rawCode);
    const name = normalizeString(rawName);

    if (!code && !name) {
      skipped++;
      continue;
    }

    if (!code || !name) {
      console.log(
        `Row ${rowNumber}: skipped because missing code or name. Code="${code}", Name="${name}"`
      );
      skipped++;
      continue;
    }

    // const rawCategory = categoryIndex >= 0 ? normalizeString(values[categoryIndex]) : '';
    // const categoryType = rawCategory ? parseCategory(rawCategory) : SubjectCategoryType.UMUM;

    const kkmX = kkmXIndex >= 0 ? parseKKM(values[kkmXIndex]) : null;
    const kkmXI = kkmXIIndex >= 0 ? parseKKM(values[kkmXIIndex]) : null;
    const kkmXII = kkmXIIIndex >= 0 ? parseKKM(values[kkmXIIIndex]) : null;

    const existing = await prisma.subject.findUnique({
      where: { code },
      include: {
        kkms: true,
      },
    });

    if (!existing) {
      const subject = await prisma.subject.create({
        data: {
          code,
          name,
          // category: categoryType,
        },
      });

      const kkms: { classLevel: string; kkm: number | null }[] = [
        { classLevel: 'X', kkm: kkmX },
        { classLevel: 'XI', kkm: kkmXI },
        { classLevel: 'XII', kkm: kkmXII },
      ];

      for (const k of kkms) {
        if (k.kkm !== null) {
          await prisma.subjectKKM.create({
            data: {
              subjectId: subject.id,
              classLevel: k.classLevel,
              kkm: k.kkm,
            },
          });
        }
      }

      created++;
    } else {
      // Update
      await prisma.subject.update({
        where: { id: existing.id },
        data: {
          name,
          // category: categoryType,
        },
      });

      // Update KKMs
       const kkms: { classLevel: string; kkm: number | null }[] = [
        { classLevel: 'X', kkm: kkmX },
        { classLevel: 'XI', kkm: kkmXI },
        { classLevel: 'XII', kkm: kkmXII },
      ];

      for (const k of kkms) {
        if (k.kkm !== null) {
          const existingKKM = existing.kkms.find(
            (ek) => ek.classLevel === k.classLevel && ek.academicYearId === null
          );

          if (existingKKM) {
            await prisma.subjectKKM.update({
              where: { id: existingKKM.id },
              data: { kkm: k.kkm },
            });
          } else {
            await prisma.subjectKKM.create({
              data: {
                subjectId: existing.id,
                classLevel: k.classLevel,
                kkm: k.kkm,
              },
            });
          }
        }
      }

      updated++;
    }
  }

  console.log(`Import finished. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

importSubjectsFromExcel()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
