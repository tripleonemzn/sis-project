import { Request, Response } from 'express';
import {
  CandidateAssessmentComponentCode,
  CandidateAdmissionStatus,
  Prisma,
  Role,
  SelectionAssessmentSource,
} from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { buildCandidateDocumentChecklist } from '../utils/candidateAdmissionDocuments';
import {
  generateOfficeLetterNumber,
  resolveOfficeLetterTitle,
} from '../utils/officeLetters';
import { activateCandidateAsOfficialStudent } from '../services/candidateStudentActivation.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const CANDIDATE_DECISION_LETTER_TYPE = 'CANDIDATE_ADMISSION_RESULT';

const allowedAdminReviewStatuses: CandidateAdmissionStatus[] = [
  CandidateAdmissionStatus.UNDER_REVIEW,
  CandidateAdmissionStatus.NEEDS_REVISION,
  CandidateAdmissionStatus.TEST_SCHEDULED,
  CandidateAdmissionStatus.PASSED_TEST,
  CandidateAdmissionStatus.FAILED_TEST,
  CandidateAdmissionStatus.ACCEPTED,
  CandidateAdmissionStatus.REJECTED,
];

const publishableDecisionStatuses: CandidateAdmissionStatus[] = [
  CandidateAdmissionStatus.PASSED_TEST,
  CandidateAdmissionStatus.FAILED_TEST,
  CandidateAdmissionStatus.ACCEPTED,
  CandidateAdmissionStatus.REJECTED,
];

type CandidateAssessmentDefinition = {
  code: CandidateAssessmentComponentCode;
  title: string;
  weight: number;
  passingScore: number;
  sourceType: SelectionAssessmentSource;
  autoDerived?: boolean;
};

const CANDIDATE_ASSESSMENT_DEFINITIONS: CandidateAssessmentDefinition[] = [
  {
    code: CandidateAssessmentComponentCode.TKD,
    title: 'Tes Kemampuan Dasar (CBT)',
    weight: 40,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.EXAM,
    autoDerived: true,
  },
  {
    code: CandidateAssessmentComponentCode.LITERACY_COLOR,
    title: 'Tes Buta Huruf & Warna',
    weight: 15,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.MANUAL,
  },
  {
    code: CandidateAssessmentComponentCode.INTERVIEW,
    title: 'Tes Wawancara',
    weight: 25,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.MANUAL,
  },
  {
    code: CandidateAssessmentComponentCode.PHYSICAL,
    title: 'Tes Fisik',
    weight: 20,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.MANUAL,
  },
];

const MANUAL_CANDIDATE_COMPONENT_CODES = CANDIDATE_ASSESSMENT_DEFINITIONS.filter((item) => !item.autoDerived).map(
  (item) => item.code,
);

const candidateAdmissionSelect = Prisma.validator<Prisma.CandidateAdmissionDefaultArgs>()({
  select: {
    id: true,
    userId: true,
    registrationNumber: true,
    desiredMajorId: true,
    previousSchool: true,
    lastEducation: true,
    parentName: true,
    parentPhone: true,
    domicileCity: true,
    motivation: true,
    submissionNotes: true,
    reviewNotes: true,
    decisionTitle: true,
    decisionSummary: true,
    decisionNextSteps: true,
    decisionPublishedAt: true,
    decisionLetterId: true,
    decisionLetterIssuedAt: true,
    decisionLetterIssuedCity: true,
    decisionLetterSignerName: true,
    decisionLetterSignerPosition: true,
    decisionLetterOfficialUrl: true,
    decisionLetterOfficialOriginalName: true,
    decisionLetterOfficialUploadedAt: true,
    status: true,
    submittedAt: true,
    reviewedAt: true,
    acceptedAt: true,
    createdAt: true,
    updatedAt: true,
    decisionLetter: {
      select: {
        id: true,
        type: true,
        letterNumber: true,
        title: true,
        printedAt: true,
        createdAt: true,
        payload: true,
      },
    },
    desiredMajor: {
      select: {
        id: true,
        name: true,
        code: true,
      },
    },
    assessments: {
      select: {
        id: true,
        componentCode: true,
        title: true,
        sourceType: true,
        score: true,
        maxScore: true,
        weight: true,
        passingScore: true,
        notes: true,
        assessedAt: true,
        evaluatorId: true,
        evaluator: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        componentCode: 'asc',
      },
    },
    user: {
      select: {
        id: true,
        name: true,
        username: true,
        nis: true,
        nisn: true,
        phone: true,
        email: true,
        gender: true,
        birthPlace: true,
        birthDate: true,
        address: true,
        religion: true,
        fatherName: true,
        motherName: true,
        guardianName: true,
        guardianPhone: true,
        studentStatus: true,
        verificationStatus: true,
        role: true,
        studentClass: {
          select: {
            id: true,
            name: true,
            level: true,
            major: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        academicMemberships: {
          where: {
            isCurrent: true,
          },
          orderBy: {
            academicYear: {
              semester1Start: 'desc',
            },
          },
          take: 1,
          select: {
            id: true,
            academicYearId: true,
            classId: true,
            status: true,
            isCurrent: true,
            startedAt: true,
            endedAt: true,
            academicYear: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
            class: {
              select: {
                id: true,
                name: true,
                level: true,
                major: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
              },
            },
          },
        },
        documents: {
          select: {
            id: true,
            title: true,
            fileUrl: true,
            category: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    },
  },
});

type CandidateAdmissionRecord = Prisma.CandidateAdmissionGetPayload<typeof candidateAdmissionSelect>;
type CandidateAdmissionAccessProfile = {
  id: number;
  role: Role;
  ptkType: string | null;
  name: string;
};

type CandidateAdmissionFinanceSummaryState = 'NO_BILLING' | 'CLEAR' | 'PENDING' | 'OVERDUE';

function normalizeCandidateFinanceAmount(value: number | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

function buildCandidateFinanceInvoiceLabel(invoice: {
  title?: string | null;
  periodKey: string;
  items: Array<{ componentName: string }>;
}) {
  const explicitTitle = String(invoice.title || '').trim();
  if (explicitTitle) return explicitTitle;

  const componentNames = invoice.items
    .map((item) => String(item.componentName || '').trim())
    .filter(Boolean);

  if (componentNames.length === 0) {
    return `Tagihan ${invoice.periodKey}`;
  }

  const preview = componentNames.slice(0, 2).join(', ');
  return componentNames.length > 2 ? `${preview} +${componentNames.length - 2} komponen` : preview;
}

async function loadCandidateFinanceSummary(userId: number) {
  const [invoices, lastPayment] = await Promise.all([
    prisma.financeInvoice.findMany({
      where: {
        studentId: userId,
        status: {
          not: 'CANCELLED',
        },
      },
      select: {
        id: true,
        invoiceNo: true,
        title: true,
        periodKey: true,
        status: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        issuedAt: true,
        items: {
          select: {
            componentName: true,
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { issuedAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.financePayment.findFirst({
      where: {
        studentId: userId,
        verificationStatus: 'VERIFIED',
      },
      select: {
        paidAt: true,
      },
      orderBy: {
        paidAt: 'desc',
      },
    }),
  ]);

  const activeInvoices = invoices.filter((invoice) => ['UNPAID', 'PARTIAL'].includes(String(invoice.status)));
  const overdueInvoices = activeInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < new Date());
  const totalAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const paidAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount || 0), 0);
  const outstandingAmount = activeInvoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount || 0), 0);
  const nextDueDate =
    activeInvoices
      .map((invoice) => invoice.dueDate)
      .filter((dueDate): dueDate is Date => Boolean(dueDate))
      .sort((left, right) => left.getTime() - right.getTime())[0] || null;

  let state: CandidateAdmissionFinanceSummaryState = 'NO_BILLING';
  if (invoices.length > 0) {
    state = overdueInvoices.length > 0 ? 'OVERDUE' : outstandingAmount > 0 ? 'PENDING' : 'CLEAR';
  }

  return {
    state,
    hasOutstanding: outstandingAmount > 0,
    hasOverdue: overdueInvoices.length > 0,
    totalAmount: normalizeCandidateFinanceAmount(totalAmount),
    paidAmount: normalizeCandidateFinanceAmount(paidAmount),
    outstandingAmount: normalizeCandidateFinanceAmount(outstandingAmount),
    activeInvoices: activeInvoices.length,
    overdueInvoices: overdueInvoices.length,
    settledInvoices: invoices.filter((invoice) => String(invoice.status) === 'PAID').length,
    nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
    lastPaymentAt: lastPayment?.paidAt ? lastPayment.paidAt.toISOString() : null,
    invoices: invoices.slice(0, 8).map((invoice) => ({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      label: buildCandidateFinanceInvoiceLabel(invoice),
      periodKey: invoice.periodKey,
      status: invoice.status,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      totalAmount: normalizeCandidateFinanceAmount(invoice.totalAmount),
      paidAmount: normalizeCandidateFinanceAmount(invoice.paidAmount),
      balanceAmount: normalizeCandidateFinanceAmount(invoice.balanceAmount),
      issuedAt: invoice.issuedAt.toISOString(),
    })),
  };
}

function getAuthUserId(req: Request): number {
  const authUserId = (req as Request & { user?: { id?: number } }).user?.id;
  if (!authUserId) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }
  return authUserId;
}

async function loadCandidateAdmissionAccessProfile(userId: number): Promise<CandidateAdmissionAccessProfile> {
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      ptkType: true,
      name: true,
    },
  });

  if (!profile) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  return {
    id: profile.id,
    role: profile.role,
    ptkType: profile.ptkType || null,
    name: profile.name,
  };
}

function isHeadTuProfile(profile: CandidateAdmissionAccessProfile) {
  return profile.role === Role.STAFF && profile.ptkType === 'KEPALA_TU';
}

async function assertCandidateAdmissionReadAccess(userId: number) {
  const profile = await loadCandidateAdmissionAccessProfile(userId);
  if (profile.role === Role.ADMIN || profile.role === Role.PRINCIPAL || isHeadTuProfile(profile)) {
    return profile;
  }
  throw new ApiError(403, 'Akses detail PPDB tidak diizinkan.');
}

async function assertCandidateDecisionLetterWriteAccess(userId: number) {
  const profile = await loadCandidateAdmissionAccessProfile(userId);
  if (profile.role === Role.ADMIN || isHeadTuProfile(profile)) {
    return profile;
  }
  throw new ApiError(403, 'Akses pengelolaan surat hasil seleksi tidak diizinkan.');
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalDate(value: unknown, fieldName: string): Date | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${fieldName} tidak valid.`);
  }
  return date;
}

function normalizeOptionalPositiveInt(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} tidak valid.`);
  }
  return parsed;
}

function normalizeOptionalBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (['true', '1', 'yes', 'ya'].includes(normalized)) return true;
  if (['false', '0', 'no', 'tidak'].includes(normalized)) return false;
  throw new ApiError(400, `${fieldName} tidak valid.`);
}

function normalizeOptionalScore(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
    throw new ApiError(400, `${fieldName} tidak valid.`);
  }
  return Number(parsed.toFixed(2));
}

function normalizeOptionalPositiveNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldName} tidak valid.`);
  }
  return Number(parsed.toFixed(2));
}

type CandidateAssessmentWriteInput = {
  componentCode: CandidateAssessmentComponentCode;
  score: number | null;
  maxScore: number | null;
  weight: number | null;
  passingScore: number | null;
  notes: string | null;
  assessedAt: Date | null;
};

function parseCandidateAssessmentWritePayload(body: unknown): CandidateAssessmentWriteInput[] {
  const rawItems = Array.isArray((body as { items?: unknown[] } | null)?.items)
    ? (((body as { items?: unknown[] }).items || []) as unknown[])
    : [];

  if (rawItems.length === 0) {
    throw new ApiError(400, 'Daftar penilaian PPDB wajib diisi.');
  }

  const seenCodes = new Set<CandidateAssessmentComponentCode>();
  return rawItems.map((rawItem, index) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const componentCode = String(item.componentCode || '').trim().toUpperCase() as CandidateAssessmentComponentCode;
    if (!MANUAL_CANDIDATE_COMPONENT_CODES.includes(componentCode)) {
      throw new ApiError(400, `Komponen penilaian PPDB baris ${index + 1} tidak didukung.`);
    }
    if (seenCodes.has(componentCode)) {
      throw new ApiError(400, `Komponen ${componentCode} dikirim lebih dari satu kali.`);
    }
    seenCodes.add(componentCode);

    const score = normalizeOptionalScore(item.score, `Skor ${componentCode}`);
    const maxScore = normalizeOptionalPositiveNumber(item.maxScore, `Nilai maksimum ${componentCode}`);
    const weight = normalizeOptionalPositiveNumber(item.weight, `Bobot ${componentCode}`);
    const passingScore = normalizeOptionalScore(item.passingScore, `Ambang lulus ${componentCode}`);
    const notes = normalizeOptionalText(item.notes);
    const assessedAt = normalizeOptionalDate(item.assessedAt, `Tanggal penilaian ${componentCode}`);

    if (score !== null && maxScore !== null && score > maxScore) {
      throw new ApiError(400, `Skor ${componentCode} tidak boleh melebihi nilai maksimum.`);
    }

    return {
      componentCode,
      score,
      maxScore,
      weight,
      passingScore,
      notes,
      assessedAt,
    };
  });
}

function buildCandidateRegistrationNumber(userId: number, createdAt = new Date()): string {
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  return `PPDB-${year}${month}${day}-${String(userId).padStart(6, '0')}`;
}

async function syncMissingCandidateAdmissions() {
  const missingUsers = await prisma.user.findMany({
    where: {
      role: Role.CALON_SISWA,
      candidateAdmission: null,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (missingUsers.length === 0) {
    return 0;
  }

  await prisma.candidateAdmission.createMany({
    data: missingUsers.map((user) => ({
      userId: user.id,
      registrationNumber: buildCandidateRegistrationNumber(user.id, user.createdAt),
      status: CandidateAdmissionStatus.DRAFT,
    })),
    skipDuplicates: true,
  });

  return missingUsers.length;
}

function normalizePagination(page: unknown, limit: unknown) {
  const pageNum =
    Math.max(DEFAULT_PAGE, Number.parseInt(String(page || DEFAULT_PAGE), 10) || DEFAULT_PAGE);
  const limitNum = Math.min(
    MAX_LIMIT,
    Math.max(DEFAULT_LIMIT, Number.parseInt(String(limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  return {
    pageNum,
    limitNum,
    skip: (pageNum - 1) * limitNum,
  };
}

function isDecisionPublishableStatus(status: CandidateAdmissionStatus) {
  return publishableDecisionStatuses.includes(status);
}

function getDefaultDecisionTitle(status: CandidateAdmissionStatus) {
  switch (status) {
    case CandidateAdmissionStatus.PASSED_TEST:
      return 'Lulus Tahap Tes Seleksi';
    case CandidateAdmissionStatus.FAILED_TEST:
      return 'Hasil Tes Seleksi';
    case CandidateAdmissionStatus.ACCEPTED:
      return 'Pengumuman Kelulusan PPDB';
    case CandidateAdmissionStatus.REJECTED:
      return 'Pengumuman Hasil PPDB';
    default:
      return null;
  }
}

function getDefaultDecisionSummary(status: CandidateAdmissionStatus) {
  switch (status) {
    case CandidateAdmissionStatus.PASSED_TEST:
      return 'Selamat, Anda dinyatakan lulus tahap tes seleksi dan sedang menunggu penetapan akhir dari sekolah.';
    case CandidateAdmissionStatus.FAILED_TEST:
      return 'Terima kasih telah mengikuti tes seleksi. Saat ini hasil menunjukkan Anda belum lulus pada tahap ini.';
    case CandidateAdmissionStatus.ACCEPTED:
      return 'Selamat, Anda dinyatakan diterima sebagai siswa baru pada proses PPDB ini.';
    case CandidateAdmissionStatus.REJECTED:
      return 'Terima kasih telah mengikuti proses PPDB. Saat ini sekolah belum dapat menerima pendaftaran Anda.';
    default:
      return null;
  }
}

function getDefaultDecisionNextSteps(status: CandidateAdmissionStatus) {
  switch (status) {
    case CandidateAdmissionStatus.PASSED_TEST:
      return 'Pantau dashboard secara berkala untuk keputusan akhir dan instruksi administrasi berikutnya.';
    case CandidateAdmissionStatus.FAILED_TEST:
      return 'Simpan akun ini untuk memantau jika sekolah membuka informasi lanjutan atau jalur lain.';
    case CandidateAdmissionStatus.ACCEPTED:
      return 'Segera siapkan berkas administrasi lanjutan dan pantau jadwal daftar ulang dari sekolah.';
    case CandidateAdmissionStatus.REJECTED:
      return 'Anda tetap dapat memantau informasi sekolah dari akun ini bila ada pengumuman lanjutan.';
    default:
      return null;
  }
}

function buildDecisionAnnouncement(record: CandidateAdmissionRecord) {
  const isEligibleStatus = isDecisionPublishableStatus(record.status);
  return {
    isEligibleStatus,
    isPublished: Boolean(record.decisionPublishedAt && isEligibleStatus),
    title:
      record.decisionTitle || (isEligibleStatus ? getDefaultDecisionTitle(record.status) : null),
    summary:
      record.decisionSummary ||
      (isEligibleStatus ? getDefaultDecisionSummary(record.status) : null),
    nextSteps:
      record.decisionNextSteps ||
      (isEligibleStatus ? getDefaultDecisionNextSteps(record.status) : null),
    publishedAt: record.decisionPublishedAt,
  };
}

function isPdfFileName(value: unknown) {
  return /\.pdf$/i.test(String(value || '').trim());
}

async function loadDefaultDecisionLetterSigners() {
  const [principal, headTu] = await Promise.all([
    prisma.user.findFirst({
      where: {
        role: Role.PRINCIPAL,
      },
      select: {
        name: true,
      },
      orderBy: {
        id: 'asc',
      },
    }),
    prisma.user.findFirst({
      where: {
        role: Role.STAFF,
        ptkType: 'KEPALA_TU',
      },
      select: {
        name: true,
      },
      orderBy: {
        id: 'asc',
      },
    }),
  ]);

  return {
    principalName: principal?.name || null,
    headTuName: headTu?.name || null,
  };
}

function buildCandidateDecisionLetter(
  record: CandidateAdmissionRecord,
  options?: {
    principalName?: string | null;
    headTuName?: string | null;
  },
) {
  const announcement = buildDecisionAnnouncement(record);
  const issuedAt =
    record.decisionLetterIssuedAt ||
    record.decisionPublishedAt ||
    record.reviewedAt ||
    record.updatedAt ||
    record.createdAt;

  return {
    isDraftAvailable: announcement.isPublished,
    isFinalized: Boolean(record.decisionLetter?.id),
    archiveLetterId: record.decisionLetter?.id || null,
    type: record.decisionLetter?.type || CANDIDATE_DECISION_LETTER_TYPE,
    title:
      record.decisionLetter?.title ||
      announcement.title ||
      resolveOfficeLetterTitle(CANDIDATE_DECISION_LETTER_TYPE),
    letterNumber: record.decisionLetter?.letterNumber || null,
    issuedAt: issuedAt ? issuedAt.toISOString() : null,
    issuedCity: record.decisionLetterIssuedCity || 'Bekasi',
    signerName: record.decisionLetterSignerName || options?.headTuName || null,
    signerPosition: record.decisionLetterSignerPosition || 'Kepala Tata Usaha',
    principalName: options?.principalName || null,
    officialFileUrl: record.decisionLetterOfficialUrl || null,
    officialOriginalName: record.decisionLetterOfficialOriginalName || null,
    officialUploadedAt: record.decisionLetterOfficialUploadedAt
      ? record.decisionLetterOfficialUploadedAt.toISOString()
      : null,
    generatedAt: record.decisionLetter?.printedAt
      ? record.decisionLetter.printedAt.toISOString()
      : record.decisionLetter?.createdAt
        ? record.decisionLetter.createdAt.toISOString()
        : null,
  };
}

function buildCompleteness(record: CandidateAdmissionRecord) {
  const documentChecklist = buildCandidateDocumentChecklist(record.user.documents);
  const checks = [
    { label: 'Nama lengkap', completed: Boolean(String(record.user.name || '').trim()) },
    { label: 'NISN', completed: Boolean(String(record.user.nisn || '').trim()) },
    { label: 'Nomor HP calon siswa', completed: Boolean(String(record.user.phone || '').trim()) },
    { label: 'Jenis kelamin', completed: Boolean(record.user.gender) },
    { label: 'Tempat lahir', completed: Boolean(String(record.user.birthPlace || '').trim()) },
    { label: 'Tanggal lahir', completed: Boolean(record.user.birthDate) },
    { label: 'Alamat domisili', completed: Boolean(String(record.user.address || '').trim()) },
    { label: 'Asal sekolah', completed: Boolean(String(record.previousSchool || '').trim()) },
    { label: 'Jurusan tujuan', completed: Boolean(record.desiredMajorId) },
    {
      label: 'Data keluarga inti (ayah / ibu / wali)',
      completed: Boolean(
        String(record.parentName || '').trim() ||
          String(record.user.fatherName || '').trim() ||
          String(record.user.motherName || '').trim() ||
          String(record.user.guardianName || '').trim(),
      ),
    },
    {
      label: 'Kontak utama orang tua / wali',
      completed: Boolean(
        String(record.parentPhone || '').trim() || String(record.user.guardianPhone || '').trim(),
      ),
    },
    { label: 'Dokumen PPDB wajib', completed: documentChecklist.requiredComplete },
    { label: 'Format dokumen PPDB', completed: documentChecklist.summary.invalidCount === 0 },
  ];

  const completedCount = checks.filter((item) => item.completed).length;
  const missingFields = checks
    .filter((item) => !item.completed)
    .map((item) => item.label);

  return {
    isReady: missingFields.length === 0,
    percent: Math.round((completedCount / checks.length) * 100),
    completedCount,
    totalFields: checks.length,
    missingFields,
  };
}

async function loadCandidateSelectionResults(userId: number) {
  const audiencePrograms = await prisma.examProgramConfig.findMany({
    where: {
      isActive: true,
      targetClassLevels: { has: 'CALON_SISWA' },
    },
    select: {
      academicYearId: true,
      code: true,
    },
  });

  if (audiencePrograms.length === 0) {
    return {
      results: [],
      summary: {
        total: 0,
        completed: 0,
        inProgress: 0,
        passed: 0,
        failed: 0,
        averageScore: null as number | null,
        latestSubmittedAt: null as string | null,
      },
    };
  }

  const rows = await prisma.studentExamSession.findMany({
    where: {
      studentId: userId,
      schedule: {
        OR: audiencePrograms.map((item) => ({
          academicYearId: Number(item.academicYearId),
          OR: [{ examType: item.code }, { packet: { is: { programCode: item.code } } }],
        })),
      },
    },
    select: {
      id: true,
      status: true,
      score: true,
      startTime: true,
      endTime: true,
      submitTime: true,
      updatedAt: true,
      schedule: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          sessionLabel: true,
          examType: true,
          packet: {
            select: {
              id: true,
              title: true,
              type: true,
              programCode: true,
              duration: true,
              kkm: true,
              subject: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ submitTime: 'desc' }, { updatedAt: 'desc' }],
    take: 12,
  });

  const results = rows.map((row) => {
    const normalizedStatus = String(row.status || '').toUpperCase();
    const isCompleted = normalizedStatus === 'COMPLETED' || normalizedStatus === 'TIMEOUT';
    const kkm = typeof row.schedule.packet?.kkm === 'number' ? Number(row.schedule.packet.kkm) : null;
    const score = typeof row.score === 'number' ? Number(row.score.toFixed(2)) : null;
    const passed = isCompleted && score !== null && kkm !== null ? score >= kkm : null;

    return {
      sessionId: row.id,
      scheduleId: row.schedule.id,
      title: row.schedule.packet?.title || 'Tes Seleksi',
      subject: row.schedule.packet?.subject || null,
      programCode: row.schedule.packet?.programCode || row.schedule.examType || null,
      sessionLabel: row.schedule.sessionLabel || null,
      status: normalizedStatus,
      score,
      kkm,
      passed,
      duration: row.schedule.packet?.duration || null,
      startedAt: row.startTime.toISOString(),
      endedAt: row.endTime ? row.endTime.toISOString() : null,
      submittedAt: row.submitTime ? row.submitTime.toISOString() : null,
      scheduleStartTime: row.schedule.startTime.toISOString(),
      scheduleEndTime: row.schedule.endTime.toISOString(),
    };
  });

  const completedResults = results.filter((item) => item.status === 'COMPLETED' || item.status === 'TIMEOUT');
  const scoredResults = completedResults.filter((item) => typeof item.score === 'number');
  const averageScore =
    scoredResults.length > 0
      ? Number(
          (
            scoredResults.reduce((sum, item) => sum + Number(item.score || 0), 0) / scoredResults.length
          ).toFixed(2),
        )
      : null;

  return {
    results,
    summary: {
      total: results.length,
      completed: completedResults.length,
      inProgress: results.filter((item) => item.status === 'IN_PROGRESS').length,
      passed: results.filter((item) => item.passed === true).length,
      failed: results.filter((item) => item.passed === false).length,
      averageScore,
      latestSubmittedAt: results.find((item) => item.submittedAt)?.submittedAt || null,
    },
  };
}

function buildCandidateAssessmentBoard(
  record: CandidateAdmissionRecord,
  selectionResults: Awaited<ReturnType<typeof loadCandidateSelectionResults>>,
) {
  const manualMap = new Map(record.assessments.map((item) => [item.componentCode, item]));
  const items = CANDIDATE_ASSESSMENT_DEFINITIONS.map((definition) => {
    const manual = manualMap.get(definition.code) || null;

    if (definition.autoDerived) {
      const score = selectionResults.summary.averageScore;
      const completed = selectionResults.summary.completed > 0 && score !== null;
      const passed = completed ? score >= definition.passingScore : null;
      return {
        code: definition.code,
        title: definition.title,
        sourceType: definition.sourceType,
        score,
        maxScore: 100,
        weight: definition.weight,
        passingScore: definition.passingScore,
        notes:
          completed && selectionResults.summary.latestSubmittedAt
            ? `Rata-rata dari ${selectionResults.summary.completed} sesi CBT kandidat.`
            : null,
        assessedAt: selectionResults.summary.latestSubmittedAt,
        completed,
        passed,
        isAutoDerived: true,
        evaluator: null,
      };
    }

    const maxScore = typeof manual?.maxScore === 'number' ? Number(manual.maxScore) : 100;
    const normalizedScore =
      typeof manual?.score === 'number' && Number.isFinite(manual.score)
        ? Number(((manual.score / Math.max(maxScore || 100, 1)) * 100).toFixed(2))
        : null;
    const weight =
      typeof manual?.weight === 'number' && Number.isFinite(manual.weight)
        ? Number(manual.weight)
        : definition.weight;
    const passingScore =
      typeof manual?.passingScore === 'number' && Number.isFinite(manual.passingScore)
        ? Number(manual.passingScore)
        : definition.passingScore;
    const completed = normalizedScore !== null;
    const passed = completed ? normalizedScore >= passingScore : null;

    return {
      code: definition.code,
      title: manual?.title || definition.title,
      sourceType: manual?.sourceType || definition.sourceType,
      score: normalizedScore,
      rawScore: typeof manual?.score === 'number' ? Number(manual.score) : null,
      maxScore,
      weight,
      passingScore,
      notes: manual?.notes || null,
      assessedAt: manual?.assessedAt ? manual.assessedAt.toISOString() : null,
      completed,
      passed,
      isAutoDerived: false,
      evaluator: manual?.evaluator
        ? {
            id: manual.evaluator.id,
            name: manual.evaluator.name,
            role: manual.evaluator.role,
          }
        : null,
    };
  });

  const completedItems = items.filter((item) => item.completed && typeof item.score === 'number');
  const totalWeight = completedItems.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const weightedAverage =
    totalWeight > 0
      ? Number(
          (
            completedItems.reduce((sum, item) => sum + Number(item.score || 0) * Number(item.weight || 0), 0) /
            totalWeight
          ).toFixed(2),
        )
      : null;

  const incompleteComponents = items.filter((item) => !item.completed).map((item) => item.title);
  const failedComponents = items.filter((item) => item.passed === false).map((item) => item.title);

  let recommendation: 'INCOMPLETE' | 'PASS' | 'FAIL' = 'INCOMPLETE';
  if (incompleteComponents.length === 0) {
    recommendation =
      weightedAverage !== null && weightedAverage >= 70 && failedComponents.length === 0 ? 'PASS' : 'FAIL';
  }

  return {
    items,
    summary: {
      totalComponents: items.length,
      completedComponents: items.filter((item) => item.completed).length,
      weightedAverage,
      incompleteComponents,
      failedComponents,
      recommendation,
      passThreshold: 70,
    },
  };
}

function serializeCandidateAdmission(
  record: CandidateAdmissionRecord,
  options?: {
    principalName?: string | null;
    headTuName?: string | null;
  },
) {
  const completeness = buildCompleteness(record);
  const documentChecklist = buildCandidateDocumentChecklist(record.user.documents);
  const decisionAnnouncement = buildDecisionAnnouncement(record);
  const decisionLetter = buildCandidateDecisionLetter(record, options);
  const resolvedParentName =
    record.parentName ||
    record.user.guardianName ||
    record.user.fatherName ||
    record.user.motherName ||
    null;
  const resolvedParentPhone = record.parentPhone || record.user.guardianPhone || null;
  const currentMembership = record.user.academicMemberships[0] || null;
  const officialStudentAccount =
    record.user.role === Role.STUDENT
      ? {
          userId: record.user.id,
          username: record.user.username,
          nis: record.user.nis,
          nisn: record.user.nisn,
          studentStatus: record.user.studentStatus,
          currentAcademicYear: currentMembership?.academicYear || null,
          currentMembership: currentMembership
            ? {
                id: currentMembership.id,
                academicYearId: currentMembership.academicYearId,
                classId: currentMembership.classId,
                status: currentMembership.status,
                isCurrent: currentMembership.isCurrent,
                startedAt: currentMembership.startedAt,
                endedAt: currentMembership.endedAt,
              }
            : null,
          currentClass: currentMembership?.class || record.user.studentClass || null,
        }
      : null;

  return {
    id: record.id,
    userId: record.userId,
    registrationNumber: record.registrationNumber,
    status: record.status,
    desiredMajorId: record.desiredMajorId,
    desiredMajor: record.desiredMajor,
    previousSchool: record.previousSchool,
    lastEducation: record.lastEducation,
    parentName: record.parentName,
    parentPhone: record.parentPhone,
    domicileCity: record.domicileCity,
    motivation: record.motivation,
    submissionNotes: record.submissionNotes,
    reviewNotes: record.reviewNotes,
    decisionTitle: record.decisionTitle,
    decisionSummary: record.decisionSummary,
    decisionNextSteps: record.decisionNextSteps,
    decisionPublishedAt: record.decisionPublishedAt,
    decisionAnnouncement,
    decisionLetter,
    submittedAt: record.submittedAt,
    reviewedAt: record.reviewedAt,
    acceptedAt: record.acceptedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    documentCount: record.user.documents.length,
    documentChecklist,
    completeness,
    canSubmit:
      completeness.isReady &&
      (record.status === CandidateAdmissionStatus.DRAFT ||
        record.status === CandidateAdmissionStatus.NEEDS_REVISION),
    canPublishDecision: decisionAnnouncement.isEligibleStatus,
    canPromoteToStudent:
      record.status === CandidateAdmissionStatus.ACCEPTED && record.user.role === Role.CALON_SISWA,
    officialStudentAccount,
    accountVerificationStatus: record.user.verificationStatus,
    user: {
      id: record.user.id,
      name: record.user.name,
      username: record.user.username,
      nis: record.user.nis,
      nisn: record.user.nisn,
      phone: record.user.phone,
      email: record.user.email,
      gender: record.user.gender,
      birthPlace: record.user.birthPlace,
      birthDate: record.user.birthDate,
      address: record.user.address,
      religion: record.user.religion,
      fatherName: record.user.fatherName,
      motherName: record.user.motherName,
      guardianName: record.user.guardianName,
      guardianPhone: record.user.guardianPhone,
      verificationStatus: record.user.verificationStatus,
      role: record.user.role,
      documents: record.user.documents,
    },
    resolvedParentName,
    resolvedParentPhone,
  };
}

async function buildCandidateAdmissionDetailPayload(record: CandidateAdmissionRecord) {
  const shouldLoadDecisionLetterDefaults = Boolean(
    record.decisionPublishedAt || record.decisionLetterId || record.decisionLetterOfficialUrl,
  );
  const [selectionResults, decisionLetterDefaults, financeSummary] = await Promise.all([
    loadCandidateSelectionResults(record.userId),
    shouldLoadDecisionLetterDefaults ? loadDefaultDecisionLetterSigners() : Promise.resolve(null),
    loadCandidateFinanceSummary(record.userId),
  ]);
  const base = serializeCandidateAdmission(record, decisionLetterDefaults || undefined);
  const assessmentBoard = buildCandidateAssessmentBoard(record, selectionResults);
  return {
    ...base,
    financeSummary,
    selectionResults,
    assessmentBoard,
  };
}

async function ensureCandidateSelfAccess(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan.');
  }
  if (user.role !== Role.CALON_SISWA) {
    throw new ApiError(400, 'Akun ini bukan calon siswa.');
  }

  await prisma.candidateAdmission.upsert({
    where: { userId },
    create: {
      userId,
      registrationNumber: buildCandidateRegistrationNumber(userId, user.createdAt),
      status: CandidateAdmissionStatus.DRAFT,
    },
    update: {},
  });
}

async function loadCandidateAdmissionByUserId(userId: number) {
  await ensureCandidateSelfAccess(userId);

  const record = await prisma.candidateAdmission.findUnique({
    where: { userId },
    select: candidateAdmissionSelect.select,
  });

  if (!record) {
    throw new ApiError(404, 'Data pendaftaran calon siswa tidak ditemukan.');
  }

  return record;
}

async function loadCandidateAdmissionById(id: number) {
  const record = await prisma.candidateAdmission.findUnique({
    where: { id },
    select: candidateAdmissionSelect.select,
  });

  if (!record) {
    throw new ApiError(404, 'Pendaftaran calon siswa tidak ditemukan.');
  }

  return record;
}

function buildCandidateDecisionLetterOfficePayload(
  record: CandidateAdmissionRecord,
  options: {
    issueCity: string;
    issueDate: Date;
    signerName: string | null;
    signerPosition: string;
    officialLetterUrl: string | null;
    officialLetterOriginalName: string | null;
    generatedBy: string | null;
  },
) {
  return {
    candidateAdmissionId: record.id,
    registrationNumber: record.registrationNumber,
    desiredMajor: record.desiredMajor
      ? {
          id: record.desiredMajor.id,
          code: record.desiredMajor.code,
          name: record.desiredMajor.name,
        }
      : null,
    previousSchool: record.previousSchool || null,
    admissionStatus: record.status,
    decisionTitle:
      record.decisionTitle || getDefaultDecisionTitle(record.status) || resolveOfficeLetterTitle(CANDIDATE_DECISION_LETTER_TYPE),
    decisionSummary: record.decisionSummary || getDefaultDecisionSummary(record.status) || null,
    decisionNextSteps: record.decisionNextSteps || getDefaultDecisionNextSteps(record.status) || null,
    decisionPublishedAt: record.decisionPublishedAt ? record.decisionPublishedAt.toISOString() : null,
    issueCity: options.issueCity,
    issueDate: options.issueDate.toISOString(),
    signerName: options.signerName,
    signerPosition: options.signerPosition,
    officialLetterUrl: options.officialLetterUrl,
    officialLetterOriginalName: options.officialLetterOriginalName,
    generatedBy: options.generatedBy,
  };
}

function buildCandidateAdmissionSummary(rows: Array<{ status: CandidateAdmissionStatus }>, total: number) {
  const summary = {
    total,
    draft: 0,
    submitted: 0,
    underReview: 0,
    needsRevision: 0,
    testScheduled: 0,
    passedTest: 0,
    failedTest: 0,
    accepted: 0,
    rejected: 0,
  };

  rows.forEach((row) => {
    switch (row.status) {
      case CandidateAdmissionStatus.DRAFT:
        summary.draft += 1;
        break;
      case CandidateAdmissionStatus.SUBMITTED:
        summary.submitted += 1;
        break;
      case CandidateAdmissionStatus.UNDER_REVIEW:
        summary.underReview += 1;
        break;
      case CandidateAdmissionStatus.NEEDS_REVISION:
        summary.needsRevision += 1;
        break;
      case CandidateAdmissionStatus.TEST_SCHEDULED:
        summary.testScheduled += 1;
        break;
      case CandidateAdmissionStatus.PASSED_TEST:
        summary.passedTest += 1;
        break;
      case CandidateAdmissionStatus.FAILED_TEST:
        summary.failedTest += 1;
        break;
      case CandidateAdmissionStatus.ACCEPTED:
        summary.accepted += 1;
        break;
      case CandidateAdmissionStatus.REJECTED:
        summary.rejected += 1;
        break;
      default:
        break;
    }
  });

  return summary;
}

export const getMyCandidateAdmission = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const record = await loadCandidateAdmissionByUserId(userId);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(record),
        'Pendaftaran calon siswa berhasil diambil',
      ),
    );
});

export const upsertMyCandidateAdmission = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  await ensureCandidateSelfAccess(userId);

  const body = (req.body || {}) as Record<string, unknown>;
  const userUpdate: Prisma.UserUpdateInput = {};
  const admissionUpdate: Prisma.CandidateAdmissionUncheckedUpdateInput = {};
  let shouldUpsertAdmission = false;

  if (hasOwn(body, 'name')) {
    const name = normalizeOptionalText(body.name);
    if (!name) {
      throw new ApiError(400, 'Nama calon siswa wajib diisi.');
    }
    userUpdate.name = name;
  }
  if (hasOwn(body, 'phone')) {
    userUpdate.phone = normalizeOptionalText(body.phone);
  }
  if (hasOwn(body, 'email')) {
    userUpdate.email = normalizeOptionalText(body.email);
  }
  if (hasOwn(body, 'gender')) {
    const normalizedGender = normalizeOptionalText(body.gender);
    if (!normalizedGender) {
      userUpdate.gender = null;
    } else if (normalizedGender !== 'MALE' && normalizedGender !== 'FEMALE') {
      throw new ApiError(400, 'Jenis kelamin tidak valid.');
    } else {
      userUpdate.gender = normalizedGender;
    }
  }
  if (hasOwn(body, 'birthPlace')) {
    userUpdate.birthPlace = normalizeOptionalText(body.birthPlace);
  }
  if (hasOwn(body, 'birthDate')) {
    userUpdate.birthDate = normalizeOptionalDate(body.birthDate, 'Tanggal lahir');
  }
  if (hasOwn(body, 'address')) {
    userUpdate.address = normalizeOptionalText(body.address);
  }
  if (hasOwn(body, 'religion')) {
    userUpdate.religion = normalizeOptionalText(body.religion);
  }
  if (hasOwn(body, 'fatherName')) {
    userUpdate.fatherName = normalizeOptionalText(body.fatherName);
  }
  if (hasOwn(body, 'motherName')) {
    userUpdate.motherName = normalizeOptionalText(body.motherName);
  }
  if (hasOwn(body, 'guardianName')) {
    userUpdate.guardianName = normalizeOptionalText(body.guardianName);
  }
  if (hasOwn(body, 'guardianPhone')) {
    userUpdate.guardianPhone = normalizeOptionalText(body.guardianPhone);
  }
  if (hasOwn(body, 'desiredMajorId')) {
    const desiredMajorId = normalizeOptionalPositiveInt(body.desiredMajorId, 'Jurusan tujuan');
    if (desiredMajorId) {
      const existingMajor = await prisma.major.findUnique({
        where: { id: desiredMajorId },
        select: { id: true },
      });
      if (!existingMajor) {
        throw new ApiError(404, 'Jurusan tujuan tidak ditemukan.');
      }
    }
    admissionUpdate.desiredMajorId = desiredMajorId;
    shouldUpsertAdmission = true;
  }
  if (hasOwn(body, 'previousSchool')) {
    admissionUpdate.previousSchool = normalizeOptionalText(body.previousSchool);
    shouldUpsertAdmission = true;
  }
  if (hasOwn(body, 'lastEducation')) {
    admissionUpdate.lastEducation = normalizeOptionalText(body.lastEducation);
    shouldUpsertAdmission = true;
  }
  if (hasOwn(body, 'parentName')) {
    admissionUpdate.parentName = normalizeOptionalText(body.parentName);
    shouldUpsertAdmission = true;
  }
  if (hasOwn(body, 'parentPhone')) {
    admissionUpdate.parentPhone = normalizeOptionalText(body.parentPhone);
    shouldUpsertAdmission = true;
  }
  if (hasOwn(body, 'domicileCity')) {
    admissionUpdate.domicileCity = normalizeOptionalText(body.domicileCity);
    shouldUpsertAdmission = true;
  }
  if (hasOwn(body, 'motivation')) {
    admissionUpdate.motivation = normalizeOptionalText(body.motivation);
    shouldUpsertAdmission = true;
  }
  if (hasOwn(body, 'submissionNotes')) {
    admissionUpdate.submissionNotes = normalizeOptionalText(body.submissionNotes);
    shouldUpsertAdmission = true;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({
        where: { id: userId },
        data: userUpdate,
      });
    }

    await tx.candidateAdmission.upsert({
      where: { userId },
      create: {
        userId,
        registrationNumber: buildCandidateRegistrationNumber(userId),
        status: CandidateAdmissionStatus.DRAFT,
        desiredMajorId:
          typeof admissionUpdate.desiredMajorId === 'number' ? admissionUpdate.desiredMajorId : null,
        previousSchool:
          typeof admissionUpdate.previousSchool === 'string' ? admissionUpdate.previousSchool : null,
        lastEducation:
          typeof admissionUpdate.lastEducation === 'string' ? admissionUpdate.lastEducation : null,
        parentName: typeof admissionUpdate.parentName === 'string' ? admissionUpdate.parentName : null,
        parentPhone:
          typeof admissionUpdate.parentPhone === 'string' ? admissionUpdate.parentPhone : null,
        domicileCity:
          typeof admissionUpdate.domicileCity === 'string' ? admissionUpdate.domicileCity : null,
        motivation: typeof admissionUpdate.motivation === 'string' ? admissionUpdate.motivation : null,
        submissionNotes:
          typeof admissionUpdate.submissionNotes === 'string' ? admissionUpdate.submissionNotes : null,
      },
      update: shouldUpsertAdmission ? admissionUpdate : {},
    });
  });

  const record = await loadCandidateAdmissionByUserId(userId);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(record),
        'Pendaftaran calon siswa berhasil diperbarui',
      ),
    );
});

export const submitMyCandidateAdmission = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const existing = await loadCandidateAdmissionByUserId(userId);
  const serialized = serializeCandidateAdmission(existing);

  if (serialized.documentChecklist.summary.invalidCount > 0) {
    const invalidMessages = serialized.documentChecklist.invalidDocuments
      .slice(0, 3)
      .map((document) => `${document.title}: ${document.validationError}`);
    throw new ApiError(
      400,
      `Ada dokumen PPDB dengan format tidak sesuai. Perbaiki: ${invalidMessages.join(' | ')}.`,
    );
  }

  if (!serialized.canSubmit) {
    if (!serialized.completeness.isReady) {
      throw new ApiError(
        400,
        `Data pendaftaran belum lengkap. Lengkapi: ${serialized.completeness.missingFields.join(', ')}.`,
      );
    }

    if (existing.status === CandidateAdmissionStatus.SUBMITTED) {
      throw new ApiError(400, 'Pendaftaran sudah dikirim dan sedang menunggu review admin.');
    }
    if (existing.status === CandidateAdmissionStatus.UNDER_REVIEW) {
      throw new ApiError(400, 'Pendaftaran sedang direview oleh admin sekolah.');
    }
    if (existing.status === CandidateAdmissionStatus.ACCEPTED) {
      throw new ApiError(400, 'Pendaftaran sudah dinyatakan diterima.');
    }
    throw new ApiError(400, 'Status pendaftaran saat ini tidak dapat dikirim ulang.');
  }

  const updated = await prisma.candidateAdmission.update({
    where: { id: existing.id },
    data: {
      status: CandidateAdmissionStatus.SUBMITTED,
      submittedAt: new Date(),
    },
    select: candidateAdmissionSelect.select,
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(updated),
        'Pendaftaran calon siswa berhasil dikirim',
      ),
    );
});

export const getCandidateAdmissions = asyncHandler(async (req: Request, res: Response) => {
  await assertCandidateAdmissionReadAccess(getAuthUserId(req));
  await syncMissingCandidateAdmissions();

  const { pageNum, limitNum, skip } = normalizePagination(req.query.page, req.query.limit);
  const normalizedSearch = normalizeOptionalText(req.query.search);
  const normalizedStatus = String(req.query.status || '').trim().toUpperCase();
  const desiredMajorId = normalizeOptionalPositiveInt(req.query.desiredMajorId, 'Jurusan tujuan');
  const publishedOnly = hasOwn(req.query as Record<string, unknown>, 'publishedOnly')
    ? normalizeOptionalBoolean(req.query.publishedOnly, 'publishedOnly')
    : false;

  const where: Prisma.CandidateAdmissionWhereInput = {};

  if (publishedOnly) {
    where.decisionPublishedAt = {
      not: null,
    };
  }

  if (normalizedStatus && normalizedStatus !== 'ALL') {
    if (!Object.values(CandidateAdmissionStatus).includes(normalizedStatus as CandidateAdmissionStatus)) {
      throw new ApiError(400, 'Status pendaftaran tidak valid.');
    }
    where.status = normalizedStatus as CandidateAdmissionStatus;
  }

  if (desiredMajorId) {
    where.desiredMajorId = desiredMajorId;
  }

  if (normalizedSearch) {
    where.OR = [
      {
        user: {
          name: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        user: {
          username: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        user: {
          nisn: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        registrationNumber: {
          contains: normalizedSearch,
          mode: 'insensitive',
        },
      },
      {
        previousSchool: {
          contains: normalizedSearch,
          mode: 'insensitive',
        },
      },
      {
        desiredMajor: {
          is: {
            name: {
              contains: normalizedSearch,
              mode: 'insensitive',
            },
          },
        },
      },
    ];
  }

  const [total, rows, summaryRows] = await Promise.all([
    prisma.candidateAdmission.count({ where }),
    prisma.candidateAdmission.findMany({
      where,
      select: candidateAdmissionSelect.select,
      skip,
      take: limitNum,
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.candidateAdmission.findMany({
      where,
      select: {
        status: true,
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        applications: rows.map((row) => serializeCandidateAdmission(row)),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        summary: buildCandidateAdmissionSummary(summaryRows, total),
      },
      'Daftar pendaftaran calon siswa berhasil diambil',
    ),
  );
});

export const getCandidateAdmissionById = asyncHandler(async (req: Request, res: Response) => {
  await assertCandidateAdmissionReadAccess(getAuthUserId(req));

  const id = normalizeOptionalPositiveInt(req.params.id, 'ID pendaftaran');
  if (!id) {
    throw new ApiError(400, 'ID pendaftaran tidak valid.');
  }

  const record = await loadCandidateAdmissionById(id);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(record),
        'Detail pendaftaran calon siswa berhasil diambil',
      ),
    );
});

export const getMyCandidateDecisionLetter = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const record = await loadCandidateAdmissionByUserId(userId);
  const decisionLetter = buildCandidateDecisionLetter(record);

  if (!decisionLetter.isDraftAvailable && !decisionLetter.isFinalized && !decisionLetter.officialFileUrl) {
    throw new ApiError(404, 'Surat hasil seleksi belum tersedia.');
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(record),
        'Surat hasil seleksi calon siswa berhasil diambil',
      ),
    );
});

export const getCandidateDecisionLetterById = asyncHandler(async (req: Request, res: Response) => {
  const requester = await loadCandidateAdmissionAccessProfile(getAuthUserId(req));

  const id = normalizeOptionalPositiveInt(req.params.id, 'ID pendaftaran');
  if (!id) {
    throw new ApiError(400, 'ID pendaftaran tidak valid.');
  }

  if (requester.role === Role.CALON_SISWA) {
    const ownRecord = await loadCandidateAdmissionByUserId(requester.id);
    if (ownRecord.id !== id) {
      throw new ApiError(403, 'Anda hanya dapat membuka surat hasil seleksi milik sendiri.');
    }
  } else if (!(requester.role === Role.ADMIN || requester.role === Role.PRINCIPAL || isHeadTuProfile(requester))) {
    throw new ApiError(403, 'Akses surat hasil seleksi tidak diizinkan.');
  }

  const record = await loadCandidateAdmissionById(id);
  const decisionLetter = buildCandidateDecisionLetter(record);

  if (!decisionLetter.isDraftAvailable && !decisionLetter.isFinalized && !decisionLetter.officialFileUrl) {
    throw new ApiError(404, 'Surat hasil seleksi belum tersedia.');
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(record),
        'Surat hasil seleksi calon siswa berhasil diambil',
      ),
    );
});

export const upsertCandidateDecisionLetter = asyncHandler(async (req: Request, res: Response) => {
  const requester = await assertCandidateDecisionLetterWriteAccess(getAuthUserId(req));

  const id = normalizeOptionalPositiveInt(req.params.id, 'ID pendaftaran');
  if (!id) {
    throw new ApiError(400, 'ID pendaftaran tidak valid.');
  }

  const record = await loadCandidateAdmissionById(id);
  const announcement = buildDecisionAnnouncement(record);
  if (!announcement.isPublished) {
    throw new ApiError(400, 'Publikasikan hasil seleksi terlebih dahulu sebelum memfinalkan surat.');
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const defaults = await loadDefaultDecisionLetterSigners();
  const issueCity = hasOwn(body, 'issueCity')
    ? normalizeOptionalText(body.issueCity) || 'Bekasi'
    : record.decisionLetterIssuedCity || 'Bekasi';
  const issueDate =
    (hasOwn(body, 'issueDate')
      ? normalizeOptionalDate(body.issueDate, 'Tanggal surat')
      : record.decisionLetterIssuedAt || record.decisionPublishedAt || record.reviewedAt || new Date()) ||
    new Date();
  const signerName = hasOwn(body, 'signerName')
    ? normalizeOptionalText(body.signerName)
    : record.decisionLetterSignerName || defaults.headTuName || requester.name;
  const signerPosition = hasOwn(body, 'signerPosition')
    ? normalizeOptionalText(body.signerPosition) || 'Kepala Tata Usaha'
    : record.decisionLetterSignerPosition || 'Kepala Tata Usaha';
  const clearOfficialLetter = hasOwn(body, 'clearOfficialLetter')
    ? normalizeOptionalBoolean(body.clearOfficialLetter, 'clearOfficialLetter')
    : false;

  let officialLetterUrl = hasOwn(body, 'officialLetterUrl')
    ? normalizeOptionalText(body.officialLetterUrl)
    : record.decisionLetterOfficialUrl || null;
  let officialLetterOriginalName = hasOwn(body, 'officialLetterOriginalName')
    ? normalizeOptionalText(body.officialLetterOriginalName)
    : record.decisionLetterOfficialOriginalName || null;

  if (clearOfficialLetter) {
    officialLetterUrl = null;
    officialLetterOriginalName = null;
  }

  if (officialLetterUrl && !isPdfFileName(officialLetterOriginalName || officialLetterUrl)) {
    throw new ApiError(400, 'Surat resmi hasil seleksi harus berupa file PDF.');
  }

  await prisma.$transaction(async (tx) => {
    let officeLetterId = record.decisionLetterId || null;
    const officePayload = buildCandidateDecisionLetterOfficePayload(record, {
      issueCity,
      issueDate,
      signerName,
      signerPosition,
      officialLetterUrl,
      officialLetterOriginalName,
      generatedBy: requester.name,
    });

    if (officeLetterId) {
      await tx.officeLetter.update({
        where: { id: officeLetterId },
        data: {
          title: resolveOfficeLetterTitle(CANDIDATE_DECISION_LETTER_TYPE),
          recipientId: record.user.id,
          recipientName: record.user.name,
          recipientRole: 'Calon Siswa',
          recipientClass: record.desiredMajor ? `${record.desiredMajor.code} - ${record.desiredMajor.name}` : null,
          recipientPrimaryId: record.user.nisn || record.user.username || null,
          purpose: 'Hasil seleksi PPDB',
          notes: record.reviewNotes || null,
          payload: officePayload,
          printedAt: issueDate,
        },
      });
    } else {
      const academicYearId =
        (
          await tx.academicYear.findFirst({
            where: { isActive: true },
            select: { id: true },
          })
        )?.id || null;

      if (!academicYearId) {
        throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan.');
      }

      const letterNumber = await generateOfficeLetterNumber(
        tx,
        academicYearId,
        CANDIDATE_DECISION_LETTER_TYPE,
        issueDate,
      );

      const createdLetter = await tx.officeLetter.create({
        data: {
          academicYearId,
          createdById: requester.id,
          recipientId: record.user.id,
          type: CANDIDATE_DECISION_LETTER_TYPE,
          letterNumber,
          title: resolveOfficeLetterTitle(CANDIDATE_DECISION_LETTER_TYPE),
          recipientName: record.user.name,
          recipientRole: 'Calon Siswa',
          recipientClass: record.desiredMajor ? `${record.desiredMajor.code} - ${record.desiredMajor.name}` : null,
          recipientPrimaryId: record.user.nisn || record.user.username || null,
          purpose: 'Hasil seleksi PPDB',
          notes: record.reviewNotes || null,
          payload: officePayload,
          printedAt: issueDate,
        },
        select: {
          id: true,
        },
      });

      officeLetterId = createdLetter.id;
    }

    await tx.candidateAdmission.update({
      where: { id },
      data: {
        decisionLetterId: officeLetterId,
        decisionLetterIssuedAt: issueDate,
        decisionLetterIssuedCity: issueCity,
        decisionLetterSignerName: signerName,
        decisionLetterSignerPosition: signerPosition,
        decisionLetterOfficialUrl: officialLetterUrl,
        decisionLetterOfficialOriginalName: officialLetterOriginalName,
        decisionLetterOfficialUploadedAt: officialLetterUrl
          ? record.decisionLetterOfficialUrl === officialLetterUrl &&
            record.decisionLetterOfficialUploadedAt
            ? record.decisionLetterOfficialUploadedAt
            : new Date()
          : null,
      },
    });
  });

  const updated = await loadCandidateAdmissionById(id);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(updated),
        'Surat hasil seleksi berhasil diperbarui',
      ),
    );
});

export const upsertCandidateAdmissionAssessments = asyncHandler(async (req: Request, res: Response) => {
  await assertCandidateAdmissionReadAccess(getAuthUserId(req));
  const id = normalizeOptionalPositiveInt(req.params.id, 'ID pendaftaran');
  if (!id) {
    throw new ApiError(400, 'ID pendaftaran tidak valid.');
  }

  const items = parseCandidateAssessmentWritePayload(req.body);
  const evaluatorId = getAuthUserId(req);

  await prisma.$transaction(
    items.map((item) =>
      prisma.candidateAdmissionAssessment.upsert({
        where: {
          admissionId_componentCode: {
            admissionId: id,
            componentCode: item.componentCode,
          },
        },
        update: {
          title:
            CANDIDATE_ASSESSMENT_DEFINITIONS.find((definition) => definition.code === item.componentCode)?.title ||
            item.componentCode,
          sourceType: SelectionAssessmentSource.MANUAL,
          score: item.score,
          maxScore: item.maxScore ?? 100,
          weight:
            item.weight ??
            CANDIDATE_ASSESSMENT_DEFINITIONS.find((definition) => definition.code === item.componentCode)?.weight ??
            1,
          passingScore:
            item.passingScore ??
            CANDIDATE_ASSESSMENT_DEFINITIONS.find((definition) => definition.code === item.componentCode)?.passingScore ??
            70,
          notes: item.notes,
          assessedAt: item.assessedAt,
          evaluatorId,
        },
        create: {
          admissionId: id,
          componentCode: item.componentCode,
          title:
            CANDIDATE_ASSESSMENT_DEFINITIONS.find((definition) => definition.code === item.componentCode)?.title ||
            item.componentCode,
          sourceType: SelectionAssessmentSource.MANUAL,
          score: item.score,
          maxScore: item.maxScore ?? 100,
          weight:
            item.weight ??
            CANDIDATE_ASSESSMENT_DEFINITIONS.find((definition) => definition.code === item.componentCode)?.weight ??
            1,
          passingScore:
            item.passingScore ??
            CANDIDATE_ASSESSMENT_DEFINITIONS.find((definition) => definition.code === item.componentCode)?.passingScore ??
            70,
          notes: item.notes,
          assessedAt: item.assessedAt,
          evaluatorId,
        },
      }),
    ),
  );

  const updated = await loadCandidateAdmissionById(id);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(updated),
        'Nilai komponen tes PPDB berhasil diperbarui',
      ),
    );
});

export const reviewCandidateAdmission = asyncHandler(async (req: Request, res: Response) => {
  const id = normalizeOptionalPositiveInt(req.params.id, 'ID pendaftaran');
  if (!id) {
    throw new ApiError(400, 'ID pendaftaran tidak valid.');
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const normalizedStatus = String(body.status || '').trim().toUpperCase();
  if (!normalizedStatus) {
    throw new ApiError(400, 'Status review wajib diisi.');
  }
  if (!allowedAdminReviewStatuses.includes(normalizedStatus as CandidateAdmissionStatus)) {
    throw new ApiError(400, 'Status review tidak didukung.');
  }

  const nextStatus = normalizedStatus as CandidateAdmissionStatus;
  const reviewNotes = normalizeOptionalText(body.reviewNotes);
  const decisionTitle = hasOwn(body, 'decisionTitle')
    ? normalizeOptionalText(body.decisionTitle)
    : undefined;
  const decisionSummary = hasOwn(body, 'decisionSummary')
    ? normalizeOptionalText(body.decisionSummary)
    : undefined;
  const decisionNextSteps = hasOwn(body, 'decisionNextSteps')
    ? normalizeOptionalText(body.decisionNextSteps)
    : undefined;
  const shouldPublishDecision = hasOwn(body, 'publishDecision')
    ? normalizeOptionalBoolean(body.publishDecision, 'publishDecision')
    : undefined;
  const reviewedAt = new Date();

  if (shouldPublishDecision && !isDecisionPublishableStatus(nextStatus)) {
    throw new ApiError(
      400,
      'Pengumuman hasil seleksi hanya dapat dipublikasikan pada status PASSED_TEST, FAILED_TEST, ACCEPTED, atau REJECTED.',
    );
  }

  const updateData: Prisma.CandidateAdmissionUncheckedUpdateInput = {
    status: nextStatus,
    reviewNotes,
    reviewedAt,
    acceptedAt: nextStatus === CandidateAdmissionStatus.ACCEPTED ? reviewedAt : null,
  };

  if (decisionTitle !== undefined) {
    updateData.decisionTitle = decisionTitle;
  }
  if (decisionSummary !== undefined) {
    updateData.decisionSummary = decisionSummary;
  }
  if (decisionNextSteps !== undefined) {
    updateData.decisionNextSteps = decisionNextSteps;
  }
  if (!isDecisionPublishableStatus(nextStatus)) {
    updateData.decisionPublishedAt = null;
  } else if (shouldPublishDecision !== undefined) {
    updateData.decisionPublishedAt = shouldPublishDecision ? reviewedAt : null;
  }

  const updated = await prisma.candidateAdmission.update({
    where: { id },
    data: updateData,
    select: candidateAdmissionSelect.select,
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(updated),
        'Review pendaftaran calon siswa berhasil diperbarui',
      ),
    );
});

export const acceptCandidateAdmissionAsStudent = asyncHandler(async (req: Request, res: Response) => {
  const id = normalizeOptionalPositiveInt(req.params.id, 'ID pendaftaran');
  if (!id) {
    throw new ApiError(400, 'ID pendaftaran tidak valid.');
  }

  const existing = await prisma.candidateAdmission.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      user: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  });

  if (!existing) {
    throw new ApiError(404, 'Pendaftaran calon siswa tidak ditemukan.');
  }
  if (existing.user.role !== Role.CALON_SISWA) {
    throw new ApiError(400, 'Pengguna sudah bukan calon siswa.');
  }
  if (existing.status !== CandidateAdmissionStatus.ACCEPTED) {
    throw new ApiError(400, 'Setujui status pendaftaran menjadi ACCEPTED sebelum mempromosikan menjadi siswa.');
  }

  await activateCandidateAsOfficialStudent({
    userId: existing.userId,
    candidateAdmissionId: id,
  });

  const refreshed = await prisma.candidateAdmission.findUnique({
    where: { id },
    select: candidateAdmissionSelect.select,
  });

  if (!refreshed) {
    throw new ApiError(404, 'Pendaftaran calon siswa tidak ditemukan setelah promosi.');
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await buildCandidateAdmissionDetailPayload(refreshed),
        'Calon siswa berhasil dipromosikan menjadi siswa',
      ),
    );
});
