import { apiClient } from '../../lib/api/client';
import { AuthUser } from '../auth/types';

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type UploadResponse = {
  url: string;
  filename: string;
  originalname: string;
  mimetype: string;
};

type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

export type UpdateSelfProfilePayload = {
  name?: string;
  gender?: 'MALE' | 'FEMALE' | null;
  citizenship?: string | null;
  maritalStatus?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  nip?: string | null;
  nik?: string | null;
  familyCardNumber?: string | null;
  nuptk?: string | null;
  highestEducation?: string | null;
  studyProgram?: string | null;
  motherName?: string | null;
  motherNik?: string | null;
  religion?: string | null;
  childNumber?: number | null;
  distanceToSchool?: string | null;
  familyStatus?: string | null;
  livingWith?: string | null;
  transportationMode?: string | null;
  travelTimeToSchool?: string | null;
  kipNumber?: string | null;
  pkhNumber?: string | null;
  kksNumber?: string | null;
  siblingsCount?: number | null;
  fatherName?: string | null;
  fatherNik?: string | null;
  fatherEducation?: string | null;
  fatherOccupation?: string | null;
  fatherIncome?: string | null;
  motherEducation?: string | null;
  motherOccupation?: string | null;
  motherIncome?: string | null;
  guardianName?: string | null;
  guardianEducation?: string | null;
  guardianOccupation?: string | null;
  guardianPhone?: string | null;
  rt?: string | null;
  rw?: string | null;
  dusun?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  cityRegency?: string | null;
  cityRegencyCode?: string | null;
  village?: string | null;
  subdistrict?: string | null;
  subdistrictCode?: string | null;
  villageCode?: string | null;
  postalCode?: string | null;
  ptkType?: string | null;
  employeeStatus?: string | null;
  employeeActiveStatus?: string | null;
  salarySource?: string | null;
  appointmentDecree?: string | null;
  appointmentDate?: string | null;
  assignmentDecree?: string | null;
  assignmentDate?: string | null;
  institution?: string | null;
  photo?: string | null;
  documents?: Array<{
    title: string;
    fileUrl: string;
    category: string;
  }>;
};

export const profileApi = {
  async updateSelf(userId: number, payload: UpdateSelfProfilePayload) {
    const response = await apiClient.put<ApiEnvelope<AuthUser>>(`/users/${userId}`, payload);
    return response.data?.data;
  },
  async uploadProfilePhoto(file: { uri: string; name: string; type: string }) {
    const formData = new FormData();
    const filePart: ReactNativeFilePart = {
      uri: file.uri,
      name: file.name,
      type: file.type,
    };
    formData.append('file', filePart as unknown as Blob);
    const response = await apiClient.post<ApiEnvelope<UploadResponse>>('/upload/teacher/photo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },
  async uploadProfileDocument(file: { uri: string; name: string; type: string }) {
    const formData = new FormData();
    const filePart: ReactNativeFilePart = {
      uri: file.uri,
      name: file.name,
      type: file.type,
    };
    formData.append('file', filePart as unknown as Blob);
    const response = await apiClient.post<ApiEnvelope<UploadResponse>>('/upload/teacher/document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },
};
