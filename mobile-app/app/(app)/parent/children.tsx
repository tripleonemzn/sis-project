import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useParentChildrenQuery } from '../../../src/features/parent/useParentChildrenQuery';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

export default function ParentChildrenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const childrenQuery = useParentChildrenQuery({ enabled: isAuthenticated, user });
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  if (isLoading) return <AppLoadingScreen message="Memuat data anak..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PARENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Data Anak</Text>
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
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Data Anak</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Daftar anak yang terhubung dengan akun orang tua.
      </Text>

      <View
        style={{
          backgroundColor: BRAND_COLORS.navy,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#c6dbff', fontSize: 12, marginBottom: 3 }}>Total Anak Terdaftar</Text>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 26 }}>{children.length}</Text>
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
              Hubungkan data siswa ke akun orang tua melalui admin untuk menampilkan data anak.
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
