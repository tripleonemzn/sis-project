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
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  examLayoutApi,
  type ExamLayoutCell,
  type ExamLayoutCellType,
  type ExamLayoutDetail,
  type ExamLayoutStudent,
} from '../../../src/features/examLayouts/examLayoutApi';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

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

function formatStudentMeta(student?: ExamLayoutStudent | null) {
  if (!student) return '-';
  return [student.className, student.nis || student.nisn].filter(Boolean).join(' • ') || '-';
}

function formatScheduleSummary(startTime?: string | null, endTime?: string | null) {
  const startLabel = formatDateTime(startTime);
  const endLabel = formatDateTime(endTime);
  if (startLabel === '-' && endLabel === '-') return 'Jadwal belum diatur';
  if (startLabel === '-' || endLabel === '-') return 'Jadwal belum lengkap';
  return `${startLabel} - ${endLabel}`;
}

function formatSessionSummary(sessionLabel?: string | null) {
  const value = String(sessionLabel || '').trim();
  if (!value) return 'Sesi belum diatur';
  return `Sesi ${value}`;
}

function compareClassName(a: string, b: string) {
  return String(a || '').localeCompare(String(b || ''), 'id-ID', {
    numeric: true,
    sensitivity: 'base',
  });
}

function getStudentClassName(student?: ExamLayoutStudent | null) {
  const value = String(student?.className || '').trim();
  return value || 'Tanpa Rombel';
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
  const [generateRowsInput, setGenerateRowsInput] = useState('4');
  const [generateColumnsInput, setGenerateColumnsInput] = useState('4');
  const [generateNotes, setGenerateNotes] = useState('');
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [placementClassOrder, setPlacementClassOrder] = useState<string[]>([]);

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
  }, [detailQuery.data]);

  useEffect(() => {
    const nextLabels = Array.from(
      new Set((detailQuery.data?.students || []).map((student) => getStudentClassName(student))),
    ).sort(compareClassName);
    setPlacementClassOrder((current) => {
      const preserved = current.filter((label) => nextLabels.includes(label));
      const additions = nextLabels.filter((label) => !preserved.includes(label));
      return [...preserved, ...additions];
    });
  }, [detailQuery.data?.students]);

  const studentMap = useMemo(() => {
    return new Map((detailQuery.data?.students || []).map((student) => [student.id, student] as const));
  }, [detailQuery.data?.students]);

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

  const missingStudentsPreview = useMemo(() => {
    if (unassignedStudents.length === 0) return '';
    const names = unassignedStudents.slice(0, 3).map((student) => student.name);
    if (unassignedStudents.length <= 3) return names.join(', ');
    return `${names.join(', ')} +${unassignedStudents.length - 3} lainnya`;
  }, [unassignedStudents]);

  const placementGroups = useMemo(() => {
    const classMap = new Map<string, ExamLayoutStudent[]>();
    (detailQuery.data?.students || []).forEach((student) => {
      const className = getStudentClassName(student);
      const bucket = classMap.get(className) || [];
      bucket.push(student);
      classMap.set(className, bucket);
    });

    const orderedLabels = placementClassOrder.filter((className) => classMap.has(className));
    const remainingLabels = Array.from(classMap.keys())
      .filter((className) => !orderedLabels.includes(className))
      .sort(compareClassName);

    return [...orderedLabels, ...remainingLabels].map((className) => ({
      className,
      students: classMap.get(className) || [],
      count: (classMap.get(className) || []).length,
    }));
  }, [detailQuery.data?.students, placementClassOrder]);

  const seatStats = useMemo(() => {
    const seatCells = draft?.cells.filter((cell) => cell.cellType === 'SEAT') || [];
    const filledSeats = seatCells.filter((cell) => typeof cell.studentId === 'number' && cell.studentId > 0).length;
    return {
      totalSeats: seatCells.length,
      filledSeats,
      aisleCount: draft?.cells.filter((cell) => cell.cellType === 'AISLE').length || 0,
      studentCount: detailQuery.data?.meta.studentCount || 0,
    };
  }, [detailQuery.data?.meta.studentCount, draft]);

  const gridRows = useMemo(() => {
    if (!draft) return [];
    const rows: LayoutDraftCell[][] = [];
    for (let rowIndex = 0; rowIndex < draft.rows; rowIndex += 1) {
      rows.push(
        draft.cells
          .filter((cell) => cell.rowIndex === rowIndex)
          .sort((a, b) => a.columnIndex - b.columnIndex),
      );
    }
    return rows;
  }, [draft]);

  const applyPlacementByClassOrder = () => {
    if (!draft || placementGroups.length === 0) return;

    const seatColumns = Array.from({ length: draft.columns }, (_, columnIndex) =>
      draft.cells
        .filter((cell) => cell.columnIndex === columnIndex && cell.cellType === 'SEAT')
        .sort((a, b) => a.rowIndex - b.rowIndex),
    ).filter((column) => column.length > 0);

    const groupOrder = placementGroups.map((group) => group.className);
    const remainingByGroup = new Map<string, ExamLayoutStudent[]>(
      placementGroups.map((group) => [group.className, [...group.students]]),
    );
    const nextAssignments = new Map<string, number | null>();

    draft.cells.forEach((cell) => {
      if (cell.cellType === 'SEAT') {
        nextAssignments.set(buildPositionKey(cell.rowIndex, cell.columnIndex), null);
      }
    });

    let groupCursor = 0;

    seatColumns.forEach((columnCells) => {
      if (groupOrder.length === 0) return;
      let activeGroupName: string | null = null;

      for (let attempt = 0; attempt < groupOrder.length; attempt += 1) {
        const candidateIndex = (groupCursor + attempt) % groupOrder.length;
        const candidateName = groupOrder[candidateIndex];
        if ((remainingByGroup.get(candidateName) || []).length > 0) {
          activeGroupName = candidateName;
          groupCursor = (candidateIndex + 1) % groupOrder.length;
          break;
        }
      }

      if (!activeGroupName) return;
      const queue = remainingByGroup.get(activeGroupName) || [];

      columnCells.forEach((cell) => {
        const student = queue.shift() || null;
        nextAssignments.set(buildPositionKey(cell.rowIndex, cell.columnIndex), student?.id || null);
      });
    });

    setDraft((current) =>
      current
        ? {
            ...current,
            cells: current.cells.map((cell) =>
              cell.cellType === 'SEAT'
                ? {
                    ...cell,
                    studentId: nextAssignments.get(buildPositionKey(cell.rowIndex, cell.columnIndex)) ?? null,
                  }
                : {
                    ...cell,
                    studentId: null,
                  },
            ),
          }
        : current,
    );

    notifySuccess('Penempatan siswa per rombel berhasil diterapkan.');
  };

  const movePlacementClass = (index: number, direction: -1 | 1) => {
    setPlacementClassOrder((current) => {
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || index >= current.length || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
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
      setSetupModalVisible(false);
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
    <>
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
          Setup denah lewat popup, lalu lanjutkan atur penempatan siswa per rombel di editor penuh.
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
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      borderRadius: 999,
                      backgroundColor: '#eff6ff',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                      {detailQuery.data.sitting.roomName}
                    </Text>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 18, marginTop: 12 }}>
                    {detailQuery.data.sitting.examType}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    {formatScheduleSummary(detailQuery.data.sitting.startTime, detailQuery.data.sitting.endTime)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
                    {formatSessionSummary(
                      detailQuery.data.sitting.programSession?.label || detailQuery.data.sitting.sessionLabel,
                    )}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setSetupModalVisible(true)}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    backgroundColor: '#eff6ff',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                  >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                    {draft ? 'Setup Ulang Denah' : 'Setup Denah'}
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <View
                  style={{
                    borderRadius: 999,
                    backgroundColor: '#f1f5f9',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>
                    {seatStats.studentCount} peserta
                  </Text>
                </View>
                {draft ? (
                  <>
                    <View
                      style={{
                        borderRadius: 999,
                        backgroundColor: '#f1f5f9',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>
                        {seatStats.totalSeats} kursi
                      </Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 999,
                        backgroundColor: '#f1f5f9',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>
                        {seatStats.filledSeats} terisi
                      </Text>
                    </View>
                  </>
                ) : null}
                {detailQuery.data.layout ? (
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: '#eff6ff',
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                      {detailQuery.data.layout.rows} x {detailQuery.data.layout.columns}
                    </Text>
                  </View>
                ) : null}
              </View>

              {draft ? (
                <Pressable
                  onPress={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  style={{
                    marginTop: 14,
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: 'center',
                    backgroundColor: saveMutation.isPending ? '#94a3b8' : BRAND_COLORS.blue,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Denah'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {!draft ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#bfdbfe',
                  borderRadius: 18,
                  padding: 20,
                  alignItems: 'center',
                }}
              >
                <Feather name="grid" size={28} color="#1d4ed8" />
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 17, marginTop: 12 }}>
                  Denah Belum Dibuat
                </Text>
                <Text
                  style={{
                    color: BRAND_COLORS.textMuted,
                    marginTop: 6,
                    textAlign: 'center',
                    lineHeight: 20,
                  }}
                >
                  Buka popup setup denah untuk menentukan ukuran grid awal sebelum editor penuh dipakai.
                </Text>
                <Pressable
                  onPress={() => setSetupModalVisible(true)}
                  style={{
                    marginTop: 14,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    backgroundColor: BRAND_COLORS.blue,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Setup Denah</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View
                  style={{
                    backgroundColor: unassignedStudents.length > 0 ? '#fffbeb' : '#ecfdf5',
                    borderWidth: 1,
                    borderColor: unassignedStudents.length > 0 ? '#fcd34d' : '#86efac',
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 14,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Feather
                      name={unassignedStudents.length > 0 ? 'alert-triangle' : 'check-circle'}
                      size={16}
                      color={unassignedStudents.length > 0 ? '#b45309' : '#15803d'}
                      style={{ marginTop: 2, marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: unassignedStudents.length > 0 ? '#92400e' : '#166534',
                          fontWeight: '800',
                          fontSize: 14,
                        }}
                      >
                        {unassignedStudents.length > 0
                          ? `${unassignedStudents.length} siswa belum ditempatkan`
                          : 'Semua siswa sudah mendapat kursi'}
                      </Text>
                      <Text
                        style={{
                          color: unassignedStudents.length > 0 ? '#92400e' : '#166534',
                          marginTop: 4,
                          fontSize: 12,
                          lineHeight: 18,
                        }}
                      >
                        {unassignedStudents.length > 0
                          ? `Kursi kosong diberi tanda amber. ${missingStudentsPreview}`
                          : 'Denah siap dipakai untuk kebutuhan ujian dan kartu digital.'}
                      </Text>
                    </View>
                  </View>
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
                    Editor Denah
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                    Denah ditampilkan sebagai preview. Pengaturan utama dilakukan dari panel rombel di bawah.
                  </Text>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
                    <View style={{ paddingBottom: 2 }}>
                      {gridRows.map((row, rowIndex) => (
                        <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', marginBottom: 10 }}>
                          {row.map((cell) => {
                            const isSeat = cell.cellType === 'SEAT';
                            const assignedStudent =
                              typeof cell.studentId === 'number' ? studentMap.get(cell.studentId) || null : null;
                            const isEmptySeat = isSeat && !assignedStudent;

                            return (
                              <View
                                key={`cell-${cell.rowIndex}-${cell.columnIndex}`}
                                style={{
                                  width: 128,
                                  minHeight: 118,
                                  marginRight: 10,
                                  borderRadius: 18,
                                  borderWidth: 1,
                                  borderColor: isSeat
                                    ? isEmptySeat
                                      ? '#f59e0b'
                                      : '#bfdbfe'
                                    : '#cbd5e1',
                                  backgroundColor: isSeat
                                    ? isEmptySeat
                                      ? '#fffbeb'
                                      : '#ffffff'
                                    : '#f8fafc',
                                  padding: 12,
                                  justifyContent: 'space-between',
                                }}
                              >
                                <View>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                                    <View
                                      style={{
                                        borderRadius: 999,
                                        paddingHorizontal: 8,
                                        paddingVertical: 4,
                                        backgroundColor: isSeat ? '#eff6ff' : '#e2e8f0',
                                      }}
                                    >
                                      <Text
                                        style={{
                                          color: isSeat ? '#1d4ed8' : '#475569',
                                          fontSize: 11,
                                          fontWeight: '800',
                                        }}
                                      >
                                        {isSeat ? cell.seatLabel || getSeatLabel(cell.rowIndex, cell.columnIndex) : 'LORONG'}
                                      </Text>
                                    </View>
                                    <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700' }}>
                                      {cell.rowIndex + 1}-{cell.columnIndex + 1}
                                    </Text>
                                  </View>

                                  <Text
                                    numberOfLines={2}
                                    style={{
                                      color: BRAND_COLORS.textDark,
                                      fontSize: 13,
                                      fontWeight: '800',
                                      marginTop: 12,
                                    }}
                                  >
                                    {isSeat
                                      ? assignedStudent?.name || 'Belum ditempatkan'
                                      : 'Lorong / ruang kosong'}
                                  </Text>
                                </View>

                                <View>
                                  <Text
                                    numberOfLines={2}
                                    style={{
                                      color: isSeat ? '#64748b' : '#94a3b8',
                                      fontSize: 11,
                                      lineHeight: 16,
                                    }}
                                  >
                                    {isSeat
                                      ? assignedStudent
                                        ? formatStudentMeta(assignedStudent)
                                        : 'Penempatan mengikuti urutan rombel.'
                                      : 'Dipakai untuk jalur pengawas atau jarak antar kursi.'}
                                  </Text>
                                  {isSeat ? (
                                    <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                                      No. Peserta {assignedStudent?.participantNumber || '-'}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>
                        Pengaturan Penempatan Rombel
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                        Pola penempatan mengikuti kolom vertikal: jika setiap rombel memakai 1 kolom, siswa akan turun ke bawah per kolom, lalu kolom berikutnya tetap mengikuti urutan rombel yang sama secara selang.
                      </Text>
                    </View>
                    <Pressable
                      onPress={applyPlacementByClassOrder}
                      style={{
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: BRAND_COLORS.blue,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                        Terapkan Penempatan
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ gap: 10 }}>
                    {placementGroups.length === 0 ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: '#cbd5e1',
                          borderRadius: 14,
                          padding: 12,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textMuted }}>
                          Belum ada rombel siswa yang bisa dipetakan ke denah ini.
                        </Text>
                      </View>
                    ) : (
                      placementGroups.map((group, index) => (
                        <View
                          key={group.className}
                          style={{
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 14,
                            backgroundColor: '#f8fafc',
                            padding: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 14 }}>
                              {group.className}
                            </Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
                              {group.count} siswa • giliran kolom ke-{index + 1}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                              onPress={() => movePlacementClass(index, -1)}
                              disabled={index === 0}
                              style={{
                                borderWidth: 1,
                                borderColor: '#cbd5e1',
                                borderRadius: 10,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                backgroundColor: index === 0 ? '#f8fafc' : '#fff',
                                opacity: index === 0 ? 0.55 : 1,
                              }}
                            >
                              <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>Naik</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => movePlacementClass(index, 1)}
                              disabled={index === placementGroups.length - 1}
                              style={{
                                borderWidth: 1,
                                borderColor: '#cbd5e1',
                                borderRadius: 10,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                backgroundColor: index === placementGroups.length - 1 ? '#f8fafc' : '#fff',
                                opacity: index === placementGroups.length - 1 ? 0.55 : 1,
                              }}
                            >
                              <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>Turun</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))
                    )}
                  </View>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      borderRadius: 14,
                      padding: 12,
                      marginTop: 12,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Pola yang diterapkan</Text>
                    <Text style={{ color: '#1e40af', marginTop: 4, fontSize: 12, lineHeight: 18 }}>
                      Contoh: A1-E1 untuk rombel pertama, A2-E2 untuk rombel kedua, lalu kolom berikutnya kembali mengikuti urutan rombel yang sama sampai semua siswa terpasang.
                    </Text>
                  </View>

                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 12, marginBottom: 6 }}>
                    Catatan Denah
                  </Text>
                  <TextInput
                    value={draft.notes}
                    onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))}
                    multiline
                    placeholder="Tambahkan catatan umum untuk pengawas atau pelaksanaan di ruang ini."
                    placeholderTextColor="#94a3b8"
                    style={{
                      minHeight: 82,
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
              </>
            )}
          </>
        ) : null}
      </ScrollView>

      <MobileDetailModal
        visible={setupModalVisible}
        title="Setup Denah Ruang"
        subtitle="Atur ukuran grid awal lewat popup, lalu lanjutkan penyesuaian di editor penuh."
        iconName="grid"
        accentColor="#1d4ed8"
        onClose={() => setSetupModalVisible(false)}
      >
        {detailQuery.data ? (
          <View>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                borderRadius: 14,
                padding: 12,
                marginBottom: 14,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '800', fontSize: 15 }}>
                {detailQuery.data.sitting.roomName}
              </Text>
              <Text style={{ color: '#1e40af', marginTop: 4, fontSize: 12 }}>
                {formatScheduleSummary(detailQuery.data.sitting.startTime, detailQuery.data.sitting.endTime)}
              </Text>
              <Text style={{ color: '#1e40af', marginTop: 4, fontSize: 12 }}>
                {detailQuery.data.sitting.examType} •{' '}
                {formatSessionSummary(
                  detailQuery.data.sitting.programSession?.label || detailQuery.data.sitting.sessionLabel,
                )}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
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
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6, fontSize: 11 }}>
                  Memanjang ke samping
                </Text>
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
                <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6, fontSize: 11 }}>
                  Memanjang ke bawah
                </Text>
              </View>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: '#e2e8f0',
                backgroundColor: '#f8fafc',
                borderRadius: 12,
                padding: 12,
                marginTop: 12,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                {detailQuery.data.meta.studentCount} siswa pada ruang ini
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4, fontSize: 12 }}>
                Rekomendasi saat ini: {detailQuery.data.meta.suggestedDimensions.rows} x{' '}
                {detailQuery.data.meta.suggestedDimensions.columns}
              </Text>
            </View>

            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 12, marginBottom: 6 }}>
              Catatan Denah
            </Text>
            <TextInput
              value={generateNotes}
              onChangeText={setGenerateNotes}
              multiline
              placeholder="Contoh: baris tengah dijadikan lorong utama untuk pengawas."
              placeholderTextColor="#94a3b8"
              style={{
                minHeight: 88,
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
                marginTop: 14,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                backgroundColor: generateMutation.isPending ? '#94a3b8' : BRAND_COLORS.blue,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {generateMutation.isPending
                  ? 'Memproses...'
                  : detailQuery.data.layout
                    ? 'Generate Ulang Denah'
                    : 'Buat Denah Awal'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </MobileDetailModal>
    </>
  );
}
