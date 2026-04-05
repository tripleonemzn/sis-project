import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers3, Loader2, RefreshCw, Save, Sparkles } from 'lucide-react';
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

function resizeDraft(draft: LayoutDraft, nextRows: number, nextColumns: number): LayoutDraft {
  const normalizedRows = Math.max(1, Math.min(MAX_ROWS, nextRows));
  const normalizedColumns = Math.max(1, Math.min(MAX_COLUMNS, nextColumns));
  const currentMap = new Map<string, DraftCell>();
  draft.cells.forEach((cell) => {
    currentMap.set(buildPositionKey(cell.rowIndex, cell.columnIndex), cell);
  });

  const nextCells: DraftCell[] = [];
  for (let rowIndex = 0; rowIndex < normalizedRows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < normalizedColumns; columnIndex += 1) {
      const existing = currentMap.get(buildPositionKey(rowIndex, columnIndex));
      const cellType = existing?.cellType || 'SEAT';
      nextCells.push({
        rowIndex,
        columnIndex,
        cellType,
        seatLabel:
          cellType === 'SEAT'
            ? String(existing?.seatLabel || '').trim() || getSeatLabel(rowIndex, columnIndex)
            : '',
        studentId: existing?.studentId ?? null,
        notes: existing?.notes || '',
      });
    }
  }

  return {
    ...draft,
    rows: normalizedRows,
    columns: normalizedColumns,
    cells: sortLayoutCells(nextCells),
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string } }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
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
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingSittings, setLoadingSittings] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
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
    () =>
      (detail?.students || []).filter((student) => !assignedStudentIds.has(student.id)),
    [assignedStudentIds, detail?.students],
  );

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
      return;
    }
    void fetchLayoutDetail(selectedSittingId);
  }, [selectedSittingId, fetchLayoutDetail]);

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
        rows: generateRows,
        columns: generateColumns,
        notes: generateNotes.trim() || null,
      });
      toast.success('Denah ruang berhasil digenerate.');
      await fetchLayoutDetail(selectedSittingId);
      await fetchSittings();
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, 'Gagal generate denah ruang.'));
    } finally {
      setGenerating(false);
    }
  }, [fetchLayoutDetail, fetchSittings, generateColumns, generateNotes, generateRows, selectedSittingId]);

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
          seatLabel: cell.cellType === 'SEAT' ? cell.seatLabel.trim() || getSeatLabel(cell.rowIndex, cell.columnIndex) : null,
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

  if (loadingInitial) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
        Memuat data denah ruang ujian...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Generate Denah Ruang</h2>
          <p className="mt-1 text-sm text-gray-500">
            Generate denah awal per ruang ujian, lalu edit kursi, label bangku, dan penempatan siswa secara fleksibel.
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tahun Ajaran</label>
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Program Ujian</label>
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

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Daftar Ruang Ujian</h3>
            <p className="mt-1 text-xs text-gray-500">
              {loadingSittings ? 'Memuat daftar ruang...' : `${sittings.length} ruang ujian untuk program terpilih.`}
            </p>
          </div>
          <div className="max-h-[820px] overflow-y-auto p-4 space-y-3">
            {loadingSittings ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                Memuat ruang ujian...
              </div>
            ) : sittings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                Belum ada ruang ujian untuk program ini.
              </div>
            ) : (
              sittings.map((sitting) => {
                const isActive = sitting.id === selectedSittingId;
                const hasLayout = Boolean(sitting.layout?.id);
                return (
                  <button
                    key={sitting.id}
                    type="button"
                    onClick={() => setSelectedSittingId(sitting.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-50/70'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{sitting.roomName}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {formatDateTime(sitting.startTime)} - {formatDateTime(sitting.endTime)}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          hasLayout ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {hasLayout ? 'Siap Edit' : 'Belum Digenerate'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-600">
                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {sitting._count?.students || 0} siswa
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {sitting.sessionLabel || '-'}
                      </span>
                      {sitting.layout ? (
                        <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">
                          {sitting.layout.rows} x {sitting.layout.columns}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selectedSitting ? (
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    <Layers3 className="mr-2 h-3.5 w-3.5" />
                    {selectedSitting.roomName}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-gray-900">
                    {detail?.sitting.examType || selectedSitting.examType}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatDateTime(detail?.sitting.startTime || selectedSitting.startTime)} -{' '}
                    {formatDateTime(detail?.sitting.endTime || selectedSitting.endTime)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Sesi: {detail?.sitting.programSession?.label || detail?.sitting.sessionLabel || selectedSitting.sessionLabel || '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  <div>{detail?.meta.studentCount || selectedSitting._count?.students || 0} siswa</div>
                  <div className="mt-1">
                    {detail?.layout
                      ? `Denah ${detail.layout.rows} x ${detail.layout.columns}`
                      : `Saran awal ${detail?.meta.suggestedDimensions.rows || 0} x ${detail?.meta.suggestedDimensions.columns || 0}`}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {loadingDetail ? (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
              Memuat detail denah ruang...
            </div>
          ) : !selectedSitting ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              Pilih salah satu ruang ujian untuk mulai mengelola denah.
            </div>
          ) : !detail?.layout ? (
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Generate Denah Awal</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Denah awal akan mengisi kursi secara berurutan berdasarkan daftar siswa ruang ini. Setelah generate, Anda tetap bisa mengedit kursi satu per satu.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Baris</label>
                  <input
                    type="number"
                    min={1}
                    max={MAX_ROWS}
                    value={generateRows}
                    onChange={(event) => setGenerateRows(Math.max(1, Math.min(MAX_ROWS, Number(event.target.value) || 1)))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Kolom</label>
                  <input
                    type="number"
                    min={1}
                    max={MAX_COLUMNS}
                    value={generateColumns}
                    onChange={(event) => setGenerateColumns(Math.max(1, Math.min(MAX_COLUMNS, Number(event.target.value) || 1)))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Siswa</label>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {detail?.meta.studentCount || 0} peserta
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Catatan Denah</label>
                <textarea
                  value={generateNotes}
                  onChange={(event) => setGenerateNotes(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Contoh: Jalur tengah dikosongkan untuk pengawas."
                />
              </div>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate Denah
              </button>
            </div>
          ) : draft ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="grid gap-3 md:grid-cols-3 xl:w-[420px]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Baris</label>
                      <input
                        type="number"
                        min={1}
                        max={MAX_ROWS}
                        value={draft.rows}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? resizeDraft(current, Number(event.target.value) || 1, current.columns)
                              : current,
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Kolom</label>
                      <input
                        type="number"
                        min={1}
                        max={MAX_COLUMNS}
                        value={draft.columns}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? resizeDraft(current, current.rows, Number(event.target.value) || 1)
                              : current,
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Generate Ulang</label>
                      <button
                        type="button"
                        onClick={() => void handleGenerate()}
                        disabled={generating}
                        className="inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Generate Ulang
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Simpan Denah
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Catatan Denah</label>
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Tambahkan catatan penempatan atau instruksi untuk pengawas."
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm overflow-auto">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Editor Denah</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Ubah tipe sel menjadi lorong atau kursi, atur label bangku, lalu pasangkan siswa sesuai kebutuhan ruang.
                      </p>
                    </div>
                  </div>
                  <div className="min-w-[920px] space-y-3">
                    {gridRows.map((row, rowIndex) => (
                      <div key={`row-${rowIndex}`} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${draft.columns}, minmax(0, 1fr))` }}>
                        {row.map((cell) => {
                          const currentStudent = detail.students.find((student) => student.id === cell.studentId) || null;
                          return (
                            <div
                              key={`${cell.rowIndex}-${cell.columnIndex}`}
                              className={`rounded-xl border p-3 ${
                                cell.cellType === 'SEAT' ? 'border-blue-100 bg-blue-50/50' : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Sel {cell.rowIndex + 1}-{cell.columnIndex + 1}
                                </div>
                                <select
                                  value={cell.cellType}
                                  onChange={(event) =>
                                    updateDraftCell(cell.rowIndex, cell.columnIndex, (current) => {
                                      const nextType = event.target.value as LayoutCellType;
                                      return {
                                        ...current,
                                        cellType: nextType,
                                        seatLabel: nextType === 'SEAT' ? current.seatLabel || getSeatLabel(cell.rowIndex, cell.columnIndex) : '',
                                        studentId: nextType === 'SEAT' ? current.studentId : null,
                                      };
                                    })
                                  }
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                                >
                                  <option value="SEAT">Kursi</option>
                                  <option value="AISLE">Lorong</option>
                                </select>
                              </div>

                              {cell.cellType === 'SEAT' ? (
                                <div className="space-y-2">
                                  <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Label Kursi</label>
                                    <input
                                      type="text"
                                      value={cell.seatLabel}
                                      onChange={(event) =>
                                        updateDraftCell(cell.rowIndex, cell.columnIndex, (current) => ({
                                          ...current,
                                          seatLabel: event.target.value,
                                        }))
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Siswa</label>
                                    <select
                                      value={cell.studentId || ''}
                                      onChange={(event) =>
                                        updateDraftCell(cell.rowIndex, cell.columnIndex, (current) => ({
                                          ...current,
                                          studentId: event.target.value ? Number(event.target.value) : null,
                                        }))
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    >
                                      <option value="">Belum dipasang</option>
                                      {detail.students.map((student) => {
                                        const isUsedByOtherSeat =
                                          assignedStudentIds.has(student.id) && student.id !== cell.studentId;
                                        return (
                                          <option key={student.id} value={student.id} disabled={isUsedByOtherSeat}>
                                            {[student.className, student.name].filter(Boolean).join(' • ')}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                  <div className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-gray-600 min-h-[54px]">
                                    {currentStudent ? (
                                      <>
                                        <div className="font-semibold text-gray-800">{currentStudent.name}</div>
                                        <div className="mt-1">
                                          {[currentStudent.className, currentStudent.nis || currentStudent.nisn].filter(Boolean).join(' • ')}
                                        </div>
                                      </>
                                    ) : (
                                      <span>Kursi ini belum ditempati siswa.</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
                                  Sel ini dipakai sebagai lorong / ruang kosong.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900">Siswa Belum Dipasang</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Pastikan semua siswa sudah mendapatkan kursi sebelum denah dipakai.
                    </p>
                    <div className="mt-4 space-y-2">
                      {unassignedStudents.length === 0 ? (
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                          Semua siswa sudah terpasang di denah.
                        </div>
                      ) : (
                        unassignedStudents.map((student) => (
                          <div key={student.id} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                            <div className="font-semibold text-amber-900">{student.name}</div>
                            <div className="mt-1 text-xs">
                              {[student.className, student.nis || student.nisn].filter(Boolean).join(' • ')}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900">Ringkasan Denah</h3>
                    <div className="mt-4 space-y-2 text-sm text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Total kursi</span>
                        <span className="font-semibold text-gray-900">
                          {draft.cells.filter((cell) => cell.cellType === 'SEAT').length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Kursi terisi</span>
                        <span className="font-semibold text-gray-900">
                          {draft.cells.filter((cell) => cell.cellType === 'SEAT' && cell.studentId).length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Lorong / kosong</span>
                        <span className="font-semibold text-gray-900">
                          {draft.cells.filter((cell) => cell.cellType === 'AISLE').length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
