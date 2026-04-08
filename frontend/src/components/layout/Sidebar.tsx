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
  Calculator,
  Briefcase,
  User as UserIcon,
  AlertCircle,
  Target,
  GitBranch,
  Check,
  List,
  Image as ImageIcon,
  Server,
  Mail,
  Activity,
  ShieldAlert,
  Vote,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../../services/auth.service';
import { internshipService } from '../../services/internship.service';
import {
  examService,
  examProgramCodeToSlug,
  normalizeExamProgramCode,
  type ExamProgram,
} from '../../services/exam.service';
import {
  teachingResourceProgramService,
  teachingResourceProgramCodeToSlug,
  normalizeTeachingResourceProgramCode,
  type TeachingResourceProgram,
} from '../../services/teachingResourceProgram.service';
import { inventoryService, type Room } from '../../services/inventory.service';
import { tutorService, type TutorAssignmentSummary } from '../../services/tutor.service';
import { osisService } from '../../services/osis.service';
import { resolveStaffDivision } from '../../utils/staffRole';
import {
  buildTutorMembersHref,
  canAccessTutorWorkspace,
  getExtracurricularTutorAssignments,
  getActiveTutorAssignments,
} from '../../features/tutor/tutorAccess';

import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

interface SidebarProps {
  user: {
    id: number;
    name: string;
    role: string;
    ptkType?: string | null;
    photo?: string | null;
    updatedAt?: string | Date;
    studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT';
    teacherClasses?: { id: number; name: string }[];
    trainingClassesTeaching?: { id: number; name: string }[];
    additionalDuties?: string[] | null;
    managedMajor?: { id: number; name: string; code: string } | null;
    managedMajors?: { id: number; name: string; code: string }[] | null;
    ekskulTutorAssignments?: TutorAssignmentSummary[] | null;
    managedInventoryRooms?: {
      id: number;
      name: string;
      managerUserId?: number | null;
    }[] | null;
    studentClass?: { id: number; name: string; presidentId?: number | null } | null;
    preferences?: Record<string, unknown> | null;
  };
  activeSemester?: 'ODD' | 'EVEN';
}

export type MenuItem = {
  label: string;
  path: string;
  icon: React.ElementType;
  children?: MenuItem[];
};

const ROOT_MENU_PATHS = ['/admin', '/teacher', '/student', '/principal', '/staff', '/parent', '/candidate', '/public', '/tutor', '/examiner'] as const;
const SIDEBAR_WIDTH_STORAGE_KEY = 'dashboard-sidebar-width';
const DEFAULT_SIDEBAR_WIDTH = 256;
const MIN_SIDEBAR_WIDTH = 232;
const MAX_SIDEBAR_WIDTH = 420;

function sortExamPrograms(programs: ExamProgram[]): ExamProgram[] {
  return [...programs]
    .filter((program) => Boolean(program?.isActive))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.label || '').localeCompare(String(b.label || '')));
}

function sortTeachingResourcePrograms(programs: TeachingResourceProgram[]): TeachingResourceProgram[] {
  return [...programs]
    .filter((program) => Boolean(program?.isActive))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.label || '').localeCompare(String(b.label || '')));
}

function getTeachingResourceProgramIcon(programCode: string): React.ElementType {
  const normalized = normalizeTeachingResourceProgramCode(programCode);
  if (normalized === 'CP') return Target;
  if (normalized === 'ATP') return GitBranch;
  if (normalized === 'PROTA') return CalendarRange;
  if (normalized === 'PROMES') return Calendar;
  if (normalized === 'ALOKASI_WAKTU') return Timer;
  if (normalized === 'MODUL_AJAR') return BookOpen;
  if (normalized === 'KKTP') return Check;
  if (normalized === 'MATRIKS_SEBARAN') return Layers;
  return BookOpen;
}

function normalizeGradeComponentCode(raw: unknown): string {
  return String(raw || '').trim().toUpperCase();
}

function normalizeDutyCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function isOsisLabel(raw: unknown): boolean {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .includes('OSIS');
}

function normalizeComparableName(raw: unknown): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getRoomMatchScore(expected: unknown, actual: unknown): number {
  const expectedName = normalizeComparableName(expected);
  const actualName = normalizeComparableName(actual);

  if (!expectedName || !actualName) return 0;
  if (expectedName === actualName) return 100;
  if (actualName.includes(expectedName) || expectedName.includes(actualName)) return 70;

  const expectedTokens = expectedName.split(' ').filter(Boolean);
  const actualTokens = new Set(actualName.split(' ').filter(Boolean));
  if (!expectedTokens.length || !actualTokens.size) return 0;

  let score = 0;
  expectedTokens.forEach((token) => {
    if (actualTokens.has(token)) {
      score += token.length >= 4 ? 20 : 10;
    }
  });

  return score;
}

function buildAdvisorSidebarLabel(name: unknown): string {
  const normalized = normalizeComparableName(name);
  return normalized ? `PEMBINA ${normalized}` : 'PEMBINA EKSKUL';
}

function linkAssignedInventoryRooms(
  assignedInventoryRooms: Room[] | undefined,
  tutorAssignments: TutorAssignmentSummary[],
): {
  roomByAssignmentId: Map<number, Room>;
  osisRooms: Room[];
  detachedRooms: Room[];
} {
  const rooms: Room[] = Array.isArray(assignedInventoryRooms) ? [...assignedInventoryRooms] : [];
  const roomByAssignmentId = new Map<number, Room>();
  const usedRoomIds = new Set<number>();
  const extracurricularAssignments = getExtracurricularTutorAssignments(tutorAssignments);

  extracurricularAssignments.forEach((assignment) => {
    let selectedRoom: Room | null = null;
    let selectedScore = 0;

    rooms.forEach((room) => {
      if (usedRoomIds.has(room.id) || isOsisLabel(room.name)) return;
      const score = getRoomMatchScore(assignment?.ekskul?.name, room.name);
      if (score <= 0) return;
      if (!selectedRoom || score > selectedScore) {
        selectedRoom = room;
        selectedScore = score;
      }
    });

    if (selectedRoom) {
      roomByAssignmentId.set(assignment.id, selectedRoom as Room);
      usedRoomIds.add((selectedRoom as Room).id);
    }
  });

  const osisRooms = rooms.filter((room) => !usedRoomIds.has(room.id) && isOsisLabel(room.name));
  const detachedRooms = rooms.filter((room) => !usedRoomIds.has(room.id) && !isOsisLabel(room.name));

  return {
    roomByAssignmentId,
    osisRooms,
    detachedRooms,
  };
}

function mergeTutorAssignments(
  primaryAssignments?: TutorAssignmentSummary[] | null,
  fallbackAssignments?: TutorAssignmentSummary[] | null,
): TutorAssignmentSummary[] {
  const merged = new Map<number, TutorAssignmentSummary>();

  (Array.isArray(fallbackAssignments) ? fallbackAssignments : []).forEach((assignment) => {
    if (!assignment || typeof assignment.id !== 'number') return;
    merged.set(assignment.id, assignment);
  });

  (Array.isArray(primaryAssignments) ? primaryAssignments : []).forEach((assignment) => {
    if (!assignment || typeof assignment.id !== 'number') return;
    merged.set(assignment.id, assignment);
  });

  return Array.from(merged.values());
}

function isMidtermComponent(code: string): boolean {
  if (!code) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(code)) return true;
  return code.includes('MIDTERM');
}

function isFinalComponent(code: string): boolean {
  if (!code) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_EVEN', 'FINAL_ODD'].includes(code)) {
    return true;
  }
  return code.includes('FINAL');
}

function isHomeroomReportProgram(program: ExamProgram): boolean {
  const componentType = normalizeGradeComponentCode(
    program?.gradeComponentTypeCode || program?.gradeComponentType,
  );
  const baseType = normalizeGradeComponentCode(program?.baseTypeCode || program?.baseType);
  return isMidtermComponent(componentType) || isFinalComponent(componentType) || isMidtermComponent(baseType) || isFinalComponent(baseType);
}

// eslint-disable-next-line react-refresh/only-export-components
export const getMenuItems = (
  user: SidebarProps['user'],
  hasPendingDefense: boolean = false,
  pklEligibleGrades?: string | null,
  examPrograms?: ExamProgram[],
  teachingResourcePrograms?: TeachingResourceProgram[],
  assignedInventoryRooms?: Room[],
  tutorAssignments: TutorAssignmentSummary[] = [],
  hasActiveOsisElection: boolean = false,
): MenuItem[] => {
  const role = user.role;

  if (role === 'ADMIN') {
    return [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { label: 'Email', path: '/email', icon: Mail },
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
          { label: 'Kelola Tutor Eksternal', path: '/admin/tutor-users', icon: Users },
          { label: 'Kelola Orang Tua', path: '/admin/parent-users', icon: Users },
          { label: 'Kelola Guru', path: '/admin/teachers', icon: UserCog },
          { label: 'Kelola Siswa', path: '/admin/students', icon: GraduationCap },
          { label: 'Verifikasi Akun', path: '/admin/user-verification', icon: UserCheck },
          { label: 'Assignment Guru', path: '/admin/teacher-assignments', icon: ClipboardList },
          { label: 'Export/Import', path: '/admin/import-export', icon: Download },
        ]
      },
      {
        label: 'PPDB & BKK',
        path: '/admin/ppdb-bkk',
        icon: Briefcase,
        children: [
          { label: 'PPDB Calon Siswa', path: '/admin/candidate-admissions', icon: FileText },
          { label: 'Kelola Pelamar BKK', path: '/admin/bkk-users', icon: Briefcase },
          { label: 'Lamaran BKK', path: '/admin/bkk-applications', icon: ClipboardList },
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
          { label: 'Slideshow', path: '/admin/settings/slideshow', icon: ImageIcon },
          { label: 'Profil Sekolah', path: '/admin/settings/profile', icon: School },
          { label: 'Ubah Password', path: '/admin/settings/password', icon: Lock },
          { label: 'Area Server', path: '/admin/settings/server-area', icon: Server },
        ]
      },

    ];
  }




  if (role === 'TEACHER') {
    const activeTutorAssignments = getActiveTutorAssignments(tutorAssignments);
    const extracurricularTutorAssignments = getExtracurricularTutorAssignments(activeTutorAssignments);
    const linkedAssignedInventory = linkAssignedInventoryRooms(assignedInventoryRooms, activeTutorAssignments);
    const isWaliKelas = (user.teacherClasses?.length || 0) > 0;
    const hasTrainingClass = (user.trainingClassesTeaching?.length || 0) > 0;
    const duties = user.additionalDuties || [];
    const teacherExamPrograms = sortExamPrograms(
      (examPrograms ?? []).filter((program) => program.showOnTeacherMenu),
    );
    const teacherLearningPrograms = sortTeachingResourcePrograms(
      (teachingResourcePrograms ?? []).filter((program) => program.showOnTeacherMenu),
    );
    const dynamicLearningPrograms: MenuItem[] = teacherLearningPrograms.map((program) => ({
      label: String(program.label || program.code),
      path: `/teacher/learning-resources/${teachingResourceProgramCodeToSlug(program.code)}`,
      icon: getTeachingResourceProgramIcon(program.code),
    }));
    const teacherAssignedInventoryChildren: MenuItem[] =
      linkedAssignedInventory.detachedRooms.map((room) => ({
        label: room.name,
        path: `/teacher/assigned-inventory/${room.id}`,
        icon: Database,
      })) || [];
    const assignedInventoryMenu: MenuItem | null =
      teacherAssignedInventoryChildren.length > 0
        ? {
            label: 'INVENTARIS TUGAS',
            path: '/teacher/assigned-inventory',
            icon: Database,
            children: teacherAssignedInventoryChildren,
          }
        : null;
    const teacherOsisInventoryPath = linkedAssignedInventory.osisRooms[0]
      ? `/teacher/assigned-inventory/${linkedAssignedInventory.osisRooms[0].id}`
      : '/teacher/osis/inventory';
    const extracurricularAdvisorMenus: MenuItem[] = extracurricularTutorAssignments.map((assignment) => {
      const linkedRoom = linkedAssignedInventory.roomByAssignmentId.get(assignment.id) || null;
      const workProgramParams = new URLSearchParams({
        duty: 'PEMBINA_EKSKUL',
        assignmentId: String(assignment.id),
        ekskulId: String(assignment.ekskulId),
        academicYearId: String(assignment.academicYearId),
      });

      return {
        label: buildAdvisorSidebarLabel(assignment?.ekskul?.name),
        path: buildTutorMembersHref(assignment),
        icon: Trophy,
        children: [
          { label: 'Program Kerja', path: `/tutor/work-programs?${workProgramParams.toString()}`, icon: ClipboardList },
          { label: 'Anggota & Nilai', path: buildTutorMembersHref(assignment), icon: Users },
          {
            label: 'Kelola Inventaris',
            path: linkedRoom ? `/teacher/assigned-inventory/${linkedRoom.id}` : '/tutor/inventory',
            icon: Database,
          },
        ],
      };
    });

    const items: MenuItem[] = [
      { label: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
      { label: 'Email', path: '/email', icon: Mail },
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
      ...(dynamicLearningPrograms.length > 0
        ? [
            {
              label: 'PERANGKAT AJAR',
              path: '/teacher/learning-resources',
              icon: BookOpen,
              children: dynamicLearningPrograms,
            } as MenuItem,
          ]
        : []),
      {
        label: 'UJIAN',
        path: '/teacher/exams-group',
        icon: FileQuestion,
        children: [
          { label: 'Jadwal Mengawas', path: '/teacher/proctoring', icon: UserCheck },
          ...teacherExamPrograms.map((program) => ({
            label: String(program.label || program.code),
            path: `/teacher/exams/program/${examProgramCodeToSlug(program.code)}`,
            icon: FileQuestion,
          })),
          { label: 'Bank Soal', path: '/teacher/exams/bank', icon: Database },
        ]
      },

    ];

    // Menu Khusus Wali Kelas
    if (isWaliKelas) {
      const homeroomReportPrograms = sortExamPrograms(
        (examPrograms ?? []).filter(
          (program) => Boolean(program?.showOnTeacherMenu) && isHomeroomReportProgram(program),
        ),
      );
      const seenProgramSlugs = new Set<string>();
      const dynamicHomeroomReportMenus: MenuItem[] = homeroomReportPrograms.reduce<MenuItem[]>((acc, program) => {
        const slug = examProgramCodeToSlug(program.code);
        if (!slug || seenProgramSlugs.has(slug)) return acc;
        seenProgramSlugs.add(slug);
        acc.push({
          label: String(program.label || program.shortLabel || program.code),
          path: `/teacher/wali-kelas/rapor/program/${slug}`,
          icon: FileBarChart,
        });
        return acc;
      }, []);

      items.push({
        label: 'WALI KELAS',
        path: '/teacher/wali-kelas',
        icon: Users,
        children: [
          { label: 'Rekap Presensi', path: '/teacher/wali-kelas/attendance', icon: UserCheck },
          { label: 'Catatan Perilaku', path: '/teacher/wali-kelas/behavior', icon: AlertCircle },
          { label: 'Persetujuan Izin', path: '/teacher/wali-kelas/permissions', icon: UserCheck },
          ...dynamicHomeroomReportMenus,
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
    const normalizedDuties = duties.map(normalizeDutyCode).filter(Boolean);
    const kakomDuties = normalizedDuties.filter((duty) => duty.includes('KAPROG') || duty.includes('KEPALA_KOMPETENSI'));
    const otherDuties = normalizedDuties.filter((duty) => !duty.includes('KAPROG') && !duty.includes('KEPALA_KOMPETENSI'));

    // Process Non-KAKOM Duties
    let assignedInventoryAttachedToDuty = false;
    otherDuties.forEach((duty) => {
      let label = duty;
      const icon = Briefcase;
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
          { label: 'Program Perangkat Ajar', path: '/teacher/wakasek/teaching-resource-programs', icon: BookOpen },
          { label: 'Kelola Ujian', path: '/teacher/wakasek/exams', icon: FileQuestion },
          { label: 'Leger Nilai Akhir', path: '/teacher/wakasek/final-ledger', icon: Calculator },
          { label: 'Monitoring Kinerja', path: '/teacher/wakasek/performance', icon: BarChart3 },
          { label: 'Laporan Akademik', path: '/teacher/wakasek/reports', icon: FileText },
        );
      } else if (baseRole === 'WAKASEK_KESISWAAN') {
        label = 'WAKASEK KESISWAAN';
        if (isSecretary) label = 'SEKRETARIS KESISWAAN';

        children = [
          ...createGenericItems(duty),
          ...(!isSecretary
            ? [{
                label: 'Persetujuan Program Kerja',
                path: '/teacher/wakasek/work-program-approvals',
                icon: ClipboardList,
              } satisfies MenuItem]
            : []),
          { label: 'Kelola Kesiswaan', path: '/teacher/wakasek/students', icon: GraduationCap },
          { label: 'Pemilihan OSIS', path: '/teacher/wakasek/student-election', icon: Trophy },
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
          { label: 'Mitra Industri', path: '/teacher/humas/partners?tab=partners', icon: Users },
          { label: 'Lowongan BKK', path: '/teacher/humas/partners?tab=bkk', icon: Briefcase },
          { label: 'Akun Pelamar BKK', path: '/teacher/humas/applicants', icon: UserCheck },
          { label: 'Lamaran BKK', path: '/teacher/humas/partners?tab=applications', icon: ClipboardList },
          { label: 'Laporan', path: '/teacher/humas/reports', icon: FileText }
        ];
      } else if (duty === 'KEPALA_LAB') {
        label = 'KEPALA LAB';
        children = [
          ...createGenericItems(duty),
          { label: 'Inventaris Lab', path: '/teacher/head-lab/inventory', icon: Database },
          { label: 'Jadwal Lab', path: '/teacher/head-lab/schedule', icon: Calendar },
          { label: 'Laporan Insiden', path: '/teacher/head-lab/incidents', icon: AlertCircle }
        ];
        if (teacherAssignedInventoryChildren.length > 0) {
          assignedInventoryAttachedToDuty = true;
        }
      } else if (duty === 'KEPALA_PERPUSTAKAAN') {
        label = 'KEPALA PERPUSTAKAAN';
        children = [
          ...createGenericItems(duty),
          { label: 'Kelola Perpustakaan', path: '/teacher/head-library/inventory', icon: Database },
        ];
        if (teacherAssignedInventoryChildren.length > 0) {
          assignedInventoryAttachedToDuty = true;
        }
      } else if (duty === 'BP_BK') {
        label = 'BP/BK';
        children = [
          ...createGenericItems(duty),
          { label: 'Dashboard BP/BK', path: '/teacher/bk', icon: ShieldAlert },
        ];
      } else if (duty === 'PEMBINA_OSIS') {
        label = 'PEMBINA OSIS';
        children = [
          ...createGenericItems(duty),
          { label: 'Struktur & Nilai OSIS', path: '/teacher/osis/management', icon: Users },
          { label: 'Kelola Inventaris', path: teacherOsisInventoryPath, icon: Database },
          { label: 'Pemilihan OSIS', path: '/teacher/osis/election', icon: Trophy },
          ...(hasActiveOsisElection ? [{ label: 'Pemungutan Suara', path: '/teacher/osis/vote', icon: Vote }] : []),
        ];
      } else if (duty === 'IT_CENTER') {
        label = 'IT CENTER';
        children = [
          ...createGenericItems(duty),
          ...(teacherAssignedInventoryChildren.length > 0
            ? [{ label: 'Kelola Inventaris', path: '/teacher/assigned-inventory', icon: Database }]
            : []),
        ];
        if (teacherAssignedInventoryChildren.length > 0) {
          assignedInventoryAttachedToDuty = true;
        }
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

    if (hasActiveOsisElection) {
      items.push({
        label: 'Pemungutan Suara OSIS',
        path: '/teacher/osis/vote',
        icon: Vote,
        });
      }

    if (extracurricularAdvisorMenus.length > 0) {
      items.push(...extracurricularAdvisorMenus);
    }

    items.push({
      label: 'PENGATURAN',
      path: '/teacher/general',
      icon: Settings,
      children: [
        { label: 'Profil', path: '/teacher/profile', icon: UserIcon },
      ]
    });

    if (assignedInventoryMenu && !assignedInventoryAttachedToDuty) {
      items.push(assignedInventoryMenu);
    }

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
    const activeTutorAssignments = getActiveTutorAssignments(tutorAssignments);
    const extracurricularTutorAssignments = getExtracurricularTutorAssignments(activeTutorAssignments);
    const linkedAssignedInventory = linkAssignedInventoryRooms(assignedInventoryRooms, activeTutorAssignments);
    const nonOsisAssignedInventoryRooms = linkedAssignedInventory.detachedRooms;
    const tutorAssignedInventoryChildren: MenuItem[] =
      nonOsisAssignedInventoryRooms.map((room) => ({
        label: room.name,
        path: `/tutor/assigned-inventory/${room.id}`,
        icon: Database,
      })) || [];
    const tutorAdvisorMenus: MenuItem[] = extracurricularTutorAssignments.map((assignment) => {
      const linkedRoom = linkedAssignedInventory.roomByAssignmentId.get(assignment.id) || null;
      const workProgramParams = new URLSearchParams({
        duty: 'PEMBINA_EKSKUL',
        assignmentId: String(assignment.id),
        ekskulId: String(assignment.ekskulId),
        academicYearId: String(assignment.academicYearId),
      });

      return {
        label: buildAdvisorSidebarLabel(assignment?.ekskul?.name),
        path: buildTutorMembersHref(assignment),
        icon: Trophy,
        children: [
          { label: 'Program Kerja', path: `/tutor/work-programs?${workProgramParams.toString()}`, icon: ClipboardList },
          { label: 'Anggota & Nilai', path: buildTutorMembersHref(assignment), icon: Users },
          {
            label: 'Kelola Inventaris',
            path: linkedRoom ? `/tutor/assigned-inventory/${linkedRoom.id}` : '/tutor/inventory',
            icon: Database,
          },
        ],
      };
    });

    return [
      { label: 'Dashboard', path: '/tutor', icon: LayoutDashboard },
      { label: 'Email', path: '/email', icon: Mail },
      ...tutorAdvisorMenus,
      ...(tutorAssignedInventoryChildren.length > 0
        ? [{
            label: 'INVENTARIS TUGAS',
            path: '/tutor/assigned-inventory',
            icon: Database,
            children: tutorAssignedInventoryChildren,
          } satisfies MenuItem]
        : []),
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
    const studentExamPrograms = sortExamPrograms(
      (examPrograms ?? []).filter((program) => program.showOnStudentMenu),
    );
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
            { label: 'Profil', path: '/student/profile', icon: UserIcon },
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
      ...(hasActiveOsisElection ? [{ label: 'Pemilihan OSIS', path: '/student/osis', icon: Trophy }] : []),
      {
        label: 'AKADEMIK',
        path: '/student/academic',
        icon: BookOpen,
        children: [
          { label: 'Jadwal Pelajaran', path: '/student/schedule', icon: Calendar },
          { label: 'Materi & Tugas', path: '/student/learning', icon: ClipboardList },
          { label: 'Riwayat Kehadiran', path: '/student/attendance', icon: UserCheck },
          { label: 'Perizinan', path: '/student/permissions', icon: ClipboardList },
          ...(user.studentClass?.presidentId === user.id ? [{ label: 'Presensi Kelas', path: '/student/class-attendance', icon: ClipboardList }] : [])
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
          ...studentExamPrograms.map((program) => ({
            label: String(program.label || program.code),
            path: `/student/exams/program/${examProgramCodeToSlug(program.code)}`,
            icon: FileQuestion,
          })),
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
          { label: 'Profil', path: '/student/profile', icon: UserIcon },
        ]
      }
    ];
  }

  if (role === 'PRINCIPAL') {
    const items: MenuItem[] = [
      { label: 'Dashboard', path: '/principal', icon: LayoutDashboard },
      { label: 'Email', path: '/email', icon: Mail },
      { label: 'MONITORING', path: '/principal/monitoring/operations', icon: Activity },
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
        label: 'UJIAN',
        path: '/principal/exams',
        icon: ClipboardList,
        children: [{ label: 'Berita Acara Ujian', path: '/principal/exams/reports', icon: FileText }],
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
          { label: 'Pemilihan OSIS', path: '/principal/monitoring/osis', icon: Trophy },
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
      { label: 'Profil', path: '/principal/profile', icon: UserIcon },
    ];

    if ((assignedInventoryRooms?.length || 0) > 0) {
      items.push({
        label: 'INVENTARIS TUGAS',
        path: '/principal/assigned-inventory',
        icon: Database,
        children: assignedInventoryRooms!.map((room) => ({
          label: room.name,
          path: `/principal/assigned-inventory/${room.id}`,
          icon: Database,
        })),
      });
    }

    return items;
  }

  if (role === 'STAFF') {
    const staffDivision = resolveStaffDivision(user);
    const assignedInventoryChildren: MenuItem[] =
      assignedInventoryRooms?.map((room) => ({
        label: room.name,
        path: `/staff/assigned-inventory/${room.id}`,
        icon: Database,
      })) || [];

    if (staffDivision === 'ADMINISTRATION') {
      const items: MenuItem[] = [
        { label: 'Dashboard', path: '/staff', icon: LayoutDashboard },
        { label: 'Email', path: '/email', icon: Mail },
        ...(hasActiveOsisElection ? [{ label: 'Pemungutan Suara OSIS', path: '/staff/osis/vote', icon: Vote }] : []),
        {
          label: 'ADMINISTRASI',
          path: '/staff/administration',
          icon: ClipboardList,
          children: [
            { label: 'Administrasi Siswa', path: '/staff/administration/students', icon: GraduationCap },
            { label: 'Administrasi Guru', path: '/staff/administration/teachers', icon: Users },
            { label: 'Perizinan Siswa', path: '/staff/administration/permissions', icon: FileText },
          ],
        },
        { label: 'Profil', path: '/staff/profile', icon: UserIcon },
      ];

      if (assignedInventoryChildren.length > 0) {
        items.push({
          label: 'INVENTARIS TUGAS',
          path: '/staff/assigned-inventory',
          icon: Database,
          children: assignedInventoryChildren,
        });
      }

      return items;
    }

    if (staffDivision === 'HEAD_TU') {
      const items: MenuItem[] = [
        { label: 'Dashboard', path: '/staff', icon: LayoutDashboard },
        { label: 'Email', path: '/email', icon: Mail },
        ...(hasActiveOsisElection ? [{ label: 'Pemungutan Suara OSIS', path: '/staff/osis/vote', icon: Vote }] : []),
        {
          label: 'MONITORING TU',
          path: '/staff/head-tu',
          icon: FileBarChart,
          children: [
            { label: 'Operasional TU', path: '/staff/head-tu/administration', icon: ClipboardList },
            { label: 'Monitoring Keuangan', path: '/staff/head-tu/finance', icon: Wallet },
          ],
        },
        {
          label: 'LAYANAN TU',
          path: '/staff/head-tu/data',
          icon: Database,
          children: [
            { label: 'Data Siswa', path: '/staff/head-tu/students', icon: GraduationCap },
            { label: 'Data Guru & Staff', path: '/staff/head-tu/teachers', icon: Users },
            { label: 'Perizinan Siswa', path: '/staff/head-tu/permissions', icon: FileText },
            { label: 'Surat-Menyurat', path: '/staff/head-tu/letters', icon: FileText },
            { label: 'Kartu Ujian', path: '/staff/head-tu/exam-cards', icon: ClipboardList },
          ],
        },
        { label: 'Profil', path: '/staff/profile', icon: UserIcon },
      ];

      if (assignedInventoryChildren.length > 0) {
        items.push({
          label: 'INVENTARIS TUGAS',
          path: '/staff/assigned-inventory',
          icon: Database,
          children: assignedInventoryChildren,
        });
      }

      return items;
    }

    const items: MenuItem[] = [
      { label: 'Dashboard', path: '/staff', icon: LayoutDashboard },
      { label: 'Email', path: '/email', icon: Mail },
      ...(hasActiveOsisElection ? [{ label: 'Pemungutan Suara OSIS', path: '/staff/osis/vote', icon: Vote }] : []),
      {
        label: 'KEUANGAN',
        path: '/staff/finance',
        icon: CreditCard,
        children: [
          { label: 'Ringkasan Keuangan', path: '/staff/finance', icon: CreditCard },
          { label: 'Master Biaya', path: '/staff/finance/master', icon: Wallet },
          { label: 'Tagihan Siswa', path: '/staff/finance/tagihan', icon: FileText },
          { label: 'Pembayaran', path: '/staff/finance/pembayaran', icon: CreditCard },
          { label: 'Kas & Bank', path: '/staff/finance/kas-bank', icon: Wallet },
          { label: 'Tutup Buku', path: '/staff/finance/tutup-buku', icon: ClipboardList },
          { label: 'Laporan', path: '/staff/finance/laporan', icon: FileBarChart },
          { label: 'Data Siswa', path: '/staff/finance/students', icon: GraduationCap },
          { label: 'Realisasi Anggaran', path: '/staff/finance/operations', icon: ClipboardList },
        ],
      },
      { label: 'Profil', path: '/staff/profile', icon: UserIcon },
    ];

    if (assignedInventoryChildren.length > 0) {
      items.push({
        label: 'INVENTARIS TUGAS',
        path: '/staff/assigned-inventory',
        icon: Database,
        children: assignedInventoryChildren,
      });
    }

    return items;
  }

  if (role === 'PARENT') {
    return [
      { label: 'Dashboard', path: '/parent', icon: LayoutDashboard },
      { label: 'Data Anak', path: '/parent/children', icon: Users },
      { label: 'Hubungkan Anak', path: '/parent/children?mode=link', icon: UserCheck },
      { label: 'Keuangan', path: '/parent/finance', icon: Wallet },
      { label: 'Absensi Anak', path: '/parent/attendance', icon: UserCheck },
      { label: 'Profil', path: '/parent/profile', icon: UserIcon },
    ];
  }

  if (role === 'CALON_SISWA') {
    return [
      { label: 'Dashboard', path: '/candidate', icon: LayoutDashboard },
      { label: 'Formulir PPDB', path: '/candidate/application', icon: FileText },
      { label: 'Informasi PPDB', path: '/candidate/information', icon: GraduationCap },
      { label: 'Tes Seleksi', path: '/candidate/exams', icon: FileText },
      { label: 'Profil', path: '/candidate/profile', icon: UserIcon },
    ];
  }

  if (role === 'UMUM') {
    return [
      { label: 'Dashboard BKK', path: '/public', icon: LayoutDashboard },
      { label: 'Lowongan BKK', path: '/public/vacancies', icon: Briefcase },
      { label: 'Lamaran Saya', path: '/public/applications', icon: FileText },
      { label: 'Tes BKK', path: '/public/exams', icon: FileQuestion },
      { label: 'Profil Pelamar', path: '/public/profile', icon: UserIcon },
    ];
  }

  return [];
};

export const Sidebar = ({ user }: SidebarProps) => {
  const location = useLocation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) || '');
    if (!Number.isFinite(savedWidth)) return DEFAULT_SIDEBAR_WIDTH;
    return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, savedWidth));
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const { data: examinerInternshipsData } = useQuery({
    queryKey: ['examiner-internships'],
    queryFn: () => internshipService.getExaminerInternships(),
    enabled: user.role === 'TEACHER',
    staleTime: 5 * 60 * 1000, 
  });

  const { data: activeAcademicYearData } = useActiveAcademicYear();

  const examProgramsQuery = useQuery({
    queryKey: ['sidebar-exam-programs', user.role, activeAcademicYearData?.id],
    enabled: (user.role === 'TEACHER' || user.role === 'STUDENT') && Boolean(activeAcademicYearData?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      return examService.getPrograms({
        academicYearId: activeAcademicYearData?.id,
        roleContext: user.role === 'STUDENT' ? 'student' : 'teacher',
      });
    },
  });

  const teachingResourceProgramsQuery = useQuery({
    queryKey: ['sidebar-teaching-resource-programs', user.role, activeAcademicYearData?.id],
    enabled: user.role === 'TEACHER' && Boolean(activeAcademicYearData?.id),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      return teachingResourceProgramService.getPrograms({
        academicYearId: activeAcademicYearData?.id,
        roleContext: 'teacher',
      });
    },
  });

  const hasPendingDefense = (examinerInternshipsData?.data?.data?.length || 0) > 0;
  const pklEligibleGrades = activeAcademicYearData?.pklEligibleGrades;
  const examPrograms = useMemo<ExamProgram[]>(() => {
    const fromApi = examProgramsQuery.data?.data?.programs || [];
    const normalized = fromApi
      .map((program) => {
        const code = normalizeExamProgramCode(program?.code);
        if (!code) return null;
        return {
          ...program,
          code,
        } as ExamProgram;
      })
      .filter((program): program is ExamProgram => Boolean(program));
    return sortExamPrograms(normalized);
  }, [examProgramsQuery.data]);

  const teachingResourcePrograms = useMemo<TeachingResourceProgram[]>(() => {
    const fromApi = teachingResourceProgramsQuery.data?.data?.programs || [];
    const normalized = fromApi
      .map((program) => {
        const code = normalizeTeachingResourceProgramCode(program?.code);
        if (!code) return null;
        return {
          ...program,
          code,
        } as TeachingResourceProgram;
      })
      .filter((program): program is TeachingResourceProgram => Boolean(program));
    return sortTeachingResourcePrograms(normalized);
  }, [teachingResourceProgramsQuery.data]);

  const shouldLoadAssignedInventoryRooms = ['TEACHER', 'STAFF', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR'].includes(
    String(user.role || '').toUpperCase(),
  );
  const shouldLoadTutorAssignments = canAccessTutorWorkspace(user.role);
  const { data: assignedInventoryRoomsData } = useQuery({
    queryKey: [
      'sidebar-assigned-inventory-rooms',
      user.id,
      user.updatedAt ? String(user.updatedAt) : 'no-updated-at',
      Array.isArray(user.additionalDuties) ? user.additionalDuties.join('|') : 'no-duties',
      Array.isArray(user.ekskulTutorAssignments)
        ? user.ekskulTutorAssignments
            .map((assignment) => `${assignment.id}:${assignment.isActive ? '1' : '0'}`)
            .join('|')
        : 'no-tutor-assignments',
    ],
    enabled: shouldLoadAssignedInventoryRooms,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => inventoryService.getAssignedRooms(),
  });
  const { data: tutorAssignmentsData } = useQuery({
    queryKey: ['sidebar-tutor-assignments', user.id, activeAcademicYearData?.id],
    enabled: shouldLoadTutorAssignments,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => tutorService.getAssignments(activeAcademicYearData?.id),
  });
  const shouldLoadActiveOsisElection = ['TEACHER', 'STUDENT', 'STAFF'].includes(
    String(user.role || '').toUpperCase(),
  );
  const { data: activeOsisElectionData } = useQuery({
    queryKey: ['sidebar-active-osis-election', user.id, user.role],
    enabled: shouldLoadActiveOsisElection,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => osisService.getActiveElection(),
  });

  const assignedInventoryRooms = useMemo<Room[]>(() => {
    return Array.isArray(assignedInventoryRoomsData?.data) ? (assignedInventoryRoomsData?.data as Room[]) : [];
  }, [assignedInventoryRoomsData?.data]);

  const tutorAssignments = useMemo<TutorAssignmentSummary[]>(
    () => {
      const fromQuery = Array.isArray(tutorAssignmentsData?.data)
        ? (tutorAssignmentsData.data as TutorAssignmentSummary[])
        : [];
      const fromProfile = Array.isArray(user.ekskulTutorAssignments)
        ? (user.ekskulTutorAssignments as TutorAssignmentSummary[])
        : [];

      return mergeTutorAssignments(fromQuery, fromProfile);
    },
    [tutorAssignmentsData, user.ekskulTutorAssignments],
  );
  const hasActiveOsisElection = Boolean(activeOsisElectionData?.data);

  const items = useMemo(
    () =>
      getMenuItems(
        user,
        hasPendingDefense,
        pklEligibleGrades,
        examPrograms,
        teachingResourcePrograms,
        assignedInventoryRooms,
        tutorAssignments,
        hasActiveOsisElection,
      ),
    [
      user,
      hasPendingDefense,
      pklEligibleGrades,
      examPrograms,
      teachingResourcePrograms,
      assignedInventoryRooms,
      tutorAssignments,
      hasActiveOsisElection,
    ],
  );
  const getMenuPathMatchScore = useCallback((itemPath: string) => {
    if (ROOT_MENU_PATHS.includes(itemPath as (typeof ROOT_MENU_PATHS)[number])) {
      return location.pathname === itemPath ? itemPath.length : -1;
    }

    if (itemPath.includes('?')) {
      const [pathOnly, qs] = itemPath.split('?');
      const required = new URLSearchParams(qs);
      const current = new URLSearchParams(location.search);
      if (!location.pathname.startsWith(pathOnly)) return -1;
      const isInventoryScopePath =
        pathOnly.includes('/teacher/head-library/inventory') ||
        pathOnly.includes('/teacher/head-lab/inventory');
      if (isInventoryScopePath && !location.search) {
        return pathOnly.length;
      }
      for (const [k, v] of required.entries()) {
        if (current.get(k) !== v) return -1;
      }
      return pathOnly.length + required.toString().length + 1_000;
    }

    const cleanChildPath = itemPath.split('?')[0];
    if (location.pathname === cleanChildPath) return cleanChildPath.length;
    if (location.pathname.startsWith(`${cleanChildPath}/`)) return cleanChildPath.length;
    return -1;
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isResizingSidebar || typeof window === 'undefined') return;

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, event.clientX));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--dashboard-sidebar-offset', `${sidebarWidth}px`);

    return () => {
      document.documentElement.style.setProperty('--dashboard-sidebar-offset', `${DEFAULT_SIDEBAR_WIDTH}px`);
    };
  }, [sidebarWidth]);

  const isPathActive = useCallback((itemPath: string) => getMenuPathMatchScore(itemPath) >= 0, [getMenuPathMatchScore]);

  const getMostSpecificChildPath = useCallback((children?: MenuItem[]) => {
    if (!children?.length) return null;
    let matchedPath: string | null = null;
    let bestScore = -1;
    children.forEach((child) => {
      const score = getMenuPathMatchScore(child.path);
      if (score > bestScore) {
        bestScore = score;
        matchedPath = child.path;
      }
    });
    return matchedPath;
  }, [getMenuPathMatchScore]);

  const activeParentPath = useMemo(() => {
    const activeParent = items.find((item) => {
      if (getMostSpecificChildPath(item.children)) {
        return true;
      }
      // Special handling for Exam creation page which isn't explicitly in the menu but belongs to UJIAN
      if (item.label === 'UJIAN' && (location.pathname.includes('/teacher/exams/') || location.pathname.includes('/examiner/exams/'))) {
        return true;
      }
      return false;
    });
    return activeParent ? activeParent.path : null;
  }, [getMostSpecificChildPath, items, location.pathname]);

  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Defensive reset: avoid stale/legacy sidebar group state blocking interactions after login.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOpenGroup(null);
  }, [user.id, user.role]);

  // Keep current route group expanded on first render / route changes,
  // but allow user to switch groups manually afterwards.
  useEffect(() => {
    setOpenGroup((previous) => {
      if (previous && items.some((item) => item.path === previous)) {
        return previous;
      }
      return activeParentPath;
    });
  }, [activeParentPath, items]);
  /* eslint-enable react-hooks/set-state-in-effect */
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

  const effectiveOpenGroup = useMemo(() => openGroup, [openGroup]);

  const toggleGroup = (path: string) => {
    const newState = openGroup === path ? null : path;
    setOpenGroup(newState);
    
    // Persist to database - TEMPORARILY DISABLED to prevent logout issues
    // updatePreferencesMutation.mutate({ sidebarOpenGroup: newState });
  };

  return (
    <aside
      className="dashboard-sidebar-surface relative z-[80] hidden h-full shrink-0 bg-white shadow-xl pointer-events-auto md:flex md:flex-col"
      style={{ width: `${sidebarWidth}px` }}
    >
      <div className="border-b border-gray-100 px-6 py-6">
        <div className="mx-auto flex w-fit max-w-full items-center justify-center gap-3">
          <img src="/logo_sis_kgb2.png" alt="Logo" className="w-9 h-9 shrink-0 object-contain" />
          <div className="min-w-0 text-left">
            <h1 className="text-sm font-semibold text-blue-700 leading-tight whitespace-nowrap truncate">
              Sistem Integrasi Sekolah
            </h1>
            <p className="mt-0.5 text-[11px] font-medium text-gray-500 whitespace-nowrap truncate">
              SMKS Karya Guna Bhakti 2
            </p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const activeChildPath = hasChildren ? getMostSpecificChildPath(item.children) : null;
            const isChildActive = Boolean(activeChildPath);
            const isActive = isPathActive(item.path) || isChildActive;
            const isOpen = effectiveOpenGroup === item.path;

            if (hasChildren) {
              return (
                <li key={item.path}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.path)}
                    className={clsx(
                      'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-left',
                      isOpen ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
                      <Icon size={18} className={clsx(isOpen ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600')} />
                      <span className="block min-w-0 flex-1 break-words text-left text-sm font-medium leading-5">{item.label}</span>
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
                        const isChildItemActive = activeChildPath === child.path;
                        return (
                          <li key={child.path}>
                            <Link
                              to={child.path}
                              className={clsx(
                                'flex items-start gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm text-left',
                                isChildItemActive 
                                  ? 'text-blue-600 font-medium bg-blue-50' 
                                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                              )}
                            >
                              <ChildIcon size={16} className={clsx(isChildItemActive ? 'text-blue-600' : 'text-gray-400')} />
                              <span className="block min-w-0 flex-1 break-words text-left leading-5">{child.label}</span>
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
                    'flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-left',
                    isActive 
                      ? 'bg-blue-50 text-blue-600 font-medium' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-blue-600'
                  )}
                  onClick={() => setOpenGroup(null)} // Close accordion when clicking single item
                >
                  <Icon size={18} className={clsx(isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600')} />
                  <span className="block min-w-0 flex-1 break-words text-left text-sm leading-5">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        aria-label="Ubah lebar sidebar"
        title="Tarik untuk mengubah lebar sidebar"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizingSidebar(true);
        }}
        className={clsx(
          'group absolute inset-y-0 right-0 hidden w-5 translate-x-1/2 md:block',
          isResizingSidebar ? 'bg-blue-100/70' : 'bg-transparent'
        )}
        style={{ cursor: 'ew-resize' }}
      >
        <span
          className={clsx(
            'pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 rounded-full transition-colors',
            isResizingSidebar ? 'bg-blue-500' : 'bg-gray-200 group-hover:bg-blue-300'
          )}
        />
      </button>

      <div className="m-4 rounded-2xl bg-gray-50 p-5">
        <div className="mx-auto mb-4 flex w-fit max-w-full items-center justify-center gap-3">
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
          <div className="min-w-0 text-left">
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
