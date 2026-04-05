import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  examLayoutApi,
  type ExamLayoutCell,
  type ExamLayoutCellType,
  type ExamLayoutDetail,
} from '../../../src/features/examLayouts/examLayoutApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type LayoutDraftCell = {
  rowIndex: number;
  columnIndex: number;
  cellType: ExamLayoutCellType;
  seatLabel: string;
  studentId: number | null;
  notes: string;
};

type LayoutDraft = {
  rows: number;
  columns: number;
  notes: string;
  cells: LayoutDraftCell[];
};

const MAX_GRID_SIZE = 20;

function hasCurriculumDuty(userDuties?: string[] | null) {
  const duties = (userDuties || []).map((item) => String(item || '').trim().toUpperCase());
  return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
}

function parseSittingId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildPositionKey(rowIndex: number, columnIndex: number) {
  return `${rowIndex}:${columnIndex}`;
}

function clampGridSize(value: number) {
  return Math.max(1, Math.min(MAX_GRID_SIZE, Math.trunc(value)));
}

function getSeatLabel(rowIndex: number, columnIndex: number) {
  let cursor = rowIndex;
  let label = '';
  do {
    label = String.fromCharCode(65 + (cursor % 26)) + label;
    cursor = Math.floor(cursor / 26) - 1;
  } while (cursor >= 0);
  return `${label}${columnIndex + 1}`;
}

function createDraftFromDetail(detail: ExamLayoutDetail): LayoutDraft | null {
  if (!detail.layout) return null;

  const cellMap = new Map<string, ExamLayoutCell>();
  (detail.layout.cells || []).forEach((cell) => {
    cellMap.set(buildPositionKey(cell.rowIndex, cell.columnIndex), cell);
  });

  const cells: LayoutDraftCell[] = [];
  for (let rowIndex = 0; rowIndex < detail.layout.rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < detail.layout.columns; columnIndex += 1) {
      const source = cellMap.get(buildPositionKey(rowIndex, columnIndex));
      const cellType = source?.cellType || 'SEAT';
      cells.push({
        rowIndex,
        columnIndex,
        cellType,
        seatLabel:
          cellType === 'SEAT'
            ? String(source?.seatLabel || '').trim() || getSeatLabel(rowIndex, columnIndex)
            : '',
        studentId: typeof source?.studentId === 'number' ? source.studentId : null,
        notes: String(source?.notes || '').trim(),
      });
    }
  }

  return {
    rows: detail.layout.rows,
    columns: detail.layout.columns,
    notes: String(detail.layout.notes || '').trim(),
    cells,
  };
}

function resizeDraft(draft: LayoutDraft, nextRows: number, nextColumns: number): LayoutDraft {
  const rows = clampGridSize(nextRows);
  const columns = clampGridSize(nextColumns);
  const currentMap = new Map<string, LayoutDraftCell>();
  draft.cells.forEach((cell) => {
    currentMap.set(buildPositionKey(cell.rowIndex, cell.columnIndex), cell);
  });

  const cells: LayoutDraftCell[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const current = currentMap.get(buildPositionKey(rowIndex, columnIndex));
      const cellType = current?.cellType || 'SEAT';
      cells.push({
        rowIndex,
        columnIndex,
        cellType,
        seatLabel:
          cellType === 'SEAT'
            ? String(current?.seatLabel || '').trim() || getSeatLabel(rowIndex, columnIndex)
            : '',
        studentId: current?.studentId ?? null,
        notes: current?.notes || '',
      });
    }
  }

  return {
    ...draft,
    rows,
    columns,
    cells,
  };
}

function numericInputValue(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clampGridSize(parsed);
}

export default function TeacherWakakurRoomLayoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sittingId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const sittingId = useMemo(() => parseSittingId(params.sittingId), [params.sittingId]);
  const isAllowed = user?.role === 'TEACHER' && hasCurriculumDuty(user?.additionalDuties);

  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [selectedCellKey, setSelectedCellKey] = useState('');
  const [generateRowsInput, setGenerateRowsInput] = useState('4');
  const [generateColumnsInput, setGenerateColumnsInput] = useState('4');
  const [generateNotes, setGenerateNotes] = useState('');

  const detailQuery = useQuery({
    queryKey: ['mobile-wakakur-room-layout-detail', sittingId],
    enabled: isAuthenticated && isAllowed && Boolean(sittingId),
    staleTime: 30_000,
    queryFn: () => examLayoutApi.getLayout(sittingId!),
  });

  useEffect(() => {
    if (!detailQuery.data) return;
    const nextDraft = createDraftFromDetail(detailQuery.data);
    setDraft(nextDraft);
    setGenerateRowsInput(String(detailQuery.data.layout?.rows || detailQuery.data.meta.suggestedDimensions.rows));
    setGenerateColumnsInput(
      String(detailQuery.data.layout?.columns || detailQuery.data.meta.suggestedDimensions.columns),
    );
    setGenerateNotes(String(detailQuery.data.layout?.notes || '').trim());
    if (nextDraft?.cells?.length) {
      setSelectedCellKey((current) =>
        nextDraft.cells.some((cell) => buildPositionKey(cell.rowIndex, cell.columnIndex) === current)
          ? current
          : buildPositionKey(nextDraft.cells[0].rowIndex, nextDraft.cells[0].columnIndex),
      );
      return;
    }
    setSelectedCellKey('');
  }, [detailQuery.data]);

  const selectedCell = useMemo(
    () => draft?.cells.find((cell) => buildPositionKey(cell.rowIndex, cell.columnIndex) === selectedCellKey) || null,
    [draft?.cells, selectedCellKey],
  );

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<number>();
    draft?.cells.forEach((cell) => {
      if (typeof cell.studentId === 'number' && cell.studentId > 0) ids.add(cell.studentId);
    });
    return ids;
  }, [draft]);

  const unassignedStudents = useMemo(() => {
    const students = detailQuery.data?.students || [];
    return students.filter((student) => !assignedStudentIds.has(student.id));
  }, [assignedStudentIds, detailQuery.data?.students]);

  const availableStudentOptions = useMemo(() => {
    const students = detailQuery.data?.students || [];
    const currentStudentId = selectedCell?.studentId ?? null;
    return [
      { value: '', label: 'Kosongkan Kursi' },
      ...students
        .filter((student) => !assignedStudentIds.has(student.id) || student.id === currentStudentId)
        .map((student) => ({
          value: String(student.id),
          label: `${student.name}${student.className ? ` • ${student.className}` : ''}`,
        })),
    ];
  }, [assignedStudentIds, detailQuery.data?.students, selectedCell?.studentId]);

  const summary = useMemo(() => {
    const seatCells = draft?.cells.filter((cell) => cell.cellType === 'SEAT') || [];
    const filledSeats = seatCells.filter((cell) => typeof cell.studentId === 'number' && cell.studentId > 0).length;
    return {
      studentCount: detailQuery.data?.meta.studentCount || 0,
      totalSeats: seatCells.length,
      unassignedCount: Math.max(0, (detailQuery.data?.meta.studentCount || 0) - filledSeats),
    };
  }, [detailQuery.data?.meta.studentCount, draft]);

  const updateDraftCell = (rowIndex: number, columnIndex: number, updater: (cell: LayoutDraftCell) => LayoutDraftCell) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        cells: current.cells.map((cell) =>
          cell.rowIndex === rowIndex && cell.columnIndex === columnIndex ? updater(cell) : cell,
        ),
      };
    });
  };

  const generateMutation = useMutation({
    mutationFn: () =>
      examLayoutApi.generateLayout(sittingId!, {
        rows: numericInputValue(generateRowsInput, detailQuery.data?.meta.suggestedDimensions.rows || 4),
        columns: numericInputValue(generateColumnsInput, detailQuery.data?.meta.suggestedDimensions.columns || 4),
        notes: generateNotes.trim() || null,
      }),
    onSuccess: async () => {
      notifySuccess('Denah ruang berhasil digenerate.');
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-sittings'] }),
      ]);
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal generate denah ruang.');
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Denah belum tersedia.');
      return examLayoutApi.updateLayout(sittingId!, {
        rows: draft.rows,
        columns: draft.columns,
        notes: draft.notes.trim() || null,
        cells: draft.cells.map((cell) => ({
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          cellType: cell.cellType,
          seatLabel:
            cell.cellType === 'SEAT'
              ? String(cell.seatLabel || '').trim() || getSeatLabel(cell.rowIndex, cell.columnIndex)
              : null,
          studentId: cell.cellType === 'SEAT' ? cell.studentId : null,
          notes: cell.notes.trim() || null,
        })),
      });
    },
    onSuccess: async () => {
      notifySuccess('Denah ruang berhasil disimpan.');
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-sittings'] }),
      ]);
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan denah ruang.');
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat editor denah..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!user || !isAllowed) return <Redirect href="/home" />;
  if (!sittingId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Generate Denah Ruang
        </Text>
        <QueryStateView type="error" message="Ruang ujian tidak valid." />
      </ScrollView>
    );
  }
  if (detailQuery.isLoading && !detailQuery.data) return <AppLoadingScreen message="Memuat detail denah..." />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={detailQuery.isFetching && !detailQuery.isLoading}
          onRefresh={() => {
            void detailQuery.refetch();
          }}
          tintColor={BRAND_COLORS.blue}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>
          Generate Denah Ruang
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Generate denah awal per ruang, lalu edit kursi, lorong, dan penempatan siswa secara fleksibel.
      </Text>

      {detailQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat detail denah ruang."
          onRetry={() => detailQuery.refetch()}
        />
      ) : null}

      {detailQuery.data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <MobileSummaryCard
              title="Peserta Ruang"
              value={String(summary.studentCount)}
              subtitle={detailQuery.data.sitting.roomName}
              iconName="users"
              accentColor="#1d4ed8"
            />
            <MobileSummaryCard
              title="Kursi Aktif"
              value={String(summary.totalSeats)}
              subtitle={`${draft?.rows || 0} x ${draft?.columns || 0}`}
              iconName="grid"
              accentColor="#047857"
            />
            <MobileSummaryCard
              title="Belum Ditempatkan"
              value={String(summary.unassignedCount)}
              subtitle="Siswa tanpa kursi"
              iconName="user-x"
              accentColor="#c2410c"
            />
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 18,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
              Informasi Ruang Ujian
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              {detailQuery.data.sitting.roomName} • {detailQuery.data.sitting.sessionLabel || '-'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6, fontSize: 12 }}>
              {formatDateTime(detailQuery.data.sitting.startTime)} - {formatDateTime(detailQuery.data.sitting.endTime)}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
              Program: {detailQuery.data.sitting.examType}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 18,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
              Generate Ulang Denah
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Generate akan menyusun ulang kursi otomatis. Gunakan ini saat layout awal perlu dibuat ulang.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Baris</Text>
                <TextInput
                  value={generateRowsInput}
                  onChangeText={setGenerateRowsInput}
                  keyboardType="number-pad"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: BRAND_COLORS.textDark,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Kolom</Text>
                <TextInput
                  value={generateColumnsInput}
                  onChangeText={setGenerateColumnsInput}
                  keyboardType="number-pad"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: BRAND_COLORS.textDark,
                  }}
                />
              </View>
            </View>

            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 10, marginBottom: 6 }}>
              Catatan Denah
            </Text>
            <TextInput
              value={generateNotes}
              onChangeText={setGenerateNotes}
              multiline
              placeholder="Contoh: Baris tengah disiapkan untuk lorong utama."
              placeholderTextColor="#94a3b8"
              style={{
                minHeight: 86,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                backgroundColor: '#fff',
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: BRAND_COLORS.textDark,
                textAlignVertical: 'top',
              }}
            />

            <Pressable
              onPress={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              style={{
                marginTop: 12,
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: 'center',
                backgroundColor: generateMutation.isPending ? '#94a3b8' : BRAND_COLORS.blue,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {generateMutation.isPending ? 'Memproses...' : 'Generate Denah Ruang'}
              </Text>
            </Pressable>
          </View>

          {draft ? (
            <>
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 18,
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
                  Editor Denah
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                  Pilih kotak kursi untuk edit label, jenis sel, dan siswa. Lorong bisa dipakai untuk ruang kosong.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Baris</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable
                        onPress={() => setDraft((current) => (current ? resizeDraft(current, current.rows - 1, current.columns) : current))}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#eff6ff',
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                        }}
                      >
                        <Feather name="minus" size={16} color="#1d4ed8" />
                      </Pressable>
                      <View
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 12,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: '#fff',
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{draft.rows}</Text>
                      </View>
                      <Pressable
                        onPress={() => setDraft((current) => (current ? resizeDraft(current, current.rows + 1, current.columns) : current))}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#eff6ff',
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                        }}
                      >
                        <Feather name="plus" size={16} color="#1d4ed8" />
                      </Pressable>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Kolom</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable
                        onPress={() => setDraft((current) => (current ? resizeDraft(current, current.rows, current.columns - 1) : current))}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#eff6ff',
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                        }}
                      >
                        <Feather name="minus" size={16} color="#1d4ed8" />
                      </Pressable>
                      <View
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 12,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: '#fff',
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{draft.columns}</Text>
                      </View>
                      <Pressable
                        onPress={() => setDraft((current) => (current ? resizeDraft(current, current.rows, current.columns + 1) : current))}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#eff6ff',
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                        }}
                      >
                        <Feather name="plus" size={16} color="#1d4ed8" />
                      </Pressable>
                    </View>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 12, marginBottom: 6 }}>
                  Catatan Layout
                </Text>
                <TextInput
                  value={draft.notes}
                  onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))}
                  multiline
                  placeholder="Catatan umum denah ruang"
                  placeholderTextColor="#94a3b8"
                  style={{
                    minHeight: 76,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: BRAND_COLORS.textDark,
                    textAlignVertical: 'top',
                  }}
                />
              </View>

              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 18,
                  padding: 14,
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
                  Grid Denah
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                  Ketuk sel untuk memilih kursi yang ingin diedit.
                </Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                  <View>
                    {Array.from({ length: draft.rows }, (_, rowIndex) => (
                      <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', marginBottom: 8 }}>
                        {Array.from({ length: draft.columns }, (_, columnIndex) => {
                          const cell =
                            draft.cells.find(
                              (item) => item.rowIndex === rowIndex && item.columnIndex === columnIndex,
                            ) || null;
                          const isActive =
                            buildPositionKey(rowIndex, columnIndex) === selectedCellKey;
                          const isSeat = cell?.cellType === 'SEAT';
                          const assignedStudent =
                            typeof cell?.studentId === 'number'
                              ? detailQuery.data.students.find((student) => student.id === cell.studentId) || null
                              : null;

                          return (
                            <Pressable
                              key={`cell-${rowIndex}-${columnIndex}`}
                              onPress={() => setSelectedCellKey(buildPositionKey(rowIndex, columnIndex))}
                              style={{
                                width: 86,
                                minHeight: 78,
                                marginRight: 8,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor: isActive ? '#2563eb' : isSeat ? '#bfdbfe' : '#d1d5db',
                                backgroundColor: isActive
                                  ? '#dbeafe'
                                  : isSeat
                                    ? assignedStudent
                                      ? '#eff6ff'
                                      : '#f8fafc'
                                    : '#f3f4f6',
                                padding: 8,
                                justifyContent: 'space-between',
                              }}
                            >
                              <Text
                                style={{
                                  color: isSeat ? '#1e3a8a' : '#6b7280',
                                  fontSize: 11,
                                  fontWeight: '800',
                                }}
                              >
                                {isSeat ? cell?.seatLabel || getSeatLabel(rowIndex, columnIndex) : 'LORONG'}
                              </Text>
                              <Text
                                numberOfLines={2}
                                style={{
                                  color: isSeat ? BRAND_COLORS.textDark : '#6b7280',
                                  fontSize: 11,
                                  fontWeight: assignedStudent ? '700' : '500',
                                }}
                              >
                                {isSeat ? assignedStudent?.name || 'Belum ditempati' : 'Kosong'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {selectedCell ? (
                <View
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
                    Edit Sel {getSeatLabel(selectedCell.rowIndex, selectedCell.columnIndex)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    Atur jenis sel, label kursi, siswa, dan catatan per posisi.
                  </Text>

                  <MobileSelectField
                    label="Jenis Sel"
                    value={selectedCell.cellType}
                    options={[
                      { value: 'SEAT', label: 'Kursi' },
                      { value: 'AISLE', label: 'Lorong' },
                    ]}
                    onChange={(value) =>
                      updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) =>
                        value === 'AISLE'
                          ? { ...cell, cellType: 'AISLE', seatLabel: '', studentId: null }
                          : {
                              ...cell,
                              cellType: 'SEAT',
                              seatLabel: cell.seatLabel || getSeatLabel(cell.rowIndex, cell.columnIndex),
                            },
                      )
                    }
                  />

                  {selectedCell.cellType === 'SEAT' ? (
                    <>
                      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Label Kursi</Text>
                      <TextInput
                        value={selectedCell.seatLabel}
                        onChangeText={(value) =>
                          updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) => ({
                            ...cell,
                            seatLabel: value,
                          }))
                        }
                        placeholder={getSeatLabel(selectedCell.rowIndex, selectedCell.columnIndex)}
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          backgroundColor: '#fff',
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: BRAND_COLORS.textDark,
                          marginBottom: 8,
                        }}
                      />

                      <MobileSelectField
                        label="Peserta"
                        value={selectedCell.studentId ? String(selectedCell.studentId) : ''}
                        options={availableStudentOptions}
                        onChange={(value) =>
                          updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) => ({
                            ...cell,
                            studentId: value ? Number(value) : null,
                          }))
                        }
                        placeholder="Pilih siswa"
                        helperText={`${unassignedStudents.length} siswa belum ditempatkan`}
                        maxHeight={260}
                      />
                    </>
                  ) : null}

                  <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Catatan Sel</Text>
                  <TextInput
                    value={selectedCell.notes}
                    onChangeText={(value) =>
                      updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) => ({
                        ...cell,
                        notes: value,
                      }))
                    }
                    multiline
                    placeholder="Opsional, misalnya kursi cadangan atau lorong utama"
                    placeholderTextColor="#94a3b8"
                    style={{
                      minHeight: 76,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: BRAND_COLORS.textDark,
                      textAlignVertical: 'top',
                    }}
                  />

                  <Pressable
                    onPress={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    style={{
                      marginTop: 12,
                      borderRadius: 12,
                      paddingVertical: 11,
                      alignItems: 'center',
                      backgroundColor: saveMutation.isPending ? '#94a3b8' : '#0f766e',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Denah'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 18,
                  padding: 14,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
                  Siswa Belum Ditempatkan
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                  Pantau siapa saja yang belum mendapat kursi sebelum menyimpan denah final.
                </Text>

                <View style={{ marginTop: 12, gap: 8 }}>
                  {unassignedStudents.length === 0 ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#bbf7d0',
                        backgroundColor: '#f0fdf4',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: '#166534', fontWeight: '700' }}>
                        Semua siswa pada ruang ini sudah mendapat kursi.
                      </Text>
                    </View>
                  ) : (
                    unassignedStudents.map((student) => (
                      <View
                        key={student.id}
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 12,
                          backgroundColor: '#f8fafc',
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{student.name}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, fontSize: 12 }}>
                          {student.className || '-'} • NIS {student.nis || '-'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
