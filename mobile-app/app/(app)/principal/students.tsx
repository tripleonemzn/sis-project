import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import HomeroomBookMobilePanel from '../../../src/features/homeroomBook/HomeroomBookMobilePanel';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';

export default function PrincipalStudentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [section, setSection] = useState<'SISWA' | 'BUKU_WALI_KELAS'>('SISWA');
  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-students-active-year'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive({ allowStaleOnError: true });
      } catch {
        return null;
      }
    },
  });

  const studentsQuery = useQuery({
    queryKey: ['mobile-principal-students'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => adminApi.listUsers({ role: 'STUDENT' }),
  });

  const students = useMemo(() => studentsQuery.data || [], [studentsQuery.data]);
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of students) {
      if (item.studentClass?.id && item.studentClass?.name) {
        map.set(String(item.studentClass.id), item.studentClass.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  }, [students]);
  const classFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Kelas' },
      ...classOptions.map((option) => ({
        value: option.id,
        label: option.name,
      })),
    ],
    [classOptions],
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((item) => {
      if (classFilter !== 'ALL' && String(item.studentClass?.id || '') !== classFilter) return false;
      if (!q) return true;
      const haystacks = [
        item.name || '',
        item.username || '',
        item.nis || '',
        item.nisn || '',
        item.studentClass?.name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(q));
    });
  }, [students, classFilter, search]);

  if (isLoading) return <AppLoadingScreen message="Memuat data siswa..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Data Siswa</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            section === 'SISWA'
              ? studentsQuery.isFetching && !studentsQuery.isLoading
              : activeYearQuery.isFetching && !activeYearQuery.isLoading
          }
          onRefresh={() => {
            if (section === 'SISWA') {
              studentsQuery.refetch();
              return;
            }
            activeYearQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        {section === 'SISWA' ? 'Data Siswa' : 'Buku Wali Kelas'}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        {section === 'SISWA'
          ? 'Monitoring data siswa lintas kelas untuk kebutuhan kepala sekolah.'
          : 'Monitoring pengecualian ujian finance dan laporan kasus siswa dari wali kelas.'}
      </Text>

      <MobileMenuTabBar
        items={[
          { key: 'SISWA', label: 'Data Siswa', iconName: 'users' },
          { key: 'BUKU_WALI_KELAS', label: 'Buku Wali', iconName: 'book-open' },
        ]}
        activeKey={section}
        onChange={(value) => setSection(value as 'SISWA' | 'BUKU_WALI_KELAS')}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ paddingRight: 8 }}
      />

      {section === 'SISWA' ? (
        <>
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama, username, NIS, kelas"
            placeholderTextColor="#95a3be"
            style={{
              borderWidth: 1,
              borderColor: '#d6e2f7',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
              backgroundColor: '#fff',
              marginBottom: 10,
            }}
          />

          <MobileSelectField
            label="Kelas"
            value={classFilter}
            options={classFilterOptions}
            onChange={(next) => setClassFilter(next || 'ALL')}
            placeholder="Pilih kelas"
          />

          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
            Total siswa terfilter: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{filteredStudents.length}</Text>
          </Text>
        </View>

        {studentsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data siswa..." /> : null}
        {studentsQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat data siswa." onRetry={() => studentsQuery.refetch()} />
        ) : null}

        {!studentsQuery.isLoading && !studentsQuery.isError ? (
          filteredStudents.length > 0 ? (
            filteredStudents.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>{item.name}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3 }}>@{item.username}</Text>
                <Text style={{ color: '#475569', marginTop: 6 }}>
                  Kelas: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.studentClass?.name || '-'}</Text>
                </Text>
                <Text style={{ color: '#475569', marginTop: 2 }}>
                  NIS / NISN:{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                    {item.nis || '-'} / {item.nisn || '-'}
                  </Text>
                </Text>
                <Text style={{ color: '#475569', marginTop: 2 }}>
                  Status: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.studentStatus || '-'}</Text>
                </Text>
              </View>
            ))
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Tidak ada data</Text>
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada siswa sesuai filter saat ini.</Text>
            </View>
          )
        ) : null}
        </>
      ) : (
        <HomeroomBookMobilePanel mode="principal" academicYearId={activeYearQuery.data?.id} />
      )}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 8,
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
