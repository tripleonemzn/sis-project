import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';

function normalizeDuty(value?: string) {
  return String(value || '').trim().toUpperCase();
}

export default function PrincipalTeachersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [search, setSearch] = useState('');
  const [dutyFilter, setDutyFilter] = useState<string>('ALL');

  const teachersQuery = useQuery({
    queryKey: ['mobile-principal-teachers'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () => adminApi.listUsers({ role: 'TEACHER' }),
  });

  const teachers = useMemo(() => teachersQuery.data || [], [teachersQuery.data]);
  const dutyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const teacher of teachers) {
      for (const duty of teacher.additionalDuties || []) {
        const normalized = normalizeDuty(duty);
        if (!normalized) continue;
        map.set(normalized, normalized.replace(/_/g, ' '));
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((teacher) => {
      if (dutyFilter !== 'ALL') {
        const hasDuty = (teacher.additionalDuties || []).some((duty) => normalizeDuty(duty) === dutyFilter);
        if (!hasDuty) return false;
      }
      if (!q) return true;
      const dutyText = (teacher.additionalDuties || []).join(' ');
      const haystacks = [teacher.name || '', teacher.username || '', teacher.email || '', dutyText];
      return haystacks.some((value) => value.toLowerCase().includes(q));
    });
  }, [teachers, dutyFilter, search]);

  if (isLoading) return <AppLoadingScreen message="Memuat data guru..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Data Guru</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl refreshing={teachersQuery.isFetching && !teachersQuery.isLoading} onRefresh={() => teachersQuery.refetch()} />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>Data Guru</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Monitoring data guru dan tambahan jabatan struktural.
      </Text>

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
          placeholder="Cari nama, username, email, duty"
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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <Pressable
              onPress={() => setDutyFilter('ALL')}
              style={{
                borderWidth: 1,
                borderColor: dutyFilter === 'ALL' ? BRAND_COLORS.blue : '#d6e2f7',
                backgroundColor: dutyFilter === 'ALL' ? '#e9f1ff' : '#fff',
                borderRadius: 10,
                paddingVertical: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: dutyFilter === 'ALL' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                Semua Jabatan
              </Text>
            </Pressable>
          </View>

          {dutyOptions.slice(0, 7).map((option) => (
            <View key={option.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => setDutyFilter(option.id)}
                style={{
                  borderWidth: 1,
                  borderColor: dutyFilter === option.id ? BRAND_COLORS.blue : '#d6e2f7',
                  backgroundColor: dutyFilter === option.id ? '#e9f1ff' : '#fff',
                  borderRadius: 10,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: dutyFilter === option.id ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}
                >
                  {option.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
          Total guru terfilter: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{filteredTeachers.length}</Text>
        </Text>
      </View>

      {teachersQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data guru..." /> : null}
      {teachersQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data guru." onRetry={() => teachersQuery.refetch()} />
      ) : null}

      {!teachersQuery.isLoading && !teachersQuery.isError ? (
        filteredTeachers.length > 0 ? (
          filteredTeachers.map((teacher) => (
            <View
              key={teacher.id}
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>{teacher.name}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3 }}>@{teacher.username}</Text>
              <Text style={{ color: '#475569', marginTop: 6 }}>
                Email: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{teacher.email || '-'}</Text>
              </Text>
              <Text style={{ color: '#475569', marginTop: 2 }}>
                Verifikasi:{' '}
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{teacher.verificationStatus || '-'}</Text>
              </Text>
              <Text style={{ color: '#475569', marginTop: 2 }}>
                Tugas Tambahan:{' '}
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                  {(teacher.additionalDuties || []).length
                    ? (teacher.additionalDuties || []).map((duty) => duty.replace(/_/g, ' ')).join(', ')
                    : '-'}
                </Text>
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
            <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada guru sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

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
