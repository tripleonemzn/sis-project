import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { parentApi } from '../../../src/features/parent/parentApi';
import type { ParentChildLookupResult } from '../../../src/features/parent/types';
import { useParentChildrenQuery } from '../../../src/features/parent/useParentChildrenQuery';
import { getApiErrorMessage } from '../../../src/lib/api/errorMessage';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { normalizeNisnInput } from '../../../src/lib/nisn';
import { BRAND_COLORS } from '../../../src/config/brand';

export default function ParentChildrenScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const childrenQuery = useParentChildrenQuery({ enabled: isAuthenticated, user });
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [linkForm, setLinkForm] = useState({ nisn: '', birthDate: '' });
  const [lookupResult, setLookupResult] = useState<ParentChildLookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingChildId, setUnlinkingChildId] = useState<number | null>(null);
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const isLinkMode = mode === 'link';

  if (isLoading) return <AppLoadingScreen message="Memuat data anak..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PARENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Data Anak</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role orang tua." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const children = childrenQuery.data?.children || [];

  const handleLookupChild = async () => {
    const nisn = linkForm.nisn.trim();

    if (!/^\d{10}$/.test(nisn)) {
      Alert.alert('Input Belum Valid', 'NISN harus terdiri dari 10 digit angka.');
      return;
    }

    try {
      setIsLookingUp(true);
      const result = await parentApi.lookupMyChild(nisn);
      setLookupResult(result);
      Alert.alert('Data Ditemukan', 'Siswa ditemukan. Lanjutkan verifikasi tanggal lahir untuk menghubungkan akun.');
    } catch (error: unknown) {
      setLookupResult(null);
      Alert.alert('Pencarian Gagal', getApiErrorMessage(error, 'Data siswa dengan NISN tersebut tidak ditemukan.'));
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLinkChild = async () => {
    const nisn = linkForm.nisn.trim();
    const birthDate = linkForm.birthDate.trim();

    if (!/^\d{10}$/.test(nisn)) {
      Alert.alert('Input Belum Valid', 'NISN harus terdiri dari 10 digit angka.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      Alert.alert('Input Belum Valid', 'Tanggal lahir wajib menggunakan format YYYY-MM-DD.');
      return;
    }

    if (lookupResult?.alreadyLinkedToCurrentParent) {
      Alert.alert('Sudah Terkait', 'NISN ini sudah pernah dikaitkan ke akun orang tua Anda.');
      return;
    }

    try {
      setIsLinking(true);
      const response = await parentApi.linkMyChild({ nisn, birthDate });
      Alert.alert('Berhasil', response.message || 'Data anak berhasil dihubungkan.');
      setLinkForm({ nisn: '', birthDate: '' });
      setLookupResult(null);
      await childrenQuery.refetch();
    } catch (error: unknown) {
      Alert.alert('Gagal', getApiErrorMessage(error, 'Gagal menghubungkan data anak.'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkChild = (childId: number, childName: string) => {
    Alert.alert(
      'Lepas Hubungan',
      `Lepas hubungan ${childName} dari akun orang tua ini?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Lepas',
          style: 'destructive',
          onPress: async () => {
            try {
              setUnlinkingChildId(childId);
              const response = await parentApi.unlinkMyChild(childId);
              Alert.alert('Berhasil', response.message || 'Data anak berhasil dilepas.');
              await childrenQuery.refetch();
            } catch (error: unknown) {
              Alert.alert('Gagal', getApiErrorMessage(error, 'Gagal melepas hubungan data anak.'));
            } finally {
              setUnlinkingChildId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={childrenQuery.isFetching && !childrenQuery.isLoading}
          onRefresh={() => childrenQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Data Anak</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        {isLinkMode
          ? 'Cari siswa dengan NISN, cek datanya, lalu hubungkan ke akun orang tua ini.'
          : 'Daftar anak yang terhubung dengan akun orang tua.'}
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: isLinkMode ? 2 : 1,
          borderColor: isLinkMode ? '#93c5fd' : '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Hubungkan Anak</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
              Cari siswa dengan NISN, lalu verifikasi tanggal lahir dengan format `YYYY-MM-DD`.
            </Text>
          </View>
          {isLinkMode ? (
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: '#dbeafe',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>MODE HUBUNGKAN</Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#fde68a',
            backgroundColor: '#fffbeb',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#92400e', fontSize: 12, lineHeight: 18 }}>
            Setiap NISN cukup dikaitkan satu kali ke akun ini. Jika Anda memiliki lebih dari satu anak di sekolah,
            ulangi proses dengan NISN yang berbeda untuk masing-masing anak.
          </Text>
        </View>

        <Text style={{ fontWeight: '600', marginBottom: 6, color: BRAND_COLORS.textDark }}>NISN</Text>
        <TextInput
          value={linkForm.nisn}
          onChangeText={(value) => {
            const nextNisn = normalizeNisnInput(value);
            setLinkForm((prev) => ({ ...prev, nisn: nextNisn }));
            setLookupResult((prev) => (prev?.student.nisn === nextNisn ? prev : null));
          }}
          placeholder="10 digit NISN"
          keyboardType="number-pad"
          placeholderTextColor={BRAND_COLORS.textMuted}
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            backgroundColor: '#f8fafc',
            paddingHorizontal: 12,
            paddingVertical: 11,
            color: BRAND_COLORS.textDark,
            marginBottom: 10,
          }}
        />

        <Text style={{ fontWeight: '600', marginBottom: 6, color: BRAND_COLORS.textDark }}>Tanggal Lahir</Text>
        <TextInput
          value={linkForm.birthDate}
          onChangeText={(value) => setLinkForm((prev) => ({ ...prev, birthDate: value }))}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          placeholderTextColor={BRAND_COLORS.textMuted}
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            backgroundColor: '#f8fafc',
            paddingHorizontal: 12,
            paddingVertical: 11,
            color: BRAND_COLORS.textDark,
            marginBottom: 10,
          }}
        />

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 10 }}>
          Jika data siswa belum memiliki tanggal lahir di sistem, hubungan perlu dibantu admin sekolah.
        </Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={handleLookupChild}
            disabled={isLookingUp}
            style={{
              flex: 1,
              backgroundColor: '#eff6ff',
              borderWidth: 1,
              borderColor: '#bfdbfe',
              borderRadius: 10,
              alignItems: 'center',
              paddingVertical: 11,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>{isLookingUp ? 'Mencari...' : 'Cari NISN'}</Text>
          </Pressable>

          <Pressable
            onPress={handleLinkChild}
            disabled={isLinking || lookupResult?.alreadyLinkedToCurrentParent}
            style={{
              flex: 1,
              backgroundColor: isLinking || lookupResult?.alreadyLinkedToCurrentParent ? '#93c5fd' : BRAND_COLORS.blue,
              borderRadius: 10,
              alignItems: 'center',
              paddingVertical: 11,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isLinking ? 'Menghubungkan...' : 'Hubungkan Anak'}</Text>
          </Pressable>
        </View>

        {lookupResult ? (
          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: lookupResult.alreadyLinkedToCurrentParent ? '#fde68a' : '#86efac',
              backgroundColor: lookupResult.alreadyLinkedToCurrentParent ? '#fffbeb' : '#ecfdf5',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>HASIL PENCARIAN NISN</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
                  {lookupResult.student.name}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12 }}>
                  @{lookupResult.student.username} • {lookupResult.student.studentClass?.name || 'Belum ada kelas'}
                  {lookupResult.student.studentClass?.major?.code
                    ? ` (${lookupResult.student.studentClass.major.code})`
                    : ''}
                </Text>
              </View>
              <View
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: lookupResult.alreadyLinkedToCurrentParent ? '#fef3c7' : '#dcfce7',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text
                  style={{
                    color: lookupResult.alreadyLinkedToCurrentParent ? '#92400e' : '#166534',
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {lookupResult.alreadyLinkedToCurrentParent ? 'SUDAH TERKAIT' : 'SIAP DIVERIFIKASI'}
                </Text>
              </View>
            </View>

            <Text style={{ color: '#475569', marginTop: 10, marginBottom: 2, fontSize: 12 }}>
              NIS / NISN:{' '}
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                {lookupResult.student.nis || '-'} / {lookupResult.student.nisn || '-'}
              </Text>
            </Text>
            <Text style={{ color: '#475569', marginBottom: 2, fontSize: 12 }}>
              Status:{' '}
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                {lookupResult.student.studentStatus || '-'} / {lookupResult.student.verificationStatus || '-'}
              </Text>
            </Text>
            <Text style={{ color: '#475569', marginBottom: 2, fontSize: 12 }}>
              Sudah terhubung ke <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{lookupResult.linkedParentCount}</Text> akun orang tua
            </Text>
            <Text style={{ color: '#475569', marginTop: 8, fontSize: 12, lineHeight: 18 }}>{lookupResult.oneTimeWarning}</Text>
            {lookupResult.alreadyLinkedToCurrentParent ? (
              <Text style={{ color: '#92400e', marginTop: 8, fontSize: 12, fontWeight: '700' }}>
                NISN ini sudah pernah dikaitkan ke akun Anda. Untuk anak lain, gunakan NISN yang berbeda.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View
        style={{
          backgroundColor: BRAND_COLORS.navy,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#c6dbff', fontSize: 12, marginBottom: 3 }}>Total Anak Terdaftar</Text>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 20 }}>{children.length}</Text>
      </View>

      {childrenQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data anak..." /> : null}
      {childrenQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data anak." onRetry={() => childrenQuery.refetch()} />
      ) : null}
      {childrenQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={childrenQuery.data.cachedAt} /> : null}

      {!childrenQuery.isLoading && !childrenQuery.isError ? (
        children.length > 0 ? (
          <View>
            {children.map((child) => (
              <View
                key={child.id}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
                  {child.name}
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Username: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{child.username || '-'}</Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  NIS / NISN:{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                    {child.nis || '-'} / {child.nisn || '-'}
                  </Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Kelas:{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                    {child.studentClass?.name || '-'}
                    {child.studentClass?.major?.code ? ` (${child.studentClass.major.code})` : ''}
                  </Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 10 }}>
                  Status:{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                    {child.studentStatus || '-'} / {child.verificationStatus || '-'}
                  </Text>
                </Text>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => router.push(`/parent/attendance?childId=${child.id}` as never)}
                    style={{
                      flex: 1,
                      backgroundColor: '#ecf3ff',
                      borderWidth: 1,
                      borderColor: '#bcd2fa',
                      borderRadius: 9,
                      alignItems: 'center',
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Absensi</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push(`/parent/finance?childId=${child.id}` as never)}
                    style={{
                      flex: 1,
                      backgroundColor: BRAND_COLORS.blue,
                      borderRadius: 9,
                      alignItems: 'center',
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Keuangan</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => handleUnlinkChild(child.id, child.name)}
                  disabled={unlinkingChildId === child.id}
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: '#fecaca',
                    borderRadius: 9,
                    alignItems: 'center',
                    paddingVertical: 9,
                    backgroundColor: '#fff1f2',
                  }}
                >
                  <Text style={{ color: '#be123c', fontWeight: '700' }}>
                    {unlinkingChildId === child.id ? 'Memproses...' : 'Lepas Hubungan'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada data anak</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Gunakan form di atas untuk menghubungkan data anak pertama ke akun orang tua ini.
            </Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 10,
          backgroundColor: BRAND_COLORS.blue,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
