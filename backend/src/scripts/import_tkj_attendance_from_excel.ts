import { AttendanceStatus, PrismaClient, Role } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';
import { readdir } from 'fs/promises';

const prisma = new PrismaClient();

const DEFAULT_BASE_DIR = '/var/www/sis-project/etc/absensi';
const DEFAULT_ACADEMIC_YEAR_NAME = '2025/2026';
const DEFAULT_END_MONTH = '2026-04';

const MONTH_NAME_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MEI: 4,
  JUN: 5,
  JUL: 6,
  AGS: 7,
  AUG: 7,
  SEP: 8,
  OKT: 9,
  OCT: 9,
  NOP: 10,
  NOV: 10,
  DES: 11,
  DEC: 11,
};

type ParsedArgs = {
  apply: boolean;
  allowOverwrite: boolean;
  baseDir: string;
  academicYearName: string;
  endMonth: string;
};

type MonthSheetMeta = {
  key: string;
  sheetName: string;
  year: number;
  monthIndex: number;
};

type RosterStudent = {
  id: number;
  name: string;
  nis: string | null;
  nisn: string | null;
  classId: number | null;
};

type ExcelStudentRow = {
  rowNumber: number;
  orderNumber: number | null;
  nis: string;
  nisn: string;
  name: string;
};

type MatchResult =
  | {
      matched: true;
      student: RosterStudent;
      strategy: 'NIS' | 'NISN' | 'NAME';
    }
  | {
      matched: false;
      reason: 'NO_IDENTIFIER' | 'NO_MATCH' | 'AMBIGUOUS_NAME';
    };

type RosterIndexes = {
  byNis: Map<string, RosterStudent>;
  byNisn: Map<string, RosterStudent>;
  byName: Map<string, RosterStudent[]>;
};

type CandidateAttendance = {
  classId: number;
  academicYearId: number;
  studentId: number;
  studentName: string;
  className: string;
  sourceFile: string;
  sourceSheet: string;
  date: Date;
  dateKey: string;
  status: AttendanceStatus;
};

type ExistingAttendanceRow = {
  id: number;
  studentId: number;
  classId: number;
  academicYearId: number;
  date: Date;
  status: AttendanceStatus;
};

type ClassDryRunSummary = {
  className: string;
  fileName: string;
  dbClassId: number;
  excelRosterCount: number;
  matchedRosterCount: number;
  unmatchedExcelStudents: string[];
  ambiguousExcelStudents: string[];
  dbStudentsMissingFromExcel: string[];
  blankActiveMonthStudents: string[];
  candidateRows: number;
  blankActiveCells: number;
  unknownCodes: Array<{ sheetName: string; cell: string; rawValue: string; studentName: string }>;
};

type ConflictingExistingRow = {
  className: string;
  studentName: string;
  date: string;
  existingStatus: AttendanceStatus;
  nextStatus: AttendanceStatus;
  sourceFile: string;
  sourceSheet: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  let apply = false;
  let allowOverwrite = false;
  let baseDir = DEFAULT_BASE_DIR;
  let academicYearName = DEFAULT_ACADEMIC_YEAR_NAME;
  let endMonth = DEFAULT_END_MONTH;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg === '--allow-overwrite') {
      allowOverwrite = true;
      continue;
    }

    if (arg === '--base-dir' && nextValue) {
      baseDir = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--academic-year' && nextValue) {
      academicYearName = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--end-month' && nextValue) {
      endMonth = nextValue;
      index += 1;
      continue;
    }
  }

  return {
    apply,
    allowOverwrite,
    baseDir,
    academicYearName,
    endMonth,
  };
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeIdentifier(value: unknown): string {
  return normalizeString(value).replace(/\s+/g, '').replace(/^'+/, '').toUpperCase();
}

function normalizeName(value: unknown): string {
  return normalizeString(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase();
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const raw = cell.value as
    | undefined
    | null
    | string
    | number
    | Date
    | { formula?: string; result?: unknown };

  if (raw && typeof raw === 'object' && 'result' in raw) {
    return raw.result;
  }

  return raw;
}

function parseSheetMonth(sheetName: string): MonthSheetMeta | null {
  const trimmed = normalizeString(sheetName);
  const match = trimmed.match(/^([A-Za-z]{3})\s+(\d{2})$/);
  if (!match) return null;

  const monthToken = match[1].toUpperCase();
  const monthIndex = MONTH_NAME_MAP[monthToken];
  if (monthIndex === undefined) return null;

  const twoDigitYear = Number(match[2]);
  const year = twoDigitYear >= 70 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  return {
    key,
    sheetName: trimmed,
    year,
    monthIndex,
  };
}

function compareMonthKey(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

function isRedCell(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as { fgColor?: { argb?: string } } | undefined;
  const argb = fill?.fgColor?.argb || null;
  return argb === 'FFFF0000';
}

function toAttendanceStatus(code: string): AttendanceStatus | null {
  switch (code.replace(/[^A-Z]/g, '')) {
    case 'H':
      return 'PRESENT';
    case 'S':
      return 'SICK';
    case 'I':
      return 'PERMISSION';
    case 'A':
      return 'ABSENT';
    default:
      return null;
  }
}

function chunk<T>(rows: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

function buildAttendanceKey(studentId: number, classId: number, academicYearId: number, dateKey: string): string {
  return `${studentId}:${classId}:${academicYearId}:${dateKey}`;
}

function buildNameIndex(students: RosterStudent[]): Map<string, RosterStudent[]> {
  const index = new Map<string, RosterStudent[]>();
  for (const student of students) {
    const key = normalizeName(student.name);
    if (!key) continue;
    const bucket = index.get(key) || [];
    bucket.push(student);
    index.set(key, bucket);
  }
  return index;
}

function buildRosterIndexes(students: RosterStudent[]): RosterIndexes {
  const byNis = new Map<string, RosterStudent>();
  const byNisn = new Map<string, RosterStudent>();
  const byName = buildNameIndex(students);

  for (const student of students) {
    const nis = normalizeIdentifier(student.nis);
    if (nis) {
      byNis.set(nis, student);
    }

    const nisn = normalizeIdentifier(student.nisn);
    if (nisn) {
      byNisn.set(nisn, student);
    }
  }

  return {
    byNis,
    byNisn,
    byName,
  };
}

function parseEndMonth(endMonth: string): { year: number; monthIndex: number } {
  const match = endMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error(`Format --end-month tidak valid: ${endMonth}. Gunakan YYYY-MM.`);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error(`Nilai --end-month tidak valid: ${endMonth}.`);
  }

  return {
    year,
    monthIndex,
  };
}

function endOfMonthUtc(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

function matchExcelStudent(row: ExcelStudentRow, indexes: RosterIndexes): MatchResult {
  const nis = normalizeIdentifier(row.nis);
  if (nis) {
    const match = indexes.byNis.get(nis);
    if (match) return { matched: true, student: match, strategy: 'NIS' };
  }

  const nisn = normalizeIdentifier(row.nisn);
  if (nisn) {
    const match = indexes.byNisn.get(nisn);
    if (match) return { matched: true, student: match, strategy: 'NISN' };
  }

  const normalizedName = normalizeName(row.name);
  if (!normalizedName) {
    return { matched: false, reason: 'NO_IDENTIFIER' };
  }

  const byName = indexes.byName.get(normalizedName) || [];
  if (byName.length === 1) {
    return { matched: true, student: byName[0], strategy: 'NAME' };
  }

  if (byName.length > 1) {
    return { matched: false, reason: 'AMBIGUOUS_NAME' };
  }

  return { matched: false, reason: 'NO_MATCH' };
}

async function loadClassRoster(classId: number): Promise<RosterStudent[]> {
  return prisma.user.findMany({
    where: {
      role: Role.STUDENT,
      classId,
    },
    select: {
      id: true,
      name: true,
      nis: true,
      nisn: true,
      classId: true,
    },
    orderBy: {
      name: 'asc',
    },
  });
}

function parseExcelStudentRows(sheet: ExcelJS.Worksheet): ExcelStudentRow[] {
  const rows: ExcelStudentRow[] = [];
  for (let rowNumber = 9; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = normalizeString(cellValue(row.getCell(4)));
    if (!name) break;

    rows.push({
      rowNumber,
      orderNumber: Number(cellValue(row.getCell(1)) || 0) || null,
      nis: normalizeString(cellValue(row.getCell(2))),
      nisn: normalizeString(cellValue(row.getCell(3))),
      name,
    });
  }
  return rows;
}

function dateAtUtc(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const importEndMonth = parseEndMonth(args.endMonth);
  const importEndDate = endOfMonthUtc(importEndMonth.year, importEndMonth.monthIndex);

  const academicYear = await prisma.academicYear.findFirst({
    where: { name: args.academicYearName },
    select: {
      id: true,
      name: true,
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
  });

  if (!academicYear) {
    throw new Error(`Tahun ajaran ${args.academicYearName} tidak ditemukan.`);
  }

  const endMonth = args.endMonth;
  const fileNames = (await readdir(args.baseDir))
    .filter((item) => item.endsWith('.xlsx'))
    .sort((left, right) => left.localeCompare(right, 'id-ID'));

  const classCache = new Map<string, { id: number; name: string }>();
  const rosterCache = new Map<number, RosterStudent[]>();

  const candidates = new Map<string, CandidateAttendance>();
  const dryRunSummaries: ClassDryRunSummary[] = [];
  const dbDuplicateKeys = new Set<string>();

  for (const fileName of fileNames) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(args.baseDir, fileName));

    const referenceSheet = workbook.worksheets.find((sheet) => !sheet.name.startsWith('Rekap'));
    if (!referenceSheet) continue;

    const className = normalizeString(cellValue(referenceSheet.getCell('C4'))).toUpperCase();
    if (!className) {
      throw new Error(`Nama kelas tidak ditemukan pada file ${fileName}.`);
    }

    let dbClass = classCache.get(className);
    if (!dbClass) {
      const classRow = await prisma.class.findFirst({
        where: {
          academicYearId: academicYear.id,
          name: className,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!classRow) {
        throw new Error(`Kelas ${className} tidak ditemukan pada tahun ajaran ${academicYear.name}.`);
      }

      dbClass = classRow;
      classCache.set(className, dbClass);
    }

    let roster = rosterCache.get(dbClass.id);
    if (!roster) {
      roster = await loadClassRoster(dbClass.id);
      rosterCache.set(dbClass.id, roster);
    }
    const rosterIndexes = buildRosterIndexes(roster);

    const excelStudentRows = parseExcelStudentRows(referenceSheet);
    const matchedExcelNames = new Set<string>();
    const matchedStudentIds = new Set<number>();
    const unmatchedExcelStudents: string[] = [];
    const ambiguousExcelStudents: string[] = [];
    const blankActiveMonthStudents = new Set<string>();
    const unknownCodes: Array<{ sheetName: string; cell: string; rawValue: string; studentName: string }> = [];
    let blankActiveCells = 0;
    let candidateRows = 0;

    const matchCache = new Map<number, MatchResult>();
    for (const row of excelStudentRows) {
      const match = matchExcelStudent(row, rosterIndexes);
      matchCache.set(row.rowNumber, match);
      if (match.matched) {
        matchedExcelNames.add(row.name);
        matchedStudentIds.add(match.student.id);
      } else if (match.reason === 'AMBIGUOUS_NAME') {
        ambiguousExcelStudents.push(row.name);
      } else {
        unmatchedExcelStudents.push(row.name);
      }
    }

    const targetSheets = workbook.worksheets
      .map((sheet) => ({ sheet, meta: parseSheetMonth(sheet.name) }))
      .filter((item): item is { sheet: ExcelJS.Worksheet; meta: MonthSheetMeta } => Boolean(item.meta))
      .filter((item) => compareMonthKey(item.meta.key, endMonth) <= 0)
      .sort((left, right) => compareMonthKey(left.meta.key, right.meta.key));

    for (const { sheet, meta } of targetSheets) {
      let summaryStartColumn = 0;
      for (let column = 7; column <= sheet.columnCount; column += 1) {
        const token = normalizeString(cellValue(sheet.getRow(8).getCell(column))).toUpperCase();
        if (['H', 'S', 'I', 'A'].includes(token)) {
          summaryStartColumn = column;
          break;
        }
      }

      if (!summaryStartColumn) {
        throw new Error(`Kolom rekap harian tidak ditemukan pada ${fileName} > ${sheet.name}.`);
      }

      const activeColumns: Array<{ column: number; day: number }> = [];
      for (let column = 7; column < summaryStartColumn; column += 1) {
        if (isRedCell(sheet.getRow(7).getCell(column)) || isRedCell(sheet.getRow(8).getCell(column))) continue;
        const day = Number(cellValue(sheet.getRow(8).getCell(column)) || 0);
        if (!Number.isFinite(day) || day <= 0) continue;
        activeColumns.push({ column, day });
      }

      for (const row of excelStudentRows) {
        const match = matchCache.get(row.rowNumber);
        if (!match?.matched) continue;

        let markedCount = 0;
        for (const activeColumn of activeColumns) {
          const cell = sheet.getRow(row.rowNumber).getCell(activeColumn.column);
          const rawValue = normalizeString(cellValue(cell)).toUpperCase();
          if (!rawValue) {
            blankActiveCells += 1;
            continue;
          }

          const mappedStatus = toAttendanceStatus(rawValue);
          if (!mappedStatus) {
            unknownCodes.push({
              sheetName: sheet.name,
              cell: cell.address,
              rawValue,
              studentName: row.name,
            });
            continue;
          }

          const date = dateAtUtc(meta.year, meta.monthIndex, activeColumn.day);
          const dateKey = `${meta.key}-${String(activeColumn.day).padStart(2, '0')}`;
          const key = buildAttendanceKey(match.student.id, dbClass.id, academicYear.id, dateKey);
          if (candidates.has(key)) {
            throw new Error(`Duplikat kandidat absensi terdeteksi pada ${fileName} ${sheet.name} ${row.name} ${dateKey}.`);
          }

          candidates.set(key, {
            classId: dbClass.id,
            academicYearId: academicYear.id,
            studentId: match.student.id,
            studentName: match.student.name,
            className: dbClass.name,
            sourceFile: fileName,
            sourceSheet: sheet.name,
            date,
            dateKey,
            status: mappedStatus,
          });
          candidateRows += 1;
          markedCount += 1;
        }

        if (markedCount === 0) {
          blankActiveMonthStudents.add(row.name);
        }
      }
    }

    const dbStudentsMissingFromExcel = roster
      .filter((student) => !matchedStudentIds.has(student.id))
      .map((student) => student.name);

    dryRunSummaries.push({
      className: dbClass.name,
      fileName,
      dbClassId: dbClass.id,
      excelRosterCount: excelStudentRows.length,
      matchedRosterCount: matchedStudentIds.size,
      unmatchedExcelStudents,
      ambiguousExcelStudents,
      dbStudentsMissingFromExcel,
      blankActiveMonthStudents: Array.from(blankActiveMonthStudents).sort((left, right) =>
        left.localeCompare(right, 'id-ID'),
      ),
      candidateRows,
      blankActiveCells,
      unknownCodes,
    });
  }

  const candidateRows = Array.from(candidates.values());
  const importStartDate = candidateRows.reduce<Date | null>(
    (currentMin, row) => (currentMin === null || row.date < currentMin ? row.date : currentMin),
    null,
  );
  const existingRangeEndDate = candidateRows.reduce<Date | null>(
    (currentMax, row) => (currentMax === null || row.date > currentMax ? row.date : currentMax),
    null,
  );
  const studentIds = Array.from(new Set(candidateRows.map((row) => row.studentId)));
  const classIds = Array.from(new Set(candidateRows.map((row) => row.classId)));

  const existingRows = await prisma.dailyAttendance.findMany({
    where: {
      academicYearId: academicYear.id,
      studentId: { in: studentIds },
      classId: { in: classIds },
      date: {
        gte: importStartDate ?? academicYear.semester1Start,
        lte: existingRangeEndDate ?? importEndDate,
      },
    },
    select: {
      id: true,
      studentId: true,
      classId: true,
      academicYearId: true,
      date: true,
      status: true,
    },
  });

  const existingByKey = new Map<string, ExistingAttendanceRow>();
  for (const row of existingRows) {
    const dateKey = row.date.toISOString().slice(0, 10);
    const key = buildAttendanceKey(row.studentId, row.classId, row.academicYearId, dateKey);
    if (existingByKey.has(key)) {
      dbDuplicateKeys.add(key);
      continue;
    }
    existingByKey.set(key, row);
  }

  const createRows: CandidateAttendance[] = [];
  const compatibleExistingRows: Array<{ existing: ExistingAttendanceRow; next: CandidateAttendance }> = [];
  const conflictingExistingRows: Array<{ existing: ExistingAttendanceRow; next: CandidateAttendance }> = [];
  let unchangedRows = 0;

  for (const candidate of candidateRows) {
    const existing = existingByKey.get(
      buildAttendanceKey(candidate.studentId, candidate.classId, candidate.academicYearId, candidate.date.toISOString().slice(0, 10)),
    );
    if (!existing) {
      createRows.push(candidate);
      continue;
    }

    if (existing.status === candidate.status) {
      unchangedRows += 1;
      continue;
    }

    if (existing.status === 'LATE' && candidate.status === 'PRESENT') {
      compatibleExistingRows.push({ existing, next: candidate });
      continue;
    }

    conflictingExistingRows.push({ existing, next: candidate });
  }

  if (args.apply) {
    for (const rows of chunk(createRows, 1000)) {
      await prisma.dailyAttendance.createMany({
        data: rows.map((row) => ({
          date: row.date,
          studentId: row.studentId,
          classId: row.classId,
          academicYearId: row.academicYearId,
          status: row.status,
          note: null,
        })),
      });
    }

    if (args.allowOverwrite) {
      for (const row of compatibleExistingRows) {
        await prisma.dailyAttendance.update({
          where: { id: row.existing.id },
          data: {
            status: row.next.status,
            note: null,
          },
        });
      }

      for (const row of conflictingExistingRows) {
        await prisma.dailyAttendance.update({
          where: { id: row.existing.id },
          data: {
            status: row.next.status,
            note: null,
          },
        });
      }
    }
  }

  const statusCounts = candidateRows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] || 0) + 1;
    return accumulator;
  }, {});

  const totalUnknownCodes = dryRunSummaries.reduce((acc, item) => acc + item.unknownCodes.length, 0);
  const totalBlankActiveCells = dryRunSummaries.reduce((acc, item) => acc + item.blankActiveCells, 0);
  const totalUnmatchedExcelStudents = dryRunSummaries.reduce((acc, item) => acc + item.unmatchedExcelStudents.length, 0);
  const totalDbStudentsMissingFromExcel = dryRunSummaries.reduce((acc, item) => acc + item.dbStudentsMissingFromExcel.length, 0);

  const report = {
    mode: args.apply ? 'apply' : 'dry-run',
    academicYear: academicYear.name,
    classes: dryRunSummaries.map((item) => ({
      className: item.className,
      fileName: item.fileName,
      dbClassId: item.dbClassId,
      excelRosterCount: item.excelRosterCount,
      matchedRosterCount: item.matchedRosterCount,
      unmatchedExcelStudents: item.unmatchedExcelStudents,
      ambiguousExcelStudents: item.ambiguousExcelStudents,
      dbStudentsMissingFromExcel: item.dbStudentsMissingFromExcel,
      blankActiveMonthStudents: item.blankActiveMonthStudents,
      candidateRows: item.candidateRows,
      blankActiveCells: item.blankActiveCells,
      unknownCodes: item.unknownCodes,
    })),
    totals: {
      candidateRows: candidateRows.length,
      statusCounts,
      createRows: createRows.length,
      compatibleExistingRows: compatibleExistingRows.length,
      conflictingExistingRows: conflictingExistingRows.length,
      overwrittenCompatibleRowsOnApply: args.apply && args.allowOverwrite ? compatibleExistingRows.length : 0,
      skippedConflictingRowsOnApply: args.apply && !args.allowOverwrite ? conflictingExistingRows.length : 0,
      overwrittenConflictingRowsOnApply: args.apply && args.allowOverwrite ? conflictingExistingRows.length : 0,
      unchangedRows,
      totalUnknownCodes,
      totalBlankActiveCells,
      totalUnmatchedExcelStudents,
      totalDbStudentsMissingFromExcel,
      dbDuplicateKeys: Array.from(dbDuplicateKeys),
      conflictingExistingSamples: conflictingExistingRows.map<ConflictingExistingRow>((row) => ({
        className: row.next.className,
        studentName: row.next.studentName,
        date: row.next.date.toISOString().slice(0, 10),
        existingStatus: row.existing.status,
        nextStatus: row.next.status,
        sourceFile: row.next.sourceFile,
        sourceSheet: row.next.sourceSheet,
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
