import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  Loader2,
  Layers3,
  PencilRuler,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import api from '../../../services/api';
import { examService, type ExamProgram } from '../../../services/exam.service';
import { isNonScheduledExamProgram } from '../../../lib/examProgramMenu';
import { compareExamRoomName } from '../../../lib/examRoomSort';

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
  participantNumber?: string | null;
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
    participantNumber?: string | null;
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

type PlacementPlan = {
  className: string;
  startColumn: number;
  columnSpan: number;
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

function getProgramTabIcon(programCode: string) {
  const normalized = String(programCode || '').trim().toUpperCase();
  if (normalized === 'SBTS') return CalendarRange;
  if (normalized === 'SAS') return FileSpreadsheet;
  if (normalized === 'SAT') return GraduationCap;
  if (normalized === 'ASAJ') return ClipboardCheck;
  if (normalized === 'ASAJP') return Briefcase;
  return ClipboardList;
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

function compareSessionLabel(a?: string | null, b?: string | null) {
  return String(a || '').localeCompare(String(b || ''), 'id-ID', {
    numeric: true,
    sensitivity: 'base',
  });
}

function getStudentClassName(student?: LayoutStudent | null) {
  const value = String(student?.className || '').trim();
  return value || 'Tanpa Rombel';
}

function buildPlacementGroupsFromStudents(
  students: LayoutStudent[],
  placementClassOrder: string[],
) {
  const classMap = new Map<string, LayoutStudent[]>();
  students.forEach((student) => {
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
}

function clampPlacementPlan(plan: PlacementPlan, totalColumns: number): PlacementPlan {
  const startColumn = clampGridSize(plan.startColumn, 1, Math.max(1, totalColumns));
  const maxSpan = Math.max(1, totalColumns - startColumn + 1);
  return {
    ...plan,
    startColumn,
    columnSpan: clampGridSize(plan.columnSpan, 1, maxSpan),
  };
}

function getPlacementPlanColumnIndexes(plan: PlacementPlan, totalColumns: number) {
  const normalizedPlan = clampPlacementPlan(plan, totalColumns);
  return Array.from({ length: normalizedPlan.columnSpan }, (_, index) => normalizedPlan.startColumn - 1 + index).filter(
    (columnIndex) => columnIndex >= 0 && columnIndex < totalColumns,
  );
}

function formatPlacementSeatRange(plan: PlacementPlan, totalRows: number, totalColumns: number) {
  const columnIndexes = getPlacementPlanColumnIndexes(plan, totalColumns);
  if (columnIndexes.length === 0 || totalRows <= 0) return '-';
  return columnIndexes
    .map((columnIndex) => `${getSeatLabel(0, columnIndex)}-${getSeatLabel(totalRows - 1, columnIndex)}`)
    .join(', ');
}

function validatePlacementPlans(plans: PlacementPlan[], totalColumns: number) {
  const usage = new Map<number, string>();
  for (const plan of plans) {
    const columnIndexes = getPlacementPlanColumnIndexes(plan, totalColumns);
    for (const columnIndex of columnIndexes) {
      const existingClassName = usage.get(columnIndex);
      if (existingClassName && existingClassName !== plan.className) {
        return `Kolom ${columnIndex + 1} dipakai ganda oleh ${existingClassName} dan ${plan.className}.`;
      }
      usage.set(columnIndex, plan.className);
    }
  }
  return null;
}

function applyPlacementPlansToDraft(params: {
  draft: LayoutDraft;
  placementGroups: Array<{ className: string; students: LayoutStudent[] }>;
  placementPlans: PlacementPlan[];
}) {
  const { draft, placementGroups, placementPlans } = params;
  const seatColumns = Array.from({ length: draft.columns }, (_, columnIndex) =>
    draft.cells
      .filter((cell) => cell.columnIndex === columnIndex && cell.cellType === 'SEAT')
      .sort((a, b) => a.rowIndex - b.rowIndex),
  );

  const nextAssignments = new Map<string, number | null>();
  const claimedColumns = new Set<number>();
  const planMap = new Map(placementPlans.map((plan) => [plan.className, clampPlacementPlan(plan, draft.columns)]));
  const remainingByGroup = new Map<string, LayoutStudent[]>(
    placementGroups.map((group) => [group.className, [...group.students]]),
  );
  const groupOrder = placementGroups.map((group) => group.className);

  draft.cells.forEach((cell) => {
    if (cell.cellType === 'SEAT') {
      nextAssignments.set(buildPositionKey(cell.rowIndex, cell.columnIndex), null);
    }
  });

  placementGroups.forEach((group) => {
    const plan = planMap.get(group.className);
    const queue = remainingByGroup.get(group.className) || [];
    const targetColumns = plan
      ? getPlacementPlanColumnIndexes(plan, draft.columns).filter(
          (columnIndex) => !claimedColumns.has(columnIndex) && seatColumns[columnIndex]?.length > 0,
        )
      : [];

    targetColumns.forEach((columnIndex) => {
      claimedColumns.add(columnIndex);
      seatColumns[columnIndex].forEach((cell) => {
        const student = queue.shift() || null;
        nextAssignments.set(buildPositionKey(cell.rowIndex, cell.columnIndex), student?.id || null);
      });
    });
  });

  const remainingColumns = seatColumns
    .map((column, columnIndex) => ({ column, columnIndex }))
    .filter(({ column, columnIndex }) => column.length > 0 && !claimedColumns.has(columnIndex));

  let groupCursor = 0;
  remainingColumns.forEach((nextColumn) => {
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
    nextColumn.column.forEach((cell) => {
      const student = queue.shift() || null;
      nextAssignments.set(buildPositionKey(cell.rowIndex, cell.columnIndex), student?.id || null);
    });
  });

  return {
    ...draft,
    cells: draft.cells.map((cell) =>
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
  };
}

export default function ExamRoomLayoutManagementPage() {
  const { data: activeAcademicYear, isLoading: loadingActiveAcademicYear } = useActiveAcademicYear();
  const selectedAcademicYear = activeAcademicYear?.id ? String(activeAcademicYear.id) : '';
  const [programs, setPrograms] = useState<ExamProgram[]>([]);
  const [activeProgramCode, setActiveProgramCode] = useState('');
  const [sittings, setSittings] = useState<SittingRow[]>([]);
  const [selectedSittingId, setSelectedSittingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<LayoutDetail | null>(null);
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [loadingSittings, setLoadingSittings] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [placementClassOrder, setPlacementClassOrder] = useState<string[]>([]);
  const [placementPlans, setPlacementPlans] = useState<PlacementPlan[]>([]);
  const [generateRows, setGenerateRows] = useState(4);
  const [generateColumns, setGenerateColumns] = useState(4);
  const [generateNotes, setGenerateNotes] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN'>(
    activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD',
  );

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
  const activeProgram = useMemo(
    () => visiblePrograms.find((program) => program.code === activeProgramCode) || null,
    [visiblePrograms, activeProgramCode],
  );
  const effectiveSemester = activeProgram?.fixedSemester || selectedSemester || (activeAcademicYear?.semester === 'EVEN' ? 'EVEN' : 'ODD');

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

  const placementGroups = useMemo(() => {
    return buildPlacementGroupsFromStudents(detail?.students || [], placementClassOrder);
  }, [detail?.students, placementClassOrder]);

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
          semester: effectiveSemester,
        },
      });
      const rows = ((response.data?.data || []) as SittingRow[]).sort(
        (a, b) =>
          compareExamRoomName(a.roomName, b.roomName) ||
          compareSessionLabel(a.sessionLabel, b.sessionLabel) ||
          (() => {
            const timeA = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
            const timeB = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
            return timeA - timeB;
          })() ||
          Number(a.id || 0) - Number(b.id || 0),
      );
      setSittings(rows);
      setSelectedSittingId((previous) => {
        if (rows.some((item) => item.id === previous)) return previous;
        return null;
      });
    } catch (error) {
      console.error(error);
      setSittings([]);
      setSelectedSittingId(null);
      toast.error('Gagal memuat daftar ruang ujian.');
    } finally {
      setLoadingSittings(false);
    }
  }, [selectedAcademicYear, activeProgramCode, effectiveSemester]);

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
      return nextDetail;
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, 'Gagal memuat detail denah ruang.'));
      setDetail(null);
      setDraft(null);
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedAcademicYear) return;
    void fetchPrograms();
  }, [selectedAcademicYear, fetchPrograms]);

  useEffect(() => {
    if (activeProgram?.fixedSemester) {
      setSelectedSemester(activeProgram.fixedSemester);
      return;
    }
    if (activeAcademicYear?.semester === 'ODD' || activeAcademicYear?.semester === 'EVEN') {
      setSelectedSemester(activeAcademicYear.semester);
    }
  }, [activeAcademicYear?.semester, activeProgram?.fixedSemester]);

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

  useEffect(() => {
    if (selectedSittingId) return;
    setIsEditorModalOpen(false);
  }, [selectedSittingId]);

  useEffect(() => {
    const nextLabels = Array.from(
      new Set((detail?.students || []).map((student) => getStudentClassName(student))),
    ).sort(compareClassName);
    setPlacementClassOrder((current) => {
      const preserved = current.filter((label) => nextLabels.includes(label));
      const additions = nextLabels.filter((label) => !preserved.includes(label));
      return [...preserved, ...additions];
    });
  }, [detail?.students]);

  useEffect(() => {
    const totalColumns = Math.max(
      1,
      Number(draft?.columns || generateColumns || detail?.meta.suggestedDimensions.columns || 1),
    );
    const nextLabels = placementGroups.map((group) => group.className);
    setPlacementPlans((current) => {
      const nextPlans = nextLabels.map((className, index) => {
        const existingPlan = current.find((item) => item.className === className);
        return clampPlacementPlan(
          existingPlan || {
            className,
            startColumn: Math.min(index + 1, totalColumns),
            columnSpan: 1,
          },
          totalColumns,
        );
      });
      return nextPlans;
    });
  }, [detail?.meta.suggestedDimensions.columns, draft?.columns, generateColumns, placementGroups]);

  const handleGenerate = useCallback(async () => {
    if (!selectedSittingId) return;
    const plannedRows = clampGridSize(generateRows, detail?.meta.suggestedDimensions.rows || 1, MAX_ROWS);
    const plannedColumns = clampGridSize(generateColumns, detail?.meta.suggestedDimensions.columns || 1, MAX_COLUMNS);
    const placementError = validatePlacementPlans(placementPlans, plannedColumns);
    if (placementError) {
      toast.error(placementError);
      return;
    }
    setGenerating(true);
    try {
      await api.post(`/exam-sittings/${selectedSittingId}/layout/generate`, {
        rows: plannedRows,
        columns: plannedColumns,
        notes: generateNotes.trim() || null,
      });
      const nextDetail = await fetchLayoutDetail(selectedSittingId);
      if (nextDetail?.layout) {
        const generatedDraft = createDraftFromLayout(nextDetail);
        const generatedPlacementGroups = buildPlacementGroupsFromStudents(nextDetail.students || [], placementClassOrder);
        const plannedDraft = applyPlacementPlansToDraft({
          draft: generatedDraft,
          placementGroups: generatedPlacementGroups,
          placementPlans,
        });
        await api.put(`/exam-sittings/${selectedSittingId}/layout`, {
          rows: plannedDraft.rows,
          columns: plannedDraft.columns,
          notes: plannedDraft.notes.trim() || null,
          cells: plannedDraft.cells.map((cell) => ({
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
      }
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
    placementClassOrder,
    placementPlans,
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

  const handleOpenEditor = useCallback((sittingId: number) => {
    setSelectedSittingId(sittingId);
    setIsEditorModalOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setIsGenerateModalOpen(false);
    setIsEditorModalOpen(false);
    setSelectedSittingId(null);
    setDetail(null);
    setDraft(null);
  }, []);

  const applyPlacementByClassOrder = useCallback(() => {
    if (!draft || placementGroups.length === 0) return;
    const placementError = validatePlacementPlans(placementPlans, draft.columns);
    if (placementError) {
      toast.error(placementError);
      return;
    }

    setDraft((current) =>
      current
        ? applyPlacementPlansToDraft({
            draft: current,
            placementGroups,
            placementPlans,
          })
        : current,
    );

    toast.success('Penempatan siswa per rombel berhasil diterapkan.');
  }, [draft, placementGroups, placementPlans]);

  if (loadingActiveAcademicYear) {
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
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Generate Denah Ruang</h2>
          <p className="mt-1 text-sm text-gray-500">
            Pilih ruang ujian, lakukan setup denah lewat popup, lalu atur penempatan siswa per rombel secara fokus saat denah dibuka.
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          {visiblePrograms.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500">
              Belum ada program ujian terjadwal.
            </div>
          ) : (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex gap-4 overflow-x-auto scrollbar-hide">
                  {visiblePrograms.map((program) => {
                    const Icon = getProgramTabIcon(program.code);
                    return (
                      <button
                        key={program.code}
                        type="button"
                        onClick={() => setActiveProgramCode(program.code)}
                        className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                          activeProgramCode === program.code
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {program.shortLabel || program.label || program.code}
                      </button>
                    );
                  })}
                </div>
              </div>
              {activeProgramCode ? (
                <div className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <span className="text-sm font-medium text-gray-600">Semester</span>
                  <select
                    value={effectiveSemester}
                    onChange={(event) => setSelectedSemester(event.target.value as 'ODD' | 'EVEN')}
                    disabled={Boolean(activeProgram?.fixedSemester)}
                    className={`min-w-[140px] rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${
                      activeProgram?.fixedSemester
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-600'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {activeProgram?.fixedSemester ? (
                      <option value={activeProgram.fixedSemester}>
                        {activeProgram.fixedSemester === 'EVEN' ? 'Genap' : 'Ganjil'}
                      </option>
                    ) : (
                      <>
                        <option value="ODD">Ganjil</option>
                        <option value="EVEN">Genap</option>
                      </>
                    )}
                  </select>
                </div>
              ) : null}
            </div>
          )}
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
                placeholder="Cari ruang atau sesi..."
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
                const isActive = isEditorModalOpen && sitting.id === selectedSittingId;
                const hasLayout = Boolean(sitting.layout?.id);
                const scheduleSummary = formatScheduleSummary(sitting.startTime, sitting.endTime);
                const sessionSummary = formatSessionSummary(sitting.sessionLabel);
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
                        {scheduleSummary}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">
                          {sitting._count?.students || 0} siswa
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">
                          {sessionSummary}
                        </span>
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
                        onClick={() => handleOpenEditor(sitting.id)}
                        className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold ${
                          isActive
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {isActive ? 'Sedang Dibuka' : hasLayout ? 'Lihat Denah' : 'Setup Denah'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {isEditorModalOpen && selectedSitting ? (
        <div
          className="fixed inset-0 z-[70] bg-black/35 p-3 sm:p-5"
          onClick={handleCloseEditor}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    <Layers3 className="mr-2 h-3.5 w-3.5" />
                    {selectedSitting.roomName}
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-gray-900">
                    {detail?.sitting.examType || selectedSitting.examType}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatScheduleSummary(
                      detail?.sitting.startTime || selectedSitting.startTime,
                      detail?.sitting.endTime || selectedSitting.endTime,
                    )}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatSessionSummary(
                      detail?.sitting.programSession?.label ||
                        detail?.sitting.sessionLabel ||
                        selectedSitting.sessionLabel,
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseEditor}
                  className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {loadingDetail ? (
                <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
                  <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
                  Memuat detail denah ruang...
                </div>
              ) : !draft ? (
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
                <div className="space-y-4">
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
                        Denah ditampilkan sebagai preview penempatan. Pengaturan utama dilakukan dari panel penempatan rombel di bawah.
                      </p>
                    </div>

                    <div className="overflow-x-auto px-5 py-5">
                      <div className="inline-block min-w-fit rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <div className="inline-flex w-max flex-col gap-3">
                          {gridRows.map((row, rowIndex) => (
                            <div key={`row-${rowIndex}`} className="flex gap-3">
                              {row.map((cell) => {
                              const currentStudent =
                                detail?.students.find((student) => student.id === cell.studentId) || null;
                              const isSeat = cell.cellType === 'SEAT';
                              const isEmptySeat = isSeat && !currentStudent;

                              return (
                                <div
                                  key={`${cell.rowIndex}-${cell.columnIndex}`}
                                  className={`min-h-[132px] w-[168px] rounded-2xl border p-4 text-left ${
                                    isSeat
                                      ? isEmptySeat
                                        ? 'border-amber-200 bg-amber-50/80'
                                        : 'border-blue-100 bg-white'
                                      : 'border-slate-200 bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                        isSeat ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'
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
                                          : 'Penempatan mengikuti pengaturan rombel.'
                                        : 'Gunakan untuk jalur pengawas atau jarak antar kursi.'}
                                    </div>
                                    {isSeat ? (
                                      <div className="mt-1 text-xs font-medium text-blue-700">
                                        No. Peserta {currentStudent?.participantNumber || '-'}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Pengaturan Penempatan Rombel</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Tentukan kolom awal tiap rombel secara fleksibel. Jika setiap rombel memakai 1 kolom, hasil penempatan akan turun ke bawah per kolom, lalu kolom berikutnya tetap mengikuti urutan rombel yang sama secara selang.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyPlacementByClassOrder()}
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        Terapkan Penempatan
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="space-y-3">
                        {placementGroups.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500">
                            Belum ada rombel siswa yang bisa dipetakan ke denah ini.
                          </div>
                        ) : (
                          placementGroups.map((group, index) => {
                            const plan =
                              placementPlans.find((item) => item.className === group.className) || {
                                className: group.className,
                                startColumn: Math.min(index + 1, Math.max(1, draft.columns)),
                                columnSpan: 1,
                              };
                            return (
                            <div
                              key={group.className}
                              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">{group.className}</div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    {group.count} siswa • rentang kursi {formatPlacementSeatRange(plan, draft.rows, draft.columns)}
                                  </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                      Mulai Kolom
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={draft.columns}
                                      value={plan.startColumn}
                                      onChange={(event) =>
                                        setPlacementPlans((current) =>
                                          current.map((item) =>
                                            item.className === group.className
                                              ? clampPlacementPlan(
                                                  {
                                                    ...item,
                                                    startColumn: Number(event.target.value),
                                                  },
                                                  draft.columns,
                                                )
                                              : item,
                                          ),
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                      Jumlah Kolom
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={draft.columns}
                                      value={plan.columnSpan}
                                      onChange={(event) =>
                                        setPlacementPlans((current) =>
                                          current.map((item) =>
                                            item.className === group.className
                                              ? clampPlacementPlan(
                                                  {
                                                    ...item,
                                                    columnSpan: Number(event.target.value),
                                                  },
                                                  draft.columns,
                                                )
                                              : item,
                                          ),
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                          })
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                          <div className="font-semibold">Pola yang diterapkan</div>
                          <div className="mt-1 text-xs">
                            Sistem akan menempatkan siswa per rombel ke kolom yang kamu tentukan. Jika masih ada sisa siswa, kolom kosong berikutnya akan tetap dibagikan mengikuti urutan rombel secara bergantian.
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Catatan Denah
                          </label>
                          <textarea
                            value={draft.notes}
                            onChange={(event) =>
                              setDraft((current) => (current ? { ...current, notes: event.target.value } : current))
                            }
                            rows={5}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Tambahkan catatan umum untuk pengawas atau pelaksanaan di ruang ini."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isGenerateModalOpen && selectedSitting ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4"
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
                  {formatScheduleSummary(selectedSitting.startTime, selectedSitting.endTime)}
                </div>
                <div className="mt-1">
                  {selectedSitting.examType} • {formatSessionSummary(selectedSitting.sessionLabel)}
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
                  <p className="mt-1 text-xs text-gray-500">Memanjang ke samping</p>
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
                  <p className="mt-1 text-xs text-gray-500">Memanjang ke bawah</p>
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

              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4">
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-semibold text-amber-800">Blok Penempatan Rombel</div>
                  <div className="text-xs text-amber-700">
                    Atur dari awal rombel mana yang menempati kolom tertentu. Jika setiap rombel memakai 1 kolom, hasilnya akan turun ke bawah per kolom dan kolom berikutnya tetap mengikuti urutan rombel yang sama.
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {placementGroups.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-amber-200 bg-white px-4 py-4 text-sm text-amber-800">
                      Belum ada rombel siswa yang bisa dipetakan pada ruang ini.
                    </div>
                  ) : (
                    placementGroups.map((group, index) => {
                      const plan =
                        placementPlans.find((item) => item.className === group.className) || {
                          className: group.className,
                          startColumn: Math.min(index + 1, Math.max(1, generateColumns)),
                          columnSpan: 1,
                        };
                      return (
                        <div
                          key={`generate-${group.className}`}
                          className="rounded-xl border border-amber-200 bg-white px-4 py-3"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{group.className}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {group.count} siswa • rentang kursi {formatPlacementSeatRange(plan, generateRows, generateColumns)}
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                  Mulai Kolom
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={generateColumns}
                                  value={plan.startColumn}
                                  onChange={(event) =>
                                    setPlacementPlans((current) =>
                                      current.map((item) =>
                                        item.className === group.className
                                          ? clampPlacementPlan(
                                              {
                                                ...item,
                                                startColumn: Number(event.target.value),
                                              },
                                              generateColumns,
                                            )
                                          : item,
                                      ),
                                    )
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                  Jumlah Kolom
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={generateColumns}
                                  value={plan.columnSpan}
                                  onChange={(event) =>
                                    setPlacementPlans((current) =>
                                      current.map((item) =>
                                        item.className === group.className
                                          ? clampPlacementPlan(
                                              {
                                                ...item,
                                                columnSpan: Number(event.target.value),
                                              },
                                              generateColumns,
                                            )
                                          : item,
                                      ),
                                    )
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
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
