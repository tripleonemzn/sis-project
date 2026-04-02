import api from './api';

export type JobApplicationStatus =
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'SHORTLISTED'
  | 'PARTNER_INTERVIEW'
  | 'HIRED'
  | 'INTERVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type ReviewableJobApplicationStatus =
  | 'REVIEWING'
  | 'SHORTLISTED'
  | 'PARTNER_INTERVIEW'
  | 'HIRED'
  | 'REJECTED'
  | 'INTERVIEW'
  | 'ACCEPTED';

export type JobApplicationAssessmentStageCode =
  | 'DOCUMENT_SCREENING'
  | 'ONLINE_TEST'
  | 'INTERNAL_INTERVIEW'
  | 'PARTNER_INTERVIEW';

export interface JobApplicationAssessmentItem {
  code: JobApplicationAssessmentStageCode;
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
  evaluator?: {
    id: number;
    name: string;
    role: string;
  } | null;
}

export interface JobApplicationAssessmentSummary {
  totalStages: number;
  completedStages: number;
  weightedAverage: number | null;
  incompleteStages: string[];
  failedStages: string[];
  recommendation: 'INCOMPLETE' | 'PASS' | 'FAIL';
  passThreshold: number;
}

export interface JobApplicationAssessmentBoard {
  items: JobApplicationAssessmentItem[];
  summary: JobApplicationAssessmentSummary;
}

export interface IndustryPartner {
  id: number;
  name: string;
  address: string;
  city?: string | null;
  sector?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  cooperationStatus: 'AKTIF' | 'NON_AKTIF' | 'PROSES';
  mouDocumentUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobVacancyApplicationState {
  id: number;
  status: JobApplicationStatus;
  appliedAt: string;
  reviewedAt?: string | null;
  shortlistedAt?: string | null;
  partnerInterviewAt?: string | null;
  finalizedAt?: string | null;
  updatedAt?: string | null;
}

export interface JobVacancy {
  id: number;
  title: string;
  companyName?: string | null;
  description?: string | null;
  requirements?: string | null;
  registrationLink?: string | null;
  deadline?: string | null;
  isOpen: boolean;
  industryPartnerId?: number | null;
  industryPartner?: IndustryPartner | null;
  createdAt: string;
  updatedAt: string;
  applicationCount?: number;
  myApplication?: JobVacancyApplicationState | null;
  isExpired?: boolean;
  canApplyInApp?: boolean;
}

export interface ApplicantCompleteness {
  isReady: boolean;
  missingFields: string[];
}

export interface JobApplicantEducationHistoryDocument {
  kind: 'IJAZAH' | 'SKHUN' | 'TRANSKRIP';
  label: string;
  fileUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  uploadedAt?: string | null;
}

export interface JobApplicantEducationHistory {
  level: 'TK' | 'SD' | 'SMP_MTS' | 'SLTA' | 'D3' | 'D4_S1' | 'S2' | 'S3';
  institutionName?: string | null;
  faculty?: string | null;
  studyProgram?: string | null;
  gpa?: string | null;
  degree?: string | null;
  documents: JobApplicantEducationHistoryDocument[];
}

export interface JobApplicantProfile {
  id: number | null;
  userId: number;
  name: string;
  username: string;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  headline?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  educationLevel?: string | null;
  graduationYear?: number | null;
  schoolName?: string | null;
  major?: string | null;
  educationHistories?: JobApplicantEducationHistory[] | null;
  skills?: string | null;
  experienceSummary?: string | null;
  cvUrl?: string | null;
  portfolioUrl?: string | null;
  linkedinUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completeness: ApplicantCompleteness;
}

export interface JobApplicationRow {
  id: number;
  status: JobApplicationStatus;
  coverLetter?: string | null;
  expectedSalary?: string | null;
  source?: string | null;
  reviewerNotes?: string | null;
  partnerReferenceCode?: string | null;
  partnerDecisionNotes?: string | null;
  appliedAt: string;
  reviewedAt?: string | null;
  shortlistedAt?: string | null;
  partnerInterviewAt?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  vacancy: {
    id: number;
    title: string;
    companyName?: string | null;
    registrationLink?: string | null;
    deadline?: string | null;
    isOpen: boolean;
    industryPartner?: {
      id: number;
      name: string;
      city?: string | null;
      sector?: string | null;
    } | null;
  };
  profile?: {
    id: number;
    educationLevel?: string | null;
    graduationYear?: number | null;
    schoolName?: string | null;
    major?: string | null;
    educationHistories?: JobApplicantEducationHistory[] | null;
    cvUrl?: string | null;
    portfolioUrl?: string | null;
    linkedinUrl?: string | null;
  } | null;
  assessmentBoard?: JobApplicationAssessmentBoard;
}

export interface JobApplicationReviewRow {
  id: number;
  status: JobApplicationStatus;
  coverLetter?: string | null;
  expectedSalary?: string | null;
  source?: string | null;
  reviewerNotes?: string | null;
  partnerReferenceCode?: string | null;
  partnerHandoffNotes?: string | null;
  partnerDecisionNotes?: string | null;
  appliedAt: string;
  reviewedAt?: string | null;
  shortlistedAt?: string | null;
  partnerInterviewAt?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  applicant: {
    id: number;
    name: string;
    username: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  };
  profile?: {
    id: number;
    educationLevel?: string | null;
    graduationYear?: number | null;
    schoolName?: string | null;
    major?: string | null;
    educationHistories?: JobApplicantEducationHistory[] | null;
    skills?: string | null;
    experienceSummary?: string | null;
    cvUrl?: string | null;
    portfolioUrl?: string | null;
    linkedinUrl?: string | null;
    updatedAt?: string;
  } | null;
  vacancy: {
    id: number;
    title: string;
    companyName?: string | null;
    deadline?: string | null;
    isOpen: boolean;
    industryPartner?: {
      id: number;
      name: string;
      city?: string | null;
      sector?: string | null;
    } | null;
  };
  assessmentBoard?: JobApplicationAssessmentBoard;
}

export interface JobApplicationBatchShortlistResult {
  partnerReferenceCode: string;
  shortlistedAt: string;
  total: number;
  applications: JobApplicationReviewRow[];
}

export interface JobApplicationBatchSummary {
  vacancyId: number;
  partnerReferenceCode: string;
  shortlistedAt?: string | null;
  updatedAt: string;
  partnerHandoffNotes?: string | null;
  total: number;
  summary: {
    total: number;
    submitted: number;
    reviewing: number;
    shortlisted: number;
    partnerInterview: number;
    interview: number;
    hired: number;
    accepted: number;
    rejected: number;
    withdrawn: number;
  };
  vacancy: {
    id: number;
    title: string;
    companyName?: string | null;
    industryPartner?: {
      id: number;
      name: string;
      city?: string | null;
      sector?: string | null;
    } | null;
  };
}

export interface JobApplicationBatchReport {
  partnerReferenceCode: string;
  shortlistedAt?: string | null;
  partnerHandoffNotes?: string | null;
  total: number;
  summary: {
    total: number;
    submitted: number;
    reviewing: number;
    shortlisted: number;
    partnerInterview: number;
    interview: number;
    hired: number;
    accepted: number;
    rejected: number;
    withdrawn: number;
  };
  vacancy: JobApplicationReviewRow['vacancy'];
  applications: JobApplicationReviewRow[];
}

type PartnerPayload = Record<string, unknown>;
type VacancyPayload = Record<string, unknown>;
type ApplicantProfilePayload = Partial<Omit<JobApplicantProfile, 'graduationYear'>> & {
  name?: string;
  graduationYear?: number | string;
};

export const humasService = {
  getPartners: async (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    return await api.get('/humas/partners', { params });
  },

  createPartner: async (data: PartnerPayload) => {
    return await api.post('/humas/partners', data);
  },

  updatePartner: async (id: number, data: PartnerPayload) => {
    return await api.put(`/humas/partners/${id}`, data);
  },

  deletePartner: async (id: number) => {
    return await api.delete(`/humas/partners/${id}`);
  },

  getVacancies: async (params?: { page?: number; limit?: number; search?: string; isOpen?: boolean }) => {
    return await api.get('/humas/vacancies', { params });
  },

  getVacancyById: async (id: number) => {
    return await api.get(`/humas/vacancies/${id}`);
  },

  createVacancy: async (data: VacancyPayload) => {
    return await api.post('/humas/vacancies', data);
  },

  updateVacancy: async (id: number, data: VacancyPayload) => {
    return await api.put(`/humas/vacancies/${id}`, data);
  },

  deleteVacancy: async (id: number) => {
    return await api.delete(`/humas/vacancies/${id}`);
  },

  getMyApplicantProfile: async () => {
    return await api.get('/humas/applicant-profile/me');
  },

  upsertMyApplicantProfile: async (data: ApplicantProfilePayload) => {
    return await api.put('/humas/applicant-profile/me', data);
  },

  getMyApplications: async () => {
    return await api.get('/humas/applications/me');
  },

  applyToVacancy: async (
    vacancyId: number,
    data?: { coverLetter?: string; expectedSalary?: string; source?: string },
  ) => {
    return await api.post(`/humas/vacancies/${vacancyId}/apply`, data || {});
  },

  withdrawMyApplication: async (applicationId: number) => {
    return await api.patch(`/humas/applications/${applicationId}/withdraw`);
  },

  getApplications: async (params?: { page?: number; limit?: number; search?: string; status?: string; vacancyId?: number }) => {
    return await api.get('/humas/applications', { params });
  },

  getShortlistBatches: async (params?: { vacancyId?: number; search?: string }) => {
    return await api.get('/humas/shortlist-batches', { params });
  },

  getShortlistBatchReport: async (params: { vacancyId: number; partnerReferenceCode: string }) => {
    return await api.get('/humas/shortlist-batches/report', { params });
  },

  updateApplicationStatus: async (
    applicationId: number,
    data: { status: ReviewableJobApplicationStatus; reviewerNotes?: string },
  ) => {
    return await api.patch(`/humas/applications/${applicationId}/status`, data);
  },

  saveApplicationAssessmentBoard: async (
    applicationId: number,
    payload: {
      items: Array<{
        stageCode: JobApplicationAssessmentStageCode;
        score?: number | null;
        maxScore?: number | null;
        weight?: number | null;
        passingScore?: number | null;
        notes?: string | null;
        assessedAt?: string | null;
      }>;
    },
  ) => {
    return await api.patch(`/humas/applications/${applicationId}/assessment-board`, payload);
  },

  saveApplicationPartnerArchive: async (
    applicationId: number,
    payload: {
      partnerReferenceCode?: string | null;
      partnerHandoffNotes?: string | null;
      partnerDecisionNotes?: string | null;
    },
  ) => {
    return await api.patch(`/humas/applications/${applicationId}/partner-archive`, payload);
  },

  batchShortlistApplications: async (payload: {
    vacancyId: number;
    applicationIds: number[];
    partnerReferenceCode?: string | null;
    partnerHandoffNotes?: string | null;
    shortlistedAt?: string | null;
  }) => {
    return await api.patch('/humas/applications/batch-shortlist', payload);
  },
};
