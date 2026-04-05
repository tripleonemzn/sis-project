import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Layers3,
  Loader2,
  PencilRuler,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';
import type { AcademicYear } from '../../../services/academicYear.service';
import { examService, type ExamProgram } from '../../../services/exam.service';
import { isNonScheduledExamProgram } from '../../../lib/examProgramMenu';

type LayoutCellType = 'SEAT' | 'AISLE';

type SittingRow = {
  id: number;
  roomName: string;
  examType: string;
  academicYearId: number;
  semester?: 'ODD' | 'EVEN' | null;
  sessionLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  layout?: {
    id: number;
    rows: number;
    columns: number;
    generatedAt?: string | null;
    updatedAt?: string | null;
  } | null;
  _count?: {
    students: number;
  };
};

type LayoutStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  className?: string | null;
  seatLabel?: string | null;
};

type LayoutCell = {
  rowIndex: number;
  columnIndex: number;
  cellType: LayoutCellType;
  seatLabel?: string | null;
  studentId?: number | null;
  notes?: string | null;
  student?: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    className?: string | null;
  } | null;
};

type LayoutDetail = {
  sitting: {
    id: number;
    roomName: string;
    examType: string;
    academicYearId: number;
    semester?: 'ODD' | 'EVEN' | null;
    startTime?: string | null;
    endTime?: string | null;
    sessionLabel?: string | null;
    programSession?: {
      id: number;
      label: string;
      displayOrder?: number;
    } | null;
  };
  layout: {
    id: number;
    rows: number;
    columns: number;
    notes?: string | null;
    generatedAt?: string | null;
    updatedAt?: string | null;
    cells: LayoutCell[];
  } | null;
  students: LayoutStudent[];
  meta: {
    studentCount: number;
    suggestedDimensions: {
      rows: number;
      columns: number;
    };
    hasGeneratedLayout: boolean;
  };
};

type DraftCell = {
  rowIndex: number;
  columnIndex: number;
  cellType: LayoutCellType;
  seatLabel: string;
  studentId: number | null;
  notes: string;
};

type LayoutDraft = {
  rows: number;
  columns: number;
  notes: string;
  cells: DraftCell[];
};

const MAX_ROWS = 20;
const MAX_COLUMNS = 20;

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

function getSeatLabel(rowIndex: number, columnIndex: number) {
  let index = rowIndex;
  let label = '';
  do {
    label = String.fromCharCode(65 + (index % 26)) + label;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return `${label}${columnIndex + 1}`;
}

function buildPositionKey(rowIndex: number, columnIndex: number) {
  return `${rowIndex}:${columnIndex}`;
}

function sortLayoutCells(cells: DraftCell[]) {
  return [...cells].sort((a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex);
}

function clampGridSize(value: number, fallback: number, limit: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(limit, Math.trunc(value)));
}

function createDraftFromLayout(detail: LayoutDetail): LayoutDraft {
  const sourceCells = detail.layout?.cells || [];
  const cellMap = new Map<string, LayoutCell>();
  sourceCells.forEach((cell) => {
    cellMap.set(buildPositionKey(cell.rowIndex, cell.columnIndex), cell);
  });

  const rows = detail.layout?.rows || detail.meta.suggestedDimensions.rows;
  const columns = detail.layout?.columns || detail.meta.suggestedDimensions.columns;
  const cells: DraftCell[] = [];

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const sourceCell = cellMap.get(buildPositionKey(rowIndex, columnIndex));
      const cellType = sourceCell?.cellType || 'SEAT';
      cells.push({
        rowIndex,
        columnIndex,
        cellType,
        seatLabel:
          cellType === 'SEAT'
            ? String(sourceCell?.seatLabel || '').trim() || getSeatLabel(rowIndex, columnIndex)
            : '',
        studentId: typeof sourceCell?.studentId === 'number' ? sourceCell.studentId : null,
        notes: String(sourceCell?.notes || '').trim(),
      });
    }
  }

  return {
    rows,
    columns,
    notes: String(detail.layout?.notes || '').trim(),
    cells: sortLayoutCells(cells),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string } }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
}

function formatStudentMeta(student?: LayoutStudent | null) {
  if (!student) return '-';
  return [student.className, student.nis || student.nisn].filter(Boolean).join(' • ') || '-';
}

export default function ExamRoomLayoutManagementPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [programs, setPrograms] = useState<ExamProgram[]>([]);
  const [activeProgramCode, setActiveProgramCode] = useState('');
  const [sittings, setSittings] = useState<SittingRow[]>([]);
  const [selectedSittingId, setSelectedSittingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<LayoutDetail | null>(null);
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [selectedCellKey, setSelectedCellKey] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingSittings, setLoadingSittings] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateRows, setGenerateRows] = useState(4);
  const [generateColumns, setGenerateColumns] = useState(4);
  const [generateNotes, setGenerateNotes] = useState('');

  const visiblePrograms = useMemo(
    () =>
      programs
        .filter((program) => Boolean(program.isActive) && !isNonScheduledExamProgram(program))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'id-ID')),
    [programs],
  );

  const selectedSitting = useMemo(
    () => sittings.find((item) => item.id === selectedSittingId) || null,
    [sittings, selectedSittingId],
  );

  const selectedCell = useMemo(
    () => draft?.cells.find((cell) => buildPositionKey(cell.rowIndex, cell.columnIndex) === selectedCellKey) || null,
    [draft?.cells, selectedCellKey],
  );

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<number>();
    draft?.cells.forEach((cell) => {
      if (typeof cell.studentId === 'number' && cell.studentId > 0) {
        ids.add(cell.studentId);
      }
    });
    return ids;
  }, [draft]);

  const unassignedStudents = useMemo(
    () => (detail?.students || []).filter((student) => !assignedStudentIds.has(student.id)),
    [assignedStudentIds, detail?.students],
  );

  const seatStats = useMemo(() => {
    const seatCells = draft?.cells.filter((cell) => cell.cellType === 'SEAT') || [];
    const filledSeats = seatCells.filter((cell) => typeof cell.studentId === 'number' && cell.studentId > 0).length;
    return {
      totalSeats: seatCells.length,
      filledSeats,
      aisleCount: draft?.cells.filter((cell) => cell.cellType === 'AISLE').length || 0,
    };
  }, [draft]);

  const missingStudentsPreview = useMemo(() => {
    if (unassignedStudents.length === 0) return '';
    const names = unassignedStudents.slice(0, 3).map((student) => student.name);
    if (unassignedStudents.length <= 3) return names.join(', ');
    return `${names.join(', ')} +${unassignedStudents.length - 3} lainnya`;
  }, [unassignedStudents]);

  const filteredSittings = useMemo(() => {
    const keyword = roomSearch.trim().toLowerCase();
    if (!keyword) return sittings;
    return sittings.filter((sitting) => {
      const haystack = [
        sitting.roomName,
        sitting.sessionLabel,
        sitting.examType,
        String(sitting._count?.students || 0),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [roomSearch, sittings]);

  const gridRows = useMemo(() => {
    if (!draft) return [];
    const rows: DraftCell[][] = [];
    for (let rowIndex = 0; rowIndex < draft.rows; rowIndex += 1) {
      rows.push(
        draft.cells
          .filter((cell) => cell.rowIndex === rowIndex)
          .sort((a, b) => a.columnIndex - b.columnIndex),
      );
    }
    return rows;
  }, [draft]);

  const fetchInitialData = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const response = await api.get('/academic-years?limit=100');
      const rows = (response.data?.data?.academicYears || response.data?.data || []) as AcademicYear[];
      setAcademicYears(rows);
      const activeYear = rows.find((item) => item.isActive) || rows[0] || null;
      setSelectedAcademicYear(activeYear ? String(activeYear.id) : '');
    } catch (error) {
      console.error(error);
      toast.error('Gagal memuat tahun ajaran.');
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  const fetchPrograms = useCallback(async () => {
    if (!selectedAcademicYear) {
      setPrograms([]);
      setActiveProgramCode('');
      return;
    }

    try {
      const response = await examService.getPrograms({
        academicYearId: Number(selectedAcademicYear),
        roleContext: 'all',
        includeInactive: false,
      });
      const nextPrograms = response.data?.programs || [];
      const scheduledPrograms = nextPrograms.filter((program) => !isNonScheduledExamProgram(program));
      setPrograms(nextPrograms);
      setActiveProgramCode((previous) =>
        scheduledPrograms.some((program) => program.code === previous)
          ? previous
          : scheduledPrograms[0]?.code || '',
      );
    } catch (error) {
      console.error(error);
      setPrograms([]);
      setActiveProgramCode('');
      toast.error('Gagal memuat program ujian.');
    }
  }, [selectedAcademicYear]);

  const fetchSittings = useCallback(async () => {
    if (!selectedAcademicYear || !activeProgramCode) {
      setSittings([]);
      setSelectedSittingId(null);
      return;
    }

    setLoadingSittings(true);
    try {
      const response = await api.get('/exam-sittings', {
        params: {
          academicYearId: selectedAcademicYear,
          programCode: activeProgramCode,
        },
      });
      const rows = (response.data?.data || []) as SittingRow[];
      setSittings(rows);
      setSelectedSittingId((previous) => {
        if (rows.some((item) => item.id === previous)) return previous;
        return rows[0]?.id || null;
      });
    } catch (error) {
      console.error(error);
      setSittings([]);
      setSelectedSittingId(null);
      toast.error('Gagal memuat daftar ruang ujian.');
    } finally {
      setLoadingSittings(false);
    }
  }, [selectedAcademicYear, activeProgramCode]);

  const fetchLayoutDetail = useCallback(async (sittingId: number) => {
    setLoadingDetail(true);
    try {
      const response = await api.get(`/exam-sittings/${sittingId}/layout`);
      const nextDetail = response.data?.data as LayoutDetail;
      setDetail(nextDetail);
      setDraft(nextDetail.layout ? createDraftFromLayout(nextDetail) : null);
      setGenerateRows(nextDetail.layout?.rows || nextDetail.meta.suggestedDimensions.rows);
      setGenerateColumns(nextDetail.layout?.columns || nextDetail.meta.suggestedDimensions.columns);
      setGenerateNotes(String(nextDetail.layout?.notes || '').trim());
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, 'Gagal memuat detail denah ruang.'));
      setDetail(null);
      setDraft(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (!selectedAcademicYear) return;
    void fetchPrograms();
  }, [selectedAcademicYear, fetchPrograms]);

  useEffect(() => {
    void fetchSittings();
  }, [fetchSittings]);

  useEffect(() => {
    if (!selectedSittingId) {
      setDetail(null);
      setDraft(null);
      setSelectedCellKey('');
      return;
    }
    void fetchLayoutDetail(selectedSittingId);
  }, [selectedSittingId, fetchLayoutDetail]);

  useEffect(() => {
    if (!draft?.cells?.length) {
      setSelectedCellKey('');
      return;
    }
    setSelectedCellKey((current) => {
      const stillExists = draft.cells.some(
        (cell) => buildPositionKey(cell.rowIndex, cell.columnIndex) === current,
      );
      if (stillExists) return current;
      return buildPositionKey(draft.cells[0].rowIndex, draft.cells[0].columnIndex);
    });
  }, [draft]);

  const updateDraftCell = useCallback(
    (rowIndex: number, columnIndex: number, updater: (cell: DraftCell) => DraftCell) => {
      setDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          cells: current.cells.map((cell) =>
            cell.rowIndex === rowIndex && cell.columnIndex === columnIndex ? updater(cell) : cell,
          ),
        };
      });
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (!selectedSittingId) return;
    setGenerating(true);
    try {
      await api.post(`/exam-sittings/${selectedSittingId}/layout/generate`, {
        rows: clampGridSize(generateRows, detail?.meta.suggestedDimensions.rows || 1, MAX_ROWS),
        columns: clampGridSize(generateColumns, detail?.meta.suggestedDimensions.columns || 1, MAX_COLUMNS),
        notes: generateNotes.trim() || null,
      });
      toast.success('Denah ruang berhasil digenerate.');
      setIsGenerateModalOpen(false);
      await fetchLayoutDetail(selectedSittingId);
      await fetchSittings();
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, 'Gagal generate denah ruang.'));
    } finally {
      setGenerating(false);
    }
  }, [
    detail?.meta.suggestedDimensions.columns,
    detail?.meta.suggestedDimensions.rows,
    fetchLayoutDetail,
    fetchSittings,
    generateColumns,
    generateNotes,
    generateRows,
    selectedSittingId,
  ]);

  const handleSave = useCallback(async () => {
    if (!selectedSittingId || !draft) return;
    setSaving(true);
    try {
      await api.put(`/exam-sittings/${selectedSittingId}/layout`, {
        rows: draft.rows,
        columns: draft.columns,
        notes: draft.notes.trim() || null,
        cells: draft.cells.map((cell) => ({
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          cellType: cell.cellType,
          seatLabel:
            cell.cellType === 'SEAT'
              ? cell.seatLabel.trim() || getSeatLabel(cell.rowIndex, cell.columnIndex)
              : null,
          studentId: cell.cellType === 'SEAT' ? cell.studentId : null,
          notes: cell.notes.trim() || null,
        })),
      });
      toast.success('Denah ruang berhasil disimpan.');
      await fetchLayoutDetail(selectedSittingId);
      await fetchSittings();
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, 'Gagal menyimpan denah ruang.'));
    } finally {
      setSaving(false);
    }
  }, [draft, fetchLayoutDetail, fetchSittings, selectedSittingId]);

  const handleRefresh = useCallback(() => {
    void fetchSittings();
    if (selectedSittingId) {
      void fetchLayoutDetail(selectedSittingId);
    }
  }, [fetchLayoutDetail, fetchSittings, selectedSittingId]);

  if (loadingInitial) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
        Memuat data denah ruang ujian...
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Generate Denah Ruang</h2>
            <p className="mt-1 text-sm text-gray-500">
              Pilih ruang ujian, lakukan setup denah lewat popup, lalu edit posisi kursi secara fokus di area editor penuh.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Muat Ulang
          </button>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tahun Ajaran
              </label>
              <select
                value={selectedAcademicYear}
                onChange={(event) => setSelectedAcademicYear(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {academicYears.map((academicYear) => (
                  <option key={academicYear.id} value={academicYear.id}>
                    {academicYear.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Program Ujian
              </label>
              <div className="flex flex-wrap gap-2">
                {visiblePrograms.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500">
                    Belum ada program ujian terjadwal.
                  </div>
                ) : (
                  visiblePrograms.map((program) => {
                    const isActive = activeProgramCode === program.code;
                    return (
                      <button
                        key={program.code}
                        type="button"
                        onClick={() => setActiveProgramCode(program.code)}
                        className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800'
                        }`}
                      >
                        {program.label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Daftar Ruang Ujian</h3>
              <p className="mt-1 text-sm text-gray-500">
                Pilih ruang yang ingin diedit. Setup denah dilakukan dari editor agar halaman tetap rapi.
              </p>
            </div>
            <div className="w-full lg:max-w-sm">
              <input
                type="text"
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
                placeholder="Cari ruang, sesi, atau program..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {loadingSittings ? (
              <div className="px-5 py-10 text-center text-sm text-gray-500">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
                Memuat daftar ruang ujian...
              </div>
            ) : filteredSittings.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-500">
                Belum ada data ruang ujian yang sesuai dengan filter.
              </div>
            ) : (
              filteredSittings.map((sitting) => {
                const isActive = sitting.id === selectedSittingId;
                const hasLayout = Boolean(sitting.layout?.id);
                return (
                  <div
                    key={sitting.id}
                    className={`flex flex-col gap-4 px-5 py-4 transition-colors lg:flex-row lg:items-center lg:justify-between ${
                      isActive ? 'bg-blue-50/60' : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-gray-900">{sitting.roomName}</div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            hasLayout ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {hasLayout ? 'Siap Edit' : 'Belum Digenerate'}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        {formatDateTime(sitting.startTime)} - {formatDateTime(sitting.endTime)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">
                          {sitting._count?.students || 0} siswa
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">
                          {sitting.sessionLabel || '-'}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">{sitting.examType}</span>
                        {sitting.layout ? (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">
                            {sitting.layout.rows} x {sitting.layout.columns}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSittingId(sitting.id)}
                        className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold ${
                          isActive
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {isActive ? 'Sedang Dibuka' : 'Buka Editor'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {loadingDetail ? (
          <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
            Memuat detail denah ruang...
          </div>
        ) : !selectedSitting ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Pilih salah satu ruang ujian untuk membuka editor denah penuh.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    <Layers3 className="mr-2 h-3.5 w-3.5" />
                    {selectedSitting.roomName}
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-gray-900">
                    {detail?.sitting.examType || selectedSitting.examType}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatDateTime(detail?.sitting.startTime || selectedSitting.startTime)} -{' '}
                    {formatDateTime(detail?.sitting.endTime || selectedSitting.endTime)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Sesi:{' '}
                    {detail?.sitting.programSession?.label ||
                      detail?.sitting.sessionLabel ||
                      selectedSitting.sessionLabel ||
                      '-'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsGenerateModalOpen(true)}
                    className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <PencilRuler className="mr-2 h-4 w-4" />
                    {detail?.layout ? 'Setup Ulang Denah' : 'Setup Denah'}
                  </button>
                  {draft ? (
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Simpan Denah
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600">
                <span className="rounded-full bg-gray-100 px-2.5 py-1">
                  {detail?.meta.studentCount || selectedSitting._count?.students || 0} peserta
                </span>
                {draft ? (
                  <>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1">
                      {seatStats.totalSeats} kursi
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1">
                      {seatStats.filledSeats} terisi
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1">
                      {seatStats.aisleCount} lorong
                    </span>
                  </>
                ) : null}
                {detail?.layout ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">
                    Update {formatDateTime(detail.layout.updatedAt || detail.layout.generatedAt)}
                  </span>
                ) : null}
              </div>
            </div>

            {!draft ? (
              <div className="rounded-xl border border-dashed border-blue-200 bg-white p-10 text-center shadow-sm">
                <Sparkles className="mx-auto h-10 w-10 text-blue-600" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900">Denah Belum Dibuat</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Setup denah melalui popup agar jumlah baris, kolom, dan catatan awal tetap rapi sebelum editor dibuka penuh.
                </p>
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(true)}
                  className="mt-5 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Setup Denah
                </button>
              </div>
            ) : (
              <>
                <div
                  className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
                    unassignedStudents.length > 0
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {unassignedStudents.length > 0 ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold">
                        {unassignedStudents.length > 0
                          ? `${unassignedStudents.length} siswa belum ditempatkan`
                          : 'Semua siswa sudah mendapat kursi'}
                      </div>
                      <div className="mt-1 text-xs">
                        {unassignedStudents.length > 0
                          ? `Kursi yang belum terisi diberi penanda warna amber. ${missingStudentsPreview}`
                          : 'Denah siap dipakai untuk kartu ujian dan penempatan ruang.'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-5 py-4">
                    <h3 className="text-lg font-semibold text-gray-900">Editor Denah</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Klik satu kursi untuk mengubah jenis sel, label kursi, dan penempatan siswa. Area editor dibuat penuh agar denah lebih mudah dibaca.
                    </p>
                  </div>

                  <div className="overflow-x-auto px-5 py-5">
                    <div className="inline-flex min-w-full flex-col gap-3">
                      {gridRows.map((row, rowIndex) => (
                        <div key={`row-${rowIndex}`} className="flex gap-3">
                          {row.map((cell) => {
                            const currentStudent =
                              detail?.students.find((student) => student.id === cell.studentId) || null;
                            const isSelected =
                              buildPositionKey(cell.rowIndex, cell.columnIndex) === selectedCellKey;
                            const isSeat = cell.cellType === 'SEAT';
                            const isEmptySeat = isSeat && !currentStudent;

                            return (
                              <button
                                key={`${cell.rowIndex}-${cell.columnIndex}`}
                                type="button"
                                onClick={() => setSelectedCellKey(buildPositionKey(cell.rowIndex, cell.columnIndex))}
                                className={`min-h-[132px] w-[168px] rounded-2xl border p-4 text-left transition-all ${
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                                    : isSeat
                                      ? isEmptySeat
                                        ? 'border-amber-200 bg-amber-50/80 hover:border-amber-300'
                                        : 'border-blue-100 bg-white hover:border-blue-200'
                                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                      isSeat
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {isSeat ? cell.seatLabel || getSeatLabel(cell.rowIndex, cell.columnIndex) : 'LORONG'}
                                  </span>
                                  <span className="text-[11px] font-medium text-gray-400">
                                    {cell.rowIndex + 1}-{cell.columnIndex + 1}
                                  </span>
                                </div>

                                <div className="mt-4">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {isSeat ? currentStudent?.name || 'Belum ditempatkan' : 'Ruang kosong / lorong'}
                                  </div>
                                  <div className="mt-2 text-xs text-gray-500">
                                    {isSeat
                                      ? currentStudent
                                        ? formatStudentMeta(currentStudent)
                                        : 'Pilih siswa dari panel editor di bawah.'
                                      : 'Gunakan untuk jalur pengawas atau jarak antar kursi.'}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedCell ? (
                  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Editor Sel {getSeatLabel(selectedCell.rowIndex, selectedCell.columnIndex)}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Perubahan dilakukan di panel ini agar grid tetap bersih dan mudah dibaca.
                        </p>
                      </div>
                      <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                        Posisi {selectedCell.rowIndex + 1}-{selectedCell.columnIndex + 1}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Jenis Sel
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {(['SEAT', 'AISLE'] as LayoutCellType[]).map((type) => {
                              const active = selectedCell.cellType === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() =>
                                    updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) =>
                                      type === 'AISLE'
                                        ? { ...cell, cellType: 'AISLE', seatLabel: '', studentId: null }
                                        : {
                                            ...cell,
                                            cellType: 'SEAT',
                                            seatLabel:
                                              cell.seatLabel ||
                                              getSeatLabel(selectedCell.rowIndex, selectedCell.columnIndex),
                                          },
                                    )
                                  }
                                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                                    active
                                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {type === 'SEAT' ? 'Kursi' : 'Lorong'}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {selectedCell.cellType === 'SEAT' ? (
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Label Kursi
                            </label>
                            <input
                              type="text"
                              value={selectedCell.seatLabel}
                              onChange={(event) =>
                                updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) => ({
                                  ...cell,
                                  seatLabel: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              placeholder={getSeatLabel(selectedCell.rowIndex, selectedCell.columnIndex)}
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-4">
                        {selectedCell.cellType === 'SEAT' ? (
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Siswa
                              </label>
                              <select
                                value={selectedCell.studentId || ''}
                                onChange={(event) =>
                                  updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) => ({
                                    ...cell,
                                    studentId: event.target.value ? Number(event.target.value) : null,
                                  }))
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              >
                                <option value="">Belum dipasang</option>
                                {(detail?.students || []).map((student) => {
                                  const isUsedByOtherSeat =
                                    assignedStudentIds.has(student.id) && student.id !== selectedCell.studentId;
                                  return (
                                    <option
                                      key={student.id}
                                      value={student.id}
                                      disabled={isUsedByOtherSeat}
                                    >
                                      {[student.className, student.name].filter(Boolean).join(' • ')}
                                    </option>
                                  );
                                })}
                              </select>
                              <p className="mt-2 text-xs text-gray-500">
                                {unassignedStudents.length > 0
                                  ? `${unassignedStudents.length} siswa belum ditempatkan.`
                                  : 'Semua siswa sudah ditempatkan.'}
                              </p>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                              {selectedCell.studentId ? (
                                (() => {
                                  const currentStudent =
                                    detail?.students.find((student) => student.id === selectedCell.studentId) || null;
                                  return currentStudent ? (
                                    <>
                                      <div className="font-semibold text-gray-900">{currentStudent.name}</div>
                                      <div className="mt-1 text-xs">{formatStudentMeta(currentStudent)}</div>
                                    </>
                                  ) : (
                                    <div>Siswa tidak ditemukan.</div>
                                  );
                                })()
                              ) : (
                                <div>Kursi ini belum ditempati siswa.</div>
                              )}
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Catatan Sel
                          </label>
                          <textarea
                            value={selectedCell.notes}
                            onChange={(event) =>
                              updateDraftCell(selectedCell.rowIndex, selectedCell.columnIndex, (cell) => ({
                                ...cell,
                                notes: event.target.value,
                              }))
                            }
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Contoh: kursi cadangan, lorong pengawas, atau catatan khusus."
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Catatan Denah
                          </label>
                          <textarea
                            value={draft.notes}
                            onChange={(event) =>
                              setDraft((current) =>
                                current ? { ...current, notes: event.target.value } : current,
                              )
                            }
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Tambahkan catatan umum untuk pengawas atau pelaksanaan di ruang ini."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      {isGenerateModalOpen && selectedSitting ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onClick={() => setIsGenerateModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Setup Denah Ruang</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Atur ukuran grid awal di popup ini, lalu lanjutkan penyempurnaan pada editor penuh.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                <div className="font-semibold">{selectedSitting.roomName}</div>
                <div className="mt-1">
                  {formatDateTime(selectedSitting.startTime)} - {formatDateTime(selectedSitting.endTime)}
                </div>
                <div className="mt-1">
                  {selectedSitting.examType} • Sesi {selectedSitting.sessionLabel || '-'}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Baris
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={MAX_ROWS}
                    value={generateRows}
                    onChange={(event) =>
                      setGenerateRows(
                        clampGridSize(Number(event.target.value), generateRows || 1, MAX_ROWS),
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Kolom
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={MAX_COLUMNS}
                    value={generateColumns}
                    onChange={(event) =>
                      setGenerateColumns(
                        clampGridSize(Number(event.target.value), generateColumns || 1, MAX_COLUMNS),
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Peserta
                  </label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {detail?.meta.studentCount || selectedSitting._count?.students || 0} siswa
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Rekomendasi saat ini: {detail?.meta.suggestedDimensions.rows || 0} x{' '}
                    {detail?.meta.suggestedDimensions.columns || 0}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Catatan Denah
                </label>
                <textarea
                  value={generateNotes}
                  onChange={(event) => setGenerateNotes(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Contoh: baris tengah dijadikan lorong utama untuk pengawas."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {detail?.layout ? 'Generate Ulang Denah' : 'Buat Denah Awal'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
