import { Outlet, Navigate, useLocation, Link } from 'react-router-dom';
import { Sidebar, getMenuItems, type MenuItem } from '../components/layout/Sidebar';
import { Menu, ChevronRight, Home } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { NotificationDropdown } from '../components/layout/NotificationDropdown';
import { HeaderThemeModeToggle } from '../components/theme/HeaderThemeModeToggle';
import clsx from 'clsx';
import { useActiveAcademicYear } from '../hooks/useActiveAcademicYear';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { examProgramCodeToSlug, examService, type ExamProgram } from '../services/exam.service';
import type { ApiResponse } from '../types/api.types';
import type { User } from '../types/auth';

const titleCaseFromSlug = (slug: string): string => {
  const cleaned = String(slug || '').trim().replace(/-/g, ' ');
  if (!cleaned) return 'Program Ujian';
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const normalizeProgramCodeKey = (raw: unknown): string => {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

type SidebarCrumbConfig = {
  label: string;
  group?: string;
};

type BreadcrumbProgramLookup = {
  examProgramLabelBySlug: Record<string, string>;
  examProgramLabelByCode: Record<string, string>;
  homeroomProgramLabelBySlug: Record<string, string>;
};

const getSidebarRoleCode = (roleSegment: string): User['role'] | null => {
  const map: Record<string, User['role']> = {
    admin: 'ADMIN',
    teacher: 'TEACHER',
    examiner: 'EXAMINER',
    tutor: 'EXTRACURRICULAR_TUTOR',
    student: 'STUDENT',
    principal: 'PRINCIPAL',
    staff: 'STAFF',
    parent: 'PARENT',
    candidate: 'CALON_SISWA',
    public: 'UMUM',
  };
  return map[roleSegment] || null;
};

const buildSidebarCrumbLookup = (roleSegment: string, user: User | null): Record<string, SidebarCrumbConfig> => {
  const roleCode = getSidebarRoleCode(roleSegment);
  if (!roleCode || !user) return {};
  const menuItems = getMenuItems({ ...user, role: roleCode });
  const prefix = `/${roleSegment}/`;
  const lookup: Record<string, SidebarCrumbConfig> = {};

  const walk = (item: MenuItem, parentGroup?: string) => {
    const rawPath = String(item?.path || '');
    if (rawPath.startsWith(prefix)) {
      const key = rawPath.slice(prefix.length).split('?')[0];
      if (key && !lookup[key]) {
        lookup[key] = { label: String(item.label || key), group: parentGroup };
      }
    }
    if (Array.isArray(item?.children) && item.children.length > 0) {
      item.children.forEach((child: MenuItem) => walk(child, String(item.label || parentGroup || '')));
    }
  };

  menuItems.forEach((item) => walk(item, undefined));
  return lookup;
};

const normalizeDutyCode = (raw: unknown): string => {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
};

const resolveTeacherCommitteeBreadcrumbGroup = (user: User | null): string => {
  const duties = Array.isArray(user?.additionalDuties) ? user.additionalDuties.map(normalizeDutyCode) : [];
  if (duties.includes('WAKASEK_KURIKULUM')) return 'WAKASEK KURIKULUM';
  if (duties.includes('WAKASEK_KESISWAAN')) return 'WAKASEK KESISWAAN';
  if (duties.includes('WAKASEK_SARPRAS')) return 'WAKASEK SARPRAS';
  if (duties.includes('WAKASEK_HUMAS')) return 'WAKASEK HUMAS';
  return 'UJIAN';
};

// Helper untuk breadcrumbs map
  const getBreadcrumbs = (
    location: { pathname: string; search: string; state?: unknown }, 
    user: User | null,
    programLookup?: BreadcrumbProgramLookup,
  ) => {
    const { pathname } = location;
    const state =
      location.state && typeof location.state === 'object'
        ? (location.state as { type?: string; programCode?: string; programLabel?: string; exam?: unknown })
        : null;
    const paths = pathname.split('/').filter(Boolean);
    if (paths.length === 0) return [];

  const role = paths[0];
  const segments = paths.slice(1);
  const breadcrumbs: { label: string; path: string | null }[] = [];
  const sidebarLookup = buildSidebarCrumbLookup(role, user);
  const queryParams = new URLSearchParams(location.search);

  // Hard guard: BP/BK breadcrumbs must always follow active tab route
  if (role === 'teacher' && segments[0] === 'bk') {
    const sectionFromPath = String(segments[1] || '').toLowerCase();
    const sectionFromQuery = String(queryParams.get('tab') || '').toLowerCase();
    const bkSection = sectionFromPath || sectionFromQuery;
    const bkLabelMap: Record<string, string> = {
      behaviors: 'Kasus Perilaku',
      permissions: 'Perizinan Siswa',
      counselings: 'Konseling & Tindak Lanjut',
    };

    breadcrumbs.push({ label: 'BP/BK', path: null });
    breadcrumbs.push({ label: 'Dashboard BP/BK', path: '/teacher/bk' });
    if (bkLabelMap[bkSection]) {
      breadcrumbs.push({ label: bkLabelMap[bkSection], path: null });
    }
    return breadcrumbs;
  }

  if (segments.length === 0) {
    if (role === 'email' || pathname === '/email') {
      return [{ label: 'Email', path: '/email' }];
    }
      return [{ label: 'Dashboard', path: `/${role}` }];
    }

    // Helper to get duty name
    const getDutyName = (dutyCode: string) => {
      const dutyNames: Record<string, string> = {
        'WAKASEK_KURIKULUM': 'WAKASEK KURIKULUM',
        'WAKASEK_KESISWAAN': 'WAKASEK KESISWAAN',
        'WAKASEK_SARPRAS': 'WAKASEK SARPRAS',
        'WAKASEK_HUMAS': 'WAKASEK HUMAS',
        'KAPROG': 'KAKOM', // Will be enhanced with major
        'HEAD_PROGRAM': 'KAKOM',
        'KEPALA_LAB': 'KEPALA LAB',
        'HEAD_LAB': 'KEPALA LAB',
        'PEMBINA_OSIS': 'PEMBINA OSIS',
        'PEMBINA_EKSKUL': 'PEMBINA EKSKUL',
        'KOORDINATOR_PKL': 'KOORDINATOR PKL',
        'KOORDINATOR_BKK': 'KOORDINATOR BKK',
        'BENDAHARA_SEKOLAH': 'BENDAHARA SEKOLAH',
        'OPERATOR_DAPODIK': 'OPERATOR DAPODIK',
        'TEKNISI_LAB': 'TEKNISI LAB',
        'PUSTAKAWAN': 'PUSTAKAWAN',
        'TUGAS_TAMBAHAN': 'TUGAS TAMBAHAN'
      };
      
      let name = dutyNames[dutyCode] || dutyCode.replace(/_/g, ' ').toUpperCase();
      
      // Enhance KAPROG with Major Name if available
      const managedMajors = user?.managedMajors || [];
      if (
        (dutyCode === 'KAPROG' || dutyCode === 'HEAD_PROGRAM' || dutyCode === 'TUGAS_TAMBAHAN') &&
        managedMajors.length > 0
      ) {
        const majorCodes = managedMajors.map((m) => m.code).join(' & ');
        name = `KAKOM ${majorCodes}`;
      }
      
      return name;
    };

    const buildAdvisorBreadcrumbLabel = (name: unknown) => {
      const normalized = String(name || '').trim().toUpperCase();
      return normalized ? `PEMBINA ${normalized}` : 'PEMBINA EKSKUL';
    };

    const resolveAdvisorBreadcrumbGroup = () => {
      const assignmentId = Number(queryParams.get('assignmentId') || 0);
      const ekskulId = Number(queryParams.get('ekskulId') || 0);
      const assignments = Array.isArray(user?.ekskulTutorAssignments) ? user.ekskulTutorAssignments : [];
      const matchedAssignment = assignments.find((assignment) => {
        if (!assignment || assignment.isActive === false) return false;
        if (assignmentId > 0 && Number(assignment.id) === assignmentId) return true;
        if (ekskulId > 0 && Number(assignment.ekskulId) === ekskulId) return true;
        return false;
      });

      if (!matchedAssignment?.ekskul) return null;
      if (String(matchedAssignment.ekskul.category || '').toUpperCase() === 'OSIS') {
        return 'PEMBINA OSIS';
      }
      return buildAdvisorBreadcrumbLabel(matchedAssignment.ekskul.name);
    };

    const advisorBreadcrumbGroup = resolveAdvisorBreadcrumbGroup();

  if (role === 'admin') {
    const mapping: Record<
      string,
      {
        label: string;
        group?: string;
      }
    > = {
      'academic-years': { label: 'Tahun Ajaran', group: 'MASTER DATA' },
      majors: { label: 'Kompetensi Keahlian', group: 'MASTER DATA' },
      subjects: { label: 'Mata Pelajaran', group: 'MASTER DATA' },
      classes: { label: 'Kelas', group: 'MASTER DATA' },
      'training-classes': { label: 'Kelas Training', group: 'MASTER DATA' },
      extracurriculars: { label: 'Ekstrakurikuler', group: 'MASTER DATA' },

      'admin-users': { label: 'Kelola Admin', group: 'USER MANAGEMENT' },
      'principal-users': { label: 'Kelola Kepsek', group: 'USER MANAGEMENT' },
      'staff-users': { label: 'Kelola Staff', group: 'USER MANAGEMENT' },
      'examiner-users': { label: 'Kelola Penguji', group: 'USER MANAGEMENT' },
      'tutor-users': { label: 'Kelola Tutor Eksternal', group: 'USER MANAGEMENT' },
      'parent-users': { label: 'Kelola Orang Tua', group: 'USER MANAGEMENT' },
      teachers: { label: 'Kelola Guru', group: 'USER MANAGEMENT' },
      students: { label: 'Kelola Siswa', group: 'USER MANAGEMENT' },
      'user-verification': { label: 'Verifikasi Akun', group: 'USER MANAGEMENT' },
      'candidate-admissions': { label: 'PPDB Calon Siswa', group: 'USER MANAGEMENT' },
      'teacher-assignments': { label: 'Assignment Guru', group: 'USER MANAGEMENT' },
      'import-export': { label: 'Export/Import', group: 'USER MANAGEMENT' },

      'academic-calendar': { label: 'Kalender Akademik', group: 'AKADEMIK' },
      schedule: { label: 'Jadwal Pelajaran', group: 'AKADEMIK' },
      'teaching-load': { label: 'Rekap Jam Mengajar', group: 'AKADEMIK' },
      kkm: { label: 'Data KKM', group: 'AKADEMIK' },
      attendance: { label: 'Rekap Absensi', group: 'AKADEMIK' },
      'report-cards': { label: 'Laporan / Rapor', group: 'AKADEMIK' },

      'question-bank': { label: 'Bank Soal', group: 'UJIAN & CBT' },
      'exam-sessions': { label: 'Sesi Ujian', group: 'UJIAN & CBT' },

      settings: { label: 'Pengaturan', group: 'PENGATURAN' },
      'settings/server-area': { label: 'Area Server', group: 'PENGATURAN' },
      'settings/slideshow': { label: 'Slideshow', group: 'PENGATURAN' },
      'settings/profile': { label: 'Profil Sekolah', group: 'PENGATURAN' },
      'settings/password': { label: 'Ubah Password', group: 'PENGATURAN' },
    };

    const fullKey = segments.join('/');
    const first = segments[0];
    // Check for 2-level depth match (e.g. exams/edit)
    const second = segments.length > 1 ? `${first}/${segments[1]}` : null;
    const sidebarMatchKey = [fullKey, second, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    const config =
      (sidebarConfig
        ? {
            label: sidebarConfig.label,
            group: sidebarConfig.group || undefined,
          }
        : null) ||
      mapping[fullKey] ||
      (second && mapping[second]) ||
      mapping[first];

    if (config?.group) {
      breadcrumbs.push({ label: config.group, path: null });
    }

    if (config) {
      let shouldAddParent = true;

      // Special handling for Teacher Exams
      if (first === 'exams') {
         if (segments[1] && !['program', 'bank', 'create', 'edit'].includes(segments[1])) {
             const legacySlug = String(segments[1] || '').trim();
             const legacyLookupLabel = programLookup?.examProgramLabelBySlug?.[legacySlug];
             if (legacyLookupLabel) {
                 breadcrumbs.push({ label: legacyLookupLabel, path: `/${role}/exams/program/${legacySlug}` });
                 return breadcrumbs;
             }
         }
         if (segments[1] === 'program' && segments[2]) {
             const slug = String(segments[2] || '').trim();
             const lookupLabel = programLookup?.examProgramLabelBySlug?.[slug];
             const typeLabel =
               String(lookupLabel || state?.programLabel || state?.programCode || '').trim() || titleCaseFromSlug(slug);
             breadcrumbs.push({ label: typeLabel, path: `/${role}/exams/program/${slug}` });
             return breadcrumbs;
         }
         if (state?.type || state?.programCode) {
             const type = String(state?.type || '').toUpperCase();
             const normalizedProgramCode = String(state?.programCode || '').trim();
             const programSlug = normalizedProgramCode ? examProgramCodeToSlug(normalizedProgramCode) : '';
             const lookupLabel = programLookup?.examProgramLabelByCode?.[normalizeProgramCodeKey(normalizedProgramCode)];
             let typeLabel = state?.programLabel || lookupLabel || normalizedProgramCode || type || 'Ujian';
             let typePath = programSlug ? `/teacher/exams/program/${programSlug}` : '/teacher/exams';

             if (type === 'BANK_SOAL') {
                 typeLabel = 'Bank Soal';
                 typePath = '/teacher/exams/bank';
             }

             breadcrumbs.push({ label: typeLabel, path: typePath });
             shouldAddParent = false; 
         } else {
             const isSubtypeList = ['program', 'bank'].some(t => fullKey.includes(t));
             if (isSubtypeList) {
                 shouldAddParent = false;
             }
         }
      }

      // Check for parent category (e.g. exams -> exams/create)
      const parentLabelMatchesGroup =
        mapping[first] &&
        String(mapping[first].label || '').toUpperCase() === String(config.group || '').toUpperCase();
      if (
        shouldAddParent &&
        first !== fullKey &&
        mapping[first] &&
        mapping[first].group === config.group &&
        !parentLabelMatchesGroup
      ) {
          // Avoid duplicating if the config IS the first segment
          // Also skip parent for create/edit exam pages to avoid "Ujian > Buat Ujian" redundancy if type is missing
          const isExamAction = fullKey === 'exams/create' || fullKey === 'exams/edit';
          
          if (mapping[first] !== config && !isExamAction) {
              breadcrumbs.push({ label: mapping[first].label, path: `/${role}/${first}` });
          }
      }

      // Determine the path for the config
      let path = first;
      if (sidebarMatchKey) path = sidebarMatchKey;
      else if (mapping[fullKey]) path = fullKey;
      else if (second && mapping[second] === config) path = second;

      breadcrumbs.push({ label: config.label, path: `/${role}/${path}` });

      if (fullKey === 'settings/server-area') {
        const activeTab = String(queryParams.get('tab') || 'info').toLowerCase();
        const serverTabLabels: Record<string, string> = {
          info: 'Info Server',
          storage: 'Manajemen Storage',
          monitoring: 'Monitoring Server',
          online: 'User Online',
          webmail: 'Webmail',
        };

        if (serverTabLabels[activeTab]) {
          breadcrumbs.push({ label: serverTabLabels[activeTab], path: null });
        }
      }
    } else {
      const label =
        first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }

    return breadcrumbs;
  }

  if (role === 'teacher') {
    const teacherCommitteeGroup = resolveTeacherCommitteeBreadcrumbGroup(user);
    const mapping: Record<
      string,
      {
        label: string;
        group?: string;
      }
    > = {
      // AKADEMIK
      schedule: { label: 'Jadwal Mengajar', group: 'AKADEMIK' },
      classes: { label: 'Kelas & Mapel', group: 'AKADEMIK' },
      attendance: { label: 'Presensi Siswa', group: 'AKADEMIK' },
      materials: { label: 'Materi & Tugas', group: 'AKADEMIK' },
      grades: { label: 'Input Nilai', group: 'AKADEMIK' },
      'report-subjects': { label: 'Rapor Mapel', group: 'AKADEMIK' },
      bk: { label: 'Dashboard BP/BK', group: 'BP/BK' },
      'bk/behaviors': { label: 'Kasus Perilaku', group: 'BP/BK' },
      'bk/permissions': { label: 'Perizinan Siswa', group: 'BP/BK' },
      'bk/counselings': { label: 'Konseling & Tindak Lanjut', group: 'BP/BK' },

      // PKL
      internship: { label: 'PKL (PRAKERIN)', group: 'PKL (PRAKERIN)' },
      'internship/approval': { label: 'Persetujuan PKL', group: 'WAKASEK HUMAS' },
      'internship/defense': { label: 'Nilai Sidang PKL', group: 'SIDANG PKL' },

      // PERANGKAT AJAR
      'learning-resources': { label: 'PERANGKAT AJAR' },
      'learning-resources/cp': { label: 'Capaian Pembelajaran (CP)', group: 'PERANGKAT AJAR' },
      'learning-resources/atp': { label: 'Alur Tujuan Pembelajaran (ATP)', group: 'PERANGKAT AJAR' },
      'learning-resources/prota': { label: 'Program Tahunan', group: 'PERANGKAT AJAR' },
      'learning-resources/promes': { label: 'Program Semester', group: 'PERANGKAT AJAR' },
      'learning-resources/alokasi-waktu': { label: 'Alokasi Waktu', group: 'PERANGKAT AJAR' },
      'learning-resources/modules': { label: 'Modul Ajar', group: 'PERANGKAT AJAR' },
      'learning-resources/modul-ajar': { label: 'Modul Ajar', group: 'PERANGKAT AJAR' },
      'learning-resources/kktp': { label: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)', group: 'PERANGKAT AJAR' },
      'learning-resources/matriks-sebaran': { label: 'Matriks Sebaran', group: 'PERANGKAT AJAR' },
      'learning-resources/review-submissions': { label: 'Pengajuan Review', group: 'PERANGKAT AJAR' },

      // UJIAN
      'exams': { label: 'UJIAN', group: 'UJIAN' },
      'exams-group': { label: 'UJIAN', group: 'UJIAN' },
      'proctoring': { label: 'Jadwal Mengawas', group: 'UJIAN' },
      'exams/formatif': { label: 'Formatif (Quiz)', group: 'UJIAN' },
      'exams/sbts': { label: 'Program Ujian', group: 'UJIAN' },
      'exams/sas-sat': { label: 'Program Ujian', group: 'UJIAN' },
      'exams/program': { label: 'Program Ujian', group: 'UJIAN' },
      'exams/bank': { label: 'Bank Soal', group: 'UJIAN' },
      'exams/create': { label: 'Buat Ujian Baru', group: 'UJIAN' },
      'exams/edit': { label: 'Edit Ujian', group: 'UJIAN' },

      // WALI KELAS
      'wali-kelas': { label: 'WALI KELAS' },
      'wali-kelas/students': { label: 'Siswa Binaan', group: 'WALI KELAS' },
      'wali-kelas/attendance': { label: 'Rekap Presensi', group: 'WALI KELAS' },
      'wali-kelas/behavior': { label: 'Catatan Perilaku', group: 'WALI KELAS' },
      'wali-kelas/permissions': { label: 'Persetujuan Izin', group: 'WALI KELAS' },
      'wali-kelas/rapor-sbts': { label: 'Rapor Wali Kelas', group: 'WALI KELAS' },
      'wali-kelas/rapor-sas': { label: 'Rapor Wali Kelas', group: 'WALI KELAS' },
      'wali-kelas/rapor-sat': { label: 'Rapor Wali Kelas', group: 'WALI KELAS' },
      'wali-kelas/rapor/program': { label: 'Program Ujian', group: 'WALI KELAS' },

      // KELAS TRAINING
      training: { label: 'KELAS TRAINING', group: 'KELAS TRAINING' },
      'training/classes': { label: 'Daftar Kelas', group: 'KELAS TRAINING' },
      'training/attendance': { label: 'Presensi Training', group: 'KELAS TRAINING' },
      'training/grades': { label: 'Nilai Training', group: 'KELAS TRAINING' },
      'training/materials': { label: 'Materi & Tugas', group: 'KELAS TRAINING' },
      'training/reports': { label: 'Laporan Training', group: 'KELAS TRAINING' },

      // WAKASEK KURIKULUM
      'wakasek/curriculum': { label: 'Kelola Kurikulum', group: 'WAKASEK KURIKULUM' },
      'wakasek/teaching-resource-programs': { label: 'Program Perangkat Ajar', group: 'WAKASEK KURIKULUM' },
      'wakasek/final-ledger': { label: 'Leger Nilai Akhir', group: 'WAKASEK KURIKULUM' },
      'wakasek/consolidation': { label: 'Leger Nilai Akhir', group: 'WAKASEK KURIKULUM' },
      'wakasek/exams': { label: 'Kelola Ujian', group: 'WAKASEK KURIKULUM' },
      'wakasek/students': { label: 'Kelola Kesiswaan', group: 'WAKASEK KESISWAAN' },
      'wakasek/exam-schedules': { label: 'Kelola Jadwal Ujian', group: 'WAKASEK KURIKULUM' },
      'wakasek/exam-rooms': { label: 'Kelola Ruang Ujian', group: 'WAKASEK KURIKULUM' },
      'wakasek/proctor-schedule': { label: 'Kelola Jadwal Mengawas', group: 'WAKASEK KURIKULUM' },
      'wakasek/performance': { label: 'Monitoring Kinerja', group: 'WAKASEK KURIKULUM' },
      'wakasek/work-program-approvals': { label: 'Persetujuan Program Kerja', group: 'WAKASEK KURIKULUM' },
      'wakasek/reports': { label: 'Laporan Akademik', group: 'WAKASEK KURIKULUM' },
      committees: { label: 'Kepanitiaan', group: teacherCommitteeGroup },
      
      // WAKASEK KESISWAAN
      'wakasek/student-performance': { label: 'Monitoring Kinerja', group: 'WAKASEK KESISWAAN' },
      'wakasek/student-approvals': { label: 'Persetujuan', group: 'WAKASEK KESISWAAN' },
      'wakasek/student-reports': { label: 'Laporan Kesiswaan', group: 'WAKASEK KESISWAAN' },

      // WAKASEK SARPRAS
      'sarpras/inventory': { label: 'Aset Sekolah', group: 'WAKASEK SARPRAS' },
      'assigned-inventory': { label: 'Inventaris Tugas', group: 'TUGAS INVENTARIS' },
      'sarpras/budgets': { label: 'Persetujuan Anggaran', group: 'WAKASEK SARPRAS' },
      'sarpras/reports': { label: 'Laporan', group: 'WAKASEK SARPRAS' },

      // PEMBINA OSIS
      'osis/management': { label: 'Struktur & Nilai OSIS', group: 'PEMBINA OSIS' },
      'osis/inventory': { label: 'Kelola Inventaris OSIS', group: 'PEMBINA OSIS' },
      'osis/election': { label: 'Pemilihan OSIS', group: 'PEMBINA OSIS' },
      'osis/vote': { label: 'Pemungutan Suara', group: 'PEMBINA OSIS' },

      // WAKASEK HUMAS
      'humas/partners': { label: 'Mitra Industri', group: 'WAKASEK HUMAS' },
      'humas/reports': { label: 'Laporan', group: 'WAKASEK HUMAS' },

      // KEPALA LAB
      'head-lab/inventory': { label: 'Inventaris Lab', group: 'KEPALA LAB' },
      'head-lab/schedule': { label: 'Jadwal Lab', group: 'KEPALA LAB' },
      'head-lab/incidents': { label: 'Laporan Insiden', group: 'KEPALA LAB' },

      // KEPALA PERPUSTAKAAN
      'head-library/inventory': { label: 'Kelola Perpustakaan', group: 'KEPALA PERPUSTAKAAN' },
      
      // KAKOM / HEAD PROGRAM
      'head-program': { label: 'Kelas Kompetensi', group: 'TUGAS TAMBAHAN' }, // Base
      'head-program/classes': { label: 'Kelas Kompetensi', group: 'TUGAS TAMBAHAN' },
      'head-program/pkl': { label: 'Monitoring PKL', group: 'TUGAS TAMBAHAN' },
      'head-program/partners': { label: 'Mitra Industri & BKK', group: 'TUGAS TAMBAHAN' },

      // UMUM
      public: { label: 'Dashboard BKK', group: 'UMUM' },
      'public/dashboard': { label: 'Dashboard BKK', group: 'UMUM' },
      'public/vacancies': { label: 'Lowongan BKK', group: 'UMUM' },
      'public/applications': { label: 'Lamaran Saya', group: 'UMUM' },
      'public/profile': { label: 'Profil Pelamar', group: 'UMUM' },
      'work-programs': { label: 'Program Kerja', group: 'UMUM' },
      communication: { label: 'Komunikasi', group: 'UMUM' },
      profile: { label: 'Profil', group: 'PENGATURAN' },
      general: { label: 'Pengaturan', group: 'PENGATURAN' },
    };

    const fullKey = segments.join('/');
    const first = segments[0];
    
    // Check for 2-level depth match (e.g. exams/edit)
    const second = segments.length > 1 ? `${first}/${segments[1]}` : null;
    const sidebarMatchKey = [fullKey, second, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    const mappedConfigKey =
      (mapping[fullKey] && fullKey) ||
      ((second && mapping[second]) ? second : null) ||
      (mapping[first] ? first : null);
    const mappedConfig = mappedConfigKey ? mapping[mappedConfigKey] : null;
    let config =
      mappedConfig ||
      (sidebarConfig
        ? {
            label: sidebarConfig.label,
            group: sidebarConfig.group || undefined,
          }
        : null);

    // Dynamic Group Override for Work Programs & Duties
    const dutyParam = queryParams.get('duty');
    
    // Check if current route is under a duty context or generic duty group
    let dutyCode = dutyParam;
    let isDutyContext = !!dutyParam;

    // Infer duty context from config group if not explicit in URL
    if (!isDutyContext && config?.group) {
        if (config.group === 'WAKASEK KURIKULUM') dutyCode = 'WAKASEK_KURIKULUM';
        else if (config.group === 'WAKASEK KESISWAAN') dutyCode = 'WAKASEK_KESISWAAN';
        else if (config.group === 'WAKASEK SARPRAS') dutyCode = 'WAKASEK_SARPRAS';
        else if (config.group === 'WAKASEK HUMAS') dutyCode = 'WAKASEK_HUMAS';
        else if (config.group === 'TUGAS TAMBAHAN') {
             const managedMajors = user?.managedMajors || [];
             const additionalDuties = user?.additionalDuties || [];
             // Try to infer KAPROG or other duties
             if (managedMajors.length > 0) dutyCode = 'KAPROG';
             // If user has other duties that map to TUGAS TAMBAHAN, use the first one
             else if (additionalDuties.length > 0) {
                 // Prioritize non-wakasek duties for TUGAS TAMBAHAN group
                 const otherDuty = additionalDuties.find((d: string) => !d.startsWith('WAKASEK'));
                 if (otherDuty) dutyCode = otherDuty;
             }
        }
        
        if (dutyCode) isDutyContext = true;
    }

    if (isDutyContext && dutyCode && config) {
        const resolvedName = getDutyName(dutyCode);
        
        if (resolvedName !== 'UNKNOWN') {
           config = { ...config, group: resolvedName };
        }
    }

    if (config?.group === 'PEMBINA EKSKUL' && advisorBreadcrumbGroup) {
      config = { ...config, group: advisorBreadcrumbGroup };
    }
    
    // Final safety check for KAPROG TKJ specific request (Global override)
    // This ensures even if logic above misses, we force KAKOM TKJ for TUGAS TAMBAHAN group
    const managedMajors = user?.managedMajors || [];
    if (config?.group === 'TUGAS TAMBAHAN' && managedMajors.length > 0) {
         const majorCodes = managedMajors.map((m) => m.code).join(' & ');
         config = { ...config, group: `KAKOM ${majorCodes}` };
    }

    // Force Uppercase for Group Name (User Request)
    if (config?.group) {
        config.group = config.group.toUpperCase();
    }
    
    // Dynamic Group Override for Settings
    if (first === 'settings') {
         // Settings usually should be PENGATURAN
         config = { label: 'Pengaturan', group: 'PENGATURAN' };
    }

    if (config?.group) {
      breadcrumbs.push({ label: config.group, path: null });
    }

    // Dynamic breadcrumbs for teacher exam create/edit/detail routes with numeric packet id
    if (first === 'exams') {
      const examAction = String(segments[2] || '').toLowerCase();
      const isNumericPacketRoute = /^\d+$/.test(String(segments[1] || ''));
      const isCreateRoute = String(segments[1] || '').toLowerCase() === 'create';
      const supportedPacketActions = ['edit', 'schedule', 'item-analysis', 'submissions'];

      if (isCreateRoute || (isNumericPacketRoute && supportedPacketActions.includes(examAction))) {
        const stateProgramCode = String(state?.programCode || '').trim();
        const normalizedProgramCode = normalizeProgramCodeKey(stateProgramCode);
        const lookupLabel = programLookup?.examProgramLabelByCode?.[normalizedProgramCode];
        const stateProgramLabel = String(state?.programLabel || '').trim();
        const fallbackType = String(state?.type || '').trim();
        const programLabel = stateProgramLabel || lookupLabel || stateProgramCode || fallbackType || 'Program Ujian';
        const programPath = stateProgramCode
          ? `/${role}/exams/program/${examProgramCodeToSlug(stateProgramCode)}`
          : '/teacher/exams';

        const actionLabelMap: Record<string, string> = {
          create: 'Buat Ujian Baru',
          edit: 'Buat Ujian Baru',
          schedule: 'Jadwal Ujian',
          'item-analysis': 'Analisis Butir Soal',
          submissions: 'Submisi Ujian',
        };
        const actionLabel = isCreateRoute ? actionLabelMap.create : actionLabelMap[examAction] || 'Ujian';

        breadcrumbs.push({ label: programLabel, path: programPath });
        breadcrumbs.push({ label: actionLabel, path: null });
        return breadcrumbs;
      }
    }

    // Dynamic breadcrumbs for active tabs/sub-tabs on Wakasek hubs
    if (fullKey === 'wakasek/exams') {
      breadcrumbs.push({ label: config?.label || 'Kelola Ujian', path: `/${role}/wakasek/exams` });
      const section = String(queryParams.get('section') || 'program').toLowerCase();
      const sectionLabelMap: Record<string, string> = {
        program: 'Program Ujian',
        jadwal: 'Jadwal Ujian',
        ruang: 'Ruang Ujian',
        mengawas: 'Jadwal Mengawas',
      };
      const sectionLabel = sectionLabelMap[section];
      if (sectionLabel) {
        const sectionPath = `/${role}/wakasek/exams?section=${section}`;
        if (section === 'program') {
          breadcrumbs.push({ label: sectionLabel, path: sectionPath });
          const programTab = String(queryParams.get('programTab') || 'program').toLowerCase();
          if (programTab === 'component') {
            breadcrumbs.push({ label: 'Master Komponen Nilai', path: null });
          }
        } else {
          breadcrumbs.push({ label: sectionLabel, path: null });
        }
      }
      return breadcrumbs;
    }

    if (fullKey === 'wakasek/curriculum') {
      breadcrumbs.push({ label: config?.label || 'Kelola Kurikulum', path: `/${role}/wakasek/curriculum` });
      const section = String(queryParams.get('section') || 'kategori').toLowerCase();
      const sectionLabelMap: Record<string, string> = {
        kategori: 'Kategori Mapel',
        mapel: 'Mata Pelajaran',
        kkm: 'Data KKM',
        assignment: 'Assignment Guru',
        kalender: 'Kalender Akademik',
        jadwal: 'Jadwal Pelajaran',
        rekap: 'Rekap Jam Mengajar',
      };
      const sectionLabel = sectionLabelMap[section];
      if (sectionLabel) {
        breadcrumbs.push({ label: sectionLabel, path: null });
      }
      return breadcrumbs;
    }

    if (fullKey === 'wakasek/students') {
      breadcrumbs.push({ label: config?.label || 'Kelola Kesiswaan', path: `/${role}/wakasek/students` });
      const section = String(queryParams.get('section') || 'ekskul').toLowerCase();
      const sectionLabelMap: Record<string, string> = {
        ekskul: 'Ekstrakurikuler',
        siswa: 'Kelola Siswa',
        ortu: 'Kelola Orang Tua',
        pembina: 'Kelola Tutor Eksternal',
        absensi: 'Rekap Absensi',
      };
      const sectionLabel = sectionLabelMap[section];
      if (sectionLabel) {
        breadcrumbs.push({ label: sectionLabel, path: null });
      }
      return breadcrumbs;
    }

    if (fullKey === 'materials') {
      breadcrumbs.push({ label: config?.label || 'Materi & Tugas', path: `/${role}/materials` });
      const tab = String(queryParams.get('tab') || 'materials').toLowerCase();
      const tabLabel = tab === 'assignments' ? 'Tugas' : 'Materi';
      breadcrumbs.push({ label: tabLabel, path: null });
      return breadcrumbs;
    }

    if (fullKey === 'humas/partners') {
      breadcrumbs.push({ label: config?.label || 'Mitra Industri', path: `/${role}/humas/partners` });
      const tab = String(queryParams.get('tab') || 'partners').toLowerCase();
      const tabLabelMap: Record<string, string> = {
        partners: 'Mitra Industri',
        bkk: 'Informasi BKK',
      };
      if (tabLabelMap[tab]) {
        breadcrumbs.push({ label: tabLabelMap[tab], path: null });
      }
      return breadcrumbs;
    }

    if (fullKey === 'wakasek/internship-components') {
      breadcrumbs.push({
        label: config?.label || 'Nilai PKL',
        path: `/${role}/wakasek/internship-components`,
      });
      const tab = String(queryParams.get('tab') || 'industry').toLowerCase();
      const tabLabelMap: Record<string, string> = {
        industry: 'Nilai PKL (Industri)',
        components: 'Nilai Sidang PKL (Komponen)',
        summary: 'Rekap Nilai PKL',
      };
      if (tabLabelMap[tab]) {
        breadcrumbs.push({ label: tabLabelMap[tab], path: null });
      }
      return breadcrumbs;
    }

    if (fullKey === 'work-programs') {
      const duty = queryParams.get('duty');
      const basePath = duty ? `/${role}/work-programs?duty=${encodeURIComponent(duty)}` : `/${role}/work-programs`;
      breadcrumbs.push({ label: config?.label || 'Program Kerja', path: basePath });
      const tab = String(queryParams.get('tab') || 'PROGRAM').toUpperCase();
      if (tab === 'BUDGET') {
        breadcrumbs.push({ label: 'Pengajuan Anggaran', path: null });
      }
      return breadcrumbs;
    }

    if (first === 'committee-events' && segments[1] && segments[2] === 'exams') {
      const committeeLabel = String(queryParams.get('committeeLabel') || 'PANITIA KEGIATAN').trim() || 'PANITIA KEGIATAN';
      const section = String(queryParams.get('section') || 'program').toLowerCase();
      const sectionLabelMap: Record<string, string> = {
        program: 'Program Ujian',
        jadwal: 'Jadwal Ujian',
        ruang: 'Ruang Ujian',
        mengawas: 'Jadwal Mengawas',
        denah: 'Generate Denah Ruang',
        kartu: 'Kartu Ujian',
      };
      breadcrumbs.push({ label: teacherCommitteeGroup, path: null });
      breadcrumbs.push({
        label: committeeLabel,
        path: `/${role}/committee-events/${segments[1]}/exams?committeeLabel=${encodeURIComponent(committeeLabel)}`,
      });
      if (sectionLabelMap[section]) {
        breadcrumbs.push({ label: sectionLabelMap[section], path: null });
      }
      return breadcrumbs;
    }

    if (fullKey === 'head-library/inventory') {
      breadcrumbs.push({
        label: config?.label || 'Kelola Perpustakaan',
        path: `/${role}/head-library/inventory?filter=library`,
      });
      const libraryTab = String(queryParams.get('libraryTab') || 'INVENTARIS').toUpperCase();
      const tabLabel = libraryTab === 'PEMINJAMAN' ? 'Daftar Peminjaman Buku' : 'Inventaris Perpustakaan';
      breadcrumbs.push({ label: tabLabel, path: null });
      return breadcrumbs;
    }

    if (first === 'wali-kelas' && segments[1] === 'rapor' && segments[2] === 'program' && segments[3]) {
      const slug = String(segments[3] || '').trim();
      const lookupLabel = programLookup?.homeroomProgramLabelBySlug?.[slug] || programLookup?.examProgramLabelBySlug?.[slug];
      const labelFromState = String(lookupLabel || state?.programLabel || state?.programCode || '').trim();
      const reportProgramLabel = labelFromState || titleCaseFromSlug(slug);
      breadcrumbs.push({ label: 'WALI KELAS', path: `/${role}/wali-kelas` });
      breadcrumbs.push({ label: reportProgramLabel, path: `/${role}/wali-kelas/rapor/program/${slug}` });
      return breadcrumbs;
    }

    if (first === 'proctoring' && segments[1]) {
      breadcrumbs.push({ label: 'UJIAN', path: null });
      breadcrumbs.push({ label: 'Jadwal Mengawas', path: `/${role}/proctoring` });
      breadcrumbs.push({ label: 'Pantau Ujian', path: null });
      return breadcrumbs;
    }

    if (config) {
      let shouldAddParent = true;

      // Special handling for Teacher Exams
      if (first === 'exams') {
         if (segments[1] && !['program', 'bank', 'create', 'edit'].includes(segments[1])) {
             const legacySlug = String(segments[1] || '').trim();
             const legacyLookupLabel = programLookup?.examProgramLabelBySlug?.[legacySlug];
             if (legacyLookupLabel) {
                 breadcrumbs.push({ label: legacyLookupLabel, path: `/${role}/exams/program/${legacySlug}` });
                 return breadcrumbs;
             }
         }
         if (segments[1] === 'program' && segments[2]) {
             const slug = String(segments[2] || '').trim();
             const lookupLabel = programLookup?.examProgramLabelBySlug?.[slug];
             const typeLabel =
               String(lookupLabel || state?.programLabel || state?.programCode || '').trim() || titleCaseFromSlug(slug);
             breadcrumbs.push({ label: typeLabel, path: `/${role}/exams/program/${slug}` });
             return breadcrumbs;
         }
         if (state?.type || state?.programCode) {
             const type = String(state?.type || '').toUpperCase();
             const normalizedProgramCode = String(state?.programCode || '').trim();
             const programSlug = normalizedProgramCode ? examProgramCodeToSlug(normalizedProgramCode) : '';
             const lookupLabel = programLookup?.examProgramLabelByCode?.[normalizeProgramCodeKey(normalizedProgramCode)];
             let typeLabel = state?.programLabel || lookupLabel || normalizedProgramCode || type || 'Ujian';
             let typePath = programSlug ? `/teacher/exams/program/${programSlug}` : '/teacher/exams';

             if (type === 'BANK_SOAL') {
                 typeLabel = 'Bank Soal';
                 typePath = '/teacher/exams/bank';
             }

             breadcrumbs.push({ label: typeLabel, path: typePath });
             shouldAddParent = false; 
         } else {
             const isSubtypeList = ['program', 'bank'].some(t => fullKey.includes(t));
             if (isSubtypeList) {
                 shouldAddParent = false;
             }
         }
      }

      // Check for parent category (e.g. exams -> exams/create)
      if (shouldAddParent && first !== fullKey && mapping[first] && mapping[first].group === config.group) {
          // Avoid duplicating if the config IS the first segment
          if (mapping[first] !== config && mapping[first].label !== config.label) {
              breadcrumbs.push({ label: mapping[first].label, path: `/${role}/${first}` });
          }
      }

      // Determine the path for the config
      let path = first;
      if (mappedConfigKey) path = mappedConfigKey;
      else if (sidebarMatchKey) path = sidebarMatchKey;

      breadcrumbs.push({ label: config.label, path: `/${role}/${path}` });
    } else {
      const label =
        first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }

    return breadcrumbs;
  }

  if (role === 'examiner') {
    const mapping: Record<
      string,
      {
        label: string;
        group?: string;
      }
    > = {
      'schemes': { label: 'Data Skema' },
      'schemes/create': { label: 'Buat Skema', group: 'Data Skema' },
      'schemes/edit': { label: 'Edit Skema', group: 'Data Skema' },
      
      'ukk-assessment': { label: 'Penilaian UKK' },
      
      'settings': { label: 'PENGATURAN', group: 'PENGATURAN' },
      'settings/profile': { label: 'Profil', group: 'PENGATURAN' },
      'settings/password': { label: 'Ubah Password', group: 'PENGATURAN' },
      'general': { label: 'PENGATURAN', group: 'PENGATURAN' },
    };

    const fullKey = segments.join('/');
    const first = segments[0];
    const second = segments.length > 1 ? `${first}/${segments[1]}` : null;
    const sidebarMatchKey = [fullKey, second, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    const config =
      (sidebarConfig
        ? {
            label: sidebarConfig.label,
            group: sidebarConfig.group || undefined,
          }
        : null) ||
      mapping[fullKey] ||
      (second && mapping[second]) ||
      mapping[first];

    if (config?.group) {
      breadcrumbs.push({ label: config.group, path: null });
    }

    if (config) {
      let path = first;
      if (sidebarMatchKey) path = sidebarMatchKey;
      else if (mapping[fullKey]) path = fullKey;
      else if (second && mapping[second] === config) path = second;

      breadcrumbs.push({ label: config.label, path: `/${role}/${path}` });
    } else {
      const label = first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }

    return breadcrumbs;
  }

  if (role === 'student') {
     const isAlumni = user?.studentStatus === 'GRADUATED';
     const mapping: Record<
      string,
      {
        label: string;
        group?: string;
      }
    > = {
      // UJIAN ONLINE
      'exams': { label: 'UJIAN ONLINE', group: 'UJIAN ONLINE' },
      'exams-group': { label: 'UJIAN ONLINE', group: 'UJIAN ONLINE' },
      'exams/formatif': { label: 'Formatif (Quiz)', group: 'UJIAN ONLINE' },
      'exams/sbts': { label: 'Program Ujian', group: 'UJIAN ONLINE' },
      'exams/sas': { label: 'Program Ujian', group: 'UJIAN ONLINE' },
      'exams/sat': { label: 'Program Ujian', group: 'UJIAN ONLINE' },
      'exams/program': { label: 'Program Ujian', group: 'UJIAN ONLINE' },

      // NILAI SAYA / AKADEMIK (depending on status)
      'grades-group': { label: 'NILAI SAYA', group: 'NILAI SAYA' },
      grades: { label: 'Nilai Saya', group: isAlumni ? 'AKADEMIK' : 'NILAI SAYA' },

      // EKSTRAKURIKULER
      extracurricular: { label: 'Ekstrakurikuler' },

      // PKL (PRAKERIN)
      internship: { label: 'PKL (PRAKERIN)', group: 'PKL (PRAKERIN)' },
      'internship/dashboard': { label: 'Dashboard PKL', group: 'PKL (PRAKERIN)' },
      'internship/journals': { label: 'Jurnal Harian', group: 'PKL (PRAKERIN)' },
      'internship/attendance': { label: 'Absensi PKL', group: 'PKL (PRAKERIN)' },
      'internship/report': { label: 'Laporan PKL', group: 'PKL (PRAKERIN)' },

      // AKADEMIK
      schedule: { label: 'Jadwal Pelajaran', group: 'AKADEMIK' },
      learning: { label: 'Materi & Tugas', group: 'AKADEMIK' },
      attendance: { label: 'Riwayat Kehadiran', group: 'AKADEMIK' },
      permissions: { label: 'Perizinan', group: 'AKADEMIK' },

      // ADMINISTRASI
      finance: { label: 'Keuangan', group: 'ADMINISTRASI' },
      administration: { label: 'ADMINISTRASI', group: 'ADMINISTRASI' },
    };

    const fullKey = segments.join('/');
    const first = segments[0];
    const second = segments.length > 1 ? `${first}/${segments[1]}` : null;
    const sidebarMatchKey = [fullKey, second, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    let config =
      (sidebarConfig
        ? {
            label: sidebarConfig.label,
            group: sidebarConfig.group || undefined,
          }
        : null) ||
      mapping[fullKey] ||
      (second && mapping[second]) ||
      mapping[first];

    if (first === 'exams' && segments[1] === 'program' && segments[2]) {
      const slug = String(segments[2] || '').trim();
      const lookupLabel = programLookup?.examProgramLabelBySlug?.[slug];
      const typeLabel =
        String(lookupLabel || state?.programLabel || state?.programCode || '').trim() || titleCaseFromSlug(slug);
      breadcrumbs.push({ label: 'UJIAN ONLINE', path: null });
      breadcrumbs.push({ label: typeLabel, path: `/${role}/exams/program/${slug}` });
      return breadcrumbs;
    }

    if (first === 'exams' && segments[1] && !['program', 'take'].includes(segments[1])) {
      const legacySlug = String(segments[1] || '').trim();
      const legacyLookupLabel = programLookup?.examProgramLabelBySlug?.[legacySlug];
      if (legacyLookupLabel) {
        breadcrumbs.push({ label: 'UJIAN ONLINE', path: null });
        breadcrumbs.push({ label: legacyLookupLabel, path: `/${role}/exams/program/${legacySlug}` });
        return breadcrumbs;
      }
    }

    // Handle "Take Exam" page specifically
    if (first === 'exams' && segments[segments.length - 1] === 'take') {
      const examStateRaw = state?.exam;
      const examState =
        examStateRaw && typeof examStateRaw === 'object'
          ? (examStateRaw as { type?: unknown; programCode?: unknown; programLabel?: unknown })
          : null;
      if (examState) {
        const type = String(examState.type || '').toUpperCase();
        const programCode = String(examState.programCode || '').trim();
        const programSlug = programCode ? examProgramCodeToSlug(programCode) : '';
        const lookupLabel = programLookup?.examProgramLabelByCode?.[normalizeProgramCodeKey(programCode)];
        const typeLabel = String(examState.programLabel || lookupLabel || programCode || type || 'Ujian');
        const typePath = programSlug ? `/student/exams/program/${programSlug}` : '/student/exams';

        // Push the type breadcrumb
        breadcrumbs.push({ label: 'UJIAN ONLINE', path: null }); // Group
        breadcrumbs.push({ label: typeLabel, path: typePath }); // The specific list page

        // Final current page
           config = { label: 'Mengerjakan Ujian', group: undefined };
       } else {
           config = { label: 'Mengerjakan Ujian', group: 'UJIAN ONLINE' };
       }
    }

    if (config?.group) {
      breadcrumbs.push({ label: config.group, path: null });
    }

    const queryParams = new URLSearchParams(location.search);

    if (fullKey === 'learning') {
      breadcrumbs.push({ label: config?.label || 'Materi & Tugas', path: `/${role}/learning` });
      const tab = String(queryParams.get('tab') || 'materials').toLowerCase();
      const tabLabel = tab === 'assignments' ? 'Tugas' : 'Materi';
      breadcrumbs.push({ label: tabLabel, path: null });
      return breadcrumbs;
    }

    if (config) {
      let path = first;
      if (sidebarMatchKey) path = sidebarMatchKey;
      else if (mapping[fullKey]) path = fullKey;
      else if (second && mapping[second] === config) path = second;

      breadcrumbs.push({ label: config.label, path: `/${role}/${path}` });
    } else {
      const label =
        first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }

    return breadcrumbs;
  }

  if (role === 'tutor') {
    const fullKey = segments.join('/');
    const first = segments[0];
    const sidebarMatchKey = [fullKey, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    const queryParams = new URLSearchParams(location.search);
    const dutyQuery = String(queryParams.get('duty') || '').toUpperCase();
    const advisorScopedParams = new URLSearchParams();
    ['assignmentId', 'ekskulId', 'academicYearId'].forEach((key) => {
      const value = String(queryParams.get(key) || '').trim();
      if (value) advisorScopedParams.set(key, value);
    });
    const buildTutorScopedPath = (pathname: string, extraParams?: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(advisorScopedParams);
      Object.entries(extraParams || {}).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        }
      });
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    };

    if (first === 'members') {
      if (advisorBreadcrumbGroup) {
        breadcrumbs.push({ label: advisorBreadcrumbGroup, path: null });
      } else if (sidebarConfig?.group) {
        breadcrumbs.push({ label: sidebarConfig.group, path: null });
      }
      breadcrumbs.push({
        label: sidebarConfig?.label || 'Anggota & Nilai',
        path: buildTutorScopedPath(`/${role}/members`),
      });
      return breadcrumbs;
    }

    if (first === 'work-programs') {
      const baseLabel = sidebarConfig?.label || 'Program Kerja';
      const resolvedDuty = dutyQuery || (sidebarConfig?.group === 'PEMBINA EKSKUL' ? 'PEMBINA_EKSKUL' : null);
      const workProgramPath = buildTutorScopedPath(`/${role}/work-programs`, {
        duty: resolvedDuty,
      });
      const budgetSectionLabel =
        resolvedDuty === 'PEMBINA_EKSKUL'
          ? 'Pengajuan Alat Ekskul'
          : 'Pengajuan Anggaran';

      if (sidebarConfig?.group) {
        breadcrumbs.push({
          label:
            sidebarConfig.group === 'PEMBINA EKSKUL' && advisorBreadcrumbGroup
              ? advisorBreadcrumbGroup
              : sidebarConfig.group,
          path: null,
        });
      }

      breadcrumbs.push({ label: baseLabel, path: workProgramPath });

      const activeTab = String(queryParams.get('tab') || 'PROGRAM').toUpperCase();
      if (activeTab === 'BUDGET') {
        const section = String(queryParams.get('section') || 'REQUEST').toUpperCase();
        breadcrumbs.push({
          label: section === 'LPJ' ? 'LPJ Program Kerja' : budgetSectionLabel,
          path: null,
        });
      }
      return breadcrumbs;
    }

    if (first === 'inventory' || first === 'assigned-inventory') {
      if (advisorBreadcrumbGroup) {
        breadcrumbs.push({ label: advisorBreadcrumbGroup, path: null });
      } else if (sidebarConfig?.group) {
        breadcrumbs.push({ label: sidebarConfig.group, path: null });
      }
      breadcrumbs.push({
        label: sidebarConfig?.label || 'Kelola Inventaris',
        path:
          first === 'assigned-inventory' && segments[1]
            ? `/${role}/assigned-inventory/${segments[1]}`
            : buildTutorScopedPath(`/${role}/inventory`),
      });
      return breadcrumbs;
    }

    if (sidebarConfig) {
      if (sidebarConfig.group) {
        breadcrumbs.push({
          label:
            sidebarConfig.group === 'PEMBINA EKSKUL' && advisorBreadcrumbGroup
              ? advisorBreadcrumbGroup
              : sidebarConfig.group,
          path: null,
        });
      }
      breadcrumbs.push({ label: sidebarConfig.label, path: `/${role}/${sidebarMatchKey}` });
    } else {
      const label = first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }
    return breadcrumbs;
  }

  if (role === 'principal') {
    const mapping: Record<string, { label: string; group?: string }> = {
      'monitoring/operations': { label: 'Operasional Harian', group: 'MONITORING' },
      'monitoring/bpbk': { label: 'Ringkasan BP/BK', group: 'MONITORING' },
      'work-program-approvals': { label: 'Persetujuan Program Kerja', group: 'MONITORING' },
      'committee-approvals': { label: 'Persetujuan Panitia', group: 'MONITORING' },
      'academic/reports': { label: 'Rapor & Ranking' },
      'academic/attendance': { label: 'Rekap Absensi' },
      'learning-resources/review-submissions': { label: 'Persetujuan Perangkat Ajar', group: 'PERANGKAT AJAR' },
      'finance/requests': { label: 'Pengajuan Anggaran' },
      'teachers': { label: 'Data Guru' },
      'students': { label: 'Data Siswa' },
    };
    
    const fullKey = segments.join('/');
    const first = segments[0];
    const sidebarMatchKey = [fullKey, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    const config =
      (sidebarConfig
        ? {
            label: sidebarConfig.label,
            group: sidebarConfig.group || undefined,
          }
        : null) ||
      mapping[fullKey] ||
      mapping[first];

    if (config) {
      if (config.group) {
        breadcrumbs.push({ label: config.group, path: null });
      }
      breadcrumbs.push({ label: config.label, path: `/${role}/${sidebarMatchKey || first}` });
    } else {
      const label = first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }
    return breadcrumbs;
  }

  if (role === 'staff') {
    const mapping: Record<string, { label: string; group?: string }> = {
      dashboard: { label: 'Dashboard' },
      finance: { label: 'Ringkasan Keuangan', group: 'KEUANGAN' },
      'finance/master': { label: 'Master Biaya', group: 'KEUANGAN' },
      'finance/tagihan': { label: 'Tagihan Siswa', group: 'KEUANGAN' },
      'finance/pembayaran': { label: 'Pembayaran', group: 'KEUANGAN' },
      'finance/kas-bank': { label: 'Kas & Bank', group: 'KEUANGAN' },
      'finance/tutup-buku': { label: 'Tutup Buku', group: 'KEUANGAN' },
      'finance/laporan': { label: 'Laporan', group: 'KEUANGAN' },
      'finance/students': { label: 'Data Siswa', group: 'KEUANGAN' },
      'finance/operations': { label: 'Realisasi Anggaran', group: 'KEUANGAN' },
      administration: { label: 'Administrasi', group: 'ADMINISTRASI' },
      'administration/students': { label: 'Administrasi Siswa', group: 'ADMINISTRASI' },
      'administration/teachers': { label: 'Administrasi Guru', group: 'ADMINISTRASI' },
      'administration/permissions': { label: 'Perizinan Siswa', group: 'ADMINISTRASI' },
      'administration/presence': { label: 'Presensi Harian', group: 'ADMINISTRASI' },
      'head-tu': { label: 'Operasional TU', group: 'MONITORING TU' },
      'head-tu/administration': { label: 'Operasional TU', group: 'MONITORING TU' },
      'head-tu/finance': { label: 'Monitoring Keuangan', group: 'MONITORING TU' },
      'head-tu/students': { label: 'Data Siswa', group: 'LAYANAN TU' },
      'head-tu/teachers': { label: 'Data Guru & Staff', group: 'LAYANAN TU' },
      'head-tu/permissions': { label: 'Perizinan Siswa', group: 'LAYANAN TU' },
      'head-tu/letters': { label: 'Surat-Menyurat', group: 'LAYANAN TU' },
      'head-tu/committees': { label: 'SK Kepanitiaan', group: 'LAYANAN TU' },
      payments: { label: 'Ringkasan Keuangan', group: 'KEUANGAN' },
      students: { label: 'Data Siswa', group: 'KEUANGAN' },
      admin: { label: 'Realisasi Anggaran', group: 'KEUANGAN' },
    };
    
    const fullKey = segments.join('/');
    const first = segments[0];
    const second = segments[1];
    const sidebarMatchKey = [fullKey, second ? `${first}/${second}` : null, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    const config =
      mapping[fullKey] ||
      mapping[first] ||
      (sidebarConfig
        ? {
            label: sidebarConfig.label,
            group: sidebarConfig.group || undefined,
          }
        : null);

    if (config) {
      if (config.group) {
        breadcrumbs.push({ label: config.group, path: null });
      }
      const resolvedPath =
        mapping[fullKey] ? fullKey : mapping[first] ? first : sidebarMatchKey || first;
      breadcrumbs.push({ label: config.label, path: `/${role}/${resolvedPath}` });
    } else {
      const label = first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }
    return breadcrumbs;
  }

  if (role === 'parent') {
    const mapping: Record<string, { label: string; group?: string }> = {
      'children': { label: 'Data Anak' },
      'finance': { label: 'Keuangan' },
      'attendance': { label: 'Absensi Anak' },
    };
    
    const fullKey = segments.join('/');
    const first = segments[0];
    const sidebarMatchKey = [fullKey, first].find((key) => key && sidebarLookup[key]) || null;
    const sidebarConfig = sidebarMatchKey ? sidebarLookup[sidebarMatchKey] : null;
    const config =
      (sidebarConfig
        ? {
            label: sidebarConfig.label,
            group: sidebarConfig.group || undefined,
          }
        : null) ||
      mapping[fullKey] ||
      mapping[first];

    if (config) {
      breadcrumbs.push({ label: config.label, path: `/${role}/${sidebarMatchKey || first}` });
    } else {
      const label = first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }
    return breadcrumbs;
  }

  const segment = segments[0];
  const label =
    segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
  breadcrumbs.push({ label, path: `/${role}/${segment}` });

  return breadcrumbs;
};

export const DashboardLayout = () => {
  // const queryClient = useQueryClient();
  const { data: userResponse, isLoading: isUserLoading } = useQuery<ApiResponse<User>>({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const user = userResponse?.data || null;
  useRealtimeSync(Boolean(user));
  const { data: activeYear, error: activeYearError, isLoading: isLoadingYear } = useActiveAcademicYear();

  const displayUser = user;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const location = useLocation();
  const examProgramLabelsQuery = useQuery({
    queryKey: ['breadcrumb-exam-program-labels', user?.role, activeYear?.id],
    enabled: Boolean(user) && (user?.role === 'TEACHER' || user?.role === 'STUDENT'),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const roleContext = user?.role === 'STUDENT' ? 'student' : 'teacher';
      const response = await examService.getPrograms({
        academicYearId: activeYear?.id,
        roleContext,
      });
      return response?.data?.programs || [];
    },
  });

  const breadcrumbProgramLookup: BreadcrumbProgramLookup = (() => {
    const programs = Array.isArray(examProgramLabelsQuery.data) ? (examProgramLabelsQuery.data as ExamProgram[]) : [];
    const examProgramLabelBySlug: Record<string, string> = {};
    const examProgramLabelByCode: Record<string, string> = {};
    const homeroomProgramLabelBySlug: Record<string, string> = {};

    for (const program of programs) {
      const code = String(program?.code || '').trim();
      const label = String(program?.label || program?.shortLabel || code).trim();
      if (!code || !label) continue;
      const slug = examProgramCodeToSlug(code);
      const normalizedCode = normalizeProgramCodeKey(code);
      examProgramLabelBySlug[slug] = label;
      examProgramLabelByCode[normalizedCode] = label;

      const componentType = String(
        program?.gradeComponentTypeCode || program?.gradeComponentType || '',
      )
        .trim()
        .toUpperCase();
      if (componentType === 'MIDTERM' || componentType === 'FINAL') {
        homeroomProgramLabelBySlug[slug] = label;
      }
    }

    return {
      examProgramLabelBySlug,
      examProgramLabelByCode,
      homeroomProgramLabelBySlug,
    };
  })();

  const breadcrumbs = getBreadcrumbs(location, user, breadcrumbProgramLookup);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenDoc = document as Document & {
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
        msFullscreenElement?: Element | null;
      };
      const isFS = !!(
        document.fullscreenElement ||
        fullscreenDoc.webkitFullscreenElement ||
        fullscreenDoc.mozFullScreenElement ||
        fullscreenDoc.msFullscreenElement
      );
      setIsFullscreen(isFS);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // Initial check
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (activeYearError) {
     console.error("Active Year Query Error:", activeYearError);
  }

  const activeSemester = activeYear?.semester;

  // Handle logout - REMOVED unused function
  // const handleLogout = ... (moved to Sidebar or other component if needed)

  // Generate date string
  const today = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  const todayLabel = today.toLocaleDateString('id-ID', options);

  // Generate Year Label
  let yearLabel = '';
  const hasActiveYear = activeYear && activeYear.name;
  
  if (isLoadingYear && !hasActiveYear) {
    yearLabel = ' | Memuat Tahun Ajaran...';
  } else if (activeYearError && !hasActiveYear) {
    yearLabel = ' | Gagal Memuat Tahun Ajaran';
  } else if (hasActiveYear) {
      yearLabel = ` | Tahun Ajaran ${activeYear.name}`;
      if (activeYear.semester) {
          const semLabel = activeYear.semester === 'ODD' ? 'Ganjil' : 'Genap';
          yearLabel += ` (${semLabel})`;
      }
  } else {
      yearLabel = ' | Tahun Ajaran Tidak Tersedia';
  }

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Memuat data pengguna...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.warn('DashboardLayout: Redirecting to login because user is null');
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-theme-scope relative isolate flex h-screen" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-primary)' }}>
      {/* Sidebar for Desktop - Hidden in Fullscreen */}
      {!isFullscreen && <Sidebar user={user} activeSemester={activeSemester} />}

      {/* Main Content */}
      <div className="relative z-0 flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header with Breadcrumbs - Hidden in Fullscreen */}
        {!isFullscreen && (
        <header className="dashboard-header-surface bg-white/80 h-16 flex items-center justify-between px-6 z-20 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button 
              type="button"
              className="md:hidden p-2 rounded-md hover:bg-gray-100"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            >
              <Menu className="w-6 h-6 text-gray-600" />
            </button>
            
            {/* Breadcrumbs */}
            <nav className="hidden md:flex items-center text-sm text-gray-500 font-medium">
              {/* Only show Home if we are at root or if allowed */}
              {(!location.pathname.includes('/teacher/') && !location.pathname.includes('/wakasek/')) && (
                <Link 
                  to={`/${user.role.toLowerCase()}`} 
                  className="hover:text-blue-600 transition-colors"
                  aria-label="Kembali ke dashboard"
                >
                  <Home size={18} />
                </Link>
              )}
              
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center">
                  {(index > 0 || (!location.pathname.includes('/teacher/') && !location.pathname.includes('/wakasek/'))) && (
                    <ChevronRight size={16} className="mx-2 text-gray-400" />
                  )}
                  {crumb.path ? (
                    <Link 
                      to={crumb.path} 
                      className={`${index === breadcrumbs.length - 1 ? 'text-blue-600 font-semibold' : 'hover:text-blue-600 transition-colors'}`}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={clsx(
                        'px-1',
                        index === breadcrumbs.length - 1
                          ? 'text-blue-600 font-semibold'
                          : 'text-gray-500 font-medium',
                      )}
                    >
                      {crumb.label}
                    </span>
                  )}
                </div>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center ml-auto space-x-3">
              {displayUser?.id ? (
                <HeaderThemeModeToggle
                  userId={displayUser.id}
                  currentPreferences={displayUser.preferences}
                />
              ) : null}
              <div className="hidden md:block text-sm text-blue-700 font-normal">
                {todayLabel}{yearLabel}
              </div>
            <NotificationDropdown />
          </div>
        </header>
        )}

        {/* Content */}
        <main className={`${isFullscreen ? '' : 'dashboard-main'} flex-1 overflow-x-hidden w-full max-w-[100vw] ${isFullscreen ? 'p-0' : 'p-4 md:p-6'}`}>
          <Outlet key={location.pathname} context={{ user: displayUser, activeYear }} />
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && !isFullscreen && (
        <div 
          className="fixed inset-0 bg-black/30 z-[60] md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Mobile Sidebar */}
      {!isFullscreen && (
      <div className={clsx(
        "dashboard-drawer-surface fixed inset-y-0 left-0 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-[70] md:hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar user={displayUser || { id: 0, name: 'Guest', role: 'GUEST' }} />
      </div>
      )}
    </div>
  );
};
