import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import MobileSummaryCard from '../../src/components/MobileSummaryCard';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import {
  StudentGradeOverviewSubjectComponent,
  StudentGradeOverviewSubjectRow,
} from '../../src/features/grades/types';
import { useStudentGradesQuery } from '../../src/features/grades/useStudentGradesQuery';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { useAppTheme } from '../../src/theme/AppThemeProvider';

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
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

function SubjectCard(props: {
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

export default function GradesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [expandedSubjectId, setExpandedSubjectId] = useState<number | null>(null);
  const gradesQuery = useStudentGradesQuery({ enabled: isAuthenticated, user });
  const pageContentPadding = getStandardPagePadding(insets);

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

  const overview = gradesQuery.data?.overview;

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
        <Text style={{ color: '#64748b' }}>Ringkasan komponen nilai semester berjalan untuk setiap mata pelajaran.</Text>
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
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginTop: 16 }}>
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
              marginBottom: 14,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Daftar Nilai Mata Pelajaran</Text>
            <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 13, lineHeight: 20 }}>
              {overview.summary.totalSubjects} mata pelajaran aktif • {overview.summary.pendingComponents} komponen belum tersedia
            </Text>
            <View
              style={{
                marginTop: 10,
                alignSelf: 'flex-start',
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceMuted,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Mengikuti semester berjalan</Text>
            </View>
          </View>

          {overview.subjects.length > 0 ? (
            <View style={{ gap: 12 }}>
              {overview.subjects.map((subject) => (
                <SubjectCard
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
                Belum ada data nilai aktif
              </Text>
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                Nilai untuk semester berjalan belum tersedia.
              </Text>
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}
