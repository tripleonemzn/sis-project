import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  committeeApi,
  CommitteeEventStatus,
  CommitteeFeatureCode,
} from '../../../src/features/committee/committeeApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';

const COMMITTEE_STATUS_LABELS: Record<CommitteeEventStatus, string> = {
  DRAFT: 'Draft',
  MENUNGGU_PERSETUJUAN_KEPSEK: 'Menunggu Persetujuan Kepsek',
  DITOLAK_KEPSEK: 'Ditolak Kepsek',
  MENUNGGU_SK_TU: 'Menunggu SK TU',
  AKTIF: 'Aktif',
  SELESAI: 'Selesai',
  ARSIP: 'Arsip',
};

const COMMITTEE_FEATURE_LABELS: Record<CommitteeFeatureCode, string> = {
  EXAM_PROGRAM: 'Program Ujian',
  EXAM_SCHEDULE: 'Jadwal Ujian',
  EXAM_ROOMS: 'Ruang Ujian',
  EXAM_PROCTOR: 'Jadwal Mengawas',
  EXAM_LAYOUT: 'Generate Denah Ruang',
  EXAM_CARD: 'Kartu Ujian',
};

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

function getStatusTone(status: CommitteeEventStatus) {
  if (status === 'MENUNGGU_PERSETUJUAN_KEPSEK') {
    return { border: '#fcd34d', background: '#fffbeb', text: '#b45309' };
  }
  if (status === 'DITOLAK_KEPSEK') {
    return { border: '#fda4af', background: '#fff1f2', text: '#be123c' };
  }
  if (status === 'MENUNGGU_SK_TU') {
    return { border: '#93c5fd', background: '#eff6ff', text: '#1d4ed8' };
  }
  if (status === 'AKTIF') {
    return { border: '#86efac', background: '#ecfdf5', text: '#15803d' };
  }
  return { border: '#cbd5e1', background: '#f8fafc', text: '#475569' };
}

function CommitteeBadge({ status }: { status: CommitteeEventStatus }) {
  const tone = getStatusTone(status);
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tone.border,
        backgroundColor: tone.background,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: tone.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>
        {COMMITTEE_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

function CommitteeFeaturePill({ label }: { label: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#bbf7d0',
        backgroundColor: '#f0fdf4',
        paddingHorizontal: 9,
        paddingVertical: 4,
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <Text style={{ color: '#166534', fontWeight: '700', fontSize: scaleWithAppTextScale(11) }}>{label}</Text>
    </View>
  );
}

function InfoCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string | null;
}) {
  return (
    <View
      style={{
        backgroundColor: '#f8fbff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), textTransform: 'uppercase', fontWeight: '700' }}>
        {label}
      </Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 6 }}>{value}</Text>
      {helper ? (
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>{helper}</Text>
      ) : null}
    </View>
  );
}

export default function PrincipalCommitteeApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [feedbackById, setFeedbackById] = useState<Record<number, string>>({});

  const queueQuery = useQuery({
    queryKey: ['mobile-principal-committee-approvals', user?.id],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => committeeApi.list({ scope: 'PENDING_PRINCIPAL' }),
  });

  const items = queueQuery.data?.items || [];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedReviewId) || null,
    [items, selectedReviewId],
  );
  const selectedFeedback = selectedItem ? feedbackById[selectedItem.id] || '' : '';

  const stats = useMemo(
    () => ({
      total: items.length,
      examScoped: items.filter((item) => Boolean(item.programCode)).length,
      readyRoster: items.filter((item) => item.counts.members > 0).length,
    }),
    [items],
  );

  const decisionMutation = useMutation({
    mutationFn: async (payload: { id: number; approved: boolean }) =>
      committeeApi.reviewAsPrincipal(payload.id, {
        approved: payload.approved,
        feedback: feedbackById[payload.id] || null,
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['mobile-principal-committee-approvals'] });
      setFeedbackById((current) => ({
        ...current,
        [payload.id]: '',
      }));
      setSelectedReviewId((current) => (current === payload.id ? null : current));
      Alert.alert(
        'Persetujuan tersimpan',
        payload.approved
          ? 'Pengajuan panitia diteruskan ke Kepala TU.'
          : 'Pengajuan panitia dikembalikan dengan catatan.',
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      Alert.alert('Gagal memproses persetujuan', apiError?.response?.data?.message || apiError?.message || 'Silakan coba lagi.');
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat persetujuan panitia..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Persetujuan Panitia</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pagePadding}
        refreshControl={
          <RefreshControl
            refreshing={queueQuery.isFetching && !queueQuery.isLoading}
            onRefresh={() => queueQuery.refetch()}
          />
        }
      >
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
          Persetujuan Panitia
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Tinjau usulan kepanitiaan sebelum diteruskan ke Kepala TU untuk finalisasi SK.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
            <MobileSummaryCard
              title="Antrian Review"
              value={String(stats.total)}
              subtitle="Draft menunggu keputusan"
              iconName="inbox"
              accentColor="#f59e0b"
            />
          </View>
          <View style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
            <MobileSummaryCard
              title="Program Ujian"
              value={String(stats.examScoped)}
              subtitle="Terikat program"
              iconName="clipboard"
              accentColor="#2563eb"
            />
          </View>
          <View style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
            <MobileSummaryCard
              title="Roster Siap"
              value={String(stats.readyRoster)}
              subtitle="Sudah ada anggota"
              iconName="users"
              accentColor="#059669"
            />
          </View>
        </View>

        {queueQuery.isLoading ? <QueryStateView type="loading" message="Mengambil antrian panitia..." /> : null}
        {queueQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat persetujuan panitia." onRetry={() => queueQuery.refetch()} />
        ) : null}

        {!queueQuery.isLoading && !queueQuery.isError ? (
          items.length > 0 ? (
            <View>
              {items.map((item) => (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>
                        {item.title}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                        {item.code} • {item.requestedBy.name}
                      </Text>
                    </View>
                    <CommitteeBadge status={item.status} />
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12) }}>
                      Program: {item.programLabel || item.programCode || 'Tanpa program ujian khusus'}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                      Anggota: {item.counts.members} • Feature workspace: {item.counts.grantedFeatures}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                      Diperbarui {formatDateTime(item.updatedAt)}
                    </Text>
                  </View>

                  {item.description ? (
                    <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 8 }}>
                      {item.description}
                    </Text>
                  ) : null}

                  <Pressable
                    onPress={() => setSelectedReviewId(item.id)}
                    style={{
                      marginTop: 12,
                      borderRadius: 10,
                      backgroundColor: '#eff6ff',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      paddingVertical: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Review Pengajuan</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#cbd5e1',
                borderRadius: 12,
                padding: 18,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada pengajuan panitia yang menunggu review saat ini.</Text>
            </View>
          )
        ) : null}
      </ScrollView>

      <MobileDetailModal
        visible={Boolean(selectedItem)}
        title="Review Usulan Panitia"
        subtitle={selectedItem ? `${selectedItem.title} • ${selectedItem.code}` : undefined}
        iconName="shield"
        accentColor="#d97706"
        onClose={() => setSelectedReviewId(null)}
      >
        {selectedItem ? (
          <View>
            <View style={{ marginBottom: 12 }}>
              <CommitteeBadge status={selectedItem.status} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <InfoCard label="Pengusul" value={selectedItem.requestedBy.name} helper={selectedItem.requestedBy.username} />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <InfoCard
                  label="Program Ujian"
                  value={selectedItem.programLabel || selectedItem.programCode || 'Tanpa program ujian'}
                  helper={formatDateTime(selectedItem.updatedAt)}
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <InfoCard
                  label="Jumlah Anggota"
                  value={`${selectedItem.counts.members} orang`}
                  helper="Roster panitia aktif"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <InfoCard
                  label="Feature Workspace"
                  value={`${selectedItem.counts.grantedFeatures} fitur`}
                  helper="Hak akses unik yang diminta"
                />
              </View>
            </View>

            {selectedItem.description ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 4,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Catatan Pengajuan</Text>
                <Text style={{ color: '#475569', lineHeight: scaleWithAppTextScale(20) }}>{selectedItem.description}</Text>
              </View>
            ) : null}

            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 12,
                padding: 12,
                marginTop: 12,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Preview Susunan Panitia</Text>
              {selectedItem.membersPreview.length > 0 ? (
                selectedItem.membersPreview.map((member) => (
                  <View
                    key={`${selectedItem.id}-${member.id}`}
                    style={{
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{member.memberLabel}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                      {member.memberTypeLabel}
                      {member.memberDetail ? ` • ${member.memberDetail}` : ''}
                    </Text>
                    <Text style={{ color: '#475569', marginTop: 4 }}>Peran: {member.assignmentRole}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                      {member.featureCodes.length > 0 ? (
                        member.featureCodes.map((featureCode) => (
                          <CommitteeFeaturePill
                            key={`${selectedItem.id}-${member.id}-${featureCode}`}
                            label={COMMITTEE_FEATURE_LABELS[featureCode]}
                          />
                        ))
                      ) : (
                        <CommitteeFeaturePill label="Tanpa usulan feature" />
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Draft ini belum memiliki anggota panitia. Sebaiknya dikembalikan agar pengusul melengkapi susunan panitia.
                </Text>
              )}
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Catatan Kepala Sekolah</Text>
              <TextInput
                value={selectedFeedback}
                onChangeText={(value) =>
                  setFeedbackById((current) => ({
                    ...current,
                    [selectedItem.id]: value,
                  }))
                }
                placeholder="Tambahkan catatan approval atau alasan revisi bila diperlukan."
                placeholderTextColor="#94a3b8"
                multiline
                textAlignVertical="top"
                style={{
                  minHeight: 110,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: '#fff',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => decisionMutation.mutate({ id: selectedItem.id, approved: false })}
                disabled={decisionMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#fda4af',
                  backgroundColor: '#fff1f2',
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: decisionMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700' }}>Tolak / Kembalikan</Text>
              </Pressable>
              <Pressable
                onPress={() => decisionMutation.mutate({ id: selectedItem.id, approved: true })}
                disabled={decisionMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  backgroundColor: '#059669',
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: decisionMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Setujui & Teruskan</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </MobileDetailModal>
    </>
  );
}
