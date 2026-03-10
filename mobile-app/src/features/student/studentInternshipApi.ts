import { apiClient } from '../../lib/api/client';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

export type StudentInternship = {
  id: number;
  companyName?: string | null;
  companyAddress?: string | null;
  mentorName?: string | null;
  mentorPhone?: string | null;
  mentorEmail?: string | null;
  companyLatitude?: string | null;
  companyLongitude?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  reportUrl?: string | null;
  reportTitle?: string | null;
  rejectionReason?: string | null;
  acceptanceLetterUrl?: string | null;
  defenseDate?: string | null;
  defenseRoom?: string | null;
  industryScore?: number | null;
  defenseScore?: number | null;
  finalGrade?: number | null;
  createdAt?: string | null;
};

export type StudentInternshipJournal = {
  id: number;
  internshipId: number;
  date: string;
  activity: string;
  imageUrl?: string | null;
  status?: string | null;
  feedback?: string | null;
};

export type StudentInternshipAttendance = {
  id: number;
  internshipId: number;
  date: string;
  status: string;
  note?: string | null;
  imageUrl?: string | null;
};

export type StudentInternshipOverviewPayload = {
  internship: StudentInternship | null;
  isEligible: boolean;
  colleagues?: Array<{
    id: number;
    student?: {
      id: number;
      name: string;
      nis?: string | null;
      studentClass?: {
        id: number;
        name: string;
      } | null;
    } | null;
  }>;
  officials?: {
    activeAcademicYear?: {
      id: number;
      name: string;
    } | null;
  };
};

type InternshipMutationPayload = {
  companyName: string;
  companyAddress: string;
  mentorName: string;
  mentorPhone?: string;
  mentorEmail?: string;
  startDate?: string;
  endDate?: string;
  companyLatitude?: string;
  companyLongitude?: string;
  reportTitle?: string;
};

type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

export const studentInternshipApi = {
  async getMyInternship() {
    const response = await apiClient.get<ApiEnvelope<StudentInternshipOverviewPayload>>('/internships/my-internship');
    return response.data?.data || { internship: null, isEligible: false };
  },
  async apply(payload: InternshipMutationPayload) {
    const response = await apiClient.post<ApiEnvelope<StudentInternship>>('/internships/apply', payload);
    return response.data?.data;
  },
  async updateMyInternship(payload: InternshipMutationPayload) {
    const response = await apiClient.put<ApiEnvelope<StudentInternship>>('/internships/my-internship', payload);
    return response.data?.data;
  },
  async listJournals(internshipId: number) {
    const response = await apiClient.get<ApiEnvelope<StudentInternshipJournal[]>>(
      `/internships/${internshipId}/journals`,
    );
    return response.data?.data || [];
  },
  async createJournal(payload: {
    internshipId: number;
    date: string;
    activity: string;
    imageUrl?: string;
  }) {
    const response = await apiClient.post<ApiEnvelope<StudentInternshipJournal>>(
      `/internships/${payload.internshipId}/journals`,
      {
        date: payload.date,
        activity: payload.activity,
        imageUrl: payload.imageUrl,
      },
    );
    return response.data?.data;
  },
  async listAttendances(internshipId: number) {
    const response = await apiClient.get<ApiEnvelope<StudentInternshipAttendance[]>>(
      `/internships/${internshipId}/attendances`,
    );
    return response.data?.data || [];
  },
  async createAttendance(payload: {
    internshipId: number;
    date: string;
    status: string;
    note?: string;
    proofUrl?: string;
  }) {
    const response = await apiClient.post<ApiEnvelope<StudentInternshipAttendance>>(
      `/internships/${payload.internshipId}/attendances`,
      {
        date: payload.date,
        status: payload.status,
        note: payload.note,
        proofUrl: payload.proofUrl,
      },
    );
    return response.data?.data;
  },
  async uploadInternshipFile(file: {
    uri: string;
    name?: string;
    mimeType?: string;
  }) {
    const formData = new FormData();
    const filePart: ReactNativeFilePart = {
      uri: file.uri,
      name: file.name || `internship-${Date.now()}.jpg`,
      type: file.mimeType || 'application/octet-stream',
    };
    formData.append('file', filePart as unknown as Blob);

    const response = await apiClient.post<ApiEnvelope<{ url: string }>>('/uploads/internship', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data?.url || null;
  },
  async submitReport(payload: { internshipId: number; reportUrl: string }) {
    const response = await apiClient.post<ApiEnvelope<StudentInternship>>(
      `/internships/${payload.internshipId}/report`,
      {
        reportUrl: payload.reportUrl,
      },
    );
    return response.data?.data;
  },
};
