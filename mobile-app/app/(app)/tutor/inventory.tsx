import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { isOsisExtracurricularCategory } from '../../../src/features/extracurricular/category';
import { tutorApi } from '../../../src/features/tutor/tutorApi';
import { canAccessTutorWorkspace } from '../../../src/features/tutor/tutorAccess';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

function parseNonNegativeInt(raw: string, fallback = 0) {
  const parsed = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export default function TutorInventoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const hasTutorWorkspaceAccess = canAccessTutorWorkspace(user);

  const [search, setSearch] = useState('');
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [targetAssignmentId, setTargetAssignmentId] = useState<number | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemBrand, setItemBrand] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [goodQty, setGoodQty] = useState('1');
  const [minorDamageQty, setMinorDamageQty] = useState('0');
  const [majorDamageQty, setMajorDamageQty] = useState('0');

  const yearsQuery = useQuery({
    queryKey: ['mobile-tutor-inventory-years'],
    enabled: isAuthenticated && hasTutorWorkspaceAccess,
    staleTime: 5 * 60 * 1000,
    queryFn: () => adminApi.listAcademicYears({ page: 1, limit: 100 }),
  });

  const years = useMemo(() => yearsQuery.data?.items || [], [yearsQuery.data?.items]);
  const activeYear = useMemo(() => years.find((year) => year.isActive) || years[0] || null, [years]);
  const effectiveYearId = selectedYearId || activeYear?.id || undefined;

  const inventoryQuery = useQuery({
    queryKey: ['mobile-tutor-inventory-overview', effectiveYearId],
    enabled: isAuthenticated && hasTutorWorkspaceAccess && Boolean(effectiveYearId),
    queryFn: () => tutorApi.getInventoryOverview(effectiveYearId),
  });

  const rows = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const extracurricularRows = useMemo(
    () => rows.filter((row) => !isOsisExtracurricularCategory(row.ekskulCategory)),
    [rows],
  );
  const rowsWithRoom = useMemo(
    () => extracurricularRows.filter((row) => Boolean(row.room?.id)),
    [extracurricularRows],
  );

  const effectiveTargetAssignmentId = useMemo(() => {
    if (rowsWithRoom.length === 0) return null;
    if (targetAssignmentId && rowsWithRoom.some((row) => row.assignmentId === targetAssignmentId)) {
      return targetAssignmentId;
    }
    return rowsWithRoom[0].assignmentId;
  }, [rowsWithRoom, targetAssignmentId]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return extracurricularRows;
    return extracurricularRows.filter((row) => {
      const haystacks = [
        row.ekskulName,
        row.room?.name || '',
        row.room?.location || '',
        row.room?.categoryName || '',
      ];
      return haystacks.some((value) => String(value || '').toLowerCase().includes(keyword));
    });
  }, [extracurricularRows, search]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveTargetAssignmentId) {
        throw new Error('Ruang inventaris ekskul belum ditautkan oleh Sarpras.');
      }
      const name = itemName.trim();
      if (!name) {
        throw new Error('Nama barang wajib diisi.');
      }

      return tutorApi.createInventoryItem({
        assignmentId: effectiveTargetAssignmentId,
        name,
        brand: itemBrand.trim() || undefined,
        description: itemDescription.trim() || undefined,
        goodQty: parseNonNegativeInt(goodQty, 0),
        minorDamageQty: parseNonNegativeInt(minorDamageQty, 0),
        majorDamageQty: parseNonNegativeInt(majorDamageQty, 0),
      });
    },
    onSuccess: async () => {
      notifySuccess('Item inventaris berhasil ditambahkan.');
      setFormVisible(false);
      setItemName('');
      setItemBrand('');
      setItemDescription('');
      setGoodQty('1');
      setMinorDamageQty('0');
      setMajorDamageQty('0');
      await queryClient.invalidateQueries({ queryKey: ['mobile-tutor-inventory-overview'] });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menambahkan item inventaris ekskul.');
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat inventaris ekskul..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!hasTutorWorkspaceAccess) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>
          Inventaris Ekskul
        </Text>
        <QueryStateView type="error" message="Halaman ini tersedia untuk pembina ekstrakurikuler aktif." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={yearsQuery.isFetching || inventoryQuery.isFetching}
          onRefresh={() => {
            void yearsQuery.refetch();
            void inventoryQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Inventaris Ekskul
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Data inventaris ini terhubung dari modul Sarpras (Fasilitas Ekskul).
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
          gap: 10,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Tahun Ajaran</Text>
        {yearsQuery.isLoading ? (
          <QueryStateView type="loading" message="Memuat tahun ajaran..." />
        ) : years.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {years.map((year) => {
              const selected = Number(effectiveYearId) === Number(year.id);
              return (
                <View key={year.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => setSelectedYearId(year.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                      backgroundColor: selected ? '#e9f1ff' : '#fff',
                      borderRadius: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {year.name}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                      {year.isActive ? 'Aktif' : 'Arsip'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Data tahun ajaran belum tersedia.</Text>
        )}

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari ekskul / ruang inventaris..."
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: BRAND_COLORS.textDark,
            backgroundColor: '#fff',
          }}
        />

        <Pressable
          onPress={() => {
            if (!rowsWithRoom.length) {
              notifyApiError(new Error('Ruang inventaris ekskul belum ditautkan oleh Sarpras.'), 'Tidak bisa tambah item.');
              return;
            }
            setFormVisible((prev) => !prev);
          }}
          style={{
            backgroundColor: rowsWithRoom.length > 0 ? '#2563eb' : '#94a3b8',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{formVisible ? 'Tutup Form Item' : 'Tambah Item Inventaris'}</Text>
        </Pressable>
      </View>

      {formVisible ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Form Item Inventaris</Text>

          <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 6, fontSize: 12 }}>Ekskul Tujuan</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
            {rowsWithRoom.map((row) => {
              const selected = Number(effectiveTargetAssignmentId) === Number(row.assignmentId);
              return (
                <View key={row.assignmentId} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => setTargetAssignmentId(row.assignmentId)}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                      backgroundColor: selected ? '#e9f1ff' : '#fff',
                      borderRadius: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {row.ekskulName}
                    </Text>
                    <Text numberOfLines={1} style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                      {row.room?.name || '-'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {[
            {
              label: 'Nama Barang',
              value: itemName,
              onChangeText: setItemName,
              placeholder: 'Contoh: Bola Futsal',
              multiline: false,
            },
            {
              label: 'Merk',
              value: itemBrand,
              onChangeText: setItemBrand,
              placeholder: 'Contoh: Molten',
              multiline: false,
            },
            {
              label: 'Keterangan',
              value: itemDescription,
              onChangeText: setItemDescription,
              placeholder: 'Catatan item inventaris',
              multiline: true,
            },
          ].map((field) => (
            <View key={field.label} style={{ marginBottom: 8 }}>
              <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4, fontSize: 12 }}>{field.label}</Text>
              <TextInput
                value={field.value}
                onChangeText={field.onChangeText}
                placeholder={field.placeholder}
                placeholderTextColor="#94a3b8"
                multiline={field.multiline}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: field.multiline ? 10 : 9,
                  minHeight: field.multiline ? 82 : undefined,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  textAlignVertical: field.multiline ? 'top' : 'center',
                }}
              />
            </View>
          ))}

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
            {[
              { label: 'Baik', value: goodQty, setter: setGoodQty },
              { label: 'Rusak Ringan', value: minorDamageQty, setter: setMinorDamageQty },
              { label: 'Rusak Berat', value: majorDamageQty, setter: setMajorDamageQty },
            ].map((field) => (
              <View key={field.label} style={{ flex: 1, paddingHorizontal: 4 }}>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4, fontSize: 12 }}>{field.label}</Text>
                <TextInput
                  value={field.value}
                  onChangeText={field.setter}
                  keyboardType="number-pad"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    color: BRAND_COLORS.textDark,
                    backgroundColor: '#fff',
                  }}
                />
              </View>
            ))}
          </View>

          <Pressable
            disabled={createMutation.isPending}
            onPress={() => createMutation.mutate()}
            style={{
              backgroundColor: createMutation.isPending ? '#93c5fd' : '#16a34a',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Item'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {inventoryQuery.isLoading ? <QueryStateView type="loading" message="Memuat inventaris ekskul..." /> : null}
      {inventoryQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat inventaris ekskul." onRetry={() => inventoryQuery.refetch()} />
      ) : null}

      {!inventoryQuery.isLoading && !inventoryQuery.isError ? (
        filteredRows.length > 0 ? (
          filteredRows.map((row) => {
            const totalQty = row.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return (
              <View
                key={row.assignmentId}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>
                      {row.ekskulName}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      {row.academicYearName}
                    </Text>
                  </View>
                  {row.room ? (
                    <View style={{ alignItems: 'flex-end', maxWidth: '55%' }}>
                      <Text style={{ color: BRAND_COLORS.navy, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                        {row.room.name}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11 }} numberOfLines={1}>
                        {row.room.categoryName || 'Kategori belum diatur'}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#fcd34d',
                        backgroundColor: '#fef9c3',
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ color: '#92400e', fontSize: 11, fontWeight: '700' }}>Ruang belum ditautkan</Text>
                    </View>
                  )}
                </View>

                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8, marginBottom: 6 }}>
                  Total Item: {row.items.length} • Total Qty: {totalQty}
                </Text>

                {row.items.length > 0 ? (
                  row.items.map((item) => (
                    <View
                      key={item.id}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: '#eef3ff',
                        paddingTop: 8,
                        marginTop: 6,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Merk: {item.brand || '-'} • Qty: {item.quantity ?? 0}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>
                        Baik: {item.goodQty ?? 0} • Rusak Ringan: {item.minorDamageQty ?? 0} • Rusak Berat:{' '}
                        {item.majorDamageQty ?? 0}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada item inventaris.</Text>
                )}
              </View>
            );
          })
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada data</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada inventaris ekskul untuk filter saat ini.</Text>
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
