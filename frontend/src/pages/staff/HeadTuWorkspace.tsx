import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  Loader2,
  Printer,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { academicYearService } from '../../services/academicYear.service';
import { authService } from '../../services/auth.service';
import {
  candidateAdmissionService,
} from '../../services/candidateAdmission.service';
import { officeService, type OfficeLetter, type OfficeLetterType } from '../../services/office.service';
import { uploadService } from '../../services/upload.service';
import { userService } from '../../services/user.service';
import { permissionService, type StudentPermission } from '../../services/permission.service';
import {
  staffFinanceService,
  type FinanceReportSnapshot,
  type FinanceWriteOffRequest,
} from '../../services/staffFinance.service';
import api from '../../services/api';
import type { User } from '../../types/auth';
import {
  CandidateAdmissionStatusBadge,
  extractCandidateAdmissionListPayload,
  extractCandidateAdmissionPayload,
  formatCandidateDateTime,
  getCandidateDecisionLetterPrintPath,
} from '../public/candidateShared';
import { getStaffDivisionLabel, resolveStaffDivision } from '../../utils/staffRole';

function matchesSearch(term: string, values: Array<string | number | null | undefined>) {
  if (!term) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(term));
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type PermissionRow = StudentPermission & {
  student?: StudentPermission['student'] & {
    studentClass?: {
      name?: string | null;
    } | null;
  };
};

type StaffUser = User & {
  roleLabel?: string;
};

type ExamSittingListRow = {
  id: number;
  roomName: string;
  examType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  sessionLabel?: string | null;
  programSession?: {
    label?: string | null;
  } | null;
};

type ExamSittingDetailRow = ExamSittingListRow & {
  students?: Array<{
    student?: {
      id: number;
      name: string;
      username?: string | null;
      nis?: string | null;
      nisn?: string | null;
      studentClass?: {
        name?: string | null;
      } | null;
    } | null;
  }>;
};

type ExamCardEntry = {
  sittingId: number;
  examType: string;
  roomName: string;
  startTime: string | null;
  endTime: string | null;
  sessionLabel: string | null;
};

type ExamCardRow = {
  studentId: number;
  studentName: string;
  username: string;
  nis: string | null;
  nisn: string | null;
  className: string;
  examCount: number;
  entries: ExamCardEntry[];
};

type CandidateLetterFormState = {
  issueCity: string;
  issueDate: string;
  signerName: string;
  signerPosition: string;
};

const emptyCandidateLetterForm: CandidateLetterFormState = {
  issueCity: 'Bekasi',
  issueDate: new Date().toISOString().slice(0, 10),
  signerName: '',
  signerPosition: 'Kepala Tata Usaha',
};

const HeadTuWorkspace = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/staff';

  const isAdministrationPage = pathname.startsWith('/staff/head-tu/administration');
  const isFinancePage = pathname.startsWith('/staff/head-tu/finance');
  const isStudentsPage = pathname.startsWith('/staff/head-tu/students');
  const isTeachersPage = pathname.startsWith('/staff/head-tu/teachers');
  const isPermissionsPage = pathname.startsWith('/staff/head-tu/permissions');
  const isLettersPage = pathname.startsWith('/staff/head-tu/letters');
  const isExamCardsPage = pathname.startsWith('/staff/head-tu/exam-cards');
  const isDashboardPage =
    !isAdministrationPage &&
    !isFinancePage &&
    !isStudentsPage &&
    !isTeachersPage &&
    !isPermissionsPage &&
    !isLettersPage &&
    !isExamCardsPage;

  const [studentSearch, setStudentSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [examCardSearch, setExamCardSearch] = useState('');
  const [letterArchiveSearch, setLetterArchiveSearch] = useState('');
  const [letterArchiveTypeFilter, setLetterArchiveTypeFilter] = useState<'ALL' | OfficeLetterType>('ALL');
  const [candidateLetterSearch, setCandidateLetterSearch] = useState('');
  const [selectedCandidateLetterId, setSelectedCandidateLetterId] = useState<number | null>(null);
  const [candidateLetterForm, setCandidateLetterForm] = useState<CandidateLetterFormState>(emptyCandidateLetterForm);
  const [candidateOfficialLetterFile, setCandidateOfficialLetterFile] = useState<File | null>(null);
  const [examCardClassFilter, setExamCardClassFilter] = useState<string>('ALL');
  const [examCardExamTypeFilter, setExamCardExamTypeFilter] = useState<string>('ALL');
  const [letterType, setLetterType] = useState<OfficeLetterType>('STUDENT_CERTIFICATE');
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [letterPurpose, setLetterPurpose] = useState('');
  const [letterNotes, setLetterNotes] = useState('');

  const meQuery = useQuery({
    queryKey: ['head-tu-me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });

  const studentsQuery = useQuery({
    queryKey: ['head-tu-students'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const teachersQuery = useQuery({
    queryKey: ['head-tu-teachers'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const staffsQuery = useQuery({
    queryKey: ['head-tu-staffs'],
    queryFn: () => userService.getUsers({ role: 'STAFF', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const principalsQuery = useQuery({
    queryKey: ['head-tu-principals'],
    queryFn: () => userService.getUsers({ role: 'PRINCIPAL', limit: 10 }),
    staleTime: 5 * 60 * 1000,
  });

  const permissionsQuery = useQuery({
    queryKey: ['head-tu-permissions'],
    queryFn: () => permissionService.getPermissions({ limit: 200 }),
    staleTime: 60_000,
  });

  const academicYearsQuery = useQuery({
    queryKey: ['head-tu-academic-years'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const academicYears =
    academicYearsQuery.data?.data?.academicYears || academicYearsQuery.data?.academicYears || [];
  const activeYear = academicYears.find((item: { isActive?: boolean }) => item.isActive) || academicYears[0];

  const financeSnapshotQuery = useQuery({
    queryKey: ['head-tu-finance-snapshot', activeYear?.id || 'none'],
    queryFn: () =>
      staffFinanceService.listReports({
        academicYearId: activeYear?.id,
      }),
    enabled: Boolean(activeYear?.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeWriteOffsQuery = useQuery({
    queryKey: ['head-tu-finance-write-offs'],
    queryFn: () => staffFinanceService.listWriteOffs({ pendingFor: 'HEAD_TU', limit: 50 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const headTuWriteOffDecisionMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceService.decideWriteOffAsHeadTu(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      toast.success(payload.approved ? 'Write-off diteruskan ke Kepala Sekolah' : 'Write-off ditolak');
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-write-offs'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-snapshot'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses approval write-off');
    },
  });

  const officeSummaryQuery = useQuery({
    queryKey: ['head-tu-office-summary', activeYear?.id || 'none'],
    queryFn: () =>
      officeService.getSummary({
        academicYearId: activeYear?.id,
      }),
    enabled: Boolean(activeYear?.id) && (isLettersPage || isDashboardPage),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const officeLettersQuery = useQuery({
    queryKey: ['head-tu-office-letters', activeYear?.id || 'none', letterArchiveTypeFilter, letterArchiveSearch],
    queryFn: () =>
      officeService.listLetters({
        academicYearId: activeYear?.id,
        type: letterArchiveTypeFilter === 'ALL' ? undefined : letterArchiveTypeFilter,
        search: letterArchiveSearch.trim() || undefined,
        limit: 100,
      }),
    enabled: Boolean(activeYear?.id) && isLettersPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const candidateDecisionLettersQuery = useQuery({
    queryKey: ['head-tu-candidate-decision-letters', candidateLetterSearch],
    queryFn: () =>
      candidateAdmissionService.listAdmissions({
        page: 1,
        limit: 100,
        search: candidateLetterSearch.trim() || undefined,
        status: 'ALL',
        publishedOnly: true,
      }),
    enabled: isLettersPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const selectedCandidateDecisionDetailQuery = useQuery({
    queryKey: ['head-tu-candidate-decision-letter-detail', selectedCandidateLetterId],
    queryFn: () => candidateAdmissionService.getAdmissionById(selectedCandidateLetterId as number),
    enabled: isLettersPage && Boolean(selectedCandidateLetterId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const examCardsQuery = useQuery({
    queryKey: ['head-tu-exam-cards', activeYear?.id || 'none'],
    enabled: Boolean(activeYear?.id) && (isExamCardsPage || isDashboardPage),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const listResponse = await api.get('/exam-sittings', {
        params: {
          academicYearId: activeYear?.id,
        },
      });

      const listData = Array.isArray(listResponse.data?.data)
        ? listResponse.data.data
        : Array.isArray(listResponse.data)
          ? listResponse.data
          : [];

      const details = await Promise.all(
        (listData as ExamSittingListRow[]).map(async (row) => {
          const detailResponse = await api.get(`/exam-sittings/${row.id}`);
          return (detailResponse.data?.data || detailResponse.data) as ExamSittingDetailRow;
        }),
      );

      return details;
    },
  });

  const currentUser = meQuery.data?.data as User | undefined;
  const students = useMemo<User[]>(() => studentsQuery.data?.data || [], [studentsQuery.data?.data]);
  const teachers = useMemo<User[]>(() => teachersQuery.data?.data || [], [teachersQuery.data?.data]);
  const staffs = useMemo<User[]>(() => staffsQuery.data?.data || [], [staffsQuery.data?.data]);
  const principals = useMemo<User[]>(() => principalsQuery.data?.data || [], [principalsQuery.data?.data]);
  const permissions = useMemo<PermissionRow[]>(
    () => ((permissionsQuery.data?.data?.permissions as PermissionRow[]) || []),
    [permissionsQuery.data?.data?.permissions],
  );
  const financeSnapshot = financeSnapshotQuery.data as FinanceReportSnapshot | undefined;
  const pendingHeadTuWriteOffs = financeWriteOffsQuery.data?.requests || [];
  const officeSummary = officeSummaryQuery.data;
  const examCardDetails = examCardsQuery.data || [];
  const officeLetters = officeLettersQuery.data?.letters || [];
  const candidateDecisionLettersPayload = useMemo(
    () => extractCandidateAdmissionListPayload(candidateDecisionLettersQuery.data),
    [candidateDecisionLettersQuery.data],
  );
  const candidateDecisionLetterDetail = useMemo(
    () => extractCandidateAdmissionPayload(selectedCandidateDecisionDetailQuery.data),
    [selectedCandidateDecisionDetailQuery.data],
  );

  const administrationStaffCount = staffs.filter(
    (staff) => resolveStaffDivision(staff) === 'ADMINISTRATION',
  ).length;
  const financeStaffCount = staffs.filter((staff) => resolveStaffDivision(staff) === 'FINANCE').length;
  const pendingPermissions = permissions.filter((permission) => permission.status === 'PENDING');
  const pendingStudentVerification = students.filter(
    (student) => student.verificationStatus && student.verificationStatus !== 'VERIFIED',
  ).length;
  const pendingTeacherVerification = teachers.filter(
    (teacher) => teacher.verificationStatus && teacher.verificationStatus !== 'VERIFIED',
  ).length;

  const combinedEducators = useMemo<StaffUser[]>(
    () => [
      ...teachers.map((teacher) => ({ ...teacher, roleLabel: 'Guru' })),
      ...staffs.map((staff) => ({ ...staff, roleLabel: getStaffDivisionLabel(staff) })),
    ],
    [teachers, staffs],
  );

  const normalizedStudentSearch = studentSearch.trim().toLowerCase();
  const normalizedTeacherSearch = teacherSearch.trim().toLowerCase();
  const normalizedPermissionSearch = permissionSearch.trim().toLowerCase();
  const normalizedExamCardSearch = examCardSearch.trim().toLowerCase();

  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        matchesSearch(normalizedStudentSearch, [
          student.name,
          student.nis,
          student.nisn,
          student.studentClass?.name,
          student.studentClass?.major?.name,
          student.verificationStatus,
          student.studentStatus,
        ]),
      ),
    [students, normalizedStudentSearch],
  );

  const filteredEducators = useMemo(
    () =>
      combinedEducators.filter((educator) =>
        matchesSearch(normalizedTeacherSearch, [
          educator.name,
          educator.username,
          educator.nip,
          educator.nuptk,
          educator.ptkType,
          educator.employeeStatus,
          educator.verificationStatus,
          educator.roleLabel,
        ]),
      ),
    [combinedEducators, normalizedTeacherSearch],
  );

  const filteredPermissions = useMemo(
    () =>
      permissions.filter((permission) =>
        matchesSearch(normalizedPermissionSearch, [
          permission.student?.name,
          permission.student?.nis,
          permission.student?.nisn,
          permission.student?.studentClass?.name,
          permission.type,
          permission.status,
          permission.reason,
          permission.approvalNote,
        ]),
      ),
    [permissions, normalizedPermissionSearch],
  );

  const examCardRows = useMemo<ExamCardRow[]>(() => {
    const grouped = new Map<number, ExamCardRow>();

    examCardDetails.forEach((sitting) => {
      const resolvedSessionLabel = String(sitting.programSession?.label || sitting.sessionLabel || '').trim() || null;
      const resolvedExamType = String(sitting.examType || '').trim() || 'UJIAN';

      (sitting.students || []).forEach((row) => {
        const student = row.student;
        if (!student?.id) return;

        if (!grouped.has(student.id)) {
          grouped.set(student.id, {
            studentId: student.id,
            studentName: student.name,
            username: student.username || '-',
            nis: student.nis || null,
            nisn: student.nisn || null,
            className: student.studentClass?.name || '-',
            examCount: 0,
            entries: [],
          });
        }

        const current = grouped.get(student.id)!;
        current.entries.push({
          sittingId: sitting.id,
          examType: resolvedExamType,
          roomName: sitting.roomName || '-',
          startTime: sitting.startTime || null,
          endTime: sitting.endTime || null,
          sessionLabel: resolvedSessionLabel,
        });
        current.examCount = current.entries.length;
      });
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.studentName.localeCompare(b.studentName, 'id-ID', { sensitivity: 'base' }),
    );
  }, [examCardDetails]);

  const examCardClassOptions = useMemo(
    () =>
      Array.from(new Set(examCardRows.map((row) => row.className).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'id-ID', { sensitivity: 'base' }),
      ),
    [examCardRows],
  );

  const examCardExamTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          examCardRows.flatMap((row) => row.entries.map((entry) => entry.examType).filter(Boolean)),
        ),
      ).sort((a, b) => a.localeCompare(b, 'id-ID', { sensitivity: 'base' })),
    [examCardRows],
  );

  const filteredExamCardRows = useMemo(
    () =>
      examCardRows.filter((row) => {
        const matchesKeyword = matchesSearch(normalizedExamCardSearch, [
          row.studentName,
          row.nis,
          row.nisn,
          row.className,
          ...row.entries.flatMap((entry) => [entry.examType, entry.roomName, entry.sessionLabel]),
        ]);
        const matchesClass = examCardClassFilter === 'ALL' || row.className === examCardClassFilter;
        const matchesExamType =
          examCardExamTypeFilter === 'ALL' ||
          row.entries.some((entry) => entry.examType === examCardExamTypeFilter);
        return matchesKeyword && matchesClass && matchesExamType;
      }),
    [examCardRows, normalizedExamCardSearch, examCardClassFilter, examCardExamTypeFilter],
  );

  useEffect(() => {
    if (!isLettersPage) return;
    const rows = candidateDecisionLettersPayload.applications;
    if (rows.length === 0) {
      setSelectedCandidateLetterId(null);
      return;
    }
    const stillExists = rows.some((item) => item.id === selectedCandidateLetterId);
    if (!stillExists) {
      setSelectedCandidateLetterId(rows[0].id);
    }
  }, [candidateDecisionLettersPayload.applications, isLettersPage, selectedCandidateLetterId]);

  useEffect(() => {
    if (!candidateDecisionLetterDetail) return;
    setCandidateLetterForm({
      issueCity: candidateDecisionLetterDetail.decisionLetter.issuedCity || 'Bekasi',
      issueDate: String(
        candidateDecisionLetterDetail.decisionLetter.issuedAt ||
          candidateDecisionLetterDetail.decisionAnnouncement.publishedAt ||
          new Date().toISOString(),
      ).slice(0, 10),
      signerName:
        candidateDecisionLetterDetail.decisionLetter.signerName ||
        currentUser?.name ||
        '',
      signerPosition: candidateDecisionLetterDetail.decisionLetter.signerPosition || 'Kepala Tata Usaha',
    });
    setCandidateOfficialLetterFile(null);
  }, [candidateDecisionLetterDetail, currentUser?.name]);

  const selectedStudentRecipient = students.find((student) => String(student.id) === selectedRecipientId) || null;
  const selectedTeacherRecipient = combinedEducators.find((educator) => String(educator.id) === selectedRecipientId) || null;
  const selectedLetterRecipient =
    letterType === 'STUDENT_CERTIFICATE' || letterType === 'EXAM_CARD_COVER'
      ? selectedStudentRecipient
      : selectedTeacherRecipient;

  const principalSigner = principals[0] || null;

  const letterTypeLabelMap: Record<OfficeLetterType, string> = {
    STUDENT_CERTIFICATE: 'Surat Keterangan Siswa Aktif',
    TEACHER_CERTIFICATE: 'Surat Keterangan Guru/Staff Aktif',
    EXAM_CARD_COVER: 'Surat Pengantar Kartu Ujian',
    CANDIDATE_ADMISSION_RESULT: 'Surat Hasil Seleksi PPDB',
  };

  const openPrintWindow = (title: string, bodyHtml: string) => {
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
            h1, h2, h3, p { margin: 0; }
            .page-title { text-align: center; margin-bottom: 24px; }
            .meta { margin-bottom: 20px; font-size: 14px; line-height: 1.6; }
            .meta-row { display: flex; gap: 8px; }
            .section-title { margin: 20px 0 10px; font-size: 16px; font-weight: 700; }
            .table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
            .table th, .table td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
            .table th { background: #f8fafc; text-align: left; }
            .signature-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 48px; }
            .signature-box { text-align: center; }
            .spacer { height: 56px; }
            .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; margin-bottom: 20px; page-break-inside: avoid; }
            .muted { color: #6b7280; }
            .small { font-size: 12px; }
          </style>
        </head>
        <body>${bodyHtml}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const buildLetterHtml = (options: {
    title: string;
    letterNumber?: string | null;
    recipientName: string;
    username?: string | null;
    primaryId?: string | null;
    recipientContext?: string | null;
    purpose?: string | null;
    notes?: string | null;
    issueDate?: string | null;
  }) => `
      <div class="page-title">
        <h2>SMKS Karya Guna Bhakti 2</h2>
        <p class="muted small">Dokumen Tata Usaha • ${escapeHtml(activeYear?.name || '-')}</p>
        <h1 style="margin-top: 12px;">${escapeHtml(options.title)}</h1>
      </div>
      ${
        options.letterNumber
          ? `<div class="meta"><div class="meta-row"><strong>Nomor Surat</strong><span>:</span><span>${escapeHtml(options.letterNumber)}</span></div></div>`
          : ''
      }
      <div class="meta">
        <div class="meta-row"><strong>Nama</strong><span>:</span><span>${escapeHtml(options.recipientName)}</span></div>
        <div class="meta-row"><strong>Username</strong><span>:</span><span>${escapeHtml(options.username || '-')}</span></div>
        <div class="meta-row"><strong>Identitas</strong><span>:</span><span>${escapeHtml(options.primaryId || '-')}</span></div>
        <div class="meta-row"><strong>Kelas / PTK</strong><span>:</span><span>${escapeHtml(options.recipientContext || '-')}</span></div>
        <div class="meta-row"><strong>Keperluan</strong><span>:</span><span>${escapeHtml(options.purpose || '-')}</span></div>
      </div>
      <p style="line-height:1.8;">
        Dokumen ini diterbitkan oleh Tata Usaha sekolah sebagai bukti administratif bahwa yang bersangkutan tercatat aktif
        pada sistem SIS sekolah untuk tahun ajaran ${escapeHtml(activeYear?.name || '-')}.
      </p>
      ${
        options.notes
          ? `<div class="section-title">Catatan Tambahan</div><p style="line-height:1.8;">${escapeHtml(options.notes)}</p>`
          : ''
      }
      <div class="signature-grid">
        <div class="signature-box">
          <p>Mengetahui,</p>
          <p><strong>Kepala Sekolah</strong></p>
          <div class="spacer"></div>
          <p><strong>${escapeHtml(principalSigner?.name || '-')}</strong></p>
        </div>
        <div class="signature-box">
          <p>Bekasi, ${escapeHtml(formatDate(options.issueDate || new Date().toISOString()))}</p>
          <p><strong>Kepala Tata Usaha</strong></p>
          <div class="spacer"></div>
          <p><strong>${escapeHtml(currentUser?.name || '-')}</strong></p>
        </div>
      </div>
    `;

  const createLetterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLetterRecipient) {
        throw new Error('Penerima surat belum dipilih.');
      }

      const recipientContext =
        'studentClass' in selectedLetterRecipient && selectedLetterRecipient.studentClass?.name
          ? selectedLetterRecipient.studentClass.name
          : 'roleLabel' in selectedLetterRecipient && selectedLetterRecipient.roleLabel
            ? selectedLetterRecipient.roleLabel
            : selectedLetterRecipient.ptkType || null;

      return officeService.createLetter({
        academicYearId: activeYear?.id,
        type: letterType,
        recipientId: selectedLetterRecipient.id,
        recipientName: selectedLetterRecipient.name,
        recipientRole:
          'roleLabel' in selectedLetterRecipient && typeof selectedLetterRecipient.roleLabel === 'string'
            ? selectedLetterRecipient.roleLabel
            : selectedLetterRecipient.ptkType || null,
        recipientClass:
          'studentClass' in selectedLetterRecipient ? selectedLetterRecipient.studentClass?.name || null : null,
        recipientPrimaryId:
          selectedLetterRecipient.nisn ||
          selectedLetterRecipient.nis ||
          selectedLetterRecipient.nip ||
          selectedLetterRecipient.nuptk ||
          null,
        purpose: letterPurpose || null,
        notes: letterNotes || null,
        payload: {
          username: selectedLetterRecipient.username || null,
          recipientContext,
          generatedBy: currentUser?.name || null,
        },
      });
    },
    onSuccess: (letter) => {
      toast.success('Surat berhasil disimpan.');
      queryClient.invalidateQueries({ queryKey: ['head-tu-office-summary'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-office-letters'] });

      const payload = (letter.payload || {}) as Record<string, unknown>;
      const recipientContext =
        letter.recipientClass ||
        letter.recipientRole ||
        (typeof payload.recipientContext === 'string' ? payload.recipientContext : null);

      openPrintWindow(
        `${letter.title} - ${letter.recipientName}`,
        buildLetterHtml({
          title: letter.title,
          letterNumber: letter.letterNumber,
          recipientName: letter.recipientName,
          username: letter.recipient?.username || (typeof payload.username === 'string' ? payload.username : null),
          primaryId: letter.recipientPrimaryId || null,
          recipientContext,
          purpose: letter.purpose || null,
          notes: letter.notes || null,
          issueDate: letter.printedAt || letter.createdAt,
        }),
      );
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan surat.';
      toast.error(message);
    },
  });

  const saveCandidateDecisionLetterMutation = useMutation({
    mutationFn: async (mode: 'save' | 'save-with-upload' | 'clear-official') => {
      if (!selectedCandidateLetterId) {
        throw new Error('Pilih calon siswa terlebih dahulu.');
      }

      let officialLetterUrl: string | null | undefined;
      let officialLetterOriginalName: string | null | undefined;

      if (mode === 'save-with-upload') {
        if (!candidateOfficialLetterFile) {
          throw new Error('Pilih file PDF surat resmi terlebih dahulu.');
        }
        if (!/\.pdf$/i.test(candidateOfficialLetterFile.name)) {
          throw new Error('Surat resmi hasil seleksi harus berupa file PDF.');
        }

        const uploaded = await uploadService.uploadTeacherDocument(candidateOfficialLetterFile);
        officialLetterUrl = String(uploaded?.url || '').trim() || null;
        officialLetterOriginalName = String(uploaded?.originalname || candidateOfficialLetterFile.name || '').trim() || null;
      }

      return candidateAdmissionService.saveDecisionLetter(selectedCandidateLetterId, {
        issueCity: candidateLetterForm.issueCity.trim() || 'Bekasi',
        issueDate: candidateLetterForm.issueDate || undefined,
        signerName: candidateLetterForm.signerName.trim() || undefined,
        signerPosition: candidateLetterForm.signerPosition.trim() || undefined,
        ...(mode === 'save-with-upload'
          ? {
              officialLetterUrl: officialLetterUrl || null,
              officialLetterOriginalName: officialLetterOriginalName || null,
            }
          : {}),
        ...(mode === 'clear-official' ? { clearOfficialLetter: true } : {}),
      });
    },
    onSuccess: async (_data, mode) => {
      toast.success(
        mode === 'save-with-upload'
          ? 'Draft surat dan file resmi berhasil diperbarui.'
          : mode === 'clear-official'
            ? 'File surat resmi berhasil dilepas dari arsip PPDB.'
            : 'Draft surat hasil seleksi berhasil diperbarui.',
      );
      setCandidateOfficialLetterFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['head-tu-candidate-decision-letters'] }),
        queryClient.invalidateQueries({ queryKey: ['head-tu-candidate-decision-letter-detail', selectedCandidateLetterId] }),
        queryClient.invalidateQueries({ queryKey: ['head-tu-office-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['head-tu-office-letters'] }),
      ]);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal memperbarui surat hasil seleksi.';
      toast.error(message);
    },
  });

  const handlePrintLetter = () => {
    if (!selectedLetterRecipient || createLetterMutation.isPending) return;
    createLetterMutation.mutate();
  };

  const handlePrintStoredLetter = (letter: OfficeLetter) => {
    const payload = (letter.payload || {}) as Record<string, unknown>;
    if (
      letter.type === 'CANDIDATE_ADMISSION_RESULT' &&
      typeof payload.candidateAdmissionId === 'number' &&
      payload.candidateAdmissionId > 0
    ) {
      window.open(
        getCandidateDecisionLetterPrintPath(payload.candidateAdmissionId),
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }

    const recipientContext =
      letter.recipientClass ||
      letter.recipientRole ||
      (typeof payload.recipientContext === 'string' ? payload.recipientContext : null);

    openPrintWindow(
      `${letter.title} - ${letter.recipientName}`,
      buildLetterHtml({
        title: letter.title,
        letterNumber: letter.letterNumber,
        recipientName: letter.recipientName,
        username: letter.recipient?.username || (typeof payload.username === 'string' ? payload.username : null),
        primaryId: letter.recipientPrimaryId || null,
        recipientContext,
        purpose: letter.purpose || null,
        notes: letter.notes || null,
        issueDate: letter.printedAt || letter.createdAt,
      }),
    );
  };

  const buildExamCardsHtml = (rows: ExamCardRow[]) => `
    <div class="page-title">
      <h2>SMKS Karya Guna Bhakti 2</h2>
      <p class="muted small">Tata Usaha • ${escapeHtml(activeYear?.name || '-')}</p>
      <h1 style="margin-top: 12px;">Kartu Ujian</h1>
    </div>
    ${rows
      .map(
        (row) => `
          <div class="card">
            <h3 style="margin-bottom: 10px;">${escapeHtml(row.studentName)}</h3>
            <div class="meta">
              <div class="meta-row"><strong>NIS</strong><span>:</span><span>${escapeHtml(row.nis || '-')}</span></div>
              <div class="meta-row"><strong>NISN</strong><span>:</span><span>${escapeHtml(row.nisn || '-')}</span></div>
              <div class="meta-row"><strong>Kelas</strong><span>:</span><span>${escapeHtml(row.className)}</span></div>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th>Jenis Ujian</th>
                  <th>Ruang</th>
                  <th>Sesi</th>
                  <th>Mulai</th>
                  <th>Selesai</th>
                </tr>
              </thead>
              <tbody>
                ${row.entries
                  .map(
                    (entry) => `
                      <tr>
                        <td>${escapeHtml(entry.examType)}</td>
                        <td>${escapeHtml(entry.roomName)}</td>
                        <td>${escapeHtml(entry.sessionLabel || '-')}</td>
                        <td>${escapeHtml(formatDateTime(entry.startTime))}</td>
                        <td>${escapeHtml(formatDateTime(entry.endTime))}</td>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
      )
      .join('')}
    <div class="signature-grid">
      <div class="signature-box">
        <p>Mengetahui,</p>
        <p><strong>Kepala Sekolah</strong></p>
        <div class="spacer"></div>
        <p><strong>${escapeHtml(principalSigner?.name || '-')}</strong></p>
      </div>
      <div class="signature-box">
        <p>Bekasi, ${escapeHtml(formatDate(new Date().toISOString()))}</p>
        <p><strong>Kepala Tata Usaha</strong></p>
        <div class="spacer"></div>
        <p><strong>${escapeHtml(currentUser?.name || '-')}</strong></p>
      </div>
    </div>
  `;

  const handlePrintSingleExamCard = (row: ExamCardRow) => {
    openPrintWindow(`Kartu Ujian - ${row.studentName}`, buildExamCardsHtml([row]));
  };

  const handlePrintAllExamCards = () => {
    if (filteredExamCardRows.length === 0) return;
    openPrintWindow('Kartu Ujian', buildExamCardsHtml(filteredExamCardRows));
  };

  if (isStudentsPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Siswa</h2>
          <p className="mt-1 text-sm text-gray-500">Kontrol data siswa lintas kelas untuk layanan tata usaha.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Cari nama, NIS, NISN, kelas, atau status..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => void studentsQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {studentsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : studentsQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">Gagal memuat data siswa.</div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada data siswa yang cocok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verifikasi</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Siswa</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-gray-500">@{student.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIS: {student.nis || '-'}</div>
                        <div>NISN: {student.nisn || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.studentClass?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.verificationStatus || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.studentStatus || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isTeachersPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Guru & Staff</h2>
          <p className="mt-1 text-sm text-gray-500">Pantau data guru, staff administrasi, staff keuangan, dan kepala TU dalam satu layar.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={teacherSearch}
              onChange={(event) => setTeacherSearch(event.target.value)}
              placeholder="Cari nama, NIP, NUPTK, PTK, atau role..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void teachersQuery.refetch();
              void staffsQuery.refetch();
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {teachersQuery.isLoading || staffsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredEducators.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada data guru/staff yang cocok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PTK</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verifikasi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEducators.map((educator) => (
                    <tr key={`${educator.roleLabel}-${educator.id}`}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{educator.name}</div>
                        <div className="text-xs text-gray-500">@{educator.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{educator.roleLabel || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIP: {educator.nip || '-'}</div>
                        <div>NUPTK: {educator.nuptk || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{educator.ptkType || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{educator.verificationStatus || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isPermissionsPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Perizinan Siswa</h2>
          <p className="mt-1 text-sm text-gray-500">Monitor pengajuan izin siswa lintas kelas untuk kontrol tata usaha.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={permissionSearch}
              onChange={(event) => setPermissionSearch(event.target.value)}
              placeholder="Cari siswa, NISN, alasan, atau status..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => void permissionsQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {permissionsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredPermissions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada data perizinan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rentang</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPermissions.map((permission) => (
                    <tr key={permission.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{permission.student?.name || '-'}</div>
                        <div className="text-xs text-gray-500">
                          NISN: {permission.student?.nisn || '-'}
                          {permission.student?.studentClass?.name ? ` • ${permission.student.studentClass.name}` : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{permission.type}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(permission.startDate)} - {formatDate(permission.endDate)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{permission.status}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{permission.reason || permission.approvalNote || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isLettersPage) {
    const recipientOptions: Array<User | StaffUser> =
      letterType === 'TEACHER_CERTIFICATE'
        ? combinedEducators
        : students;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Surat-Menyurat</h2>
          <p className="mt-1 text-sm text-gray-500">Buat surat administrasi sekolah untuk siswa, guru/staff, dan layanan ujian.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-gray-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-slate-700/80">Total Arsip Surat</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{officeSummary?.totalLetters?.toLocaleString('id-ID') || 0}</p>
            <p className="mt-1 text-xs text-slate-700/70">Semua surat tahun ajaran aktif</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Surat Bulan Ini</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{officeSummary?.monthlyLetters?.toLocaleString('id-ID') || 0}</p>
            <p className="mt-1 text-xs text-blue-700/70">Otomatis terarsip setiap cetak</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Tipe Surat Aktif</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{officeSummary?.byType?.length || 0}</p>
            <p className="mt-1 text-xs text-emerald-700/70">Jenis surat yang sudah pernah diterbitkan</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Surat Hasil Seleksi PPDB</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Antrean calon siswa dengan pengumuman hasil yang sudah resmi dipublikasikan.
                </p>
              </div>
              <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={candidateLetterSearch}
                  onChange={(event) => setCandidateLetterSearch(event.target.value)}
                  placeholder="Cari nama, nomor pendaftaran, NISN..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs uppercase tracking-wider text-blue-700/80">Antrean Surat</p>
                <p className="mt-2 text-2xl font-bold text-blue-900">
                  {candidateDecisionLettersPayload.applications.length.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wider text-emerald-700/80">Sudah Final Draft</p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">
                  {candidateDecisionLettersPayload.applications
                    .filter((item) => item.decisionLetter?.isFinalized)
                    .length.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wider text-amber-700/80">Surat Resmi Diunggah</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">
                  {candidateDecisionLettersPayload.applications
                    .filter((item) => item.decisionLetter?.officialFileUrl)
                    .length.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              {candidateDecisionLettersQuery.isLoading ? (
                <div className="flex py-12 justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : candidateDecisionLettersQuery.isError ? (
                <div className="py-10 text-center text-sm text-red-600">
                  Gagal memuat antrean surat hasil seleksi.
                </div>
              ) : candidateDecisionLettersPayload.applications.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  Belum ada pengumuman hasil seleksi yang siap difinalkan menjadi surat.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Calon Siswa
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Surat
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {candidateDecisionLettersPayload.applications.map((item) => (
                      <tr key={item.id} className={selectedCandidateLetterId === item.id ? 'bg-blue-50/60' : ''}>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="font-medium text-gray-900">{item.user.name}</div>
                          <div className="text-xs text-gray-500">
                            {item.registrationNumber} • {item.user.nisn || item.user.username}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <CandidateAdmissionStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="font-medium text-gray-900">
                            {item.decisionLetter?.letterNumber || 'Draft otomatis'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.decisionLetter?.officialFileUrl ? 'Surat resmi tersedia' : 'Belum ada file resmi'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <button
                            type="button"
                            onClick={() => setSelectedCandidateLetterId(item.id)}
                            className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            Kelola
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            {!selectedCandidateLetterId ? (
              <div className="py-16 text-center text-sm text-gray-500">
                Pilih salah satu calon siswa untuk memfinalkan draft surat hasil seleksi.
              </div>
            ) : selectedCandidateDecisionDetailQuery.isLoading ? (
              <div className="flex py-16 justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : !candidateDecisionLetterDetail ? (
              <div className="py-16 text-center text-sm text-gray-500">
                Detail surat hasil seleksi tidak ditemukan.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {candidateDecisionLetterDetail.user.name}
                    </h3>
                    <CandidateAdmissionStatusBadge status={candidateDecisionLetterDetail.status} />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {candidateDecisionLetterDetail.registrationNumber} •{' '}
                    {candidateDecisionLetterDetail.user.nisn || candidateDecisionLetterDetail.user.username}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold text-slate-900">Judul keputusan:</span>{' '}
                    {candidateDecisionLetterDetail.decisionAnnouncement.title || 'Hasil Seleksi PPDB'}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-slate-900">Ringkasan:</span>{' '}
                    {candidateDecisionLetterDetail.decisionAnnouncement.summary || '-'}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-slate-900">Dipublikasikan:</span>{' '}
                    {formatCandidateDateTime(candidateDecisionLetterDetail.decisionAnnouncement.publishedAt)}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-slate-900">Draft surat:</span>{' '}
                    {candidateDecisionLetterDetail.decisionLetter.isFinalized
                      ? `Sudah difinalkan (${candidateDecisionLetterDetail.decisionLetter.letterNumber || '-'})`
                      : 'Masih draft otomatis sistem'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    to={getCandidateDecisionLetterPrintPath(candidateDecisionLetterDetail.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Buka Draft Surat
                  </Link>
                  {candidateDecisionLetterDetail.decisionLetter.officialFileUrl ? (
                    <a
                      href={candidateDecisionLetterDetail.decisionLetter.officialFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      Buka Surat Resmi
                    </a>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-gray-900">Finalisasi Draft Surat</h4>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Kota Surat</label>
                      <input
                        type="text"
                        value={candidateLetterForm.issueCity}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, issueCity: event.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Tanggal Surat</label>
                      <input
                        type="date"
                        value={candidateLetterForm.issueDate}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, issueDate: event.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Nama Penandatangan TU</label>
                      <input
                        type="text"
                        value={candidateLetterForm.signerName}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, signerName: event.target.value }))
                        }
                        placeholder="Nama Kepala Tata Usaha"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Jabatan Penandatangan</label>
                      <input
                        type="text"
                        value={candidateLetterForm.signerPosition}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, signerPosition: event.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <label className="block text-sm font-medium text-gray-700">Upload Surat Resmi Bertanda Tangan (PDF)</label>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(event) => setCandidateOfficialLetterFile(event.target.files?.[0] || null)}
                      className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-700"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Upload bersifat opsional. Jika belum ada PDF resmi, calon siswa tetap bisa melihat draft otomatis dari sistem.
                    </p>
                    {candidateOfficialLetterFile ? (
                      <p className="mt-2 text-xs font-semibold text-blue-700">
                        File siap diunggah: {candidateOfficialLetterFile.name}
                      </p>
                    ) : null}
                    {candidateDecisionLetterDetail.decisionLetter.officialFileUrl ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        Surat resmi aktif: {candidateDecisionLetterDetail.decisionLetter.officialOriginalName || 'PDF resmi'} •
                        diunggah {formatCandidateDateTime(candidateDecisionLetterDetail.decisionLetter.officialUploadedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => saveCandidateDecisionLetterMutation.mutate('save')}
                      disabled={saveCandidateDecisionLetterMutation.isPending}
                      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {saveCandidateDecisionLetterMutation.isPending ? 'Menyimpan...' : 'Simpan Draft Surat'}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCandidateDecisionLetterMutation.mutate('save-with-upload')}
                      disabled={saveCandidateDecisionLetterMutation.isPending || !candidateOfficialLetterFile}
                      className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      Simpan + Upload Surat Resmi
                    </button>
                    {candidateDecisionLetterDetail.decisionLetter.officialFileUrl ? (
                      <button
                        type="button"
                        onClick={() => saveCandidateDecisionLetterMutation.mutate('clear-official')}
                        disabled={saveCandidateDecisionLetterMutation.isPending}
                        className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Lepas Surat Resmi
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Jenis Surat</label>
              <select
                value={letterType}
                onChange={(event) => {
                  setLetterType(event.target.value as OfficeLetterType);
                  setSelectedRecipientId('');
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <option value="STUDENT_CERTIFICATE">Surat Keterangan Siswa Aktif</option>
                <option value="TEACHER_CERTIFICATE">Surat Keterangan Guru/Staff Aktif</option>
                <option value="EXAM_CARD_COVER">Surat Pengantar Kartu Ujian</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Penerima</label>
              <select
                value={selectedRecipientId}
                onChange={(event) => setSelectedRecipientId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <option value="">Pilih penerima surat</option>
                {recipientOptions.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name}
                    {'studentClass' in recipient && recipient.studentClass?.name
                      ? ` • ${recipient.studentClass.name}`
                      : 'roleLabel' in recipient && recipient.roleLabel
                        ? ` • ${recipient.roleLabel}`
                        : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handlePrintLetter}
                disabled={!selectedLetterRecipient || createLetterMutation.isPending}
                className="inline-flex items-center justify-center w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-200 disabled:cursor-not-allowed"
              >
                {createLetterMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4 mr-2" />
                )}
                Simpan & Print Surat
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Keperluan</label>
            <input
              type="text"
              value={letterPurpose}
              onChange={(event) => setLetterPurpose(event.target.value)}
              placeholder="Contoh: Persyaratan beasiswa, arsip pribadi, administrasi ujian"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Catatan Tambahan</label>
            <textarea
              value={letterNotes}
              onChange={(event) => setLetterNotes(event.target.value)}
              rows={4}
              placeholder="Isi catatan tambahan jika diperlukan."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900">Preview Ringkas</h3>
          {!selectedLetterRecipient ? (
            <p className="mt-3 text-sm text-gray-500">Pilih jenis surat dan penerima untuk melihat ringkasan surat.</p>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <p><span className="font-semibold text-gray-900">Penerima:</span> {selectedLetterRecipient.name}</p>
              <p><span className="font-semibold text-gray-900">Identitas:</span> {selectedLetterRecipient.nisn || selectedLetterRecipient.nip || selectedLetterRecipient.nuptk || '-'}</p>
              <p>
                <span className="font-semibold text-gray-900">Kelas / PTK:</span>{' '}
                {'studentClass' in selectedLetterRecipient
                  ? selectedLetterRecipient.studentClass?.name || '-'
                  : selectedLetterRecipient.ptkType || '-'}
              </p>
              <p><span className="font-semibold text-gray-900">Keperluan:</span> {letterPurpose || '-'}</p>
              <p><span className="font-semibold text-gray-900">Ditandatangani:</span> Kepala Sekolah dan Kepala TU</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Arsip Surat</h3>
              <p className="mt-1 text-xs text-gray-500">Semua surat yang sudah diterbitkan oleh Kepala TU bisa dicetak ulang dari sini.</p>
            </div>
            <div className="flex w-full flex-col gap-3 md:max-w-2xl md:flex-row">
              <select
                value={letterArchiveTypeFilter}
                onChange={(event) => setLetterArchiveTypeFilter(event.target.value as 'ALL' | OfficeLetterType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 md:max-w-xs"
              >
                <option value="ALL">Semua jenis surat</option>
                <option value="STUDENT_CERTIFICATE">Surat Keterangan Siswa Aktif</option>
                <option value="TEACHER_CERTIFICATE">Surat Keterangan Guru/Staff Aktif</option>
                <option value="EXAM_CARD_COVER">Surat Pengantar Kartu Ujian</option>
                <option value="CANDIDATE_ADMISSION_RESULT">Surat Hasil Seleksi PPDB</option>
              </select>
              <div className="relative w-full">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={letterArchiveSearch}
                  onChange={(event) => setLetterArchiveSearch(event.target.value)}
                  placeholder="Cari nomor surat, penerima, atau keperluan..."
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {officeLettersQuery.isLoading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : officeLettersQuery.isError ? (
              <div className="py-10 text-center text-sm text-red-600">Gagal memuat arsip surat.</div>
            ) : officeLetters.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">Belum ada arsip surat yang sesuai.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomor Surat</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Penerima</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keperluan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dicetak</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {officeLetters.map((letter) => (
                    <tr key={letter.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{letter.letterNumber}</div>
                        <div className="text-xs text-gray-500">{letter.academicYear?.name || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{letterTypeLabelMap[letter.type]}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="font-medium text-gray-900">{letter.recipientName}</div>
                        <div className="text-xs text-gray-500">{letter.recipientClass || letter.recipientRole || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{letter.purpose || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(letter.printedAt || letter.createdAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <button
                          type="button"
                          onClick={() => handlePrintStoredLetter(letter)}
                          className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Print Ulang
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isExamCardsPage) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Kartu Ujian</h2>
            <p className="mt-1 text-sm text-gray-500">Cetak kartu ujian siswa berdasarkan data ruang, sesi, dan peserta ujian yang aktif.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void examCardsQuery.refetch()}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={handlePrintAllExamCards}
              disabled={filteredExamCardRows.length === 0}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-200 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Semua
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={examCardSearch}
                onChange={(event) => setExamCardSearch(event.target.value)}
                placeholder="Cari nama siswa, NISN, kelas, ruang, atau jenis ujian..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>
            <select
              value={examCardClassFilter}
              onChange={(event) => setExamCardClassFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 md:max-w-xs"
            >
              <option value="ALL">Semua kelas</option>
              {examCardClassOptions.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
            <select
              value={examCardExamTypeFilter}
              onChange={(event) => setExamCardExamTypeFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 md:max-w-xs"
            >
              <option value="ALL">Semua jenis ujian</option>
              {examCardExamTypeOptions.map((examType) => (
                <option key={examType} value={examType}>
                  {examType}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-500">
            {filteredExamCardRows.length} siswa • {examCardRows.length} total data kartu
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {examCardsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredExamCardRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada data kartu ujian yang bisa ditampilkan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jadwal Ujian</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredExamCardRows.map((row) => (
                    <tr key={row.studentId}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{row.studentName}</div>
                        <div className="text-xs text-gray-500">@{row.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIS: {row.nis || '-'}</div>
                        <div>NISN: {row.nisn || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{row.className}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="space-y-2">
                          {row.entries.map((entry) => (
                            <div key={`${row.studentId}-${entry.sittingId}`} className="rounded-lg border border-gray-100 px-3 py-2">
                              <div className="font-medium text-gray-900">{entry.examType}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Ruang {entry.roomName}
                                {entry.sessionLabel ? ` • ${entry.sessionLabel}` : ''}
                              </div>
                              <div className="text-xs text-gray-500">{formatDateTime(entry.startTime)} - {formatDateTime(entry.endTime)}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <button
                          type="button"
                          onClick={() => handlePrintSingleExamCard(row)}
                          className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isFinancePage) {
    const summary = financeSnapshot?.summary;
    const classRecap = financeSnapshot?.classRecap || [];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Monitoring Keuangan</h2>
          <p className="mt-1 text-sm text-gray-500">Ringkasan performa tagihan dan piutang siswa untuk kontrol Kepala TU.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-violet-700/80">Total Tagihan</p>
            <p className="mt-2 text-2xl font-bold text-violet-900">{summary ? summary.totalInvoices.toLocaleString('id-ID') : '-'}</p>
            <p className="mt-1 text-xs text-violet-800/70">Invoice aktif</p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-orange-700/80">Outstanding</p>
            <p className="mt-2 text-xl font-bold text-orange-900">{summary ? `Rp ${summary.totalOutstanding.toLocaleString('id-ID')}` : '-'}</p>
            <p className="mt-1 text-xs text-orange-800/70">Belum terbayar</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Terbayar</p>
            <p className="mt-2 text-xl font-bold text-emerald-900">{summary ? `Rp ${summary.totalPaid.toLocaleString('id-ID')}` : '-'}</p>
            <p className="mt-1 text-xs text-emerald-800/70">Pembayaran tercatat</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-rose-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-red-700/80">Tagihan Overdue</p>
            <p className="mt-2 text-2xl font-bold text-red-900">{summary ? summary.overdueInvoices.toLocaleString('id-ID') : '-'}</p>
            <p className="mt-1 text-xs text-red-800/70">Perlu tindak lanjut</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Rekap Kelas</h3>
          </div>
          {financeSnapshotQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : classRecap.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada rekap kelas keuangan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Overdue</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {classRecap.map((row) => (
                    <tr key={`${row.classId}-${row.className}`}>
                      <td className="px-6 py-4 text-sm text-gray-900">{row.className}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.studentCount.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.invoiceCount.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">Rp {row.totalOutstanding.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.overdueCount.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Approval Write-Off</h3>
              <p className="mt-1 text-xs text-gray-500">
                Review pengajuan penghapusan piutang sebelum diteruskan ke Kepala Sekolah.
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingHeadTuWriteOffs.length} menunggu
            </span>
          </div>
          {financeWriteOffsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : pendingHeadTuWriteOffs.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada approval write-off yang menunggu.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pengajuan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nominal</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingHeadTuWriteOffs.map((request: FinanceWriteOffRequest) => (
                    <tr key={request.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{request.requestNo}</div>
                        <div className="text-xs text-gray-500 mt-1">{request.student?.name || '-'} • {request.student?.studentClass?.name || '-'}</div>
                        <div className="text-xs text-gray-500 mt-1">{request.reason}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{request.invoice?.invoiceNo || '-'}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Outstanding {request.invoice ? `Rp ${Math.round(request.invoice.balanceAmount).toLocaleString('id-ID')}` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        <div>Request Rp {Math.round(request.requestedAmount).toLocaleString('id-ID')}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => headTuWriteOffDecisionMutation.mutate({ requestId: request.id, approved: false })}
                            disabled={headTuWriteOffDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() => headTuWriteOffDecisionMutation.mutate({ requestId: request.id, approved: true })}
                            disabled={headTuWriteOffDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Teruskan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isAdministrationPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Operasional Tata Usaha</h2>
          <p className="mt-1 text-sm text-gray-500">Kontrol operasional staff administrasi dan layanan siswa/guru dalam satu dashboard.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Siswa Aktif</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{students.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-blue-800/70">Database siswa</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Guru Aktif</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{teachers.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-emerald-800/70">Data guru</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-violet-700/80">Staff TU</p>
            <p className="mt-2 text-2xl font-bold text-violet-900">{(administrationStaffCount + financeStaffCount + 1).toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-violet-800/70">Administrasi, keuangan, Kepala TU</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-amber-700/80">Perizinan Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{pendingPermissions.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-amber-800/70">Butuh tindak lanjut</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Antrian Administrasi</h3>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                <p className="font-medium text-gray-900">Verifikasi siswa pending</p>
                <p className="text-gray-500 mt-1">{pendingStudentVerification} akun siswa menunggu verifikasi.</p>
              </div>
              <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                <p className="font-medium text-gray-900">Verifikasi guru pending</p>
                <p className="text-gray-500 mt-1">{pendingTeacherVerification} akun guru perlu review.</p>
              </div>
              <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                <p className="font-medium text-gray-900">Komposisi staff</p>
                <p className="text-gray-500 mt-1">Administrasi: {administrationStaffCount} • Keuangan: {financeStaffCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Akses Cepat</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/staff/head-tu/students" className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                <GraduationCap className="w-4 h-4 mr-2" /> Data Siswa
              </Link>
              <Link to="/staff/head-tu/teachers" className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                <Users className="w-4 h-4 mr-2" /> Data Guru & Staff
              </Link>
              <Link to="/staff/head-tu/permissions" className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                <ShieldCheck className="w-4 h-4 mr-2" /> Perizinan Siswa
              </Link>
              <Link to="/staff/head-tu/letters" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <FileText className="w-4 h-4 mr-2" /> Surat-Menyurat
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Kepala Tata Usaha</h2>
        <p className="mt-1 text-sm text-gray-500">Kontrol layanan administrasi, keuangan, operasional TU, surat sekolah, dan kartu ujian.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <Link to="/staff/head-tu/administration" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Siswa Aktif</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{students.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-blue-800/70">Buka operasional TU</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/teachers" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Guru & Staff</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{combinedEducators.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-emerald-800/70">Pantau SDM sekolah</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/permissions" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-amber-700/80">Perizinan Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{pendingPermissions.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-amber-800/70">Layanan administrasi</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-violet-700/80">Outstanding</p>
            <p className="mt-2 text-xl font-bold text-violet-900">{financeSnapshot?.summary ? `Rp ${financeSnapshot.summary.totalOutstanding.toLocaleString('id-ID')}` : '-'}</p>
            <p className="mt-1 text-xs text-violet-800/70">Tagihan belum lunas</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/letters" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-gray-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-slate-700/80">Surat-Menyurat</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{officeSummary?.monthlyLetters?.toLocaleString('id-ID') || 0}</p>
            <p className="mt-1 text-xs text-slate-800/70">{officeSummary?.totalLetters?.toLocaleString('id-ID') || 0} arsip surat aktif</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/exam-cards" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-pink-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-rose-700/80">Kartu Ujian</p>
            <p className="mt-2 text-2xl font-bold text-rose-900">{examCardRows.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-rose-800/70">Siswa dengan kartu ujian</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Kontrol Operasional TU</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="font-medium text-gray-900">Staff administrasi aktif</p>
              <p className="text-gray-500 mt-1">{administrationStaffCount} personel menangani administrasi siswa/guru.</p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="font-medium text-gray-900">Staff keuangan aktif</p>
              <p className="text-gray-500 mt-1">{financeStaffCount} personel menangani billing dan pembayaran.</p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="font-medium text-gray-900">Tahun ajaran aktif</p>
              <p className="text-gray-500 mt-1">{activeYear?.name || '-'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-gray-900">Akses Cepat Kepala TU</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/staff/head-tu/letters" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <FileText className="w-4 h-4 mr-2" /> Surat-Menyurat
            </Link>
            <Link to="/staff/head-tu/exam-cards" className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              <ClipboardList className="w-4 h-4 mr-2" /> Kartu Ujian
            </Link>
            <Link to="/staff/head-tu/finance" className="inline-flex items-center justify-center rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50">
              <CreditCard className="w-4 h-4 mr-2" /> Monitoring Keuangan
            </Link>
            <Link to="/staff/head-tu/administration" className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              <Users className="w-4 h-4 mr-2" /> Operasional TU
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeadTuWorkspace;
