import { Prisma } from '@prisma/client';

export const OFFICE_LETTER_TYPES = [
  'STUDENT_CERTIFICATE',
  'TEACHER_CERTIFICATE',
  'EXAM_CARD_COVER',
  'CANDIDATE_ADMISSION_RESULT',
] as const;

export type OfficeLetterTypeCode = (typeof OFFICE_LETTER_TYPES)[number];

export function resolveOfficeLetterTitle(type: string) {
  if (type === 'STUDENT_CERTIFICATE') return 'Surat Keterangan Siswa Aktif';
  if (type === 'TEACHER_CERTIFICATE') return 'Surat Keterangan Guru/Staff Aktif';
  if (type === 'EXAM_CARD_COVER') return 'Surat Pengantar Kartu Ujian';
  if (type === 'CANDIDATE_ADMISSION_RESULT') return 'Surat Hasil Seleksi PPDB';
  return 'Surat Tata Usaha';
}

export function resolveOfficeLetterTypeCode(type: string) {
  if (type === 'STUDENT_CERTIFICATE') return 'SKSA';
  if (type === 'TEACHER_CERTIFICATE') return 'SKGA';
  if (type === 'EXAM_CARD_COVER') return 'SPKU';
  if (type === 'CANDIDATE_ADMISSION_RESULT') return 'SHPPDB';
  return 'TU';
}

export function toRomanMonth(month: number) {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romans[Math.max(0, Math.min(11, month - 1))];
}

export async function generateOfficeLetterNumber(
  tx: Prisma.TransactionClient,
  academicYearId: number,
  type: string,
  createdAt = new Date(),
) {
  const year = createdAt.getFullYear();
  const monthRoman = toRomanMonth(createdAt.getMonth() + 1);
  const typeCode = resolveOfficeLetterTypeCode(type);

  const count = await tx.officeLetter.count({
    where: {
      academicYearId,
      type,
      createdAt: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
    },
  });

  const running = String(count + 1).padStart(3, '0');
  return `${running}/TU/${typeCode}/${monthRoman}/${year}`;
}
