import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { sarprasApi } from '../../../src/features/sarpras/sarprasApi';
import { SarprasInventoryItem, SarprasRoom } from '../../../src/features/sarpras/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type SarprasSection = 'RINGKASAN' | 'RUANGAN' | 'INVENTARIS';
type InventoryScope = 'ALL' | 'LAB' | 'LIBRARY';

function parseScope(value?: string | string[] | null): InventoryScope {
  const normalized = String(Array.isArray(value) ? value[0] : value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'LAB') return 'LAB';
  if (normalized === 'LIBRARY' || normalized === 'PERPUSTAKAAN') return 'LIBRARY';
  return 'ALL';
}

function hasSarprasDuty(userDuties: string[] | undefined, scope: InventoryScope) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  const hasCore = duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');
  if (hasCore) return true;
  if (scope === 'LAB') return duties.includes('KEPALA_LAB');
  if (scope === 'LIBRARY') return duties.includes('KEPALA_PERPUSTAKAAN');
  return false;
}

function formatNumber(value: number) {
  return value.toLocaleString('id-ID');
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value || 0)));
}

function resolveConditionLabel(condition: string | null | undefined) {
  const value = (condition || '').toUpperCase();
  if (value === 'BAIK') return 'Baik';
  if (value === 'RUSAK_RINGAN') return 'Rusak Ringan';
  if (value === 'RUSAK_BERAT') return 'Rusak Berat';
  return 'Belum diisi';
}

function resolveConditionStyle(condition: string | null | undefined) {
  const value = (condition || '').toUpperCase();
  if (value === 'BAIK') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (value === 'RUSAK_RINGAN') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  if (value === 'RUSAK_BERAT') return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  return { bg: '#e2e8f0', border: '#cbd5e1', text: '#334155' };
}

function parseNumberInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function toInputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function SectionChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 22, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function ConditionBadge({ condition }: { condition: string | null | undefined }) {
  const style = resolveConditionStyle(condition);
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: style.border,
        backgroundColor: style.bg,
      }}
    >
      <Text style={{ color: style.text, fontWeight: '700', fontSize: 11 }}>{resolveConditionLabel(condition)}</Text>
    </View>
  );
}

function getSearchPlaceholder(section: SarprasSection) {
  if (section === 'INVENTARIS') return 'Cari item inventaris';
  if (section === 'RUANGAN') return 'Cari ruangan (nama/lokasi)';
  return 'Cari ringkasan aset sekolah';
}

function RoomCard({
  room,
  selected,
  onPress,
  canManageStructure,
  onEdit,
  onDelete,
  deletePending,
}: {
  room: SarprasRoom;
  selected: boolean;
  onPress: () => void;
  canManageStructure: boolean;
  onEdit: (room: SarprasRoom) => void;
  onDelete: (room: SarprasRoom) => void;
  deletePending: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: selected ? BRAND_COLORS.blue : '#dbe7fb',
        backgroundColor: selected ? '#f3f8ff' : '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <Pressable onPress={onPress} style={{ flex: 1 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>{room.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {room.location || '-'} • Kapasitas {formatNumber(Number(room.capacity || 0))}
          </Text>
          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            Item: {formatNumber(Number(room._count?.items || 0))}
          </Text>
        </Pressable>
        <ConditionBadge condition={room.condition} />
      </View>

      {canManageStructure ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={() => onEdit(room)}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#93c5fd',
              borderRadius: 8,
              paddingVertical: 8,
              alignItems: 'center',
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(room)}
            disabled={deletePending}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#fca5a5',
              borderRadius: 8,
              paddingVertical: 8,
              alignItems: 'center',
              backgroundColor: '#fff',
              opacity: deletePending ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function InventoryCard({
  item,
  canManageItems,
  onEdit,
  onDelete,
  deletePending,
}: {
  item: SarprasInventoryItem;
  canManageItems: boolean;
  onEdit: (item: SarprasInventoryItem) => void;
  onDelete: (item: SarprasInventoryItem) => void;
  deletePending: boolean;
}) {
  const minor = Number(item.minorDamageQty || 0);
  const major = Number(item.majorDamageQty || 0);
  const good = Number(item.goodQty || 0);
  const total = Number(item.quantity || 0);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#dbe7fb',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>{item.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            Kode: {item.code || '-'} • Merek: {item.brand || '-'}
          </Text>
        </View>
        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 16 }}>{formatNumber(total)} unit</Text>
      </View>

      <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
        {[
          { label: 'Baik', value: good, color: '#166534', bg: '#dcfce7' },
          { label: 'Rusak Ringan', value: minor, color: '#92400e', bg: '#fef3c7' },
          { label: 'Rusak Berat', value: major, color: '#991b1b', bg: '#fee2e2' },
        ].map((segment) => (
          <View key={segment.label} style={{ width: '33.33%', paddingHorizontal: 3, marginBottom: 6 }}>
            <View
              style={{
                borderRadius: 8,
                backgroundColor: segment.bg,
                paddingVertical: 7,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: segment.color, fontWeight: '700', fontSize: 12 }}>
                {formatNumber(segment.value)}
              </Text>
              <Text style={{ color: segment.color, fontSize: 11 }}>{segment.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
        Sumber: {item.source || '-'} • Harga: {item.price ? formatCurrency(item.price) : '-'}
      </Text>

      {canManageItems ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={() => onEdit(item)}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#93c5fd',
              borderRadius: 8,
              paddingVertical: 8,
              alignItems: 'center',
              backgroundColor: '#eff6ff',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(item)}
            disabled={deletePending}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#fca5a5',
              borderRadius: 8,
              paddingVertical: 8,
              alignItems: 'center',
              backgroundColor: '#fff',
              opacity: deletePending ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function TeacherSarprasInventoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scope?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const inventoryScope = parseScope(params.scope);
  const pageTitle =
    inventoryScope === 'LAB'
      ? 'Inventaris Lab'
      : inventoryScope === 'LIBRARY'
        ? 'Inventaris Perpustakaan'
        : 'Aset Sekolah';
  const pageSubtitle =
    inventoryScope === 'LAB'
      ? 'Kelola data ruang dan inventaris laboratorium.'
      : inventoryScope === 'LIBRARY'
        ? 'Kelola data ruang dan inventaris perpustakaan.'
        : 'Kelola data ruang dan inventaris sarana prasarana sekolah.';

  const [section, setSection] = useState<SarprasSection>('RINGKASAN');
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryFormName, setCategoryFormName] = useState('');
  const [categoryFormDescription, setCategoryFormDescription] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [roomFormName, setRoomFormName] = useState('');
  const [roomFormLocation, setRoomFormLocation] = useState('');
  const [roomFormCapacity, setRoomFormCapacity] = useState('');
  const [roomFormCondition, setRoomFormCondition] = useState<'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT'>('BAIK');
  const [roomFormDescription, setRoomFormDescription] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemFormName, setItemFormName] = useState('');
  const [itemFormCode, setItemFormCode] = useState('');
  const [itemFormBrand, setItemFormBrand] = useState('');
  const [itemFormGoodQty, setItemFormGoodQty] = useState('');
  const [itemFormMinorQty, setItemFormMinorQty] = useState('');
  const [itemFormMajorQty, setItemFormMajorQty] = useState('');
  const [itemFormPurchaseDate, setItemFormPurchaseDate] = useState('');
  const [itemFormPrice, setItemFormPrice] = useState('');
  const [itemFormSource, setItemFormSource] = useState('');
  const [itemFormDescription, setItemFormDescription] = useState('');

  const normalizedDuties = useMemo(
    () => (user?.additionalDuties || []).map((item) => item.trim().toUpperCase()),
    [user?.additionalDuties],
  );

  const isAllowed = user?.role === 'TEACHER' && hasSarprasDuty(user?.additionalDuties, inventoryScope);
  const canManageStructure =
    user?.role === 'ADMIN' ||
    normalizedDuties.includes('WAKASEK_SARPRAS') ||
    normalizedDuties.includes('SEKRETARIS_SARPRAS');
  const canManageItems =
    canManageStructure ||
    (inventoryScope === 'LAB' && normalizedDuties.includes('KEPALA_LAB')) ||
    (inventoryScope === 'LIBRARY' && normalizedDuties.includes('KEPALA_PERPUSTAKAAN'));

  const categoriesQuery = useQuery({
    queryKey: ['mobile-sarpras-categories'],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: () => sarprasApi.listRoomCategories(),
  });

  const categories = categoriesQuery.data || [];
  const scopedCategories = useMemo(() => {
    if (inventoryScope === 'ALL') return categories;
    return categories.filter((category) => {
      const haystack = `${category.name || ''} ${category.description || ''}`.toUpperCase();
      if (inventoryScope === 'LAB') {
        return haystack.includes('LAB');
      }
      return haystack.includes('PERPUST') || haystack.includes('LIBRARY') || haystack.includes('PUSTAKA');
    });
  }, [categories, inventoryScope]);

  useEffect(() => {
    if (!scopedCategories.length) {
      setSelectedCategoryId(null);
      return;
    }
    if (!selectedCategoryId || !scopedCategories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(scopedCategories[0].id);
    }
  }, [scopedCategories, selectedCategoryId]);

  const roomsQuery = useQuery({
    queryKey: ['mobile-sarpras-rooms', selectedCategoryId],
    enabled: isAuthenticated && !!isAllowed && !!selectedCategoryId,
    queryFn: () => sarprasApi.listRooms({ categoryId: Number(selectedCategoryId) }),
  });

  const rooms = roomsQuery.data || [];

  useEffect(() => {
    if (!rooms.length) {
      setSelectedRoomId(null);
      return;
    }
    if (!selectedRoomId || !rooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  const inventoryQuery = useQuery({
    queryKey: ['mobile-sarpras-inventory', selectedRoomId],
    enabled: isAuthenticated && !!isAllowed && !!selectedRoomId,
    queryFn: () => sarprasApi.listInventoryByRoom(Number(selectedRoomId)),
  });

  const inventoryItems = inventoryQuery.data || [];
  const selectedCategory = scopedCategories.find((category) => category.id === selectedCategoryId) || null;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || null;
  const searchNormalized = search.trim().toLowerCase();

  const filteredRooms = useMemo(() => {
    if (!searchNormalized) return rooms;
    return rooms.filter((room) => {
      const haystacks = [room.name || '', room.location || '', room.description || ''];
      return haystacks.some((value) => value.toLowerCase().includes(searchNormalized));
    });
  }, [rooms, searchNormalized]);

  const filteredInventory = useMemo(() => {
    if (!searchNormalized) return inventoryItems;
    return inventoryItems.filter((item) => {
      const haystacks = [item.name || '', item.code || '', item.brand || '', item.source || ''];
      return haystacks.some((value) => value.toLowerCase().includes(searchNormalized));
    });
  }, [inventoryItems, searchNormalized]);

  const roomConditionSummary = useMemo(() => {
    let good = 0;
    let minor = 0;
    let major = 0;
    let empty = 0;
    for (const room of rooms) {
      const value = (room.condition || '').toUpperCase();
      if (value === 'BAIK') good += 1;
      else if (value === 'RUSAK_RINGAN') minor += 1;
      else if (value === 'RUSAK_BERAT') major += 1;
      else empty += 1;
    }
    return { good, minor, major, empty };
  }, [rooms]);

  const inventorySummary = useMemo(() => {
    let totalUnits = 0;
    let good = 0;
    let minor = 0;
    let major = 0;
    for (const item of inventoryItems) {
      totalUnits += Number(item.quantity || 0);
      good += Number(item.goodQty || 0);
      minor += Number(item.minorDamageQty || 0);
      major += Number(item.majorDamageQty || 0);
    }
    return {
      itemCount: inventoryItems.length,
      totalUnits,
      good,
      minor,
      major,
    };
  }, [inventoryItems]);

  const resetCategoryEditor = () => {
    setEditingCategoryId(null);
    setCategoryFormName('');
    setCategoryFormDescription('');
  };

  const resetRoomEditor = () => {
    setEditingRoomId(null);
    setRoomFormName('');
    setRoomFormLocation('');
    setRoomFormCapacity('');
    setRoomFormCondition('BAIK');
    setRoomFormDescription('');
  };

  const resetItemEditor = () => {
    setEditingItemId(null);
    setItemFormName('');
    setItemFormCode('');
    setItemFormBrand('');
    setItemFormGoodQty('');
    setItemFormMinorQty('');
    setItemFormMajorQty('');
    setItemFormPurchaseDate('');
    setItemFormPrice('');
    setItemFormSource('');
    setItemFormDescription('');
  };

  const saveCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!categoryFormName.trim()) throw new Error('Nama kategori wajib diisi.');
      if (editingCategoryId) {
        return sarprasApi.updateRoomCategory(editingCategoryId, {
          name: categoryFormName.trim(),
          description: categoryFormDescription.trim() || undefined,
        });
      }
      return sarprasApi.createRoomCategory({
        name: categoryFormName.trim(),
        description: categoryFormDescription.trim() || undefined,
      });
    },
    onSuccess: async (row) => {
      Alert.alert('Berhasil', editingCategoryId ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil ditambahkan.');
      resetCategoryEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-categories'] });
      if (row?.id) setSelectedCategoryId(row.id);
    },
    onError: (error: any) => {
      Alert.alert('Gagal', error?.response?.data?.message || error?.message || 'Tidak dapat menyimpan kategori.');
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => sarprasApi.removeRoomCategory(categoryId),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Kategori berhasil dihapus.');
      resetCategoryEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-categories'] });
    },
    onError: (error: any) => {
      Alert.alert('Gagal', error?.response?.data?.message || 'Tidak dapat menghapus kategori.');
    },
  });

  const saveRoomMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategoryId) throw new Error('Pilih kategori ruangan.');
      if (!roomFormName.trim()) throw new Error('Nama ruangan wajib diisi.');
      const capacity = roomFormCapacity.trim() ? parseNumberInput(roomFormCapacity) : undefined;

      const payload = {
        categoryId: selectedCategoryId,
        name: roomFormName.trim(),
        capacity: typeof capacity === 'number' && capacity >= 0 ? Math.round(capacity) : undefined,
        location: roomFormLocation.trim() || undefined,
        condition: roomFormCondition,
        description: roomFormDescription.trim() || undefined,
      };

      if (editingRoomId) {
        return sarprasApi.updateRoom(editingRoomId, payload);
      }
      return sarprasApi.createRoom(payload);
    },
    onSuccess: async (row) => {
      Alert.alert('Berhasil', editingRoomId ? 'Ruangan berhasil diperbarui.' : 'Ruangan berhasil ditambahkan.');
      resetRoomEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-categories'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-rooms'] });
      if (row?.id) setSelectedRoomId(row.id);
    },
    onError: (error: any) => {
      Alert.alert('Gagal', error?.response?.data?.message || error?.message || 'Tidak dapat menyimpan ruangan.');
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: number) => sarprasApi.removeRoom(roomId),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Ruangan berhasil dihapus.');
      resetRoomEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-categories'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-inventory'] });
    },
    onError: (error: any) => {
      Alert.alert('Gagal', error?.response?.data?.message || 'Tidak dapat menghapus ruangan.');
    },
  });

  const saveItemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRoomId) throw new Error('Pilih ruangan terlebih dahulu.');
      if (!itemFormName.trim()) throw new Error('Nama barang wajib diisi.');

      const goodQty = Math.max(0, Math.round(parseNumberInput(itemFormGoodQty)));
      const minorQty = Math.max(0, Math.round(parseNumberInput(itemFormMinorQty)));
      const majorQty = Math.max(0, Math.round(parseNumberInput(itemFormMajorQty)));
      const totalQty = goodQty + minorQty + majorQty;
      if (totalQty <= 0) throw new Error('Jumlah total barang tidak boleh 0.');

      let purchaseDateIso: string | undefined;
      if (itemFormPurchaseDate.trim()) {
        const parsedDate = new Date(`${itemFormPurchaseDate.trim()}T00:00:00.000Z`);
        if (Number.isNaN(parsedDate.getTime())) {
          throw new Error('Format tanggal pembelian harus YYYY-MM-DD.');
        }
        purchaseDateIso = parsedDate.toISOString();
      }

      const payload = {
        roomId: selectedRoomId,
        name: itemFormName.trim(),
        code: itemFormCode.trim() || undefined,
        brand: itemFormBrand.trim() || undefined,
        quantity: totalQty,
        goodQty,
        minorDamageQty: minorQty,
        majorDamageQty: majorQty,
        purchaseDate: purchaseDateIso,
        price: itemFormPrice.trim() ? Math.max(0, parseNumberInput(itemFormPrice)) : undefined,
        source: itemFormSource.trim() || undefined,
        description: itemFormDescription.trim() || undefined,
      };

      if (editingItemId) {
        return sarprasApi.updateInventory(editingItemId, payload);
      }
      return sarprasApi.createInventory(payload);
    },
    onSuccess: async () => {
      Alert.alert('Berhasil', editingItemId ? 'Item berhasil diperbarui.' : 'Item berhasil ditambahkan.');
      resetItemEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-inventory'] });
    },
    onError: (error: any) => {
      Alert.alert('Gagal', error?.response?.data?.message || error?.message || 'Tidak dapat menyimpan item inventaris.');
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => sarprasApi.removeInventory(itemId),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Item berhasil dihapus.');
      resetItemEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-inventory'] });
    },
    onError: (error: any) => {
      Alert.alert('Gagal', error?.response?.data?.message || 'Tidak dapat menghapus item inventaris.');
    },
  });

  const editCategory = (category: { id: number; name: string; description?: string | null }) => {
    setEditingCategoryId(category.id);
    setCategoryFormName(String(category.name || ''));
    setCategoryFormDescription(String(category.description || ''));
  };

  const askDeleteCategory = (category: { id: number; name: string }) => {
    Alert.alert('Hapus Kategori', `Hapus kategori "${category.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteCategoryMutation.mutate(category.id),
      },
    ]);
  };

  const editRoom = (room: SarprasRoom) => {
    setEditingRoomId(room.id);
    setRoomFormName(String(room.name || ''));
    setRoomFormLocation(String(room.location || ''));
    setRoomFormCapacity(room.capacity != null ? String(room.capacity) : '');
    const condition = String(room.condition || '').toUpperCase();
    setRoomFormCondition(
      condition === 'RUSAK_RINGAN' ? 'RUSAK_RINGAN' : condition === 'RUSAK_BERAT' ? 'RUSAK_BERAT' : 'BAIK',
    );
    setRoomFormDescription(String(room.description || ''));
  };

  const askDeleteRoom = (room: SarprasRoom) => {
    if (Number(room._count?.items || 0) > 0) {
      Alert.alert('Tidak Bisa Hapus', 'Ruangan tidak dapat dihapus karena masih memiliki item inventaris.');
      return;
    }
    Alert.alert('Hapus Ruangan', `Hapus ruangan "${room.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteRoomMutation.mutate(room.id),
      },
    ]);
  };

  const editItem = (item: SarprasInventoryItem) => {
    setEditingItemId(item.id);
    setItemFormName(String(item.name || ''));
    setItemFormCode(String(item.code || ''));
    setItemFormBrand(String(item.brand || ''));
    setItemFormGoodQty(String(item.goodQty || 0));
    setItemFormMinorQty(String(item.minorDamageQty || 0));
    setItemFormMajorQty(String(item.majorDamageQty || 0));
    setItemFormPurchaseDate(toInputDate(item.purchaseDate));
    setItemFormPrice(item.price != null ? String(item.price) : '');
    setItemFormSource(String(item.source || ''));
    setItemFormDescription(String(item.description || ''));
  };

  const askDeleteItem = (item: SarprasInventoryItem) => {
    Alert.alert('Hapus Item', `Hapus item "${item.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteItemMutation.mutate(item.id),
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul aset sekolah..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Aset Sekolah</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
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

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>{pageTitle}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Modul ini tersedia sesuai tugas tambahan Sarpras/Kepala Lab/Kepala Perpustakaan.
        </Text>
        <QueryStateView type="error" message="Anda tidak memiliki hak akses untuk modul ini." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={categoriesQuery.isFetching || roomsQuery.isFetching || inventoryQuery.isFetching}
          onRefresh={() => {
            void categoriesQuery.refetch();
            void roomsQuery.refetch();
            void inventoryQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>{pageTitle}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{pageSubtitle}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <SectionChip active={section === 'RINGKASAN'} label="Ringkasan" onPress={() => setSection('RINGKASAN')} />
        <SectionChip active={section === 'RUANGAN'} label="Ruangan" onPress={() => setSection('RUANGAN')} />
        <SectionChip active={section === 'INVENTARIS'} label="Inventaris" onPress={() => setSection('INVENTARIS')} />
      </View>

      {categoriesQuery.isLoading ? <QueryStateView type="loading" message="Memuat kategori ruangan..." /> : null}
      {categoriesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat kategori ruangan." onRetry={() => categoriesQuery.refetch()} />
      ) : null}

      {!categoriesQuery.isLoading && !categoriesQuery.isError ? (
        scopedCategories.length > 0 ? (
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Kategori Ruang</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {scopedCategories.map((category) => {
                  const selected = selectedCategoryId === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => setSelectedCategoryId(category.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {category.name}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 11 }}>
                        {formatNumber(Number(category._count?.rooms || 0))} ruang
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {canManageStructure && selectedCategory ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => editCategory(selectedCategory)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#93c5fd',
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: 'center',
                    backgroundColor: '#eff6ff',
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit Kategori</Text>
                </Pressable>
                <Pressable
                  onPress={() => askDeleteCategory(selectedCategory)}
                  disabled={deleteCategoryMutation.isPending}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#fca5a5',
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    opacity: deleteCategoryMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus Kategori</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#cbd5e1',
              borderRadius: 10,
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              {inventoryScope === 'ALL'
                ? 'Belum ada kategori ruangan tersedia.'
                : 'Kategori ruangan untuk filter ini belum tersedia.'}
            </Text>
          </View>
        )
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#fff',
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={getSearchPlaceholder(section)}
          placeholderTextColor="#8ea0bf"
          style={{
            flex: 1,
            paddingVertical: 11,
            paddingHorizontal: 9,
            color: BRAND_COLORS.textDark,
          }}
        />
      </View>

      {section === 'RUANGAN' && canManageStructure ? (
        <>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              {editingCategoryId ? 'Edit Kategori Ruang' : 'Tambah Kategori Ruang'}
            </Text>
            <TextInput
              value={categoryFormName}
              onChangeText={setCategoryFormName}
              placeholder="Nama kategori *"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 8,
              }}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              value={categoryFormDescription}
              onChangeText={setCategoryFormDescription}
              placeholder="Deskripsi kategori (opsional)"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 10,
              }}
              placeholderTextColor="#94a3b8"
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => saveCategoryMutation.mutate()}
                disabled={saveCategoryMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: BRAND_COLORS.blue,
                  opacity: saveCategoryMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {saveCategoryMutation.isPending ? 'Menyimpan...' : editingCategoryId ? 'Simpan Kategori' : 'Tambah Kategori'}
                </Text>
              </Pressable>
              {editingCategoryId ? (
                <Pressable
                  onPress={resetCategoryEditor}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              {editingRoomId ? 'Edit Ruangan' : `Tambah Ruangan${selectedCategory ? ` (${selectedCategory.name})` : ''}`}
            </Text>
            <TextInput
              value={roomFormName}
              onChangeText={setRoomFormName}
              placeholder="Nama ruangan *"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 8,
              }}
              placeholderTextColor="#94a3b8"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={roomFormLocation}
                onChangeText={setRoomFormLocation}
                placeholder="Lokasi"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
              />
              <TextInput
                value={roomFormCapacity}
                onChangeText={setRoomFormCapacity}
                placeholder="Kapasitas"
                keyboardType="numeric"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  color: '#0f172a',
                }}
                placeholderTextColor="#94a3b8"
              />
            </View>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Kondisi Ruang</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <SectionChip active={roomFormCondition === 'BAIK'} label="Baik" onPress={() => setRoomFormCondition('BAIK')} />
              <SectionChip
                active={roomFormCondition === 'RUSAK_RINGAN'}
                label="Rusak Ringan"
                onPress={() => setRoomFormCondition('RUSAK_RINGAN')}
              />
              <SectionChip
                active={roomFormCondition === 'RUSAK_BERAT'}
                label="Rusak Berat"
                onPress={() => setRoomFormCondition('RUSAK_BERAT')}
              />
            </View>
            <TextInput
              value={roomFormDescription}
              onChangeText={setRoomFormDescription}
              placeholder="Deskripsi ruangan (opsional)"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
                marginBottom: 10,
              }}
              placeholderTextColor="#94a3b8"
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => saveRoomMutation.mutate()}
                disabled={saveRoomMutation.isPending || !selectedCategoryId}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: BRAND_COLORS.blue,
                  opacity: saveRoomMutation.isPending || !selectedCategoryId ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {saveRoomMutation.isPending ? 'Menyimpan...' : editingRoomId ? 'Simpan Ruangan' : 'Tambah Ruangan'}
                </Text>
              </Pressable>
              {editingRoomId ? (
                <Pressable
                  onPress={resetRoomEditor}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </>
      ) : null}

      {section === 'INVENTARIS' && canManageItems && selectedRoom ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
            {editingItemId ? 'Edit Item Inventaris' : 'Tambah Item Inventaris'}
          </Text>
          <TextInput
            value={itemFormName}
            onChangeText={setItemFormName}
            placeholder="Nama barang *"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 10,
              color: '#0f172a',
              marginBottom: 8,
            }}
            placeholderTextColor="#94a3b8"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput
              value={itemFormCode}
              onChangeText={setItemFormCode}
              placeholder="Kode barang"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              value={itemFormBrand}
              onChangeText={setItemFormBrand}
              placeholder="Merek"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput
              value={itemFormGoodQty}
              onChangeText={setItemFormGoodQty}
              placeholder="Qty Baik"
              keyboardType="numeric"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              value={itemFormMinorQty}
              onChangeText={setItemFormMinorQty}
              placeholder="Qty Rusak Ringan"
              keyboardType="numeric"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              value={itemFormMajorQty}
              onChangeText={setItemFormMajorQty}
              placeholder="Qty Rusak Berat"
              keyboardType="numeric"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput
              value={itemFormPurchaseDate}
              onChangeText={setItemFormPurchaseDate}
              placeholder="Tanggal Beli (YYYY-MM-DD)"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              value={itemFormPrice}
              onChangeText={setItemFormPrice}
              placeholder="Harga"
              keyboardType="numeric"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <TextInput
            value={itemFormSource}
            onChangeText={setItemFormSource}
            placeholder="Sumber"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 10,
              color: '#0f172a',
              marginBottom: 8,
            }}
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            value={itemFormDescription}
            onChangeText={setItemFormDescription}
            placeholder="Keterangan"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 10,
              color: '#0f172a',
              marginBottom: 10,
            }}
            placeholderTextColor="#94a3b8"
            multiline
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => saveItemMutation.mutate()}
              disabled={saveItemMutation.isPending}
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: 'center',
                backgroundColor: BRAND_COLORS.blue,
                opacity: saveItemMutation.isPending ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveItemMutation.isPending ? 'Menyimpan...' : editingItemId ? 'Simpan Item' : 'Tambah Item'}
              </Text>
            </Pressable>
            {editingItemId ? (
              <Pressable
                onPress={resetItemEditor}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingVertical: 11,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {section === 'RINGKASAN' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <SummaryCard
              title="Kategori Aktif"
              value={formatNumber(scopedCategories.length)}
              subtitle="Total kategori ruang"
            />
            <SummaryCard
              title="Ruang pada Kategori"
              value={formatNumber(rooms.length)}
              subtitle={selectedCategory?.name || '-'}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <SummaryCard
              title="Jenis Item"
              value={formatNumber(inventorySummary.itemCount)}
              subtitle={selectedRoom?.name || 'Pilih ruangan'}
            />
            <SummaryCard
              title="Total Unit"
              value={formatNumber(inventorySummary.totalUnits)}
              subtitle="Jumlah keseluruhan unit"
            />
          </View>

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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Kondisi Ruangan</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {[
                { label: 'Baik', value: roomConditionSummary.good, bg: '#dcfce7', color: '#166534' },
                { label: 'Rusak Ringan', value: roomConditionSummary.minor, bg: '#fef3c7', color: '#92400e' },
                { label: 'Rusak Berat', value: roomConditionSummary.major, bg: '#fee2e2', color: '#991b1b' },
                { label: 'Belum diisi', value: roomConditionSummary.empty, bg: '#e2e8f0', color: '#334155' },
              ].map((segment) => (
                <View key={segment.label} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <View
                    style={{
                      borderRadius: 10,
                      backgroundColor: segment.bg,
                      paddingVertical: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: segment.color, fontWeight: '700', fontSize: 18 }}>
                      {formatNumber(segment.value)}
                    </Text>
                    <Text style={{ color: segment.color, fontSize: 12 }}>{segment.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Kondisi Inventaris Ruang Terpilih</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {[
                { label: 'Baik', value: inventorySummary.good, bg: '#dcfce7', color: '#166534' },
                { label: 'Rusak Ringan', value: inventorySummary.minor, bg: '#fef3c7', color: '#92400e' },
                { label: 'Rusak Berat', value: inventorySummary.major, bg: '#fee2e2', color: '#991b1b' },
                { label: 'Total Unit', value: inventorySummary.totalUnits, bg: '#dbeafe', color: '#1d4ed8' },
              ].map((segment) => (
                <View key={segment.label} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <View
                    style={{
                      borderRadius: 10,
                      backgroundColor: segment.bg,
                      paddingVertical: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: segment.color, fontWeight: '700', fontSize: 18 }}>
                      {formatNumber(segment.value)}
                    </Text>
                    <Text style={{ color: segment.color, fontSize: 12 }}>{segment.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {section === 'RUANGAN' ? (
        <>
          {roomsQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar ruangan..." /> : null}
          {roomsQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat daftar ruangan." onRetry={() => roomsQuery.refetch()} />
          ) : null}

          {!roomsQuery.isLoading && !roomsQuery.isError ? (
            filteredRooms.length > 0 ? (
              filteredRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  selected={room.id === selectedRoomId}
                  canManageStructure={canManageStructure}
                  onEdit={editRoom}
                  onDelete={askDeleteRoom}
                  deletePending={deleteRoomMutation.isPending}
                  onPress={() => {
                    setSelectedRoomId(room.id);
                    setSection('INVENTARIS');
                  }}
                />
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  backgroundColor: '#fff',
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Tidak ada ruangan yang cocok dengan pencarian pada kategori ini.
                </Text>
              </View>
            )
          ) : null}
        </>
      ) : null}

      {section === 'INVENTARIS' ? (
        <>
          {selectedRoom ? (
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>{selectedRoom.name}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                {selectedCategory?.name || '-'} • {selectedRoom.location || '-'}
              </Text>
              <View style={{ marginTop: 6 }}>
                <ConditionBadge condition={selectedRoom.condition} />
              </View>
            </View>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#cbd5e1',
                borderRadius: 10,
                backgroundColor: '#fff',
                padding: 14,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted }}>Pilih ruangan terlebih dahulu dari tab Ruangan.</Text>
            </View>
          )}

          {selectedRoom ? (
            <>
              {inventoryQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar inventaris..." /> : null}
              {inventoryQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat daftar inventaris ruangan."
                  onRetry={() => inventoryQuery.refetch()}
                />
              ) : null}

              {!inventoryQuery.isLoading && !inventoryQuery.isError ? (
                filteredInventory.length > 0 ? (
                  filteredInventory.map((item) => (
                    <InventoryCard
                      key={item.id}
                      item={item}
                      canManageItems={canManageItems}
                      onEdit={editItem}
                      onDelete={askDeleteItem}
                      deletePending={deleteItemMutation.isPending}
                    />
                  ))
                ) : (
                  <View
                    style={{
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      backgroundColor: '#fff',
                      padding: 14,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted }}>
                      Tidak ada item inventaris yang cocok untuk pencarian ini.
                    </Text>
                  </View>
                )
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

    </ScrollView>
  );
}
