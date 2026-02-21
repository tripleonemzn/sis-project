import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { useExaminerSchemesQuery } from '../../../src/features/examiner/useExaminerSchemesQuery';
import { examinerApi } from '../../../src/features/examiner/examinerApi';
import { ExaminerScheme, ExaminerSchemeCriteria } from '../../../src/features/examiner/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type SchemeFormMode = 'CREATE' | 'EDIT' | null;

type CriteriaDraft = {
  id: string;
  name: string;
  maxScore: string;
  group: string;
};

function draftFromSchemeCriteria(criteria: ExaminerSchemeCriteria[] | null | undefined): CriteriaDraft[] {
  const rows = Array.isArray(criteria) ? criteria : [];
  if (!rows.length) {
    return [{ id: 'default-0', name: '', maxScore: '10', group: 'Umum' }];
  }
  return rows.map((item, index) => ({
    id: String(item.id ?? `${index}`),
    name: String(item.name || ''),
    maxScore: String(item.maxScore ?? 10),
    group: String(item.group || 'Umum'),
  }));
}

function buildCriteriaPayload(rows: CriteriaDraft[]): ExaminerSchemeCriteria[] {
  return rows
    .map((row, index) => ({
      id: row.id || `mobile-${Date.now()}-${index}`,
      name: row.name.trim(),
      maxScore: Number(row.maxScore),
      group: row.group.trim() || 'Umum',
    }))
    .filter((item) => item.name.length > 0 && Number.isFinite(item.maxScore) && item.maxScore > 0);
}

export default function ExaminerSchemesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [search, setSearch] = useState('');
  const [formMode, setFormMode] = useState<SchemeFormMode>(null);
  const [editingSchemeId, setEditingSchemeId] = useState<number | null>(null);
  const [schemeName, setSchemeName] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [criteriaRows, setCriteriaRows] = useState<CriteriaDraft[]>([
    { id: 'draft-0', name: '', maxScore: '10', group: 'Umum' },
  ]);

  const schemesQuery = useExaminerSchemesQuery({ enabled: isAuthenticated, user });
  const subjectsQuery = useQuery({
    queryKey: ['mobile-examiner-scheme-subjects'],
    enabled: isAuthenticated && user?.role === 'EXAMINER',
    queryFn: async () => {
      const result = await adminApi.listSubjects({ page: 1, limit: 400 });
      return result.items;
    },
  });

  const resetForm = () => {
    setFormMode(null);
    setEditingSchemeId(null);
    setSchemeName('');
    setSelectedSubjectId(null);
    setSubjectSearch('');
    setCriteriaRows([{ id: `draft-${Date.now()}`, name: '', maxScore: '10', group: 'Umum' }]);
  };

  const openCreateForm = () => {
    setFormMode('CREATE');
    setEditingSchemeId(null);
    setSchemeName('');
    const firstSubject = subjectsQuery.data?.[0] || null;
    setSelectedSubjectId(firstSubject?.id || null);
    setSubjectSearch('');
    setCriteriaRows([{ id: `draft-${Date.now()}`, name: '', maxScore: '10', group: 'Umum' }]);
  };

  const openEditForm = (scheme: ExaminerScheme) => {
    setFormMode('EDIT');
    setEditingSchemeId(scheme.id);
    setSchemeName(scheme.name || '');
    setSelectedSubjectId(scheme.subject?.id || scheme.subjectId || null);
    setSubjectSearch('');
    setCriteriaRows(draftFromSchemeCriteria(scheme.criteria));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const activeYear = schemesQuery.data?.activeYear;
      if (!activeYear?.id) throw new Error('Tahun ajaran aktif tidak tersedia.');
      if (!selectedSubjectId) throw new Error('Pilih mata pelajaran terlebih dahulu.');
      const criteria = buildCriteriaPayload(criteriaRows);
      if (!schemeName.trim()) throw new Error('Nama skema wajib diisi.');
      if (!criteria.length) throw new Error('Minimal satu komponen penilaian wajib diisi.');

      return examinerApi.createScheme({
        name: schemeName.trim(),
        subjectId: selectedSubjectId,
        majorId: user?.examinerMajor?.id || null,
        academicYearId: activeYear.id,
        criteria,
      });
    },
    onSuccess: async () => {
      notifySuccess('Skema UKK berhasil dibuat.');
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-examiner-schemes', user?.id] });
      await schemesQuery.refetch();
    },
    onError: (error: any) => notifyApiError(error, 'Gagal membuat skema UKK.'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingSchemeId) throw new Error('Skema yang diedit tidak valid.');
      const criteria = buildCriteriaPayload(criteriaRows);
      if (!schemeName.trim()) throw new Error('Nama skema wajib diisi.');
      if (!criteria.length) throw new Error('Minimal satu komponen penilaian wajib diisi.');

      return examinerApi.updateScheme(editingSchemeId, {
        name: schemeName.trim(),
        criteria,
      });
    },
    onSuccess: async () => {
      notifySuccess('Skema UKK berhasil diperbarui.');
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-examiner-schemes', user?.id] });
      await schemesQuery.refetch();
    },
    onError: (error: any) => notifyApiError(error, 'Gagal memperbarui skema UKK.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (schemeId: number) => examinerApi.deleteScheme(schemeId),
    onSuccess: async () => {
      notifySuccess('Skema UKK berhasil dihapus.');
      if (formMode === 'EDIT') resetForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-examiner-schemes', user?.id] });
      await schemesQuery.refetch();
    },
    onError: (error: any) => notifyApiError(error, 'Gagal menghapus skema UKK.'),
  });

  const schemes = schemesQuery.data?.schemes || [];
  const filteredSchemes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return schemes;
    return schemes.filter((scheme) => {
      const haystacks = [scheme.name || '', scheme.subject?.name || '', scheme.major?.name || ''];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [schemes, search]);

  const filteredSubjects = useMemo(() => {
    const rows = subjectsQuery.data || [];
    const query = subjectSearch.trim().toLowerCase();
    if (!query) return rows.slice(0, 12);
    return rows
      .filter((item) => {
        const haystacks = [item.name || '', item.code || '', item.category?.name || ''];
        return haystacks.some((value) => value.toLowerCase().includes(query));
      })
      .slice(0, 20);
  }, [subjectsQuery.data, subjectSearch]);

  const formPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const selectedSubject = (subjectsQuery.data || []).find((item) => item.id === selectedSubjectId) || null;

  if (isLoading) return <AppLoadingScreen message="Memuat data skema..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'EXAMINER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Data Skema</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role penguji." />
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
          refreshing={schemesQuery.isFetching || subjectsQuery.isFetching}
          onRefresh={() => {
            void schemesQuery.refetch();
            void subjectsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Data Skema UKK
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola skema, komponen penilaian, dan lanjutkan input nilai UKK.
      </Text>

      <View
        style={{
          backgroundColor: BRAND_COLORS.navy,
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#c6dbff', fontSize: 12, marginBottom: 8 }}>Ringkasan</Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#c6dbff', fontSize: 11, marginBottom: 4 }}>Total Skema</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{schemes.length}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10, padding: 10 }}>
              <Text style={{ color: '#c6dbff', fontSize: 11, marginBottom: 4 }}>Tahun Aktif</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {schemesQuery.data?.activeYear?.name || '-'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Pressable
          disabled={formPending}
          onPress={openCreateForm}
          style={{
            flex: 1,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 11,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah Skema</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/examiner/assessment' as never)}
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#c7d6f5',
            borderRadius: 10,
            paddingVertical: 11,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Feather name="edit-3" size={16} color={BRAND_COLORS.navy} />
          <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Input Nilai</Text>
        </Pressable>
      </View>

      {formMode ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
            {formMode === 'CREATE' ? 'Tambah Skema Baru' : 'Edit Skema'}
          </Text>

          <TextInput
            value={schemeName}
            onChangeText={setSchemeName}
            placeholder="Nama skema UKK"
            placeholderTextColor="#95a3be"
            style={{
              borderWidth: 1,
              borderColor: '#d6e2f7',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
              marginBottom: 10,
              backgroundColor: '#fff',
            }}
          />

          {formMode === 'CREATE' ? (
            <>
              <TextInput
                value={subjectSearch}
                onChangeText={setSubjectSearch}
                placeholder="Cari mata pelajaran..."
                placeholderTextColor="#95a3be"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                  backgroundColor: '#fff',
                }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
                {filteredSubjects.map((subject) => (
                  <View key={subject.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setSelectedSubjectId(subject.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selectedSubjectId === subject.id ? BRAND_COLORS.blue : '#d6e2f7',
                        backgroundColor: selectedSubjectId === subject.id ? '#e9f1ff' : '#fff',
                        borderRadius: 9,
                        paddingVertical: 8,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selectedSubjectId === subject.id ? BRAND_COLORS.navy : BRAND_COLORS.textDark,
                          fontWeight: '700',
                        }}
                      >
                        {subject.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                        {subject.code}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: '#f8fbff',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11 }}>Mata Pelajaran</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>
                {selectedSubject?.name || '-'}
              </Text>
            </View>
          )}

          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
            Komponen Penilaian
          </Text>

          {criteriaRows.map((row, index) => (
            <View
              key={`${row.id}-${index}`}
              style={{
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
                backgroundColor: '#fff',
              }}
            >
              <TextInput
                value={row.name}
                onChangeText={(value) =>
                  setCriteriaRows((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, name: value } : item)),
                  )
                }
                placeholder="Nama komponen"
                placeholderTextColor="#95a3be"
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={row.group}
                  onChangeText={(value) =>
                    setCriteriaRows((prev) =>
                      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, group: value } : item)),
                    )
                  }
                  placeholder="Grup (contoh: Persiapan)"
                  placeholderTextColor="#95a3be"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: BRAND_COLORS.textDark,
                  }}
                />
                <TextInput
                  value={row.maxScore}
                  onChangeText={(value) =>
                    setCriteriaRows((prev) =>
                      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, maxScore: value } : item)),
                    )
                  }
                  keyboardType="numeric"
                  placeholder="Maks"
                  placeholderTextColor="#95a3be"
                  style={{
                    width: 82,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: BRAND_COLORS.textDark,
                    textAlign: 'center',
                  }}
                />
              </View>

              <Pressable
                onPress={() =>
                  setCriteriaRows((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                }
                style={{
                  marginTop: 8,
                  alignSelf: 'flex-end',
                  borderWidth: 1,
                  borderColor: '#fecaca',
                  backgroundColor: '#fff1f2',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={() =>
              setCriteriaRows((prev) => [
                ...prev,
                { id: `draft-${Date.now()}-${prev.length}`, name: '', maxScore: '10', group: 'Umum' },
              ])
            }
            style={{
              borderWidth: 1,
              borderColor: '#bfdbfe',
              borderRadius: 9,
              borderStyle: 'dashed',
              alignItems: 'center',
              paddingVertical: 9,
              marginBottom: 10,
              backgroundColor: '#f8fbff',
            }}
          >
            <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Tambah Komponen</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={resetForm}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                alignItems: 'center',
                paddingVertical: 11,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Batal</Text>
            </Pressable>
            <Pressable
              disabled={formPending}
              onPress={() => {
                if (formMode === 'CREATE') {
                  createMutation.mutate();
                  return;
                }
                updateMutation.mutate();
              }}
              style={{
                flex: 1,
                backgroundColor: formPending ? '#93c5fd' : BRAND_COLORS.blue,
                borderRadius: 10,
                alignItems: 'center',
                paddingVertical: 11,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {formPending ? 'Menyimpan...' : formMode === 'CREATE' ? 'Simpan Skema' : 'Update Skema'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 999,
          paddingHorizontal: 12,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama skema, jurusan, mapel"
          placeholderTextColor="#95a3be"
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 8,
            color: BRAND_COLORS.textDark,
          }}
        />
      </View>

      {schemesQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data skema..." /> : null}
      {schemesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data skema UKK." onRetry={() => schemesQuery.refetch()} />
      ) : null}
      {schemesQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={schemesQuery.data.cachedAt} /> : null}

      {!schemesQuery.isLoading && !schemesQuery.isError ? (
        filteredSchemes.length > 0 ? (
          <View>
            {filteredSchemes.map((scheme) => {
              const criteriaCount = Array.isArray(scheme.criteria) ? scheme.criteria.length : 0;
              return (
                <View
                  key={scheme.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: BRAND_COLORS.textDark }}>
                    {scheme.name}
                  </Text>
                  <Text style={{ color: '#475569', marginTop: 4 }}>
                    Mapel: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{scheme.subject?.name || '-'}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginTop: 2 }}>
                    Jurusan: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{scheme.major?.name || '-'}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginTop: 2 }}>
                    Komponen: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{criteriaCount}</Text>
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable
                      onPress={() => router.push(`/examiner/assessment?schemeId=${scheme.id}` as never)}
                      style={{
                        flex: 1,
                        backgroundColor: BRAND_COLORS.blue,
                        borderRadius: 9,
                        alignItems: 'center',
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Input Nilai</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openEditForm(scheme)}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        backgroundColor: '#eff6ff',
                        borderRadius: 9,
                        alignItems: 'center',
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      disabled={deleteMutation.isPending}
                      onPress={() => {
                        Alert.alert('Hapus Skema', `Hapus skema "${scheme.name}"?`, [
                          { text: 'Batal', style: 'cancel' },
                          {
                            text: 'Hapus',
                            style: 'destructive',
                            onPress: () => deleteMutation.mutate(scheme.id),
                          },
                        ]);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fff1f2',
                        borderRadius: 9,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text style={{ color: '#be123c', fontWeight: '700' }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Belum ada skema
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Skema UKK belum tersedia atau tidak sesuai pencarian.
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
