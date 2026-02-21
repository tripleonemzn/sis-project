export type HeadProgramClassRow = {
  id: number;
  name: string;
  level: string;
  majorId?: number | null;
  major?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
  teacher?: {
    id: number;
    name: string;
    username?: string;
  } | null;
  _count?: {
    students?: number;
  };
};

export type HeadProgramInternshipRow = {
  id: number;
  status?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  mentorName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  defenseDate?: string | null;
  defenseRoom?: string | null;
  industryScore?: number | null;
  defenseScore?: number | null;
  finalGrade?: number | null;
  createdAt?: string;
  student?: {
    id: number;
    name: string;
    nisn?: string | null;
    studentClass?: {
      id: number;
      name: string;
      level?: string;
      majorId?: number | null;
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

export type IndustryPartnerRow = {
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
  createdAt?: string;
  updatedAt?: string;
  // Legacy aliases (for backward compatibility with old responses)
  field?: string | null;
  picName?: string | null;
  picPhone?: string | null;
  picEmail?: string | null;
};

export type JobVacancyRow = {
  id: number;
  title: string;
  companyName?: string | null;
  description?: string | null;
  requirements?: string | null;
  registrationLink?: string | null;
  deadline?: string | null;
  industryPartnerId?: number | null;
  location?: string | null;
  salary?: string | null;
  isOpen: boolean;
  closingDate?: string | null; // Legacy alias
  createdAt?: string;
  updatedAt?: string;
  industryPartner?: {
    id: number;
    name: string;
  } | null;
};
