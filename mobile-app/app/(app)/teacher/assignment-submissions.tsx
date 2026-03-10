import { useCallback, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { ENV } from '../../../src/config/env';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { teacherMaterialsApi } from '../../../src/features/teacherMaterials/teacherMaterialsApi';
import { TeacherAssignmentSubmission } from '../../../src/features/teacherMaterials/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreBadgeStyle(score: number | null) {
  if (score === null || score === undefined) {
    return { bg: '#f1f5f9', border: '#cbd5e1', text: '#334155', label: 'Belum Dinilai' };
  }
  if (score >= 85) {
    return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: `Nilai ${score}` };
  }
  if (score >= 70) {
    return { bg: '#fef9c3', border: '#fde68a', text: '#854d0e', label: `Nilai ${score}` };
  }
  return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b', label: `Nilai ${score}` };
}

export default function TeacherAssignmentSubmissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 110 });
  const params = useLocalSearchParams<{ assignmentId?: string; title?: string }>();
  const assignmentId = Number(params.assignmentId || 0);
  const assignmentTitle = typeof params.title === 'string' ? params.title : 'Tugas';
  const [gradingTarget, setGradingTarget] = useState<TeacherAssignmentSubmission | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  const submissionsQuery = useQuery({
    queryKey: ['mobile-teacher-assignment-submissions', user?.id, assignmentId],
    enabled: isAuthenticated && !!user && user.role === 'TEACHER' && assignmentId > 0,
    queryFn: () => teacherMaterialsApi.listAssignmentSubmissions(assignmentId),
  });

  const openAttachment = useCallback(async (fileUrl?: string | null) => {
    if (!fileUrl) {
      Alert.alert('Info', 'Lampiran tidak tersedia.');
      return;
    }
    const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
    const targetUrl =
      fileUrl.startsWith('http://') || fileUrl.startsWith('https://')
        ? fileUrl
        : fileUrl.startsWith('/')
          ? `${webBaseUrl}${fileUrl}`
          : `${webBaseUrl}/${fileUrl}`;
    openWebModuleRoute(router, {
      moduleKey: 'teacher-materials',
      webPath: targetUrl,
      label: 'Lampiran Pengumpulan Tugas',
    });
  }, [router]);

  const openGradeModal = (item: TeacherAssignmentSubmission) => {
    setGradingTarget(item);
    setScoreInput(item.score !== null && item.score !== undefined ? String(item.score) : '');
    setFeedbackInput(item.feedback || '');
  };

  const gradeMutation = useMutation({
    mutationFn: async () => {
      if (!gradingTarget) throw new Error('Data pengumpulan tidak ditemukan.');
      const score = Number(scoreInput);
      if (Number.isNaN(score)) throw new Error('Nilai harus berupa angka.');
      if (score < 0) throw new Error('Nilai minimal 0.');
      const maxScore = gradingTarget.assignment?.maxScore ?? 100;
      if (score > maxScore) throw new Error(`Nilai maksimal ${maxScore}.`);

      return teacherMaterialsApi.gradeSubmission({
        submissionId: gradingTarget.id,
        score,
        feedback: feedbackInput.trim(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-teacher-assignment-submissions', user?.id, assignmentId],
      });
      setGradingTarget(null);
      setScoreInput('');
      setFeedbackInput('');
      Alert.alert('Sukses', 'Nilai tugas berhasil disimpan.');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string } | undefined;
      const msg = err?.response?.data?.message || err?.message || 'Gagal menyimpan nilai.';
      Alert.alert('Gagal', msg);
    },
  });

  const submissionSummary = useMemo(() => {
    const items = submissionsQuery.data || [];
    const gradedCount = items.filter((item) => item.score !== null && item.score !== undefined).length;
    return {
      total: items.length,
      graded: gradedCount,
      ungraded: items.length - gradedCount,
    };
  }, [submissionsQuery.data]);

  if (isLoading) return <AppLoadingScreen message="Memuat data pengumpulan..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Submisi Tugas</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!assignmentId || Number.isNaN(assignmentId)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Submisi Tugas</Text>
        <QueryStateView type="error" message="Assignment ID tidak valid." />
        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: 14,
            backgroundColor: '#1d4ed8',
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pageContentPadding}
        refreshControl={
          <RefreshControl
            refreshing={submissionsQuery.isFetching && !submissionsQuery.isLoading}
            onRefresh={() => {
              void submissionsQuery.refetch();
            }}
          />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Submisi Tugas</Text>
        <Text style={{ color: '#334155', marginBottom: 3, fontWeight: '600' }} numberOfLines={2}>
          {assignmentTitle}
        </Text>
        <Text style={{ color: '#64748b', marginBottom: 12 }}>
          Lihat pengumpulan siswa dan input nilai seperti modul web.
        </Text>

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbeafe',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {[
              { label: 'Total Submisi', value: String(submissionSummary.total), color: '#1d4ed8' },
              { label: 'Sudah Dinilai', value: String(submissionSummary.graded), color: '#0f766e' },
              { label: 'Belum Dinilai', value: String(submissionSummary.ungraded), color: '#b45309' },
            ].map((item) => (
              <View key={item.label} style={{ width: '33.333%', paddingHorizontal: 4 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: `${item.color}55`,
                    backgroundColor: `${item.color}15`,
                    borderRadius: 10,
                    paddingVertical: 8,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: item.color, fontWeight: '700', fontSize: 17 }}>{item.value}</Text>
                  <Text style={{ color: '#64748b', fontSize: 11 }}>{item.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {submissionsQuery.isLoading ? (
          <QueryStateView type="loading" message="Memuat daftar pengumpulan..." />
        ) : null}

        {submissionsQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat daftar pengumpulan."
            onRetry={() => {
              void submissionsQuery.refetch();
            }}
          />
        ) : null}

        {!submissionsQuery.isLoading && !submissionsQuery.isError ? (
          submissionsQuery.data && submissionsQuery.data.length > 0 ? (
            <View>
              {submissionsQuery.data.map((item) => {
                const scoreStyle = scoreBadgeStyle(item.score);
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
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>
                        {item.student.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: scoreStyle.text,
                          backgroundColor: scoreStyle.bg,
                          borderWidth: 1,
                          borderColor: scoreStyle.border,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        {scoreStyle.label}
                      </Text>
                    </View>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 3 }}>
                      NIS: {item.student.nis || '-'}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                      Dikumpulkan: {formatDateTime(item.submittedAt)}
                    </Text>
                    <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>
                      {item.content?.trim() ? item.content : 'Tidak ada teks jawaban.'}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                      Feedback: {item.feedback?.trim() ? item.feedback : '-'}
                    </Text>

                    <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                      <View style={{ flex: 1, paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() => void openAttachment(item.fileUrl)}
                          disabled={!item.fileUrl}
                          style={{
                            borderWidth: 1,
                            borderColor: item.fileUrl ? '#cbd5e1' : '#e2e8f0',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: item.fileUrl ? '#fff' : '#f8fafc',
                          }}
                        >
                          <Text
                            style={{
                              color: item.fileUrl ? '#334155' : '#94a3b8',
                              fontWeight: '700',
                              fontSize: 12,
                            }}
                          >
                            Lampiran
                          </Text>
                        </Pressable>
                      </View>
                      <View style={{ flex: 1, paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() => openGradeModal(item)}
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#eff6ff',
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                            {item.score === null || item.score === undefined ? 'Beri Nilai' : 'Edit Nilai'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
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
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Belum ada submisi</Text>
              <Text style={{ color: '#64748b' }}>Siswa belum mengumpulkan tugas ini.</Text>
            </View>
          )
        ) : null}

        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: 10,
            backgroundColor: '#1d4ed8',
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={!!gradingTarget}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (gradeMutation.isPending) return;
          setGradingTarget(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#dbeafe',
              padding: 14,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>Input Nilai</Text>
            <Text style={{ color: '#334155', fontSize: 13, marginBottom: 10 }}>
              {gradingTarget?.student.name || '-'}
            </Text>

            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
              Nilai (max {gradingTarget?.assignment?.maxScore ?? 100})
            </Text>
            <TextInput
              value={scoreInput}
              onChangeText={setScoreInput}
              keyboardType="numeric"
              placeholder="Contoh: 85"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: '#0f172a',
                backgroundColor: '#fff',
                marginBottom: 10,
              }}
            />

            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Feedback</Text>
            <TextInput
              value={feedbackInput}
              onChangeText={setFeedbackInput}
              placeholder="Catatan untuk siswa"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: '#0f172a',
                backgroundColor: '#fff',
                minHeight: 88,
              }}
            />

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 12 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => {
                    if (gradeMutation.isPending) return;
                    setGradingTarget(null);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 9,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => gradeMutation.mutate()}
                  disabled={gradeMutation.isPending}
                  style={{
                    borderWidth: 1,
                    borderColor: '#1d4ed8',
                    borderRadius: 9,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: gradeMutation.isPending ? '#93c5fd' : '#1d4ed8',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {gradeMutation.isPending ? 'Menyimpan...' : 'Simpan Nilai'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
