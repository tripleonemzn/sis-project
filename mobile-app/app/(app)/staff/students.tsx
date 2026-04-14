import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useStaffStudentsQuery } from '../../../src/features/staff/useStaffStudentsQuery';
import { getStaffStudentsSubtitle } from '../../../src/features/staff/staffRole';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';

export default function StaffStudentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const studentsQuery = useStaffStudentsQuery({ enabled: isAuthenticated, user });
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');

  const students = useMemo(() => studentsQuery.data?.students || [], [studentsQuery.data?.students]);
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of students) {
      if (item.studentClass?.id && item.studentClass?.name) {
        map.set(String(item.studentClass.id), item.studentClass.name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [students]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((item) => {
      if (classFilter !== 'ALL' && String(item.studentClass?.id || '') !== classFilter) return false;
      if (!query) return true;
      const haystacks = [
        item.name || '',
        item.username || '',
        item.nis || '',
        item.nisn || '',
        item.studentClass?.name || '',
        item.studentClass?.major?.name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [students, search, classFilter]);

  if (isLoading) return <AppLoadingScreen message="Memuat data siswa..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STAFF') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Data Siswa</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role staff." />
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={studentsQuery.isFetching && !studentsQuery.isLoading}
          onRefresh={() => studentsQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Data Siswa</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        {getStaffStudentsSubtitle(user)}
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: '#d6e2f7',
            paddingHorizontal: 12,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama, username, NIS, kelas"
            placeholderTextColor="#95a3be"
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 8,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <Pressable
              onPress={() => setClassFilter('ALL')}
              style={{
                borderWidth: 1,
                borderColor: classFilter === 'ALL' ? BRAND_COLORS.blue : '#d6e2f7',
                backgroundColor: classFilter === 'ALL' ? '#e9f1ff' : '#fff',
                borderRadius: 9,
                paddingVertical: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: classFilter === 'ALL' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                Semua Kelas
              </Text>
            </Pressable>
          </View>
          {classOptions.slice(0, 7).map((option) => (
            <View key={option.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => setClassFilter(option.id)}
                style={{
                  borderWidth: 1,
                  borderColor: classFilter === option.id ? BRAND_COLORS.blue : '#d6e2f7',
                  backgroundColor: classFilter === option.id ? '#e9f1ff' : '#fff',
                  borderRadius: 9,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: classFilter === option.id ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}
                >
                  {option.name}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
          Total siswa ditemukan: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{filteredStudents.length}</Text>
        </Text>
      </View>

      {studentsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data siswa..." /> : null}
      {studentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data siswa." onRetry={() => studentsQuery.refetch()} />
      ) : null}
      {studentsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={studentsQuery.data.cachedAt} /> : null}

      {!studentsQuery.isLoading && !studentsQuery.isError ? (
        filteredStudents.length > 0 ? (
          <View>
            {filteredStudents.map((item) => (
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, marginBottom: 5 }}>{item.name}</Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Username: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.username}</Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  NIS / NISN:{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                    {item.nis || '-'} / {item.nisn || '-'}
                  </Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Kelas:{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                    {item.studentClass?.name || '-'}
                    {item.studentClass?.major?.code ? ` (${item.studentClass.major.code})` : ''}
                  </Text>
                </Text>
                <Text style={{ color: '#475569' }}>
                  Status:{' '}
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                    {item.studentStatus || '-'} / {item.verificationStatus || '-'}
                  </Text>
                </Text>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Data tidak ditemukan</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data siswa yang sesuai dengan filter saat ini.</Text>
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
