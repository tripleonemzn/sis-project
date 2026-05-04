import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileMenuTabBar } from '../../../../src/components/MobileMenuTabBar';
import { MobileSummaryCard } from '../../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { teachingJournalApi } from '../../../../src/features/teachingJournals/teachingJournalApi';
import {
  JOURNAL_STATUS_LABELS,
  type TeachingJournalMonitoringAggregate,
  type TeachingJournalMonitoringClassRow,
  type TeachingJournalMonitoringIssueRow,
  type TeachingJournalMonitoringTeacherRow,
} from '../../../../src/features/teachingJournals/types';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../../src/theme/AppTextScaleProvider';

type RangeTab = 'WEEK' | 'RECENT' | 'CUSTOM';
type ViewTab = 'PRIORITY' | 'CLASSES' | 'ISSUES';

const RANGE_ITEMS: Array<{ key: RangeTab; label: string; iconName: React.ComponentProps<typeof Feather>['name'] }> = [
  { key: 'WEEK', label: 'Minggu Ini', iconName: 'calendar' },
  { key: 'RECENT', label: '30 Hari', iconName: 'clock' },
  { key: 'CUSTOM', label: 'Manual', iconName: 'sliders' },
];

const VIEW_ITEMS: Array<{ key: ViewTab; label: string; iconName: React.ComponentProps<typeof Feather>['name'] }> = [
  { key: 'PRIORITY', label: 'Prioritas Guru', iconName: 'shield' },
  { key: 'CLASSES', label: 'Kelas', iconName: 'grid' },
  { key: 'ISSUES', label: 'Temuan', iconName: 'alert-triangle' },
];

const EMPTY_SUMMARY: TeachingJournalMonitoringAggregate = {
  expectedSessions: 0,
  journalFilled: 0,
  submittedSessions: 0,
  reviewedSessions: 0,
  draftSessions: 0,
  missingSessions: 0,
  attendanceRecorded: 0,
  attendanceMismatch: 0,
  referenceLinkedSessions: 0,
  referenceFields: {},
  latestJournalAt: null,
  submittedAndReviewed: 0,
  complianceRate: 0,
  fillRate: 0,
  attendanceRate: 0,
  coverageRate: 0,
};

function toIsoDateLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map((item) => Number(item));
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getWeekRange(anchor: Date) {
  const day = anchor.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = addDays(anchor, diffToMonday);
  return {
    start,
    end: addDays(start, 5),
  };
}

function resolveRange(tab: RangeTab, startDate: string, endDate: string) {
  if (tab === 'CUSTOM') return { startDate, endDate };
  const today = new Date();
  if (tab === 'RECENT') {
    return {
      startDate: toIsoDateLocal(addDays(today, -29)),
      endDate: toIsoDateLocal(today),
    };
  }
  const week = getWeekRange(today);
  return {
    startDate: toIsoDateLocal(week.start),
    endDate: toIsoDateLocal(week.end),
  };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return parseIsoDate(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('id-ID');
}

function formatIssuePeriod(row: TeachingJournalMonitoringIssueRow) {
  return row.periodLabel || `Jam ke ${row.period}`;
}

function formatIssueScheduleDetail(row: TeachingJournalMonitoringIssueRow) {
  const details = [
    row.timeRange || null,
    Number(row.jpCount || 0) > 1 ? `${row.jpCount} JP` : null,
    row.room ? `Ruang ${row.room}` : null,
  ].filter(Boolean);
  return details.length ? details.join(' • ') : '-';
}

function rateColor(rate: number) {
  if (rate >= 90) return '#16a34a';
  if (rate >= 70) return '#f59e0b';
  return '#ef4444';
}

function supervisionMeta(row: TeachingJournalMonitoringAggregate) {
  if (row.complianceRate < 70 || row.missingSessions >= 3 || row.attendanceMismatch >= 3) {
    return {
      label: 'Prioritas Tinggi',
      color: '#be123c',
      bg: '#fff1f2',
      border: '#fecdd3',
    };
  }
  if (row.complianceRate < 90 || row.coverageRate < 70 || row.missingSessions > 0 || row.attendanceMismatch > 0) {
    return {
      label: 'Perlu Dipantau',
      color: '#92400e',
      bg: '#fffbeb',
      border: '#fde68a',
    };
  }
  return {
    label: 'Terkendali',
    color: '#047857',
    bg: '#ecfdf5',
    border: '#a7f3d0',
  };
}

function DateStepper({
  label,
  value,
  onChange,
  bodyTextStyle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  bodyTextStyle: { fontSize?: number; lineHeight?: number };
}) {
  return (
    <View style={{ flex: 1, minWidth: 150 }}>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 5, ...bodyTextStyle }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          backgroundColor: '#fff',
          paddingHorizontal: 8,
          paddingVertical: 8,
        }}
      >
        <Pressable onPress={() => onChange(toIsoDateLocal(addDays(parseIsoDate(value), -1)))}>
          <Feather name="chevron-left" size={18} color={BRAND_COLORS.blue} />
        </Pressable>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>{formatDate(value)}</Text>
        <Pressable onPress={() => onChange(toIsoDateLocal(addDays(parseIsoDate(value), 1)))}>
          <Feather name="chevron-right" size={18} color={BRAND_COLORS.blue} />
        </Pressable>
      </View>
    </View>
  );
}

function MetricChip({
  label,
  value,
  bodyTextStyle,
}: {
  label: string;
  value: string;
  bodyTextStyle: { fontSize?: number; lineHeight?: number };
}) {
  return (
    <View
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#dbe7fb',
        backgroundColor: '#f8fafc',
        paddingHorizontal: 10,
        paddingVertical: 8,
        minWidth: 92,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>{label}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', marginTop: 2, ...bodyTextStyle }}>{value}</Text>
    </View>
  );
}

function ProgressLine({
  label,
  value,
  percent,
  color,
  bodyTextStyle,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
  bodyTextStyle: { fontSize?: number; lineHeight?: number };
}) {
  const safePercent = Math.max(0, Math.min(100, percent));
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>{label}</Text>
        <Text style={{ color, fontWeight: '800', ...bodyTextStyle }}>{value}</Text>
      </View>
      <View style={{ height: 7, borderRadius: 999, backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
        <View style={{ width: `${safePercent}%`, height: 7, borderRadius: 999, backgroundColor: color }} />
      </View>
    </View>
  );
}

function StatusBadge({
  row,
  bodyTextStyle,
}: {
  row: TeachingJournalMonitoringAggregate;
  bodyTextStyle: { fontSize?: number; lineHeight?: number };
}) {
  const meta = supervisionMeta(row);
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
      <Text style={{ color: meta.color, fontWeight: '800', ...bodyTextStyle }}>{meta.label}</Text>
    </View>
  );
}

function TeacherRow({
  row,
  bodyTextStyle,
  helperTextStyle,
  sectionTitleTextStyle,
}: {
  row: TeachingJournalMonitoringTeacherRow;
  bodyTextStyle: { fontSize?: number; lineHeight?: number };
  helperTextStyle: { fontSize?: number; lineHeight?: number };
  sectionTitleTextStyle: { fontSize?: number; lineHeight?: number };
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 14, backgroundColor: '#fff', padding: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', ...sectionTitleTextStyle }}>{row.teacher.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...helperTextStyle }}>@{row.teacher.username || '-'}</Text>
        </View>
        <Text style={{ color: rateColor(row.complianceRate), fontWeight: '900', ...sectionTitleTextStyle }}>
          {formatPercent(row.complianceRate)}
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        <StatusBadge row={row} bodyTextStyle={bodyTextStyle} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <MetricChip label="Sesi" value={formatNumber(row.expectedSessions)} bodyTextStyle={bodyTextStyle} />
        <MetricChip label="Terkirim" value={formatNumber(row.submittedAndReviewed)} bodyTextStyle={bodyTextStyle} />
        <MetricChip label="Belum" value={formatNumber(row.missingSessions)} bodyTextStyle={bodyTextStyle} />
        <MetricChip label="Mismatch" value={formatNumber(row.attendanceMismatch)} bodyTextStyle={bodyTextStyle} />
      </View>
      <ProgressLine
        label="Coverage Referensi"
        value={formatPercent(row.coverageRate)}
        percent={row.coverageRate}
        color={BRAND_COLORS.blue}
        bodyTextStyle={bodyTextStyle}
      />
    </View>
  );
}

function ClassRow({
  row,
  bodyTextStyle,
  sectionTitleTextStyle,
}: {
  row: TeachingJournalMonitoringClassRow;
  bodyTextStyle: { fontSize?: number; lineHeight?: number };
  sectionTitleTextStyle: { fontSize?: number; lineHeight?: number };
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 14, backgroundColor: '#fff', padding: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', ...sectionTitleTextStyle }}>{row.class.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...bodyTextStyle }}>
            {row.class.major?.name || row.class.level || '-'}
          </Text>
        </View>
        <Text style={{ color: rateColor(row.complianceRate), fontWeight: '900', ...sectionTitleTextStyle }}>
          {formatPercent(row.complianceRate)}
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        <StatusBadge row={row} bodyTextStyle={bodyTextStyle} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <MetricChip label="Sesi" value={formatNumber(row.expectedSessions)} bodyTextStyle={bodyTextStyle} />
        <MetricChip label="Terkirim" value={formatNumber(row.submittedAndReviewed)} bodyTextStyle={bodyTextStyle} />
        <MetricChip label="Belum" value={formatNumber(row.missingSessions)} bodyTextStyle={bodyTextStyle} />
        <MetricChip label="Mismatch" value={formatNumber(row.attendanceMismatch)} bodyTextStyle={bodyTextStyle} />
      </View>
    </View>
  );
}

function IssueRow({
  row,
  bodyTextStyle,
  helperTextStyle,
  sectionTitleTextStyle,
}: {
  row: TeachingJournalMonitoringIssueRow;
  bodyTextStyle: { fontSize?: number; lineHeight?: number };
  helperTextStyle: { fontSize?: number; lineHeight?: number };
  sectionTitleTextStyle: { fontSize?: number; lineHeight?: number };
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#fecdd3', borderRadius: 14, backgroundColor: '#fff', padding: 12 }}>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', ...sectionTitleTextStyle }}>
        {formatDate(row.date)} - {formatIssuePeriod(row)}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3, ...helperTextStyle }}>
        {formatIssueScheduleDetail(row)}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3, ...bodyTextStyle }}>
        {row.teacher.name} - {row.class.name} - {row.subject.name}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3, ...helperTextStyle }}>
        Jurnal: {JOURNAL_STATUS_LABELS[row.journalStatus]} - Presensi {row.attendanceStatus === 'RECORDED' ? 'ada' : 'belum ada'} - Ref {row.referenceCount}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {row.issueLabels.map((label) => {
          const isReference = label.toLowerCase().includes('referensi');
          return (
            <View
              key={label}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: isReference ? '#bfdbfe' : '#fecdd3',
                backgroundColor: isReference ? '#eff6ff' : '#fff1f2',
                paddingHorizontal: 9,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: isReference ? BRAND_COLORS.blue : '#be123c', fontWeight: '700', ...helperTextStyle }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function PrincipalTeachingJournalSupervisionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const [rangeTab, setRangeTab] = useState<RangeTab>('WEEK');
  const [viewTab, setViewTab] = useState<ViewTab>('PRIORITY');
  const [customStartDate, setCustomStartDate] = useState(() => toIsoDateLocal(addDays(new Date(), -6)));
  const [customEndDate, setCustomEndDate] = useState(() => toIsoDateLocal(new Date()));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const headingTextStyle = useMemo(
    () => ({ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28) }),
    [scaleFont, scaleLineHeight],
  );
  const sectionTitleTextStyle = useMemo(
    () => ({ fontSize: scaleFont(16), lineHeight: scaleLineHeight(24) }),
    [scaleFont, scaleLineHeight],
  );
  const bodyTextStyle = useMemo(
    () => ({ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }),
    [scaleFont, scaleLineHeight],
  );
  const helperTextStyle = useMemo(
    () => ({ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }),
    [scaleFont, scaleLineHeight],
  );
  const inputTextStyle = useMemo(
    () => ({ fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }),
    [scaleFont, scaleLineHeight],
  );

  const range = useMemo(() => resolveRange(rangeTab, customStartDate, customEndDate), [customEndDate, customStartDate, rangeTab]);

  const supervisionQuery = useQuery({
    queryKey: ['mobile-principal-teaching-journal-supervision', range.startDate, range.endDate, search],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    staleTime: 60 * 1000,
    queryFn: () =>
      teachingJournalApi.getMonitoring({
        startDate: range.startDate,
        endDate: range.endDate,
        search: search || undefined,
        issueLimit: 80,
      }),
  });

  const summary = supervisionQuery.data?.summary || EMPTY_SUMMARY;
  const teacherRows = supervisionQuery.data?.teacherRows || [];
  const classRows = supervisionQuery.data?.classRows || [];
  const issueRows = supervisionQuery.data?.issueRows || [];

  const priorityTeacherRows = useMemo(() => {
    return [...teacherRows].sort((left, right) => {
      const leftPriority = left.missingSessions * 3 + left.attendanceMismatch * 2 + Math.max(0, 90 - left.complianceRate);
      const rightPriority = right.missingSessions * 3 + right.attendanceMismatch * 2 + Math.max(0, 90 - right.complianceRate);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return left.teacher.name.localeCompare(right.teacher.name, 'id-ID');
    });
  }, [teacherRows]);

  const priorityClassRows = useMemo(() => {
    return [...classRows].sort((left, right) => {
      const leftPriority = left.missingSessions * 3 + left.attendanceMismatch * 2 + Math.max(0, 90 - left.complianceRate);
      const rightPriority = right.missingSessions * 3 + right.attendanceMismatch * 2 + Math.max(0, 90 - right.complianceRate);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return left.class.name.localeCompare(right.class.name, 'id-ID', { numeric: true });
    });
  }, [classRows]);

  const teacherNeedsAttention = priorityTeacherRows.filter((row) => supervisionMeta(row).label !== 'Terkendali').length;
  const classNeedsAttention = priorityClassRows.filter((row) => supervisionMeta(row).label !== 'Terkendali').length;
  const activeCount = viewTab === 'PRIORITY' ? priorityTeacherRows.length : viewTab === 'CLASSES' ? priorityClassRows.length : issueRows.length;

  if (isLoading) return <AppLoadingScreen message="Memuat supervisi jurnal..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8, ...headingTextStyle }}>
          Supervisi Jurnal Mengajar
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk Kepala Sekolah." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={supervisionQuery.isFetching}
          onRefresh={() => {
            void supervisionQuery.refetch();
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontWeight: '700', ...headingTextStyle }}>
          Supervisi Jurnal Mengajar
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12, ...inputTextStyle }}>
        Ringkasan prioritas supervisi guru berdasarkan jurnal, presensi mapel, dan perangkat ajar.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ width: '48.5%', marginBottom: 8 }}>
          <MobileSummaryCard
            title="Kepatuhan"
            value={formatPercent(summary.complianceRate)}
            subtitle={`${formatNumber(summary.submittedAndReviewed)} jurnal terkirim`}
            iconName="check-circle"
            accentColor="#16a34a"
          />
        </View>
        <View style={{ width: '48.5%', marginBottom: 8 }}>
          <MobileSummaryCard
            title="Butuh Supervisi"
            value={formatNumber(teacherNeedsAttention)}
            subtitle={`${formatNumber(classNeedsAttention)} kelas perlu perhatian`}
            iconName="shield"
            accentColor="#ef4444"
          />
        </View>
        <View style={{ width: '48.5%', marginBottom: 8 }}>
          <MobileSummaryCard
            title="Mismatch Presensi"
            value={formatNumber(summary.attendanceMismatch)}
            subtitle={`${formatPercent(summary.attendanceRate)} presensi tercatat`}
            iconName="alert-triangle"
            accentColor="#f59e0b"
          />
        </View>
        <View style={{ width: '48.5%', marginBottom: 8 }}>
          <MobileSummaryCard
            title="Coverage Referensi"
            value={formatPercent(summary.coverageRate)}
            subtitle={`${formatNumber(summary.referenceLinkedSessions)} jurnal berreferensi`}
            iconName="book-open"
            accentColor="#0ea5e9"
          />
        </View>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#bfdbfe',
          borderRadius: 14,
          backgroundColor: '#eff6ff',
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: BRAND_COLORS.blue, fontWeight: '800', ...bodyTextStyle }}>Acuan supervisi</Text>
        <Text style={{ color: BRAND_COLORS.navy, marginTop: 4, ...helperTextStyle }}>
          Prioritaskan guru dengan jurnal belum diisi, presensi tidak sinkron, atau coverage perangkat ajar rendah.
        </Text>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 14,
          backgroundColor: '#fff',
          padding: 12,
          marginBottom: 12,
        }}
      >
        <MobileMenuTabBar
          items={RANGE_ITEMS}
          activeKey={rangeTab}
          onChange={(key) => setRangeTab(key as RangeTab)}
          style={{ marginBottom: 12 }}
          minTabWidth={92}
          maxTabWidth={118}
        />

        {rangeTab === 'CUSTOM' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <DateStepper label="Dari" value={customStartDate} onChange={setCustomStartDate} bodyTextStyle={bodyTextStyle} />
            <DateStepper label="Sampai" value={customEndDate} onChange={setCustomEndDate} bodyTextStyle={bodyTextStyle} />
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            paddingHorizontal: 12,
          }}
        >
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={() => setSearch(searchInput.trim())}
            placeholder="Cari guru, kelas, mapel..."
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
            style={{
              flex: 1,
              paddingHorizontal: 8,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
              ...inputTextStyle,
            }}
          />
          <Pressable onPress={() => setSearch(searchInput.trim())}>
            <Text style={{ color: BRAND_COLORS.blue, fontWeight: '800', ...bodyTextStyle }}>Cari</Text>
          </Pressable>
        </View>
      </View>

      {supervisionQuery.isLoading ? <QueryStateView type="loading" message="Memuat supervisi jurnal..." /> : null}
      {supervisionQuery.isError ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView
            type="error"
            message="Gagal memuat supervisi jurnal mengajar."
            onRetry={() => supervisionQuery.refetch()}
          />
        </View>
      ) : null}

      {supervisionQuery.data ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 14,
            backgroundColor: '#fff',
            padding: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', marginBottom: 4, ...sectionTitleTextStyle }}>
            Tabel Supervisi
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12, ...bodyTextStyle }}>
            Data mengikuti tahun ajaran aktif dan filter tanggal yang dipilih.
          </Text>

          <MobileMenuTabBar
            items={VIEW_ITEMS}
            activeKey={viewTab}
            onChange={(key) => setViewTab(key as ViewTab)}
            style={{ marginBottom: 12 }}
            minTabWidth={92}
            maxTabWidth={128}
          />

          {activeCount === 0 ? <QueryStateView type="error" message="Tidak ada data pada filter saat ini." /> : null}

          {viewTab === 'PRIORITY' ? (
            <View style={{ gap: 10 }}>
              {priorityTeacherRows.map((row) => (
                <TeacherRow
                  key={row.teacher.id}
                  row={row}
                  bodyTextStyle={bodyTextStyle}
                  helperTextStyle={helperTextStyle}
                  sectionTitleTextStyle={sectionTitleTextStyle}
                />
              ))}
            </View>
          ) : null}

          {viewTab === 'CLASSES' ? (
            <View style={{ gap: 10 }}>
              {priorityClassRows.map((row) => (
                <ClassRow
                  key={row.class.id}
                  row={row}
                  bodyTextStyle={bodyTextStyle}
                  sectionTitleTextStyle={sectionTitleTextStyle}
                />
              ))}
            </View>
          ) : null}

          {viewTab === 'ISSUES' ? (
            <View style={{ gap: 10 }}>
              {issueRows.map((row) => (
                <IssueRow
                  key={row.sessionKey}
                  row={row}
                  bodyTextStyle={bodyTextStyle}
                  helperTextStyle={helperTextStyle}
                  sectionTitleTextStyle={sectionTitleTextStyle}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}
