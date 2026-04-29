import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { learningApi } from '../../src/features/learning/learningApi';
import { AssignmentWithSubmission, LearningMaterial } from '../../src/features/learning/types';
import { useLearningQuery } from '../../src/features/learning/useLearningQuery';
import { resolvePublicAssetUrl } from '../../src/lib/media/resolvePublicAssetUrl';
import { notifyError, notifyInfo } from '../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../src/theme/AppTextScaleProvider';

type TabKey = 'materials' | 'assignments';

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type OpenAttachmentHandler = (fileUrl?: string | null) => Promise<void>;

function AttachmentAction({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: '#eff6ff',
        borderWidth: 1,
        borderColor: '#bfdbfe',
        borderRadius: 8,
        padding: 8,
      }}
    >
      <Text style={{ color: '#1d4ed8', fontSize: scaleFont(11), fontWeight: '700', marginBottom: 2 }}>
        {title}
      </Text>
      <Text style={{ color: '#0f172a', fontWeight: '600', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }} numberOfLines={2}>
        {detail}
      </Text>
    </Pressable>
  );
}

function MaterialCard({ item, onOpenAttachment }: { item: LearningMaterial; onOpenAttachment: OpenAttachmentHandler }) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <Text style={{ fontSize: scaleFont(14), lineHeight: scaleLineHeight(21), fontWeight: '700', color: '#0f172a', marginBottom: 3 }}>{item.title}</Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: '#64748b', marginBottom: 6 }}>
        {item.subject.name} ({item.subject.code}) • {item.teacher.name}
      </Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: '#334155', marginBottom: 8 }}>{item.description || 'Tanpa deskripsi.'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
        {item.fileUrl ? (
          <View style={{ width: '50%', paddingHorizontal: 3, marginBottom: 6 }}>
            <AttachmentAction
              title="Unduh Lampiran"
              detail={item.fileName || 'Lampiran materi'}
              onPress={() => void onOpenAttachment(item.fileUrl)}
            />
          </View>
        ) : null}
        {item.youtubeUrl ? (
          <View style={{ width: '50%', paddingHorizontal: 3, marginBottom: 6 }}>
            <AttachmentAction
              title="Buka Video"
              detail={item.youtubeUrl}
              onPress={() => void onOpenAttachment(item.youtubeUrl)}
            />
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), color: '#64748b' }}>Dibuat: {formatDate(item.createdAt)}</Text>
    </View>
  );
}

function AssignmentCard({
  item,
  onSubmit,
  onOpenAttachment,
}: {
  item: AssignmentWithSubmission;
  onSubmit: (item: AssignmentWithSubmission) => void;
  onOpenAttachment: OpenAttachmentHandler;
}) {
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const now = new Date().getTime();
  const dueTs = new Date(item.dueDate).getTime();
  const isOverdue = Number.isFinite(dueTs) && dueTs < now;

  const status = item.submission
    ? item.submission.score !== null
      ? `Dinilai (${item.submission.score})`
      : 'Sudah dikumpulkan'
    : isOverdue
      ? 'Terlambat'
      : 'Belum dikumpulkan';

  const statusColor = item.submission
    ? item.submission.score !== null
      ? { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' }
      : { bg: '#dcfce7', border: '#86efac', text: '#166534' }
    : isOverdue
      ? { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }
      : { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: scaleFont(14), lineHeight: scaleLineHeight(21), fontWeight: '700', color: '#0f172a', paddingRight: 8 }}>{item.title}</Text>
        <Text
          style={{
            fontSize: scaleFont(11),
            fontWeight: '700',
            color: statusColor.text,
            backgroundColor: statusColor.bg,
            borderWidth: 1,
            borderColor: statusColor.border,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          {status}
        </Text>
      </View>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: '#64748b', marginBottom: 4 }}>
        {item.subject.name} ({item.subject.code}) • {item.teacher.name}
      </Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: '#334155', marginBottom: 6 }}>{item.description || 'Tanpa deskripsi.'}</Text>
      <Text style={{ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), color: '#64748b', marginBottom: 2 }}>Deadline: {formatDate(item.dueDate)}</Text>
      {item.submission?.submittedAt ? (
        <Text style={{ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), color: '#64748b', marginBottom: 6 }}>
          Dikumpulkan: {formatDate(item.submission.submittedAt)}
        </Text>
      ) : (
        <View style={{ marginBottom: 6 }} />
      )}
      {item.fileUrl ? (
        <View style={{ marginBottom: 8 }}>
          <AttachmentAction
            title="Unduh Lampiran Tugas"
            detail={item.fileName || 'Lampiran tugas'}
            onPress={() => void onOpenAttachment(item.fileUrl)}
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => onSubmit(item)}
        disabled={isOverdue && !item.allowResubmit}
        style={{
          backgroundColor: isOverdue && !item.allowResubmit ? '#cbd5e1' : '#1d4ed8',
          borderRadius: 9,
          paddingVertical: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.label }}>
          {item.submission ? 'Perbarui Pengumpulan' : 'Kumpulkan Tugas'}
        </Text>
      </Pressable>
    </View>
  );
}

export default function LearningScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const learningQuery = useLearningQuery({ enabled: isAuthenticated, user });
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const pageContentPadding = getStandardPagePadding(insets);
  const [activeTab, setActiveTab] = useState<TabKey>('materials');
  const [search, setSearch] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentWithSubmission | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name?: string;
    mimeType?: string;
  } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) throw new Error('Tugas belum dipilih.');
      return learningApi.submitAssignment({
        assignmentId: selectedAssignment.id,
        content: submissionContent,
        file: selectedFile,
      });
    },
    onSuccess: async () => {
      setSubmissionContent('');
      setSelectedAssignment(null);
      setSelectedFile(null);
      await queryClient.invalidateQueries({ queryKey: ['mobile-learning', user?.id] });
    },
  });

  const pickAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setSelectedFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || undefined,
    });
  };

  const openLearningAttachment = async (fileUrl?: string | null) => {
    const targetUrl = resolvePublicAssetUrl(fileUrl);
    if (!targetUrl) {
      notifyInfo('Lampiran belum tersedia.');
      return;
    }
    try {
      await Linking.openURL(targetUrl);
    } catch {
      notifyError('Lampiran belum bisa dibuka dari aplikasi.');
    }
  };

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return learningQuery.data?.materials || [];
    return (learningQuery.data?.materials || []).filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subject.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q),
    );
  }, [learningQuery.data?.materials, search]);

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return learningQuery.data?.assignments || [];
    return (learningQuery.data?.assignments || []).filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subject.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q),
    );
  }, [learningQuery.data?.assignments, search]);

  if (isLoading) return <AppLoadingScreen message="Memuat pembelajaran..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>Materi & Tugas</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role siswa." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={learningQuery.isFetching && !learningQuery.isLoading}
          onRefresh={() => learningQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6 }}>Materi & Tugas</Text>
      <Text style={{ color: '#64748b', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>Akses materi pelajaran dan pengumpulan tugas Anda.</Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setActiveTab('materials')}
            style={{
              borderWidth: 1,
              borderColor: activeTab === 'materials' ? '#1d4ed8' : '#cbd5e1',
              backgroundColor: activeTab === 'materials' ? '#eff6ff' : '#fff',
              borderRadius: 9,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: activeTab === 'materials' ? '#1d4ed8' : '#334155', fontWeight: '700', fontSize: fontSizes.label }}>Materi</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setActiveTab('assignments')}
            style={{
              borderWidth: 1,
              borderColor: activeTab === 'assignments' ? '#1d4ed8' : '#cbd5e1',
              backgroundColor: activeTab === 'assignments' ? '#eff6ff' : '#fff',
              borderRadius: 9,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: activeTab === 'assignments' ? '#1d4ed8' : '#334155', fontWeight: '700', fontSize: fontSizes.label }}>Tugas</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={activeTab === 'materials' ? 'Cari materi...' : 'Cari tugas...'}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          backgroundColor: '#fff',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: '#0f172a',
          marginBottom: 12,
          fontSize: fontSizes.body,
        }}
      />

      {learningQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data pembelajaran..." /> : null}
      {learningQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat materi dan tugas." onRetry={() => learningQuery.refetch()} />
      ) : null}
      {learningQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={learningQuery.data.cachedAt} /> : null}

      {!learningQuery.isLoading && !learningQuery.isError ? (
        activeTab === 'materials' ? (
          filteredMaterials.length > 0 ? (
            <View>
              {filteredMaterials.map((item) => (
                <MaterialCard key={item.id} item={item} onOpenAttachment={openLearningAttachment} />
              ))}
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
              <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Tidak ada materi</Text>
              <Text style={{ color: '#64748b', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>Belum ada materi untuk filter saat ini.</Text>
            </View>
          )
        ) : filteredAssignments.length > 0 ? (
          <View>
            {filteredAssignments.map((item) => (
              <AssignmentCard
                key={item.id}
                item={item}
                onOpenAttachment={openLearningAttachment}
                onSubmit={(assignment) => {
                  setSelectedAssignment(assignment);
                  setSubmissionContent(assignment.submission?.content || '');
                  setSelectedFile(null);
                }}
              />
            ))}
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
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Tidak ada tugas</Text>
            <Text style={{ color: '#64748b', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>Belum ada tugas untuk filter saat ini.</Text>
          </View>
        )
      ) : null}

      {selectedAssignment ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#bfdbfe',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text style={{ fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>
            Pengumpulan: {selectedAssignment.title}
          </Text>
          <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
            Kirim jawaban teks dan/atau lampiran file.
          </Text>
          <TextInput
            value={submissionContent}
            onChangeText={setSubmissionContent}
            placeholder="Isi jawaban / catatan tugas..."
            placeholderTextColor="#94a3b8"
            multiline
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              minHeight: 90,
              backgroundColor: '#fff',
              textAlignVertical: 'top',
              color: '#0f172a',
              marginBottom: 10,
              fontSize: fontSizes.body,
              lineHeight: scaleLineHeight(20),
            }}
          />
          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={pickAttachment}
                style={{
                  backgroundColor: '#eff6ff',
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  borderRadius: 9,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Pilih Lampiran</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setSelectedFile(null)}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 9,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Hapus Lampiran</Text>
              </Pressable>
            </View>
          </View>
          {selectedFile ? (
            <View
              style={{
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 8,
                padding: 8,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginBottom: 2 }}>File dipilih</Text>
              <Text style={{ color: '#0f172a', fontWeight: '600', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }} numberOfLines={2}>
                {selectedFile.name || selectedFile.uri}
              </Text>
            </View>
          ) : null}
          {submitMutation.isError ? (
            <View style={{ marginBottom: 10 }}>
              <QueryStateView type="error" message="Gagal mengirim tugas. Coba lagi." />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => {
                  setSelectedAssignment(null);
                  setSubmissionContent('');
                }}
                style={{
                  backgroundColor: '#e2e8f0',
                  borderRadius: 9,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: fontSizes.label }}>Batal</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                style={{
                  backgroundColor: submitMutation.isPending ? '#93c5fd' : '#1d4ed8',
                  borderRadius: 9,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.label }}>
                  {submitMutation.isPending ? 'Mengirim...' : 'Kirim'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: '#1d4ed8',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: fontSizes.label }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
