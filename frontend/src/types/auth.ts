export interface User {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PRINCIPAL' | 'STAFF' | 'PARENT' | 'EXAMINER' | 'EXTRACURRICULAR_TUTOR';
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT';
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  nip?: string | null;
  nis?: string | null;
  nisn?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  
  // New Personal Data
  nik?: string | null;
  nuptk?: string | null;
  motherName?: string | null;

  // New Contact Data
  rt?: string | null;
  rw?: string | null;
  dusun?: string | null;
  village?: string | null;
  subdistrict?: string | null;
  postalCode?: string | null;

  // New Employment Data
  ptkType?: string | null;
  employeeStatus?: string | null;
  appointmentDecree?: string | null;
  appointmentDate?: string | null;
  institution?: string | null;

  // Student Class
  classId?: number | null;
  studentClass?: {
    id: number;
    name: string;
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
  siblingsCount?: number | null;

  fatherName?: string | null;
  fatherOccupation?: string | null;
  fatherIncome?: string | null;

  motherOccupation?: string | null;
  motherIncome?: string | null;

  guardianName?: string | null;
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
  preferences?: any;
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
  createdAt: string;
  updatedAt: string;
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
