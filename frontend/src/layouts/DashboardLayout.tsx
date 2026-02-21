import { Outlet, Navigate, useLocation, Link } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Menu, ChevronRight, Home } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { NotificationDropdown } from '../components/layout/NotificationDropdown';
import clsx from 'clsx';
import { useActiveAcademicYear } from '../hooks/useActiveAcademicYear';

// Helper untuk breadcrumbs map
  const getBreadcrumbs = (
    location: { pathname: string; search: string; state?: { type?: string; exam?: any } | null }, 
    user: any // Pass user object to access dynamic data
  ) => {
    const { pathname, state } = location;
    const paths = pathname.split('/').filter(Boolean);
    if (paths.length === 0) return [];

    const role = paths[0];
    const segments = paths.slice(1);
    const breadcrumbs: { label: string; path: string | null }[] = [];

    if (segments.length === 0) {
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
      if ((dutyCode === 'KAPROG' || dutyCode === 'HEAD_PROGRAM' || dutyCode === 'TUGAS_TAMBAHAN') && user?.managedMajors?.length > 0) {
        const majorCodes = user.managedMajors.map((m: any) => m.code).join(' & ');
        name = `KAKOM ${majorCodes}`;
      }
      
      return name;
    };

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
      'tutor-users': { label: 'Kelola Pembina Ekskul', group: 'USER MANAGEMENT' },
      'parent-users': { label: 'Kelola Orang Tua', group: 'USER MANAGEMENT' },
      teachers: { label: 'Kelola Guru', group: 'USER MANAGEMENT' },
      students: { label: 'Kelola Siswa', group: 'USER MANAGEMENT' },
      'user-verification': { label: 'Verifikasi Akun', group: 'USER MANAGEMENT' },
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
      'settings/profile': { label: 'Profil Sekolah', group: 'PENGATURAN' },
      'settings/password': { label: 'Ubah Password', group: 'PENGATURAN' },
    };

    const fullKey = segments.join('/');
    const first = segments[0];
    // Check for 2-level depth match (e.g. exams/edit)
    const second = segments.length > 1 ? `${first}/${segments[1]}` : null;
    
    const config = mapping[fullKey] || (second && mapping[second]) || mapping[first];

    if (config?.group) {
      breadcrumbs.push({ label: config.group, path: null });
    }

    if (config) {
      let shouldAddParent = true;

      // Special handling for Teacher Exams
      if (first === 'exams') {
         if (state?.type) {
             const type = state.type;
             let typeLabel = 'Ujian';
             let typePath = '/teacher/exams';
             
             if (type === 'FORMATIF') {
                 typeLabel = 'Formatif (Quiz)';
                 typePath = '/teacher/exams/formatif';
             } else if (type === 'SBTS') {
                 typeLabel = 'SBTS';
                 typePath = '/teacher/exams/sbts';
             } else if (type === 'SAS') {
                 typeLabel = 'SAS';
                 typePath = '/teacher/exams/sas';
             } else if (type === 'SAT') {
                 typeLabel = 'SAT';
                 typePath = '/teacher/exams/sat';
             } else if (type === 'BANK_SOAL') { 
                 typeLabel = 'Bank Soal';
                 typePath = '/teacher/exams/bank';
             }

             breadcrumbs.push({ label: typeLabel, path: typePath });
             shouldAddParent = false; 
         } else {
             const isSubtypeList = ['formatif', 'sbts', 'sas', 'sat', 'bank'].some(t => fullKey.includes(t));
             if (isSubtypeList) {
                 shouldAddParent = false;
             }
         }
      }

      // Check for parent category (e.g. exams -> exams/create)
      if (shouldAddParent && first !== fullKey && mapping[first] && mapping[first].group === config.group) {
          // Avoid duplicating if the config IS the first segment
          // Also skip parent for create/edit exam pages to avoid "Ujian > Buat Ujian" redundancy if type is missing
          const isExamAction = fullKey === 'exams/create' || fullKey === 'exams/edit';
          
          if (mapping[first] !== config && !isExamAction) {
              breadcrumbs.push({ label: mapping[first].label, path: `/${role}/${first}` });
          }
      }

      // Determine the path for the config
      let path = first;
      if (mapping[fullKey]) path = fullKey;
      else if (second && mapping[second] === config) path = second;

      breadcrumbs.push({ label: config.label, path: `/${role}/${path}` });
    } else {
      const label =
        first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }

    return breadcrumbs;
  }

  if (role === 'teacher') {
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
      'learning-resources/modules': { label: 'Modul Ajar', group: 'PERANGKAT AJAR' },
      'learning-resources/kktp': { label: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)', group: 'PERANGKAT AJAR' },

      // UJIAN
      'exams': { label: 'UJIAN', group: 'UJIAN' },
      'exams-group': { label: 'UJIAN', group: 'UJIAN' },
      'proctoring': { label: 'Jadwal Mengawas', group: 'UJIAN' },
      'exams/formatif': { label: 'Formatif (Quiz)', group: 'UJIAN' },
      'exams/sbts': { label: 'SBTS', group: 'UJIAN' },
      'exams/sas-sat': { label: 'SAS / SAT', group: 'UJIAN' },
      'exams/bank': { label: 'Bank Soal', group: 'UJIAN' },
      'exams/create': { label: 'Buat Ujian Baru', group: 'UJIAN' },
      'exams/edit': { label: 'Edit Ujian', group: 'UJIAN' },

      // WALI KELAS
      'wali-kelas': { label: 'WALI KELAS' },
      'wali-kelas/students': { label: 'Siswa Binaan', group: 'WALI KELAS' },
      'wali-kelas/attendance': { label: 'Rekap Presensi', group: 'WALI KELAS' },
      'wali-kelas/behavior': { label: 'Catatan Perilaku', group: 'WALI KELAS' },
      'wali-kelas/permissions': { label: 'Persetujuan Izin', group: 'WALI KELAS' },
      'wali-kelas/rapor-sbts': { label: 'Rapor SBTS', group: 'WALI KELAS' },
      'wali-kelas/rapor-sas': { label: 'Rapor SAS', group: 'WALI KELAS' },
      'wali-kelas/rapor-sat': { label: 'Rapor SAT', group: 'WALI KELAS' },

      // KELAS TRAINING
      training: { label: 'KELAS TRAINING', group: 'KELAS TRAINING' },
      'training/classes': { label: 'Daftar Kelas', group: 'KELAS TRAINING' },
      'training/attendance': { label: 'Presensi Training', group: 'KELAS TRAINING' },
      'training/grades': { label: 'Nilai Training', group: 'KELAS TRAINING' },
      'training/materials': { label: 'Materi & Tugas', group: 'KELAS TRAINING' },
      'training/reports': { label: 'Laporan Training', group: 'KELAS TRAINING' },

      // WAKASEK KURIKULUM
      'wakasek/curriculum': { label: 'Kelola Kurikulum', group: 'WAKASEK KURIKULUM' },
      'wakasek/exams': { label: 'Kelola Ujian', group: 'WAKASEK KURIKULUM' },
      'wakasek/exam-schedules': { label: 'Kelola Jadwal Ujian', group: 'WAKASEK KURIKULUM' },
      'wakasek/exam-rooms': { label: 'Kelola Ruang Ujian', group: 'WAKASEK KURIKULUM' },
      'wakasek/proctor-schedule': { label: 'Kelola Jadwal Mengawas', group: 'WAKASEK KURIKULUM' },
      'wakasek/performance': { label: 'Monitoring Kinerja', group: 'WAKASEK KURIKULUM' },
      'wakasek/approvals': { label: 'Persetujuan', group: 'WAKASEK KURIKULUM' },
      'wakasek/reports': { label: 'Laporan Akademik', group: 'WAKASEK KURIKULUM' },
      
      // WAKASEK KESISWAAN
      'wakasek/student-performance': { label: 'Monitoring Kinerja', group: 'WAKASEK KESISWAAN' },
      'wakasek/student-approvals': { label: 'Persetujuan', group: 'WAKASEK KESISWAAN' },
      'wakasek/student-reports': { label: 'Laporan Kesiswaan', group: 'WAKASEK KESISWAAN' },

      // WAKASEK SARPRAS
      'sarpras/inventory': { label: 'Inventaris', group: 'WAKASEK SARPRAS' },
      'sarpras/reports': { label: 'Laporan', group: 'WAKASEK SARPRAS' },

      // WAKASEK HUMAS
      'humas/partners': { label: 'Mitra Industri', group: 'WAKASEK HUMAS' },
      'humas/reports': { label: 'Laporan', group: 'WAKASEK HUMAS' },

      // KEPALA LAB
      'head-lab/inventory': { label: 'Inventaris Lab', group: 'KEPALA LAB' },
      'head-lab/schedule': { label: 'Jadwal Lab', group: 'KEPALA LAB' },
      'head-lab/incidents': { label: 'Laporan Insiden', group: 'KEPALA LAB' },
      
      // KAKOM / HEAD PROGRAM
      'head-program': { label: 'Kelas Kompetensi', group: 'TUGAS TAMBAHAN' }, // Base
      'head-program/classes': { label: 'Kelas Kompetensi', group: 'TUGAS TAMBAHAN' },
      'head-program/pkl': { label: 'Monitoring PKL', group: 'TUGAS TAMBAHAN' },
      'head-program/partners': { label: 'Mitra Industri & BKK', group: 'TUGAS TAMBAHAN' },

      // UMUM
      'work-programs': { label: 'Program Kerja', group: 'UMUM' },
      communication: { label: 'Komunikasi', group: 'UMUM' },
      profile: { label: 'Profil', group: 'PENGATURAN' },
      general: { label: 'Pengaturan', group: 'PENGATURAN' },
    };

    const fullKey = segments.join('/');
    const first = segments[0];
    
    // Check for 2-level depth match (e.g. exams/edit)
    const second = segments.length > 1 ? `${first}/${segments[1]}` : null;
    
    let config = mapping[fullKey] || (second && mapping[second]) || mapping[first];

    // Dynamic Group Override for Work Programs & Duties
    const queryParams = new URLSearchParams(location.search);
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
             // Try to infer KAPROG or other duties
             if (user?.managedMajors?.length > 0) dutyCode = 'KAPROG';
             // If user has other duties that map to TUGAS TAMBAHAN, use the first one
             else if (user?.additionalDuties?.length > 0) {
                 // Prioritize non-wakasek duties for TUGAS TAMBAHAN group
                 const otherDuty = user.additionalDuties.find((d: string) => !d.startsWith('WAKASEK'));
                 if (otherDuty) dutyCode = otherDuty;
             }
        }
        
        if (dutyCode) isDutyContext = true;
    }

    if (isDutyContext && dutyCode) {
        let resolvedName = getDutyName(dutyCode);
        
        if (resolvedName !== 'UNKNOWN') {
           config = { ...config, group: resolvedName };
        }
    }
    
    // Final safety check for KAPROG TKJ specific request (Global override)
    // This ensures even if logic above misses, we force KAKOM TKJ for TUGAS TAMBAHAN group
    if (config?.group === 'TUGAS TAMBAHAN' && user?.managedMajors?.length > 0) {
         const majorCodes = user.managedMajors.map((m: any) => m.code).join(' & ');
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

    if (config) {
      let shouldAddParent = true;

      // Special handling for Teacher Exams
      if (first === 'exams') {
         if (state?.type) {
             const type = state.type;
             let typeLabel = 'Ujian';
             let typePath = '/teacher/exams';
             
             if (type === 'FORMATIF') {
                 typeLabel = 'Formatif (Quiz)';
                 typePath = '/teacher/exams/formatif';
             } else if (type === 'SBTS') {
                 typeLabel = 'SBTS';
                 typePath = '/teacher/exams/sbts';
             } else if (type === 'SAS') {
                 typeLabel = 'SAS';
                 typePath = '/teacher/exams/sas';
             } else if (type === 'SAT') {
                 typeLabel = 'SAT';
                 typePath = '/teacher/exams/sat';
             } else if (type === 'BANK_SOAL') { 
                 typeLabel = 'Bank Soal';
                 typePath = '/teacher/exams/bank';
             }

             breadcrumbs.push({ label: typeLabel, path: typePath });
             shouldAddParent = false; 
         } else {
             const isSubtypeList = ['formatif', 'sbts', 'sas', 'sat', 'bank'].some(t => fullKey.includes(t));
             if (isSubtypeList) {
                 shouldAddParent = false;
             }
         }
      }

      // Check for parent category (e.g. exams -> exams/create)
      if (shouldAddParent && first !== fullKey && mapping[first] && mapping[first].group === config.group) {
          // Avoid duplicating if the config IS the first segment
          if (mapping[first] !== config) {
              breadcrumbs.push({ label: mapping[first].label, path: `/${role}/${first}` });
          }
      }

      // Determine the path for the config
      let path = first;
      if (mapping[fullKey]) path = fullKey;
      else if (second && mapping[second] === config) path = second;

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
    
    const config = mapping[fullKey] || (second && mapping[second]) || mapping[first];

    if (config?.group) {
      breadcrumbs.push({ label: config.group, path: null });
    }

    if (config) {
      let path = first;
      if (mapping[fullKey]) path = fullKey;
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
      'exams/sbts': { label: 'SBTS', group: 'UJIAN ONLINE' },
      'exams/sas': { label: 'SAS', group: 'UJIAN ONLINE' },
      'exams/sat': { label: 'SAT', group: 'UJIAN ONLINE' },

      // NILAI SAYA / AKADEMIK (depending on status)
      'grades-group': { label: 'NILAI SAYA', group: 'NILAI SAYA' },
      grades: { label: 'Riwayat Nilai', group: isAlumni ? 'AKADEMIK' : 'NILAI SAYA' },

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
    
    let config = mapping[fullKey] || (second && mapping[second]) || mapping[first];

    // Handle "Take Exam" page specifically
    if (first === 'exams' && segments[segments.length - 1] === 'take') {
       const examState = state?.exam;
       if (examState) {
           const type = examState.type; // QUIZ, FORMATIF, SBTS, SAS, SAT
           let typeLabel = 'Ujian';
           let typePath = '/student/exams';
           
           if (type === 'FORMATIF' || type === 'QUIZ') {
               typeLabel = 'Formatif (Quiz)';
               typePath = '/student/exams/formatif';
           } else if (type === 'SBTS') {
               typeLabel = 'SBTS';
               typePath = '/student/exams/sbts';
           } else if (type === 'SAS') {
               typeLabel = 'SAS';
               typePath = '/student/exams/sas';
           } else if (type === 'SAT') {
               typeLabel = 'SAT';
               typePath = '/student/exams/sat';
           }

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

    if (config) {
      let path = first;
      if (mapping[fullKey]) path = fullKey;
      else if (second && mapping[second] === config) path = second;

      breadcrumbs.push({ label: config.label, path: `/${role}/${path}` });
    } else {
      const label =
        first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }

    return breadcrumbs;
  }

  if (role === 'principal') {
    const mapping: Record<string, { label: string; group?: string }> = {
      'academic/reports': { label: 'Rapor & Ranking' },
      'academic/attendance': { label: 'Rekap Absensi' },
      'finance/requests': { label: 'Pengajuan Anggaran' },
      'teachers': { label: 'Data Guru' },
      'students': { label: 'Data Siswa' },
    };
    
    const fullKey = segments.join('/');
    const first = segments[0];
    const config = mapping[fullKey] || mapping[first];

    if (config) {
      breadcrumbs.push({ label: config.label, path: `/${role}/${first}` });
    } else {
      const label = first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
      breadcrumbs.push({ label, path: `/${role}/${first}` });
    }
    return breadcrumbs;
  }

  if (role === 'staff') {
    const mapping: Record<string, { label: string; group?: string }> = {
      'payments': { label: 'Pembayaran (SPP)' },
      'students': { label: 'Data Siswa' },
      'admin': { label: 'Administrasi' },
    };
    
    const fullKey = segments.join('/');
    const first = segments[0];
    const config = mapping[fullKey] || mapping[first];

    if (config) {
      breadcrumbs.push({ label: config.label, path: `/${role}/${first}` });
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
    const config = mapping[fullKey] || mapping[first];

    if (config) {
      breadcrumbs.push({ label: config.label, path: `/${role}/${first}` });
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
  const { data: userResponse, isLoading: isUserLoading } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const user = (userResponse as any)?.data;

  const displayUser = user;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSemester, setActiveSemester] = useState<'ODD' | 'EVEN' | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const location = useLocation();
  const breadcrumbs = getBreadcrumbs(location, user);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
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

  const { data: activeYear, error: activeYearError, isLoading: isLoadingYear } = useActiveAcademicYear();

  if (activeYearError) {
     console.error("Active Year Query Error:", activeYearError);
  }

  useEffect(() => {
    if (activeYear) {
      setActiveSemester(activeYear.semester);
    }
  }, [activeYear]);

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
    <div className="flex h-screen bg-[#F3F4F6]">
      {/* Sidebar for Desktop - Hidden in Fullscreen */}
      {!isFullscreen && <Sidebar user={user} activeSemester={activeSemester} />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Breadcrumbs - Hidden in Fullscreen */}
        {!isFullscreen && (
        <header className="bg-white/80 backdrop-blur-md h-16 flex items-center justify-between px-6 z-10">
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
                    <span className="text-gray-400 uppercase tracking-wider text-xs font-bold px-1">{crumb.label}</span>
                  )}
                </div>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center ml-auto space-x-4">
              <div className="hidden md:block text-sm text-blue-700 font-normal">
                {todayLabel}{yearLabel}
              </div>
            <NotificationDropdown />
          </div>
        </header>
        )}

        {/* Content */}
        <main className={`flex-1 overflow-x-hidden w-full max-w-[100vw] ${isFullscreen ? 'p-0' : 'p-4 md:p-6'}`}>
          <Outlet context={{ user: displayUser, activeYear }} />
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && !isFullscreen && (
        <div 
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Mobile Sidebar */}
      {!isFullscreen && (
      <div className={clsx(
        "fixed inset-y-0 left-0 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-30 md:hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar user={displayUser || { name: 'Guest', role: 'GUEST' }} />
      </div>
      )}
    </div>
  );
};
