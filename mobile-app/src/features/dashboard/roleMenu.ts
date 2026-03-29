import { AuthUser } from '../auth/types';
import { resolveStaffDivision } from '../staff/staffRole';

type MenuTarget =
  | {
      route: string;
      webPath?: string;
    }
  | {
      route?: string;
      webPath: string;
    };

export type RoleMenuItem = {
  key: string;
  label: string;
} & MenuTarget;

export type RoleMenuGroup = {
  key: string;
  label: string;
  items: RoleMenuItem[];
};

export type RoleMenuBuildOptions = {
  hasPendingDefense?: boolean;
  pklEligibleGrades?: string[];
  pklVisibilityOverride?: boolean;
  hasExtracurricularAdvisorAssignments?: boolean;
};

const STRICT_WEB_PARITY_KEYS = new Set<string>([
  'student-schedule',
  'student-learning',
  'student-attendance-history',
  'student-permissions',
  'student-grade-history',
  'student-profile-web',
  'teacher-dashboard',
  'teaching-schedule',
  'teacher-classes',
  'attendance-teacher',
  'teacher-materials',
  'grade-input',
  'teacher-report-subjects',
  'teacher-homeroom-attendance',
  'teacher-homeroom-behavior',
  'teacher-homeroom-permissions',
  'teacher-profile',
  'teacher-cp',
  'teacher-atp',
  'teacher-prota',
  'teacher-promes',
  'teacher-modules',
  'teacher-kktp',
  'teacher-matriks-sebaran',
  'teacher-proctoring',
  'teacher-exam-programs',
  'teacher-exam-bank',
  'teacher-homeroom-report',
  'teacher-training-classes',
  'teacher-training-attendance',
  'teacher-training-grades',
  'teacher-training-materials',
  'teacher-training-reports',
  'teacher-work-program',
  'teacher-kakom-classes',
  'teacher-kakom-pkl',
  'teacher-kakom-partners',
  'teacher-wakakur-approvals-work-program',
  'teacher-wakakur-curriculum',
  'teacher-wakakur-exams',
  'teacher-wakakur-performance',
  'teacher-wakakur-approvals',
  'teacher-wakakur-reports',
  'teacher-wakasis-students',
  'teacher-wakasis-performance',
  'teacher-wakasis-approvals',
  'teacher-wakasis-reports',
  'teacher-sarpras-inventory',
  'teacher-sarpras-budgets',
  'teacher-sarpras-reports',
  'teacher-humas-settings',
  'teacher-humas-approval',
  'teacher-humas-components',
  'teacher-humas-journals',
  'teacher-humas-partners',
  'teacher-humas-reports',
  'teacher-head-lab-inventory',
  'teacher-head-lab-schedule',
  'teacher-head-lab-incidents',
  'teacher-head-library-inventory',
  'teacher-bk-dashboard',
  'teacher-bk-behaviors',
  'teacher-bk-permissions',
  'teacher-bk-counselings',
  'principal-dashboard',
  'principal-reports',
  'principal-attendance',
  'principal-finance-requests',
  'staff-payments',
  'staff-students',
  'child-progress',
  'parent-finance',
  'child-attendance',
  'examiner-schemes',
  'assessment',
  'examiner-profile',
  'tutor-profile',
  'admin-server-area',
]);

function materializeMenuTargets(items: RoleMenuItem[]): RoleMenuItem[] {
  return items.map((item) => {
    if (item.route) return item;

    if (item.webPath && STRICT_WEB_PARITY_KEYS.has(item.key)) {
      return {
        ...item,
        route: `/web-module/${item.key}`,
      };
    }

    if (item.webPath) {
      return {
        ...item,
        route: `/web-module/${item.key}`,
      };
    }
    return item;
  });
}

const BASE_MENU: RoleMenuItem[] = [{ key: 'profile', label: 'Profil', route: '/profile' }];

const ROLE_MENUS: Record<string, RoleMenuItem[]> = {
  STUDENT: [
    { key: 'student-dashboard', label: 'Dashboard', route: '/home' },
    {
      key: 'student-extracurricular',
      label: 'Ekstrakurikuler',
      route: '/student/extracurricular',
    },
    { key: 'student-schedule', label: 'Jadwal Pelajaran', route: '/schedule' },
    { key: 'student-learning', label: 'Materi & Tugas', route: '/learning' },
    {
      key: 'student-attendance-history',
      label: 'Riwayat Kehadiran',
      route: '/attendance',
    },
    { key: 'student-permissions', label: 'Perizinan', route: '/permissions' },
    {
      key: 'student-class-attendance',
      label: 'Presensi Kelas',
      route: '/student/class-attendance',
    },
    {
      key: 'student-pkl-dashboard',
      label: 'Dashboard PKL',
      route: '/student/internship?tab=OVERVIEW',
    },
    {
      key: 'student-pkl-journal',
      label: 'Jurnal Harian',
      route: '/student/internship?tab=JOURNAL',
    },
    {
      key: 'student-pkl-attendance',
      label: 'Absensi PKL',
      route: '/student/internship?tab=ATTENDANCE',
    },
    {
      key: 'student-pkl-report',
      label: 'Laporan PKL',
      route: '/student/internship?tab=REPORT',
    },
    {
      key: 'student-exam-programs',
      label: 'Ujian Online',
      route: '/exams',
    },
    { key: 'student-grade-history', label: 'Riwayat Nilai', route: '/grades' },
    { key: 'student-finance', label: 'Keuangan', route: '/student/finance' },
    { key: 'student-profile-web', label: 'Profile', route: '/profile' },
  ],
  TEACHER: [
    { key: 'teacher-dashboard', label: 'Dashboard', route: '/home' },
    { key: 'teacher-email', label: 'Email', route: '/email' },
    { key: 'teaching-schedule', label: 'Jadwal Mengajar', route: '/schedule' },
    { key: 'teacher-classes', label: 'Kelas & Mapel', route: '/teacher/classes' },
    {
      key: 'attendance-teacher',
      label: 'Presensi Siswa',
      route: '/teacher/attendance',
    },
    {
      key: 'teacher-materials',
      label: 'Materi & Tugas',
      route: '/teacher/materials',
    },
    { key: 'grade-input', label: 'Input Nilai', route: '/teacher/grades' },
    {
      key: 'teacher-report-subjects',
      label: 'Rapor Mapel',
      route: '/teacher/report-subjects',
    },
    {
      key: 'teacher-cp',
      label: 'Capaian Pembelajaran (CP)',
      route: '/teacher/learning-cp',
    },
    {
      key: 'teacher-atp',
      label: 'Alur Tujuan Pembelajaran (ATP)',
      route: '/teacher/learning-atp',
      webPath: '/teacher/learning-resources/atp',
    },
    {
      key: 'teacher-prota',
      label: 'Program Tahunan',
      route: '/teacher/learning-prota',
      webPath: '/teacher/learning-resources/prota',
    },
    {
      key: 'teacher-promes',
      label: 'Program Semester',
      route: '/teacher/learning-promes',
      webPath: '/teacher/learning-resources/promes',
    },
    {
      key: 'teacher-modules',
      label: 'Modul Ajar',
      route: '/teacher/learning-modules',
      webPath: '/teacher/learning-resources/modul-ajar',
    },
    {
      key: 'teacher-kktp',
      label: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)',
      route: '/teacher/learning-kktp',
      webPath: '/teacher/learning-resources/kktp',
    },
    {
      key: 'teacher-matriks-sebaran',
      label: 'Matriks Sebaran',
      route: '/teacher/learning-matriks-sebaran',
      webPath: '/teacher/learning-resources/matriks-sebaran',
    },
    {
      key: 'teacher-proctoring',
      label: 'Jadwal Mengawas',
      route: '/teacher/proctoring',
    },
    {
      key: 'teacher-exam-programs',
      label: 'Program Ujian',
      route: '/teacher/exams',
    },
    {
      key: 'teacher-exam-bank',
      label: 'Bank Soal',
      route: '/teacher/exams-bank',
    },
    {
      key: 'teacher-homeroom-attendance',
      label: 'Rekap Presensi',
      route: '/teacher/homeroom-attendance',
    },
    {
      key: 'teacher-homeroom-behavior',
      label: 'Catatan Perilaku',
      route: '/teacher/homeroom-behavior',
    },
    {
      key: 'teacher-homeroom-permissions',
      label: 'Persetujuan Izin',
      route: '/teacher/homeroom-permissions',
    },
    {
      key: 'teacher-homeroom-report',
      label: 'Rapor Wali Kelas',
      route: '/teacher/homeroom-report',
    },
    {
      key: 'teacher-training-classes',
      label: 'Daftar Kelas',
      route: '/teacher/training-classes',
    },
    {
      key: 'teacher-training-attendance',
      label: 'Presensi Training',
      route: '/teacher/training-attendance',
    },
    {
      key: 'teacher-training-grades',
      label: 'Nilai Training',
      route: '/teacher/training-grades',
    },
    {
      key: 'teacher-training-materials',
      label: 'Materi & Tugas',
      route: '/teacher/training-materials',
    },
    {
      key: 'teacher-training-reports',
      label: 'Laporan Training',
      route: '/teacher/training-reports',
    },
    {
      key: 'teacher-work-program',
      label: 'Program Kerja',
      route: '/teacher/work-program',
    },
    {
      key: 'teacher-extracurricular-dashboard',
      label: 'Dashboard Pembina',
      route: '/tutor/dashboard',
    },
    {
      key: 'teacher-extracurricular-members',
      label: 'Anggota & Nilai Ekskul',
      route: '/tutor/members',
    },
    {
      key: 'teacher-extracurricular-work-program',
      label: 'Program Kerja Ekskul',
      route: '/tutor/work-program',
    },
    {
      key: 'teacher-extracurricular-inventory',
      label: 'Inventaris Ekskul',
      route: '/tutor/inventory',
    },
    {
      key: 'teacher-bk-dashboard',
      label: 'Dashboard BP/BK',
      route: '/web-module/teacher-bk-dashboard',
      webPath: '/teacher/bk',
    },
    {
      key: 'teacher-bk-behaviors',
      label: 'Kasus Perilaku',
      route: '/web-module/teacher-bk-behaviors',
      webPath: '/teacher/bk/behaviors',
    },
    {
      key: 'teacher-bk-permissions',
      label: 'Perizinan Siswa',
      route: '/web-module/teacher-bk-permissions',
      webPath: '/teacher/bk/permissions',
    },
    {
      key: 'teacher-bk-counselings',
      label: 'Konseling & Tindak Lanjut',
      route: '/web-module/teacher-bk-counselings',
      webPath: '/teacher/bk/counselings',
    },
    {
      key: 'teacher-kakom-classes',
      label: 'Kelas Kompetensi',
      route: '/teacher/kakom-classes',
    },
    {
      key: 'teacher-kakom-pkl',
      label: 'Monitoring PKL',
      route: '/teacher/kakom-pkl',
    },
    {
      key: 'teacher-kakom-partners',
      label: 'Mitra Industri & BKK',
      route: '/teacher/kakom-partners',
    },
    {
      key: 'teacher-wakakur-approvals-work-program',
      label: 'Persetujuan Program Kerja',
      route: '/teacher/wakakur-work-program-approvals',
    },
    {
      key: 'teacher-wakakur-curriculum',
      label: 'Kelola Kurikulum',
      route: '/teacher/wakakur-curriculum',
    },
    {
      key: 'teacher-wakakur-exams',
      label: 'Kelola Ujian',
      route: '/teacher/wakakur-exams',
    },
    {
      key: 'teacher-wakakur-performance',
      label: 'Monitoring Kinerja',
      route: '/teacher/wakakur-performance',
    },
    {
      key: 'teacher-wakakur-approvals',
      label: 'Persetujuan',
      route: '/teacher/wakakur-work-program-approvals',
    },
    {
      key: 'teacher-wakakur-reports',
      label: 'Laporan Akademik',
      route: '/teacher/wakakur-performance',
    },
    {
      key: 'teacher-wakasis-students',
      label: 'Kelola Kesiswaan',
      route: '/teacher/wakasis-students',
    },
    {
      key: 'teacher-wakasis-performance',
      label: 'Monitoring Kinerja',
      route: '/teacher/wakasis-performance',
    },
    {
      key: 'teacher-wakasis-approvals',
      label: 'Persetujuan',
      route: '/teacher/wakasis-approvals',
    },
    {
      key: 'teacher-wakasis-reports',
      label: 'Laporan Kesiswaan',
      route: '/teacher/wakasis-reports',
    },
    {
      key: 'teacher-sarpras-inventory',
      label: 'Aset Sekolah',
      route: '/teacher/sarpras-inventory',
    },
    {
      key: 'teacher-sarpras-budgets',
      label: 'Persetujuan Anggaran',
      route: '/teacher/sarpras-budgets',
    },
    {
      key: 'teacher-sarpras-reports',
      label: 'Laporan',
      route: '/teacher/sarpras-reports',
    },
    {
      key: 'teacher-humas-settings',
      label: 'Pengaturan PKL',
      route: '/teacher/humas-settings',
    },
    {
      key: 'teacher-humas-approval',
      label: 'Persetujuan PKL',
      route: '/teacher/humas-approval',
    },
    {
      key: 'teacher-humas-components',
      label: 'Nilai PKL',
      route: '/teacher/humas-components',
    },
    {
      key: 'teacher-humas-journals',
      label: 'Monitoring Jurnal',
      route: '/teacher/humas-journals',
    },
    {
      key: 'teacher-humas-partners',
      label: 'Mitra Industri',
      route: '/teacher/humas-partners',
    },
    {
      key: 'teacher-humas-reports',
      label: 'Laporan',
      route: '/teacher/humas-reports',
    },
    {
      key: 'teacher-head-lab-inventory',
      label: 'Inventaris Lab',
      route: '/teacher/head-lab-inventory',
    },
    {
      key: 'teacher-head-lab-schedule',
      label: 'Jadwal Lab',
      route: '/teacher/head-lab-schedule',
    },
    {
      key: 'teacher-head-lab-incidents',
      label: 'Laporan Insiden',
      route: '/teacher/head-lab-incidents',
    },
    {
      key: 'teacher-head-library-inventory',
      label: 'Kelola Perpustakaan',
      route: '/teacher/head-library-inventory',
    },
    { key: 'teacher-profile', label: 'Profil', route: '/profile' },
  ],
  ADMIN: [
    { key: 'admin-dashboard', label: 'Dashboard', route: '/home' },
    { key: 'admin-email', label: 'Email', route: '/email' },
    { key: 'admin-academic-years', label: 'Tahun Ajaran', route: '/admin/academic?section=academic-years' },
    { key: 'admin-majors', label: 'Kompetensi Keahlian', route: '/admin/master-data?section=majors' },
    { key: 'admin-classes', label: 'Kelas', route: '/admin/master-data?section=classes' },
    {
      key: 'admin-training-classes',
      label: 'Kelas Training',
      route: '/admin/master-data?section=training-classes',
    },
    { key: 'admin-subjects', label: 'Mata Pelajaran', route: '/admin/master-data?section=subjects' },
    {
      key: 'admin-subject-categories',
      label: 'Kategori Mapel',
      route: '/admin/master-data?section=subject-categories',
    },
    {
      key: 'admin-extracurriculars',
      label: 'Ekstrakurikuler',
      route: '/admin/master-data?section=extracurriculars',
    },
    { key: 'admin-user-admin', label: 'Kelola Admin', route: '/admin/user-management?role=ADMIN' },
    {
      key: 'admin-user-principal',
      label: 'Kelola Kepsek',
      route: '/admin/user-management?role=PRINCIPAL',
    },
    {
      key: 'admin-user-staff',
      label: 'Kelola Staff',
      route: '/admin/user-management?role=STAFF',
    },
    {
      key: 'admin-user-examiner',
      label: 'Kelola Penguji',
      route: '/admin/user-management?role=EXAMINER',
    },
    {
      key: 'admin-user-tutor',
      label: 'Kelola Tutor Eksternal',
      route: '/admin/user-management?role=EXTRACURRICULAR_TUTOR',
    },
    {
      key: 'admin-user-parent',
      label: 'Kelola Orang Tua',
      route: '/admin/user-management?role=PARENT',
    },
    { key: 'admin-user-teacher', label: 'Kelola Guru', route: '/admin/user-management?role=TEACHER' },
    { key: 'admin-user-student', label: 'Kelola Siswa', route: '/admin/user-management?role=STUDENT' },
    {
      key: 'admin-user-verify',
      label: 'Verifikasi Akun',
      route: '/admin/user-management?verification=PENDING',
    },
    {
      key: 'admin-teacher-assignment',
      label: 'Assignment Guru',
      route: '/admin/academic?section=teacher-assignments',
    },
    { key: 'admin-import-export', label: 'Export/Import', route: '/admin/user-management?section=import-export' },
    {
      key: 'admin-academic-calendar',
      label: 'Kalender Akademik',
      route: '/admin/academic?section=academic-calendar',
    },
    { key: 'admin-schedule', label: 'Jadwal Pelajaran', route: '/admin/academic?section=schedule' },
    {
      key: 'admin-teaching-load',
      label: 'Rekap Jam Mengajar',
      route: '/admin/academic?section=teaching-load',
    },
    { key: 'admin-kkm', label: 'Data KKM', route: '/admin/academic?section=kkm' },
    {
      key: 'admin-attendance-recap',
      label: 'Rekap Absensi',
      route: '/admin/academic?section=attendance-recap',
    },
    {
      key: 'admin-report-cards',
      label: 'Laporan / Rapor',
      route: '/admin/academic?section=report-cards',
    },
    { key: 'admin-question-bank', label: 'Bank Soal', route: '/admin/academic?section=question-bank' },
    { key: 'admin-exam-sessions', label: 'Sesi Ujian', route: '/admin/academic?section=exam-sessions' },
    { key: 'admin-slideshow', label: 'Slideshow', route: '/admin/slideshow' },
    { key: 'admin-server-area', label: 'Area Server', route: '/admin/server-area' },
    { key: 'admin-webmail', label: 'Webmail Admin', route: '/admin/server-area?tab=webmail' },
    { key: 'admin-school-profile', label: 'Profil Sekolah', route: '/profile' },
    { key: 'admin-password', label: 'Ubah Password', route: '/profile' },
  ],
  EXAMINER: [
    { key: 'examiner-dashboard', label: 'Dashboard', route: '/home' },
    {
      key: 'examiner-schemes',
      label: 'Data Skema',
      route: '/examiner/schemes',
    },
    {
      key: 'assessment',
      label: 'Penilaian UKK',
      route: '/examiner/assessment',
    },
    { key: 'examiner-profile', label: 'Profil', route: '/profile' },
  ],
  PRINCIPAL: [
    {
      key: 'principal-dashboard',
      label: 'Dashboard',
      route: '/principal/overview',
    },
    { key: 'principal-email', label: 'Email', route: '/email' },
    {
      key: 'principal-reports',
      label: 'Rapor & Ranking',
      route: '/principal/overview',
    },
    {
      key: 'principal-attendance',
      label: 'Rekap Absensi',
      route: '/principal/attendance',
    },
    {
      key: 'principal-finance-requests',
      label: 'Pengajuan Anggaran',
      route: '/principal/approvals',
    },
    { key: 'principal-students', label: 'Data Siswa', route: '/principal/students' },
    { key: 'principal-teachers', label: 'Data Guru', route: '/principal/teachers' },
  ],
  STAFF: [
    { key: 'staff-dashboard', label: 'Dashboard', route: '/home' },
    { key: 'staff-email', label: 'Email', route: '/email' },
    { key: 'staff-payments', label: 'Pembayaran (SPP)', route: '/staff/payments' },
    { key: 'staff-students', label: 'Data Siswa', route: '/staff/students' },
    { key: 'staff-admin', label: 'Administrasi', route: '/staff/admin' },
  ],
  PARENT: [
    { key: 'parent-dashboard', label: 'Dashboard', route: '/parent/overview' },
    { key: 'child-progress', label: 'Data Anak', route: '/parent/children' },
    { key: 'child-link', label: 'Hubungkan Anak', route: '/parent/children?mode=link' },
    { key: 'parent-finance', label: 'Keuangan', route: '/parent/finance' },
    { key: 'child-attendance', label: 'Absensi Anak', route: '/parent/attendance' },
  ],
  CALON_SISWA: [
    { key: 'candidate-dashboard', label: 'Dashboard', route: '/candidate' },
    { key: 'candidate-application', label: 'Status Pendaftaran', route: '/candidate/application' },
    { key: 'candidate-information', label: 'Informasi PPDB', route: '/candidate/information' },
    { key: 'candidate-exams', label: 'Tes Seleksi', route: '/exams' },
  ],
  UMUM: [
    { key: 'public-dashboard', label: 'Dashboard BKK', route: '/public' },
    { key: 'public-information', label: 'Informasi Sekolah', route: '/public/information' },
    { key: 'public-vacancies', label: 'Lowongan BKK', route: '/public/vacancies' },
    { key: 'public-applications', label: 'Lamaran Saya', route: '/public/applications' },
    { key: 'public-exams', label: 'Tes BKK', route: '/exams' },
    { key: 'public-profile', label: 'Profil Pelamar', route: '/public/profile' },
  ],
  EXTRACURRICULAR_TUTOR: [
    { key: 'tutor-dashboard', label: 'Dashboard', route: '/tutor/dashboard' },
    { key: 'tutor-email', label: 'Email', route: '/email' },
    { key: 'tutor-members', label: 'Anggota & Nilai', route: '/tutor/members' },
    { key: 'tutor-work-program', label: 'Program Kerja', route: '/tutor/work-program' },
    { key: 'tutor-inventory', label: 'Inventaris Ekskul', route: '/tutor/inventory' },
    { key: 'tutor-profile', label: 'Profil', route: '/profile' },
  ],
};

const DEFAULT_PKL_ELIGIBLE_GRADES = ['XI'];

function normalizeDuty(value: string) {
  return value.trim().toUpperCase();
}

function hasDuty(user: AuthUser, duties: string[]) {
  const owned = (user.additionalDuties || []).map((item) => normalizeDuty(item));
  return duties.some((item) => {
    const needle = normalizeDuty(item);
    return owned.some((duty) => duty === needle || duty.includes(needle));
  });
}

function hasAnyPrimaryDuty(user: AuthUser) {
  const owned = (user.additionalDuties || []).map((item) => normalizeDuty(item));
  return owned.some((item) => item.length > 0 && !item.startsWith('SEKRETARIS_'));
}

function isHomeroomTeacher(user: AuthUser) {
  return (user.teacherClasses?.length || 0) > 0 || hasDuty(user, ['WALI_KELAS']);
}

function hasTrainingClass(user: AuthUser) {
  return (user.trainingClassesTeaching?.length || 0) > 0;
}

function isClassPresident(user: AuthUser) {
  if (user.role !== 'STUDENT') return false;
  return user.studentClass?.presidentId === user.id;
}

function normalizeEligibleGrades(rawGrades: string[] | undefined): string[] {
  const normalized = (rawGrades || [])
    .map((grade) => String(grade || '').trim().toUpperCase())
    .filter((grade) => grade === 'X' || grade === 'XI' || grade === 'XII');
  return normalized.length > 0 ? normalized : DEFAULT_PKL_ELIGIBLE_GRADES;
}

function resolveStudentGrade(user: AuthUser): 'X' | 'XI' | 'XII' | '' {
  const levelToken = String((user.studentClass as { level?: string | number } | null | undefined)?.level || '')
    .trim()
    .toUpperCase();
  if (levelToken === '10' || levelToken === 'X') return 'X';
  if (levelToken === '11' || levelToken === 'XI') return 'XI';
  if (levelToken === '12' || levelToken === 'XII') return 'XII';

  const classNameToken = String(user.studentClass?.name || '')
    .trim()
    .toUpperCase();
  const classMatch = classNameToken.match(/\b(XII|XI|X|12|11|10)\b/);
  const normalizedMatch = String(classMatch?.[1] || '');
  if (normalizedMatch === '10' || normalizedMatch === 'X') return 'X';
  if (normalizedMatch === '11' || normalizedMatch === 'XI') return 'XI';
  if (normalizedMatch === '12' || normalizedMatch === 'XII') return 'XII';
  return '';
}

function isPklEligibleStudent(user: AuthUser, options?: RoleMenuBuildOptions) {
  if (user.role !== 'STUDENT') return false;
  if (typeof options?.pklVisibilityOverride === 'boolean') {
    return options.pklVisibilityOverride;
  }
  const studentGrade = resolveStudentGrade(user);
  if (!studentGrade) return false;
  const eligibleGrades = normalizeEligibleGrades(options?.pklEligibleGrades);
  return eligibleGrades.includes(studentGrade);
}

function isStudentAlumni(user: AuthUser) {
  return user.role === 'STUDENT' && user.studentStatus === 'GRADUATED';
}

function shouldShowMenuItem(user: AuthUser, item: RoleMenuItem, options?: RoleMenuBuildOptions) {
  if (user.role === 'STUDENT') {
    if (isStudentAlumni(user)) {
      const alumniAllowed = new Set([
        'student-dashboard',
        'student-grade-history',
        'student-attendance-history',
        'student-profile-web',
      ]);
      return alumniAllowed.has(item.key);
    }

    if (item.key === 'student-class-attendance') {
      return isClassPresident(user);
    }

    if (item.key.startsWith('student-pkl-')) {
      return isPklEligibleStudent(user, options);
    }
  }

  if (user.role === 'TEACHER') {
    if (item.key.startsWith('teacher-homeroom-')) {
      return isHomeroomTeacher(user);
    }

    if (item.key.startsWith('teacher-training-')) {
      return hasTrainingClass(user);
    }

    if (item.key === 'teacher-work-program') {
      return hasAnyPrimaryDuty(user);
    }

    if (item.key.startsWith('teacher-extracurricular-')) {
      return Boolean(options?.hasExtracurricularAdvisorAssignments);
    }

    if (item.key.startsWith('teacher-kakom-')) {
      return hasDuty(user, ['KAPROG', 'KEPALA_KOMPETENSI']);
    }

    if (item.key === 'teacher-wakakur-approvals-work-program') {
      return hasDuty(user, ['WAKASEK_KURIKULUM']);
    }

    if (item.key.startsWith('teacher-wakakur-')) {
      return hasDuty(user, ['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM']);
    }

    if (item.key.startsWith('teacher-wakasis-')) {
      return hasDuty(user, ['WAKASEK_KESISWAAN', 'SEKRETARIS_KESISWAAN']);
    }

    if (item.key.startsWith('teacher-sarpras-')) {
      return hasDuty(user, ['WAKASEK_SARPRAS', 'SEKRETARIS_SARPRAS']);
    }

    if (item.key.startsWith('teacher-humas-')) {
      return hasDuty(user, ['WAKASEK_HUMAS', 'SEKRETARIS_HUMAS']);
    }

    if (item.key.startsWith('teacher-head-lab-')) {
      return hasDuty(user, ['KEPALA_LAB']);
    }

    if (item.key.startsWith('teacher-head-library-')) {
      return hasDuty(user, ['KEPALA_PERPUSTAKAAN']);
    }

    if (item.key.startsWith('teacher-bk-')) {
      return hasDuty(user, ['BP_BK']);
    }
  }

  return true;
}

function dedupeMenuByKey(items: RoleMenuItem[]) {
  const keys = new Set<string>();
  const result: RoleMenuItem[] = [];

  for (const item of items) {
    if (keys.has(item.key)) continue;
    keys.add(item.key);
    result.push(item);
  }

  return result;
}

const DEMO_ROLE_KEYS: Array<keyof typeof ROLE_MENUS> = [
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'PRINCIPAL',
  'STAFF',
  'PARENT',
  'EXAMINER',
  'EXTRACURRICULAR_TUTOR',
];

function getDemoRoleMenu() {
  const allMenus = DEMO_ROLE_KEYS.flatMap((role) => ROLE_MENUS[role] || []);
  return materializeMenuTargets(dedupeMenuByKey(allMenus));
}

type GroupDefinition = {
  key: string;
  label: string;
  menuKeys: string[];
};

const ROLE_MENU_GROUPS: Record<string, GroupDefinition[]> = {
  STUDENT: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['student-dashboard'] },
    { key: 'extracurricular', label: 'Ekstrakurikuler', menuKeys: ['student-extracurricular'] },
    {
      key: 'academic',
      label: 'AKADEMIK',
      menuKeys: [
        'student-schedule',
        'student-learning',
        'student-attendance-history',
        'student-permissions',
        'student-class-attendance',
      ],
    },
    {
      key: 'internship',
      label: 'PKL (PRAKERIN)',
      menuKeys: ['student-pkl-dashboard', 'student-pkl-journal', 'student-pkl-attendance', 'student-pkl-report'],
    },
    {
      key: 'exams',
      label: 'UJIAN ONLINE',
      menuKeys: ['student-exam-programs'],
    },
    { key: 'grades', label: 'NILAI SAYA', menuKeys: ['student-grade-history'] },
    { key: 'administration', label: 'ADMINISTRASI', menuKeys: ['student-finance'] },
    { key: 'settings', label: 'PENGATURAN', menuKeys: ['student-profile-web'] },
  ],
  TEACHER: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['teacher-dashboard', 'teacher-email'] },
    {
      key: 'academic',
      label: 'AKADEMIK',
      menuKeys: [
        'teaching-schedule',
        'teacher-classes',
        'attendance-teacher',
        'teacher-materials',
        'grade-input',
        'teacher-report-subjects',
      ],
    },
    {
      key: 'teaching-resources',
      label: 'PERANGKAT AJAR',
      menuKeys: [
        'teacher-cp',
        'teacher-atp',
        'teacher-prota',
        'teacher-promes',
        'teacher-modules',
        'teacher-kktp',
        'teacher-matriks-sebaran',
      ],
    },
    {
      key: 'exams',
      label: 'UJIAN',
      menuKeys: [
        'teacher-proctoring',
        'teacher-exam-programs',
        'teacher-exam-bank',
      ],
    },
    {
      key: 'homeroom',
      label: 'WALI KELAS',
      menuKeys: [
        'teacher-homeroom-attendance',
        'teacher-homeroom-behavior',
        'teacher-homeroom-permissions',
        'teacher-homeroom-report',
      ],
    },
    {
      key: 'training',
      label: 'KELAS TRAINING',
      menuKeys: [
        'teacher-training-classes',
        'teacher-training-attendance',
        'teacher-training-grades',
        'teacher-training-materials',
        'teacher-training-reports',
      ],
    },
    {
      key: 'work-program',
      label: 'PROGRAM KERJA',
      menuKeys: ['teacher-work-program'],
    },
    {
      key: 'bpbk',
      label: 'BP/BK',
      menuKeys: ['teacher-bk-dashboard', 'teacher-bk-behaviors', 'teacher-bk-permissions', 'teacher-bk-counselings'],
    },
    {
      key: 'kakom',
      label: 'KAKOM',
      menuKeys: ['teacher-kakom-classes', 'teacher-kakom-pkl', 'teacher-kakom-partners'],
    },
    {
      key: 'wakakur',
      label: 'WAKASEK KURIKULUM',
      menuKeys: [
        'teacher-wakakur-approvals-work-program',
        'teacher-wakakur-curriculum',
        'teacher-wakakur-exams',
        'teacher-wakakur-performance',
        'teacher-wakakur-approvals',
        'teacher-wakakur-reports',
      ],
    },
    {
      key: 'wakasis',
      label: 'WAKASEK KESISWAAN',
      menuKeys: [
        'teacher-wakasis-students',
        'teacher-wakasis-performance',
        'teacher-wakasis-approvals',
        'teacher-wakasis-reports',
      ],
    },
    {
      key: 'sarpras',
      label: 'WAKASEK SARPRAS',
      menuKeys: ['teacher-sarpras-inventory', 'teacher-sarpras-budgets', 'teacher-sarpras-reports'],
    },
    {
      key: 'humas',
      label: 'WAKASEK HUMAS',
      menuKeys: [
        'teacher-humas-settings',
        'teacher-humas-approval',
        'teacher-humas-components',
        'teacher-humas-journals',
        'teacher-humas-partners',
        'teacher-humas-reports',
      ],
    },
    {
      key: 'head-lab',
      label: 'KEPALA LAB',
      menuKeys: ['teacher-head-lab-inventory', 'teacher-head-lab-schedule', 'teacher-head-lab-incidents'],
    },
    {
      key: 'head-library',
      label: 'KEPALA PERPUSTAKAAN',
      menuKeys: ['teacher-head-library-inventory'],
    },
    { key: 'settings', label: 'PENGATURAN', menuKeys: ['teacher-profile'] },
  ],
  ADMIN: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['admin-dashboard', 'admin-email'] },
    {
      key: 'master-data',
      label: 'MASTER DATA',
      menuKeys: [
        'admin-academic-years',
        'admin-majors',
        'admin-classes',
        'admin-training-classes',
        'admin-subjects',
        'admin-subject-categories',
        'admin-extracurriculars',
      ],
    },
    {
      key: 'user-management',
      label: 'USER MANAGEMENT',
      menuKeys: [
        'admin-user-admin',
        'admin-user-principal',
        'admin-user-staff',
        'admin-user-examiner',
        'admin-user-tutor',
        'admin-user-parent',
        'admin-user-teacher',
        'admin-user-student',
        'admin-user-verify',
        'admin-teacher-assignment',
        'admin-import-export',
      ],
    },
    {
      key: 'academic',
      label: 'AKADEMIK',
      menuKeys: [
        'admin-academic-calendar',
        'admin-schedule',
        'admin-teaching-load',
        'admin-kkm',
        'admin-attendance-recap',
        'admin-report-cards',
      ],
    },
    {
      key: 'cbt',
      label: 'UJIAN & CBT',
      menuKeys: ['admin-question-bank', 'admin-exam-sessions'],
    },
    {
      key: 'settings',
      label: 'PENGATURAN',
      menuKeys: ['admin-slideshow', 'admin-server-area', 'admin-webmail', 'admin-school-profile', 'admin-password'],
    },
  ],
  PRINCIPAL: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['principal-dashboard', 'principal-email'] },
    { key: 'academic', label: 'AKADEMIK', menuKeys: ['principal-reports', 'principal-attendance'] },
    { key: 'finance', label: 'KEUANGAN', menuKeys: ['principal-finance-requests'] },
    { key: 'students', label: 'KESISWAAN', menuKeys: ['principal-students'] },
    { key: 'teachers', label: 'SDM GURU', menuKeys: ['principal-teachers'] },
  ],
  STAFF: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['staff-dashboard', 'staff-email'] },
    { key: 'payments', label: 'Pembayaran (SPP)', menuKeys: ['staff-payments'] },
    { key: 'students', label: 'Data Siswa', menuKeys: ['staff-students'] },
    { key: 'administration', label: 'Administrasi', menuKeys: ['staff-admin'] },
  ],
  PARENT: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['parent-dashboard'] },
    { key: 'children', label: 'Data Anak', menuKeys: ['child-progress', 'child-link'] },
    { key: 'finance', label: 'Keuangan', menuKeys: ['parent-finance'] },
    { key: 'attendance', label: 'Absensi Anak', menuKeys: ['child-attendance'] },
  ],
  EXAMINER: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['examiner-dashboard'] },
    { key: 'schemes', label: 'Data Skema', menuKeys: ['examiner-schemes'] },
    { key: 'assessment', label: 'Penilaian UKK', menuKeys: ['assessment'] },
    { key: 'settings', label: 'PENGATURAN', menuKeys: ['examiner-profile'] },
  ],
  EXTRACURRICULAR_TUTOR: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['tutor-dashboard', 'tutor-email'] },
    { key: 'members', label: 'Anggota & Nilai', menuKeys: ['tutor-members'] },
    { key: 'work-program', label: 'Program Kerja', menuKeys: ['tutor-work-program'] },
    { key: 'inventory', label: 'Inventaris Ekskul', menuKeys: ['tutor-inventory'] },
    { key: 'settings', label: 'PENGATURAN', menuKeys: ['tutor-profile'] },
  ],
  CALON_SISWA: [
    { key: 'information', label: 'Informasi', menuKeys: ['candidate-information'] },
    { key: 'registration', label: 'Pendaftaran', menuKeys: ['candidate-application'] },
    { key: 'exam', label: 'Tes', menuKeys: ['candidate-exams'] },
  ],
  UMUM: [
    { key: 'information', label: 'Informasi', menuKeys: ['public-information'] },
    { key: 'career', label: 'Karier', menuKeys: ['public-vacancies', 'public-applications'] },
    { key: 'profile', label: 'Profil', menuKeys: ['public-profile'] },
  ],
};

const STAFF_EXTRA_MENU_ITEMS: Record<string, RoleMenuItem> = {
  'staff-administration-dashboard': {
    key: 'staff-administration-dashboard',
    label: 'Dashboard Administrasi',
    webPath: '/staff/administration',
  },
  'staff-administration-teachers': {
    key: 'staff-administration-teachers',
    label: 'Administrasi Guru',
    webPath: '/staff/administration/teachers',
  },
  'staff-administration-permissions': {
    key: 'staff-administration-permissions',
    label: 'Perizinan Siswa',
    webPath: '/staff/administration/permissions',
  },
  'staff-head-tu-dashboard': {
    key: 'staff-head-tu-dashboard',
    label: 'Dashboard Kepala TU',
    webPath: '/staff/head-tu',
  },
  'staff-head-tu-administration': {
    key: 'staff-head-tu-administration',
    label: 'Operasional TU',
    webPath: '/staff/head-tu/administration',
  },
  'staff-head-tu-finance': {
    key: 'staff-head-tu-finance',
    label: 'Monitoring Keuangan',
    webPath: '/staff/head-tu/finance',
  },
  'staff-head-tu-students': {
    key: 'staff-head-tu-students',
    label: 'Data Siswa',
    webPath: '/staff/head-tu/students',
  },
  'staff-head-tu-teachers': {
    key: 'staff-head-tu-teachers',
    label: 'Data Guru & Staff',
    webPath: '/staff/head-tu/teachers',
  },
  'staff-head-tu-permissions': {
    key: 'staff-head-tu-permissions',
    label: 'Perizinan Siswa',
    webPath: '/staff/head-tu/permissions',
  },
  'staff-head-tu-letters': {
    key: 'staff-head-tu-letters',
    label: 'Surat-Menyurat',
    webPath: '/staff/head-tu/letters',
  },
  'staff-head-tu-exam-cards': {
    key: 'staff-head-tu-exam-cards',
    label: 'Kartu Ujian',
    webPath: '/staff/head-tu/exam-cards',
  },
};

function buildGroupedMenu(role: string, items: RoleMenuItem[]): RoleMenuGroup[] {
  const defs = ROLE_MENU_GROUPS[role] || [];
  if (!defs.length) {
    return [
      {
        key: 'all',
        label: 'Semua Menu',
        items,
      },
    ];
  }

  const byKey = new Map(items.map((item) => [item.key, item]));
  const used = new Set<string>();
  const result: RoleMenuGroup[] = [];

  for (const def of defs) {
    const groupedItems: RoleMenuItem[] = [];
    for (const key of def.menuKeys) {
      const found = byKey.get(key);
      if (!found || used.has(key)) continue;
      groupedItems.push(found);
      used.add(key);
    }

    if (groupedItems.length) {
      result.push({
        key: def.key,
        label: def.label,
        items: groupedItems,
      });
    }
  }

  const uncategorized = items.filter((item) => !used.has(item.key));
  if (uncategorized.length) {
    result.push({
      key: 'others',
      label: 'Lainnya',
      items: uncategorized,
    });
  }

  return result;
}

function mapMenuByKey(items: RoleMenuItem[]) {
  return new Map(items.map((item) => [item.key, item]));
}

function cloneMenu(item?: RoleMenuItem | null) {
  return item ? { ...item } : null;
}

function getStaffMenuItemByKey(key: string) {
  const nativeItem = ROLE_MENUS.STAFF.find((item) => item.key === key);
  return cloneMenu(nativeItem || STAFF_EXTRA_MENU_ITEMS[key] || null);
}

function buildStaffRoleMenu(user: AuthUser) {
  const division = resolveStaffDivision(user);
  const baseKeys = ['staff-dashboard', 'staff-email'];
  const roleKeys =
    division === 'HEAD_TU'
      ? [
          'staff-head-tu-dashboard',
          'staff-head-tu-administration',
          'staff-head-tu-finance',
          'staff-head-tu-students',
          'staff-head-tu-teachers',
          'staff-head-tu-permissions',
          'staff-head-tu-letters',
          'staff-head-tu-exam-cards',
        ]
      : division === 'ADMINISTRATION'
        ? [
            'staff-students',
            'staff-administration-dashboard',
            'staff-administration-teachers',
            'staff-administration-permissions',
          ]
        : ['staff-payments', 'staff-students', 'staff-admin'];

  return [...baseKeys, ...roleKeys]
    .map((key) => getStaffMenuItemByKey(key))
    .filter((item): item is RoleMenuItem => Boolean(item));
}

function buildStaffGroups(user: AuthUser, menus: RoleMenuItem[]) {
  const byKey = mapMenuByKey(menus);
  const pushGroup = (groups: RoleMenuGroup[], key: string, label: string, keys: string[]) => {
    const items = pickMenus(byKey, keys);
    if (items.length > 0) {
      groups.push({ key, label, items });
    }
  };

  const groups: RoleMenuGroup[] = [];
  const division = resolveStaffDivision(user);

  pushGroup(groups, 'dashboard', 'Dashboard', ['staff-dashboard', 'staff-email']);

  if (division === 'HEAD_TU') {
    pushGroup(groups, 'monitoring-tu', 'MONITORING TU', [
      'staff-head-tu-dashboard',
      'staff-head-tu-administration',
      'staff-head-tu-finance',
    ]);
    pushGroup(groups, 'layanan-tu', 'LAYANAN TU', [
      'staff-head-tu-students',
      'staff-head-tu-teachers',
      'staff-head-tu-permissions',
      'staff-head-tu-letters',
      'staff-head-tu-exam-cards',
    ]);
    return groups;
  }

  if (division === 'ADMINISTRATION') {
    pushGroup(groups, 'students', 'DATA SISWA', ['staff-students']);
    pushGroup(groups, 'administration', 'ADMINISTRASI', [
      'staff-administration-dashboard',
      'staff-administration-teachers',
      'staff-administration-permissions',
    ]);
    return groups;
  }

  pushGroup(groups, 'payments', 'KEUANGAN', ['staff-payments', 'staff-students', 'staff-admin']);
  return groups;
}

function pickMenu(byKey: Map<string, RoleMenuItem>, key: string) {
  return cloneMenu(byKey.get(key));
}

function pickMenus(byKey: Map<string, RoleMenuItem>, keys: string[]) {
  return keys
    .map((key) => pickMenu(byKey, key))
    .filter((item): item is RoleMenuItem => Boolean(item));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildStudentAlumniGroups(menus: RoleMenuItem[]): RoleMenuGroup[] {
  const byKey = mapMenuByKey(menus);
  const groups: RoleMenuGroup[] = [];

  const dashboard = pickMenu(byKey, 'student-dashboard');
  if (dashboard) {
    groups.push({
      key: 'dashboard',
      label: 'Dashboard',
      items: [dashboard],
    });
  }

  const akademikItems = pickMenus(byKey, ['student-grade-history', 'student-attendance-history']);
  if (akademikItems.length > 0) {
    groups.push({
      key: 'academic',
      label: 'AKADEMIK',
      items: akademikItems,
    });
  }

  const settingsItems = pickMenus(byKey, ['student-profile-web']);
  if (settingsItems.length > 0) {
    groups.push({
      key: 'settings',
      label: 'PENGATURAN',
      items: settingsItems,
    });
  }

  return groups;
}

function buildTeacherGroups(
  user: AuthUser,
  menus: RoleMenuItem[],
  options?: RoleMenuBuildOptions,
): RoleMenuGroup[] {
  const byKey = mapMenuByKey(menus);
  const groups: RoleMenuGroup[] = [];

  const pushGroup = (key: string, label: string, items: RoleMenuItem[]) => {
    if (items.length === 0) return;
    groups.push({ key, label, items });
  };

  const baseWorkProgramItem = byKey.get('teacher-work-program');
  const createWorkProgramItem = (dutyCode: string) => {
    if (!baseWorkProgramItem?.route) return null;
    const suffix = slugify(dutyCode || 'generic');
    const baseRoute = baseWorkProgramItem.route;
    const separator = baseRoute.includes('?') ? '&' : '?';
    return {
      ...baseWorkProgramItem,
      key: `teacher-work-program-${suffix}`,
      route: `${baseRoute}${separator}duty=${encodeURIComponent(dutyCode)}`,
    };
  };

  pushGroup('dashboard', 'Dashboard', pickMenus(byKey, ['teacher-dashboard', 'teacher-email']));
  pushGroup(
    'academic',
    'AKADEMIK',
    pickMenus(byKey, [
      'teaching-schedule',
      'teacher-classes',
      'attendance-teacher',
      'teacher-materials',
      'grade-input',
      'teacher-report-subjects',
    ]),
  );
  pushGroup(
    'teaching-resources',
    'PERANGKAT AJAR',
    pickMenus(byKey, [
      'teacher-cp',
      'teacher-atp',
      'teacher-prota',
      'teacher-promes',
      'teacher-modules',
      'teacher-kktp',
      'teacher-matriks-sebaran',
    ]),
  );
  pushGroup(
    'exams',
    'UJIAN',
    pickMenus(byKey, [
      'teacher-proctoring',
      'teacher-exam-programs',
      'teacher-exam-bank',
    ]),
  );

  if (isHomeroomTeacher(user)) {
    pushGroup(
      'homeroom',
      'WALI KELAS',
      pickMenus(byKey, [
        'teacher-homeroom-attendance',
        'teacher-homeroom-behavior',
        'teacher-homeroom-permissions',
        'teacher-homeroom-report',
      ]),
    );
  }

  if (hasTrainingClass(user)) {
    pushGroup(
      'training',
      'KELAS TRAINING',
      pickMenus(byKey, [
        'teacher-training-classes',
        'teacher-training-attendance',
        'teacher-training-grades',
        'teacher-training-materials',
        'teacher-training-reports',
      ]),
    );
  }

  if (options?.hasExtracurricularAdvisorAssignments) {
    pushGroup(
      'extracurricular-advisor',
      'PEMBINA EKSKUL',
      pickMenus(byKey, [
        'teacher-extracurricular-dashboard',
        'teacher-extracurricular-members',
        'teacher-extracurricular-work-program',
        'teacher-extracurricular-inventory',
      ]),
    );
  }

  const duties = (user.additionalDuties || [])
    .map((item) => normalizeDuty(item))
    .filter((item) => item.length > 0);
  const kakomDuties = duties.filter((item) => item.includes('KAPROG') || item.includes('KEPALA_KOMPETENSI'));
  const otherDuties = duties.filter((item) => !item.includes('KAPROG') && !item.includes('KEPALA_KOMPETENSI'));

  for (const duty of otherDuties) {
    const isSecretary = duty.startsWith('SEKRETARIS_');
    const baseRole = isSecretary ? duty.replace('SEKRETARIS_', 'WAKASEK_') : duty;
    const items: RoleMenuItem[] = [];
    let label = duty.replace(/_/g, ' ').toUpperCase();

    const addGenericWorkProgram = () => {
      if (isSecretary) return;
      const item = createWorkProgramItem(duty);
      if (item) items.push(item);
    };

    if (baseRole === 'WAKASEK_KURIKULUM') {
      label = isSecretary ? 'SEKRETARIS KURIKULUM' : 'WAKASEK KURIKULUM';
      addGenericWorkProgram();
      if (!isSecretary) {
        const approvalWp = pickMenu(byKey, 'teacher-wakakur-approvals-work-program');
        if (approvalWp) items.push(approvalWp);
      }
      items.push(
        ...pickMenus(byKey, [
          'teacher-wakakur-curriculum',
          'teacher-wakakur-exams',
          'teacher-wakakur-performance',
          'teacher-wakakur-approvals',
          'teacher-wakakur-reports',
        ]),
      );
    } else if (baseRole === 'WAKASEK_KESISWAAN') {
      label = isSecretary ? 'SEKRETARIS KESISWAAN' : 'WAKASEK KESISWAAN';
      addGenericWorkProgram();
      items.push(
        ...pickMenus(byKey, [
          'teacher-wakasis-students',
          'teacher-wakasis-performance',
          'teacher-wakasis-approvals',
          'teacher-wakasis-reports',
        ]),
      );
    } else if (baseRole === 'WAKASEK_SARPRAS') {
      label = isSecretary ? 'SEKRETARIS SARPRAS' : 'WAKASEK SARPRAS';
      addGenericWorkProgram();
      items.push(
        ...pickMenus(byKey, ['teacher-sarpras-inventory', 'teacher-sarpras-budgets', 'teacher-sarpras-reports']),
      );
    } else if (baseRole === 'WAKASEK_HUMAS') {
      label = isSecretary ? 'SEKRETARIS HUMAS' : 'WAKASEK HUMAS';
      addGenericWorkProgram();
      items.push(
        ...pickMenus(byKey, [
          'teacher-humas-settings',
          'teacher-humas-approval',
          'teacher-humas-components',
          'teacher-humas-journals',
          'teacher-humas-partners',
          'teacher-humas-reports',
        ]),
      );
    } else if (duty === 'KEPALA_LAB') {
      label = 'KEPALA LAB';
      addGenericWorkProgram();
      items.push(
        ...pickMenus(byKey, ['teacher-head-lab-inventory', 'teacher-head-lab-schedule', 'teacher-head-lab-incidents']),
      );
    } else if (duty === 'KEPALA_PERPUSTAKAAN') {
      label = 'KEPALA PERPUSTAKAAN';
      addGenericWorkProgram();
      items.push(...pickMenus(byKey, ['teacher-head-library-inventory']));
    } else if (duty === 'BP_BK') {
      label = 'BP/BK';
      addGenericWorkProgram();
      items.push(...pickMenus(byKey, ['teacher-bk-dashboard', 'teacher-bk-behaviors', 'teacher-bk-permissions', 'teacher-bk-counselings']));
    } else {
      addGenericWorkProgram();
    }

    pushGroup(`duty-${slugify(duty)}`, label, items);
  }

  if (kakomDuties.length > 0) {
    let suffixes: string[] = [];
    if (Array.isArray(user.managedMajors) && user.managedMajors.length > 0) {
      suffixes = user.managedMajors.map((major) => major.code?.trim() || major.name);
    } else if (user.managedMajor) {
      suffixes = [user.managedMajor.code?.trim() || user.managedMajor.name];
    } else {
      suffixes = kakomDuties
        .map((duty) => duty.split('_').slice(1).join(' ').toUpperCase())
        .filter((item) => item.length > 0);
    }
    const label = suffixes.length > 0 ? `KAKOM ${suffixes.join(' & ')}` : 'KAKOM';
    const items: RoleMenuItem[] = [];
    const program = createWorkProgramItem('KAPROG');
    if (program) items.push(program);
    items.push(...pickMenus(byKey, ['teacher-kakom-classes', 'teacher-kakom-pkl', 'teacher-kakom-partners']));
    pushGroup(`kakom-${slugify(label)}`, label, items);
  }

  if (options?.hasPendingDefense) {
    pushGroup('internship-defense', 'SIDANG PKL', [
      { key: 'teacher-internship-defense', label: 'Nilai Sidang PKL', route: '/teacher/internship-defense' },
    ]);
  }

  pushGroup('settings', 'PENGATURAN', pickMenus(byKey, ['teacher-profile']));

  return groups;
}

function assertRoleMenuIntegrity(menus: Record<string, RoleMenuItem[]>) {
  for (const [role, items] of Object.entries(menus)) {
    const usedKeys = new Set<string>();
    for (const item of items) {
      if (usedKeys.has(item.key)) {
        throw new Error(`Duplicate menu key "${item.key}" ditemukan pada role ${role}.`);
      }
      usedKeys.add(item.key);

      const hasRoute = typeof item.route === 'string' && item.route.trim().length > 0;
      const hasWebPath = typeof item.webPath === 'string' && item.webPath.trim().length > 0;
      if (!hasRoute && !hasWebPath) {
        throw new Error(`Menu "${item.key}" pada role ${role} wajib punya route atau webPath.`);
      }

      if (hasRoute && !item.route!.startsWith('/')) {
        throw new Error(`route menu "${item.key}" pada role ${role} harus diawali "/".`);
      }
      if (hasWebPath && !item.webPath!.startsWith('/')) {
        throw new Error(`webPath menu "${item.key}" pada role ${role} harus diawali "/".`);
      }
    }
  }
}

if (__DEV__) {
  assertRoleMenuIntegrity(ROLE_MENUS);
}

export function getRoleMenu(user?: AuthUser | null, options?: RoleMenuBuildOptions): RoleMenuItem[] {
  if (!user) return materializeMenuTargets(BASE_MENU);
  if (user.isDemo) return getDemoRoleMenu();

  const roleItems = user.role === 'STAFF' ? buildStaffRoleMenu(user) : ROLE_MENUS[user.role] || BASE_MENU;
  const filteredItems = roleItems.filter((item) => shouldShowMenuItem(user, item, options));
  return materializeMenuTargets(dedupeMenuByKey(filteredItems));
}

export function getGroupedRoleMenu(user?: AuthUser | null, options?: RoleMenuBuildOptions): RoleMenuGroup[] {
  const menus = getRoleMenu(user, options);
  if (!user) {
    return [
      {
        key: 'base',
        label: 'Umum',
        items: menus,
      },
    ];
  }

  if (user.isDemo) {
    return buildGroupedMenu('DEMO', menus);
  }

  if (user.role === 'STUDENT' && isStudentAlumni(user)) {
    return buildStudentAlumniGroups(menus);
  }

  if (user.role === 'TEACHER') {
    return buildTeacherGroups(user, menus, options);
  }

  if (user.role === 'STAFF') {
    return buildStaffGroups(user, menus);
  }

  const grouped = buildGroupedMenu(user.role, menus);
  return grouped;
}
