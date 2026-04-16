import { Request, Response } from 'express';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { writeAuditLog } from '../utils/auditLog';
import { z } from 'zod';
import { Role, AdditionalDuty, Gender, StudentStatus, VerificationStatus } from '@prisma/client';
import { validateCandidateProfileDocuments } from '../utils/candidateAdmissionDocuments';
import { getNisnValidationMessage, normalizeNisnInput } from '../utils/nisn';
import { resolveHistoricalStudentScope } from '../utils/studentAcademicHistory';
import { ensureAcademicYearArchiveReadAccess } from '../utils/academicYearArchiveAccess';
import { resolveStandardSchoolDocumentHeaderSnapshot } from '../utils/standardSchoolDocumentHeader';
import {
  deriveEducationSummary,
  educationHistoriesSchema,
  normalizeEducationHistories,
  resolveProfileEducationTrack,
} from '../utils/profileEducation';

const USER_LIST_CACHE_TTL_MS = 60_000;
const USER_LIST_MAX_LIMIT = 1000;
const JWT_SIGNING_SECRET = String(process.env.JWT_SECRET || 'secret').trim();

type CachedUserListEntry = {
  expiresAt: number;
  data: any[];
};

const userListCache = new Map<string, CachedUserListEntry>();

const parseUserListLimit = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return USER_LIST_MAX_LIMIT;
  }

  return Math.min(parsed, USER_LIST_MAX_LIMIT);
};

const getCachedUserList = (key: string) => {
  const entry = userListCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    userListCache.delete(key);
    return null;
  }

  return entry.data;
};

const setCachedUserList = (key: string, data: any[]) => {
  userListCache.set(key, {
    expiresAt: Date.now() + USER_LIST_CACHE_TTL_MS,
    data,
  });
};

const clearUserListCache = () => {
  userListCache.clear();
};

const profilePrintUserSelect = {
  id: true,
  username: true,
  name: true,
  role: true,
  verificationStatus: true,
  email: true,
  phone: true,
  address: true,
  photo: true,
  nip: true,
  nis: true,
  nisn: true,
  gender: true,
  citizenship: true,
  maritalStatus: true,
  birthPlace: true,
  birthDate: true,
  nik: true,
  familyCardNumber: true,
  nuptk: true,
  highestEducation: true,
  studyProgram: true,
  religion: true,
  motherName: true,
  motherNik: true,
  childNumber: true,
  distanceToSchool: true,
  familyStatus: true,
  livingWith: true,
  transportationMode: true,
  travelTimeToSchool: true,
  kipNumber: true,
  pkhNumber: true,
  kksNumber: true,
  siblingsCount: true,
  fatherName: true,
  fatherNik: true,
  fatherEducation: true,
  fatherOccupation: true,
  fatherIncome: true,
  motherEducation: true,
  motherOccupation: true,
  motherIncome: true,
  guardianName: true,
  guardianEducation: true,
  guardianOccupation: true,
  guardianPhone: true,
  rt: true,
  rw: true,
  dusun: true,
  province: true,
  cityRegency: true,
  village: true,
  subdistrict: true,
  postalCode: true,
  ptkType: true,
  employeeStatus: true,
  appointmentDecree: true,
  appointmentDate: true,
  assignmentDecree: true,
  assignmentDate: true,
  institution: true,
  employeeActiveStatus: true,
  salarySource: true,
  additionalDuties: true,
  educationHistories: true,
  studentClass: {
    select: {
      id: true,
      name: true,
      major: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
  managedMajors: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  examinerMajor: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  children: {
    select: {
      id: true,
      name: true,
      username: true,
      nisn: true,
    },
  },
  documents: {
    select: {
      title: true,
      fileUrl: true,
      category: true,
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} as const;

function normalizeProfilePrintText(value: unknown) {
  return String(value || '').trim();
}

function normalizeProfilePrintMediaUrl(value: unknown) {
  const raw = normalizeProfilePrintText(value);
  if (!raw) return null;
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (raw.startsWith('/api/uploads/')) return raw;
  if (raw.startsWith('/uploads/')) return `/api${raw}`;
  if (raw.startsWith('/api/')) return raw;
  if (raw.startsWith('/')) return raw;
  return `/api/uploads/${raw.replace(/^\/+/, '')}`;
}

function normalizeProfilePrintTitle(value: unknown) {
  return normalizeProfilePrintText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveProfilePrintFormalPhotoUrl(params: {
  photo?: string | null;
  documents?: Array<{ title?: string | null; fileUrl?: string | null }>;
}) {
  const preferredDocument =
    (params.documents || []).find((document) => normalizeProfilePrintTitle(document.title) === 'FOTO FORMAL') || null;
  if (preferredDocument?.fileUrl) {
    return normalizeProfilePrintMediaUrl(preferredDocument.fileUrl);
  }
  return null;
}

function buildProfilePrintFingerprint(user: any) {
  const normalized = {
    id: Number(user?.id || 0),
    username: normalizeProfilePrintText(user?.username),
    name: normalizeProfilePrintText(user?.name),
    role: normalizeProfilePrintText(user?.role),
    verificationStatus: normalizeProfilePrintText(user?.verificationStatus),
    email: normalizeProfilePrintText(user?.email),
    phone: normalizeProfilePrintText(user?.phone),
    address: normalizeProfilePrintText(user?.address),
    photo: normalizeProfilePrintMediaUrl(user?.photo),
    nip: normalizeProfilePrintText(user?.nip),
    nis: normalizeProfilePrintText(user?.nis),
    nisn: normalizeProfilePrintText(user?.nisn),
    gender: normalizeProfilePrintText(user?.gender),
    citizenship: normalizeProfilePrintText(user?.citizenship),
    maritalStatus: normalizeProfilePrintText(user?.maritalStatus),
    birthPlace: normalizeProfilePrintText(user?.birthPlace),
    birthDate: user?.birthDate ? new Date(user.birthDate).toISOString() : '',
    nik: normalizeProfilePrintText(user?.nik),
    familyCardNumber: normalizeProfilePrintText(user?.familyCardNumber),
    nuptk: normalizeProfilePrintText(user?.nuptk),
    highestEducation: normalizeProfilePrintText(user?.highestEducation),
    studyProgram: normalizeProfilePrintText(user?.studyProgram),
    religion: normalizeProfilePrintText(user?.religion),
    motherName: normalizeProfilePrintText(user?.motherName),
    motherNik: normalizeProfilePrintText(user?.motherNik),
    childNumber: user?.childNumber ?? null,
    distanceToSchool: normalizeProfilePrintText(user?.distanceToSchool),
    familyStatus: normalizeProfilePrintText(user?.familyStatus),
    livingWith: normalizeProfilePrintText(user?.livingWith),
    transportationMode: normalizeProfilePrintText(user?.transportationMode),
    travelTimeToSchool: normalizeProfilePrintText(user?.travelTimeToSchool),
    kipNumber: normalizeProfilePrintText(user?.kipNumber),
    pkhNumber: normalizeProfilePrintText(user?.pkhNumber),
    kksNumber: normalizeProfilePrintText(user?.kksNumber),
    siblingsCount: user?.siblingsCount ?? null,
    fatherName: normalizeProfilePrintText(user?.fatherName),
    fatherNik: normalizeProfilePrintText(user?.fatherNik),
    fatherEducation: normalizeProfilePrintText(user?.fatherEducation),
    fatherOccupation: normalizeProfilePrintText(user?.fatherOccupation),
    fatherIncome: normalizeProfilePrintText(user?.fatherIncome),
    motherEducation: normalizeProfilePrintText(user?.motherEducation),
    motherOccupation: normalizeProfilePrintText(user?.motherOccupation),
    motherIncome: normalizeProfilePrintText(user?.motherIncome),
    guardianName: normalizeProfilePrintText(user?.guardianName),
    guardianEducation: normalizeProfilePrintText(user?.guardianEducation),
    guardianOccupation: normalizeProfilePrintText(user?.guardianOccupation),
    guardianPhone: normalizeProfilePrintText(user?.guardianPhone),
    rt: normalizeProfilePrintText(user?.rt),
    rw: normalizeProfilePrintText(user?.rw),
    dusun: normalizeProfilePrintText(user?.dusun),
    province: normalizeProfilePrintText(user?.province),
    cityRegency: normalizeProfilePrintText(user?.cityRegency),
    village: normalizeProfilePrintText(user?.village),
    subdistrict: normalizeProfilePrintText(user?.subdistrict),
    postalCode: normalizeProfilePrintText(user?.postalCode),
    ptkType: normalizeProfilePrintText(user?.ptkType),
    employeeStatus: normalizeProfilePrintText(user?.employeeStatus),
    appointmentDecree: normalizeProfilePrintText(user?.appointmentDecree),
    appointmentDate: user?.appointmentDate ? new Date(user.appointmentDate).toISOString() : '',
    assignmentDecree: normalizeProfilePrintText(user?.assignmentDecree),
    assignmentDate: user?.assignmentDate ? new Date(user.assignmentDate).toISOString() : '',
    institution: normalizeProfilePrintText(user?.institution),
    employeeActiveStatus: normalizeProfilePrintText(user?.employeeActiveStatus),
    salarySource: normalizeProfilePrintText(user?.salarySource),
    additionalDuties: Array.isArray(user?.additionalDuties)
      ? user.additionalDuties.map((item: unknown) => normalizeProfilePrintText(item)).filter(Boolean).sort()
      : [],
    studentClass: user?.studentClass
      ? {
          id: Number(user.studentClass.id || 0),
          name: normalizeProfilePrintText(user.studentClass.name),
          major: user.studentClass.major
            ? {
                id: Number(user.studentClass.major.id || 0),
                name: normalizeProfilePrintText(user.studentClass.major.name),
                code: normalizeProfilePrintText(user.studentClass.major.code),
              }
            : null,
        }
      : null,
    managedMajors: Array.isArray(user?.managedMajors)
      ? user.managedMajors
          .map((major: any) => ({
            id: Number(major?.id || 0),
            name: normalizeProfilePrintText(major?.name),
            code: normalizeProfilePrintText(major?.code),
          }))
          .sort((a: { code: string; name: string }, b: { code: string; name: string }) =>
            `${a.code}-${a.name}`.localeCompare(`${b.code}-${b.name}`),
          )
      : [],
    examinerMajor: user?.examinerMajor
      ? {
          id: Number(user.examinerMajor.id || 0),
          name: normalizeProfilePrintText(user.examinerMajor.name),
          code: normalizeProfilePrintText(user.examinerMajor.code),
        }
      : null,
    children: Array.isArray(user?.children)
      ? user.children
          .map((child: any) => ({
            id: Number(child?.id || 0),
            name: normalizeProfilePrintText(child?.name),
            username: normalizeProfilePrintText(child?.username),
            nisn: normalizeProfilePrintText(child?.nisn),
          }))
          .sort((a: { name: string; nisn: string }, b: { name: string; nisn: string }) =>
            `${a.name}-${a.nisn}`.localeCompare(`${b.name}-${b.nisn}`),
          )
      : [],
    educationHistories: Array.isArray(user?.educationHistories)
      ? user.educationHistories.map((history: any) => ({
          level: normalizeProfilePrintText(history?.level),
          institutionName: normalizeProfilePrintText(history?.institutionName),
          faculty: normalizeProfilePrintText(history?.faculty),
          studyProgram: normalizeProfilePrintText(history?.studyProgram),
          gpa: normalizeProfilePrintText(history?.gpa),
          degree: normalizeProfilePrintText(history?.degree),
          nrg: normalizeProfilePrintText(history?.nrg),
          documents: Array.isArray(history?.documents)
            ? history.documents
                .map((document: any) => ({
                  kind: normalizeProfilePrintText(document?.kind),
                  label: normalizeProfilePrintText(document?.label),
                  originalName: normalizeProfilePrintText(document?.originalName),
                  fileUrl: normalizeProfilePrintMediaUrl(document?.fileUrl),
                }))
                .sort((a: { kind: string; label: string }, b: { kind: string; label: string }) =>
                  `${a.kind}-${a.label}`.localeCompare(`${b.kind}-${b.label}`),
                )
            : [],
        }))
      : [],
    documents: Array.isArray(user?.documents)
      ? user.documents
          .map((document: any) => ({
            title: normalizeProfilePrintText(document?.title),
            fileUrl: normalizeProfilePrintMediaUrl(document?.fileUrl),
            category: normalizeProfilePrintText(document?.category),
          }))
          .sort((a: { title: string; category: string }, b: { title: string; category: string }) =>
            `${a.title}-${a.category}`.localeCompare(`${b.title}-${b.category}`),
          )
      : [],
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function getFirstProfileHeaderValue(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.length > 0) || '';
}

function resolveProfilePrintPublicBaseUrl(req: Request): string {
  const configuredBaseUrl = String(
    process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_BASE_URL || '',
  ).trim();

  if (configuredBaseUrl) {
    const normalized = /^https?:\/\//i.test(configuredBaseUrl) ? configuredBaseUrl : `https://${configuredBaseUrl}`;
    return normalized.replace(/\/+$/, '');
  }

  const forwardedProto = getFirstProfileHeaderValue(req.headers['x-forwarded-proto']);
  const forwardedHost = getFirstProfileHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || getFirstProfileHeaderValue(req.headers.host);
  if (host) {
    const protocol = forwardedProto || req.protocol || 'https';
    return `${protocol}://${host}`.replace(/\/+$/, '');
  }

  return 'https://siskgb2.id';
}

type ProfilePrintVerificationTokenPayload = {
  userId: number;
  fingerprint: string;
  generatedAtMs: number;
};

function buildProfilePrintVerificationToken(payload: ProfilePrintVerificationTokenPayload) {
  return jwt.sign(
    {
      k: 'PS',
      u: payload.userId,
      f: payload.fingerprint.slice(0, 24),
      g: payload.generatedAtMs,
    },
    JWT_SIGNING_SECRET,
    {
    noTimestamp: true,
    },
  );
}

function verifyProfilePrintVerificationToken(token: string): ProfilePrintVerificationTokenPayload {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SIGNING_SECRET);
  } catch {
    throw new ApiError(404, 'Tautan verifikasi ringkasan profil tidak valid.');
  }
  if (!decoded || typeof decoded !== 'object') {
    throw new ApiError(404, 'Tautan verifikasi ringkasan profil tidak valid.');
  }
  const record = decoded as Partial<ProfilePrintVerificationTokenPayload> & {
    kind?: string;
    userId?: number;
    fingerprint?: string;
    generatedAtMs?: number;
    k?: string;
    u?: number;
    f?: string;
    g?: number;
  };
  const kind = normalizeProfilePrintText(record.k || record.kind).toUpperCase();
  if (kind !== 'PS' && kind !== 'PROFILE_SUMMARY') {
    throw new ApiError(404, 'Tautan verifikasi ringkasan profil tidak valid.');
  }
  const userId = Number(record.u ?? record.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new ApiError(404, 'Tautan verifikasi ringkasan profil tidak valid.');
  }
  const fingerprint = normalizeProfilePrintText(record.f || record.fingerprint);
  if (!fingerprint) {
    throw new ApiError(404, 'Tautan verifikasi ringkasan profil tidak valid.');
  }
  const generatedAtMs = Number(record.g ?? record.generatedAtMs);
  if (!Number.isFinite(generatedAtMs) || generatedAtMs <= 0) {
    throw new ApiError(404, 'Tautan verifikasi ringkasan profil tidak valid.');
  }
  return {
    userId,
    fingerprint,
    generatedAtMs,
  };
}

function buildProfilePrintVerificationUrl(baseUrl: string, verificationToken: string) {
  return `${baseUrl}/v/ps/${verificationToken}`;
}

async function buildProfilePrintVerificationQrDataUrl(verificationUrl: string) {
  return QRCode.toDataURL(verificationUrl, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'L',
    color: {
      dark: '#000000',
      light: '#FFFFFFFF',
    },
  });
}

const dateSchema = z
  .string()
  .transform((str, ctx) => {
    if (!str) return null;
    const date = new Date(str);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Format tanggal tidak valid',
      });
      return z.NEVER;
    }
    return date;
  })
  .optional()
  .nullable();

const emailSchema = z
  .string()
  .email()
  .or(z.literal(''))
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value));

const normalizeDigitsInput = (value?: string | null) => String(value || '').replace(/\s+/g, '').trim();

const optionalExactDigitsField = (label: string, length: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((value) => normalizeDigitsInput(value))
    .refine((value) => value.length === 0 || new RegExp(`^\\d{${length}}$`).test(value), {
      message: `${label} harus ${length} digit angka`,
    })
    .transform((value) => (value === '' ? null : value));

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.nativeEnum(Role),
  nip: z.string().optional().nullable(),
  nis: z.string().optional().nullable(),
  nisn: z.string().optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  citizenship: z.string().optional().nullable(),
  maritalStatus: z.string().optional().nullable(),
  birthPlace: z.string().optional().nullable(),
  birthDate: dateSchema,
  email: emailSchema,
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  religion: z.string().optional().nullable(),
  nik: optionalExactDigitsField('NIK', 16),
  familyCardNumber: optionalExactDigitsField('Nomor KK', 16),
  nuptk: optionalExactDigitsField('NUPTK', 16),
  highestEducation: z.string().optional().nullable(),
  studyProgram: z.string().optional().nullable(),
  educationHistories: educationHistoriesSchema,
  motherName: z.string().optional().nullable(),
  motherNik: optionalExactDigitsField('NIK Ibu', 16),
  childNumber: z.number().int().optional().nullable(),
  distanceToSchool: z.string().optional().nullable(),
  familyStatus: z.string().optional().nullable(),
  livingWith: z.string().optional().nullable(),
  transportationMode: z.string().optional().nullable(),
  travelTimeToSchool: z.string().optional().nullable(),
  kipNumber: z.string().optional().nullable(),
  pkhNumber: z.string().optional().nullable(),
  kksNumber: z.string().optional().nullable(),
  siblingsCount: z.number().int().optional().nullable(),
  fatherNik: optionalExactDigitsField('NIK Ayah', 16),
  preferences: z.any().optional().nullable(),
  fatherName: z.string().optional().nullable(),
  fatherEducation: z.string().optional().nullable(),
  fatherOccupation: z.string().optional().nullable(),
  fatherIncome: z.string().optional().nullable(),
  motherEducation: z.string().optional().nullable(),
  motherOccupation: z.string().optional().nullable(),
  motherIncome: z.string().optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianEducation: z.string().optional().nullable(),
  guardianOccupation: z.string().optional().nullable(),
  guardianPhone: z.string().optional().nullable(),
  rt: z.string().optional().nullable(),
  rw: z.string().optional().nullable(),
  dusun: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  provinceCode: optionalExactDigitsField('Kode Provinsi', 2),
  cityRegency: z.string().optional().nullable(),
  cityRegencyCode: optionalExactDigitsField('Kode Kabupaten / Kota', 4),
  village: z.string().optional().nullable(),
  subdistrict: z.string().optional().nullable(),
  subdistrictCode: optionalExactDigitsField('Kode Kecamatan', 7),
  villageCode: optionalExactDigitsField('Kode Desa / Kelurahan', 10),
  postalCode: optionalExactDigitsField('Kode Pos', 5),
  ptkType: z.string().optional().nullable(),
  employeeStatus: z.string().optional().nullable(),
  appointmentDecree: z.string().optional().nullable(),
  appointmentDate: dateSchema,
  assignmentDecree: z.string().optional().nullable(),
  assignmentDate: dateSchema,
  institution: z.string().optional().nullable(),
  employeeActiveStatus: z.string().optional().nullable(),
  salarySource: z.string().optional().nullable(),
  classId: z.number().optional().nullable(),
  documents: z.array(z.object({
    title: z.string(),
    fileUrl: z.string(),
    category: z.string(),
  })).optional(),
  studentStatus: z.nativeEnum(StudentStatus).optional().default(StudentStatus.ACTIVE),
  additionalDuties: z.array(z.nativeEnum(AdditionalDuty)).optional(),
  managedMajorIds: z.array(z.number()).optional(),
  examinerMajorId: z.number().optional().nullable(),
  childNisns: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  // Profile fields
  nip: z.string().optional().nullable(),
  nis: z.string().optional().nullable(),
  nisn: z.string().optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  citizenship: z.string().optional().nullable(),
  maritalStatus: z.string().optional().nullable(),
  birthPlace: z.string().optional().nullable(),
  birthDate: dateSchema,
  email: emailSchema,
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  photo: z.string().optional().nullable(),
  
  // New Personal Data
  religion: z.string().optional().nullable(),
  nik: optionalExactDigitsField('NIK', 16),
  familyCardNumber: optionalExactDigitsField('Nomor KK', 16),
  nuptk: optionalExactDigitsField('NUPTK', 16),
  highestEducation: z.string().optional().nullable(),
  studyProgram: z.string().optional().nullable(),
  educationHistories: educationHistoriesSchema,
  motherName: z.string().optional().nullable(),
  motherNik: optionalExactDigitsField('NIK Ibu', 16),
  childNumber: z.number().int().optional().nullable(),
  distanceToSchool: z.string().optional().nullable(),
  familyStatus: z.string().optional().nullable(),
  livingWith: z.string().optional().nullable(),
  transportationMode: z.string().optional().nullable(),
  travelTimeToSchool: z.string().optional().nullable(),
  kipNumber: z.string().optional().nullable(),
  pkhNumber: z.string().optional().nullable(),
  kksNumber: z.string().optional().nullable(),
  siblingsCount: z.number().int().optional().nullable(),
  fatherNik: optionalExactDigitsField('NIK Ayah', 16),
  fatherName: z.string().optional().nullable(),
  fatherEducation: z.string().optional().nullable(),
  fatherOccupation: z.string().optional().nullable(),
  fatherIncome: z.string().optional().nullable(),
  motherEducation: z.string().optional().nullable(),
  motherOccupation: z.string().optional().nullable(),
  motherIncome: z.string().optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianEducation: z.string().optional().nullable(),
  guardianOccupation: z.string().optional().nullable(),
  guardianPhone: z.string().optional().nullable(),

  // New Contact Data
  rt: z.string().optional().nullable(),
  rw: z.string().optional().nullable(),
  dusun: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  provinceCode: optionalExactDigitsField('Kode Provinsi', 2),
  cityRegency: z.string().optional().nullable(),
  cityRegencyCode: optionalExactDigitsField('Kode Kabupaten / Kota', 4),
  village: z.string().optional().nullable(),
  subdistrict: z.string().optional().nullable(),
  subdistrictCode: optionalExactDigitsField('Kode Kecamatan', 7),
  villageCode: optionalExactDigitsField('Kode Desa / Kelurahan', 10),
  postalCode: optionalExactDigitsField('Kode Pos', 5),

  // New Employment Data
  ptkType: z.string().optional().nullable(),
  employeeStatus: z.string().optional().nullable(),
  appointmentDecree: z.string().optional().nullable(),
  appointmentDate: dateSchema,
  assignmentDecree: z.string().optional().nullable(),
  assignmentDate: dateSchema,
  institution: z.string().optional().nullable(),
  employeeActiveStatus: z.string().optional().nullable(),
  salarySource: z.string().optional().nullable(),
  classId: z.number().optional().nullable(),

  // Documents (URLs and names)
  documents: z.array(z.object({
    title: z.string(),
    fileUrl: z.string(),
    category: z.string(),
  })).optional(),

  studentStatus: z.nativeEnum(StudentStatus).optional(),
  additionalDuties: z.array(z.nativeEnum(AdditionalDuty)).optional(),
  managedMajorIds: z.array(z.number()).optional(),
  examinerMajorId: z.number().optional().nullable(),
  childNisns: z.array(z.string()).optional(),
  verificationStatus: z.nativeEnum(VerificationStatus).optional(),
  preferences: z.any().optional().nullable(),
});

const bulkVerifySchema = z.object({
  userIds: z.array(z.number().int()).min(1),
});

const nisnInputSchema = z
  .string()
  .transform((value) => normalizeNisnInput(value))
  .pipe(
    z.string().superRefine((value, ctx) => {
      const message = getNisnValidationMessage(value);
      if (message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
        });
      }
    }),
  );

const parentChildLinkSchema = z.object({
  nisn: nisnInputSchema,
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal lahir wajib menggunakan format YYYY-MM-DD'),
});

const parentChildLookupSchema = z.object({
  nisn: nisnInputSchema,
});

const parentChildSelect = {
  id: true,
  name: true,
  username: true,
  nis: true,
  nisn: true,
  birthDate: true,
  studentStatus: true,
  verificationStatus: true,
  studentClass: {
    select: {
      id: true,
      name: true,
      major: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
} as const;

function normalizeDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role, verificationStatus, class_id } = req.query;
  const user = (req as any).user;
  const limit = parseUserListLimit(req.query.limit);
  const where: any = {};
  let historicalStudentScope: Awaited<ReturnType<typeof resolveHistoricalStudentScope>> | null = null;
  const canUseUserListCache = !class_id;
  const userListCacheKey = canUseUserListCache
    ? JSON.stringify({
        role: String(role || '').trim().toUpperCase(),
        verificationStatus: String(verificationStatus || '').trim().toUpperCase(),
        limit,
      })
    : null;

  if (userListCacheKey) {
    const cachedUsers = getCachedUserList(userListCacheKey);
    if (cachedUsers) {
      res.status(200).json(new ApiResponse(200, cachedUsers, 'Daftar pengguna berhasil diambil'));
      return;
    }
  }
  
  if (role) {
    where.role = String(role);
  }

  if (verificationStatus) {
    where.verificationStatus = String(verificationStatus);
  }

  if (class_id) {
    const parsedClassId = Number(class_id);
    const normalizedRole = String(role || '').trim().toUpperCase();
    const shouldUseHistoricalStudentScope = !normalizedRole || normalizedRole === Role.STUDENT;

    if (shouldUseHistoricalStudentScope && Number.isFinite(parsedClassId) && parsedClassId > 0) {
      const selectedClass = await prisma.class.findUnique({
        where: { id: parsedClassId },
        select: { id: true, academicYearId: true },
      });

      if (selectedClass) {
        await ensureAcademicYearArchiveReadAccess({
          actorId: Number(user?.id || 0),
          actorRole: user?.role || null,
          academicYearId: selectedClass.academicYearId,
          module: 'CLASS_ROSTER',
          classId: selectedClass.id,
        });

        historicalStudentScope = await resolveHistoricalStudentScope({
          academicYearId: selectedClass.academicYearId,
          classId: selectedClass.id,
        });
        where.role = Role.STUDENT;
        where.id = {
          in: historicalStudentScope.studentIds.length > 0 ? historicalStudentScope.studentIds : [-1],
        };
      } else {
        where.role = Role.STUDENT;
        where.id = { in: [-1] };
      }
    } else {
      where.classId = parsedClassId;
    }
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      nip: true,
      nis: true,
      nisn: true,
      gender: true,
      citizenship: true,
      maritalStatus: true,
      birthPlace: true,
      birthDate: true,
      email: true,
      phone: true,
      address: true,
      nik: true,
      familyCardNumber: true,
      nuptk: true,
      highestEducation: true,
      studyProgram: true,
      religion: true,
      educationHistories: true,
      motherName: true,
      motherNik: true,
      childNumber: true,
      distanceToSchool: true,
      familyStatus: true,
      livingWith: true,
      transportationMode: true,
      travelTimeToSchool: true,
      kipNumber: true,
      pkhNumber: true,
      kksNumber: true,
      siblingsCount: true,
      fatherNik: true,
      fatherName: true,
      fatherEducation: true,
      fatherOccupation: true,
      fatherIncome: true,
      motherEducation: true,
      motherOccupation: true,
      motherIncome: true,
      guardianName: true,
      guardianEducation: true,
      guardianOccupation: true,
      guardianPhone: true,
      rt: true,
      rw: true,
      dusun: true,
      province: true,
      provinceCode: true,
      cityRegency: true,
      cityRegencyCode: true,
      village: true,
      subdistrict: true,
      subdistrictCode: true,
      villageCode: true,
      postalCode: true,
      ptkType: true,
      employeeStatus: true,
      appointmentDecree: true,
      appointmentDate: true,
      assignmentDecree: true,
      assignmentDate: true,
      institution: true,
      employeeActiveStatus: true,
      salarySource: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          major: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      studentStatus: true,
      verificationStatus: true,
      additionalDuties: true,
      managedMajors: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      examinerMajor: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      teacherClasses: {
        select: {
          id: true,
          name: true,
        },
      },
      children: {
        select: {
          id: true,
          name: true,
          username: true,
          nisn: true,
        },
      },
      photo: true,
      preferences: true,
      documents: true,
      createdAt: true,
      updatedAt: true,
    } as any,
    orderBy: {
      name: 'asc',
    },
    take: limit,
  });

  const normalizedUsers = historicalStudentScope
    ? (users as Array<any>).map((user) => {
        const historicalStudent = historicalStudentScope.studentMap.get(Number(user.id));
        if (!historicalStudent?.studentClass) return user;

        return {
          ...user,
          classId: historicalStudent.studentClass.id,
          studentClass: {
            id: historicalStudent.studentClass.id,
            name: historicalStudent.studentClass.name,
            major: historicalStudent.studentClass.major
              ? {
                  id: historicalStudent.studentClass.major.id,
                  name: historicalStudent.studentClass.major.name,
                  code: historicalStudent.studentClass.major.code,
                }
              : null,
          },
        };
      })
    : users;

  if (userListCacheKey) {
    setCachedUserList(userListCacheKey, normalizedUsers as any[]);
  }

  res.status(200).json(new ApiResponse(200, normalizedUsers, 'Daftar pengguna berhasil diambil'));
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id: Number(id) },
    include: {
      documents: true,
      studentClass: {
        select: {
          id: true,
          name: true,
        },
      },
      managedMajors: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      examinerMajor: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      teacherClasses: {
        select: {
          id: true,
          name: true
        }
      },
      children: {
        select: {
          id: true,
          name: true,
          username: true,
          nisn: true,
        }
      }
    }
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const { password, ...userWithoutPassword } = user;

  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Data pengguna berhasil diambil'));
});

export const getMyProfilePrintSummary = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number } }).user;
  if (!currentUser?.id) {
    throw new ApiError(401, 'Sesi login tidak valid');
  }

  const [documentHeader, user] = await Promise.all([
    resolveStandardSchoolDocumentHeaderSnapshot(),
    prisma.user.findUnique({
      where: { id: Number(currentUser.id) },
      select: profilePrintUserSelect,
    }),
  ]);

  if (!user) {
    throw new ApiError(404, 'Profil pengguna tidak ditemukan');
  }

  const generatedAt = new Date().toISOString();
  const fingerprint = buildProfilePrintFingerprint(user);
  const verificationToken = buildProfilePrintVerificationToken({
    userId: Number(user.id),
    fingerprint,
    generatedAtMs: new Date(generatedAt).getTime(),
  });
  const verificationUrl = buildProfilePrintVerificationUrl(
    resolveProfilePrintPublicBaseUrl(req),
    verificationToken,
  );
  const verificationQrDataUrl = await buildProfilePrintVerificationQrDataUrl(verificationUrl);
  const formalPhotoUrl = resolveProfilePrintFormalPhotoUrl({
    photo: user.photo,
    documents: user.documents,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        generatedAt,
        schoolName: documentHeader.schoolFormalName,
        formalPhotoUrl,
        verification: {
          token: verificationToken,
          verificationUrl,
          verificationQrDataUrl,
        },
        user,
      },
      'Ringkasan print profil berhasil diambil',
    ),
  );
});

export const verifyPublicProfilePrintSummary = asyncHandler(async (req: Request, res: Response) => {
  const token = normalizeProfilePrintText(req.params.token);
  if (!token) {
    throw new ApiError(404, 'Tautan verifikasi ringkasan profil tidak valid.');
  }

  const decoded = verifyProfilePrintVerificationToken(token);
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: profilePrintUserSelect,
  });

  if (!user) {
    throw new ApiError(404, 'Profil pengguna tidak ditemukan.');
  }

  const fingerprint = buildProfilePrintFingerprint(user);
  if (!fingerprint.startsWith(decoded.fingerprint)) {
    throw new ApiError(404, 'Ringkasan profil ini sudah tidak sesuai dengan data terbaru.');
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        valid: true,
        verifiedAt: new Date().toISOString(),
        generatedAt: new Date(decoded.generatedAtMs).toISOString(),
        snapshot: {
          formalPhotoUrl: resolveProfilePrintFormalPhotoUrl({
            photo: user.photo,
            documents: user.documents,
          }),
          user,
        },
      },
      'Ringkasan profil berhasil diverifikasi',
    ),
  );
});

export const listMyChildren = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      children: {
        select: parentChildSelect,
        orderBy: {
          name: 'asc',
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, parent.children, 'Data anak berhasil diambil'));
});

export const lookupMyChild = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  const { nisn } = parentChildLookupSchema.parse(req.query);

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      id: true,
      children: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const student = await prisma.user.findFirst({
    where: {
      role: Role.STUDENT,
      nisn,
    },
    select: {
      ...parentChildSelect,
      parents: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!student) {
    throw new ApiError(404, 'Data siswa dengan NISN tersebut tidak ditemukan');
  }

  const alreadyLinkedToCurrentParent = parent.children.some((child) => child.id === student.id);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        student: {
          id: student.id,
          name: student.name,
          username: student.username,
          nis: student.nis,
          nisn: student.nisn,
          birthDate: student.birthDate,
          studentStatus: student.studentStatus,
          verificationStatus: student.verificationStatus,
          studentClass: student.studentClass,
        },
        alreadyLinkedToCurrentParent,
        linkedParentCount: student.parents.length,
        oneTimeWarning:
          'Setiap NISN cukup dikaitkan satu kali ke akun ini. Jika memiliki lebih dari satu anak, ulangi proses dengan NISN yang berbeda.',
      },
      alreadyLinkedToCurrentParent
        ? 'Data siswa sudah terhubung ke akun orang tua ini'
        : 'Data siswa ditemukan. Lanjutkan verifikasi tanggal lahir untuk menghubungkan akun.',
    ),
  );
});

export const linkMyChild = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  const { nisn, birthDate } = parentChildLinkSchema.parse(req.body);

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      id: true,
      children: {
        select: {
          id: true,
          nisn: true,
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const student = await prisma.user.findFirst({
    where: {
      role: Role.STUDENT,
      nisn,
    },
    select: {
      id: true,
      name: true,
      nisn: true,
      birthDate: true,
    },
  });

  if (!student) {
    throw new ApiError(404, 'Data siswa dengan NISN tersebut tidak ditemukan');
  }

  if (!student.birthDate) {
    throw new ApiError(400, 'Data tanggal lahir siswa belum tersedia. Hubungi admin sekolah.');
  }

  if (normalizeDateOnly(student.birthDate) !== birthDate) {
    throw new ApiError(400, 'NISN dan tanggal lahir tidak cocok');
  }

  const alreadyLinked = parent.children.some((child) => child.id === student.id);

  if (!alreadyLinked) {
    await prisma.user.update({
      where: { id: parent.id },
      data: {
        children: {
          connect: { id: student.id },
        },
      },
    });
  }

  clearUserListCache();

  const refreshedParent = await prisma.user.findUnique({
    where: { id: parent.id },
    select: {
      children: {
        select: parentChildSelect,
        orderBy: {
          name: 'asc',
        },
      },
    },
  });

  res.status(alreadyLinked ? 200 : 201).json(
    new ApiResponse(
      alreadyLinked ? 200 : 201,
      refreshedParent?.children || [],
      alreadyLinked
        ? 'Data anak sudah terhubung ke akun orang tua ini'
        : `Data ${student.name} berhasil dihubungkan ke akun orang tua`,
    ),
  );
});

export const unlinkMyChild = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;
  const childId = Number(req.params.childId);

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  if (!Number.isInteger(childId) || childId <= 0) {
    throw new ApiError(400, 'ID anak tidak valid');
  }

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      id: true,
      children: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const child = parent.children.find((item) => item.id === childId);
  if (!child) {
    throw new ApiError(404, 'Data anak tidak terhubung ke akun orang tua ini');
  }

  await prisma.user.update({
    where: { id: parent.id },
    data: {
      children: {
        disconnect: { id: childId },
      },
    },
  });

  clearUserListCache();

  const refreshedParent = await prisma.user.findUnique({
    where: { id: parent.id },
    select: {
      children: {
        select: parentChildSelect,
        orderBy: {
          name: 'asc',
        },
      },
    },
  });

  res.status(200).json(
    new ApiResponse(200, refreshedParent?.children || [], `Data ${child.name} berhasil dilepas dari akun orang tua`),
  );
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { documents, childNisns, managedMajorIds, examinerMajorId, educationHistories, ...body } =
    createUserSchema.parse(req.body);

  if (body.role === Role.CALON_SISWA && documents) {
    const validation = validateCandidateProfileDocuments(documents);
    if (validation.errors.length > 0) {
      throw new ApiError(400, `Dokumen calon siswa tidak valid: ${validation.errors.join(' | ')}`);
    }
  }

  // Enforce username = NISN for students
  if (body.role === Role.STUDENT) {
    if (!body.nisn) {
      throw new ApiError(400, 'NISN wajib diisi untuk siswa');
    }
    body.username = body.nisn;
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: body.username },
  });

  if (existingUser) {
    throw new ApiError(400, 'Username sudah digunakan');
  }

  const hashedPassword = await bcrypt.hash(body.password, 10);
  const normalizedEducationHistories =
    typeof educationHistories !== 'undefined'
      ? normalizeEducationHistories(educationHistories, resolveProfileEducationTrack(body.role))
      : undefined;
  const educationSummary = normalizedEducationHistories
    ? deriveEducationSummary(normalizedEducationHistories, resolveProfileEducationTrack(body.role))
    : null;

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        ...body,
        educationHistories: typeof normalizedEducationHistories !== 'undefined' ? (normalizedEducationHistories as any) : undefined,
        highestEducation: educationSummary ? educationSummary.highestEducation : body.highestEducation,
        studyProgram: educationSummary ? educationSummary.studyProgram : body.studyProgram,
        password: hashedPassword,
        birthDate: (body as any).birthDate ?? undefined,
        examinerMajorId: examinerMajorId,
        managedMajors: managedMajorIds ? {
          connect: managedMajorIds.map(id => ({ id }))
        } : undefined,
        documents: documents ? {
          create: documents
        } : undefined
      },
      include: {
        documents: true,
        children: {
          select: {
            id: true,
            name: true,
            username: true,
            nisn: true,
          }
        }
      }
    });

    if (body.role === Role.PARENT && Array.isArray(childNisns)) {
      const normalizedChildNisns = childNisns
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (normalizedChildNisns.length > 0) {
        const children = await tx.user.findMany({
          where: {
            role: Role.STUDENT,
            nisn: {
              in: normalizedChildNisns,
            },
          },
        });

        if (children.length !== normalizedChildNisns.length) {
          throw new ApiError(400, 'Beberapa NISN siswa tidak ditemukan');
        }

        await tx.user.update({
          where: { id: created.id },
          data: {
            children: {
              connect: children.map((child) => ({ id: child.id })),
            },
          },
        });
      }
    }

    return created;
  });

  const { password, ...userWithoutPassword } = user;

  clearUserListCache();

  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Pengguna berhasil dibuat'));
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // @ts-ignore
  const currentUser = req.user;
  if (currentUser?.role !== Role.ADMIN && currentUser?.id !== Number(id)) {
    throw new ApiError(403, 'Anda tidak memiliki izin untuk mengubah data pengguna ini');
  }

  const { documents, childNisns, managedMajorIds, examinerMajorId, educationHistories, ...body } =
    updateUserSchema.parse(req.body);

  // Prevent non-admin from updating sensitive fields
  if (currentUser?.role !== Role.ADMIN) {
    // Non-admin hanya boleh mengubah profil dirinya sendiri (termasuk password akun sendiri)
    delete body.username;
    delete body.nis;
    delete body.nisn;
    delete body.role;
    delete body.verificationStatus;
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(id) },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  if (body.username && body.username !== user.username) {
    const existingUser = await prisma.user.findUnique({
      where: { username: body.username },
    });
    if (existingUser) {
      throw new ApiError(400, 'Username sudah digunakan');
    }
  }

  let hashedPassword = undefined;
  if (body.password) {
    hashedPassword = await bcrypt.hash(body.password, 10);
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const roleAfterUpdate = body.role ?? user.role;
    const normalizedEducationHistories =
      typeof educationHistories !== 'undefined'
        ? normalizeEducationHistories(educationHistories, resolveProfileEducationTrack(roleAfterUpdate))
        : undefined;
    const educationSummary = normalizedEducationHistories
      ? deriveEducationSummary(normalizedEducationHistories, resolveProfileEducationTrack(roleAfterUpdate))
      : null;

    if (roleAfterUpdate === Role.CALON_SISWA && documents) {
      const validation = validateCandidateProfileDocuments(documents);
      if (validation.errors.length > 0) {
        throw new ApiError(400, `Dokumen calon siswa tidak valid: ${validation.errors.join(' | ')}`);
      }
    }

    // Lock identity fields for student self-update
    if (currentUser?.role !== Role.ADMIN && user.role === Role.STUDENT) {
      delete body.name;
      delete body.nis;
      delete body.nisn;
    }

    // Enforce username = NISN for students
    if (roleAfterUpdate === Role.STUDENT) {
      const nisnToUse = body.nisn || user.nisn;
      if (!nisnToUse) {
        throw new ApiError(400, 'NISN wajib diisi untuk siswa');
      }
      // Override username with NISN
      body.username = nisnToUse;
    }

    let childrenData:
      | {
          set: { id: number }[];
        }
      | undefined;

    if (typeof childNisns !== 'undefined') {
      const normalizedChildNisns = childNisns
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (roleAfterUpdate === Role.PARENT && normalizedChildNisns.length > 0) {
        const children = await tx.user.findMany({
          where: {
            role: Role.STUDENT,
            nisn: {
              in: normalizedChildNisns,
            },
          },
        });

        if (children.length !== normalizedChildNisns.length) {
          throw new ApiError(400, 'Beberapa NISN siswa tidak ditemukan');
        }

        childrenData = {
          set: children.map((child) => ({ id: child.id })),
        };
      } else {
        childrenData = {
          set: [],
        };
      }
    }

    const updated = await tx.user.update({
      where: { id: Number(id) },
      data: {
        ...body,
        educationHistories: typeof normalizedEducationHistories !== 'undefined' ? (normalizedEducationHistories as any) : undefined,
        highestEducation:
          typeof normalizedEducationHistories !== 'undefined'
            ? educationSummary?.highestEducation ?? null
            : body.highestEducation,
        studyProgram:
          typeof normalizedEducationHistories !== 'undefined'
            ? educationSummary?.studyProgram ?? null
            : body.studyProgram,
        password: hashedPassword,
        birthDate: (body as any).birthDate ?? undefined,
        examinerMajorId: examinerMajorId,
        managedMajors: managedMajorIds ? {
          set: managedMajorIds.map(id => ({ id }))
        } : undefined,
        // documents handled separately below
        ...(typeof childrenData !== 'undefined'
          ? {
              children: childrenData,
            }
          : {}),
      },
      include: {
        documents: true,
        children: {
          select: {
            id: true,
            name: true,
            username: true,
            nisn: true,
          },
        },
      },
    });

    if (documents) {
      await tx.user.update({
        where: { id: Number(id) },
        data: {
          documents: {
            deleteMany: {},
            create: documents,
          },
        },
      });
    }

    return await tx.user.findUniqueOrThrow({
        where: { id: Number(id) },
        include: {
            documents: true,
            children: {
                select: {
                    id: true,
                    name: true,
                    username: true,
                    nisn: true,
                },
            },
        }
    });
  });

  const { password: _, ...userWithoutPassword } = updatedUser;

  try {
    await writeAuditLog(
      Number(currentUser?.id || 0),
      String(currentUser?.role || 'UNKNOWN'),
      null,
      'UPDATE',
      'USER',
      Number(id),
      {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        classId: user.classId,
        nis: user.nis,
        nisn: user.nisn,
      },
      {
        id: updatedUser.id,
        name: updatedUser.name,
        username: updatedUser.username,
        role: updatedUser.role,
        classId: updatedUser.classId,
        nis: updatedUser.nis,
        nisn: updatedUser.nisn,
      },
      (req.body as any)?.reason || undefined,
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat update user', auditError);
  }

  clearUserListCache();

  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Pengguna berhasil diperbarui'));
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = Number(id);

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  // Prevent deleting self (optional but good practice)
  // @ts-ignore
  if (req.user?.id === user.id) {
     throw new ApiError(400, 'Tidak dapat menghapus akun sendiri');
  }

  const [activeTutorAssignments, managedInventoryRooms, relatedWorkPrograms, relatedBudgetRequests] = await Promise.all([
    prisma.ekstrakurikulerTutorAssignment.count({
      where: {
        tutorId: userId,
        isActive: true,
      },
    }),
    prisma.room.count({
      where: {
        managerUserId: userId,
      },
    }),
    prisma.workProgram.count({
      where: {
        OR: [
          { ownerId: userId },
          { approvedById: userId },
          { assignedApproverId: userId },
        ],
      },
    }),
    prisma.budgetRequest.count({
      where: {
        OR: [
          { requesterId: userId },
          { approvedById: userId },
          { approverId: userId },
          { realizationConfirmedById: userId },
        ],
      },
    }),
  ]);

  const blockingReferences: string[] = [];
  if (activeTutorAssignments > 0) {
    blockingReferences.push(`${activeTutorAssignments} penugasan pembina aktif`);
  }
  if (managedInventoryRooms > 0) {
    blockingReferences.push(`${managedInventoryRooms} ruangan inventaris yang masih ditangani`);
  }
  if (relatedWorkPrograms > 0) {
    blockingReferences.push(`${relatedWorkPrograms} program kerja terkait`);
  }
  if (relatedBudgetRequests > 0) {
    blockingReferences.push(`${relatedBudgetRequests} pengajuan anggaran terkait`);
  }

  if (blockingReferences.length > 0) {
    throw new ApiError(
      400,
      `Pengguna belum dapat dihapus karena masih memiliki referensi aktif: ${blockingReferences.join(
        ', ',
      )}. Lepaskan atau migrasikan referensinya terlebih dahulu.`,
    );
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  clearUserListCache();

  res.status(200).json(new ApiResponse(200, null, 'Pengguna berhasil dihapus'));
});

export const verifyUsersBulk = asyncHandler(async (req: Request, res: Response) => {
  const { userIds } = bulkVerifySchema.parse(req.body);

  const result = await prisma.user.updateMany({
    where: {
      id: { in: userIds },
      verificationStatus: VerificationStatus.PENDING,
    },
    data: {
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });

  if (result.count > 0) {
    clearUserListCache();
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updatedCount: result.count },
        'Verifikasi massal pengguna berhasil',
      ),
    );
});
