export type UserRole =
  | 'ADMIN'
  | 'TEACHER'
  | 'STUDENT'
  | 'PRINCIPAL'
  | 'STAFF'
  | 'PARENT'
  | 'CALON_SISWA'
  | 'UMUM'
  | 'EXAMINER'
  | 'EXTRACURRICULAR_TUTOR';

export type ProfileEducationDocumentKind = 'IJAZAH' | 'SKHUN' | 'TRANSKRIP';

export interface ProfileEducationDocument {
  kind: ProfileEducationDocumentKind;
  label: string;
  fileUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  uploadedAt?: string | null;
}

export interface ProfileEducationHistory {
  level: 'TK' | 'SD' | 'SMP_MTS' | 'SLTA' | 'D1' | 'D2' | 'D3' | 'D4_S1' | 'S2' | 'S3';
  institutionName?: string | null;
  faculty?: string | null;
  studyProgram?: string | null;
  gpa?: string | null;
  degree?: string | null;
  documents: ProfileEducationDocument[];
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  isDemo?: boolean;
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT';
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  nip?: string | null;
  nis?: string | null;
  nisn?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  citizenship?: string | null;
  maritalStatus?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  
  // New Personal Data
  nik?: string | null;
  familyCardNumber?: string | null;
  nuptk?: string | null;
  highestEducation?: string | null;
  studyProgram?: string | null;
  educationHistories?: ProfileEducationHistory[] | null;
  motherName?: string | null;
  motherNik?: string | null;

  // New Contact Data
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

  // New Employment Data
  ptkType?: string | null;
  employeeStatus?: string | null;
  appointmentDecree?: string | null;
  appointmentDate?: string | null;
  assignmentDecree?: string | null;
  assignmentDate?: string | null;
  institution?: string | null;
  employeeActiveStatus?: string | null;
  salarySource?: string | null;

  // Student Class
  classId?: number | null;
  studentClass?: {
    id: number;
    name: string;
    level?: string | null;
    presidentId?: number | null;
    academicYearId?: number | null;
    major?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;

  // Additional Student Data (currently optional/not fully used)
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

  photo?: string | null;

  documents?: {
    id: number;
    title: string;
    fileUrl: string;
    category: string;
    // Legacy fields for backward compatibility
    name?: string;
    type?: string;
  }[];

  children?: {
    id: number;
    name: string;
    username: string;
    nisn?: string | null;
  }[];

  additionalDuties?: string[];
  preferences?: Record<string, unknown> | null;
  managedMajorIds?: number[];
  managedMajors?: {
    id: number;
    name: string;
    code: string;
  }[];
  managedMajorId?: number | null;
  managedMajor?: {
    id: number;
    name: string;
    code: string;
  } | null;
  examinerMajorId?: number | null;
  examinerMajor?: {
    id: number;
    name: string;
    code: string;
  } | null;
  teacherClasses?: {
    id: number;
    name: string;
  }[];
  ekskulTutorAssignments?: {
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
  }[];
  managedInventoryRooms?: {
    id: number;
    name: string;
    managerUserId?: number | null;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface ParentLinkedChild {
  id: number;
  name: string;
  username: string;
  nis?: string | null;
  nisn?: string | null;
  birthDate?: string | null;
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT' | null;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  studentClass?: {
    id: number;
    name: string;
    major?: {
      id: number;
      name: string;
      code?: string | null;
    } | null;
  } | null;
}

export interface UserDocumentInput {
  id?: number;
  title: string;
  fileUrl: string;
  category: string;
  // Legacy fields
  name?: string;
  type?: string;
}

export type UserWrite = Omit<User, 'documents' | 'children'> & {
  documents?: UserDocumentInput[];
  childNisns?: string[];
};

export interface AuthResponse {
  statusCode: number;
  data: {
    user: User;
    token: string;
  };
  message: string;
  success: boolean;
}

export interface RegisterCalonSiswaPayload {
  name: string;
  nisn: string;
  phone: string;
  email?: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterParentPayload {
  name: string;
  username: string;
  phone: string;
  email?: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterBkkPayload {
  name: string;
  username: string;
  phone: string;
  email?: string;
  password: string;
  confirmPassword: string;
}

export interface ForgotPasswordRequestPayload {
  username: string;
  email: string;
}

export interface ForgotPasswordRequestResult {
  contactHint?: string | null;
  channel?: 'EMAIL';
}

export interface ForgotPasswordValidateResult {
  expiresAt: string;
  contactHint?: string | null;
  channel?: 'EMAIL';
}

export interface ForgotPasswordResetPayload {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ParentChildLinkPayload {
  nisn: string;
  birthDate: string;
}

export interface ParentChildLookupResult {
  student: ParentLinkedChild;
  alreadyLinkedToCurrentParent: boolean;
  linkedParentCount: number;
  oneTimeWarning: string;
}
