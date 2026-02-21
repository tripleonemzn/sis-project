import { AuthUser } from '../auth/types';

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
  'teacher-proctoring',
  'teacher-exam-formatif',
  'teacher-exam-sbts',
  'teacher-exam-sas',
  'teacher-exam-sat',
  'teacher-exam-bank',
  'teacher-homeroom-sbts',
  'teacher-homeroom-sas',
  'teacher-homeroom-sat',
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
      key: 'student-exam-formatif',
      label: 'Formatif (Quiz)',
      route: '/exams',
    },
    { key: 'student-exam-sbts', label: 'SBTS', route: '/exams' },
    { key: 'student-exam-sas', label: 'SAS', route: '/exams' },
    { key: 'student-exam-sat', label: 'SAT', route: '/exams' },
    { key: 'student-grade-history', label: 'Riwayat Nilai', route: '/grades' },
    { key: 'student-finance', label: 'Keuangan', route: '/student/finance' },
    { key: 'student-profile-web', label: 'Profile', route: '/profile' },
  ],
  TEACHER: [
    { key: 'teacher-dashboard', label: 'Dashboard', route: '/home' },
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
    },
    {
      key: 'teacher-prota',
      label: 'Program Tahunan',
      route: '/teacher/learning-prota',
    },
    {
      key: 'teacher-promes',
      label: 'Program Semester',
      route: '/teacher/learning-promes',
    },
    {
      key: 'teacher-modules',
      label: 'Modul Ajar',
      route: '/teacher/learning-modules',
    },
    {
      key: 'teacher-kktp',
      label: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)',
      route: '/teacher/learning-kktp',
    },
    {
      key: 'teacher-proctoring',
      label: 'Jadwal Mengawas',
      route: '/teacher/proctoring',
    },
    {
      key: 'teacher-exam-formatif',
      label: 'Formatif (Quiz)',
      route: '/teacher/exams-formatif',
    },
    {
      key: 'teacher-exam-sbts',
      label: 'SBTS',
      route: '/teacher/exams-sbts',
    },
    {
      key: 'teacher-exam-sas',
      label: 'SAS',
      route: '/teacher/exams-sas',
    },
    {
      key: 'teacher-exam-sat',
      label: 'SAT',
      route: '/teacher/exams-sat',
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
      key: 'teacher-homeroom-sbts',
      label: 'Rapor SBTS',
      route: '/teacher/homeroom-sbts',
    },
    {
      key: 'teacher-homeroom-sas',
      label: 'Rapor SAS',
      route: '/teacher/homeroom-sas',
    },
    {
      key: 'teacher-homeroom-sat',
      label: 'Rapor SAT',
      route: '/teacher/homeroom-sat',
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
      label: 'Inventaris Perpustakaan',
      route: '/teacher/head-library-inventory',
    },
    { key: 'teacher-profile', label: 'Profil', route: '/profile' },
  ],
  ADMIN: [
    { key: 'admin-dashboard', label: 'Dashboard', route: '/home' },
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
      label: 'Kelola Pembina Ekskul',
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
    { key: 'staff-payments', label: 'Pembayaran (SPP)', route: '/staff/payments' },
    { key: 'staff-students', label: 'Data Siswa', route: '/staff/students' },
    { key: 'staff-admin', label: 'Administrasi', route: '/staff/admin' },
  ],
  PARENT: [
    { key: 'parent-dashboard', label: 'Dashboard', route: '/parent/overview' },
    { key: 'child-progress', label: 'Data Anak', route: '/parent/children' },
    { key: 'parent-finance', label: 'Keuangan', route: '/parent/finance' },
    { key: 'child-attendance', label: 'Absensi Anak', route: '/parent/attendance' },
  ],
  CALON_SISWA: [
    { key: 'candidate-application', label: 'Status Pendaftaran', route: '/candidate/application' },
    { key: 'candidate-information', label: 'Informasi PPDB', route: '/candidate/information' },
  ],
  UMUM: [
    { key: 'public-information', label: 'Informasi Sekolah', route: '/public/information' },
    { key: 'public-registration', label: 'Pendaftaran Umum', route: '/public/registration' },
  ],
  EXTRACURRICULAR_TUTOR: [
    { key: 'tutor-dashboard', label: 'Dashboard', route: '/tutor/dashboard' },
    { key: 'tutor-members', label: 'Anggota & Nilai', route: '/tutor/members' },
    { key: 'tutor-profile', label: 'Profil', route: '/profile' },
  ],
};

const PKL_ELIGIBLE_GRADES = ['XI', 'XII'];

function normalizeDuty(value: string) {
  return value.trim().toUpperCase();
}

function hasDuty(user: AuthUser, duties: string[]) {
  const owned = new Set((user.additionalDuties || []).map((item) => normalizeDuty(item)));
  return duties.some((item) => owned.has(normalizeDuty(item)));
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

function isPklEligibleStudent(user: AuthUser) {
  if (user.role !== 'STUDENT') return false;
  const className = user.studentClass?.name?.toUpperCase() || '';
  if (!className) return false;
  return PKL_ELIGIBLE_GRADES.some((grade) => className === grade || className.startsWith(`${grade} `));
}

function isStudentAlumni(user: AuthUser) {
  return user.role === 'STUDENT' && user.studentStatus === 'GRADUATED';
}

function shouldShowMenuItem(user: AuthUser, item: RoleMenuItem) {
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
      return isPklEligibleStudent(user);
    }
  }

  if (user.role === 'TEACHER') {
    if (item.key.startsWith('teacher-homeroom-')) {
      return isHomeroomTeacher(user);
    }

    if (item.key.startsWith('teacher-training-')) {
      return hasTrainingClass(user);
    }

    if (item.key === 'teacher-work-program' || item.key.startsWith('teacher-kakom-')) {
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
      menuKeys: ['student-exam-formatif', 'student-exam-sbts', 'student-exam-sas', 'student-exam-sat'],
    },
    { key: 'grades', label: 'NILAI SAYA', menuKeys: ['student-grade-history'] },
    { key: 'administration', label: 'ADMINISTRASI', menuKeys: ['student-finance'] },
    { key: 'settings', label: 'PENGATURAN', menuKeys: ['student-profile-web'] },
  ],
  TEACHER: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['teacher-dashboard'] },
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
      menuKeys: ['teacher-cp', 'teacher-atp', 'teacher-prota', 'teacher-promes', 'teacher-modules', 'teacher-kktp'],
    },
    {
      key: 'exams',
      label: 'UJIAN',
      menuKeys: [
        'teacher-proctoring',
        'teacher-exam-formatif',
        'teacher-exam-sbts',
        'teacher-exam-sas',
        'teacher-exam-sat',
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
        'teacher-homeroom-sbts',
        'teacher-homeroom-sas',
        'teacher-homeroom-sat',
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
      key: 'kakom',
      label: 'KAKOM',
      menuKeys: ['teacher-work-program', 'teacher-kakom-classes', 'teacher-kakom-pkl', 'teacher-kakom-partners'],
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
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['admin-dashboard'] },
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
      menuKeys: ['admin-school-profile', 'admin-password'],
    },
  ],
  PRINCIPAL: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['principal-dashboard'] },
    { key: 'academic', label: 'AKADEMIK', menuKeys: ['principal-reports', 'principal-attendance'] },
    { key: 'finance', label: 'KEUANGAN', menuKeys: ['principal-finance-requests'] },
    { key: 'students', label: 'KESISWAAN', menuKeys: ['principal-students'] },
    { key: 'teachers', label: 'SDM GURU', menuKeys: ['principal-teachers'] },
  ],
  STAFF: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['staff-dashboard'] },
    { key: 'payments', label: 'Pembayaran (SPP)', menuKeys: ['staff-payments'] },
    { key: 'students', label: 'Data Siswa', menuKeys: ['staff-students'] },
    { key: 'administration', label: 'Administrasi', menuKeys: ['staff-admin'] },
  ],
  PARENT: [
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['parent-dashboard'] },
    { key: 'children', label: 'Data Anak', menuKeys: ['child-progress'] },
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
    { key: 'dashboard', label: 'Dashboard', menuKeys: ['tutor-dashboard'] },
    { key: 'members', label: 'Anggota & Nilai', menuKeys: ['tutor-members'] },
    { key: 'settings', label: 'PENGATURAN', menuKeys: ['tutor-profile'] },
  ],
  CALON_SISWA: [
    { key: 'information', label: 'Informasi', menuKeys: ['candidate-information'] },
    { key: 'registration', label: 'Pendaftaran', menuKeys: ['candidate-application'] },
  ],
  UMUM: [
    { key: 'information', label: 'Informasi', menuKeys: ['public-information'] },
    { key: 'registration', label: 'Pendaftaran', menuKeys: ['public-registration'] },
  ],
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

function resolveTeacherGroupLabel(user: AuthUser, group: RoleMenuGroup) {
  if (group.key === 'wakakur' && hasDuty(user, ['SEKRETARIS_KURIKULUM']) && !hasDuty(user, ['WAKASEK_KURIKULUM'])) {
    return 'SEKRETARIS KURIKULUM';
  }
  if (group.key === 'wakasis' && hasDuty(user, ['SEKRETARIS_KESISWAAN']) && !hasDuty(user, ['WAKASEK_KESISWAAN'])) {
    return 'SEKRETARIS KESISWAAN';
  }
  if (group.key === 'sarpras' && hasDuty(user, ['SEKRETARIS_SARPRAS']) && !hasDuty(user, ['WAKASEK_SARPRAS'])) {
    return 'SEKRETARIS SARPRAS';
  }
  if (group.key === 'humas' && hasDuty(user, ['SEKRETARIS_HUMAS']) && !hasDuty(user, ['WAKASEK_HUMAS'])) {
    return 'SEKRETARIS HUMAS';
  }
  if (group.key === 'kakom') {
    if (!hasDuty(user, ['KAPROG', 'KEPALA_KOMPETENSI'])) {
      return 'KAKOM';
    }

    const suffixes: string[] = [];
    if (Array.isArray(user.managedMajors) && user.managedMajors.length > 0) {
      for (const major of user.managedMajors) {
        const code = major.code?.trim();
        suffixes.push(code || major.name);
      }
    } else if (user.managedMajor) {
      const code = user.managedMajor.code?.trim();
      suffixes.push(code || user.managedMajor.name);
    }

    if (suffixes.length > 0) {
      return `KAKOM ${suffixes.join(' & ')}`;
    }
  }

  return group.label;
}

if (__DEV__) {
  assertRoleMenuIntegrity(ROLE_MENUS);
}

export function getRoleMenu(user?: AuthUser | null): RoleMenuItem[] {
  if (!user) return materializeMenuTargets(BASE_MENU);

  const roleItems = ROLE_MENUS[user.role] || BASE_MENU;
  const filteredItems = roleItems.filter((item) => shouldShowMenuItem(user, item));
  return materializeMenuTargets(dedupeMenuByKey(filteredItems));
}

export function getGroupedRoleMenu(user?: AuthUser | null): RoleMenuGroup[] {
  const menus = getRoleMenu(user);
  if (!user) {
    return [
      {
        key: 'base',
        label: 'Umum',
        items: menus,
      },
    ];
  }

  const grouped = buildGroupedMenu(user.role, menus);
  if (user.role !== 'TEACHER') return grouped;

  return grouped.map((group) => ({
    ...group,
    label: resolveTeacherGroupLabel(user, group),
  }));
}
