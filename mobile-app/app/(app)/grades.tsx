import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import MobileMenuTabBar from '../../src/components/MobileMenuTabBar';
import MobileSelectField from '../../src/components/MobileSelectField';
import MobileSummaryCard from '../../src/components/MobileSummaryCard';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import {
  StudentGradeOverviewSubjectComponent,
  StudentGradeOverviewSubjectRow,
  StudentSemesterReportSubjectRow,
} from '../../src/features/grades/types';
import { useStudentGradesQuery } from '../../src/features/grades/useStudentGradesQuery';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { useAppTheme } from '../../src/theme/AppThemeProvider';
import { useAppTextScale } from '../../src/theme/AppTextScaleProvider';

type GradeTabKey = 'PROGRAM' | 'REPORT';
type ReportSemesterValue = '' | 'ODD' | 'EVEN';

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatSemesterLabel(value: 'ODD' | 'EVEN') {
  return value === 'EVEN' ? 'Genap' : 'Ganjil';
}

function calculateAverage(values: number[]) {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function getProgramTabIconName(programCode: string): React.ComponentProps<typeof Feather>['name'] {
  const normalized = String(programCode || '').trim().toUpperCase();
  if (normalized === 'SBTS') return 'calendar';
  if (normalized === 'SAS') return 'file-text';
  if (normalized === 'SAT') return 'award';
  if (normalized === 'ASAJ') return 'clipboard';
  if (normalized === 'ASAJP') return 'briefcase';
  return 'layers';
}

function GradeComponentCard({ item }: { item: StudentGradeOverviewSubjectComponent }) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const available = item.status === 'AVAILABLE';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: available ? '#bbf7d0' : colors.border,
        backgroundColor: available ? '#f0fdf4' : colors.surfaceMuted,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(13) }}>{item.label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), marginTop: 2 }}>
            {String(item.reportSlotCode || '').replace(/_/g, ' ')}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
            backgroundColor: available ? '#dcfce7' : '#e2e8f0',
          }}
        >
          <Text style={{ color: available ? '#15803d' : '#475569', fontSize: scaleFont(11), fontWeight: '700' }}>
            {available ? 'Tersedia' : 'Belum tersedia'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: scaleFont(11) }}>Nilai</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: scaleFont(20), marginTop: 2 }}>
            {formatScore(item.score)}
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), lineHeight: scaleLineHeight(17) }}>
          {item.entryMode === 'NF_SERIES' ? 'Seri NF' : 'Skor tunggal'}
        </Text>
      </View>

      {item.series.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {item.series.map((score, index) => (
            <View
              key={`${item.code}-series-${index}`}
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontSize: scaleFont(11), fontWeight: '600' }}>
                NF{index + 1}: {formatScore(score)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ProgramSubjectCard(props: {
  item: StudentGradeOverviewSubjectRow;
  component: StudentGradeOverviewSubjectComponent;
  releaseLocked: boolean;
}) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const { item, component, releaseLocked } = props;
  const available = !releaseLocked && component.status === 'AVAILABLE';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="book-open" size={18} color="#2563eb" />
        </View>

        <View style={{ flex: 1, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: scaleFont(15) }}>{item.subject.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: scaleFont(12), marginTop: 3 }}>
                {item.subject.code}
                {item.teacher?.name ? ` • ${item.teacher.name}` : ''}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), fontWeight: '600' }}>KKM {item.kkm}</Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), fontWeight: '600' }}>
                Program {component.reportSlotCode}
              </Text>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: available ? '#bbf7d0' : '#fde68a',
                backgroundColor: available ? '#f0fdf4' : '#fffbeb',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  color: available ? '#15803d' : '#b45309',
                  fontSize: scaleFont(11),
                  fontWeight: '700',
                }}
              >
                {releaseLocked ? 'Menunggu rilis' : available ? 'Tersedia' : 'Menunggu'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: available ? '#bbf7d0' : colors.border,
            backgroundColor: available ? '#f0fdf4' : colors.surfaceMuted,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), fontWeight: '700', letterSpacing: 0.6 }}>
            NILAI PROGRAM
          </Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: scaleFont(20), marginTop: 6 }}>
            {releaseLocked ? '-' : formatScore(component.score)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: scaleFont(12), marginTop: 4 }}>
            {component.entryMode === 'NF_SERIES' ? 'Seri NF' : 'Skor tunggal'}
          </Text>
        </View>

        <GradeComponentCard item={component} />

        <View
          style={{
            borderWidth: 1,
            borderColor: available ? '#bbf7d0' : colors.border,
            backgroundColor: available ? '#f0fdf4' : colors.surfaceMuted,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: colors.text, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
            {releaseLocked
              ? `Nilai ${component.reportSlotCode} untuk mapel ini akan dibuka ke siswa sesuai policy publikasi program.`
              : available
              ? `Nilai ${component.reportSlotCode} untuk mapel ini sudah tersedia dan mengikuti semester berjalan.`
              : `Nilai ${component.reportSlotCode} untuk mapel ini belum tersedia. Data akan tampil setelah guru menyelesaikan input nilai program terkait.`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ReportSubjectCard({ item }: { item: StudentSemesterReportSubjectRow }) {
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const isLocked = item.status === 'LOCKED';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 12,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: scaleFont(15) }}>{item.subject.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: scaleFont(12) }}>
          {item.subject.code}
          {item.teacher?.name ? ` • ${item.teacher.name}` : ''}
        </Text>
      </View>

      {isLocked ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#fde68a',
            backgroundColor: '#fffbeb',
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: '#b45309', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '600' }}>
            Nilai rapor untuk mapel ini akan tampil setelah rapor semester dirilis.
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceMuted,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), fontWeight: '600' }}>KKM {item.kkm}</Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceMuted,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), fontWeight: '600' }}>
              Nilai Akhir {formatScore(item.finalScore)}
            </Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceMuted,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), fontWeight: '600' }}>
              Predikat {item.predicate || '-'}
            </Text>
          </View>
        </View>
      )}

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), fontWeight: '700', letterSpacing: 0.6 }}>
          {isLocked ? 'STATUS RILIS' : 'CATATAN KOMPETENSI'}
        </Text>
        <Text style={{ color: colors.text, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginTop: 6 }}>
          {isLocked ? 'Detail rapor semester masih terkunci sampai tanggal rilis tiba.' : item.description || 'Deskripsi rapor belum tersedia.'}
        </Text>
      </View>
    </View>
  );
}

export default function GradesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<GradeTabKey>('PROGRAM');
  const [activeProgramCode, setActiveProgramCode] = useState<string>('');
  const [selectedReportSemester, setSelectedReportSemester] = useState<ReportSemesterValue>('');
  const gradesQuery = useStudentGradesQuery({
    enabled: isAuthenticated,
    user,
    reportSemester: selectedReportSemester,
  });
  const pageContentPadding = getStandardPagePadding(insets);
  const overview = gradesQuery.data?.overview;
  const effectiveReportSemester = (
    selectedReportSemester ||
    overview?.reportCard.semester ||
    overview?.meta.semester ||
    'ODD'
  ) as 'ODD' | 'EVEN';
  const effectiveReportSemesterLabel = formatSemesterLabel(effectiveReportSemester);
  const programTabSubtitle = useMemo(() => {
    if (!overview || overview.components.length === 0) {
      return 'Tab ini menampilkan nilai per program ujian aktif seperti SBTS, SAS, atau SAT pada setiap mata pelajaran.';
    }
    const labels = Array.from(
      new Set(overview.components.map((component) => component.reportSlotCode).filter(Boolean)),
    );
    if (labels.length === 1) {
      return `Tab ini menampilkan skor ${labels[0]} per mata pelajaran. Jika sekolah hanya memakai satu program ujian aktif, nilainya akan muncul di sini.`;
    }
    return `Tab ini menampilkan skor per program ujian aktif. Pilih ${labels.join(', ')} untuk melihat nilai ujian yang berbeda pada mata pelajaran yang sama.`;
  }, [overview]);
  const reportTabSubtitle = useMemo(
    () =>
      `Tab ini menampilkan hasil akhir rapor semester: nilai akhir per mapel, kehadiran, dan catatan wali kelas. Ini bukan skor satu ujian tertentu, tetapi ringkasan akhir semester ${overview?.meta.semesterLabel || '-'}.`,
    [overview?.meta.semesterLabel],
  );

  const programTabs = useMemo(() => {
    if (!overview) return [];
    return Array.from(
      new Map(
        overview.components.map((component) => [
          component.reportSlotCode,
          {
            key: component.reportSlotCode,
            label: component.reportSlotCode,
            fullLabel: component.label,
            iconName: getProgramTabIconName(component.reportSlotCode),
            release: component.release,
          },
        ]),
      ).values(),
    );
  }, [overview]);
  const activeProgram = useMemo(
    () => programTabs.find((program) => program.key === activeProgramCode) || programTabs[0] || null,
    [programTabs, activeProgramCode],
  );
  const activeProgramSubjects = useMemo(() => {
    if (!overview || !activeProgram) return [];
    return overview.subjects
      .map((subject) => {
        const component = subject.components.find((row) => row.reportSlotCode === activeProgram.key) || null;
        if (!component) return null;
        return { subject, component };
      })
      .filter(
        (row): row is { subject: StudentGradeOverviewSubjectRow; component: StudentGradeOverviewSubjectComponent } =>
          row !== null,
      );
  }, [overview, activeProgram]);
  const activeProgramSummary = useMemo(() => {
    const totalSubjects = activeProgramSubjects.length;
    const availableSubjects = activeProgramSubjects.filter((row) => row.component.status === 'AVAILABLE').length;
    const pendingSubjects = Math.max(totalSubjects - availableSubjects, 0);
    const scores = activeProgramSubjects
      .map((row) => row.component.score)
      .filter((value): value is number => value !== null && value !== undefined);
    return {
      totalSubjects,
      availableSubjects,
      pendingSubjects,
      averageScore: calculateAverage(scores),
    };
  }, [activeProgramSubjects]);
  const activeProgramRelease = activeProgram?.release || null;
  const isProgramReleaseLocked = Boolean(activeProgramRelease && !activeProgramRelease.canViewDetails);
  const reportCard = overview?.reportCard ?? null;
  const isReportTabActive = activeTab === 'REPORT';
  const programReleaseDateLabel = activeProgramRelease?.effectiveDate
    ? formatDateLabel(activeProgramRelease.effectiveDate)
    : activeProgramRelease?.mode === 'REPORT_DATE'
      ? 'Tanggal rapor belum diatur'
      : 'Tanggal publikasi belum diatur';

  useEffect(() => {
    if (!programTabs.length) {
      if (activeProgramCode) setActiveProgramCode('');
      return;
    }
    if (!programTabs.some((program) => program.key === activeProgramCode)) {
      setActiveProgramCode(programTabs[0].key);
    }
  }, [programTabs, activeProgramCode]);

  if (isLoading) return <AppLoadingScreen message="Memuat nilai..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8, color: '#0f172a' }}>Nilai Saya</Text>
        <QueryStateView type="error" message="Fitur nilai siswa hanya tersedia untuk role siswa." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={gradesQuery.isFetching && !gradesQuery.isLoading}
          onRefresh={() => gradesQuery.refetch()}
        />
      }
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', color: '#0f172a' }}>Nilai Saya</Text>
        <Text style={{ color: '#64748b', fontSize: scaleFont(14), lineHeight: scaleLineHeight(22) }}>
          Ringkasan nilai siswa dipisahkan antara program ujian aktif dan rapor semester berjalan.
        </Text>
      </View>

      {overview ? (
        <View
          style={{
            marginTop: 14,
            alignSelf: 'flex-start',
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#eff6ff',
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Feather name="award" size={14} color="#1d4ed8" />
          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(12) }}>
            Semester {overview.meta.semesterLabel}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        {gradesQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data nilai..." /> : null}
        {gradesQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat data nilai siswa." onRetry={() => gradesQuery.refetch()} />
        ) : null}
        {gradesQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={gradesQuery.data.cachedAt} /> : null}
      </View>

      {overview ? (
        <View style={{ marginTop: 16, gap: 14 }}>
          {activeTab === 'PROGRAM' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title="Total Mapel"
                  value={String(activeProgramSummary.totalSubjects)}
                  subtitle={activeProgram ? `${activeProgram.fullLabel} • ${activeProgram.key}` : 'Mapel program aktif'}
                  iconName="book-open"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title="Mapel Tersedia"
                  value={String(activeProgramSummary.availableSubjects)}
                  subtitle={isProgramReleaseLocked ? 'Menunggu publikasi program' : 'Nilai program sudah tampil'}
                  iconName="check-circle"
                  accentColor={isProgramReleaseLocked ? '#b45309' : '#16a34a'}
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title="Mapel Menunggu"
                  value={String(activeProgramSummary.pendingSubjects)}
                  subtitle={isProgramReleaseLocked ? 'Masih tertahan policy publikasi' : 'Masih menunggu input nilai'}
                  iconName="clock"
                  accentColor={activeProgramSummary.pendingSubjects > 0 ? '#b45309' : '#16a34a'}
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title={activeProgram ? `Rata-rata ${activeProgram.key}` : 'Rata-rata'}
                  value={formatScore(activeProgramSummary.averageScore)}
                  subtitle="Dihitung dari nilai program yang sudah tersedia"
                  iconName="trending-up"
                  accentColor="#2563eb"
                />
              </View>
            </View>
          ) : null}

          {isReportTabActive && reportCard ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title="Mapel Siap"
                  value={`${reportCard.summary.availableSubjects}/${reportCard.summary.expectedSubjects}`}
                  subtitle={`Semester ${effectiveReportSemesterLabel.toLowerCase()}`}
                  iconName="check-circle"
                  accentColor={
                    reportCard.status.tone === 'green'
                      ? '#16a34a'
                      : reportCard.status.tone === 'amber'
                        ? '#b45309'
                        : '#e11d48'
                  }
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title="Rata-rata"
                  value={formatScore(reportCard.summary.averageFinalScore)}
                  subtitle={`Nilai akhir semester ${effectiveReportSemesterLabel.toLowerCase()}`}
                  iconName="trending-up"
                  accentColor="#2563eb"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title="Kehadiran"
                  value={String(reportCard.attendance.hadir)}
                  subtitle={`${reportCard.attendance.sakit} sakit • ${reportCard.attendance.izin} izin • ${reportCard.attendance.alpha} alpha`}
                  iconName="user-check"
                  accentColor="#16a34a"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title="Mapel Menunggu"
                  value={String(reportCard.summary.missingSubjects)}
                  subtitle="Masih belum lengkap"
                  iconName="clock"
                  accentColor={reportCard.summary.missingSubjects > 0 ? '#b45309' : '#16a34a'}
                />
              </View>
            </View>
          ) : null}

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 14,
              gap: 12,
            }}
          >
            <MobileMenuTabBar
              items={[
                { key: 'PROGRAM', label: 'Nilai Program Ujian', iconName: 'layers' },
                { key: 'REPORT', label: 'Rapor Semester', iconName: 'file-text' },
              ]}
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as GradeTabKey)}
            />
            <Text style={{ color: colors.textMuted, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
              {activeTab === 'PROGRAM' ? programTabSubtitle : reportTabSubtitle}
            </Text>

            {isReportTabActive && reportCard ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontWeight: '700',
                    fontSize: scaleFont(13),
                    minWidth: 112,
                  }}
                >
                  Semester Rapor
                </Text>
                <View style={{ flex: 1 }}>
                  <MobileSelectField
                    value={effectiveReportSemester}
                    options={[
                      { label: 'Semester Ganjil', value: 'ODD' },
                      { label: 'Semester Genap', value: 'EVEN' },
                    ]}
                    onChange={(value) => setSelectedReportSemester((value as ReportSemesterValue) || '')}
                  />
                </View>
              </View>
            ) : null}
          </View>

          {activeTab === 'PROGRAM' ? (
            <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  gap: 12,
                }}
              >
                <Text style={{ color: colors.text, fontSize: scaleFont(18), fontWeight: '800' }}>Program Ujian Aktif</Text>
                <Text style={{ color: colors.textMuted, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>{programTabSubtitle}</Text>
                <MobileMenuTabBar
                  items={programTabs.map((program) => ({
                    key: program.key,
                    label: program.label,
                    iconName: program.iconName,
                  }))}
                  activeKey={activeProgram?.key || ''}
                  onChange={setActiveProgramCode}
                />
                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: scaleFont(12), fontWeight: '600' }}>
                    Mengikuti semester berjalan
                  </Text>
                </View>
              </View>

              {isProgramReleaseLocked ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fde68a',
                    backgroundColor: '#fffbeb',
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    gap: 8,
                  }}
                  >
                    <View
                    style={{
                      alignSelf: 'flex-start',
                      borderRadius: 999,
                      backgroundColor: colors.surface,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                    >
                      <Text style={{ color: '#b45309', fontSize: scaleFont(12), fontWeight: '700' }}>
                        Nilai program menunggu publikasi
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
                      {activeProgramRelease?.source === 'HOMEROOM'
                        ? `Nilai ${activeProgram?.key || 'program ujian'} masih ditahan wali kelas. ${activeProgramRelease?.description}`
                        : `Nilai ${activeProgram?.key || 'program ujian'} belum dibuka untuk siswa. Rilis saat ini mengikuti ${programReleaseDateLabel}. ${activeProgramRelease?.description}`}
                    </Text>
                  </View>
              ) : null}

              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                }}
              >
                <Text style={{ color: colors.text, fontSize: scaleFont(18), fontWeight: '800' }}>
                  Daftar Nilai {activeProgram?.fullLabel || 'Program Ujian'}
                </Text>
                <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
                  {activeProgramSummary.totalSubjects} mata pelajaran aktif • {activeProgramSummary.pendingSubjects} mapel belum tersedia
                </Text>
              </View>

              {activeProgramSubjects.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {activeProgramSubjects.map(({ subject, component }) => (
                    <ProgramSubjectCard
                      key={`${subject.subject.id}-${component.reportSlotCode}`}
                      item={subject}
                      component={component}
                      releaseLocked={isProgramReleaseLocked}
                    />
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    paddingVertical: 24,
                    alignItems: 'center',
                  }}
                >
                  <Feather name="file-text" size={34} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: scaleFont(16), marginTop: 12 }}>
                    Belum ada data nilai program
                  </Text>
                  <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 6, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
                    {isProgramReleaseLocked
                      ? `Nilai ${activeProgram?.key || 'program ini'} akan tampil setelah policy publikasi program terpenuhi.`
                      : `Nilai ${activeProgram?.key || 'program ini'} untuk semester berjalan belum tersedia.`}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {reportCard?.release.canViewDetails && reportCard.homeroomNote ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: scaleFont(18), fontWeight: '800' }}>Catatan Wali Kelas</Text>
                  <Text style={{ color: colors.text, marginTop: 10, fontSize: scaleFont(13), lineHeight: scaleLineHeight(22) }}>
                    {reportCard.homeroomNote}
                  </Text>
                </View>
              ) : null}

              {reportCard && reportCard.subjects.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {reportCard.subjects.map((subject) => (
                    <ReportSubjectCard key={subject.subject.id} item={subject} />
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    paddingVertical: 24,
                    alignItems: 'center',
                  }}
                >
                  <Feather name="file-text" size={34} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: scaleFont(16), marginTop: 12 }}>
                    Belum ada data rapor semester
                  </Text>
                  <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 6, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
                    Rapor semester berjalan belum siap ditampilkan.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
