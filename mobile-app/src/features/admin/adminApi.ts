import { apiClient } from '../../lib/api/client';

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type PaginatedResult<T> = {
  items: T[];
  pagination: Pagination;
};

export type AdminUser = {
  id: number;
  username: string;
  name: string;
  role:
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
  nis?: string | null;
  nisn?: string | null;
  nip?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  photo?: string | null;
  classId?: number | null;
  verificationStatus?: string | null;
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT' | null;
  additionalDuties?: string[] | null;
  managedMajorId?: number | null;
  managedMajors?: Array<{
    id: number;
    name: string;
    code: string;
  }>;
  examinerMajorId?: number | null;
  examinerMajor?: {
    id: number;
    name: string;
    code: string;
  } | null;
  studentClass?: {
    id: number;
    name: string;
    major?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
  children?: Array<{
    id: number;
    name: string;
    username?: string | null;
    nisn?: string | null;
  }>;
  documents?: Array<{
    id?: number;
    title?: string;
    fileUrl: string;
    category?: string;
    name?: string;
    type?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminMajor = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  _count?: {
    classes?: number;
  };
};

export type AdminSubject = {
  id: number;
  code: string;
  name: string;
  category?: {
    id: number;
    name: string;
    code: string;
  } | null;
  kkms?: Array<{
    classLevel: 'X' | 'XI' | 'XII';
    kkm: number;
    academicYearId?: number | null;
  }>;
  _count?: {
    children?: number;
    teacherAssignments?: number;
  };
};

export type AdminSubjectCategory = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  _count?: {
    subjects?: number;
  };
};

export type AdminClass = {
  id: number;
  name: string;
  level: string;
  major?: {
    id: number;
    name: string;
    code: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  teacher?: {
    id: number;
    name: string;
    username?: string;
  } | null;
  president?: {
    id: number;
    name: string;
  } | null;
  _count?: {
    students?: number;
  };
};

export type AdminClassDetailStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  gender?: string | null;
  studentStatus?: string | null;
};

export type AdminClassDetail = AdminClass & {
  majorId?: number;
  academicYearId?: number;
  teacherId?: number | null;
  presidentId?: number | null;
  students?: AdminClassDetailStudent[];
};

export type AdminTrainingClass = {
  id: number;
  name: string;
  description?: string | null;
  academicYearId?: number;
  instructorId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  maxCapacity?: number | null;
  isActive?: boolean;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
  instructor?: {
    id: number;
    name: string;
    username?: string;
  } | null;
  _count?: {
    materials?: number;
    assignments?: number;
    exams?: number;
    enrollments?: number;
  };
};

export type AdminAcademicYear = {
  id: number;
  name: string;
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
  isActive: boolean;
  pklEligibleGrades?: string | null;
};

export type AdminTeacherAssignment = {
  id: number;
  teacher?: { id: number; name: string; username: string } | null;
  subject?: { id: number; name: string; code: string } | null;
  class?: {
    id: number;
    name: string;
    level: string;
    major?: {
      id: number;
      name: string;
      code: string;
    } | null;
    _count?: {
      students?: number;
    };
  } | null;
  academicYear?: { id: number; name: string } | null;
  _count?: {
    scheduleEntries?: number;
  };
};

export type AdminScheduleDayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export type AdminSchedulePeriodType = 'TEACHING' | 'UPACARA' | 'ISTIRAHAT' | 'TADARUS' | 'OTHER';

export type AdminScheduleTimeConfigPayload = {
  periodTimes: Record<string, Record<number, string>>;
  periodNotes: Record<string, Record<number, string>>;
  periodTypes?: Record<string, Record<number, AdminSchedulePeriodType>>;
};

export type AdminScheduleTimeConfig = {
  id: number;
  academicYearId: number;
  config: AdminScheduleTimeConfigPayload;
  createdAt: string;
  updatedAt: string;
};

export type AdminScheduleEntry = {
  id: number;
  academicYearId: number;
  classId: number;
  teacherAssignmentId: number;
  dayOfWeek: AdminScheduleDayOfWeek;
  period: number;
  teachingHour?: number | null;
  room?: string | null;
  createdAt?: string;
  updatedAt?: string;
  teacherAssignment: {
    id: number;
    teacher: {
      id: number;
      name: string;
      username: string;
    };
    subject: {
      id: number;
      name: string;
      code: string;
    };
    class: {
      id: number;
      name: string;
      level: string;
      major?: {
        id: number;
        name: string;
        code: string;
      } | null;
    };
    academicYear?: {
      id: number;
      name: string;
    } | null;
  };
};

export type AdminTeachingLoadDetail = {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  classCount: number;
  sessionCount: number;
  hours: number;
};

export type AdminTeachingLoadTeacher = {
  teacherId: number;
  teacherName: string;
  teacherUsername: string;
  totalClasses: number;
  totalSubjects: number;
  totalSessions: number;
  totalHours: number;
  details: AdminTeachingLoadDetail[];
};

export type AdminTeacherAssignmentPayload = {
  academicYearId: number;
  teacherId: number;
  subjectId: number;
  classIds: number[];
};

export type AdminExtracurricular = {
  id: number;
  name: string;
  description?: string | null;
  tutorAssignments?: Array<{
    id: number;
    tutor?: {
      name: string;
    } | null;
  }>;
};

export type AdminExamType =
  | 'FORMATIF'
  | 'SBTS'
  | 'SAS'
  | 'SAT'
  | 'US_PRACTICE'
  | 'US_THEORY';

export type AdminExamQuestionType =
  | 'MULTIPLE_CHOICE'
  | 'COMPLEX_MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'ESSAY'
  | 'MATCHING';

export type AdminExamQuestion = {
  id: number;
  type?: AdminExamQuestionType | string;
  content?: string;
  points?: number | null;
  answerKey?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  options?: Array<{
    id?: string;
    content?: string;
    isCorrect?: boolean;
  }>;
  bank?: {
    id: number;
    title?: string;
    semester?: 'ODD' | 'EVEN' | null;
    classLevel?: string | null;
    subject?: {
      id: number;
      name: string;
      code: string;
    } | null;
    academicYear?: {
      id: number;
      name: string;
    } | null;
    author?: {
      name?: string;
      username?: string;
    } | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminExamPacket = {
  id: number;
  title: string;
  description?: string | null;
  type?: AdminExamType | string;
  semester?: 'ODD' | 'EVEN' | null;
  duration?: number | null;
  kkm?: number | null;
  subjectId?: number;
  academicYearId?: number;
  subject?: {
    id: number;
    name: string;
    code: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
  } | null;
  author?: {
    id?: number;
    name?: string;
    username?: string;
  } | null;
  _count?: {
    schedules?: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type AdminExamSchedule = {
  id: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  room?: string | null;
  semester?: 'ODD' | 'EVEN' | null;
  subject?: {
    id: number;
    name: string;
    code: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
  } | null;
  proctor?: {
    id: number;
    name: string;
    username?: string;
  } | null;
  _count?: {
    sessions?: number;
  };
  class?: {
    id: number;
    name: string;
  } | null;
  packet?: {
    id: number;
    title: string;
    type?: AdminExamType | string;
    semester?: string;
    duration?: number;
    subject?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
};

export type AdminAttendanceLateSummary = {
  recap: Array<{
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    semester1Late: number;
    semester2Late: number;
    totalLate: number;
  }>;
  meta?: {
    classId?: number;
    academicYearId?: number;
  };
};

export type AdminAttendanceSemesterFilter = 'ALL' | 'ODD' | 'EVEN';

export type AdminAttendanceDailyRecap = {
  recap: Array<{
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    present: number;
    late: number;
    sick: number;
    permission: number;
    absent: number;
    total: number;
    percentage: number;
  }>;
  meta?: {
    classId?: number;
    academicYearId?: number;
    semester?: string | null;
    dateRange?: {
      start?: string;
      end?: string;
    };
  };
};

export type AdminAcademicEventType =
  | 'LIBUR_NASIONAL'
  | 'LIBUR_SEKOLAH'
  | 'UJIAN_PTS'
  | 'UJIAN_PAS'
  | 'UJIAN_PAT'
  | 'MPLS'
  | 'RAPOR'
  | 'KEGIATAN_SEKOLAH'
  | 'LAINNYA';

export type AdminAcademicEventSemester = 'ODD' | 'EVEN';

export type AdminAcademicEvent = {
  id: number;
  academicYearId: number;
  title: string;
  type: AdminAcademicEventType;
  startDate: string;
  endDate: string;
  semester?: AdminAcademicEventSemester | null;
  isHoliday: boolean;
  description?: string | null;
};

export type AdminClassReportSummary = {
  class?: {
    id: number;
    name: string;
    level?: string;
  };
  subjects?: Array<{
    subject?: {
      id: number;
      code?: string;
      name?: string;
    };
  }>;
  students?: Array<{
    student?: {
      id: number;
      name: string;
    };
    subjects?: unknown[];
  }>;
  meta?: {
    academicYearId?: number;
  };
};

export type AdminClassRankingRow = {
  rank: number;
  totalScore: number;
  averageScore: number;
  subjectCount: number;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  };
};

export type AdminClassRankingsResponse = {
  className?: string;
  academicYear?: string;
  semester?: 'ODD' | 'EVEN';
  homeroomTeacher?: {
    id?: number;
    name?: string;
    username?: string;
    nip?: string | null;
  } | null;
  principalName?: string;
  principalNip?: string;
  rankings?: AdminClassRankingRow[];
};

export type AdminUserWritePayload = {
  username?: string;
  password?: string;
  name?: string;
  role?:
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
  nip?: string | null;
  nis?: string | null;
  nisn?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  photo?: string | null;
  classId?: number | null;
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT';
  additionalDuties?: string[];
  managedMajorIds?: number[];
  examinerMajorId?: number | null;
  childNisns?: string[];
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
};

export type AdminUserCreatePayload = Required<
  Pick<AdminUserWritePayload, 'username' | 'password' | 'name' | 'role'>
> &
  Omit<AdminUserWritePayload, 'verificationStatus'>;

type MobileBinaryFile = {
  uri: string;
  name?: string;
  type?: string;
};

type MobileImportFile = MobileBinaryFile;

export type AdminSlideshowSlide = {
  id: string;
  filename: string;
  url: string;
  description: string;
  order: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminMajorPayload = {
  name: string;
  code: string;
  description?: string | null;
};

export type AdminSubjectCategoryPayload = {
  code: string;
  name: string;
  description?: string | null;
};

export type AdminSubjectPayload = {
  name: string;
  code: string;
  description?: string | null;
  parentId?: number | null;
  subjectCategoryId?: number;
  kkmX?: number | null;
  kkmXI?: number | null;
  kkmXII?: number | null;
};

export type AdminClassPayload = {
  name: string;
  level: string;
  majorId: number;
  academicYearId: number;
  teacherId?: number | null;
};

export type AdminTrainingClassPayload = {
  name: string;
  description?: string | null;
  academicYearId: number;
  instructorId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  maxCapacity?: number | null;
  isActive?: boolean;
};

export type AdminExtracurricularPayload = {
  name: string;
  description?: string | null;
};

export type AdminAcademicYearPayload = {
  name: string;
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
  isActive?: boolean;
  pklEligibleGrades?: string | null;
};

export type AdminAcademicEventPayload = {
  academicYearId: number;
  title: string;
  type: AdminAcademicEventType;
  startDate: string;
  endDate: string;
  semester?: AdminAcademicEventSemester | null;
  isHoliday?: boolean;
  description?: string | null;
};

const normalizePagination = (
  raw: Partial<Pagination> | undefined,
  fallbackLimit: number,
  fallbackTotal: number,
): Pagination => {
  const limit = Number(raw?.limit) > 0 ? Number(raw?.limit) : Math.max(1, fallbackLimit);
  const total = Number(raw?.total) >= 0 ? Number(raw?.total) : Math.max(0, fallbackTotal);
  const page = Number(raw?.page) > 0 ? Number(raw?.page) : 1;
  const totalPages = Number(raw?.totalPages) > 0 ? Number(raw?.totalPages) : Math.max(1, Math.ceil(total / limit) || 1);
  return { page, limit, total, totalPages };
};

const toPaginated = <T,>(
  rawItems: T[] | undefined,
  rawPagination: Partial<Pagination> | undefined,
  fallbackLimit: number,
): PaginatedResult<T> => {
  const items = Array.isArray(rawItems) ? rawItems : [];
  return {
    items,
    pagination: normalizePagination(rawPagination, fallbackLimit, items.length),
  };
};

export const adminApi = {
  async listUsers(params?: { role?: string; verificationStatus?: string }) {
    const response = await apiClient.get<ApiEnvelope<AdminUser[]>>('/users', {
      params,
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createUser(payload: AdminUserCreatePayload) {
    const response = await apiClient.post<ApiEnvelope<AdminUser>>('/users', payload);
    return response.data?.data;
  },

  async listMajors(params?: { page?: number; limit?: number; search?: string }) {
    const response = await apiClient.get<
      ApiEnvelope<{ majors: AdminMajor[]; pagination: Pagination }>
    >('/majors', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
      },
    });
    return toPaginated(response.data?.data?.majors, response.data?.data?.pagination, params?.limit ?? 100);
  },

  async createMajor(payload: AdminMajorPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminMajor>>('/majors', payload);
    return response.data?.data;
  },

  async updateMajor(id: number, payload: Partial<AdminMajorPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminMajor>>(`/majors/${id}`, payload);
    return response.data?.data;
  },

  async deleteMajor(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/majors/${id}`);
    return response.data?.data;
  },

  async listSubjects(params?: { page?: number; limit?: number; search?: string; subjectCategoryId?: number }) {
    const response = await apiClient.get<
      ApiEnvelope<{ subjects: AdminSubject[]; pagination: Pagination }>
    >('/subjects', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
        subjectCategoryId: params?.subjectCategoryId,
      },
    });
    return toPaginated(
      response.data?.data?.subjects,
      response.data?.data?.pagination,
      params?.limit ?? 100,
    );
  },

  async createSubject(payload: AdminSubjectPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminSubject>>('/subjects', payload);
    return response.data?.data;
  },

  async updateSubject(id: number, payload: Partial<AdminSubjectPayload>) {
    const response = await apiClient.patch<ApiEnvelope<AdminSubject>>(`/subjects/${id}`, payload);
    return response.data?.data;
  },

  async deleteSubject(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/subjects/${id}`);
    return response.data?.data;
  },

  async listSubjectCategories() {
    const response = await apiClient.get<ApiEnvelope<AdminSubjectCategory[]>>('/subject-categories');
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createSubjectCategory(payload: AdminSubjectCategoryPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminSubjectCategory>>('/subject-categories', payload);
    return response.data?.data;
  },

  async updateSubjectCategory(id: number, payload: Partial<AdminSubjectCategoryPayload>) {
    const response = await apiClient.patch<ApiEnvelope<AdminSubjectCategory>>(`/subject-categories/${id}`, payload);
    return response.data?.data;
  },

  async deleteSubjectCategory(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/subject-categories/${id}`);
    return response.data?.data;
  },

  async listExtracurriculars(params?: { page?: number; limit?: number; search?: string }) {
    const response = await apiClient.get<
      ApiEnvelope<{ extracurriculars: AdminExtracurricular[]; pagination: Pagination }>
    >('/extracurriculars', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
      },
    });
    return toPaginated(
      response.data?.data?.extracurriculars,
      response.data?.data?.pagination,
      params?.limit ?? 100,
    );
  },

  async createExtracurricular(payload: AdminExtracurricularPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminExtracurricular>>('/extracurriculars', payload);
    return response.data?.data;
  },

  async updateExtracurricular(id: number, payload: Partial<AdminExtracurricularPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminExtracurricular>>(`/extracurriculars/${id}`, payload);
    return response.data?.data;
  },

  async deleteExtracurricular(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/extracurriculars/${id}`);
    return response.data?.data;
  },

  async listClasses(params?: {
    page?: number;
    limit?: number;
    search?: string;
    level?: string;
    majorId?: number;
    academicYearId?: number;
    teacherId?: number;
  }) {
    const response = await apiClient.get<
      ApiEnvelope<{ classes: AdminClass[]; pagination: Pagination }>
    >('/classes', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
        level: params?.level,
        majorId: params?.majorId,
        academicYearId: params?.academicYearId,
        teacherId: params?.teacherId,
      },
    });
    return toPaginated(response.data?.data?.classes, response.data?.data?.pagination, params?.limit ?? 100);
  },

  async createClass(payload: AdminClassPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminClass>>('/classes', payload);
    return response.data?.data;
  },

  async updateClass(id: number, payload: AdminClassPayload) {
    const response = await apiClient.put<ApiEnvelope<AdminClass>>(`/classes/${id}`, payload);
    return response.data?.data;
  },

  async deleteClass(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/classes/${id}`);
    return response.data?.data;
  },

  async listTrainingClasses(params?: { page?: number; limit?: number; search?: string }) {
    const response = await apiClient.get<
      ApiEnvelope<{ trainingClasses: AdminTrainingClass[]; pagination: Pagination }>
    >('/training-classes', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
      },
    });
    return toPaginated(
      response.data?.data?.trainingClasses,
      response.data?.data?.pagination,
      params?.limit ?? 100,
    );
  },

  async createTrainingClass(payload: AdminTrainingClassPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminTrainingClass>>('/training-classes', payload);
    return response.data?.data;
  },

  async updateTrainingClass(id: number, payload: Partial<AdminTrainingClassPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminTrainingClass>>(`/training-classes/${id}`, payload);
    return response.data?.data;
  },

  async deleteTrainingClass(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/training-classes/${id}`);
    return response.data?.data;
  },

  async getClassById(id: number) {
    const response = await apiClient.get<ApiEnvelope<AdminClassDetail>>(`/classes/${id}`);
    return response.data?.data;
  },

  async listAcademicYears(params?: { page?: number; limit?: number; isActive?: boolean; search?: string }) {
    const response = await apiClient.get<
      ApiEnvelope<{ academicYears: AdminAcademicYear[]; pagination: Pagination }>
    >('/academic-years', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 50,
        isActive: params?.isActive,
        search: params?.search,
      },
    });
    return toPaginated(
      response.data?.data?.academicYears,
      response.data?.data?.pagination,
      params?.limit ?? 50,
    );
  },

  async getActiveAcademicYear() {
    const response = await apiClient.get<ApiEnvelope<AdminAcademicYear & { semester?: 'ODD' | 'EVEN' }>>(
      '/academic-years/active',
    );
    return response.data?.data;
  },

  async createAcademicYear(payload: AdminAcademicYearPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicYear>>('/academic-years', payload);
    return response.data?.data;
  },

  async updateAcademicYear(id: number, payload: AdminAcademicYearPayload) {
    const response = await apiClient.put<ApiEnvelope<AdminAcademicYear>>(`/academic-years/${id}`, payload);
    return response.data?.data;
  },

  async deleteAcademicYear(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/academic-years/${id}`);
    return response.data?.data;
  },

  async listTeacherAssignments(params: { academicYearId: number; page?: number; limit?: number }) {
    const response = await apiClient.get<
      ApiEnvelope<{ assignments: AdminTeacherAssignment[]; pagination: Pagination }>
    >('/teacher-assignments', {
      params: {
        academicYearId: params.academicYearId,
        page: params.page ?? 1,
        limit: params.limit ?? 100,
      },
    });
    return toPaginated(
      response.data?.data?.assignments,
      response.data?.data?.pagination,
      params.limit ?? 100,
    );
  },

  async upsertTeacherAssignments(payload: AdminTeacherAssignmentPayload) {
    const response = await apiClient.post<ApiEnvelope<{ assignments: AdminTeacherAssignment[] }>>(
      '/teacher-assignments',
      payload,
    );
    return response.data?.data?.assignments || [];
  },

  async deleteTeacherAssignment(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/teacher-assignments/${id}`);
    return response.data?.data;
  },

  async getTeachingLoadSummary(params: { academicYearId: number; teacherId?: number }) {
    const response = await apiClient.get<ApiEnvelope<{ teachers: AdminTeachingLoadTeacher[] }>>(
      '/schedules/teaching-summary',
      {
        params: {
          academicYearId: params.academicYearId,
          teacherId: params.teacherId,
        },
      },
    );
    return response.data?.data?.teachers || [];
  },

  async listSchedules(params: { academicYearId: number; classId?: number; teacherId?: number }) {
    const response = await apiClient.get<ApiEnvelope<{ entries: AdminScheduleEntry[] }>>('/schedules', {
      params: {
        academicYearId: params.academicYearId,
        classId: params.classId,
        teacherId: params.teacherId,
      },
    });
    return response.data?.data?.entries || [];
  },

  async createScheduleEntry(payload: {
    academicYearId: number;
    classId: number;
    teacherAssignmentId: number;
    dayOfWeek: AdminScheduleDayOfWeek;
    period: number;
    room?: string | null;
  }) {
    const response = await apiClient.post<ApiEnvelope<AdminScheduleEntry>>('/schedules', payload);
    return response.data?.data;
  },

  async deleteScheduleEntry(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/schedules/${id}`);
    return response.data?.data;
  },

  async getScheduleTimeConfig(academicYearId?: number) {
    const response = await apiClient.get<{
      success: boolean;
      data: AdminScheduleTimeConfig | null;
      academicYearId?: number;
    }>('/schedule-time-configs', {
      params: academicYearId ? { academicYearId } : undefined,
    });
    return response.data?.data || null;
  },

  async saveScheduleTimeConfig(payload: {
    academicYearId: number;
    config: AdminScheduleTimeConfigPayload;
  }) {
    const response = await apiClient.post<{
      success: boolean;
      message?: string;
      data: AdminScheduleTimeConfig;
    }>('/schedule-time-configs', payload);
    return response.data?.data;
  },

  async listExamQuestions(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: AdminExamQuestionType | string;
    subjectId?: number;
    academicYearId?: number;
    semester?: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<
      ApiEnvelope<{
        questions: AdminExamQuestion[];
        meta: Pagination;
      }>
    >('/exams/questions', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        search: params?.search,
        type: params?.type,
        subjectId: params?.subjectId,
        academicYearId: params?.academicYearId,
        semester: params?.semester,
      },
    });
    return toPaginated(
      response.data?.data?.questions,
      response.data?.data?.meta,
      params?.limit ?? 20,
    );
  },

  async listExamPackets(params?: {
    type?: AdminExamType | string;
    subjectId?: number;
    academicYearId?: number;
    semester?: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminExamPacket[]>>('/exams/packets', {
      params: {
        type: params?.type,
        subjectId: params?.subjectId,
        academicYearId: params?.academicYearId,
        semester: params?.semester,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async listExamSchedules(params?: {
    examType?: AdminExamType | string;
    academicYearId?: number;
    classId?: number;
    packetId?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminExamSchedule[]>>('/exams/schedules', {
      params: {
        examType: params?.examType,
        academicYearId: params?.academicYearId,
        classId: params?.classId,
        packetId: params?.packetId,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createExamSchedule(payload: {
    packetId: number;
    classIds: number[];
    startTime: string;
    endTime: string;
    proctorId?: number;
    room?: string | null;
  }) {
    const response = await apiClient.post<ApiEnvelope<AdminExamSchedule[]>>('/exams/schedules', payload);
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async updateExamSchedule(
    id: number,
    payload: {
      startTime?: string;
      endTime?: string;
      proctorId?: number | null;
      room?: string | null;
      isActive?: boolean;
    },
  ) {
    const response = await apiClient.patch<ApiEnvelope<AdminExamSchedule>>(`/exams/schedules/${id}`, payload);
    return response.data?.data;
  },

  async deleteExamSchedule(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/exams/schedules/${id}`);
    return response.data?.data;
  },

  async getLateSummaryByClass(params: { classId: number; academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<AdminAttendanceLateSummary>>('/attendances/daily/late-summary', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
      },
    });
    return response.data?.data;
  },

  async getDailyAttendanceRecap(params: {
    classId: number;
    academicYearId?: number;
    semester?: AdminAttendanceSemesterFilter;
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminAttendanceDailyRecap>>('/attendances/daily/recap', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data?.data;
  },

  async getClassReportSummary(params: { classId: number; academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<AdminClassReportSummary>>('/reports/report-cards', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
      },
    });
    return response.data?.data;
  },

  async getClassRankings(params: { classId: number; academicYearId?: number; semester: 'ODD' | 'EVEN' }) {
    const response = await apiClient.get<ApiEnvelope<AdminClassRankingsResponse>>('/reports/rankings', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data?.data;
  },

  async listAcademicEvents(params: {
    academicYearId: number;
    semester?: AdminAcademicEventSemester;
    type?: AdminAcademicEventType;
  }) {
    const response = await apiClient.get<ApiEnvelope<{ events: AdminAcademicEvent[] }>>('/academic-events', {
      params: {
        academicYearId: params.academicYearId,
        semester: params.semester,
        type: params.type,
      },
    });
    return response.data?.data?.events || [];
  },

  async createAcademicEvent(payload: AdminAcademicEventPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicEvent>>('/academic-events', payload);
    return response.data?.data;
  },

  async updateAcademicEvent(id: number, payload: Partial<AdminAcademicEventPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminAcademicEvent>>(`/academic-events/${id}`, payload);
    return response.data?.data;
  },

  async deleteAcademicEvent(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/academic-events/${id}`);
    return response.data?.data;
  },

  async listSlideshowSlides() {
    const response = await apiClient.get<
      ApiEnvelope<{ slides: AdminSlideshowSlide[]; settings?: { slideIntervalMs?: number } }>
    >('/gallery/slides');
    return {
      slides: Array.isArray(response.data?.data?.slides) ? response.data.data.slides : [],
      settings: response.data?.data?.settings,
    };
  },

  async uploadSlideshowSlide(
    file: MobileBinaryFile,
    payload?: {
      description?: string;
      isActive?: boolean;
    },
  ) {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || `slide-${Date.now()}.jpg`,
      type: file.type || 'image/jpeg',
    } as any);
    if (typeof payload?.description === 'string') {
      formData.append('description', payload.description);
    }
    if (typeof payload?.isActive === 'boolean') {
      formData.append('isActive', payload.isActive ? 'true' : 'false');
    }

    const response = await apiClient.post<
      ApiEnvelope<{ slide: AdminSlideshowSlide; slides: AdminSlideshowSlide[] }>
    >('/gallery/slides/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data?.data;
  },

  async updateSlideshowSlide(
    id: string,
    payload: Partial<Pick<AdminSlideshowSlide, 'description' | 'isActive' | 'order'>>,
  ) {
    const response = await apiClient.patch<
      ApiEnvelope<{ slide: AdminSlideshowSlide; slides: AdminSlideshowSlide[] }>
    >(`/gallery/slides/${id}`, payload);
    return response.data?.data;
  },

  async reorderSlideshowSlides(ids: string[]) {
    const response = await apiClient.patch<ApiEnvelope<{ slides: AdminSlideshowSlide[] }>>(
      '/gallery/slides/reorder',
      { ids },
    );
    return response.data?.data;
  },

  async deleteSlideshowSlide(id: string) {
    const response = await apiClient.delete<ApiEnvelope<{ deletedId: string; slides: AdminSlideshowSlide[] }>>(
      `/gallery/slides/${id}`,
    );
    return response.data?.data;
  },

  async updateSlideshowSettings(settings: { slideIntervalMs: number }) {
    const response = await apiClient.patch<ApiEnvelope<{ settings: { slideIntervalMs: number } }>>(
      '/gallery/settings',
      settings,
    );
    return response.data?.data;
  },

  async updateUser(id: number, payload: AdminUserWritePayload) {
    const response = await apiClient.put<ApiEnvelope<AdminUser>>(`/users/${id}`, payload);
    return response.data?.data;
  },

  async deleteUser(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/users/${id}`);
    return response.data?.data;
  },

  async verifyUsersBulk(userIds: number[]) {
    const response = await apiClient.post<ApiEnvelope<{ updatedCount: number }>>('/users/verify-bulk', {
      userIds,
    });
    return response.data?.data;
  },

  async importTeachers(file: MobileImportFile) {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || `teachers-${Date.now()}.xlsx`,
      type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as any);
    const response = await apiClient.post<ApiEnvelope<any>>('/data/teachers/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },

  async importStudents(file: MobileImportFile) {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || `students-${Date.now()}.xlsx`,
      type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as any);
    const response = await apiClient.post<ApiEnvelope<any>>('/data/students/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },

  async importParents(file: MobileImportFile) {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || `parents-${Date.now()}.xlsx`,
      type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as any);
    const response = await apiClient.post<ApiEnvelope<any>>('/data/parents/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },

  async activateAcademicYear(id: number) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicYear>>(`/academic-years/${id}/activate`);
    return response.data?.data;
  },
};
