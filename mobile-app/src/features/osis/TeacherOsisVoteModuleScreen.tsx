import { useMemo } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { QueryStateView } from '../../components/QueryStateView';
import { useAuth } from '../auth/AuthProvider';
import { BRAND_COLORS } from '../../config/brand';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../lib/ui/feedback';
import { openWebModuleRoute } from '../../lib/navigation/webModuleRoute';
import { osisApi } from './osisApi';

function normalizeDuty(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function hasOsisDuty(duties?: string[]) {
  return Array.isArray(duties) && duties.some((duty) => normalizeDuty(duty) === 'PEMBINA_OSIS');
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

function extractYoutubeVideoId(raw?: string | null) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').trim();
      return id || null;
    }
    if (url.hostname.includes('youtube.com')) {
      const id = url.searchParams.get('v');
      return id || null;
    }
  } catch {
    return null;
  }
  return null;
}

function toEmbedUrl(raw?: string | null) {
  const videoId = extractYoutubeVideoId(raw);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

function toYoutubeThumbnailUrl(raw?: string | null) {
  const videoId = extractYoutubeVideoId(raw);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}

function SummaryCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 14,
        padding: 12,
        flexBasis: '48%',
        flexGrow: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: accent, fontWeight: '800', fontSize: 24, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 16,
        padding: 14,
        gap: 12,
      }}
    >
      <View>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function TeacherOsisVoteModuleScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const electionQuery = useQuery({
    queryKey: ['mobile-teacher-osis-active-election'],
    enabled: isAuthenticated && user?.role === 'TEACHER' && hasOsisDuty(user?.additionalDuties),
    queryFn: () => osisApi.getActiveElection(),
    staleTime: 30_000,
  });

  const voteMutation = useMutation({
    mutationFn: async (candidateId: number) => {
      const election = electionQuery.data;
      if (!election) throw new Error('Belum ada pemilihan aktif');
      return osisApi.submitVote({ electionId: election.id, candidateId });
    },
    onSuccess: async () => {
      notifySuccess('Suara berhasil dikirim.');
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-osis-active-election'] });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal mengirim suara OSIS.');
    },
  });

  const election = electionQuery.data || null;
  const myVoteCandidateId = election?.myVote?.candidateId || null;
  const quickCount = election?.quickCount || null;
  const selectedCandidate = useMemo(
    () => election?.candidates.find((candidate) => candidate.id === myVoteCandidateId) || null,
    [election?.candidates, myVoteCandidateId],
  );

  const stats = useMemo(() => {
    const totalCandidates = election?.candidates.length || 0;
    return {
      totalCandidates,
      totalVotes: quickCount?.totalVotes || 0,
      turnoutPercentage: quickCount?.turnoutPercentage || 0,
      remainingVoters: quickCount?.remainingVoters || 0,
    };
  }, [election?.candidates.length, quickCount]);

  if (isLoading) return <AppLoadingScreen message="Memuat pemungutan suara OSIS..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER' || !hasOsisDuty(user?.additionalDuties)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>
          Pemungutan Suara OSIS
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus pembina OSIS." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={electionQuery.isFetching && !electionQuery.isLoading}
          onRefresh={() => {
            void electionQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '800', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Pemungutan Suara OSIS
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau pemilihan aktif, quick count, dan gunakan hak suara pembina OSIS bila diperlukan.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Pressable
          onPress={() => router.push('/teacher/osis/management' as never)}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e1f5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Struktur & Nilai</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/teacher/osis/election' as never)}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e1f5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Pemilihan OSIS</Text>
        </Pressable>
        <View style={{ backgroundColor: '#e9f1ff', borderWidth: 1, borderColor: BRAND_COLORS.blue, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800', fontSize: 12 }}>Pemungutan Suara</Text>
        </View>
        <Pressable
          onPress={() => router.push('/teacher/osis/inventory' as never)}
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e1f5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Inventaris OSIS</Text>
        </Pressable>
      </View>

      {electionQuery.isLoading ? <QueryStateView type="loading" message="Memuat pemilihan aktif..." /> : null}
      {electionQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat pemungutan suara OSIS." onRetry={() => electionQuery.refetch()} />
      ) : null}

      {!electionQuery.isLoading && !electionQuery.isError && !election ? (
        <SectionCard title="Belum Ada Pemilihan Aktif" subtitle="Aktifkan atau publikasikan periode pemilihan dari menu Pemilihan OSIS.">
          <Pressable
            onPress={() => router.push('/teacher/osis/election' as never)}
            style={{ backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Buka Pemilihan OSIS</Text>
          </Pressable>
        </SectionCard>
      ) : null}

      {!electionQuery.isLoading && !electionQuery.isError && election ? (
        <>
          <SectionCard title={election.title} subtitle={`${formatDateTime(election.startAt)} - ${formatDateTime(election.endAt)}`}>
            {election.description ? (
              <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20 }}>{election.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <SummaryCard title="Calon Aktif" value={String(stats.totalCandidates)} subtitle="Kandidat pada periode ini" accent="#2563eb" />
              <SummaryCard title="Suara Masuk" value={String(stats.totalVotes)} subtitle="Total vote terkirim" accent="#7c3aed" />
              <SummaryCard title="Turnout" value={`${stats.turnoutPercentage}%`} subtitle="Partisipasi pemilih" accent="#059669" />
              <SummaryCard title="Belum Voting" value={String(stats.remainingVoters)} subtitle="Pemilih tersisa" accent="#d97706" />
            </View>
            {selectedCandidate ? (
              <View style={{ backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: '#065f46', fontWeight: '800' }}>Suara Anda sudah tercatat</Text>
                <Text style={{ color: '#047857', marginTop: 4 }}>
                  No. {selectedCandidate.candidateNumber} • {selectedCandidate.student.name}
                </Text>
              </View>
            ) : (
              <View style={{ backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: '#9a3412', fontWeight: '800' }}>Anda belum memilih</Text>
                <Text style={{ color: '#c2410c', marginTop: 4 }}>
                  Pilih satu kandidat aktif bila memang perlu menggunakan hak suara pembina.
                </Text>
              </View>
            )}
          </SectionCard>

          <SectionCard title="Kandidat" subtitle="Lihat visi-misi, quick count, dan pilih kandidat saat periode masih aktif.">
            <View style={{ gap: 12 }}>
              {election.candidates.map((candidate) => {
                const quickCountRow = quickCount?.candidates.find((row) => row.id === candidate.id) || null;
                const isSelected = myVoteCandidateId === candidate.id;
                const embedUrl = toEmbedUrl(candidate.youtubeUrl);
                const thumbnailUrl = toYoutubeThumbnailUrl(candidate.youtubeUrl);
                return (
                  <View
                    key={candidate.id}
                    style={{
                      borderWidth: 1,
                      borderColor: isSelected ? '#86efac' : '#dbe7fb',
                      backgroundColor: '#fff',
                      borderRadius: 16,
                      padding: 14,
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.blue, fontWeight: '800', fontSize: 12 }}>
                          CALON NO. {candidate.candidateNumber}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 18, marginTop: 2 }}>
                          {candidate.student.name}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                          {candidate.student.studentClass?.name || '-'} • {candidate.student.nis || '-'}
                        </Text>
                      </View>
                      {isSelected ? (
                        <View style={{ backgroundColor: '#dcfce7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: '#166534', fontWeight: '800', fontSize: 11 }}>PILIHAN ANDA</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ gap: 8 }}>
                      <View>
                        <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700' }}>VISI</Text>
                        <Text style={{ color: BRAND_COLORS.textDark, marginTop: 3, lineHeight: 20 }}>
                          {candidate.vision || 'Belum diisi.'}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700' }}>MISI</Text>
                        <Text style={{ color: BRAND_COLORS.textDark, marginTop: 3, lineHeight: 20 }}>
                          {candidate.mission || 'Belum diisi.'}
                        </Text>
                      </View>
                    </View>

                    {quickCountRow ? (
                      <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                          Quick count: {quickCountRow.votes} suara • {quickCountRow.percentage}%
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                          Peringkat #{quickCountRow.rank} {quickCountRow.isWinner ? '• pemenang sementara/final' : quickCountRow.isLeading ? '• unggul' : ''}
                        </Text>
                      </View>
                    ) : null}

                    {candidate.youtubeUrl ? (
                      <View style={{ gap: 8 }}>
                        {thumbnailUrl ? (
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: '#dbe7fb',
                              borderRadius: 14,
                              backgroundColor: '#fff',
                              overflow: 'hidden',
                            }}
                          >
                            <Image source={{ uri: thumbnailUrl }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
                          </View>
                        ) : null}
                        <Pressable
                          onPress={() => {
                            openWebModuleRoute(router, {
                              moduleKey: `teacher-osis-video-${candidate.id}`,
                              webPath: embedUrl || String(candidate.youtubeUrl || ''),
                              label: `Video Orasi ${candidate.student.name}`,
                            });
                          }}
                          style={{
                            borderWidth: 1,
                            borderColor: '#d6e2f7',
                            borderRadius: 10,
                            paddingVertical: 10,
                            alignItems: 'center',
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>
                            {thumbnailUrl ? 'Buka Video Orasi' : 'Buka Tautan Video'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    <Pressable
                      disabled={election.status === 'CLOSED' || Boolean(myVoteCandidateId) || voteMutation.isPending}
                      onPress={() => voteMutation.mutate(candidate.id)}
                      style={{
                        backgroundColor:
                          election.status === 'CLOSED'
                            ? isSelected
                              ? '#16a34a'
                              : '#cbd5e1'
                            : myVoteCandidateId
                              ? isSelected
                                ? '#16a34a'
                                : '#cbd5e1'
                              : '#2563eb',
                        borderRadius: 12,
                        paddingVertical: 12,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '800' }}>
                        {election.status === 'CLOSED'
                          ? isSelected
                            ? 'Pilihan Anda'
                            : 'Pemilihan Ditutup'
                          : myVoteCandidateId
                            ? isSelected
                              ? 'Suara Terkirim'
                              : 'Selesai'
                            : 'Pilih Kandidat Ini'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </SectionCard>

          {quickCount?.winner ? (
            <SectionCard title="Pimpinan Quick Count" subtitle="Ringkasan kandidat dengan suara tertinggi saat ini.">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="award" size={20} color="#f59e0b" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
                    No. {quickCount.winner.candidateNumber} • {quickCount.winner.studentName}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    {quickCount.winner.className} • {quickCount.winner.votes} suara • {quickCount.winner.percentage}%
                  </Text>
                </View>
              </View>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
