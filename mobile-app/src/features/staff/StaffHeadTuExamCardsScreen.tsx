import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
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
import { createHtmlPreviewEntry } from '../../lib/viewer/htmlPreviewStore';
import { useAuth } from '../auth/AuthProvider';
import { academicYearApi } from '../academicYear/academicYearApi';
import { examApi, type ExamProgramItem } from '../exams/examApi';
import {
  examCardApi,
  type ExamCardOverviewRow,
  type ExamGeneratedCardPayload,
} from '../examCards/examCardApi';
import { resolveStaffDivision } from './staffRole';

type StatusFilter = 'ALL' | 'PUBLISHED' | 'ELIGIBLE' | 'BLOCKED';

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

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
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

function normalizeProgramToken(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function isNonScheduledExamProgram(program: ExamProgramItem) {
  const codeToken = normalizeProgramToken(program?.code);
  if (codeToken === 'FORMATIF' || codeToken === 'UH' || codeToken === 'ULANGANHARIAN') return true;

  const labelToken = normalizeProgramToken(program?.label);
  const shortLabelToken = normalizeProgramToken(program?.shortLabel);
  const tokens = [codeToken, labelToken, shortLabelToken].filter(Boolean);
  if (tokens.some((token) => token.includes('FORMATIF'))) return true;
  if (tokens.some((token) => token.includes('ULANGANHARIAN'))) return true;

  return (
    labelToken === 'FORMATIF' ||
    labelToken === 'ULANGANHARIAN' ||
    shortLabelToken === 'FORMATIF' ||
    shortLabelToken === 'UH' ||
    shortLabelToken === 'ULANGANHARIAN'
  );
}

function resolvePublicUrl(fileUrl?: string | null) {
  const raw = String(fileUrl || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  const base = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/api/uploads/${raw.replace(/^\/+/, '')}`;
}

function buildExamCardSheet(card: ExamGeneratedCardPayload) {
  const schoolLogoUrl = resolvePublicUrl('/logo-kgb2.png');
  const watermarkLogoUrl = resolvePublicUrl('/logo_sis_kgb2.png');
  const photoUrl = resolvePublicUrl(card.student.photoUrl || '');
  const roomLabel = card.placement?.roomName || card.entries[0]?.roomName || '-';
  const sessionLabel = card.placement?.sessionLabel || card.entries[0]?.sessionLabel || '-';
  const issueSignLabel =
    card.issue?.signLabel ||
    `${card.issue?.location || 'Bekasi'}, ${formatDateOnly(card.issue?.date || card.generatedAt)}`;
  return `
    <article class="exam-card">
      <div class="card-watermark">
        <img src="${escapeHtml(watermarkLogoUrl)}" alt="" />
      </div>

      <div class="card-header">
        <div class="card-header-logo">
          <img src="${escapeHtml(schoolLogoUrl)}" alt="Logo KGB2" />
        </div>
        <div class="card-header-copy">
          <div class="card-title">${escapeHtml(card.cardTitle || 'KARTU PESERTA')}</div>
          <div class="card-program">${escapeHtml(card.examTitle || card.programLabel)}</div>
          <div class="card-school">${escapeHtml(card.institutionName || card.schoolName)}</div>
          <div class="card-year">${escapeHtml(card.academicYearName)}</div>
        </div>
      </div>

      <div class="card-body">
        <div class="card-photo-box">
          ${
            photoUrl
              ? `<img src="${escapeHtml(photoUrl)}" alt="Foto siswa" class="card-photo" />`
              : `<div class="card-photo-placeholder">Foto formal dari profil dokumen pendukung</div>`
          }
        </div>

        <div class="card-detail-grid">
          <div class="detail-label">Nama Siswa</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(card.student.name)}</div>
          <div class="detail-label">Kelas</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(card.student.className || '-')}</div>
          <div class="detail-label">Username</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(card.student.username || '-')}</div>
          <div class="detail-label">No. Peserta</div><div class="detail-separator">:</div><div class="detail-value detail-number">${escapeHtml(card.participantNumber || '-')}</div>
          <div class="detail-label">Ruang</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(roomLabel)}</div>
          <div class="detail-label">Sesi</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(sessionLabel || '-')}</div>
        </div>

        <div class="card-signature-block">
          <div class="card-sign-date">${escapeHtml(issueSignLabel)}</div>
          <div class="card-sign-role">${escapeHtml(card.legality.principalTitle || 'Kepala Sekolah')}</div>
          ${
            card.legality.principalBarcodeDataUrl
              ? `<img class="card-barcode" src="${escapeHtml(card.legality.principalBarcodeDataUrl)}" alt="Barcode Kepala Sekolah" />`
              : ''
          }
          <div class="card-principal-name">${escapeHtml(card.legality.principalName || '-')}</div>
        </div>
      </div>

      <div class="card-footer-note">${escapeHtml(card.legality.footerNote || 'Berkas digital yang sah secara internal')}</div>
    </article>
  `;
}

function buildExamCardsHtml(cards: ExamGeneratedCardPayload[]) {
  return `<!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page { size: auto; margin: 6mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
          .cards-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(94mm, 1fr));
            gap: 4mm;
            align-content: start;
          }
          .exam-card {
            position: relative;
            min-height: 65mm;
            height: 65mm;
            border: 0.35mm solid #cbd5e1;
            border-radius: 4mm;
            background: #ffffff;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .card-watermark {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0.08;
          }
          .card-watermark img {
            width: 42mm;
            height: 42mm;
            object-fit: contain;
          }
          .card-header {
            position: relative;
            z-index: 1;
            display: grid;
            grid-template-columns: 22mm 1fr;
            gap: 3mm;
            align-items: center;
            padding: 3.2mm 3.4mm 2.8mm;
            border-bottom: 0.3mm solid #dbe2ea;
          }
          .card-header-logo {
            height: 16mm;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .card-header-logo img {
            width: 15mm;
            height: 15mm;
            object-fit: contain;
          }
          .card-header-copy {
            text-align: center;
            line-height: 1.05;
          }
          .card-title {
            font-size: 4.1mm;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .card-program, .card-school, .card-year {
            margin-top: 0.7mm;
            font-size: 3.1mm;
            font-weight: 600;
          }
          .card-body {
            position: relative;
            z-index: 1;
            display: grid;
            grid-template-columns: 21mm minmax(0, 1fr) 34mm;
            gap: 2.8mm;
            padding: 3.2mm 3.4mm 3.4mm;
          }
          .card-photo-box {
            width: 100%;
            height: 27mm;
            border: 0.3mm solid #cbd5e1;
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .card-photo {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .card-photo-placeholder {
            padding: 1.2mm;
            text-align: center;
            font-size: 2.5mm;
            color: #475569;
            line-height: 1.2;
          }
          .card-detail-grid {
            align-content: start;
            display: grid;
            grid-template-columns: 19mm 2mm minmax(0, 1fr);
            column-gap: 0.8mm;
            row-gap: 0.35mm;
            font-size: 2.75mm;
            line-height: 1.2;
          }
          .detail-label {
            font-weight: 500;
          }
          .detail-value {
            overflow-wrap: anywhere;
          }
          .detail-number {
            font-weight: 700;
            letter-spacing: 0.04em;
          }
          .card-signature-block {
            display: flex;
            min-height: 27mm;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            text-align: center;
            line-height: 1.15;
          }
          .card-sign-date,
          .card-sign-role,
          .card-principal-name {
            font-size: 2.7mm;
          }
          .card-barcode {
            width: 14mm;
            height: 14mm;
            object-fit: contain;
            margin: 1.2mm 0 0.8mm;
            background: #fff;
          }
          .card-principal-name {
            margin-top: auto;
            font-weight: 700;
          }
          .card-footer-note {
            position: absolute;
            left: 3.4mm;
            right: 3.4mm;
            bottom: 2.4mm;
            font-size: 2.2mm;
            font-style: italic;
            color: #047857;
          }
        </style>
      </head>
      <body><div class="cards-grid">${cards.map((card) => buildExamCardSheet(card)).join('')}</div></body>
    </html>`;
}

function matchesSearch(keyword: string, values: Array<string | null | undefined>) {
  if (!keyword) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(keyword));
}

function statusPill(row: ExamCardOverviewRow) {
  if (row.card) return { label: 'Sudah Dipublikasikan', bg: '#ffe4e6', border: '#fecdd3', text: '#be123c' };
  if (row.eligibility.isEligible) return { label: 'Siap Digenerate', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  return { label: 'Belum Layak', bg: '#fffbeb', border: '#fde68a', text: '#b45309' };
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

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  tone = 'primary',
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary';
}) {
  const isPrimary = tone === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isPrimary ? '#bfdbfe' : '#fecdd3',
        backgroundColor: disabled ? '#f8fafc' : isPrimary ? '#eff6ff' : '#fff1f2',
        paddingVertical: 11,
        paddingHorizontal: 14,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Feather name={icon} size={16} color={isPrimary ? '#1d4ed8' : '#be123c'} />
      <Text style={{ color: isPrimary ? '#1d4ed8' : '#be123c', fontWeight: '700' }}>{label}</Text>
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

export function StaffHeadTuExamCardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const division = resolveStaffDivision(user);
  const [activeProgramCode, setActiveProgramCode] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [issueLocation, setIssueLocation] = useState('Bekasi');
  const [issueDate, setIssueDate] = useState(() => toDateInputValue(new Date().toISOString()));

  const activeYearQuery = useQuery({
    queryKey: ['mobile-head-tu-exam-cards-active-year'],
    enabled: isAuthenticated && user?.role === 'STAFF' && division === 'HEAD_TU',
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });
  const selectedAcademicYearId = activeYearQuery.data?.id || null;

  const programsQuery = useQuery({
    queryKey: ['mobile-head-tu-exam-cards-programs', selectedAcademicYearId || 'none'],
    enabled:
      isAuthenticated &&
      user?.role === 'STAFF' &&
      division === 'HEAD_TU' &&
      Boolean(selectedAcademicYearId),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: selectedAcademicYearId || undefined,
        roleContext: 'all',
        includeInactive: false,
      }),
  });

  const visiblePrograms = useMemo(
    () =>
      (programsQuery.data?.programs || [])
        .filter((program) => Boolean(program.isActive) && !isNonScheduledExamProgram(program))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'id-ID')),
    [programsQuery.data?.programs],
  );

  useEffect(() => {
    if (!visiblePrograms.length) {
      setActiveProgramCode('');
      return;
    }
    setActiveProgramCode((current) =>
      visiblePrograms.some((program) => program.code === current) ? current : visiblePrograms[0].code,
    );
  }, [visiblePrograms]);

  const overviewQuery = useQuery({
    queryKey: ['mobile-head-tu-exam-cards-overview', selectedAcademicYearId || 'none', activeProgramCode || 'none'],
    enabled:
      isAuthenticated &&
      user?.role === 'STAFF' &&
      division === 'HEAD_TU' &&
      Boolean(selectedAcademicYearId) &&
      Boolean(activeProgramCode),
    staleTime: 60_000,
    queryFn: () =>
      examCardApi.getOverview({
        academicYearId: Number(selectedAcademicYearId),
        programCode: activeProgramCode,
      }),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      examCardApi.generate({
        academicYearId: Number(selectedAcademicYearId),
        programCode: activeProgramCode,
        semester: overviewQuery.data?.semester,
        issueLocation: issueLocation.trim() || 'Bekasi',
        issueDate,
      }),
    onSuccess: async (response) => {
      notifySuccess(response.message || 'Kartu ujian berhasil digenerate.');
      await queryClient.invalidateQueries({ queryKey: ['mobile-head-tu-exam-cards-overview'] });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal generate kartu ujian.');
    },
  });

  const classOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (overviewQuery.data?.rows || [])
            .map((row) => String(row.className || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, 'id-ID', { sensitivity: 'base' })),
    [overviewQuery.data?.rows],
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (overviewQuery.data?.rows || []).filter((row) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PUBLISHED' && Boolean(row.card)) ||
        (statusFilter === 'ELIGIBLE' && row.eligibility.isEligible && !row.card) ||
        (statusFilter === 'BLOCKED' && !row.eligibility.isEligible);
      const matchesClass = classFilter === 'ALL' || String(row.className || '') === classFilter;
      const matchesKeyword = matchesSearch(keyword, [
        row.studentName,
        row.username,
        row.nis,
        row.nisn,
        row.className,
        row.participantNumber,
        ...row.entries.flatMap((entry) => [entry.roomName, entry.sessionLabel, entry.seatLabel]),
      ]);
      return matchesStatus && matchesClass && matchesKeyword;
    });
  }, [classFilter, overviewQuery.data?.rows, search, statusFilter]);

  const printableCards = useMemo(
    () =>
      filteredRows
        .map((row) => row.card?.payload)
        .filter((payload): payload is ExamGeneratedCardPayload => Boolean(payload)),
    [filteredRows],
  );

  const openPreview = (cards: ExamGeneratedCardPayload[], title: string) => {
    if (!cards.length) return;
    const previewId = createHtmlPreviewEntry({
      title,
      helper: 'Pratinjau kartu ujian digital di dalam aplikasi.',
      html: buildExamCardsHtml(cards),
    });
    router.push(`/viewer/html/${previewId}` as never);
  };

  const onRefresh = async () => {
    await Promise.all([
      activeYearQuery.refetch(),
      programsQuery.refetch(),
      overviewQuery.refetch(),
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat kartu ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'STAFF' || division !== 'HEAD_TU') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            programsQuery.isFetching ||
            overviewQuery.isFetching ||
            generateMutation.isPending
          }
          onRefresh={() => void onRefresh()}
          tintColor={BRAND_COLORS.blue}
        />
      }
    >
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: BRAND_COLORS.textDark }}>Kartu Ujian</Text>
        <Text style={{ marginTop: 6, color: BRAND_COLORS.textMuted }}>
          Generate kartu ujian digital untuk siswa yang layak ikut ujian, lalu buka pratinjau dokumen resminya dari Kepala TU.
        </Text>
      </View>

      {!activeYearQuery.isLoading && !activeYearQuery.isError && !selectedAcademicYearId ? (
        <View
          style={{
            backgroundColor: '#fffbeb',
            borderWidth: 1,
            borderColor: '#fde68a',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tahun ajaran aktif belum tersedia</Text>
          <Text style={{ color: '#b45309', fontSize: 12 }}>
            Aktifkan tahun ajaran terlebih dahulu agar kartu ujian tidak ambigu.
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <SummaryCard
          title="Peserta Program"
          value={String(overviewQuery.data?.summary.totalStudents || 0)}
          subtitle="Seluruh siswa pada ruang ujian aktif"
          iconName="users"
          accentColor="#1d4ed8"
        />
        <SummaryCard
          title="Siap Digenerate"
          value={String(overviewQuery.data?.summary.eligibleStudents || 0)}
          subtitle="Layak ikut ujian"
          iconName="check-circle"
          accentColor="#047857"
        />
        <SummaryCard
          title="Belum Layak"
          value={String(overviewQuery.data?.summary.blockedStudents || 0)}
          subtitle="Masih terblokir"
          iconName="alert-triangle"
          accentColor="#c2410c"
        />
        <SummaryCard
          title="Sudah Dipublikasikan"
          value={String(overviewQuery.data?.summary.publishedCards || 0)}
          subtitle="Kartu digital aktif"
          iconName="file-text"
          accentColor="#be123c"
        />
      </View>

      <SectionCard
        title="Filter Kartu Ujian"
        helper="Pilih program ujian yang ingin digenerate atau dipantau."
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            backgroundColor: '#eff6ff',
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#1e3a8a', fontWeight: '700' }}>
            Tahun Ajaran Aktif: {activeYearQuery.data?.name || '-'}
          </Text>
          <Text style={{ color: '#1d4ed8', fontSize: 12, marginTop: 4 }}>
            Kartu ujian mengikuti tahun ajaran aktif pada header aplikasi.
          </Text>
        </View>

        <MobileSelectField
          label="Program Ujian"
          value={activeProgramCode}
          options={visiblePrograms.map((item) => ({
            value: item.code,
            label: item.label,
          }))}
          onChange={setActiveProgramCode}
          placeholder="Pilih program ujian"
          helperText={
            overviewQuery.data?.semester
              ? `Semester ${overviewQuery.data.semester === 'EVEN' ? 'Genap' : 'Ganjil'}`
              : undefined
          }
        />

        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Lokasi TTD Kepala Sekolah</Text>
        <TextInput
          value={issueLocation}
          onChangeText={setIssueLocation}
          placeholder="Contoh: Bekasi"
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: '#0f172a',
            backgroundColor: '#fff',
            marginBottom: 12,
          }}
        />

        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Tanggal Terbit</Text>
        <TextInput
          value={issueDate}
          onChangeText={setIssueDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: '#0f172a',
            backgroundColor: '#fff',
            marginBottom: 12,
          }}
        />

        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Cari siswa / ruang / kursi</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama siswa, no. peserta, NIS, kelas, ruang, sesi, atau kursi..."
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: '#0f172a',
            backgroundColor: '#fff',
          }}
        />

        <View style={{ marginTop: 12 }}>
          <MobileSelectField
            label="Filter Kelas"
            value={classFilter}
            options={[
              { value: 'ALL', label: 'Semua Kelas' },
              ...classOptions.map((item) => ({ value: item, label: item })),
            ]}
            onChange={setClassFilter}
            placeholder="Pilih kelas"
          />
        </View>

        <MobileSelectField
          label="Filter Status"
          value={statusFilter}
          options={[
            { value: 'ALL', label: 'Semua Status' },
            { value: 'PUBLISHED', label: 'Sudah Dipublikasikan' },
            { value: 'ELIGIBLE', label: 'Siap Digenerate' },
            { value: 'BLOCKED', label: 'Belum Layak' },
          ]}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          placeholder="Pilih status"
        />

        <View style={{ gap: 10, marginTop: 6 }}>
          <ActionButton
            icon="zap"
            label={generateMutation.isPending ? 'Memproses Generate...' : 'Generate Kartu Ujian'}
            onPress={() => generateMutation.mutate()}
            disabled={
              !overviewQuery.data ||
              !activeProgramCode ||
              !issueDate ||
              issueLocation.trim().length === 0 ||
              overviewQuery.data.summary.eligibleStudents === 0 ||
              generateMutation.isPending
            }
          />
          <ActionButton
            icon="eye"
            label="Buka Pratinjau Semua Kartu"
            onPress={() => openPreview(printableCards, 'Pratinjau Semua Kartu Ujian')}
            disabled={!printableCards.length}
            tone="secondary"
          />
        </View>
      </SectionCard>

      <SectionCard
        title="Daftar Kartu Ujian"
        helper={`${filteredRows.length} siswa • ${overviewQuery.data?.summary.totalStudents || 0} total data`}
      >
        {activeYearQuery.isLoading || programsQuery.isLoading ? (
          <AppLoadingScreen message="Menyiapkan filter kartu ujian..." />
        ) : activeYearQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat tahun ajaran."
            onRetry={() => activeYearQuery.refetch()}
          />
        ) : programsQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat program ujian."
            onRetry={() => programsQuery.refetch()}
          />
        ) : !activeProgramCode ? (
          <EmptyState message="Belum ada program ujian terjadwal yang bisa dipilih." />
        ) : overviewQuery.isLoading ? (
          <AppLoadingScreen message="Memuat overview kartu ujian..." />
        ) : overviewQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat overview kartu ujian."
            onRetry={() => overviewQuery.refetch()}
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState message="Belum ada data siswa yang sesuai dengan filter." />
        ) : (
          <View style={{ gap: 10 }}>
            {filteredRows.map((row) => {
              const pill = statusPill(row);
              return (
                <View
                  key={row.studentId}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 14,
                    backgroundColor: '#fff',
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.studentName}</Text>
                      <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        @{row.username} • {row.className || '-'}
                      </Text>
                      <View
                        style={{
                          marginTop: 8,
                          alignSelf: 'flex-start',
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 11 }}>
                          No. Peserta {row.participantNumber || '-'}
                        </Text>
                      </View>
                      <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        NIS {row.nis || '-'} • NISN {row.nisn || '-'}
                      </Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: pill.border,
                        backgroundColor: pill.bg,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Text style={{ color: pill.text, fontWeight: '700', fontSize: 12 }}>{pill.label}</Text>
                    </View>
                  </View>

                  <View style={{ gap: 8, marginTop: 10 }}>
                    {row.entries.length === 0 ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#fde68a',
                          borderRadius: 12,
                          backgroundColor: '#fffbeb',
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '700' }}>
                          Belum ada data ruang ujian aktif untuk siswa ini.
                        </Text>
                      </View>
                    ) : (
                      row.entries.map((entry) => (
                        <View
                          key={`${row.studentId}-${entry.sittingId}`}
                          style={{
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 12,
                            backgroundColor: '#f8fafc',
                            padding: 10,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{entry.roomName}</Text>
                          <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            {entry.sessionLabel || '-'} • Kursi {entry.seatLabel || '-'}
                          </Text>
                          <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            {formatDateTime(entry.startTime)} - {formatDateTime(entry.endTime)}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>

                  <View
                    style={{
                      marginTop: 10,
                      borderWidth: 1,
                      borderColor: row.eligibility.isEligible ? '#bbf7d0' : '#fde68a',
                      backgroundColor: row.eligibility.isEligible ? '#f0fdf4' : '#fffbeb',
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: row.eligibility.isEligible ? '#166534' : '#92400e',
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      {row.eligibility.reason}
                    </Text>
                    {row.eligibility.financeExceptionApplied ? (
                      <Text style={{ color: '#166534', fontSize: 11, marginTop: 4 }}>
                        Ada pengecualian finance dari wali kelas untuk siswa ini.
                      </Text>
                    ) : null}
                    {!row.eligibility.isEligible &&
                    row.eligibility.automatic.details.belowKkmSubjects.length > 0 ? (
                      <Text style={{ color: '#92400e', fontSize: 11, marginTop: 4 }}>
                        Nilai di bawah KKM: {row.eligibility.automatic.details.belowKkmSubjects
                          .map((subject) => subject.subjectName)
                          .join(', ')}
                      </Text>
                    ) : null}
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <ActionButton
                      icon="eye"
                      label={row.card ? 'Buka Pratinjau Kartu' : 'Kartu Belum Dipublikasikan'}
                      onPress={() => (row.card?.payload ? openPreview([row.card.payload], `Kartu Ujian - ${row.studentName}`) : undefined)}
                      disabled={!row.card?.payload}
                      tone={row.card?.payload ? 'primary' : 'secondary'}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>
    </ScrollView>
  );
}
