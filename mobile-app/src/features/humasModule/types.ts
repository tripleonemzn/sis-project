export type PklEligibleGrades = 'XI' | 'XII' | 'XI, XII';

export type HumasAcademicYear = {
  id: number;
  name: string;
  semester?: 'ODD' | 'EVEN' | string;
  pklEligibleGrades?: string | null;
  isActive?: boolean;
};

export type HumasInternshipStatus =
  | 'PROPOSED'
  | 'WAITING_ACCEPTANCE_LETTER'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REPORT_SUBMITTED'
  | 'DEFENSE_SCHEDULED'
  | 'DEFENSE_COMPLETED'
  | 'COMPLETED'
  | 'REJECTED'
  | string;

export type HumasInternshipRow = {
  id: number;
  status: HumasInternshipStatus;
  rejectionReason?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  mentorName?: string | null;
  mentorPhone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  reportUrl?: string | null;
  defenseDate?: string | null;
  defenseRoom?: string | null;
  industryScore?: number | null;
  defenseScore?: number | null;
  finalGrade?: number | null;
  createdAt?: string;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    studentClass?: {
      id: number;
      name: string;
      major?: {
        id: number;
        name: string;
        code?: string | null;
      } | null;
    } | null;
  } | null;
  teacher?: {
    id: number;
    name: string;
  } | null;
  examiner?: {
    id: number;
    name: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
  } | null;
};

export type HumasJournalRow = {
  id: number;
  internshipId: number;
  date: string;
  activity: string;
  imageUrl?: string | null;
  status?: string | null;
  feedback?: string | null;
  createdAt?: string;
};

export type InternshipAssessmentComponentRow = {
  id: number;
  name: string;
  description?: string | null;
  weight: number;
  isActive: boolean;
  createdAt?: string;
};

export type HumasPartnerRow = {
  id: number;
  name: string;
  address?: string | null;
  city?: string | null;
  sector?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  cooperationStatus?: string | null;
  mouDocumentUrl?: string | null;
  createdAt?: string;
};

export type HumasVacancyRow = {
  id: number;
  title: string;
  companyName?: string | null;
  description?: string | null;
  requirements?: string | null;
  registrationLink?: string | null;
  deadline?: string | null;
  isOpen: boolean;
  industryPartnerId?: number | null;
  industryPartner?: HumasPartnerRow | null;
  createdAt?: string;
};
