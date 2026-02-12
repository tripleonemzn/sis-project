import { PrismaClient, Role, Gender, StudentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
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

function normalizeClassName(value: string): string {
  return value.trim().toUpperCase();
}

function parseGender(value: string): Gender | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (v.startsWith('L') || v.includes('LAKI')) return Gender.MALE;
  if (v.startsWith('P') || v.includes('PEREMPUAN')) return Gender.FEMALE;
  return null;
}

function parseDateCell(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const result = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    if (!isNaN(result.getTime())) return result;
  }
  const str = normalizeString(value);
  if (!str) return null;
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

async function loadWorkbook() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  return workbook;
}

async function importStudentsFromExcel() {
  console.log('Importing students from input.xlsx sheet SISWA...');
  console.log(`Using Excel path: ${EXCEL_PATH}`);

  const workbook = await loadWorkbook();

  let worksheet =
    workbook.getWorksheet('SISWA') ||
    workbook.getWorksheet('siswa') ||
    workbook.worksheets.find((ws) => normalizeHeader(ws.name).includes('SISWA')) ||
    null;

  if (!worksheet) {
    console.log('Worksheet SISWA not found. Aborting student import.');
    return;
  }

  const headerRow = worksheet.getRow(1);
  const headerValues = (headerRow.values as unknown[]).slice(1);
  const headers = headerValues.map((v) => normalizeHeader(v));

  console.log('Detected SISWA headers:', headers);

  const usernameIndex = headers.findIndex((h) => h.includes('USERNAME') || h.includes('USER NAME'));
  const nisnIndex = headers.findIndex((h) => h.includes('NISN'));
  const nisIndex = headers.findIndex((h) => h === 'NIS' || h.includes(' NIS'));
  const nameIndex = headers.findIndex(
    (h) => h.includes('NAMA') && !h.includes('IBU') && !h.includes('AYAH') && !h.includes('ORTU')
  );
  const classIndex = headers.findIndex((h) => h.includes('KELAS'));
  const genderIndex = headers.findIndex((h) => h.includes('JENIS KELAMIN') || h === 'JK');
  const birthPlaceIndex = headers.findIndex((h) => h.includes('TEMPAT LAHIR'));
  const birthDateIndex = headers.findIndex((h) => h.includes('TANGGAL LAHIR') || h.includes('TGL LAHIR'));
  const phoneIndex = headers.findIndex((h) => h.includes('HP') || h.includes('WA') || h.includes('TELEPON'));
  const emailIndex = headers.findIndex((h) => h.includes('EMAIL'));

  if (nameIndex === -1) {
    console.log('Cannot detect NAMA column in SISWA sheet. Aborting student import.');
    return;
  }

  const classes = await prisma.class.findMany();
  const classMap = new Map<string, number>();
  for (const cls of classes) {
    classMap.set(normalizeClassName(cls.name), cls.id);
  }

  const defaultPasswordHash = await bcrypt.hash('P@ssw0rd', 10);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = (row.values as unknown[]).slice(1);

    const rawName = values[nameIndex];
    const name = normalizeString(rawName);
    if (!name) {
      skipped++;
      continue;
    }

    const rawNisn = nisnIndex >= 0 ? values[nisnIndex] : undefined;
    const rawNis = nisIndex >= 0 ? values[nisIndex] : undefined;
    const rawUsername = usernameIndex >= 0 ? values[usernameIndex] : undefined;

    const nisn = normalizeString(rawNisn);
    const nis = normalizeString(rawNis);
    let username = normalizeString(rawUsername);

    if (!username) {
      username = nisn || nis;
    }

    if (!username) {
      console.log(`Row ${rowNumber}: skipped because no username/NISN/NIS. Name: ${name}`);
      skipped++;
      continue;
    }

    let gender: Gender | null = null;
    if (genderIndex >= 0) {
      gender = parseGender(normalizeString(values[genderIndex]));
    }

    const birthPlace =
      birthPlaceIndex >= 0 ? normalizeString(values[birthPlaceIndex]) || null : null;
    const birthDate =
      birthDateIndex >= 0 ? parseDateCell(values[birthDateIndex]) : null;
    const email =
      emailIndex >= 0 ? normalizeString(values[emailIndex]) || null : null;
    const phone =
      phoneIndex >= 0 ? normalizeString(values[phoneIndex]) || null : null;

    let classId: number | null = null;
    if (classIndex >= 0) {
      const className = normalizeString(values[classIndex]);
      if (className) {
        const mapped = classMap.get(normalizeClassName(className));
        if (mapped) {
          classId = mapped;
        } else {
          console.log(`Row ${rowNumber}: class "${className}" not found for student "${name}". Student will be created without class.`);
        }
      }
    }

    let existing = null;
    if (nisn) {
      existing = await prisma.user.findUnique({ where: { nisn } });
    }
    if (!existing) {
      existing = await prisma.user.findUnique({ where: { username } });
    }

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          username,
          name,
          role: Role.STUDENT,
          nis: nis || existing.nis,
          nisn: nisn || existing.nisn,
          gender: gender ?? existing.gender,
          birthPlace: birthPlace ?? existing.birthPlace,
          birthDate: birthDate ?? existing.birthDate,
          email: email ?? existing.email,
          phone: phone ?? existing.phone,
          classId: classId ?? existing.classId,
          studentStatus: StudentStatus.ACTIVE,
        },
      });
      updated++;
    } else {
      await prisma.user.create({
        data: {
          username,
          password: defaultPasswordHash,
          name,
          role: Role.STUDENT,
          nis: nis || null,
          nisn: nisn || null,
          gender: gender || undefined,
          birthPlace: birthPlace || undefined,
          birthDate: birthDate || undefined,
          email: email || undefined,
          phone: phone || undefined,
          classId: classId ?? undefined,
          studentStatus: StudentStatus.ACTIVE,
        },
      });
      created++;
    }
  }

  console.log(`Student import completed. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}.`);
}

async function main() {
  try {
    await importStudentsFromExcel();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Error during student import:', err);
  process.exit(1);
});
