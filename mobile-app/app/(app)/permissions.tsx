import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { permissionApi } from '../../src/features/permissions/permissionApi';
import { PermissionStatus, PermissionType } from '../../src/features/permissions/types';
import { useStudentPermissionsQuery } from '../../src/features/permissions/useStudentPermissionsQuery';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../src/lib/ui/feedback';

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function statusStyle(status: PermissionStatus) {
  if (status === 'APPROVED') {
    return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Disetujui' };
  }
  if (status === 'REJECTED') {
    return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', label: 'Ditolak' };
  }
  return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412', label: 'Menunggu' };
}

const TYPE_LABEL: Record<PermissionType, string> = {
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  OTHER: 'Lainnya',
};

export default function PermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const permissionsQuery = useStudentPermissionsQuery({ enabled: isAuthenticated, user });

  const [type, setType] = useState<PermissionType>('PERMISSION');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<{
    uri: string;
    name?: string;
    mimeType?: string;
  } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const parsedStart = parseDateInput(startDate);
      const parsedEnd = parseDateInput(endDate);

      if (!parsedStart || !parsedEnd) {
        throw new Error('Format tanggal harus YYYY-MM-DD.');
      }
      if (parsedEnd.getTime() < parsedStart.getTime()) {
        throw new Error('Tanggal selesai tidak boleh lebih kecil dari tanggal mulai.');
      }

      let uploadedUrl: string | undefined = undefined;
      if (attachment?.uri) {
        uploadedUrl = await permissionApi.uploadFile({
          uri: attachment.uri,
          name: attachment.name,
          type: attachment.mimeType,
        });
      }

      return permissionApi.requestPermission({
        type,
        startDate: parsedStart.toISOString(),
        endDate: parsedEnd.toISOString(),
        reason: reason.trim() || undefined,
        fileUrl: uploadedUrl,
      });
    },
    onSuccess: async () => {
      setReason('');
      setAttachment(null);
      await queryClient.invalidateQueries({ queryKey: ['mobile-student-permissions', user?.id] });
      notifySuccess('Pengajuan izin berhasil dikirim.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mengajukan izin.');
    },
  });

  const pickAttachment = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setAttachment({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || undefined,
    });
  };

  const sortedPermissions = useMemo(
    () =>
      [...(permissionsQuery.data?.permissions || [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [permissionsQuery.data?.permissions],
  );

  if (isLoading) return <AppLoadingScreen message="Memuat perizinan..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Perizinan</Text>
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
          refreshing={permissionsQuery.isFetching && !permissionsQuery.isLoading}
          onRefresh={() => permissionsQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Perizinan Siswa</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>Ajukan izin dan pantau status persetujuannya.</Text>

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
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Form Pengajuan Izin</Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
          {(['SICK', 'PERMISSION', 'OTHER'] as PermissionType[]).map((item) => {
            const selected = type === item;
            return (
              <View key={item} style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setType(item)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    paddingVertical: 9,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontWeight: '700', fontSize: 12 }}>
                    {TYPE_LABEL[item]}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>Tanggal Mulai (YYYY-MM-DD)</Text>
        <TextInput
          value={startDate}
          onChangeText={setStartDate}
          placeholder="2026-02-18"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 9,
            paddingHorizontal: 10,
            paddingVertical: 9,
            backgroundColor: '#fff',
            marginBottom: 8,
          }}
        />

        <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>Tanggal Selesai (YYYY-MM-DD)</Text>
        <TextInput
          value={endDate}
          onChangeText={setEndDate}
          placeholder="2026-02-18"
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 9,
            paddingHorizontal: 10,
            paddingVertical: 9,
            backgroundColor: '#fff',
            marginBottom: 8,
          }}
        />

        <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>Alasan</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="Isi alasan izin..."
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 9,
            paddingHorizontal: 10,
            paddingVertical: 10,
            minHeight: 80,
            backgroundColor: '#fff',
            textAlignVertical: 'top',
            marginBottom: 10,
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
              onPress={() => setAttachment(null)}
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
        {attachment ? (
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
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>File dipilih</Text>
            <Text style={{ color: '#0f172a', fontWeight: '600', fontSize: 12 }} numberOfLines={2}>
              {attachment.name || attachment.uri}
            </Text>
          </View>
        ) : null}

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
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {submitMutation.isPending ? 'Mengirim...' : 'Kirim Pengajuan'}
          </Text>
        </Pressable>
      </View>

      {permissionsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil riwayat izin..." /> : null}
      {permissionsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat riwayat izin." onRetry={() => permissionsQuery.refetch()} />
      ) : null}
      {permissionsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={permissionsQuery.data.cachedAt} /> : null}

      {!permissionsQuery.isLoading && !permissionsQuery.isError ? (
        sortedPermissions.length > 0 ? (
          <View>
            {sortedPermissions.map((item) => {
              const style = statusStyle(item.status);
              return (
                <View
                  key={item.id}
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
                    <Text style={{ color: '#0f172a', fontWeight: '700' }}>{TYPE_LABEL[item.type]}</Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: style.text,
                        backgroundColor: style.bg,
                        borderWidth: 1,
                        borderColor: style.border,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      {style.label}
                    </Text>
                  </View>
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                    Periode: {formatDate(item.startDate)} - {formatDate(item.endDate)}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>
                    Alasan: {item.reason || '-'}
                  </Text>
                  {item.approvalNote ? (
                    <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>
                      Catatan: {item.approvalNote}
                    </Text>
                  ) : null}
                  <Text style={{ color: '#64748b', fontSize: 11 }}>Dibuat: {formatDate(item.createdAt)}</Text>
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
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada pengajuan</Text>
            <Text style={{ color: '#64748b' }}>Riwayat izin Anda akan tampil di sini.</Text>
          </View>
        )
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
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
