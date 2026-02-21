import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { useAuth } from '../auth/AuthProvider';
import { ExamDisplayType } from './types';
import { useTeacherExamPacketsQuery } from './useTeacherExamPacketsQuery';
import { useTeacherAssignmentsQuery } from '../teacherAssignments/useTeacherAssignmentsQuery';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';

type ExamTypeFilter = 'ALL' | ExamDisplayType;

type TeacherExamPacketsModuleScreenProps = {
  title: string;
  subtitle: string;
  fixedType?: ExamDisplayType;
  defaultType?: ExamTypeFilter;
};

function normalizeType(raw: string): ExamDisplayType {
  const value = String(raw || '').toUpperCase();
  if (value === 'QUIZ') return 'FORMATIF';
  if (value === 'FORMATIF' || value === 'SBTS' || value === 'SAS' || value === 'SAT') return value;
  return 'FORMATIF';
}

function questionCountFromUnknown(questions: unknown): number {
  if (Array.isArray(questions)) return questions.length;
  if (typeof questions === 'string') {
    try {
      const parsed = JSON.parse(questions);
      if (Array.isArray(parsed)) return parsed.length;
    } catch {
      return 0;
    }
  }
  return 0;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function TeacherExamPacketsModuleScreen({
  title,
  subtitle,
  fixedType,
  defaultType = 'ALL',
}: TeacherExamPacketsModuleScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 120 });
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignmentOptions = teacherAssignmentsQuery.data?.assignments || [];
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<ExamTypeFilter>(fixedType || defaultType);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!selectedAssignmentId && assignmentOptions.length > 0) {
      setSelectedAssignmentId(assignmentOptions[0].id);
    }
  }, [selectedAssignmentId, assignmentOptions]);

  useEffect(() => {
    if (fixedType) {
      setTypeFilter(fixedType);
      return;
    }
    setTypeFilter(defaultType);
  }, [fixedType, defaultType]);

  const selectedAssignment = assignmentOptions.find((item) => item.id === selectedAssignmentId) || null;
  const packetsQuery = useTeacherExamPacketsQuery({
    enabled: isAuthenticated,
    user,
    subjectId: selectedAssignment?.subject.id,
    academicYearId: selectedAssignment?.academicYear.id,
    semester: selectedAssignment?.academicYear ? undefined : undefined,
  });

  const filtered = useMemo(() => {
    const rows = packetsQuery.data || [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((item) => {
      const type = normalizeType(item.type);
      if (typeFilter !== 'ALL' && type !== typeFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subject.name.toLowerCase().includes(q) ||
        item.subject.code.toLowerCase().includes(q)
      );
    });
  }, [packetsQuery.data, searchQuery, typeFilter]);

  const summary = useMemo(() => {
    const rows = filtered;
    const totalQuestions = rows.reduce((acc, item) => acc + questionCountFromUnknown(item.questions), 0);
    const avgDuration = rows.length
      ? Math.round(rows.reduce((acc, item) => acc + (item.duration || 0), 0) / rows.length)
      : 0;
    return {
      totalPackets: rows.length,
      totalQuestions,
      avgDuration,
    };
  }, [filtered]);

  if (isLoading) return <AppLoadingScreen message="Memuat daftar ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={teacherAssignmentsQuery.isFetching || (packetsQuery.isFetching && !packetsQuery.isLoading)}
          onRefresh={async () => {
            await Promise.all([teacherAssignmentsQuery.refetch(), packetsQuery.refetch()]);
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{subtitle}</Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 11 }}>Packet</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 2 }}>
              {summary.totalPackets}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 11 }}>Jumlah Soal</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 2 }}>
              {summary.totalQuestions}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 11 }}>Durasi Rata2</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 2 }}>
              {summary.avgDuration || 0}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/teacher/exams/editor' as never)}
        style={{
          backgroundColor: '#16a34a',
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Buat Packet Ujian</Text>
      </Pressable>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Kelas dan Mata Pelajaran</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
          {assignmentOptions.map((item) => {
            const selected = selectedAssignmentId === item.id;
            return (
              <View key={item.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <Pressable
                  onPress={() => setSelectedAssignmentId(item.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 11 }}>
                    {item.class.name}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 11 }} numberOfLines={2}>
                    {item.subject.name}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Cari judul ujian..."
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      />

      {!fixedType ? (
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
          {(['ALL', 'FORMATIF', 'SBTS', 'SAS', 'SAT'] as ExamTypeFilter[]).map((item) => {
            const selected = typeFilter === item;
            return (
              <View key={item} style={{ width: '20%', paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setTypeFilter(item)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontSize: 11, fontWeight: '700' }}>
                    {item === 'ALL' ? 'Semua' : item}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ marginBottom: 10 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Filter Tetap: {fixedType}</Text>
          </View>
        </View>
      )}

      {teacherAssignmentsQuery.isLoading || packetsQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat daftar ujian..." />
      ) : null}
      {teacherAssignmentsQuery.isError || packetsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat daftar ujian guru."
          onRetry={() => {
            teacherAssignmentsQuery.refetch();
            packetsQuery.refetch();
          }}
        />
      ) : null}

      {!teacherAssignmentsQuery.isLoading &&
      !packetsQuery.isLoading &&
      !teacherAssignmentsQuery.isError &&
      !packetsQuery.isError ? (
        filtered.length > 0 ? (
          <View>
            {filtered.map((item) => {
              const type = normalizeType(item.type);
              const qCount = questionCountFromUnknown(item.questions);
              return (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>{item.title}</Text>
                    <Text
                      style={{
                        color: '#1d4ed8',
                        backgroundColor: '#eff6ff',
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {type}
                    </Text>
                  </View>
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                    {item.subject.name} • Semester {item.semester || '-'}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
                    Durasi: {item.duration} menit • Soal: {qCount}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
                    Dibuat: {formatDate(item.createdAt)}
                  </Text>
                  <Pressable
                    onPress={() => router.push(`/teacher/exams/editor?packetId=${item.id}` as never)}
                    style={{
                      backgroundColor: '#1d4ed8',
                      borderRadius: 8,
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Edit Packet</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Belum ada packet ujian</Text>
            <Text style={{ color: '#64748b' }}>Belum ada data packet sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

    </ScrollView>
  );
}
