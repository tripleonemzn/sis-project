export type InternshipDutyStatus =
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

export type InternshipDutyRow = {
  id: number;
  status: InternshipDutyStatus;
  companyName?: string | null;
  companyAddress?: string | null;
  mentorName?: string | null;
  mentorPhone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  defenseDate?: string | null;
  defenseRoom?: string | null;
  industryScore?: number | null;
  defenseScore?: number | null;
  scorePresentation?: number | null;
  scoreUnderstanding?: number | null;
  scoreRelevance?: number | null;
  scoreSystematics?: number | null;
  defenseNotes?: string | null;
  finalGrade?: number | null;
  createdAt?: string;
  student?: {
    id: number;
    name?: string | null;
    nis?: string | null;
    studentClass?: {
      id: number;
      name?: string | null;
    } | null;
  } | null;
  academicYear?: {
    id: number;
    name?: string | null;
  } | null;
};

export type InternshipJournalRow = {
  id: number;
  internshipId: number;
  date: string;
  activity: string;
  imageUrl?: string | null;
  status?: string | null;
  feedback?: string | null;
  createdAt?: string;
};

export type InternshipAttendanceRow = {
  id: number;
  internshipId: number;
  date?: string | null;
  status?: string | null;
  note?: string | null;
  imageUrl?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  checkInTime?: string | null;
  createdAt?: string;
};
