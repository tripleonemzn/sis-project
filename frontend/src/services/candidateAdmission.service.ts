import api from './api';

export type CandidateAdmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_REVISION'
  | 'TEST_SCHEDULED'
  | 'PASSED_TEST'
  | 'FAILED_TEST'
  | 'ACCEPTED'
  | 'REJECTED';

export interface CandidateAdmissionMajor {
  id: number;
  name: string;
  code: string;
}

export interface CandidateAdmissionDocument {
  id: number;
  title: string;
  fileUrl: string;
  category: string;
  createdAt?: string;
}

export interface CandidateAdmissionInvalidDocument extends CandidateAdmissionDocument {
  validationError: string;
}

export interface CandidateAdmissionDocumentRequirement {
  code: string;
  label: string;
  description: string;
  required: boolean;
  acceptedFormats: string[];
  isComplete: boolean;
  uploadedCount: number;
  validUploadedCount: number;
  invalidCount: number;
  documents: CandidateAdmissionDocument[];
  invalidDocuments: CandidateAdmissionInvalidDocument[];
}

export interface CandidateAdmissionDocumentChecklist {
  required: CandidateAdmissionDocumentRequirement[];
  optional: CandidateAdmissionDocumentRequirement[];
  requiredComplete: boolean;
  summary: {
    totalUploaded: number;
    requiredUploaded: number;
    requiredTotal: number;
    optionalUploaded: number;
    uncategorizedCount: number;
    invalidCount: number;
  };
  uncategorizedDocuments: CandidateAdmissionDocument[];
  invalidDocuments: CandidateAdmissionInvalidDocument[];
}

export interface CandidateAdmissionSelectionResult {
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
}

export interface CandidateAdmissionSelectionSummary {
  total: number;
  completed: number;
  inProgress: number;
  passed: number;
  failed: number;
  averageScore: number | null;
  latestSubmittedAt: string | null;
}

export interface CandidateAdmissionSelectionPayload {
  results: CandidateAdmissionSelectionResult[];
  summary: CandidateAdmissionSelectionSummary;
}

export type CandidateAssessmentComponentCode = 'TKD' | 'LITERACY_COLOR' | 'INTERVIEW' | 'PHYSICAL';

export interface CandidateAdmissionAssessmentItem {
  code: CandidateAssessmentComponentCode;
  title: string;
  sourceType: 'MANUAL' | 'EXAM' | 'PARTNER' | 'SYSTEM';
  score?: number | null;
  rawScore?: number | null;
  maxScore?: number | null;
  weight: number;
  passingScore?: number | null;
  notes?: string | null;
  assessedAt?: string | null;
  completed: boolean;
  passed?: boolean | null;
  isAutoDerived: boolean;
  evaluator?: {
    id: number;
    name: string;
    role: string;
  } | null;
}

export interface CandidateAdmissionAssessmentSummary {
  totalComponents: number;
  completedComponents: number;
  weightedAverage: number | null;
  incompleteComponents: string[];
  failedComponents: string[];
  recommendation: 'INCOMPLETE' | 'PASS' | 'FAIL';
  passThreshold: number;
}

export interface CandidateAdmissionAssessmentBoard {
  items: CandidateAdmissionAssessmentItem[];
  summary: CandidateAdmissionAssessmentSummary;
}

export interface CandidateAdmissionDecisionAnnouncement {
  isEligibleStatus: boolean;
  isPublished: boolean;
  title?: string | null;
  summary?: string | null;
  nextSteps?: string | null;
  publishedAt?: string | null;
}

export interface CandidateAdmissionDecisionLetter {
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
}

export interface CandidateAdmissionUserSnapshot {
  id: number;
  name: string;
  username: string;
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
  documents: CandidateAdmissionDocument[];
}

export interface CandidateAdmissionCompleteness {
  isReady: boolean;
  percent: number;
  completedCount: number;
  totalFields: number;
  missingFields: string[];
}

export interface CandidateAdmissionDetail {
  id: number;
  userId: number;
  registrationNumber: string;
  status: CandidateAdmissionStatus;
  desiredMajorId?: number | null;
  desiredMajor?: CandidateAdmissionMajor | null;
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
  decisionAnnouncement: CandidateAdmissionDecisionAnnouncement;
  decisionLetter: CandidateAdmissionDecisionLetter;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  acceptedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  documentChecklist: CandidateAdmissionDocumentChecklist;
  completeness: CandidateAdmissionCompleteness;
  canSubmit: boolean;
  canPublishDecision: boolean;
  canPromoteToStudent: boolean;
  accountVerificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  resolvedParentName?: string | null;
  resolvedParentPhone?: string | null;
  selectionResults?: CandidateAdmissionSelectionPayload;
  assessmentBoard?: CandidateAdmissionAssessmentBoard;
  user: CandidateAdmissionUserSnapshot;
}

export interface CandidateAdmissionSummary {
  total: number;
  draft: number;
  submitted: number;
  underReview: number;
  needsRevision: number;
  testScheduled: number;
  passedTest: number;
  failedTest: number;
  accepted: number;
  rejected: number;
}

export interface CandidateAdmissionListPayload {
  applications: CandidateAdmissionDetail[];
  total: number;
  page: number;
  totalPages: number;
  summary: CandidateAdmissionSummary;
}

export interface CandidateAdmissionWritePayload {
  name?: string;
  phone?: string;
  email?: string;
  gender?: 'MALE' | 'FEMALE' | '';
  birthPlace?: string;
  birthDate?: string;
  address?: string;
  religion?: string;
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  guardianPhone?: string;
  desiredMajorId?: number | '';
  previousSchool?: string;
  lastEducation?: string;
  parentName?: string;
  parentPhone?: string;
  domicileCity?: string;
  motivation?: string;
  submissionNotes?: string;
}

export const candidateAdmissionService = {
  getMyAdmission: async () => {
    return await api.get('/candidate-admissions/me');
  },

  saveMyAdmission: async (payload: CandidateAdmissionWritePayload) => {
    return await api.put('/candidate-admissions/me', payload);
  },

  submitMyAdmission: async () => {
    return await api.post('/candidate-admissions/me/submit');
  },

  listAdmissions: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: CandidateAdmissionStatus | 'ALL';
    desiredMajorId?: number | 'ALL';
    publishedOnly?: boolean;
  }) => {
    return await api.get('/candidate-admissions', { params });
  },

  getAdmissionById: async (id: number) => {
    return await api.get(`/candidate-admissions/${id}`);
  },

  getMyDecisionLetter: async () => {
    return await api.get('/candidate-admissions/me/decision-letter');
  },

  getDecisionLetter: async (id: number) => {
    return await api.get(`/candidate-admissions/${id}/decision-letter`);
  },

  saveDecisionLetter: async (
    id: number,
    payload: {
      issueCity?: string;
      issueDate?: string;
      signerName?: string;
      signerPosition?: string;
      officialLetterUrl?: string | null;
      officialLetterOriginalName?: string | null;
      clearOfficialLetter?: boolean;
    },
  ) => {
    return await api.put(`/candidate-admissions/${id}/decision-letter`, payload);
  },

  reviewAdmission: async (
    id: number,
    payload: {
      status: CandidateAdmissionStatus;
      reviewNotes?: string;
      decisionTitle?: string;
      decisionSummary?: string;
      decisionNextSteps?: string;
      publishDecision?: boolean;
    },
  ) => {
    return await api.patch(`/candidate-admissions/${id}/review`, payload);
  },

  acceptAsStudent: async (id: number) => {
    return await api.post(`/candidate-admissions/${id}/accept-student`);
  },

  saveAssessmentBoard: async (
    id: number,
    payload: {
      items: Array<{
        componentCode: Exclude<CandidateAssessmentComponentCode, 'TKD'>;
        score?: number | null;
        maxScore?: number | null;
        weight?: number | null;
        passingScore?: number | null;
        notes?: string | null;
        assessedAt?: string | null;
      }>;
    },
  ) => {
    return await api.patch(`/candidate-admissions/${id}/assessment-board`, payload);
  },
};
