import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  BookOpen, 
  GraduationCap, 
  FileText, 
  CreditCard, 
  ClipboardList, 
  UserCheck, 
  School,
  Wallet,
  LogOut,
  Layers,
  Settings,
  UserCog,
  FileBarChart,
  Database,
  Building2,
  Download,
  Lock,
  ChevronDown,
  ChevronRight,
  Trophy,
  CalendarRange,
  Percent,
  Clock,
  FileQuestion,
  Timer,
  BarChart3,
  Briefcase,
  User as UserIcon,
  AlertCircle,
  Target,
  GitBranch,
  Check,
  List
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../../services/auth.service';
import { internshipService } from '../../services/internship.service';

import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

interface SidebarProps {
  user: {
    id: number;
    name: string;
    role: string;
    photo?: string | null;
    updatedAt?: string | Date;
    studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT';
    teacherClasses?: { id: number; name: string }[];
    trainingClassesTeaching?: { id: number; name: string }[];
    additionalDuties?: string[];
    managedMajor?: { id: number; name: string; code: string };
    managedMajors?: { id: number; name: string; code: string }[];
    studentClass?: { id: number; name: string; presidentId?: number | null };
    preferences?: any;
  };
  activeSemester?: 'ODD' | 'EVEN';
}

export type MenuItem = {
  label: string;
  path: string;
  icon: React.ElementType;
  children?: MenuItem[];
};

export const getMenuItems = (user: SidebarProps['user'], hasPendingDefense: boolean = false, pklEligibleGrades?: string | null): MenuItem[] => {
  const role = user.role;

  if (role === 'ADMIN') {
    return [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { 
        label: 'MASTER DATA', 
        path: '/admin/master', 
        icon: Database,
        children: [
          { label: 'Tahun Ajaran', path: '/admin/academic-years', icon: Calendar },
          { label: 'Kompetensi Keahlian', path: '/admin/majors', icon: Layers },
          { label: 'Kelas', path: '/admin/classes', icon: School },
          { label: 'Kelas Training', path: '/admin/training-classes', icon: Building2 },
          { label: 'Mata Pelajaran', path: '/admin/subjects', icon: BookOpen },
          { label: 'Kategori Mapel', path: '/admin/subject-categories', icon: List },
          { label: 'Ekstrakurikuler', path: '/admin/extracurriculars', icon: Trophy },
        ]
      },
      {
        label: 'USER MANAGEMENT',
        path: '/admin/users-mgmt',
        icon: Users,
        children: [
          { label: 'Kelola Admin', path: '/admin/admin-users', icon: Users },
          { label: 'Kelola Kepsek', path: '/admin/principal-users', icon: Users },
          { label: 'Kelola Staff', path: '/admin/staff-users', icon: Users },
          { label: 'Kelola Penguji', path: '/admin/examiner-users', icon: Users },
          { label: 'Kelola Pembina Ekskul', path: '/admin/tutor-users', icon: Users },
          { label: 'Kelola Orang Tua', path: '/admin/parent-users', icon: Users },
          { label: 'Kelola Guru', path: '/admin/teachers', icon: UserCog },
          { label: 'Kelola Siswa', path: '/admin/students', icon: GraduationCap },
          { label: 'Verifikasi Akun', path: '/admin/user-verification', icon: UserCheck },
          { label: 'Assignment Guru', path: '/admin/teacher-assignments', icon: ClipboardList },
          { label: 'Export/Import', path: '/admin/import-export', icon: Download },
        ]
      },
      {
        label: 'AKADEMIK',
        path: '/admin/academic',
        icon: FileText,
        children: [
          { label: 'Kalender Akademik', path: '/admin/academic-calendar', icon: CalendarRange },
          { label: 'Jadwal Pelajaran', path: '/admin/schedule', icon: Clock },
          { label: 'Rekap Jam Mengajar', path: '/admin/teaching-load', icon: BarChart3 },
          { label: 'Data KKM', path: '/admin/kkm', icon: Percent },
          { label: 'Rekap Absensi', path: '/admin/attendance', icon: UserCheck },
          { label: 'Laporan / Rapor', path: '/admin/report-cards', icon: FileBarChart },
        ]
      },
      {
        label: 'UJIAN & CBT',
        path: '/admin/cbt',
        icon: FileQuestion,
        children: [
          { label: 'Bank Soal', path: '/admin/question-bank', icon: FileQuestion },
          { label: 'Sesi Ujian', path: '/admin/exam-sessions', icon: Timer },
        ]
      },
      {
        label: 'PENGATURAN',
        path: '/admin/settings-group',
        icon: Settings,
        children: [
          { label: 'Profil Sekolah', path: '/admin/settings/profile', icon: School },
          { label: 'Ubah Password', path: '/admin/settings/password', icon: Lock },
        ]
      }
    ];
  }




  if (role === 'TEACHER') {
    const isWaliKelas = (user.teacherClasses?.length || 0) > 0;
    const hasTrainingClass = (user.trainingClassesTeaching?.length || 0) > 0;
    const duties = user.additionalDuties || [];

    const items: MenuItem[] = [
      { label: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
      {
        label: 'AKADEMIK',
        path: '/teacher/academic',
        icon: BookOpen,
        children: [
          { label: 'Jadwal Mengajar', path: '/teacher/schedule', icon: Calendar },
          { label: 'Kelas & Mapel', path: '/teacher/classes', icon: BookOpen },
          { label: 'Presensi Siswa', path: '/teacher/attendance', icon: UserCheck },
          { label: 'Materi & Tugas', path: '/teacher/materials', icon: ClipboardList },
          { label: 'Input Nilai', path: '/teacher/grades', icon: FileText },
          { label: 'Rapor Mapel', path: '/teacher/report-subjects', icon: FileBarChart },
        ]
      },
      {
        label: 'PERANGKAT AJAR',
        path: '/teacher/learning-resources',
        icon: BookOpen,
        children: [
          { label: 'Capaian Pembelajaran (CP)', path: '/teacher/learning-resources/cp', icon: Target },
          { label: 'Alur Tujuan Pembelajaran (ATP)', path: '/teacher/learning-resources/atp', icon: GitBranch },
          { label: 'Program Tahunan', path: '/teacher/learning-resources/prota', icon: CalendarRange },
          { label: 'Program Semester', path: '/teacher/learning-resources/promes', icon: Calendar },
          { label: 'Modul Ajar', path: '/teacher/learning-resources/modules', icon: BookOpen },
          { label: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)', path: '/teacher/learning-resources/kktp', icon: Check },
        ]
      },
      {
        label: 'UJIAN',
        path: '/teacher/exams-group',
        icon: FileQuestion,
        children: [
          { label: 'Jadwal Mengawas', path: '/teacher/proctoring', icon: UserCheck },
          { label: 'Formatif (Quiz)', path: '/teacher/exams/formatif', icon: FileQuestion },
          { label: 'SBTS', path: '/teacher/exams/sbts', icon: FileQuestion },
          { label: 'SAS', path: '/teacher/exams/sas', icon: FileQuestion },
          { label: 'SAT', path: '/teacher/exams/sat', icon: FileQuestion },
          { label: 'Bank Soal', path: '/teacher/exams/bank', icon: Database },
        ]
      }
    ];

    // Menu Khusus Wali Kelas
    if (isWaliKelas) {
      items.push({
        label: 'WALI KELAS',
        path: '/teacher/wali-kelas',
        icon: Users,
        children: [
          { label: 'Rekap Presensi', path: '/teacher/wali-kelas/attendance', icon: UserCheck },
          { label: 'Catatan Perilaku', path: '/teacher/wali-kelas/behavior', icon: AlertCircle },
          { label: 'Persetujuan Izin', path: '/teacher/wali-kelas/permissions', icon: UserCheck },
          { label: 'Rapor SBTS', path: '/teacher/wali-kelas/rapor-sbts', icon: FileBarChart },
          { label: 'Rapor SAS', path: '/teacher/wali-kelas/rapor-sas', icon: FileBarChart },
          { label: 'Rapor SAT', path: '/teacher/wali-kelas/rapor-sat', icon: FileBarChart },
        ]
      });
    }

    // Menu Khusus Kelas Training
    if (hasTrainingClass) {
      items.push({
        label: 'KELAS TRAINING',
        path: '/teacher/training',
        icon: Building2,
        children: [
          { label: 'Daftar Kelas', path: '/teacher/training/classes', icon: Layers },
          { label: 'Presensi Training', path: '/teacher/training/attendance', icon: UserCheck },
          { label: 'Nilai Training', path: '/teacher/training/grades', icon: FileText },
          { label: 'Materi & Tugas', path: '/teacher/training/materials', icon: ClipboardList },
          { label: 'Laporan Training', path: '/teacher/training/reports', icon: FileBarChart },
        ]
      });
    }

    // Menu Khusus Tugas Tambahan (Dynamic per Duty)
    const kakomDuties = duties.filter(d => d.includes('KAPROG') || d.includes('KEPALA_KOMPETENSI'));
    const otherDuties = duties.filter(d => !d.includes('KAPROG') && !d.includes('KEPALA_KOMPETENSI'));

    // Process Non-KAKOM Duties
    otherDuties.forEach((rawDuty) => {
      const duty = rawDuty.trim().toUpperCase();
      let label = duty;
      let icon = Briefcase;
      let children: MenuItem[] = [];

      // Check if duty is secretary
      const isSecretary = duty.startsWith('SEKRETARIS_');
      
      // Determine base role for menu mapping (e.g. SEKRETARIS_KURIKULUM -> WAKASEK_KURIKULUM)
      let baseRole = duty;
      if (isSecretary) {
        baseRole = duty.replace('SEKRETARIS_', 'WAKASEK_');
      }

      // Helper to generate generic items - Hide Work Program for Secretaries
      const createGenericItems = (dutyCode: string) => {
        if (isSecretary) return [];
        return [
           { label: 'Program Kerja', path: `/teacher/work-programs?duty=${dutyCode}`, icon: ClipboardList }
        ];
      };

      if (baseRole === 'WAKASEK_KURIKULUM') {
        label = 'WAKASEK KURIKULUM';
        if (isSecretary) label = 'SEKRETARIS KURIKULUM';

        // Mulai dari Program Kerja (jika bukan sekretaris)
        children = [
          ...createGenericItems(duty),
        ];

        // Letakkan Persetujuan Program Kerja tepat di bawah Program Kerja,
        // dan hanya untuk Wakasek (bukan Sekretaris)
        if (!isSecretary) {
          children.push({
            label: 'Persetujuan Program Kerja',
            path: '/teacher/wakasek/work-program-approvals',
            icon: ClipboardList,
          });
        }

        // Lalu menu Wakasek lainnya
        children.push(
          { label: 'Kelola Kurikulum', path: '/teacher/wakasek/curriculum', icon: Layers },
          { label: 'Kelola Ujian', path: '/teacher/wakasek/exams', icon: FileQuestion },
          { label: 'Monitoring Kinerja', path: '/teacher/wakasek/performance', icon: BarChart3 },
          { label: 'Persetujuan', path: '/teacher/wakasek/approvals', icon: UserCheck },
          { label: 'Laporan Akademik', path: '/teacher/wakasek/reports', icon: FileText },
        );
      } else if (baseRole === 'WAKASEK_KESISWAAN') {
        label = 'WAKASEK KESISWAAN';
        if (isSecretary) label = 'SEKRETARIS KESISWAAN';

        children = [
          ...createGenericItems(duty),
          { label: 'Kelola Kesiswaan', path: '/teacher/wakasek/students', icon: GraduationCap },
          { label: 'Monitoring Kinerja', path: '/teacher/wakasek/student-performance', icon: BarChart3 },
          { label: 'Persetujuan', path: '/teacher/wakasek/student-approvals', icon: UserCheck },
          { label: 'Laporan Kesiswaan', path: '/teacher/wakasek/student-reports', icon: FileText }
        ];
      } else if (baseRole === 'WAKASEK_SARPRAS') {
        label = 'WAKASEK SARPRAS';
        if (isSecretary) label = 'SEKRETARIS SARPRAS';

        children = [
          ...createGenericItems(duty),
          { label: 'Aset Sekolah', path: '/teacher/sarpras/inventory', icon: Database },
          { label: 'Persetujuan Anggaran', path: '/teacher/sarpras/budgets', icon: Wallet },
          { label: 'Laporan', path: '/teacher/sarpras/reports', icon: FileText }
        ];
      } else if (baseRole === 'WAKASEK_HUMAS') {
        label = 'WAKASEK HUMAS';
        if (isSecretary) label = 'SEKRETARIS HUMAS';

        children = [
          ...createGenericItems(duty),
          { label: 'Pengaturan PKL', path: '/teacher/humas/settings', icon: Settings },
          { label: 'Persetujuan PKL', path: '/teacher/internship/approval', icon: Check },
          { label: 'Nilai PKL', path: '/teacher/wakasek/internship-components', icon: Percent },
          { label: 'Monitoring Jurnal', path: '/teacher/wakasek/journal-monitoring', icon: FileText },
          { label: 'Mitra Industri', path: '/teacher/humas/partners', icon: Users },
          { label: 'Laporan', path: '/teacher/humas/reports', icon: FileText }
        ];
      } else if (duty === 'KEPALA_LAB') {
        label = 'KEPALA LAB';
        children = [
          ...createGenericItems(duty),
          { label: 'Inventaris Lab', path: '/teacher/head-lab/inventory?filter=lab', icon: Database },
          { label: 'Jadwal Lab', path: '/teacher/head-lab/schedule', icon: Calendar },
          { label: 'Laporan Insiden', path: '/teacher/head-lab/incidents', icon: AlertCircle }
        ];
      } else if (duty === 'KEPALA_PERPUSTAKAAN') {
        label = 'KEPALA PERPUSTAKAAN';
        children = [
          ...createGenericItems(duty),
          { label: 'Inventaris Perpustakaan', path: '/teacher/head-library/inventory?filter=library', icon: Database },
        ];
      } else {
        // Fallback for other duties
        label = duty.replace(/_/g, ' ').toUpperCase();
        children = createGenericItems(duty);
      }

      // Skip adding menu if children are empty (avoids broken links for unmapped secretary roles)
      if (children.length === 0) return;

      items.push({
        label,
        path: `/teacher/duty/${duty.toLowerCase()}`,
        icon,
        children
      });
    });

    // Process KAKOM Duties (Combined)
    if (kakomDuties.length > 0) {
      let suffixes: string[] = [];
      
      if (user.managedMajors && user.managedMajors.length > 0) {
        suffixes = user.managedMajors.map(m => m.code || m.name);
      } else if (user.managedMajor) {
        suffixes = [user.managedMajor.code || user.managedMajor.name];
      } else {
        suffixes = kakomDuties.map(d => d.split('_').slice(1).join(' ').toUpperCase()).filter(Boolean);
      }

      const label = `KAKOM ${suffixes.join(' & ')}`;
      
      const children: MenuItem[] = [];
      
      // Program Kerja per duty
      // Since Work Programs are shared/owned by the teacher (KAPROG), we show a single entry
      children.push({ 
        label: 'Program Kerja', 
        path: `/teacher/work-programs?duty=KAPROG`, 
        icon: ClipboardList 
      });

      // Shared KAKOM items
          children.push(
            { label: 'Kelas Kompetensi', path: '/teacher/head-program/classes', icon: School },
            { label: 'Monitoring PKL', path: '/teacher/head-program/pkl', icon: Building2 },
            { label: 'Mitra Industri & BKK', path: '/teacher/head-program/partners', icon: Users }
          );

          items.push({
            label,
            path: `group-kakom-${label.replace(/\s+/g, '-').toLowerCase()}`, // Unique ID for accordion state, not a route
            icon: Briefcase,
            children
          });
        }

    // Menu Sidang PKL (Conditional)
    if (hasPendingDefense) {
      items.push({
        label: 'SIDANG PKL',
        path: '/teacher/internship/defense',
        icon: GraduationCap,
        children: [
          { label: 'Nilai Sidang PKL', path: '/teacher/internship/defense', icon: FileText }
        ]
      });
    }

    items.push({
      label: 'PENGATURAN',
      path: '/teacher/general',
      icon: Settings,
      children: [
        { label: 'Profil', path: '/teacher/profile', icon: UserIcon },
      ]
    });

    return items;
  }

  if (role === 'EXAMINER') {
    return [
      { label: 'Dashboard', path: '/examiner/dashboard', icon: LayoutDashboard },
      { label: 'Data Skema', path: '/examiner/schemes', icon: Database },
      { label: 'Penilaian UKK', path: '/examiner/ukk-assessment', icon: ClipboardList },
      {
        label: 'PENGATURAN',
        path: '/examiner/general',
        icon: Settings,
        children: [
          { label: 'Profil', path: '/examiner/profile', icon: UserIcon },
        ]
      }
    ];
  }

  if (role === 'EXTRACURRICULAR_TUTOR') {
    return [
      { label: 'Dashboard', path: '/tutor', icon: LayoutDashboard },
      { label: 'Anggota & Nilai', path: '/tutor/members', icon: Users },
      {
        label: 'PENGATURAN',
        path: '/tutor/general',
        icon: Settings,
        children: [
          { label: 'Profil', path: '/tutor/profile', icon: UserIcon },
        ]
      }
    ];
  }

  if (role === 'STUDENT') {
    const isAlumni = user.studentStatus === 'GRADUATED';
    if (isAlumni) {
       return [
        { label: 'Dashboard', path: '/student', icon: LayoutDashboard },
        {
          label: 'AKADEMIK',
          path: '/student/academic',
          icon: GraduationCap,
          children: [
            { label: 'Riwayat Nilai', path: '/student/grades', icon: FileText },
            { label: 'Riwayat Kehadiran', path: '/student/attendance', icon: UserCheck },
          ]
        },
        {
          label: 'PENGATURAN',
          path: '/student/settings',
          icon: Settings,
          children: [
            { label: 'Profile', path: '/student/profile', icon: UserIcon },
          ]
        }
      ];
    }

    // Logic PKL Dinamis (Configurable via Academic Year)
    const studentClassName = user.studentClass?.name?.toUpperCase() || '';
    
    let isPKLGrade = false;
    if (pklEligibleGrades) {
      // Split by comma and trim, e.g., "XI, XII" -> ["XI", "XII"]
      const eligibleGrades = pklEligibleGrades.split(',').map(g => g.trim().toUpperCase());
      isPKLGrade = eligibleGrades.some(lvl => studentClassName.startsWith(lvl + ' ') || studentClassName === lvl);
    } else {
      // Default fallback if not configured (usually XI and XII)
      isPKLGrade = ['XI', 'XII'].some(lvl => studentClassName.startsWith(lvl + ' ') || studentClassName === lvl);
    }

    return [
      { label: 'Dashboard', path: '/student', icon: LayoutDashboard },
      { label: 'Ekstrakurikuler', path: '/student/extracurricular', icon: Trophy },
      {
        label: 'AKADEMIK',
        path: '/student/academic',
        icon: BookOpen,
        children: [
          { label: 'Jadwal Pelajaran', path: '/student/schedule', icon: Calendar },
          { label: 'Materi & Tugas', path: '/student/learning', icon: ClipboardList },
          { label: 'Riwayat Kehadiran', path: '/student/attendance', icon: UserCheck },
          { label: 'Perizinan', path: '/student/permissions', icon: ClipboardList },
          ...(user.studentClass?.presidentId === (user as any).id ? [{ label: 'Presensi Kelas', path: '/student/class-attendance', icon: ClipboardList }] : [])
        ]
      },
      ...(isPKLGrade ? [{
        label: 'PKL (PRAKERIN)',
        path: '/student/internship',
        icon: Briefcase,
        children: [
            { label: 'Dashboard PKL', path: '/student/internship/dashboard', icon: LayoutDashboard },
            { label: 'Jurnal Harian', path: '/student/internship/journals', icon: BookOpen },
            { label: 'Absensi PKL', path: '/student/internship/attendance', icon: UserCheck },
            { label: 'Laporan PKL', path: '/student/internship/report', icon: FileText },
        ]
      }] : []),
      {
        label: 'UJIAN ONLINE',
        path: '/student/exams-group',
        icon: FileQuestion,
        children: [
          { label: 'Formatif (Quiz)', path: '/student/exams/formatif', icon: FileQuestion },
          { label: 'SBTS', path: '/student/exams/sbts', icon: FileQuestion },
          { label: 'SAS', path: '/student/exams/sas', icon: FileQuestion },
          { label: 'SAT', path: '/student/exams/sat', icon: FileQuestion },
        ]
      },
      {
        label: 'NILAI SAYA',
        path: '/student/grades-group',
        icon: GraduationCap,
        children: [
            { label: 'Riwayat Nilai', path: '/student/grades', icon: FileText },
        ]
      },
      {
        label: 'ADMINISTRASI',
        path: '/student/administration',
        icon: Wallet,
        children: [
          { label: 'Keuangan', path: '/student/finance', icon: Wallet },
        ]
      },
      {
        label: 'PENGATURAN',
        path: '/student/settings',
        icon: Settings,
        children: [
          { label: 'Profile', path: '/student/profile', icon: UserIcon },
        ]
      }
    ];
  }

  if (role === 'PRINCIPAL') {
    return [
      { label: 'Dashboard', path: '/principal', icon: LayoutDashboard },
      {
        label: 'AKADEMIK',
        path: '/principal/academic',
        icon: BookOpen,
        children: [
          { label: 'Rapor & Ranking', path: '/principal/academic/reports', icon: FileBarChart },
          { label: 'Rekap Absensi', path: '/principal/academic/attendance', icon: UserCheck },
        ],
      },
      {
        label: 'KEUANGAN',
        path: '/principal/finance',
        icon: Wallet,
        children: [
          { label: 'Pengajuan Anggaran', path: '/principal/finance/requests', icon: FileText },
        ],
      },
      {
        label: 'KESISWAAN',
        path: '/principal/students-group',
        icon: Users,
        children: [
          { label: 'Data Siswa', path: '/principal/students', icon: GraduationCap },
        ],
      },
      {
        label: 'SDM GURU',
        path: '/principal/teachers-group',
        icon: Users,
        children: [
          { label: 'Data Guru', path: '/principal/teachers', icon: Users },
        ],
      },
    ];
  }

  if (role === 'STAFF') {
    return [
      { label: 'Dashboard', path: '/staff', icon: LayoutDashboard },
      { label: 'Pembayaran (SPP)', path: '/staff/payments', icon: CreditCard },
      { label: 'Data Siswa', path: '/staff/students', icon: GraduationCap },
      { label: 'Administrasi', path: '/staff/admin', icon: ClipboardList },
    ];
  }

  if (role === 'PARENT') {
    return [
      { label: 'Dashboard', path: '/parent', icon: LayoutDashboard },
      { label: 'Data Anak', path: '/parent/children', icon: Users },
      { label: 'Keuangan', path: '/parent/finance', icon: Wallet },
      { label: 'Absensi Anak', path: '/parent/attendance', icon: UserCheck },
    ];
  }

  return [];
};

export const Sidebar = ({ user }: SidebarProps) => {
  const location = useLocation();

  const { data: examinerInternshipsData } = useQuery({
    queryKey: ['examiner-internships'],
    queryFn: () => internshipService.getExaminerInternships(),
    enabled: user.role === 'TEACHER',
    staleTime: 5 * 60 * 1000, 
  });

  const { data: activeAcademicYearData } = useActiveAcademicYear();
  
  const hasPendingDefense = (examinerInternshipsData?.data?.data?.length || 0) > 0;
  const pklEligibleGrades = activeAcademicYearData?.pklEligibleGrades;

  const items = useMemo(() => getMenuItems(user, hasPendingDefense, pklEligibleGrades), [user, hasPendingDefense, pklEligibleGrades]);
  // Helper: check path active with relaxed query matching
  const isChildPathActive = (itemPath: string) => {
    if (itemPath.includes('?')) {
      const [pathOnly, qs] = itemPath.split('?');
      const required = new URLSearchParams(qs);
      const current = new URLSearchParams(location.search);
      if (!location.pathname.startsWith(pathOnly)) return false;
      for (const [k, v] of required.entries()) {
        if (current.get(k) !== v) return false;
      }
      return true;
    }
    const cleanChildPath = itemPath.split('?')[0];
    return location.pathname.startsWith(cleanChildPath);
  };
  const activeParentPath = useMemo(() => {
    const activeParent = items.find((item) => {
      // Check if any child matches
      if (item.children && item.children.some((child) => {
        return isChildPathActive(child.path);
      })) {
        return true;
      }
      // Special handling for Exam creation page which isn't explicitly in the menu but belongs to UJIAN
      if (item.label === 'UJIAN' && (location.pathname.includes('/teacher/exams/') || location.pathname.includes('/examiner/exams/'))) {
        return true;
      }
      return false;
    });
    return activeParent ? activeParent.path : null;
  }, [items, location.pathname]);

  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    return user.preferences?.sidebarOpenGroup || null;
  });



  /* 
  const updatePreferencesMutation = useMutation({
    mutationFn: (newPreferences: any) => {
      const currentPreferences = user.preferences || {};
      return userService.update(user.id, {
        preferences: { ...currentPreferences, ...newPreferences }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
  */

  useEffect(() => {
    if (activeParentPath && activeParentPath !== openGroup) {
      setOpenGroup(activeParentPath);
    } else if (!activeParentPath && ['/teacher', '/admin', '/student', '/principal', '/staff', '/parent'].includes(location.pathname)) {
      setOpenGroup(null);
    }
  }, [activeParentPath, location.pathname]);

  const toggleGroup = (path: string) => {
    const newState = openGroup === path ? null : path;
    setOpenGroup(newState);
    
    // Persist to database - TEMPORARILY DISABLED to prevent logout issues
    // updatePreferencesMutation.mutate({ sidebarOpenGroup: newState });
  };

  const isPathActive = (itemPath: string) => {
    // List of root paths that require exact match to avoid highlighting when on subpages
    const rootPaths = ['/admin', '/teacher', '/student', '/principal', '/staff', '/parent'];
    
    if (rootPaths.includes(itemPath)) {
      return location.pathname === itemPath;
    }
    
    // When itemPath includes query params, require that all those params are present
    // but allow additional params (e.g., tab=BUDGET) to co-exist
    if (itemPath.includes('?')) {
      const [pathOnly, qs] = itemPath.split('?');
      const required = new URLSearchParams(qs);
      const current = new URLSearchParams(location.search);
      
      if (!location.pathname.startsWith(pathOnly)) return false;
      
      for (const [k, v] of required.entries()) {
        if (current.get(k) !== v) return false;
      }
      return true;
    }

    // Remove query params from itemPath for comparison
    const cleanItemPath = itemPath.split('?')[0];
    return location.pathname.startsWith(cleanItemPath);
  };

  return (
    <aside className="w-64 bg-white hidden md:flex flex-col h-full shadow-xl z-20">
      <div className="p-6 flex items-center gap-3 border-b border-gray-100">
        <img src="/logo_sis_kgb2.png" alt="Logo" className="w-9 h-9 object-contain" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-blue-700 leading-tight whitespace-nowrap truncate">
            Sistem Integrasi Sekolah
          </h1>
          <p className="text-[11px] text-gray-500 font-medium mt-0.5 whitespace-nowrap truncate">
            SMKS Karya Guna Bhakti 2
          </p>
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isChildActive = hasChildren && item.children?.some((child) => isPathActive(child.path));
            const isActive = isPathActive(item.path) || isChildActive;
            const isOpen = (openGroup ?? activeParentPath) === item.path;

            if (hasChildren) {
              return (
                <li key={item.path}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.path)}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 group',
                      isOpen ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={18} className={clsx(isOpen ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600')} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  
                  {/* Dropdown Content */}
                  <div className={clsx(
                    'overflow-hidden transition-all duration-300 ease-in-out',
                    isOpen ? 'max-h-[800px] opacity-100 mt-1' : 'max-h-0 opacity-0'
                  )}>
                    <ul className="pl-3 space-y-1 border-l-2 border-gray-100 ml-3">
                      {item.children?.map((child) => {
                        const ChildIcon = child.icon;
                        const isChildItemActive = isPathActive(child.path);
                        return (
                          <li key={child.path}>
                            <Link
                              to={child.path}
                              className={clsx(
                                'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm',
                                isChildItemActive 
                                  ? 'text-blue-600 font-medium bg-blue-50' 
                                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                              )}
                            >
                              <ChildIcon size={16} className={clsx(isChildItemActive ? 'text-blue-600' : 'text-gray-400')} />
                              <span>{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              );
            }

            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
                    isActive 
                      ? 'bg-blue-50 text-blue-600 font-medium' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                  )}
                  onClick={() => setOpenGroup(null)} // Close accordion when clicking single item
                >
                  <Icon size={18} className={clsx(isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600')} />
                  <span className="text-sm">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-5 m-4 bg-gray-50 rounded-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-blue-600 font-bold border border-gray-100 overflow-hidden">
            {user.photo ? (
              <img 
                src={`${user.photo}${user.updatedAt ? `?v=${new Date(user.updatedAt).getTime()}` : ''}`} 
                alt={user.name} 
                className="w-full h-full object-cover" 
              />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">@{user.role.toLowerCase()}</p>
          </div>
        </div>
        
        <button 
          onClick={() => {
            authService.logout();
            window.location.href = '/login';
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
        >
          <LogOut size={14} />
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
};
