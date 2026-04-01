export type MobileCandidateAdmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_REVISION'
  | 'TEST_SCHEDULED'
  | 'PASSED_TEST'
  | 'FAILED_TEST'
  | 'ACCEPTED'
  | 'REJECTED';

export type MobileCandidateAdmissionMajor = {
  id: number;
  name: string;
  code: string;
};

export type MobileCandidateAdmissionDocument = {
  id: number;
  title: string;
  fileUrl: string;
  category: string;
  createdAt?: string;
};

export type MobileCandidateAdmissionInvalidDocument = MobileCandidateAdmissionDocument & {
  validationError: string;
};

export type MobileCandidateAdmissionDocumentRequirement = {
  code: string;
  label: string;
  description: string;
  required: boolean;
  acceptedFormats: string[];
  isComplete: boolean;
  uploadedCount: number;
  validUploadedCount: number;
  invalidCount: number;
  documents: MobileCandidateAdmissionDocument[];
  invalidDocuments: MobileCandidateAdmissionInvalidDocument[];
};

export type MobileCandidateAdmissionSelectionResult = {
  sessionId: number;
  scheduleId: number;
  title: string;
  subject?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
  programCode?: string | null;
  sessionLabel?: string | null;
  status: string;
  score?: number | null;
  kkm?: number | null;
  passed?: boolean | null;
  duration?: number | null;
  startedAt: string;
  endedAt?: string | null;
  submittedAt?: string | null;
  scheduleStartTime: string;
  scheduleEndTime: string;
};

export type MobileCandidateAdmissionDecisionAnnouncement = {
  isEligibleStatus: boolean;
  isPublished: boolean;
  title?: string | null;
  summary?: string | null;
  nextSteps?: string | null;
  publishedAt?: string | null;
};

export type MobileCandidateAdmissionDecisionLetter = {
  isDraftAvailable: boolean;
  isFinalized: boolean;
  archiveLetterId?: number | null;
  type: string;
  title?: string | null;
  letterNumber?: string | null;
  issuedAt?: string | null;
  issuedCity?: string | null;
  signerName?: string | null;
  signerPosition?: string | null;
  principalName?: string | null;
  officialFileUrl?: string | null;
  officialOriginalName?: string | null;
  officialUploadedAt?: string | null;
  generatedAt?: string | null;
};

export type MobileCandidateAdmissionFinanceState = 'NO_BILLING' | 'CLEAR' | 'PENDING' | 'OVERDUE';

export type MobileCandidateAdmissionFinanceInvoice = {
  id: number;
  invoiceNo: string;
  label: string;
  periodKey: string;
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  dueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  issuedAt: string;
};

export type MobileCandidateAdmissionFinanceSummary = {
  state: MobileCandidateAdmissionFinanceState;
  hasOutstanding: boolean;
  hasOverdue: boolean;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  activeInvoices: number;
  overdueInvoices: number;
  settledInvoices: number;
  nextDueDate?: string | null;
  lastPaymentAt?: string | null;
  invoices: MobileCandidateAdmissionFinanceInvoice[];
};

export type MobileCandidateAdmissionAssessmentItem = {
  code: 'TKD' | 'LITERACY_COLOR' | 'INTERVIEW' | 'PHYSICAL';
  title: string;
  sourceType: 'MANUAL' | 'EXAM' | 'PARTNER' | 'SYSTEM';
  score?: number | null;
  rawScore?: number | null;
  maxScore?: number | null;
  weight?: number | null;
  passingScore?: number | null;
  notes?: string | null;
  assessedAt?: string | null;
  completed: boolean;
  passed?: boolean | null;
  evaluator?: {
    id: number;
    name: string;
    role: string;
  } | null;
};

export type MobileCandidateAdmissionAssessmentBoard = {
  items: MobileCandidateAdmissionAssessmentItem[];
  summary: {
    totalComponents: number;
    completedComponents: number;
    weightedAverage: number | null;
    incompleteComponents: string[];
    failedComponents: string[];
    recommendation: 'INCOMPLETE' | 'PASS' | 'FAIL';
    passThreshold: number;
  };
};

export const MOBILE_CANDIDATE_DOCUMENT_OPTIONS = [
  {
    value: 'PPDB_AKTA_KELAHIRAN',
    label: 'Akta Kelahiran',
    description: 'Salinan akta kelahiran calon siswa.',
    required: true,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_KARTU_KELUARGA',
    label: 'Kartu Keluarga',
    description: 'Scan/foto kartu keluarga terbaru.',
    required: true,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_RAPOR_TERAKHIR',
    label: 'Rapor Terakhir',
    description: 'Rapor semester terakhir atau dokumen nilai pendukung.',
    required: true,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_PAS_FOTO',
    label: 'Pas Foto',
    description: 'Pas foto terbaru calon siswa.',
    required: true,
    acceptedFormats: ['JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_SERTIFIKAT',
    label: 'Sertifikat / Piagam',
    description: 'Opsional, untuk sertifikat prestasi atau dokumen tambahan.',
    required: false,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
] as const;

const MOBILE_CANDIDATE_DOCUMENT_LABEL_MAP = Object.fromEntries(
  MOBILE_CANDIDATE_DOCUMENT_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>;

export function getMobileCandidateDocumentCategoryLabel(category?: string | null) {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return MOBILE_CANDIDATE_DOCUMENT_LABEL_MAP[normalized] || category || 'Dokumen Pendukung';
}

export type MobileCandidateAdmissionDetail = {
  id: number;
  userId: number;
  registrationNumber: string;
  status: MobileCandidateAdmissionStatus;
  desiredMajorId?: number | null;
  desiredMajor?: MobileCandidateAdmissionMajor | null;
  previousSchool?: string | null;
  lastEducation?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  domicileCity?: string | null;
  motivation?: string | null;
  submissionNotes?: string | null;
  reviewNotes?: string | null;
  decisionTitle?: string | null;
  decisionSummary?: string | null;
  decisionNextSteps?: string | null;
  decisionPublishedAt?: string | null;
  decisionAnnouncement: MobileCandidateAdmissionDecisionAnnouncement;
  decisionLetter: MobileCandidateAdmissionDecisionLetter;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  acceptedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  documentChecklist: {
    required: MobileCandidateAdmissionDocumentRequirement[];
    optional: MobileCandidateAdmissionDocumentRequirement[];
    requiredComplete: boolean;
    summary: {
      totalUploaded: number;
      requiredUploaded: number;
      requiredTotal: number;
      optionalUploaded: number;
      uncategorizedCount: number;
      invalidCount: number;
    };
    uncategorizedDocuments: MobileCandidateAdmissionDocument[];
    invalidDocuments: MobileCandidateAdmissionInvalidDocument[];
  };
  canSubmit: boolean;
  canPublishDecision: boolean;
  canPromoteToStudent: boolean;
  officialStudentAccount?: {
    userId: number;
    username: string;
    nis?: string | null;
    nisn?: string | null;
    studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT' | null;
    currentAcademicYear?: {
      id: number;
      name: string;
      isActive: boolean;
    } | null;
    currentMembership?: {
      id: number;
      academicYearId: number;
      classId?: number | null;
      status: string;
      isCurrent: boolean;
      startedAt?: string | null;
      endedAt?: string | null;
    } | null;
    currentClass?: {
      id: number;
      name: string;
      level?: string | null;
      major?: {
        id: number;
        name: string;
        code: string;
      } | null;
    } | null;
  } | null;
  accountVerificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  resolvedParentName?: string | null;
  resolvedParentPhone?: string | null;
  completeness: {
    isReady: boolean;
    percent: number;
    completedCount: number;
    totalFields: number;
    missingFields: string[];
  };
  user: {
    id: number;
    name: string;
    username: string;
    nis?: string | null;
    nisn?: string | null;
    phone?: string | null;
    email?: string | null;
    gender?: 'MALE' | 'FEMALE' | null;
    birthPlace?: string | null;
    birthDate?: string | null;
    address?: string | null;
    religion?: string | null;
    fatherName?: string | null;
    motherName?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
    verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
    role: string;
    documents: MobileCandidateAdmissionDocument[];
  };
  selectionResults?: {
    results: MobileCandidateAdmissionSelectionResult[];
    summary: {
      total: number;
      completed: number;
      inProgress: number;
      passed: number;
      failed: number;
      averageScore: number | null;
      latestSubmittedAt: string | null;
    };
  };
  assessmentBoard?: MobileCandidateAdmissionAssessmentBoard;
  financeSummary?: MobileCandidateAdmissionFinanceSummary;
};
