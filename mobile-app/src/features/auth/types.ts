export type LoginPayload = {
  username: string;
  password: string;
};

export type RegisterUmumPayload = {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
};

export type AuthUser = {
  id: number;
  name: string;
  role: string;
  username: string;
  gender?: 'MALE' | 'FEMALE' | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  photo?: string | null;
  nis?: string | null;
  nisn?: string | null;
  nip?: string | null;
  religion?: string | null;
  childNumber?: number | null;
  siblingsCount?: number | null;
  fatherName?: string | null;
  fatherOccupation?: string | null;
  fatherIncome?: string | null;
  motherName?: string | null;
  motherOccupation?: string | null;
  motherIncome?: string | null;
  guardianName?: string | null;
  guardianOccupation?: string | null;
  guardianPhone?: string | null;
  nik?: string | null;
  nuptk?: string | null;
  rt?: string | null;
  rw?: string | null;
  dusun?: string | null;
  village?: string | null;
  subdistrict?: string | null;
  postalCode?: string | null;
  ptkType?: string | null;
  employeeStatus?: string | null;
  appointmentDecree?: string | null;
  appointmentDate?: string | null;
  institution?: string | null;
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT' | null;
  documents?: Array<{
    id: number;
    title: string;
    fileUrl: string;
    category: string;
    uploadedAt?: string;
  }>;
  additionalDuties?: string[];
  teacherClasses?: Array<{ id: number; name: string }>;
  trainingClassesTeaching?: Array<{ id: number; name: string }>;
  managedMajor?: { id: number; name: string; code?: string | null } | null;
  managedMajors?: Array<{ id: number; name: string; code?: string | null }>;
  examinerMajor?: { id: number; name: string; code?: string | null } | null;
  children?: Array<{ id: number; name: string; username?: string; nisn?: string | null }>;
  studentClass?: {
    id: number;
    name: string;
    presidentId?: number | null;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  } | null;
};

export type LoginResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    token: string;
    refreshToken?: string;
    user: AuthUser;
  };
};

export type MeResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: AuthUser;
};

export type RegisterUmumResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: AuthUser;
};
