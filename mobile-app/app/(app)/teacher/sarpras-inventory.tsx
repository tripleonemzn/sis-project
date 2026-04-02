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
import { MobileTabChip } from '../../../src/components/MobileTabChip';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { sarprasApi } from '../../../src/features/sarpras/sarprasApi';
import {
  SarprasInventoryItem,
  SarprasLibraryBookLoan,
  SarprasLibraryBorrowerStatus,
  SarprasLibraryClassOption,
  SarprasLibraryLoanDisplayStatus,
  SarprasLibraryLoanSettings,
  SarprasRoom,
} from '../../../src/features/sarpras/types';
import {
  INVENTORY_TEMPLATE_OPTIONS,
  getInventoryTemplateProfile,
  resolveInventoryTemplateKey,
  type InventoryAttributeField,
  type InventoryTemplateKey,
  type InventoryTemplateProfile,
} from '../../../src/features/sarpras/inventoryTemplateProfiles';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type SarprasSection = 'RINGKASAN' | 'RUANGAN' | 'INVENTARIS' | 'PEMINJAMAN';
type InventoryScope = 'ALL' | 'LAB' | 'LIBRARY';
type InventoryAttributeMap = Record<string, string | number>;

function parseBooleanParam(value?: string | string[] | null) {
  const normalized = String(Array.isArray(value) ? value[0] : value || '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(normalized);
}

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

function resolveApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as { response?: { data?: { message?: string } }; message?: string };
  return apiError?.response?.data?.message || apiError?.message || fallback;
}

function toInputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function todayDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(
    2,
    '0',
  )}`;
}

function formatDateLabel(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function resolveBorrowerStatusLabel(status: SarprasLibraryBorrowerStatus) {
  return status === 'STUDENT' ? 'Siswa' : 'Guru';
}

function resolveClassLabel(
  row:
    | {
        name: string;
        major?: { code?: string | null; name?: string | null } | null;
      }
    | null
    | undefined,
) {
  if (!row) return '-';
  return row.name;
}

type LibraryLoanStatusCode = SarprasLibraryLoanDisplayStatus;
type LibraryLoanStatusMeta = {
  code: LibraryLoanStatusCode;
  label: string;
  overdueDays: number;
  fineAmount: number;
  finePerDay: number;
};

function getLibraryLoanStatusMeta(loan: SarprasLibraryBookLoan, finePerDay = 1000): LibraryLoanStatusMeta {
  const safeFinePerDay = Math.max(0, Math.trunc(finePerDay || 0));
  if (loan.returnStatus === 'RETURNED') {
    return {
      code: 'RETURNED',
      label: 'Dikembalikan',
      overdueDays: 0,
      fineAmount: 0,
      finePerDay: safeFinePerDay,
    };
  }

  if (loan.returnDate) {
    const dueDate = new Date(loan.returnDate);
    const now = new Date();
    const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!Number.isNaN(dueDateStart.getTime()) && todayStart > dueDateStart) {
      const diffDays = Math.max(1, Math.floor((todayStart.getTime() - dueDateStart.getTime()) / 86400000));
      return {
        code: 'OVERDUE',
        label: `Terlambat ${diffDays} hari`,
        overdueDays: diffDays,
        fineAmount: diffDays * safeFinePerDay,
        finePerDay: safeFinePerDay,
      };
    }
  }

  return {
    code: 'BORROWED',
    label: 'Dipinjam',
    overdueDays: 0,
    fineAmount: 0,
    finePerDay: safeFinePerDay,
  };
}

function resolveLibraryCategoryName(item: SarprasInventoryItem) {
  const attrs = normalizeItemAttributes(item);
  const raw = attrs.category ?? attrs.shelfCode;
  return String(raw || '').trim();
}

function normalizeItemAttributes(item?: SarprasInventoryItem | null): InventoryAttributeMap {
  if (!item?.attributes || typeof item.attributes !== 'object' || Array.isArray(item.attributes)) {
    return {};
  }
  const entries = Object.entries(item.attributes as Record<string, unknown>);
  const next: InventoryAttributeMap = {};
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' || typeof value === 'string') {
      next[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      next[key] = value ? 'Ya' : 'Tidak';
      continue;
    }
  }
  return next;
}

const SectionChip = MobileTabChip;

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

function ReturnStatusBadge({ status }: { status: LibraryLoanStatusCode }) {
  const isReturned = status === 'RETURNED';
  const isOverdue = status === 'OVERDUE';
  const borderColor = isReturned ? '#86efac' : isOverdue ? '#fca5a5' : '#fdba74';
  const backgroundColor = isReturned ? '#dcfce7' : isOverdue ? '#fee2e2' : '#ffedd5';
  const textColor = isReturned ? '#166534' : isOverdue ? '#b91c1c' : '#9a3412';
  const label = isReturned ? 'Dikembalikan' : isOverdue ? 'Terlambat' : 'Dipinjam';
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor,
        backgroundColor,
      }}
    >
      <Text style={{ color: textColor, fontWeight: '700', fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function getSearchPlaceholder(section: SarprasSection) {
  if (section === 'PEMINJAMAN') return 'Cari peminjam, judul buku, atau nomor telepon';
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
  templateProfile,
  canManageItems,
  onEdit,
  onDelete,
  deletePending,
}: {
  item: SarprasInventoryItem;
  templateProfile: InventoryTemplateProfile;
  canManageItems: boolean;
  onEdit: (item: SarprasInventoryItem) => void;
  onDelete: (item: SarprasInventoryItem) => void;
  deletePending: boolean;
}) {
  const minor = Number(item.minorDamageQty || 0);
  const major = Number(item.majorDamageQty || 0);
  const good = Number(item.goodQty || 0);
  const total = Number(item.quantity || 0);
  const attributes = normalizeItemAttributes(item);
  const tableAttributeFields = templateProfile.attributeFields.filter((field) => field.table);
  const codeBrandChunks = [
    templateProfile.showCode ? `${templateProfile.codeLabel}: ${item.code || '-'}` : null,
    templateProfile.showBrand ? `${templateProfile.brandLabel}: ${item.brand || '-'}` : null,
  ].filter(Boolean);
  const unitsLabel = templateProfile.key === 'LIBRARY' ? 'eks' : 'unit';

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
          {codeBrandChunks.length ? (
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>{codeBrandChunks.join(' • ')}</Text>
          ) : null}
        </View>
        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 16 }}>
          {formatNumber(total)} {unitsLabel}
        </Text>
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

      {tableAttributeFields.length ? (
        <View style={{ marginTop: 8 }}>
          {tableAttributeFields.map((field) => {
            const raw = attributes[field.key];
            const value = raw === null || raw === undefined || raw === '' ? '-' : String(raw);
            return (
              <Text key={`${item.id}-${field.key}`} style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                {field.label}: {value}
              </Text>
            );
          })}
        </View>
      ) : null}

      {templateProfile.showPurchaseInfo ? (
        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
          Sumber: {item.source || '-'} • Harga: {item.price ? formatCurrency(item.price) : '-'}
        </Text>
      ) : null}

      {item.description ? (
        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
          {templateProfile.descriptionLabel}: {item.description}
        </Text>
      ) : null}

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
  const params = useLocalSearchParams<{
    scope?: string | string[];
    managedOnly?: string | string[];
    roomId?: string | string[];
    title?: string | string[];
    subtitle?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const inventoryScope = parseScope(params.scope);
  const managedOnly = parseBooleanParam(params.managedOnly);
  const requestedRoomId = useMemo(() => {
    const raw = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
    const parsed = Number.parseInt(String(raw || '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [params.roomId]);
  const titleOverride = useMemo(
    () => String(Array.isArray(params.title) ? params.title[0] : params.title || '').trim(),
    [params.title],
  );
  const subtitleOverride = useMemo(
    () => String(Array.isArray(params.subtitle) ? params.subtitle[0] : params.subtitle || '').trim(),
    [params.subtitle],
  );
  const pageTitle = titleOverride
    || (inventoryScope === 'LAB'
      ? 'Inventaris Lab'
      : inventoryScope === 'LIBRARY'
        ? 'Inventaris Perpustakaan'
        : managedOnly
          ? 'Inventaris Tugas'
          : 'Aset Sekolah');
  const pageSubtitle = subtitleOverride
    || (inventoryScope === 'LAB'
      ? 'Kelola data ruang dan inventaris laboratorium.'
      : inventoryScope === 'LIBRARY'
        ? 'Kelola data ruang dan inventaris perpustakaan.'
        : managedOnly
          ? 'Kelola inventaris ruangan yang ditugaskan kepada Anda.'
          : 'Kelola data ruang dan inventaris sarana prasarana sekolah.');

  const [section, setSection] = useState<SarprasSection>('RINGKASAN');
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryFormName, setCategoryFormName] = useState('');
  const [categoryFormDescription, setCategoryFormDescription] = useState('');
  const [categoryFormTemplateKey, setCategoryFormTemplateKey] = useState<InventoryTemplateKey>('STANDARD');
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
  const [itemFormAttributes, setItemFormAttributes] = useState<Record<string, string>>({});
  const [editingLoanId, setEditingLoanId] = useState<number | null>(null);
  const [loanBorrowDate, setLoanBorrowDate] = useState(todayDateInput());
  const [loanBorrowerName, setLoanBorrowerName] = useState('');
  const [loanBorrowerStatus, setLoanBorrowerStatus] = useState<SarprasLibraryBorrowerStatus>('STUDENT');
  const [loanClassId, setLoanClassId] = useState<number | null>(null);
  const [loanBookTitle, setLoanBookTitle] = useState('');
  const [loanPublishYear, setLoanPublishYear] = useState('');
  const [loanReturnDate, setLoanReturnDate] = useState('');
  const [loanPhoneNumber, setLoanPhoneNumber] = useState('');
  const [loanFinePerDayInput, setLoanFinePerDayInput] = useState('1000');

  const normalizedDuties = useMemo(
    () => (user?.additionalDuties || []).map((item) => item.trim().toUpperCase()),
    [user?.additionalDuties],
  );
  const managedInventoryRooms = user?.managedInventoryRooms;
  const managedInventoryRoomIds = useMemo(
    () =>
      Array.isArray(managedInventoryRooms)
        ? managedInventoryRooms
            .map((room) => Number(room.id))
            .filter((roomId) => Number.isFinite(roomId) && roomId > 0)
        : [],
    [managedInventoryRooms],
  );
  const isManagedRoomContext = managedOnly && (user?.role === 'PRINCIPAL' || user?.role === 'TEACHER');

  useEffect(() => {
    if (inventoryScope !== 'LIBRARY' && section === 'PEMINJAMAN') {
      const timerId = setTimeout(() => setSection('RINGKASAN'), 0);
      return () => clearTimeout(timerId);
    }
  }, [inventoryScope, section]);

  useEffect(() => {
    if (!managedOnly) return;
    const targetSection = requestedRoomId ? 'INVENTARIS' : 'RUANGAN';
    if (section === targetSection) return;
    const timerId = setTimeout(() => setSection(targetSection), 0);
    return () => clearTimeout(timerId);
  }, [managedOnly, requestedRoomId, section]);

  const isAllowed =
    (user?.role === 'TEACHER' && hasSarprasDuty(user?.additionalDuties, inventoryScope))
    || (isManagedRoomContext && managedInventoryRoomIds.length > 0);
  const canManageStructure =
    !isManagedRoomContext
    && (user?.role === 'ADMIN'
      || normalizedDuties.includes('WAKASEK_SARPRAS')
      || normalizedDuties.includes('SEKRETARIS_SARPRAS'));
  const canManageItems =
    (isManagedRoomContext && !!selectedRoomId && managedInventoryRoomIds.includes(selectedRoomId))
    || canManageStructure
    || (inventoryScope === 'LAB' && normalizedDuties.includes('KEPALA_LAB'))
    || (inventoryScope === 'LIBRARY' && normalizedDuties.includes('KEPALA_PERPUSTAKAAN'));
  const canManageLibraryLoans = inventoryScope === 'LIBRARY' && canManageItems;

  const categoriesQuery = useQuery({
    queryKey: ['mobile-sarpras-categories'],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: () => sarprasApi.listRoomCategories(),
  });
  const managedRoomsQuery = useQuery({
    queryKey: ['mobile-sarpras-managed-rooms', managedInventoryRoomIds.join(',')],
    enabled: isAuthenticated && !!isAllowed && isManagedRoomContext,
    queryFn: () => sarprasApi.listRooms(),
  });

  const categories = useMemo(() => categoriesQuery.data || [], [categoriesQuery.data]);
  const managedRooms = useMemo(() => {
    const items = managedRoomsQuery.data || [];
    if (!isManagedRoomContext) return [];
    return items.filter((room) => managedInventoryRoomIds.includes(room.id));
  }, [isManagedRoomContext, managedInventoryRoomIds, managedRoomsQuery.data]);
  const scopedCategories = useMemo(() => {
    const categoryPool = categories.filter((category) => {
      if (!isManagedRoomContext) return true;
      return managedRooms.some((room) => room.categoryId === category.id);
    });
    if (inventoryScope === 'ALL') return categoryPool;
    return categoryPool.filter((category) => {
      const haystack = `${category.name || ''} ${category.description || ''}`.toUpperCase();
      if (inventoryScope === 'LAB') {
        return haystack.includes('LAB');
      }
        return haystack.includes('PERPUST') || haystack.includes('LIBRARY') || haystack.includes('PUSTAKA');
    });
  }, [categories, inventoryScope, isManagedRoomContext, managedRooms]);
  const requestedRoomCategoryId = useMemo(() => {
    if (!requestedRoomId) return null;
    return managedRooms.find((room) => room.id === requestedRoomId)?.categoryId || null;
  }, [managedRooms, requestedRoomId]);

  useEffect(() => {
    if (!scopedCategories.length) {
      const timerId = setTimeout(() => setSelectedCategoryId(null), 0);
      return () => clearTimeout(timerId);
    }
    const preferredCategoryId =
      requestedRoomCategoryId && scopedCategories.some((category) => category.id === requestedRoomCategoryId)
        ? requestedRoomCategoryId
        : scopedCategories[0].id;
    if (!selectedCategoryId || !scopedCategories.some((category) => category.id === selectedCategoryId)) {
      const timerId = setTimeout(() => setSelectedCategoryId(preferredCategoryId), 0);
      return () => clearTimeout(timerId);
    }
  }, [requestedRoomCategoryId, scopedCategories, selectedCategoryId]);

  const roomsQuery = useQuery({
    queryKey: ['mobile-sarpras-rooms', selectedCategoryId],
    enabled: isAuthenticated && !!isAllowed && !!selectedCategoryId && !isManagedRoomContext,
    queryFn: () => sarprasApi.listRooms({ categoryId: Number(selectedCategoryId) }),
  });

  const rooms = useMemo(() => {
    if (isManagedRoomContext) {
      return managedRooms.filter((room) => (!selectedCategoryId ? true : room.categoryId === selectedCategoryId));
    }
    return roomsQuery.data || [];
  }, [isManagedRoomContext, managedRooms, roomsQuery.data, selectedCategoryId]);

  useEffect(() => {
    if (!rooms.length) {
      const timerId = setTimeout(() => setSelectedRoomId(null), 0);
      return () => clearTimeout(timerId);
    }
    const preferredRoomId =
      requestedRoomId && rooms.some((room) => room.id === requestedRoomId) ? requestedRoomId : rooms[0].id;
    if (!selectedRoomId || !rooms.some((room) => room.id === selectedRoomId)) {
      const timerId = setTimeout(() => setSelectedRoomId(preferredRoomId), 0);
      return () => clearTimeout(timerId);
    }
  }, [requestedRoomId, rooms, selectedRoomId]);

  const inventoryQuery = useQuery({
    queryKey: ['mobile-sarpras-inventory', selectedRoomId],
    enabled: isAuthenticated && !!isAllowed && !!selectedRoomId,
    queryFn: () => sarprasApi.listInventoryByRoom(Number(selectedRoomId)),
  });

  const libraryLoanClassesQuery = useQuery({
    queryKey: ['mobile-sarpras-library-loan-classes'],
    enabled: isAuthenticated && !!isAllowed && inventoryScope === 'LIBRARY',
    queryFn: () => sarprasApi.listLibraryLoanClassOptions(),
  });

  const libraryLoansQuery = useQuery({
    queryKey: ['mobile-sarpras-library-loans'],
    enabled: isAuthenticated && !!isAllowed && inventoryScope === 'LIBRARY',
    queryFn: () => sarprasApi.listLibraryBookLoans(),
  });
  const libraryLoanSettingsQuery = useQuery({
    queryKey: ['mobile-sarpras-library-loan-settings'],
    enabled: isAuthenticated && !!isAllowed && inventoryScope === 'LIBRARY',
    queryFn: () => sarprasApi.getLibraryLoanSettings(),
  });

  const inventoryItems = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const libraryLoanClassOptions = useMemo(() => libraryLoanClassesQuery.data || [], [libraryLoanClassesQuery.data]);
  const libraryLoans = useMemo(() => libraryLoansQuery.data || [], [libraryLoansQuery.data]);
  const libraryLoanSettings = (libraryLoanSettingsQuery.data || { finePerDay: 1000 }) as SarprasLibraryLoanSettings;
  const libraryLoanFinePerDay = Math.max(0, Number(libraryLoanSettings?.finePerDay || 1000));
  const selectedCategory = scopedCategories.find((category) => category.id === selectedCategoryId) || null;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || null;
  const selectedTemplateKey = useMemo(
    () =>
      resolveInventoryTemplateKey({
        templateKey: selectedCategory?.inventoryTemplateKey,
        categoryName: selectedCategory?.name,
      }),
    [selectedCategory?.inventoryTemplateKey, selectedCategory?.name],
  );
  const selectedTemplateProfile = useMemo(
    () => getInventoryTemplateProfile(selectedTemplateKey),
    [selectedTemplateKey],
  );
  const searchNormalized = search.trim().toLowerCase();

  useEffect(() => {
    if (inventoryScope !== 'LIBRARY') return;
    const timerId = setTimeout(() => setLoanFinePerDayInput(String(libraryLoanFinePerDay)), 0);
    return () => clearTimeout(timerId);
  }, [inventoryScope, libraryLoanFinePerDay]);

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
      const dynamicValues = Object.values(normalizeItemAttributes(item)).map((value) => String(value));
      const haystacks = [item.name || '', item.code || '', item.brand || '', item.source || '', ...dynamicValues];
      return haystacks.some((value) => value.toLowerCase().includes(searchNormalized));
    });
  }, [inventoryItems, searchNormalized]);

  const libraryLoanRows = useMemo(
    () =>
      libraryLoans.map((loan) => ({
        loan,
        status: getLibraryLoanStatusMeta(loan, libraryLoanFinePerDay),
      })),
    [libraryLoans, libraryLoanFinePerDay],
  );

  const filteredLibraryLoans = useMemo(() => {
    if (!searchNormalized) return libraryLoanRows;
    return libraryLoanRows.filter(({ loan, status }) => {
      const classLabel = resolveClassLabel(loan.class);
      const haystacks = [
        loan.borrowerName || '',
        loan.bookTitle || '',
        loan.phoneNumber || '',
        classLabel,
        resolveBorrowerStatusLabel(loan.borrowerStatus),
        status.label,
      ];
      return haystacks.some((value) => String(value).toLowerCase().includes(searchNormalized));
    });
  }, [libraryLoanRows, searchNormalized]);

  const libraryBookCategories = useMemo(() => {
    if (selectedTemplateProfile.key !== 'LIBRARY') return [];
    const values = new Set<string>();
    for (const item of inventoryItems) {
      const value = resolveLibraryCategoryName(item);
      if (!value) continue;
      values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'id-ID'));
  }, [inventoryItems, selectedTemplateProfile.key]);

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

  const loanSummary = useMemo(() => {
    let returned = 0;
    let notReturned = 0;
    let teacher = 0;
    let student = 0;
    for (const loan of libraryLoans) {
      if (loan.returnStatus === 'RETURNED') returned += 1;
      else notReturned += 1;
      if (loan.borrowerStatus === 'TEACHER') teacher += 1;
      else student += 1;
    }
    return {
      total: libraryLoans.length,
      returned,
      notReturned,
      teacher,
      student,
    };
  }, [libraryLoans]);

  const resetCategoryEditor = () => {
    setEditingCategoryId(null);
    setCategoryFormName('');
    setCategoryFormDescription('');
    setCategoryFormTemplateKey('STANDARD');
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
    setItemFormAttributes({});
  };

  const resetLoanEditor = () => {
    setEditingLoanId(null);
    setLoanBorrowDate(todayDateInput());
    setLoanBorrowerName('');
    setLoanBorrowerStatus('STUDENT');
    setLoanClassId(null);
    setLoanBookTitle('');
    setLoanPublishYear('');
    setLoanReturnDate('');
    setLoanPhoneNumber('');
  };

  const saveCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!categoryFormName.trim()) throw new Error('Nama kategori wajib diisi.');
      if (editingCategoryId) {
        return sarprasApi.updateRoomCategory(editingCategoryId, {
          name: categoryFormName.trim(),
          description: categoryFormDescription.trim() || undefined,
          inventoryTemplateKey: categoryFormTemplateKey,
        });
      }
      return sarprasApi.createRoomCategory({
        name: categoryFormName.trim(),
        description: categoryFormDescription.trim() || undefined,
        inventoryTemplateKey: categoryFormTemplateKey,
      });
    },
    onSuccess: async (row) => {
      Alert.alert('Berhasil', editingCategoryId ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil ditambahkan.');
      resetCategoryEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-categories'] });
      if (row?.id) setSelectedCategoryId(row.id);
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menyimpan kategori.'));
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => sarprasApi.removeRoomCategory(categoryId),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Kategori berhasil dihapus.');
      resetCategoryEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-categories'] });
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menghapus kategori.'));
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
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menyimpan ruangan.'));
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
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menghapus ruangan.'));
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

      for (const field of selectedTemplateProfile.attributeFields) {
        if (!field.required) continue;
        const value = String(itemFormAttributes[field.key] || '').trim();
        if (!value) {
          throw new Error(`${field.label} wajib diisi.`);
        }
      }

      const cleanedAttributes = Object.entries(itemFormAttributes).reduce<Record<string, string | number>>(
        (acc, [key, value]) => {
          const trimmed = String(value || '').trim();
          if (!trimmed) return acc;
          const field = selectedTemplateProfile.attributeFields.find((item) => item.key === key);
          if (field?.type === 'number') {
            const asNumber = Number(trimmed);
            acc[key] = Number.isFinite(asNumber) ? asNumber : trimmed;
            return acc;
          }
          acc[key] = trimmed;
          return acc;
        },
        {},
      );

      const payload = {
        roomId: selectedRoomId,
        name: itemFormName.trim(),
        code: selectedTemplateProfile.showCode ? itemFormCode.trim() || undefined : undefined,
        brand: selectedTemplateProfile.showBrand ? itemFormBrand.trim() || undefined : undefined,
        quantity: totalQty,
        goodQty,
        minorDamageQty: minorQty,
        majorDamageQty: majorQty,
        purchaseDate: selectedTemplateProfile.showPurchaseInfo ? purchaseDateIso : undefined,
        price: selectedTemplateProfile.showPurchaseInfo
          ? itemFormPrice.trim()
            ? Math.max(0, parseNumberInput(itemFormPrice))
            : undefined
          : undefined,
        source: selectedTemplateProfile.showPurchaseInfo ? itemFormSource.trim() || undefined : undefined,
        description: itemFormDescription.trim() || undefined,
        attributes: cleanedAttributes,
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
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menyimpan item inventaris.'));
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
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menghapus item inventaris.'));
    },
  });

  const saveLibraryLoanMutation = useMutation({
    mutationFn: async () => {
      if (inventoryScope !== 'LIBRARY') {
        throw new Error('Menu peminjaman buku hanya tersedia untuk perpustakaan.');
      }
      if (!loanBorrowDate.trim()) throw new Error('Tanggal pinjam wajib diisi.');
      if (!loanBorrowerName.trim()) throw new Error('Nama peminjam wajib diisi.');
      if (!loanBookTitle.trim()) throw new Error('Judul buku wajib diisi.');
      if (loanBorrowerStatus === 'STUDENT' && !loanClassId) {
        throw new Error('Pilih kelas untuk peminjam siswa.');
      }
      if (loanReturnDate.trim()) {
        const parsed = new Date(`${loanReturnDate.trim()}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error('Format tanggal pengembalian harus YYYY-MM-DD.');
        }
      }
      let publishYear: number | undefined;
      if (loanPublishYear.trim()) {
        const parsedYear = Number(loanPublishYear.trim());
        if (!Number.isFinite(parsedYear)) {
          throw new Error('Tahun terbit harus berupa angka.');
        }
        publishYear = Math.max(1900, Math.min(2100, Math.round(parsedYear)));
      }

      const payload = {
        borrowDate: loanBorrowDate.trim(),
        borrowerName: loanBorrowerName.trim(),
        borrowerStatus: loanBorrowerStatus,
        classId: loanBorrowerStatus === 'STUDENT' ? loanClassId : null,
        bookTitle: loanBookTitle.trim(),
        publishYear,
        returnDate: loanReturnDate.trim() || null,
        phoneNumber: loanPhoneNumber.trim() || undefined,
      };

      if (editingLoanId) {
        const currentLoan = libraryLoans.find((loan) => loan.id === editingLoanId);
        return sarprasApi.updateLibraryBookLoan(editingLoanId, {
          ...payload,
          returnStatus: currentLoan?.returnStatus || 'NOT_RETURNED',
        });
      }
      return sarprasApi.createLibraryBookLoan(payload);
    },
    onSuccess: async () => {
      Alert.alert(
        'Berhasil',
        editingLoanId ? 'Data peminjaman buku berhasil diperbarui.' : 'Data peminjaman buku berhasil ditambahkan.',
      );
      resetLoanEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-library-loans'] });
    },
    onError: (error: unknown) => {
      Alert.alert(
        'Gagal',
        resolveApiErrorMessage(error, 'Tidak dapat menyimpan data peminjaman buku.'),
      );
    },
  });

  const saveLibraryLoanSettingsMutation = useMutation({
    mutationFn: async () => {
      const parsed = Number(loanFinePerDayInput);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Tarif denda per hari harus angka 0 atau lebih.');
      }
      return sarprasApi.updateLibraryLoanSettings({
        finePerDay: Math.trunc(parsed),
      });
    },
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Tarif denda keterlambatan berhasil diperbarui.');
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-library-loan-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-library-loans'] });
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Gagal memperbarui tarif denda.'));
    },
  });

  const deleteLibraryLoanMutation = useMutation({
    mutationFn: async (loanId: number) => sarprasApi.removeLibraryBookLoan(loanId),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Data peminjaman buku berhasil dihapus.');
      resetLoanEditor();
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-library-loans'] });
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menghapus data peminjaman buku.'));
    },
  });

  const markLibraryLoanReturnedMutation = useMutation({
    mutationFn: async (loan: SarprasLibraryBookLoan) =>
      sarprasApi.updateLibraryBookLoan(loan.id, {
        returnStatus: 'RETURNED',
        returnDate: loan.returnDate || todayDateInput(),
      }),
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Status pengembalian diperbarui menjadi Dikembalikan.');
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-library-loans'] });
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat memperbarui status pengembalian.'));
    },
  });

  const deleteLibraryCategoryMutation = useMutation({
    mutationFn: async (categoryName: string) => {
      if (!selectedRoomId) throw new Error('Pilih ruangan terlebih dahulu.');
      const target = String(categoryName || '').trim().toLowerCase();
      if (!target) throw new Error('Kategori tidak valid.');

      const targetItems = inventoryItems.filter((item) => {
        const value = resolveLibraryCategoryName(item);
        return value.trim().toLowerCase() === target;
      });
      if (!targetItems.length) {
        throw new Error('Kategori tidak ditemukan pada item inventaris ruangan ini.');
      }

      await Promise.all(
        targetItems.map((item) => {
          const attrs = normalizeItemAttributes(item);
          const nextAttrs: Record<string, string | number> = { ...attrs };
          if (String(nextAttrs.category || '').trim().toLowerCase() === target) {
            delete nextAttrs.category;
          }
          if (String(nextAttrs.shelfCode || '').trim().toLowerCase() === target) {
            delete nextAttrs.shelfCode;
          }
          return sarprasApi.updateInventory(item.id, { attributes: nextAttrs });
        }),
      );
    },
    onSuccess: async () => {
      Alert.alert('Berhasil', 'Kategori buku berhasil dihapus dari inventaris.');
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-sarpras-rooms'] });
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', resolveApiErrorMessage(error, 'Tidak dapat menghapus kategori buku.'));
    },
  });

  const editCategory = (category: {
    id: number;
    name: string;
    description?: string | null;
    inventoryTemplateKey?: string | null;
  }) => {
    setEditingCategoryId(category.id);
    setCategoryFormName(String(category.name || ''));
    setCategoryFormDescription(String(category.description || ''));
    setCategoryFormTemplateKey(
      resolveInventoryTemplateKey({
        templateKey: category.inventoryTemplateKey,
        categoryName: category.name,
      }),
    );
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
    const attrs = normalizeItemAttributes(item);
    const mapped: Record<string, string> = {};
    for (const field of selectedTemplateProfile.attributeFields) {
      const value = attrs[field.key];
      if (value !== undefined && value !== null) {
        mapped[field.key] = String(value);
      }
    }
    if (selectedTemplateProfile.key === 'LIBRARY' && !mapped.author && item.brand) {
      mapped.author = String(item.brand);
    }
    if (selectedTemplateProfile.key === 'LIBRARY' && !mapped.category && attrs.shelfCode) {
      mapped.category = String(attrs.shelfCode);
    }
    setItemFormAttributes(mapped);
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

  const editLibraryLoan = (loan: SarprasLibraryBookLoan) => {
    setEditingLoanId(loan.id);
    setLoanBorrowDate(toInputDate(loan.borrowDate) || todayDateInput());
    setLoanBorrowerName(String(loan.borrowerName || ''));
    setLoanBorrowerStatus(loan.borrowerStatus);
    setLoanClassId(loan.classId || null);
    setLoanBookTitle(String(loan.bookTitle || ''));
    setLoanPublishYear(loan.publishYear ? String(loan.publishYear) : '');
    setLoanReturnDate(toInputDate(loan.returnDate) || '');
    setLoanPhoneNumber(String(loan.phoneNumber || ''));
  };

  const askDeleteLibraryLoan = (loan: SarprasLibraryBookLoan) => {
    Alert.alert('Hapus Peminjaman Buku', `Hapus data "${loan.borrowerName}" untuk buku "${loan.bookTitle}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteLibraryLoanMutation.mutate(loan.id),
      },
    ]);
  };

  const askMarkLibraryLoanReturned = (loan: SarprasLibraryBookLoan) => {
    if (loan.returnStatus === 'RETURNED') return;
    Alert.alert(
      'Tandai Dikembalikan',
      `Tandai buku "${loan.bookTitle}" milik ${loan.borrowerName} sebagai sudah dikembalikan?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya',
          onPress: () => markLibraryLoanReturnedMutation.mutate(loan),
        },
      ],
    );
  };

  const askDeleteLibraryCategory = (categoryName: string) => {
    Alert.alert(
      'Hapus Kategori Buku',
      `Hapus kategori "${categoryName}" dari semua item inventaris pada ruangan ini?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => deleteLibraryCategoryMutation.mutate(categoryName),
        },
      ],
    );
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul aset sekolah..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!(user?.role === 'TEACHER' || isManagedRoomContext)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Aset Sekolah</Text>
        <QueryStateView type="error" message="Halaman ini tidak tersedia untuk role Anda." />
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
          {isManagedRoomContext
            ? 'Modul ini hanya muncul jika Anda memiliki ruangan inventaris yang ditugaskan.'
            : 'Modul ini tersedia sesuai tugas tambahan Sarpras/Kepala Lab/Kepala Perpustakaan.'}
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
          refreshing={
            categoriesQuery.isFetching ||
            roomsQuery.isFetching ||
            inventoryQuery.isFetching ||
            libraryLoanClassesQuery.isFetching ||
            libraryLoansQuery.isFetching ||
            libraryLoanSettingsQuery.isFetching
          }
          onRefresh={() => {
            void categoriesQuery.refetch();
            void roomsQuery.refetch();
            void inventoryQuery.refetch();
            if (inventoryScope === 'LIBRARY') {
              void libraryLoanClassesQuery.refetch();
              void libraryLoansQuery.refetch();
              void libraryLoanSettingsQuery.refetch();
            }
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>{pageTitle}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{pageSubtitle}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <SectionChip active={section === 'RINGKASAN'} label="Ringkasan" onPress={() => setSection('RINGKASAN')} stacked useAutoIcon minWidth={102} />
        <SectionChip active={section === 'RUANGAN'} label="Ruangan" onPress={() => setSection('RUANGAN')} stacked useAutoIcon minWidth={102} />
        <SectionChip
          active={section === 'INVENTARIS'}
          label={inventoryScope === 'LIBRARY' ? 'Inventaris Perpustakaan' : 'Inventaris'}
          onPress={() => setSection('INVENTARIS')}
          stacked
          useAutoIcon
          minWidth={112}
        />
        {inventoryScope === 'LIBRARY' ? (
          <SectionChip
            active={section === 'PEMINJAMAN'}
            label="Daftar Peminjaman Buku"
            onPress={() => setSection('PEMINJAMAN')}
            stacked
            useAutoIcon
            minWidth={116}
          />
        ) : null}
      </View>

      {section !== 'PEMINJAMAN' ? (
        <>
          {categoriesQuery.isLoading ? <QueryStateView type="loading" message="Memuat kategori ruangan..." /> : null}
          {categoriesQuery.isError ? (
            <QueryStateView
              type="error"
              message="Gagal memuat kategori ruangan."
              onRetry={() => categoriesQuery.refetch()}
            />
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
                            {formatNumber(Number(category._count?.rooms || 0))} ruang • Template{' '}
                            {getInventoryTemplateProfile(
                              resolveInventoryTemplateKey({
                                templateKey: category.inventoryTemplateKey,
                                categoryName: category.name,
                              }),
                            ).label}
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
        </>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Template Inventaris</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {INVENTORY_TEMPLATE_OPTIONS.map((option) => (
                  <SectionChip
                    key={`template-${option.key}`}
                    active={categoryFormTemplateKey === option.key}
                    label={option.label}
                    onPress={() => setCategoryFormTemplateKey(option.key)}
                  />
                ))}
              </View>
            </ScrollView>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
              {
                INVENTORY_TEMPLATE_OPTIONS.find((option) => option.key === categoryFormTemplateKey)?.hint
              }
            </Text>
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
          <Text style={{ color: '#475569', fontSize: 12, marginBottom: 8 }}>
            Template aktif: {selectedTemplateProfile.label}
          </Text>
          <TextInput
            value={itemFormName}
            onChangeText={setItemFormName}
            placeholder={`${selectedTemplateProfile.itemNameLabel} *`}
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
          {selectedTemplateProfile.showCode || selectedTemplateProfile.showBrand ? (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {selectedTemplateProfile.showCode ? (
                <TextInput
                  value={itemFormCode}
                  onChangeText={setItemFormCode}
                  placeholder={selectedTemplateProfile.codeLabel}
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
              ) : null}
              {selectedTemplateProfile.showBrand ? (
                <TextInput
                  value={itemFormBrand}
                  onChangeText={setItemFormBrand}
                  placeholder={selectedTemplateProfile.brandLabel}
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
              ) : null}
            </View>
          ) : null}

          {selectedTemplateProfile.attributeFields.map((field: InventoryAttributeField) => {
            if (selectedTemplateProfile.key === 'LIBRARY' && field.key === 'category') {
              return (
                <View key={`item-attr-${field.key}`} style={{ marginBottom: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Text>
                  <TextInput
                    value={itemFormAttributes[field.key] || ''}
                    onChangeText={(value) =>
                      setItemFormAttributes((prev) => ({
                        ...prev,
                        [field.key]: value,
                      }))
                    }
                    placeholder={`${field.label}${field.required ? ' *' : ''}`}
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      color: '#0f172a',
                      marginBottom: 6,
                    }}
                    placeholderTextColor="#94a3b8"
                  />
                  {libraryBookCategories.length ? (
                    <View>
                      <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 5 }}>
                        Pilih kategori tersimpan atau hapus kategori yang tidak dipakai.
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {libraryBookCategories.map((categoryName) => (
                          <View
                            key={`library-category-${categoryName}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              borderWidth: 1,
                              borderColor:
                                String(itemFormAttributes.category || '').trim().toLowerCase() ===
                                categoryName.trim().toLowerCase()
                                  ? BRAND_COLORS.blue
                                  : '#d5e1f5',
                              borderRadius: 999,
                              backgroundColor:
                                String(itemFormAttributes.category || '').trim().toLowerCase() ===
                                categoryName.trim().toLowerCase()
                                  ? '#e9f1ff'
                                  : '#fff',
                            }}
                          >
                            <Pressable
                              onPress={() =>
                                setItemFormAttributes((prev) => ({
                                  ...prev,
                                  category: categoryName,
                                }))
                              }
                              style={{ paddingVertical: 6, paddingLeft: 10, paddingRight: 8 }}
                            >
                              <Text
                                style={{
                                  color: BRAND_COLORS.textDark,
                                  fontSize: 12,
                                  fontWeight: '700',
                                }}
                              >
                                {categoryName}
                              </Text>
                            </Pressable>
                            {canManageItems ? (
                              <Pressable
                                onPress={() => askDeleteLibraryCategory(categoryName)}
                                disabled={deleteLibraryCategoryMutation.isPending}
                                style={{ paddingVertical: 6, paddingHorizontal: 8 }}
                              >
                                <Feather name="trash-2" size={13} color="#b91c1c" />
                              </Pressable>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            }

            return (
              <TextInput
                key={`item-attr-${field.key}`}
                value={itemFormAttributes[field.key] || ''}
                onChangeText={(value) =>
                  setItemFormAttributes((prev) => ({
                    ...prev,
                    [field.key]: value,
                  }))
                }
                placeholder={`${field.label}${field.required ? ' *' : ''}`}
                keyboardType={field.type === 'number' ? 'numeric' : 'default'}
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
                multiline={field.type === 'textarea'}
              />
            );
          })}

          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
            {selectedTemplateProfile.conditionLabel}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput
              value={itemFormGoodQty}
              onChangeText={setItemFormGoodQty}
              placeholder="Baik"
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
              placeholder="Rusak Ringan"
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
              placeholder="Rusak Berat"
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
          {selectedTemplateProfile.showPurchaseInfo ? (
            <>
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
            </>
          ) : null}
          <TextInput
            value={itemFormDescription}
            onChangeText={setItemFormDescription}
            placeholder={selectedTemplateProfile.descriptionLabel}
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

      {section === 'PEMINJAMAN' && inventoryScope === 'LIBRARY' ? (
        <>
          {canManageLibraryLoans ? (
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                  Pengaturan Denda Keterlambatan
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                  Status pinjaman ditentukan otomatis: saat simpan = Dipinjam, lewat tenggat = Terlambat, saat
                  dikonfirmasi kembali = Dikembalikan.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={loanFinePerDayInput}
                    onChangeText={setLoanFinePerDayInput}
                    keyboardType="numeric"
                    placeholder="Tarif / hari (Rp)"
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
                  <Pressable
                    onPress={() => saveLibraryLoanSettingsMutation.mutate()}
                    disabled={libraryLoanSettingsQuery.isFetching || saveLibraryLoanSettingsMutation.isPending}
                    style={{
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      backgroundColor: BRAND_COLORS.blue,
                      opacity: libraryLoanSettingsQuery.isFetching || saveLibraryLoanSettingsMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                      {saveLibraryLoanSettingsMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                    </Text>
                  </Pressable>
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
                {editingLoanId ? 'Edit Peminjaman Buku' : 'Tambah Peminjaman Buku'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={loanBorrowDate}
                  onChangeText={setLoanBorrowDate}
                  placeholder="Tanggal Pinjam (YYYY-MM-DD) *"
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
                  value={loanPublishYear}
                  onChangeText={setLoanPublishYear}
                  placeholder="Thn. Terbit"
                  keyboardType="numeric"
                  style={{
                    width: 130,
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
                value={loanBorrowerName}
                onChangeText={setLoanBorrowerName}
                placeholder="Nama Peminjam *"
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Status Peminjam</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SectionChip active={loanBorrowerStatus === 'STUDENT'} label="Siswa" onPress={() => setLoanBorrowerStatus('STUDENT')} />
                <SectionChip
                  active={loanBorrowerStatus === 'TEACHER'}
                  label="Guru"
                  onPress={() => {
                    setLoanBorrowerStatus('TEACHER');
                    setLoanClassId(null);
                  }}
                />
              </View>

              {loanBorrowerStatus === 'STUDENT' ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Pilih Kelas</Text>
                  {libraryLoanClassesQuery.isLoading ? (
                    <QueryStateView type="loading" message="Memuat daftar kelas..." />
                  ) : libraryLoanClassesQuery.isError ? (
                    <QueryStateView
                      type="error"
                      message="Gagal memuat daftar kelas."
                      onRetry={() => libraryLoanClassesQuery.refetch()}
                    />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {libraryLoanClassOptions.map((classRow: SarprasLibraryClassOption) => (
                          <SectionChip
                            key={`loan-class-${classRow.id}`}
                            active={loanClassId === classRow.id}
                            label={classRow.name}
                            onPress={() => setLoanClassId(classRow.id)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </>
              ) : null}

              <TextInput
                value={loanBookTitle}
                onChangeText={setLoanBookTitle}
                placeholder="Judul Buku *"
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
                  value={loanReturnDate}
                  onChangeText={setLoanReturnDate}
                  placeholder="Tgl. Pengembalian (YYYY-MM-DD)"
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
                  value={loanPhoneNumber}
                  onChangeText={setLoanPhoneNumber}
                  placeholder="No. Telpon"
                  keyboardType="phone-pad"
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
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
                Status pengembalian akan mengikuti sistem otomatis.
              </Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => saveLibraryLoanMutation.mutate()}
                  disabled={saveLibraryLoanMutation.isPending}
                  style={{
                    flex: 1,
                    borderRadius: 10,
                    paddingVertical: 11,
                    alignItems: 'center',
                    backgroundColor: BRAND_COLORS.blue,
                    opacity: saveLibraryLoanMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveLibraryLoanMutation.isPending
                      ? 'Menyimpan...'
                      : editingLoanId
                        ? 'Simpan Perubahan'
                        : 'Tambah Peminjaman'}
                  </Text>
                </Pressable>
                {editingLoanId ? (
                  <Pressable
                    onPress={resetLoanEditor}
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
        </>
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

          {inventoryScope === 'LIBRARY' ? (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <SummaryCard
                title="Total Peminjaman"
                value={formatNumber(loanSummary.total)}
                subtitle={`Siswa: ${formatNumber(loanSummary.student)} • Guru: ${formatNumber(loanSummary.teacher)}`}
              />
              <SummaryCard
                title="Status Pengembalian"
                value={formatNumber(loanSummary.notReturned)}
                subtitle={`Belum • Sudah: ${formatNumber(loanSummary.returned)}`}
              />
            </View>
          ) : null}

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
          {(isManagedRoomContext ? managedRoomsQuery.isLoading : roomsQuery.isLoading) ? (
            <QueryStateView type="loading" message="Memuat daftar ruangan..." />
          ) : null}
          {(isManagedRoomContext ? managedRoomsQuery.isError : roomsQuery.isError) ? (
            <QueryStateView
              type="error"
              message="Gagal memuat daftar ruangan."
              onRetry={() =>
                isManagedRoomContext ? managedRoomsQuery.refetch() : roomsQuery.refetch()
              }
            />
          ) : null}

          {!(isManagedRoomContext ? managedRoomsQuery.isLoading : roomsQuery.isLoading)
          && !(isManagedRoomContext ? managedRoomsQuery.isError : roomsQuery.isError) ? (
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
                      templateProfile={selectedTemplateProfile}
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

      {section === 'PEMINJAMAN' && inventoryScope === 'LIBRARY' ? (
        <>
          {libraryLoansQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar peminjaman buku..." /> : null}
          {libraryLoansQuery.isError ? (
            <QueryStateView
              type="error"
              message="Gagal memuat daftar peminjaman buku."
              onRetry={() => libraryLoansQuery.refetch()}
            />
          ) : null}

          {!libraryLoansQuery.isLoading && !libraryLoansQuery.isError ? (
            filteredLibraryLoans.length > 0 ? (
              filteredLibraryLoans.map(({ loan, status }, index) => (
                <View
                  key={`loan-${loan.id}`}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', marginBottom: 3 }}>No. {index + 1}</Text>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>{loan.borrowerName}</Text>
                      <Text style={{ color: '#475569', marginTop: 2 }}>{loan.bookTitle}</Text>
                    </View>
                    <ReturnStatusBadge status={status.code} />
                  </View>

                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: '#475569', fontSize: 12 }}>Tanggal Pinjam: {formatDateLabel(loan.borrowDate)}</Text>
                    <Text style={{ color: '#475569', fontSize: 12 }}>
                      Status Peminjam: {resolveBorrowerStatusLabel(loan.borrowerStatus)}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: 12 }}>
                      Kelas: {loan.borrowerStatus === 'STUDENT' ? resolveClassLabel(loan.class) : '-'}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: 12 }}>Thn. Terbit: {loan.publishYear || '-'}</Text>
                    <Text style={{ color: '#475569', fontSize: 12 }}>
                      Tgl. Pengembalian: {loan.returnDate ? formatDateLabel(loan.returnDate) : '-'}
                    </Text>
                    <Text style={{ color: '#475569', fontSize: 12 }}>No. Telpon: {loan.phoneNumber || '-'}</Text>
                    <Text style={{ color: '#475569', fontSize: 12 }}>Status: {status.label}</Text>
                    {status.code === 'OVERDUE' ? (
                      <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '700' }}>
                        Denda: {formatCurrency(status.fineAmount)}
                      </Text>
                    ) : null}
                  </View>

                  {canManageLibraryLoans ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      {loan.returnStatus !== 'RETURNED' ? (
                        <Pressable
                          onPress={() => askMarkLibraryLoanReturned(loan)}
                          disabled={markLibraryLoanReturnedMutation.isPending}
                          style={{
                            borderWidth: 1,
                            borderColor: '#86efac',
                            borderRadius: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#ecfdf5',
                            opacity: markLibraryLoanReturnedMutation.isPending ? 0.7 : 1,
                          }}
                        >
                          <Feather name="check-circle" size={15} color="#166534" />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => editLibraryLoan(loan)}
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
                        onPress={() => askDeleteLibraryLoan(loan)}
                        disabled={deleteLibraryLoanMutation.isPending}
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: '#fca5a5',
                          borderRadius: 8,
                          paddingVertical: 8,
                          alignItems: 'center',
                          backgroundColor: '#fff',
                          opacity: deleteLibraryLoanMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
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
                  Tidak ada data peminjaman buku yang cocok untuk pencarian ini.
                </Text>
              </View>
            )
          ) : null}
        </>
      ) : null}

    </ScrollView>
  );
}
