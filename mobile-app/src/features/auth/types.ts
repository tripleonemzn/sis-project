export type LoginPayload = {
  username: string;
  password: string;
};

export type RegisterUmumPayload = {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
  phone?: string;
  email?: string;
};

export type RegisterCalonSiswaPayload = {
  name: string;
  nisn: string;
  phone: string;
  email?: string;
  password: string;
  confirmPassword: string;
};

export type RegisterParentPayload = {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
  phone: string;
  email?: string;
};

export type RegisterBkkPayload = {
  username: string;
  password: string;
  confirmPassword: string;
  name: string;
  phone: string;
  email?: string;
};

export type AuthUser = {
  id: number;
  name: string;
  role: string;
  isDemo?: boolean;
  username: string;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  gender?: 'MALE' | 'FEMALE' | null;
  citizenship?: string | null;
  maritalStatus?: string | null;
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
  motherName?: string | null;
  motherNik?: string | null;
  motherEducation?: string | null;
  motherOccupation?: string | null;
  motherIncome?: string | null;
  guardianName?: string | null;
  guardianEducation?: string | null;
  guardianOccupation?: string | null;
  guardianPhone?: string | null;
  nik?: string | null;
  familyCardNumber?: string | null;
  nuptk?: string | null;
  highestEducation?: string | null;
  studyProgram?: string | null;
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
  ekskulTutorAssignments?: Array<{
    id: number;
    tutorId: number;
    ekskulId: number;
    academicYearId: number;
    isActive: boolean;
    ekskul?: {
      id: number;
      name: string;
      description?: string | null;
      category?: 'EXTRACURRICULAR' | 'OSIS';
    } | null;
    academicYear?: {
      id: number;
      name: string;
      isActive?: boolean;
    } | null;
  }>;
  managedInventoryRooms?: Array<{
    id: number;
    name: string;
    managerUserId?: number | null;
  }>;
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

export type RegisterCalonSiswaResponse = RegisterUmumResponse;
export type RegisterParentResponse = RegisterUmumResponse;
export type RegisterBkkResponse = RegisterUmumResponse;
