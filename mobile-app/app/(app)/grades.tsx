import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import MobileMenuTabBar from '../../src/components/MobileMenuTabBar';
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

type GradeTabKey = 'PROGRAM' | 'REPORT';

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

function GradeComponentCard({ item }: { item: StudentGradeOverviewSubjectComponent }) {
  const { colors } = useAppTheme();
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
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{item.label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
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
          <Text style={{ color: available ? '#15803d' : '#475569', fontSize: 11, fontWeight: '700' }}>
            {available ? 'Tersedia' : 'Belum tersedia'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Nilai</Text>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 24, marginTop: 2 }}>
            {formatScore(item.score)}
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
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
              <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '600' }}>
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
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  const { item, expanded, onToggle } = props;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          opacity: pressed ? 0.92 : 1,
          paddingHorizontal: 14,
          paddingVertical: 14,
          backgroundColor: expanded ? colors.surfaceMuted : colors.surface,
        })}
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
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{item.subject.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                  {item.subject.code}
                  {item.teacher?.name ? ` • ${item.teacher.name}` : ''}
                </Text>
              </View>
              <Feather name={expanded ? 'chevron-down' : 'chevron-right'} size={18} color={colors.textMuted} />
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
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>KKM {item.kkm}</Text>
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
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                  Nilai Akhir {formatScore(item.finalScore)}
                </Text>
              </View>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: item.componentSummary.pendingCount > 0 ? '#fde68a' : '#bbf7d0',
                  backgroundColor: item.componentSummary.pendingCount > 0 ? '#fffbeb' : '#f0fdf4',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    color: item.componentSummary.pendingCount > 0 ? '#b45309' : '#15803d',
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {item.componentSummary.availableCount}/{item.componentSummary.totalCount} komponen
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingVertical: 14, gap: 12 }}>
          {item.components.map((component) => (
            <GradeComponentCard key={`${item.subject.id}-${component.code}`} item={component} />
          ))}

          <View style={{ gap: 10 }}>
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
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
                PREDIKAT
              </Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 22, marginTop: 6 }}>
                {item.predicate || '-'}
              </Text>
            </View>
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
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
                CATATAN KOMPETENSI
              </Text>
              <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20, marginTop: 6 }}>
                {item.description || 'Deskripsi nilai belum tersedia.'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ReportSubjectCard({ item }: { item: StudentSemesterReportSubjectRow }) {
  const { colors } = useAppTheme();
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
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{item.subject.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
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
          <Text style={{ color: '#b45309', fontSize: 12, lineHeight: 18, fontWeight: '600' }}>
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
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>KKM {item.kkm}</Text>
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
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>
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
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>
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
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
          {isLocked ? 'STATUS RILIS' : 'CATATAN KOMPETENSI'}
        </Text>
        <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20, marginTop: 6 }}>
          {isLocked ? 'Detail rapor semester masih terkunci sampai tanggal rilis tiba.' : item.description || 'Deskripsi rapor belum tersedia.'}
        </Text>
      </View>
    </View>
  );
}

export default function GradesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<GradeTabKey>('PROGRAM');
  const [expandedSubjectId, setExpandedSubjectId] = useState<number | null>(null);
  const gradesQuery = useStudentGradesQuery({ enabled: isAuthenticated, user });
  const pageContentPadding = getStandardPagePadding(insets);
  const overview = gradesQuery.data?.overview;

  const programSummary = useMemo(() => {
    if (!overview) return [];
    return overview.components.map((component) => {
      const availableSubjects = overview.subjects.filter((subject) =>
        subject.components.some((row) => row.code === component.code && row.status === 'AVAILABLE'),
      ).length;
      return {
        code: component.code,
        label: component.label,
        reportSlotCode: component.reportSlotCode,
        availableSubjects,
        pendingSubjects: Math.max(overview.subjects.length - availableSubjects, 0),
      };
    });
  }, [overview]);

  if (isLoading) return <AppLoadingScreen message="Memuat nilai..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#0f172a' }}>Nilai Saya</Text>
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
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#0f172a' }}>Nilai Saya</Text>
        <Text style={{ color: '#64748b' }}>
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
          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
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
          <MobileMenuTabBar
            items={[
              { key: 'PROGRAM', label: 'Nilai Program', iconName: 'layers' },
              { key: 'REPORT', label: 'Rapor Semester', iconName: 'file-text' },
            ]}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as GradeTabKey)}
          />

          {activeTab === 'PROGRAM' ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Total Mapel"
                    value={String(overview.summary.totalSubjects)}
                    subtitle="Mata pelajaran aktif"
                    iconName="book-open"
                  />
                </View>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Mapel Tersedia"
                    value={String(overview.summary.subjectsWithAnyScore)}
                    subtitle="Sudah ada nilai"
                    iconName="check-circle"
                    accentColor="#16a34a"
                  />
                </View>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Komponen Tersedia"
                    value={String(overview.summary.availableComponents)}
                    subtitle={`${overview.summary.pendingComponents} komponen menunggu`}
                    iconName="layers"
                    accentColor="#0f766e"
                  />
                </View>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Rata-rata Akhir"
                    value={formatScore(overview.summary.averageFinalScore)}
                    subtitle="Nilai akhir semester berjalan"
                    iconName="trending-up"
                    accentColor="#b45309"
                  />
                </View>
              </View>

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
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Ringkasan Program Ujian</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  Status komponen nilai aktif untuk semester berjalan pada setiap mata pelajaran.
                </Text>
                <View style={{ gap: 10 }}>
                  {programSummary.map((component) => (
                    <View
                      key={component.code}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        gap: 6,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{component.label}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                            {component.reportSlotCode.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderRadius: 999,
                            backgroundColor: '#dbeafe',
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>
                            {component.availableSubjects}/{overview.summary.totalSubjects}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {component.availableSubjects} mapel sudah tersedia • {component.pendingSubjects} mapel masih menunggu
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

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
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Daftar Nilai Program Ujian</Text>
                <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 13, lineHeight: 20 }}>
                  {overview.summary.totalSubjects} mata pelajaran aktif • {overview.summary.pendingComponents} komponen belum tersedia
                </Text>
              </View>

              {overview.subjects.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {overview.subjects.map((subject) => (
                    <ProgramSubjectCard
                      key={subject.subject.id}
                      item={subject}
                      expanded={expandedSubjectId === subject.subject.id}
                      onToggle={() =>
                        setExpandedSubjectId((current) => (current === subject.subject.id ? null : subject.subject.id))
                      }
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
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 12 }}>
                    Belum ada data nilai program
                  </Text>
                  <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                    Komponen nilai untuk semester berjalan belum tersedia.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor:
                    overview.reportCard.release.tone === 'green'
                      ? '#bbf7d0'
                      : overview.reportCard.release.tone === 'amber'
                        ? '#fde68a'
                        : '#fecdd3',
                  backgroundColor:
                    overview.reportCard.release.tone === 'green'
                      ? '#f0fdf4'
                      : overview.reportCard.release.tone === 'amber'
                        ? '#fffbeb'
                        : '#fff1f2',
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  gap: 10,
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
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                      Rilis Semester: {overview.reportCard.release.label}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>
                    {overview.reportCard.release.description}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Kesiapan data: {overview.reportCard.status.label}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {overview.reportCard.reportDate
                      ? `${overview.reportCard.reportDate.place} • ${formatDateLabel(overview.reportCard.reportDate.date)} • ${overview.reportCard.semesterType}`
                    : `Tanggal rapor belum diatur • ${overview.reportCard.semesterType}`}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Mapel Siap"
                    value={`${overview.reportCard.summary.availableSubjects}/${overview.reportCard.summary.expectedSubjects}`}
                    subtitle="Kesiapan rapor semester"
                    iconName="check-circle"
                    accentColor={
                      overview.reportCard.status.tone === 'green'
                        ? '#16a34a'
                        : overview.reportCard.status.tone === 'amber'
                          ? '#b45309'
                          : '#e11d48'
                    }
                  />
                </View>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Rata-rata"
                    value={formatScore(overview.reportCard.summary.averageFinalScore)}
                    subtitle="Nilai akhir semester"
                    iconName="trending-up"
                    accentColor="#2563eb"
                  />
                </View>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Kehadiran"
                    value={String(overview.reportCard.attendance.hadir)}
                    subtitle={`${overview.reportCard.attendance.sakit} sakit • ${overview.reportCard.attendance.izin} izin • ${overview.reportCard.attendance.alpha} alpha`}
                    iconName="user-check"
                    accentColor="#16a34a"
                  />
                </View>
                <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                  <MobileSummaryCard
                    title="Mapel Menunggu"
                    value={String(overview.reportCard.summary.missingSubjects)}
                    subtitle="Masih belum lengkap"
                    iconName="clock"
                    accentColor={overview.reportCard.summary.missingSubjects > 0 ? '#b45309' : '#16a34a'}
                  />
                </View>
              </View>

              {!overview.reportCard.release.canViewDetails ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fde68a',
                    backgroundColor: '#fffbeb',
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Detail Rapor Menunggu Rilis</Text>
                  <Text style={{ color: colors.text, marginTop: 8, lineHeight: 22 }}>
                    Nama mapel semester sudah ditampilkan, tetapi nilai akhir, predikat, dan catatan kompetensi baru akan terbuka setelah tanggal rilis rapor.
                  </Text>
                </View>
              ) : null}

              {overview.reportCard.release.canViewDetails && overview.reportCard.homeroomNote ? (
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
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Catatan Wali Kelas</Text>
                  <Text style={{ color: colors.text, marginTop: 10, lineHeight: 22 }}>
                    {overview.reportCard.homeroomNote}
                  </Text>
                </View>
              ) : null}

              {overview.reportCard.subjects.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {overview.reportCard.subjects.map((subject) => (
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
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 12 }}>
                    Belum ada data rapor semester
                  </Text>
                  <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
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
