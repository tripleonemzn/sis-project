import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import path from 'path';

const prisma = new PrismaClient();

const EXCEL_PATH = path.join(__dirname, '../../../DATABASAE SIS-PROJECT.xlsx');

function normalizeString(value: unknown): string {
  if (!value) return '';
  return String(value).trim();
}

function cleanTeacherName(name: string): string {
  if (!name) return '';
  let cleaned = name
    .toLowerCase()
    .replace(/\b(s\.?pd(\.?i)?|m\.?pd|s\.?kom|s\.?t|m\.?m|m\.?si|s\.?hum|s\.?sn|s\.?sos|s\.?ag|a\.?md|dr\.?|dra\.?|drs\.?|ir\.?|s\.?ak)\b/gi, '') // Remove titles
    .replace(/[.,]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim();

  // Manual mappings for known discrepancies
  const mappings: Record<string, string> = {
    'moch azis mujaya dipura': 'moch aziz mujaya dipura',
    'sekarwangi permata yudha': 'sekarwangi permatha yudha',
    'rizky adinda aulia barokah': 'rizki adinda aulia barokah',
    'fantri wulansari': 'fantri wulan sari',
  };

  if (mappings[cleaned]) {
    return mappings[cleaned];
  }

  return cleaned;
}

function normalizeKey(value: unknown): string {
  if (!value) return '';
  return cleanTeacherName(String(value));
}

async function loadWorkbook() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  return workbook;
}

async function cleanDummySeed() {
  console.log('Cleaning dummy teachers and classes from initial seed...');

  const dummyTeacherUsernames = ['guru1', 'wakasek1', 'kaprog_rpl'];

  for (const username of dummyTeacherUsernames) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) continue;

    await prisma.teachingDevice.deleteMany({ where: { teacherId: user.id } });
    await prisma.teacherAssignment.deleteMany({ where: { teacherId: user.id } });
    await prisma.class.updateMany({
      where: { teacherId: user.id },
      data: { teacherId: null },
    });

    await prisma.user.delete({ where: { id: user.id } });
    console.log(`Deleted dummy teacher: ${username}`);
  }

  const dummyStudent = await prisma.user.findUnique({ where: { username: 'siswa1' } });
  if (dummyStudent) {
    await prisma.trainingEnrollment.deleteMany({ where: { studentId: dummyStudent.id } });
    await prisma.user.update({
      where: { id: dummyStudent.id },
      data: { classId: null },
    });
    await prisma.user.delete({ where: { id: dummyStudent.id } });
    console.log('Deleted dummy student: siswa1');
  }

  const dummyClass = await prisma.class.findFirst({
    where: { name: 'X RPL 1' },
  });

  if (dummyClass) {
    await prisma.user.updateMany({
      where: { classId: dummyClass.id },
      data: { classId: null },
    });
    await prisma.teacherAssignment.deleteMany({ where: { classId: dummyClass.id } });
    await prisma.assignment.deleteMany({ where: { classId: dummyClass.id } });
    await prisma.attendance.deleteMany({ where: { classId: dummyClass.id } });
    await prisma.dailyAttendance.deleteMany({ where: { classId: dummyClass.id } });
    await prisma.class.delete({ where: { id: dummyClass.id } });
    console.log('Deleted dummy class: X RPL 1');
  }
}

async function importTeachersFromExcel() {
  console.log('Importing teachers from Excel sheet GURU...');

  const workbook = await loadWorkbook();

  let worksheet = workbook.getWorksheet('GURU');
  if (!worksheet) {
    worksheet =
      workbook.worksheets.find((ws) => normalizeKey(ws.name) === 'guru') ||
      workbook.worksheets[0];
  }

  if (!worksheet) {
    console.log('Worksheet GURU not found. Skipping teacher import.');
    return;
  }

  const headerRow = worksheet.getRow(1);
  const headers = (headerRow.values as unknown[]).slice(1).map((v) => normalizeKey(v));

  const usernameIndex = headers.findIndex((h) => h.includes('username'));
  const nameIndex = headers.findIndex((h) => h.includes('nama'));

  if (usernameIndex === -1 || nameIndex === -1) {
    console.log('Cannot detect username or name columns in GURU sheet. Skipping teacher import.');
    return;
  }

  const hashedPassword = await bcrypt.hash('P@ssw0rd', 10);

  const teacherNameMap = new Map<string, number>();

  let created = 0;
  let updated = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = (row.values as unknown[]).slice(1);

    const username = normalizeString(values[usernameIndex]);
    const name = normalizeString(values[nameIndex]);

    if (!username || !name) continue;

    const existing = await prisma.user.findUnique({ where: { username } });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: Role.TEACHER,
        },
      });
      updated++;
      teacherNameMap.set(normalizeKey(name), existing.id);
    } else {
      const user = await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
          name,
          role: Role.TEACHER,
        },
      });
      created++;
      teacherNameMap.set(normalizeKey(name), user.id);
    }
  }

  console.log(`Teacher import completed. Created: ${created}, Updated: ${updated}.`);
  return teacherNameMap;
}

async function importClassesFromExcel(teacherNameMap: Map<string, number> | undefined) {
  console.log('Importing classes and homeroom teachers from Excel sheet wali kelas...');

  const workbook = await loadWorkbook();

  let worksheet =
    workbook.getWorksheet('wali kelas') ||
    workbook.getWorksheet('WALI KELAS') ||
    workbook.worksheets.find((ws) => normalizeKey(ws.name).includes('wali')) ||
    null;

  if (!worksheet) {
    console.log('Worksheet WALI KELAS not found. Skipping class import.');
    return;
  }

  const headerRow = worksheet.getRow(1);
  const headers = (headerRow.values as unknown[]).slice(1).map((v) => normalizeKey(v));

  const classIndex = headers.findIndex((h) => h.includes('kelas'));
  const waliIndex = headers.findIndex((h) => h.includes('wali') || h.includes('guru'));

  if (classIndex === -1 || waliIndex === -1) {
    console.log('Cannot detect class or homeroom teacher columns in wali kelas sheet. Skipping class import.');
    return;
  }

  const academicYear =
    (await prisma.academicYear.findFirst({ where: { isActive: true } })) ||
    (await prisma.academicYear.findFirst());

  if (!academicYear) {
    console.log('No academic year found. Skipping class import.');
    return;
  }

  const majors = await prisma.major.findMany();

  function detectLevel(className: string): string {
    const token = className.split(' ')[0].toUpperCase();
    if (token === 'X' || token === 'XI' || token === 'XII') return token;
    return 'X';
  }

  function detectMajorId(className: string): number | null {
    const upper = className.toUpperCase();
    for (const major of majors) {
      const code = major.code.toUpperCase();
      const name = major.name.toUpperCase();
      if (upper.includes(` ${code} `) || upper.includes(` ${code}`) || upper.includes(code)) {
        return major.id;
      }
      if (upper.includes(name)) {
        return major.id;
      }
    }
    if (majors.length === 1) {
      return majors[0].id;
    }
    return null;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = (row.values as unknown[]).slice(1);

    const rawClassName = normalizeString(values[classIndex]);
    const waliName = normalizeString(values[waliIndex]);

    if (!rawClassName) continue;

    const className = rawClassName;
    const level = detectLevel(className);
    const majorId = detectMajorId(className);

    if (!majorId) {
      skipped++;
      console.log(`Skipping class "${className}" because major could not be detected.`);
      continue;
    }

    let teacherId: number | null = null;

    if (waliName && teacherNameMap) {
      const key = normalizeKey(waliName);
      const mapped = teacherNameMap.get(key);

      if (mapped) {
        teacherId = mapped;
      } else {
        const existingTeacher = await prisma.user.findFirst({
          where: {
            role: Role.TEACHER,
            name: waliName,
          },
        });
        if (existingTeacher) {
          teacherId = existingTeacher.id;
        } else {
          console.log(`Homeroom teacher "${waliName}" not found for class "${className}". Class will be created without teacher.`);
        }
      }
    }

    const existingClass = await prisma.class.findFirst({
      where: {
        name: className,
        academicYearId: academicYear.id,
      },
    });

    if (existingClass) {
      await prisma.class.update({
        where: { id: existingClass.id },
        data: {
          level,
          majorId,
          teacherId: teacherId ?? existingClass.teacherId,
        },
      });
      updated++;
    } else {
      await prisma.class.create({
        data: {
          name: className,
          level,
          majorId,
          academicYearId: academicYear.id,
          teacherId: teacherId ?? undefined,
        },
      });
      created++;
    }
  }

  console.log(`Class import completed. Created: ${created}, Updated: ${updated}, Skipped (no major): ${skipped}.`);
}

async function main() {
  try {
    console.log('Starting cleanup and import from Excel...');
    await cleanDummySeed();
    const teacherNameMap = await importTeachersFromExcel();
    await importClassesFromExcel(teacherNameMap);
    console.log('All operations completed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Error during import:', err);
  process.exit(1);
});
