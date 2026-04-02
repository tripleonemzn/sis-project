export type PublicBkkApplicationStatus =
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'SHORTLISTED'
  | 'PARTNER_INTERVIEW'
  | 'HIRED'
  | 'INTERVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type PublicBkkPartner = {
  id: number;
  name: string;
  city?: string | null;
  sector?: string | null;
};

export type PublicBkkVacancy = {
  id: number;
  title: string;
  companyName?: string | null;
  description?: string | null;
  requirements?: string | null;
  registrationLink?: string | null;
  deadline?: string | null;
  isOpen: boolean;
  industryPartnerId?: number | null;
  industryPartner?: PublicBkkPartner | null;
  createdAt?: string;
  updatedAt?: string;
  applicationCount?: number;
  myApplication?: {
    id: number;
    status: PublicBkkApplicationStatus;
    appliedAt: string;
    reviewedAt?: string | null;
    shortlistedAt?: string | null;
    partnerInterviewAt?: string | null;
    finalizedAt?: string | null;
    updatedAt?: string | null;
  } | null;
  isExpired?: boolean;
  canApplyInApp?: boolean;
};

export type PublicBkkApplicantProfile = {
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
  educationHistories?: Array<{
    level: 'TK' | 'SD' | 'SMP_MTS' | 'SLTA' | 'D1' | 'D2' | 'D3' | 'D4_S1' | 'S2' | 'S3';
    institutionName?: string | null;
    faculty?: string | null;
    studyProgram?: string | null;
    gpa?: string | null;
    degree?: string | null;
    documents: Array<{
      kind: 'IJAZAH' | 'SKHUN' | 'TRANSKRIP';
      label: string;
      fileUrl: string;
      originalName?: string | null;
      mimeType?: string | null;
      size?: number | null;
      uploadedAt?: string | null;
    }>;
  }> | null;
  skills?: string | null;
  experienceSummary?: string | null;
  cvUrl?: string | null;
  portfolioUrl?: string | null;
  linkedinUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  completeness: {
    isReady: boolean;
    missingFields: string[];
  };
};

export type PublicBkkApplication = {
  id: number;
  status: PublicBkkApplicationStatus;
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
    industryPartner?: PublicBkkPartner | null;
  };
  profile?: {
    id: number;
    educationLevel?: string | null;
    graduationYear?: number | null;
    schoolName?: string | null;
    major?: string | null;
    educationHistories?: Array<{
      level: 'TK' | 'SD' | 'SMP_MTS' | 'SLTA' | 'D1' | 'D2' | 'D3' | 'D4_S1' | 'S2' | 'S3';
      institutionName?: string | null;
      faculty?: string | null;
      studyProgram?: string | null;
      gpa?: string | null;
      degree?: string | null;
      documents: Array<{
        kind: 'IJAZAH' | 'SKHUN' | 'TRANSKRIP';
        label: string;
        fileUrl: string;
        originalName?: string | null;
        mimeType?: string | null;
        size?: number | null;
        uploadedAt?: string | null;
      }>;
    }> | null;
    cvUrl?: string | null;
    portfolioUrl?: string | null;
    linkedinUrl?: string | null;
  } | null;
  assessmentBoard?: {
    items: Array<{
      code: 'DOCUMENT_SCREENING' | 'ONLINE_TEST' | 'INTERNAL_INTERVIEW' | 'PARTNER_INTERVIEW';
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
    }>;
    summary: {
      totalStages: number;
      completedStages: number;
      weightedAverage: number | null;
      incompleteStages: string[];
      failedStages: string[];
      recommendation: 'INCOMPLETE' | 'PASS' | 'FAIL';
      passThreshold: number;
    };
  };
};

export type PublicBkkApplicationSummary = {
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
