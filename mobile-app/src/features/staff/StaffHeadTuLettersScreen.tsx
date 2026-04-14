import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { ENV } from '../../config/env';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../lib/ui/feedback';
import { openWebModuleRoute } from '../../lib/navigation/webModuleRoute';
import { createHtmlPreviewEntry } from '../../lib/viewer/htmlPreviewStore';
import { academicYearApi } from '../academicYear/academicYearApi';
import { adminApi } from '../admin/adminApi';
import { useAuth } from '../auth/AuthProvider';
import type { MobileCandidateAdmissionDetail } from '../candidateAdmission/types';
import { profileApi } from '../profile/profileApi';
import { headTuOfficeApi, type OfficeLetter, type OfficeLetterType } from './headTuOfficeApi';
import { resolveStaffDivision } from './staffRole';
import { staffApi } from './staffApi';
import type { StaffPersonnel, StaffStudent } from './types';

type CandidateLetterFormState = {
  issueCity: string;
  issueDate: string;
  signerName: string;
  signerPosition: string;
};

type RecipientOption = {
  id: number;
  name: string;
  username?: string | null;
  primaryId?: string | null;
  context?: string | null;
  recipientRole?: string | null;
  recipientClass?: string | null;
};

const LETTER_TYPE_OPTIONS: Array<{ value: OfficeLetterType; label: string }> = [
  { value: 'STUDENT_CERTIFICATE', label: 'Surat Keterangan Siswa Aktif' },
  { value: 'TEACHER_CERTIFICATE', label: 'Surat Keterangan Guru/Staff Aktif' },
  { value: 'EXAM_CARD_COVER', label: 'Surat Pengantar Kartu Ujian' },
];

const LETTER_ARCHIVE_FILTERS: Array<{ value: 'ALL' | OfficeLetterType; label: string }> = [
  { value: 'ALL', label: 'Semua' },
  { value: 'STUDENT_CERTIFICATE', label: 'Siswa' },
  { value: 'TEACHER_CERTIFICATE', label: 'Guru/Staff' },
  { value: 'EXAM_CARD_COVER', label: 'Kartu Ujian' },
  { value: 'CANDIDATE_ADMISSION_RESULT', label: 'PPDB' },
];

const STATUS_META: Record<string, { bg: string; border: string; text: string; label: string }> = {
  DRAFT: { bg: '#e2e8f0', border: '#cbd5e1', text: '#475569', label: 'Draft' },
  SUBMITTED: { bg: '#e0f2fe', border: '#bae6fd', text: '#0369a1', label: 'Dikirim' },
  UNDER_REVIEW: { bg: '#fef3c7', border: '#fde68a', text: '#b45309', label: 'Direview' },
  NEEDS_REVISION: { bg: '#ffedd5', border: '#fdba74', text: '#c2410c', label: 'Perlu Revisi' },
  TEST_SCHEDULED: { bg: '#e0e7ff', border: '#c7d2fe', text: '#4338ca', label: 'Tes' },
  PASSED_TEST: { bg: '#dcfce7', border: '#bbf7d0', text: '#15803d', label: 'Lulus Tes' },
  FAILED_TEST: { bg: '#fee2e2', border: '#fecaca', text: '#b91c1c', label: 'Belum Lulus' },
  ACCEPTED: { bg: '#dcfce7', border: '#bbf7d0', text: '#15803d', label: 'Diterima' },
  REJECTED: { bg: '#fee2e2', border: '#fecaca', text: '#b91c1c', label: 'Ditolak' },
};

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

function toDateInputValue(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolvePublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const base = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return fileUrl.startsWith('/') ? `${base}${fileUrl}` : `${base}/${fileUrl}`;
}

function buildCandidateLetterForm(detail?: MobileCandidateAdmissionDetail | null): CandidateLetterFormState {
  return {
    issueCity: detail?.decisionLetter.issuedCity || 'Bekasi',
    issueDate: toDateInputValue(detail?.decisionLetter.issuedAt || new Date().toISOString()),
    signerName: detail?.decisionLetter.signerName || '',
    signerPosition: detail?.decisionLetter.signerPosition || 'Kepala Tata Usaha',
  };
}

function buildRecipientOptions(
  letterType: OfficeLetterType,
  students: StaffStudent[],
  teachers: StaffPersonnel[],
  staffs: StaffPersonnel[],
): RecipientOption[] {
  if (letterType === 'TEACHER_CERTIFICATE') {
    return [...teachers, ...staffs].map((item) => ({
      id: item.id,
      name: item.name,
      username: item.username,
      primaryId: item.nip || item.nuptk || null,
      context: item.ptkType || 'Guru / Staff',
      recipientRole: item.ptkType || 'Guru / Staff',
      recipientClass: null,
    }));
  }

  return students.map((item) => ({
    id: item.id,
    name: item.name,
    username: item.username,
    primaryId: item.nisn || item.nis || null,
    context: item.studentClass?.name || '-',
    recipientRole: null,
    recipientClass: item.studentClass?.name || null,
  }));
}

function getLetterTypeLabel(type: OfficeLetterType) {
  return LETTER_ARCHIVE_FILTERS.find((item) => item.value === type)?.label || type.replace(/_/g, ' ');
}

function buildLetterHtml(options: {
  activeYearName: string;
  principalName: string;
  headTuName: string;
  title: string;
  letterNumber?: string | null;
  recipientName: string;
  username?: string | null;
  primaryId?: string | null;
  recipientContext?: string | null;
  purpose?: string | null;
  notes?: string | null;
  issueDate?: string | null;
}) {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
        .card { background: #fff; border: 1px solid #dbe7fb; border-radius: 18px; padding: 20px; }
        h1, h2, p { margin: 0; }
        .muted { color: #64748b; }
        .meta { margin-top: 16px; display: grid; gap: 10px; }
        .row { display: grid; grid-template-columns: 120px 12px 1fr; gap: 8px; font-size: 14px; }
        .content { margin-top: 18px; font-size: 14px; line-height: 1.7; }
        .signature { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .signature-box { border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px; min-height: 148px; }
        .spacer { height: 56px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>SMKS Karya Guna Bhakti 2</h2>
        <p class="muted" style="margin-top: 4px;">Dokumen Tata Usaha • ${escapeHtml(options.activeYearName || '-')}</p>
        <h1 style="margin-top: 14px; font-size: 24px;">${escapeHtml(options.title)}</h1>
        ${
          options.letterNumber
            ? `<p class="muted" style="margin-top: 8px;">Nomor Surat: ${escapeHtml(options.letterNumber)}</p>`
            : ''
        }
        <div class="meta">
          <div class="row"><strong>Nama</strong><span>:</span><span>${escapeHtml(options.recipientName)}</span></div>
          <div class="row"><strong>Username</strong><span>:</span><span>${escapeHtml(options.username || '-')}</span></div>
          <div class="row"><strong>Identitas</strong><span>:</span><span>${escapeHtml(options.primaryId || '-')}</span></div>
          <div class="row"><strong>Kelas / PTK</strong><span>:</span><span>${escapeHtml(options.recipientContext || '-')}</span></div>
          <div class="row"><strong>Keperluan</strong><span>:</span><span>${escapeHtml(options.purpose || '-')}</span></div>
        </div>
        <div class="content">
          <p>Dokumen ini diterbitkan oleh Tata Usaha sekolah sebagai bukti administratif bahwa yang bersangkutan tercatat aktif pada sistem SIS sekolah untuk tahun ajaran ${escapeHtml(options.activeYearName || '-')}.</p>
          ${
            options.notes
              ? `<p style="margin-top: 14px;"><strong>Catatan Tambahan:</strong><br />${escapeHtml(options.notes)}</p>`
              : ''
          }
        </div>
        <div class="signature">
          <div class="signature-box">
            <p>Mengetahui,</p>
            <p><strong>Kepala Sekolah</strong></p>
            <div class="spacer"></div>
            <p><strong>${escapeHtml(options.principalName || '-')}</strong></p>
          </div>
          <div class="signature-box">
            <p>Bekasi, ${escapeHtml(formatDate(options.issueDate || new Date().toISOString()))}</p>
            <p><strong>Kepala Tata Usaha</strong></p>
            <div class="spacer"></div>
            <p><strong>${escapeHtml(options.headTuName || '-')}</strong></p>
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

function SectionCard({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 18,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>{title}</Text>
      {helper ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{helper}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 9,
          color: '#0f172a',
          backgroundColor: '#fff',
          minHeight: multiline ? 88 : undefined,
        }}
      />
    </View>
  );
}

function OutlineButton({
  icon,
  label,
  onPress,
  disabled = false,
  tone = 'blue',
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'blue' | 'emerald' | 'rose' | 'slate';
}) {
  const palette =
    tone === 'emerald'
      ? { border: '#a7f3d0', text: '#047857', bg: '#ecfdf5' }
      : tone === 'rose'
        ? { border: '#fecdd3', text: '#be123c', bg: '#fff1f2' }
        : tone === 'slate'
          ? { border: '#cbd5e1', text: '#475569', bg: '#f8fafc' }
          : { border: '#bfdbfe', text: '#1d4ed8', bg: '#eff6ff' };

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: disabled ? '#f8fafc' : palette.bg,
        paddingVertical: 11,
        paddingHorizontal: 14,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Feather name={icon} size={16} color={palette.text} />
      <Text style={{ color: palette.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 14,
        backgroundColor: '#f8fafc',
        padding: 14,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textMuted }}>{message}</Text>
    </View>
  );
}

function StatusChip({ status }: { status?: string | null }) {
  const meta = STATUS_META[String(status || '').toUpperCase()] || STATUS_META.DRAFT;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: meta.border,
        backgroundColor: meta.bg,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: meta.text, fontSize: 11, fontWeight: '700' }}>{meta.label}</Text>
    </View>
  );
}

export function StaffHeadTuLettersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const division = resolveStaffDivision(user);
  const [letterType, setLetterType] = useState<OfficeLetterType>('STUDENT_CERTIFICATE');
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | null>(null);
  const [letterPurpose, setLetterPurpose] = useState('');
  const [letterNotes, setLetterNotes] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveType, setArchiveType] = useState<'ALL' | OfficeLetterType>('ALL');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [candidateFormDraft, setCandidateFormDraft] = useState<CandidateLetterFormState>(buildCandidateLetterForm());
  const [candidateFormDraftTargetId, setCandidateFormDraftTargetId] = useState<number | null>(null);
  const [candidateOfficialFile, setCandidateOfficialFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [candidateOfficialFileTargetId, setCandidateOfficialFileTargetId] = useState<number | null>(null);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-head-tu-letters-active-year', user?.id],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => academicYearApi.getActive({ allowStaleOnError: true }),
    staleTime: 5 * 60 * 1000,
  });

  const studentsQuery = useQuery({
    queryKey: ['mobile-head-tu-letters-students'],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => staffApi.listStudents(),
    staleTime: 60 * 1000,
  });

  const teachersQuery = useQuery({
    queryKey: ['mobile-head-tu-letters-teachers'],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => staffApi.listTeachers(),
    staleTime: 60 * 1000,
  });

  const staffsQuery = useQuery({
    queryKey: ['mobile-head-tu-letters-staffs'],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => staffApi.listStaffs(),
    staleTime: 60 * 1000,
  });

  const principalsQuery = useQuery({
    queryKey: ['mobile-head-tu-letters-principals'],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => staffApi.listPrincipals(),
    staleTime: 5 * 60 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: ['mobile-head-tu-office-summary', activeYearQuery.data?.id || 'none'],
    enabled: Boolean(activeYearQuery.data?.id) && isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () => headTuOfficeApi.getSummary({ academicYearId: activeYearQuery.data?.id }),
    staleTime: 60 * 1000,
  });

  const lettersQuery = useQuery({
    queryKey: ['mobile-head-tu-office-letters', activeYearQuery.data?.id || 'none', archiveType, archiveSearch],
    enabled: Boolean(activeYearQuery.data?.id) && isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () =>
      headTuOfficeApi.listLetters({
        academicYearId: activeYearQuery.data?.id,
        type: archiveType === 'ALL' ? undefined : archiveType,
        search: archiveSearch.trim() || undefined,
        limit: 100,
      }),
    staleTime: 60 * 1000,
  });

  const candidateListQuery = useQuery({
    queryKey: ['mobile-head-tu-candidate-decision-letters', candidateSearch],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    queryFn: () =>
      adminApi.listCandidateAdmissions({
        page: 1,
        limit: 100,
        search: candidateSearch.trim() || undefined,
        status: 'ALL',
        publishedOnly: true,
      }),
    staleTime: 60 * 1000,
  });

  const candidateList = useMemo(
    () => candidateListQuery.data?.applications || [],
    [candidateListQuery.data?.applications],
  );
  const effectiveSelectedCandidateId = useMemo(() => {
    if (!candidateList.length) return null;
    if (selectedCandidateId && candidateList.some((item) => item.id === selectedCandidateId)) {
      return selectedCandidateId;
    }
    return candidateList[0]?.id ?? null;
  }, [candidateList, selectedCandidateId]);

  const candidateDetailQuery = useQuery({
    queryKey: ['mobile-head-tu-candidate-decision-letter-detail', effectiveSelectedCandidateId],
    enabled:
      isAuthenticated &&
      user?.role === 'STAFF' &&
      division === 'HEAD_TU' &&
      Boolean(effectiveSelectedCandidateId),
    queryFn: () => adminApi.getCandidateAdmissionById(effectiveSelectedCandidateId as number),
    staleTime: 60 * 1000,
  });

  const recipientOptions = useMemo(
    () => buildRecipientOptions(letterType, studentsQuery.data || [], teachersQuery.data || [], staffsQuery.data || []),
    [letterType, staffsQuery.data, studentsQuery.data, teachersQuery.data],
  );
  const effectiveSelectedRecipientId = useMemo(() => {
    if (!recipientOptions.length) return null;
    if (selectedRecipientId && recipientOptions.some((item) => item.id === selectedRecipientId)) {
      return selectedRecipientId;
    }
    return recipientOptions[0]?.id ?? null;
  }, [recipientOptions, selectedRecipientId]);
  const selectedRecipient = useMemo(
    () => recipientOptions.find((item) => item.id === effectiveSelectedRecipientId) || null,
    [effectiveSelectedRecipientId, recipientOptions],
  );
  const candidateDetail = candidateDetailQuery.data || null;
  const effectiveCandidateForm = useMemo(() => {
    if (candidateFormDraftTargetId && candidateDetail?.id === candidateFormDraftTargetId) {
      return candidateFormDraft;
    }
    return buildCandidateLetterForm(candidateDetail);
  }, [candidateDetail, candidateFormDraft, candidateFormDraftTargetId]);
  const effectiveCandidateOfficialFile =
    candidateOfficialFileTargetId && candidateOfficialFileTargetId === effectiveSelectedCandidateId
      ? candidateOfficialFile
      : null;
  const officeLetters = lettersQuery.data?.letters || [];
  const officeSummary = summaryQuery.data;
  const principalName = principalsQuery.data?.[0]?.name || '-';
  const letterTypeOptions = useMemo(
    () => LETTER_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const archiveTypeOptions = useMemo(
    () => LETTER_ARCHIVE_FILTERS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const recipientSelectOptions = useMemo(
    () =>
      recipientOptions.map((item) => ({
        value: String(item.id),
        label: item.context ? `${item.name} • ${item.context}` : item.name,
      })),
    [recipientOptions],
  );

  const updateCandidateForm = (
    updater: (prev: CandidateLetterFormState) => CandidateLetterFormState,
  ) => {
    const nextBase = effectiveCandidateForm;
    setCandidateFormDraftTargetId(candidateDetail?.id || null);
    setCandidateFormDraft(updater(nextBase));
  };

  const openHtmlPreview = (title: string, html: string, helper = 'Pratinjau dokumen langsung di dalam aplikasi.') => {
    const previewId = createHtmlPreviewEntry({ title, html, helper });
    router.push(`/viewer/html/${previewId}` as never);
  };

  const createLetterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRecipient) throw new Error('Penerima surat belum dipilih.');
      return headTuOfficeApi.createLetter({
        academicYearId: activeYearQuery.data?.id,
        type: letterType,
        recipientId: selectedRecipient.id,
        recipientName: selectedRecipient.name,
        recipientRole: selectedRecipient.recipientRole || null,
        recipientClass: selectedRecipient.recipientClass || null,
        recipientPrimaryId: selectedRecipient.primaryId || null,
        purpose: letterPurpose.trim() || null,
        notes: letterNotes.trim() || null,
        payload: {
          username: selectedRecipient.username || null,
          recipientContext: selectedRecipient.context || null,
          generatedBy: user?.name || null,
        },
      });
    },
    onSuccess: async (letter) => {
      notifySuccess('Surat berhasil disimpan.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-office-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-office-letters'] }),
      ]);
      openHtmlPreview(
        `${letter.title} - ${letter.recipientName}`,
        buildLetterHtml({
          activeYearName: activeYearQuery.data?.name || '-',
          principalName,
          headTuName: user?.name || '-',
          title: letter.title,
          letterNumber: letter.letterNumber,
          recipientName: letter.recipientName,
          username: letter.recipient?.username || String((letter.payload || {}).username || ''),
          primaryId: letter.recipientPrimaryId || null,
          recipientContext:
            letter.recipientClass ||
            letter.recipientRole ||
            String((letter.payload || {}).recipientContext || ''),
          purpose: letter.purpose || null,
          notes: letter.notes || null,
          issueDate: letter.printedAt || letter.createdAt,
        }),
      );
    },
    onError: notifyApiError,
  });

  const saveCandidateLetterMutation = useMutation({
    mutationFn: async (mode: 'save' | 'save-with-upload' | 'clear-official') => {
      if (!effectiveSelectedCandidateId) throw new Error('Pilih calon siswa terlebih dahulu.');

      let officialLetterUrl: string | null | undefined;
      let officialLetterOriginalName: string | null | undefined;

      if (mode === 'save-with-upload') {
        if (!effectiveCandidateOfficialFile) throw new Error('Pilih file PDF surat resmi terlebih dahulu.');
        if (!/\.pdf$/i.test(effectiveCandidateOfficialFile.name || '')) {
          throw new Error('Surat resmi hasil seleksi harus berupa file PDF.');
        }
        const uploaded = await profileApi.uploadProfileDocument({
          uri: effectiveCandidateOfficialFile.uri,
          name: effectiveCandidateOfficialFile.name || 'surat-resmi.pdf',
          type: effectiveCandidateOfficialFile.mimeType || 'application/pdf',
        });
        officialLetterUrl = String(uploaded?.url || '').trim() || null;
        officialLetterOriginalName =
          String(uploaded?.originalname || effectiveCandidateOfficialFile.name || '').trim() || null;
      }

      return headTuOfficeApi.saveCandidateDecisionLetter(effectiveSelectedCandidateId, {
        issueCity: effectiveCandidateForm.issueCity.trim() || 'Bekasi',
        issueDate: effectiveCandidateForm.issueDate || undefined,
        signerName: effectiveCandidateForm.signerName.trim() || undefined,
        signerPosition: effectiveCandidateForm.signerPosition.trim() || undefined,
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
      notifySuccess(
        mode === 'save-with-upload'
          ? 'Draft surat dan file resmi berhasil diperbarui.'
          : mode === 'clear-official'
            ? 'File surat resmi berhasil dilepas dari arsip PPDB.'
            : 'Draft surat hasil seleksi berhasil diperbarui.',
      );
      setCandidateFormDraftTargetId(null);
      setCandidateOfficialFile(null);
      setCandidateOfficialFileTargetId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-candidate-decision-letters'] }),
        queryClient.invalidateQueries({
          queryKey: ['mobile-head-tu-candidate-decision-letter-detail', effectiveSelectedCandidateId],
        }),
        queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-office-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-office-letters'] }),
      ]);
    },
    onError: notifyApiError,
  });

  const onPickCandidateOfficialFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      setCandidateOfficialFile(result.assets[0]);
      setCandidateOfficialFileTargetId(effectiveSelectedCandidateId);
    } catch (error) {
      notifyApiError(error);
    }
  };

  const previewStoredLetter = (letter: OfficeLetter) => {
    const payload = (letter.payload || {}) as Record<string, unknown>;
    openHtmlPreview(
      `${letter.title} - ${letter.recipientName}`,
      buildLetterHtml({
        activeYearName: letter.academicYear?.name || activeYearQuery.data?.name || '-',
        principalName,
        headTuName: user?.name || '-',
        title: letter.title,
        letterNumber: letter.letterNumber,
        recipientName: letter.recipientName,
        username: letter.recipient?.username || String(payload.username || ''),
        primaryId: letter.recipientPrimaryId || null,
        recipientContext:
          letter.recipientClass ||
          letter.recipientRole ||
          String(payload.recipientContext || ''),
        purpose: letter.purpose || null,
        notes: letter.notes || null,
        issueDate: letter.printedAt || letter.createdAt,
      }),
    );
  };

  const handleOpenCandidateDraft = (id: number) => {
    openWebModuleRoute(router, {
      moduleKey: 'candidate-decision-letter-draft',
      webPath: `/print/candidate-admission/${id}/decision-letter`,
      label: 'Draft Surat Hasil Seleksi',
    });
  };

  const handleOpenOfficialFile = (fileUrl?: string | null) => {
    const resolved = resolvePublicUrl(fileUrl);
    if (!resolved) return;
    openWebModuleRoute(router, {
      moduleKey: 'candidate-decision-letter-official',
      webPath: resolved,
      label: 'Surat Resmi Seleksi',
    });
  };

  const onRefresh = async () => {
    await Promise.all([
      activeYearQuery.refetch(),
      summaryQuery.refetch(),
      lettersQuery.refetch(),
      candidateListQuery.refetch(),
      effectiveSelectedCandidateId ? candidateDetailQuery.refetch() : Promise.resolve(),
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul surat..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'STAFF' || division !== 'HEAD_TU') return <Redirect href="/home" />;
  if (activeYearQuery.isLoading && !activeYearQuery.data) return <AppLoadingScreen message="Menyiapkan data surat..." />;

  if (activeYearQuery.isError || !activeYearQuery.data) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Surat-Menyurat
        </Text>
        <QueryStateView type="error" message="Tahun ajaran aktif tidak ditemukan." onRetry={() => activeYearQuery.refetch()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void onRefresh()} tintColor={BRAND_COLORS.blue} />}
    >
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: BRAND_COLORS.textDark }}>Surat-Menyurat</Text>
        <Text style={{ marginTop: 6, color: BRAND_COLORS.textMuted }}>
          Kelola arsip surat, finalisasi surat hasil seleksi PPDB, dan pratinjau dokumen TU langsung dari mobile.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <SummaryCard
          title="Total Arsip Surat"
          value={String(officeSummary?.totalLetters || 0)}
          subtitle="Semua surat tahun ajaran aktif"
          iconName="archive"
          accentColor="#475569"
        />
        <SummaryCard
          title="Surat Bulan Ini"
          value={String(officeSummary?.monthlyLetters || 0)}
          subtitle="Tercatat otomatis saat surat disimpan"
          iconName="calendar"
          accentColor="#1d4ed8"
        />
        <SummaryCard
          title="Tipe Surat Aktif"
          value={String(officeSummary?.byType?.length || 0)}
          subtitle="Jenis surat yang pernah diterbitkan"
          iconName="layers"
          accentColor="#047857"
        />
      </View>

      <SectionCard title="Buat Surat Administrasi" helper={`Tahun ajaran aktif: ${activeYearQuery.data.name}`}>
        <MobileSelectField
          label="Jenis Surat"
          value={letterType}
          options={letterTypeOptions}
          onChange={(value) => setLetterType(value as OfficeLetterType)}
          placeholder="Pilih jenis surat"
        />

        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 14,
            backgroundColor: '#f8fbff',
            padding: 12,
            marginTop: 12,
          }}
        >
          <Text style={{ fontWeight: '700', color: BRAND_COLORS.textDark }}>Penerima</Text>
          <View style={{ marginTop: 10 }}>
            <MobileSelectField
              value={String(effectiveSelectedRecipientId || '')}
              options={recipientSelectOptions}
              onChange={(value) => setSelectedRecipientId(value ? Number(value) : null)}
              placeholder="Pilih penerima surat"
              helperText={
                recipientOptions.length ? `${recipientOptions.length} penerima tersedia sesuai jenis surat.` : 'Belum ada penerima yang tersedia.'
              }
            />
          </View>
          {selectedRecipient ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                {selectedRecipient.username ? `@${selectedRecipient.username}` : '-'} • {selectedRecipient.primaryId || '-'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ marginTop: 12 }}>
          <Field
            label="Keperluan"
            value={letterPurpose}
            onChangeText={setLetterPurpose}
            placeholder="Contoh: Administrasi beasiswa, arsip pribadi, atau kebutuhan ujian"
          />
          <Field
            label="Catatan Tambahan"
            value={letterNotes}
            onChangeText={setLetterNotes}
            placeholder="Isi catatan tambahan bila diperlukan."
            multiline
          />
        </View>

        {selectedRecipient ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 14,
              backgroundColor: '#fff',
              padding: 12,
              marginTop: 6,
            }}
          >
            <Text style={{ fontWeight: '700', color: BRAND_COLORS.textDark }}>Preview Ringkas</Text>
            <Text style={{ marginTop: 8, color: BRAND_COLORS.textMuted }}>Penerima: {selectedRecipient.name}</Text>
            <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted }}>
              Identitas: {selectedRecipient.primaryId || '-'}
            </Text>
            <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted }}>
              Kelas / PTK: {selectedRecipient.context || '-'}
            </Text>
            <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted }}>
              Keperluan: {letterPurpose.trim() || '-'}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 12 }}>
          <OutlineButton
            icon="file-text"
            label={createLetterMutation.isPending ? 'Menyimpan...' : 'Simpan & Buka Pratinjau Surat'}
            onPress={() => createLetterMutation.mutate(undefined)}
            disabled={!selectedRecipient || createLetterMutation.isPending}
          />
        </View>
      </SectionCard>

      <SectionCard title="Surat Hasil Seleksi PPDB" helper="Antrean calon siswa yang pengumumannya sudah dipublikasikan.">
        <Field
          label="Cari calon siswa"
          value={candidateSearch}
          onChangeText={setCandidateSearch}
          placeholder="Cari nama, nomor pendaftaran, atau NISN"
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <SummaryCard
            title="Antrean Surat"
            value={String(candidateList.length)}
            subtitle="Calon siswa siap difinalkan"
            iconName="users"
            accentColor="#1d4ed8"
          />
          <SummaryCard
            title="Sudah Final Draft"
            value={String(candidateList.filter((item) => item.decisionLetter?.isFinalized).length)}
            subtitle="Draft sudah difinalkan"
            iconName="check-circle"
            accentColor="#047857"
          />
          <SummaryCard
            title="Surat Resmi"
            value={String(candidateList.filter((item) => item.decisionLetter?.officialFileUrl).length)}
            subtitle="PDF resmi aktif"
            iconName="file"
            accentColor="#c2410c"
          />
        </View>

        <View style={{ marginTop: 12, gap: 10 }}>
          {candidateListQuery.isLoading ? (
            <AppLoadingScreen message="Memuat antrean surat PPDB..." />
          ) : candidateListQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat antrean surat hasil seleksi." onRetry={() => candidateListQuery.refetch()} />
          ) : !candidateList.length ? (
            <EmptyState message="Belum ada pengumuman hasil seleksi yang siap difinalkan menjadi surat." />
          ) : (
            candidateList.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setSelectedCandidateId(item.id)}
                style={{
                  borderWidth: 1,
                  borderColor: effectiveSelectedCandidateId === item.id ? '#93c5fd' : '#dbe7fb',
                  backgroundColor: effectiveSelectedCandidateId === item.id ? '#eff6ff' : '#fff',
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.user.name}</Text>
                    <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      {item.registrationNumber} • {item.user.nisn || item.user.username}
                    </Text>
                    <Text style={{ marginTop: 6, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      {item.decisionLetter?.letterNumber || 'Draft otomatis'} • {item.decisionLetter?.officialFileUrl ? 'Surat resmi tersedia' : 'Belum ada file resmi'}
                    </Text>
                  </View>
                  <StatusChip status={item.status} />
                </View>
              </Pressable>
            ))
          )}
        </View>

        {effectiveSelectedCandidateId ? (
          <View style={{ marginTop: 14 }}>
            {candidateDetailQuery.isLoading ? (
              <AppLoadingScreen message="Memuat detail surat hasil seleksi..." />
            ) : candidateDetailQuery.isError || !candidateDetail ? (
              <QueryStateView type="error" message="Detail surat hasil seleksi tidak ditemukan." onRetry={() => candidateDetailQuery.refetch()} />
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 16,
                  backgroundColor: '#f8fbff',
                  padding: 14,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
                      {candidateDetail.user.name}
                    </Text>
                    <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted }}>
                      {candidateDetail.registrationNumber} • {candidateDetail.user.nisn || candidateDetail.user.username}
                    </Text>
                  </View>
                  <StatusChip status={candidateDetail.status} />
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#d6e0f2',
                    borderRadius: 14,
                    backgroundColor: '#fff',
                    padding: 12,
                    marginTop: 12,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Ringkasan Keputusan</Text>
                  <Text style={{ marginTop: 8, color: BRAND_COLORS.textMuted }}>
                    Judul: {candidateDetail.decisionTitle || 'Hasil Seleksi PPDB'}
                  </Text>
                  <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted }}>
                    Dipublikasikan: {formatDateTime(candidateDetail.decisionAnnouncement.publishedAt)}
                  </Text>
                  <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted }}>
                    Draft surat: {candidateDetail.decisionLetter.isFinalized ? `Sudah difinalkan (${candidateDetail.decisionLetter.letterNumber || '-'})` : 'Masih draft otomatis'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                  <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                    <OutlineButton
                      icon="file-text"
                      label="Buka Draft Surat"
                      onPress={() => handleOpenCandidateDraft(candidateDetail.id)}
                    />
                  </View>
                  {candidateDetail.decisionLetter.officialFileUrl ? (
                    <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                      <OutlineButton
                        icon="paperclip"
                        label="Buka Surat Resmi"
                        onPress={() => handleOpenOfficialFile(candidateDetail.decisionLetter.officialFileUrl)}
                        tone="emerald"
                      />
                    </View>
                  ) : null}
                </View>

                <View style={{ marginTop: 14 }}>
                  <Field
                    label="Kota Surat"
                    value={effectiveCandidateForm.issueCity}
                    onChangeText={(value) => updateCandidateForm((prev) => ({ ...prev, issueCity: value }))}
                  />
                  <Field
                    label="Tanggal Surat (YYYY-MM-DD)"
                    value={effectiveCandidateForm.issueDate}
                    onChangeText={(value) => updateCandidateForm((prev) => ({ ...prev, issueDate: value }))}
                    placeholder="2026-03-31"
                  />
                  <Field
                    label="Nama Penandatangan TU"
                    value={effectiveCandidateForm.signerName}
                    onChangeText={(value) => updateCandidateForm((prev) => ({ ...prev, signerName: value }))}
                    placeholder="Nama Kepala Tata Usaha"
                  />
                  <Field
                    label="Jabatan Penandatangan"
                    value={effectiveCandidateForm.signerPosition}
                    onChangeText={(value) => updateCandidateForm((prev) => ({ ...prev, signerPosition: value }))}
                  />
                </View>

                <View
                  style={{
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#cbd5e1',
                    borderRadius: 14,
                    backgroundColor: '#fff',
                    padding: 12,
                    marginTop: 6,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Surat Resmi Bertanda Tangan (PDF)</Text>
                  <Text style={{ marginTop: 6, color: BRAND_COLORS.textMuted }}>
                    Upload bersifat opsional. Jika belum ada PDF resmi, calon siswa tetap bisa melihat draft otomatis.
                  </Text>
                  <View style={{ marginTop: 10 }}>
                    <OutlineButton icon="upload" label="Pilih File PDF" onPress={() => void onPickCandidateOfficialFile()} tone="slate" />
                  </View>
                  {effectiveCandidateOfficialFile ? (
                    <Text style={{ marginTop: 10, color: BRAND_COLORS.navy, fontWeight: '700' }}>
                      File siap diunggah: {effectiveCandidateOfficialFile.name}
                    </Text>
                  ) : null}
                  {candidateDetail.decisionLetter.officialFileUrl ? (
                    <Text style={{ marginTop: 10, color: '#047857' }}>
                      Surat resmi aktif: {candidateDetail.decisionLetter.officialOriginalName || 'PDF resmi'} • diunggah{' '}
                      {formatDateTime(candidateDetail.decisionLetter.officialUploadedAt)}
                    </Text>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                  <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                    <OutlineButton
                      icon="save"
                      label={saveCandidateLetterMutation.isPending ? 'Menyimpan...' : 'Simpan Draft'}
                      onPress={() => saveCandidateLetterMutation.mutate('save')}
                      disabled={saveCandidateLetterMutation.isPending}
                    />
                  </View>
                  <View style={{ flexBasis: '48%', flexGrow: 1 }}>
                    <OutlineButton
                      icon="upload-cloud"
                      label="Simpan + Upload PDF"
                      onPress={() => saveCandidateLetterMutation.mutate('save-with-upload')}
                      disabled={saveCandidateLetterMutation.isPending || !effectiveCandidateOfficialFile}
                      tone="emerald"
                    />
                  </View>
                  {candidateDetail.decisionLetter.officialFileUrl ? (
                    <View style={{ flexBasis: '100%' }}>
                      <OutlineButton
                        icon="trash-2"
                        label="Lepas Surat Resmi"
                        onPress={() => saveCandidateLetterMutation.mutate('clear-official')}
                        disabled={saveCandidateLetterMutation.isPending}
                        tone="rose"
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Arsip Surat" helper="Semua surat yang sudah diterbitkan bisa dibuka ulang dari sini.">
        <Field
          label="Cari Arsip"
          value={archiveSearch}
          onChangeText={setArchiveSearch}
          placeholder="Cari nomor surat, penerima, atau keperluan"
        />
        <MobileSelectField
          label="Filter Arsip"
          value={archiveType}
          options={archiveTypeOptions}
          onChange={(value) => setArchiveType(value as 'ALL' | OfficeLetterType)}
          placeholder="Pilih arsip surat"
        />

        <View style={{ marginTop: 12, gap: 10 }}>
          {lettersQuery.isLoading ? (
            <AppLoadingScreen message="Memuat arsip surat..." />
          ) : lettersQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat arsip surat." onRetry={() => lettersQuery.refetch()} />
          ) : !officeLetters.length ? (
            <EmptyState message="Belum ada arsip surat yang sesuai." />
          ) : (
            officeLetters.map((letter) => (
              <View
                key={letter.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#fff',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{letter.letterNumber}</Text>
                <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted }}>
                  {getLetterTypeLabel(letter.type)} • {letter.recipientName}
                </Text>
                <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                  {letter.recipientClass || letter.recipientRole || '-'} • {letter.purpose || '-'}
                </Text>
                <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                  Dicetak {formatDateTime(letter.printedAt || letter.createdAt)}
                </Text>
                <View style={{ marginTop: 10 }}>
                  <OutlineButton icon="eye" label="Buka Pratinjau Surat" onPress={() => previewStoredLetter(letter)} tone="slate" />
                </View>
              </View>
            ))
          )}
        </View>
      </SectionCard>
    </ScrollView>
  );
}
