import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileActiveAcademicYearNotice } from '../../components/MobileActiveAcademicYearNotice';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
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

function buildExamCardSheet(card: ExamGeneratedCardPayload) {
  return `
    <section class="sheet">
      <div class="header">
        <div class="school">
          <div class="school-name">${escapeHtml(card.schoolName)}</div>
          <div class="header-title">${escapeHtml(card.headerTitle)}</div>
          <div class="header-subtitle">${escapeHtml(card.headerSubtitle)}</div>
        </div>
        <div class="generated-box">
          <div>Generate</div>
          <div class="generated-at">${escapeHtml(formatDateTime(card.generatedAt))}</div>
        </div>
      </div>

      <div class="identity">
        <div class="identity-card">
          <div class="identity-title">Identitas Siswa</div>
          <div class="identity-grid">
            <strong>Nama</strong><span>:</span><span>${escapeHtml(card.student.name)}</span>
            <strong>NIS</strong><span>:</span><span>${escapeHtml(card.student.nis || '-')}</span>
            <strong>NISN</strong><span>:</span><span>${escapeHtml(card.student.nisn || '-')}</span>
            <strong>Kelas</strong><span>:</span><span>${escapeHtml(card.student.className || '-')}</span>
          </div>
        </div>
        <div class="identity-card">
          <div class="identity-title">Legalitas</div>
          <div class="legal-body">
            <div class="legal-name">${escapeHtml(card.legality.principalName)}</div>
            <div>${escapeHtml(card.legality.signatureLabel)}</div>
            ${
              card.legality.principalBarcodeDataUrl
                ? `<img class="barcode" src="${card.legality.principalBarcodeDataUrl}" alt="Barcode Kepala Sekolah" />`
                : ''
            }
          </div>
        </div>
      </div>

      <table class="schedule-table">
        <thead>
          <tr>
            <th>Ruang</th>
            <th>Sesi</th>
            <th>Kursi</th>
            <th>Mulai</th>
            <th>Selesai</th>
          </tr>
        </thead>
        <tbody>
          ${card.entries
            .map(
              (entry) => `
                <tr>
                  <td>${escapeHtml(entry.roomName || '-')}</td>
                  <td>${escapeHtml(entry.sessionLabel || '-')}</td>
                  <td>${escapeHtml(entry.seatLabel || '-')}</td>
                  <td>${escapeHtml(formatDateTime(entry.startTime))}</td>
                  <td>${escapeHtml(formatDateTime(entry.endTime))}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `;
}

function buildExamCardsHtml(cards: ExamGeneratedCardPayload[]) {
  return `<!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
          .sheet { background: #fff; border: 1px solid #dbe7fb; border-radius: 18px; padding: 18px; margin-bottom: 16px; }
          .header { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 16px; align-items: start; border-bottom: 2px solid #dbe7fb; padding-bottom: 14px; }
          .school-name { font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #2563eb; }
          .header-title { margin-top: 8px; font-size: 22px; font-weight: 800; }
          .header-subtitle { margin-top: 6px; color: #475569; font-size: 13px; }
          .generated-box { border: 1px solid #dbe7fb; border-radius: 14px; background: #eff6ff; padding: 10px; font-size: 11px; color: #475569; }
          .generated-at { margin-top: 6px; color: #0f172a; font-weight: 700; }
          .identity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
          .identity-card { border: 1px solid #dbe7fb; border-radius: 14px; background: #f8fbff; padding: 12px; }
          .identity-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .identity-grid { display: grid; grid-template-columns: 68px 10px 1fr; gap: 8px; row-gap: 8px; margin-top: 10px; font-size: 13px; }
          .legal-body { margin-top: 10px; font-size: 13px; color: #334155; }
          .legal-name { font-weight: 800; color: #0f172a; margin-bottom: 8px; }
          .barcode { width: 96px; height: 96px; object-fit: contain; margin-top: 12px; border: 1px solid #dbe7fb; border-radius: 10px; background: #fff; padding: 6px; }
          .schedule-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          .schedule-table th, .schedule-table td { border: 1px solid #dbe7fb; padding: 10px; text-align: left; font-size: 12px; vertical-align: top; }
          .schedule-table th { background: #eff6ff; font-weight: 700; }
        </style>
      </head>
      <body>${cards.map((card) => buildExamCardSheet(card)).join('')}</body>
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

      <MobileActiveAcademicYearNotice
        name={activeYearQuery.data?.name}
        semester={activeYearQuery.data?.semester}
        helperText="Kartu ujian operasional di halaman ini otomatis mengikuti tahun ajaran aktif yang tampil di header aplikasi."
      />

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

        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Cari siswa / ruang / kursi</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama siswa, NIS, kelas, ruang, sesi, atau kursi..."
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
