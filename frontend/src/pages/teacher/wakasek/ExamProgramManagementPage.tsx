import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { academicYearService } from '../../../services/academicYear.service';
import {
  DEFAULT_GRADE_COMPONENTS,
  examService,
  DEFAULT_EXAM_PROGRAMS,
  normalizeExamProgramCode,
  type ExamGradeComponent,
  type ExamProgram,
  type ExamProgramBaseType,
  type ExamProgramGradeEntryMode,
  type ExamProgramGradeComponentType,
  type ExamProgramReportSlot,
} from '../../../services/exam.service';

type ProgramFormRow = {
  rowId: string;
  configId?: number;
  code: string;
  baseType: ExamProgramBaseType;
  baseTypeCode: string;
  gradeComponentType: ExamProgramGradeComponentType;
  gradeComponentTypeCode: string;
  gradeComponentCode: string;
  gradeComponentLabel: string;
  gradeEntryMode: ExamProgramGradeEntryMode;
  gradeEntryModeCode: string;
  label: string;
  shortLabel: string;
  description: string;
  fixedSemester: 'ODD' | 'EVEN' | null;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  showOnStudentMenu: boolean;
  source: 'default' | 'custom' | 'new';
  isCodeLocked: boolean;
};

type GradeComponentFormRow = {
  rowId: string;
  componentId?: number;
  code: string;
  label: string;
  type: ExamProgramGradeComponentType;
  typeCode: string;
  entryMode: ExamProgramGradeEntryMode;
  entryModeCode: string;
  reportSlot: ExamProgramReportSlot;
  reportSlotCode: string;
  includeInFinalScore: boolean;
  description: string;
  order: number;
  isActive: boolean;
};

const GRADE_ENTRY_MODE_OPTIONS: Array<{ value: ExamProgramGradeEntryMode; label: string }> = [
  { value: 'NF_SERIES', label: 'NF Bertahap (NF1-NF6)' },
  { value: 'SINGLE_SCORE', label: 'Satu Nilai (Single)' },
];

const REPORT_SLOT_OPTIONS: Array<{ value: ExamProgramReportSlot; label: string }> = [
  { value: 'NONE', label: 'Tidak masuk rapor' },
  { value: 'FORMATIF', label: 'Formatif' },
  { value: 'SBTS', label: 'SBTS' },
  { value: 'SAS', label: 'SAS/SAT' },
  { value: 'US_THEORY', label: 'US Teori' },
  { value: 'US_PRACTICE', label: 'US Praktik' },
];

function defaultGradeComponentCodeByBaseType(baseType: ExamProgramBaseType): string {
  if (baseType === 'FORMATIF') return 'FORMATIVE';
  if (baseType === 'SBTS') return 'MIDTERM';
  if (baseType === 'SAS' || baseType === 'SAT') return 'FINAL';
  if (baseType === 'US_PRACTICE') return 'US_PRACTICE';
  if (baseType === 'US_THEORY') return 'US_THEORY';
  return 'CUSTOM_COMPONENT';
}

function normalizeComponentCode(raw: unknown): string {
  return normalizeExamProgramCode(raw);
}

function resolveEntryModeByCode(
  code: string,
  fallback: ExamProgramGradeEntryMode = 'SINGLE_SCORE',
): ExamProgramGradeEntryMode {
  const normalized = normalizeComponentCode(code);
  if (normalized === 'NF_SERIES') return 'NF_SERIES';
  if (normalized === 'SINGLE_SCORE') return 'SINGLE_SCORE';
  return fallback;
}

function resolveReportSlotByCode(
  code: string,
  fallback: ExamProgramReportSlot = 'NONE',
): ExamProgramReportSlot {
  const normalized = normalizeComponentCode(code);
  if (normalized === 'FORMATIF') return 'FORMATIF';
  if (normalized === 'SBTS') return 'SBTS';
  if (normalized === 'SAS') return 'SAS';
  if (normalized === 'US_THEORY') return 'US_THEORY';
  if (normalized === 'US_PRACTICE') return 'US_PRACTICE';
  if (normalized === 'NONE') return 'NONE';
  return fallback;
}

function inferGradeEntryModeByCode(code: string, fallback: ExamProgramGradeEntryMode = 'SINGLE_SCORE'): ExamProgramGradeEntryMode {
  if (code === 'FORMATIVE') return 'NF_SERIES';
  if (code) return 'SINGLE_SCORE';
  return fallback;
}

function inferGradeComponentTypeByCode(
  code: string,
  fallback: ExamProgramGradeComponentType = 'CUSTOM',
): ExamProgramGradeComponentType {
  if (code === 'FORMATIVE') return 'FORMATIVE';
  if (code === 'MIDTERM') return 'MIDTERM';
  if (code === 'FINAL') return 'FINAL';
  if (code === 'SKILL') return 'SKILL';
  if (code === 'US_PRACTICE') return 'US_PRACTICE';
  if (code === 'US_THEORY') return 'US_THEORY';
  return fallback;
}

function defaultReportSlotByCode(code: string): ExamProgramReportSlot {
  if (code === 'FORMATIVE') return 'FORMATIF';
  if (code === 'MIDTERM') return 'SBTS';
  if (code === 'FINAL') return 'SAS';
  if (code === 'US_THEORY') return 'US_THEORY';
  if (code === 'US_PRACTICE') return 'US_PRACTICE';
  return 'NONE';
}

function defaultIncludeInFinalScoreBySlot(slot: ExamProgramReportSlot): boolean {
  return slot === 'FORMATIF' || slot === 'SBTS' || slot === 'SAS';
}

function inferBaseTypeByComponentCode(
  componentCode: string,
  fixedSemester: 'ODD' | 'EVEN' | null,
  fallback: ExamProgramBaseType,
): ExamProgramBaseType {
  if (componentCode === 'FORMATIVE') return 'FORMATIF';
  if (componentCode === 'MIDTERM') return 'SBTS';
  if (componentCode === 'FINAL') return fixedSemester === 'EVEN' ? 'SAT' : 'SAS';
  if (componentCode === 'US_PRACTICE') return 'US_PRACTICE';
  if (componentCode === 'US_THEORY') return 'US_THEORY';
  return fallback;
}

function sortRows(rows: ProgramFormRow[]): ProgramFormRow[] {
  return [...rows]
    .map((row) => ({ ...row }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
}

function sortComponentRows(rows: GradeComponentFormRow[]): GradeComponentFormRow[] {
  return [...rows]
    .map((row) => ({ ...row }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
}

function normalizeComponentRows(components: ExamGradeComponent[]): GradeComponentFormRow[] {
  if (!Array.isArray(components) || components.length === 0) return [];
  return sortComponentRows(
    components.map((component, index) => {
      const code = normalizeComponentCode(component.code);
      const typeCode = normalizeComponentCode(component.typeCode || component.type || code);
      const entryModeCode = normalizeComponentCode(component.entryModeCode || component.entryMode || inferGradeEntryModeByCode(code));
      const reportSlotCode = normalizeComponentCode(component.reportSlotCode || component.reportSlot || defaultReportSlotByCode(code));
      return {
        rowId: `component-${component.id ?? index}-${code}`,
        componentId: component.id,
        code,
        label: String(component.label || '').trim(),
        type: component.type || inferGradeComponentTypeByCode(typeCode, inferGradeComponentTypeByCode(code)),
        typeCode,
        entryMode: component.entryMode || resolveEntryModeByCode(entryModeCode, inferGradeEntryModeByCode(code)),
        entryModeCode,
        reportSlot: component.reportSlot || resolveReportSlotByCode(reportSlotCode, defaultReportSlotByCode(code)),
        reportSlotCode,
        includeInFinalScore:
          component.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(resolveReportSlotByCode(reportSlotCode, defaultReportSlotByCode(code))),
        description: String(component.description || '').trim(),
        order: Number.isFinite(component.order) ? Number(component.order) : (index + 1) * 10,
        isActive: Boolean(component.isActive),
      };
    }),
  );
}

function fallbackComponentRowsFromPrograms(programRows: ProgramFormRow[]): GradeComponentFormRow[] {
  const seedRows = programRows.map((row) => ({
    code: normalizeComponentCode(row.gradeComponentCode),
    label: String(row.gradeComponentLabel || row.gradeComponentCode || '').trim(),
    type: row.gradeComponentType || inferGradeComponentTypeByCode(row.gradeComponentTypeCode || row.gradeComponentCode),
    typeCode: normalizeComponentCode(row.gradeComponentTypeCode || row.gradeComponentType || row.gradeComponentCode),
    entryMode: row.gradeEntryMode || inferGradeEntryModeByCode(row.gradeEntryModeCode || row.gradeComponentCode),
    entryModeCode: normalizeComponentCode(row.gradeEntryModeCode || row.gradeEntryMode || inferGradeEntryModeByCode(row.gradeComponentCode)),
    reportSlot: defaultReportSlotByCode(row.gradeComponentCode),
    reportSlotCode: defaultReportSlotByCode(row.gradeComponentCode),
    includeInFinalScore: defaultIncludeInFinalScoreBySlot(defaultReportSlotByCode(row.gradeComponentCode)),
    order: row.order,
    description: '',
  }));
  const defaults = DEFAULT_GRADE_COMPONENTS.map((item) => ({
    code: normalizeComponentCode(item.code),
    label: String(item.label || item.code).trim(),
    type: item.type || inferGradeComponentTypeByCode(item.code),
    typeCode: normalizeComponentCode(item.typeCode || item.type || item.code),
    entryMode: item.entryMode || inferGradeEntryModeByCode(item.code),
    entryModeCode: normalizeComponentCode(item.entryModeCode || item.entryMode || inferGradeEntryModeByCode(item.code)),
    reportSlot: item.reportSlot || defaultReportSlotByCode(item.code),
    reportSlotCode: normalizeComponentCode(item.reportSlotCode || item.reportSlot || defaultReportSlotByCode(item.code)),
    includeInFinalScore: item.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(item.reportSlot || defaultReportSlotByCode(item.code)),
    order: item.order,
    description: String(item.description || '').trim(),
  }));
  const merged = [...seedRows, ...defaults].filter((item) => Boolean(item.code));
  const deduped = new Map<string, GradeComponentFormRow>();
  merged.forEach((item, index) => {
    deduped.set(item.code, {
      rowId: `component-fallback-${index}-${item.code}`,
      componentId: undefined,
      code: item.code,
      label: item.label || item.code,
      type: item.type,
      typeCode: item.typeCode,
      entryMode: item.entryMode,
      entryModeCode: item.entryModeCode,
      reportSlot: item.reportSlot,
      reportSlotCode: item.reportSlotCode,
      includeInFinalScore: item.includeInFinalScore,
      description: item.description,
      order: item.order || (index + 1) * 10,
      isActive: true,
    });
  });
  return sortComponentRows(Array.from(deduped.values()));
}

function createNewComponentRow(currentRows: GradeComponentFormRow[]): GradeComponentFormRow {
  const maxOrder = currentRows.reduce((acc, row) => Math.max(acc, row.order), 0);
  return {
    rowId: `component-new-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    componentId: undefined,
    code: '',
    label: '',
    type: 'CUSTOM',
    typeCode: 'CUSTOM',
    entryMode: 'SINGLE_SCORE',
    entryModeCode: 'SINGLE_SCORE',
    reportSlot: 'NONE',
    reportSlotCode: 'NONE',
    includeInFinalScore: false,
    description: '',
    order: maxOrder + 10,
    isActive: true,
  };
}

function fallbackRows(): ProgramFormRow[] {
  return sortRows(
    DEFAULT_EXAM_PROGRAMS.map((program, index) => ({
      ...(function buildFallbackRow() {
        const fixedSemester = program.fixedSemester;
        const componentCode = normalizeComponentCode(
          program.gradeComponentCode || defaultGradeComponentCodeByBaseType(program.baseType),
        );
        return {
          baseType: inferBaseTypeByComponentCode(componentCode, fixedSemester, program.baseType),
          baseTypeCode: normalizeComponentCode(program.baseTypeCode || program.baseType || 'FORMATIF'),
          gradeComponentType: program.gradeComponentType || inferGradeComponentTypeByCode(componentCode),
          gradeComponentTypeCode: normalizeComponentCode(program.gradeComponentTypeCode || program.gradeComponentType || componentCode),
          gradeComponentCode: componentCode,
          gradeEntryMode:
            program.gradeEntryMode || inferGradeEntryModeByCode(componentCode),
          gradeEntryModeCode: normalizeComponentCode(program.gradeEntryModeCode || program.gradeEntryMode || inferGradeEntryModeByCode(componentCode)),
        };
      })(),
      rowId: `fallback-${index}-${normalizeExamProgramCode(program.code)}`,
      code: normalizeExamProgramCode(program.code),
      gradeComponentLabel: String(program.gradeComponentLabel || program.shortLabel || program.label || '').trim(),
      label: program.label,
      shortLabel: program.shortLabel,
      description: program.description,
      fixedSemester: program.fixedSemester,
      order: program.order,
      isActive: program.isActive,
      showOnTeacherMenu: program.showOnTeacherMenu,
      showOnStudentMenu: program.showOnStudentMenu,
      source: program.source,
      isCodeLocked: true,
    })),
  );
}

function normalizeRows(programs: ExamProgram[]): ProgramFormRow[] {
  if (!Array.isArray(programs) || programs.length === 0) return [];

  return sortRows(
    programs.map((program, index) => {
      const normalizedCode = normalizeExamProgramCode(program.code);
      const identity = program.id ?? (normalizedCode || index);
      const normalizedComponentCode = normalizeComponentCode(
        program.gradeComponentCode || defaultGradeComponentCodeByBaseType(program.baseType),
      );
      const baseTypeCode = normalizeComponentCode(program.baseTypeCode || program.baseType || normalizedCode);
      const gradeComponentTypeCode = normalizeComponentCode(
        program.gradeComponentTypeCode || program.gradeComponentType || normalizedComponentCode,
      );
      const gradeEntryModeCode = normalizeComponentCode(
        program.gradeEntryModeCode || program.gradeEntryMode || inferGradeEntryModeByCode(normalizedComponentCode),
      );
      const fixedSemester = program.fixedSemester || null;
      const derivedBaseType = inferBaseTypeByComponentCode(
        normalizedComponentCode,
        fixedSemester,
        baseTypeCode || program.baseType,
      );
      return {
        rowId: `program-${identity}`,
        configId: program.id,
        code: normalizedCode,
        baseType: derivedBaseType,
        baseTypeCode,
        gradeComponentType: program.gradeComponentType || inferGradeComponentTypeByCode(gradeComponentTypeCode, inferGradeComponentTypeByCode(normalizedComponentCode)),
        gradeComponentTypeCode,
        gradeComponentCode: normalizedComponentCode,
        gradeComponentLabel: String(
          program.gradeComponentLabel || program.shortLabel || program.label || '',
        ).trim(),
        gradeEntryMode: program.gradeEntryMode || resolveEntryModeByCode(gradeEntryModeCode, inferGradeEntryModeByCode(normalizedComponentCode)),
        gradeEntryModeCode,
        label: String(program.label || '').trim(),
        shortLabel: String(program.shortLabel || '').trim(),
        description: String(program.description || '').trim(),
        fixedSemester,
        order: Number.isFinite(program.order) ? Number(program.order) : (index + 1) * 10,
        isActive: Boolean(program.isActive),
        showOnTeacherMenu: Boolean(program.showOnTeacherMenu),
        showOnStudentMenu: Boolean(program.showOnStudentMenu),
        source: program.source,
        isCodeLocked: true,
      };
    }),
  );
}

function createNewRow(currentRows: ProgramFormRow[], componentRows: GradeComponentFormRow[]): ProgramFormRow {
  const maxOrder = currentRows.reduce((acc, row) => Math.max(acc, row.order), 0);
  const defaultComponent =
    componentRows.find((item) => item.code === 'FORMATIVE') || componentRows.find((item) => item.isActive) || null;
  const defaultComponentCode = defaultComponent?.code || 'FORMATIVE';
  const defaultComponentTypeCode = normalizeComponentCode(
    defaultComponent?.typeCode || defaultComponent?.type || defaultComponentCode,
  );
  const defaultComponentType = defaultComponent?.type || inferGradeComponentTypeByCode(defaultComponentTypeCode, inferGradeComponentTypeByCode(defaultComponentCode));
  const defaultEntryModeCode = normalizeComponentCode(
    defaultComponent?.entryModeCode || defaultComponent?.entryMode || inferGradeEntryModeByCode(defaultComponentCode),
  );
  const defaultEntryMode = defaultComponent?.entryMode || resolveEntryModeByCode(defaultEntryModeCode, inferGradeEntryModeByCode(defaultComponentCode));
  const defaultComponentLabel = defaultComponent?.label || 'Formatif';
  const defaultBaseTypeCode = inferBaseTypeByComponentCode(defaultComponentCode, null, 'FORMATIF');
  return {
    rowId: `new-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    configId: undefined,
    code: '',
    baseType: defaultBaseTypeCode,
    baseTypeCode: defaultBaseTypeCode,
    gradeComponentType: defaultComponentType,
    gradeComponentTypeCode: defaultComponentTypeCode,
    gradeComponentCode: defaultComponentCode,
    gradeComponentLabel: defaultComponentLabel,
    gradeEntryMode: defaultEntryMode,
    gradeEntryModeCode: defaultEntryModeCode,
    label: '',
    shortLabel: '',
    description: '',
    fixedSemester: null,
    order: maxOrder + 10,
    isActive: true,
    showOnTeacherMenu: true,
    showOnStudentMenu: true,
    source: 'new',
    isCodeLocked: false,
  };
}

function baseTypeLabel(value: ExamProgramBaseType): string {
  if (value === 'FORMATIF') return 'FORMATIF';
  if (value === 'SBTS') return 'SBTS';
  if (value === 'SAS') return 'SAS';
  if (value === 'SAT') return 'SAT';
  if (value === 'US_PRACTICE') return 'US PRAKTEK';
  if (value === 'US_THEORY') return 'US TEORI';
  return value;
}

export default function ExamProgramManagementPage() {
  const queryClient = useQueryClient();
  const [academicYearId, setAcademicYearId] = useState<number | null>(null);
  const [academicYearName, setAcademicYearName] = useState<string>('-');
  const [rows, setRows] = useState<ProgramFormRow[]>([]);
  const [initialRows, setInitialRows] = useState<ProgramFormRow[]>([]);
  const [componentRows, setComponentRows] = useState<GradeComponentFormRow[]>([]);
  const [initialComponentRows, setInitialComponentRows] = useState<GradeComponentFormRow[]>([]);
  const [codeEditBackup, setCodeEditBackup] = useState<Record<string, string>>({});
  const [componentEditBackup, setComponentEditBackup] = useState<Record<string, GradeComponentFormRow>>({});
  const [editingComponentRowId, setEditingComponentRowId] = useState<string | null>(null);
  const [endpointUnavailable, setEndpointUnavailable] = useState<boolean>(false);
  const [componentsEndpointUnavailable, setComponentsEndpointUnavailable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingComponents, setSavingComponents] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const isProgramDirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(initialRows), [rows, initialRows]);
  const isComponentDirty = useMemo(
    () => JSON.stringify(componentRows) !== JSON.stringify(initialComponentRows),
    [componentRows, initialComponentRows],
  );

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const activeYearRes = await academicYearService.getActive();
      const activeYear = activeYearRes?.data;
      if (!activeYear?.id) {
        throw new Error('Tahun ajaran aktif tidak ditemukan.');
      }

      setAcademicYearId(Number(activeYear.id));
      setAcademicYearName(String(activeYear.name || '-'));
      setEndpointUnavailable(false);
      setComponentsEndpointUnavailable(false);

      let nextRows: ProgramFormRow[] = [];
      try {
        const programsRes = await examService.getPrograms({
          academicYearId: Number(activeYear.id),
          roleContext: 'all',
          includeInactive: true,
        });
        nextRows = normalizeRows(programsRes?.data?.programs || []);
        setEndpointUnavailable(false);
      } catch (endpointError: any) {
        if (Number(endpointError?.response?.status) === 404) {
          nextRows = fallbackRows();
          setEndpointUnavailable(true);
        } else {
          throw endpointError;
        }
      }
      setRows(nextRows);
      setInitialRows(nextRows);
      setCodeEditBackup({});
      setComponentEditBackup({});
      setEditingComponentRowId(null);

      try {
        const componentsRes = await examService.getGradeComponents({
          academicYearId: Number(activeYear.id),
          includeInactive: true,
        });
        const nextComponents = normalizeComponentRows(componentsRes?.data?.components || []);
        setComponentRows(nextComponents);
        setInitialComponentRows(nextComponents);
        setComponentsEndpointUnavailable(false);
      } catch (componentError: any) {
        if (Number(componentError?.response?.status) === 404) {
          const fallbackComponents = fallbackComponentRowsFromPrograms(nextRows);
          setComponentRows(fallbackComponents);
          setInitialComponentRows(fallbackComponents);
          setComponentsEndpointUnavailable(true);
        } else {
          throw componentError;
        }
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Gagal memuat konfigurasi program ujian.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  const updateRow = useCallback((rowId: string, patch: Partial<ProgramFormRow>) => {
    setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }, []);

  const focusCodeInput = useCallback((rowId: string) => {
    requestAnimationFrame(() => {
      const input = document.getElementById(`program-code-${rowId}`) as HTMLInputElement | null;
      if (input) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();
      }
    });
  }, []);

  const addRow = useCallback(() => {
    const newRow = createNewRow(rows, componentRows);
    setRows((prev) => sortRows([...prev, newRow]));
    focusCodeInput(newRow.rowId);
    toast.success('Program baru ditambahkan. Lengkapi kode dan label lalu simpan.');
  }, [componentRows, focusCodeInput, rows]);

  const unlockCodeEditing = useCallback(
    (rowId: string) => {
      const target = rows.find((row) => row.rowId === rowId);
      if (target) {
        setCodeEditBackup((prev) => (prev[rowId] !== undefined ? prev : { ...prev, [rowId]: target.code }));
      }
      setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, isCodeLocked: false } : row)));
      focusCodeInput(rowId);
      toast(
        target?.source === 'new'
          ? 'Mode edit kode aktif.'
          : 'Mode edit kode aktif. Jika kode diubah, paket ujian dengan kode lama akan dipindahkan otomatis saat simpan.',
      );
    },
    [focusCodeInput, rows],
  );

  const cancelNewRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
    setCodeEditBackup((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    toast('Pembuatan program dibatalkan.');
  }, []);

  const cancelCodeEdit = useCallback(
    (rowId: string) => {
      setRows((prev) =>
        prev.map((row) =>
          row.rowId === rowId
            ? { ...row, code: codeEditBackup[rowId] ?? row.code, isCodeLocked: true }
            : row,
        ),
      );
      setCodeEditBackup((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      toast('Edit kode dibatalkan.');
    },
    [codeEditBackup],
  );

  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
    setCodeEditBackup((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

  const updateComponentRow = useCallback((rowId: string, patch: Partial<GradeComponentFormRow>) => {
    setComponentRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }, []);

  const addComponentRow = useCallback(() => {
    const newRow = createNewComponentRow(componentRows);
    setComponentRows((prev) => sortComponentRows([...prev, newRow]));
    setEditingComponentRowId(newRow.rowId);
    setComponentEditBackup((prev) => ({ ...prev, [newRow.rowId]: newRow }));
  }, [componentRows]);

  const removeComponentRow = useCallback((rowId: string) => {
    setComponentRows((prev) => prev.filter((row) => row.rowId !== rowId));
    setComponentEditBackup((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setEditingComponentRowId((prev) => (prev === rowId ? null : prev));
  }, []);

  const startComponentEdit = useCallback(
    (rowId: string) => {
      const target = componentRows.find((row) => row.rowId === rowId);
      if (!target) return;
      setComponentEditBackup((prev) => ({ ...prev, [rowId]: { ...target } }));
      setEditingComponentRowId(rowId);
    },
    [componentRows],
  );

  const cancelComponentEdit = useCallback(
    (rowId: string) => {
      const backup = componentEditBackup[rowId];
      if (backup) {
        setComponentRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...backup } : row)));
      }
      setComponentEditBackup((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      setEditingComponentRowId((prev) => (prev === rowId ? null : prev));
    },
    [componentEditBackup],
  );

  const handleSaveComponents = useCallback(async () => {
    if (!academicYearId) {
      toast.error('Tahun ajaran aktif tidak ditemukan.');
      return;
    }
    if (componentsEndpointUnavailable) {
      toast.error('Endpoint master komponen nilai belum tersedia di backend.');
      return;
    }

    const normalizedComponents = componentRows.map((row) => {
      const code = normalizeComponentCode(row.code);
      const typeCode = normalizeComponentCode(row.typeCode || row.type || code);
      const entryModeCode = normalizeComponentCode(
        row.entryModeCode || row.entryMode || inferGradeEntryModeByCode(code),
      );
      const reportSlotCode = normalizeComponentCode(
        row.reportSlotCode || row.reportSlot || defaultReportSlotByCode(code),
      );
      const type = inferGradeComponentTypeByCode(typeCode, row.type || inferGradeComponentTypeByCode(code));
      const entryMode = resolveEntryModeByCode(
        entryModeCode,
        row.entryMode || inferGradeEntryModeByCode(code),
      );
      const reportSlot = resolveReportSlotByCode(
        reportSlotCode,
        row.reportSlot || defaultReportSlotByCode(code),
      );
      return {
        ...row,
        code,
        type,
        typeCode,
        entryMode,
        entryModeCode,
        reportSlot,
        reportSlotCode,
        includeInFinalScore: Boolean(row.includeInFinalScore),
        label: String(row.label || '').trim(),
        description: String(row.description || '').trim(),
      };
    });

    const hasEmptyCode = normalizedComponents.some((row) => !row.code);
    if (hasEmptyCode) {
      toast.error('Kode komponen nilai wajib diisi.');
      return;
    }

    const hasEmptyLabel = normalizedComponents.some((row) => !row.label);
    if (hasEmptyLabel) {
      toast.error('Label komponen nilai wajib diisi.');
      return;
    }

    const dedupe = new Set<string>();
    for (const row of normalizedComponents) {
      if (dedupe.has(row.code)) {
        toast.error(`Kode komponen nilai duplikat: ${row.code}`);
        return;
      }
      dedupe.add(row.code);
    }

    setSavingComponents(true);
    try {
      const response = await examService.updateGradeComponents({
        academicYearId,
        components: normalizedComponents.map((row) => ({
          id: row.componentId ?? null,
          code: row.code,
          label: row.label,
          type: row.type,
          typeCode: row.typeCode,
          entryMode: row.entryMode,
          entryModeCode: row.entryModeCode,
          reportSlot: row.reportSlot,
          reportSlotCode: row.reportSlotCode,
          includeInFinalScore: row.includeInFinalScore,
          description: row.description || null,
          order: row.order,
          isActive: row.isActive,
        })),
      });

      const nextComponents = normalizeComponentRows(response?.data?.components || []);
      setComponentRows(nextComponents);
      setInitialComponentRows(nextComponents);
      setComponentEditBackup({});
      setEditingComponentRowId(null);
      await loadPrograms();
      toast.success('Master komponen nilai berhasil diperbarui.');
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Gagal menyimpan master komponen nilai.';
      toast.error(message);
    } finally {
      setSavingComponents(false);
    }
  }, [academicYearId, componentRows, componentsEndpointUnavailable, loadPrograms]);

  const handleSave = useCallback(async () => {
    if (!academicYearId) {
      toast.error('Tahun ajaran aktif tidak ditemukan.');
      return;
    }

    if (endpointUnavailable) {
      toast.error('Endpoint program ujian belum tersedia di backend. Jalankan update backend terlebih dahulu.');
      return;
    }

    const componentMap = new Map(
      componentRows.map((component) => [normalizeComponentCode(component.code), component]),
    );

    const normalizedRows = rows.map((row) => {
      const normalizedComponentCode = normalizeComponentCode(row.gradeComponentCode);
      const selectedComponent = componentMap.get(normalizedComponentCode);
      const gradeComponentTypeCode = normalizeComponentCode(
        selectedComponent?.typeCode || row.gradeComponentTypeCode || selectedComponent?.type || row.gradeComponentType || normalizedComponentCode,
      );
      const gradeEntryModeCode = normalizeComponentCode(
        selectedComponent?.entryModeCode || row.gradeEntryModeCode || selectedComponent?.entryMode || row.gradeEntryMode || inferGradeEntryModeByCode(normalizedComponentCode),
      );
      const baseTypeCode = normalizeComponentCode(
        row.baseTypeCode ||
          inferBaseTypeByComponentCode(
            normalizedComponentCode,
            row.fixedSemester,
            row.baseType || 'FORMATIF',
          ),
      );
      return {
        ...row,
        code: normalizeExamProgramCode(row.code),
        baseType: inferBaseTypeByComponentCode(normalizedComponentCode, row.fixedSemester, row.baseType || baseTypeCode || 'FORMATIF'),
        baseTypeCode,
        gradeComponentType:
          selectedComponent?.type ||
          inferGradeComponentTypeByCode(gradeComponentTypeCode, row.gradeComponentType),
        gradeComponentTypeCode,
        gradeComponentCode: normalizedComponentCode,
        gradeComponentLabel: String(selectedComponent?.label || row.gradeComponentLabel || normalizedComponentCode).trim(),
        gradeEntryMode:
          selectedComponent?.entryMode ||
          resolveEntryModeByCode(gradeEntryModeCode, row.gradeEntryMode || inferGradeEntryModeByCode(normalizedComponentCode)),
        gradeEntryModeCode,
        label: String(row.label || '').trim(),
        shortLabel: String(row.shortLabel || '').trim(),
        description: String(row.description || '').trim(),
      };
    });

    const hasEmptyCode = normalizedRows.some((row) => !row.code);
    if (hasEmptyCode) {
      toast.error('Kode program ujian wajib diisi.');
      return;
    }

    const hasEmptyLabel = normalizedRows.some((row) => !row.label);
    if (hasEmptyLabel) {
      toast.error('Label program ujian wajib diisi.');
      return;
    }

    const hasEmptyComponentCode = normalizedRows.some((row) => !row.gradeComponentCode);
    if (hasEmptyComponentCode) {
      toast.error('Kode komponen nilai wajib diisi.');
      return;
    }

    const missingComponentRef = normalizedRows.some((row) => !componentMap.has(row.gradeComponentCode));
    if (missingComponentRef) {
      toast.error('Komponen nilai belum terdaftar di Master Komponen Nilai.');
      return;
    }

    const dedupe = new Set<string>();
    for (const row of normalizedRows) {
      if (dedupe.has(row.code)) {
        toast.error(`Kode program duplikat: ${row.code}`);
        return;
      }
      dedupe.add(row.code);
    }

    setSaving(true);
    try {
      const response = await examService.updatePrograms({
        academicYearId,
        programs: normalizedRows.map((row) => ({
          id: row.configId ?? null,
          code: row.code,
          baseType: row.baseType,
          baseTypeCode: row.baseTypeCode,
          gradeComponentType: row.gradeComponentType,
          gradeComponentTypeCode: row.gradeComponentTypeCode,
          gradeComponentCode: row.gradeComponentCode,
          gradeComponentLabel: row.gradeComponentLabel || null,
          gradeEntryMode: row.gradeEntryMode,
          gradeEntryModeCode: row.gradeEntryModeCode,
          label: row.label,
          shortLabel: row.shortLabel || null,
          description: row.description || null,
          fixedSemester: row.fixedSemester,
          order: Number.isFinite(row.order) ? row.order : 0,
          isActive: row.isActive,
          showOnTeacherMenu: row.showOnTeacherMenu,
          showOnStudentMenu: row.showOnStudentMenu,
        })),
      });

      const nextRows = normalizeRows(response?.data?.programs || []);
      setRows(nextRows);
      setInitialRows(nextRows);
      setCodeEditBackup({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sidebar-exam-programs'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-exam-programs'] }),
      ]);
      toast.success('Program ujian berhasil diperbarui.');
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Gagal menyimpan konfigurasi program ujian.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [academicYearId, componentRows, endpointUnavailable, queryClient, rows]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-6">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Memuat program ujian...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 space-y-3">
        <p className="text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void loadPrograms()}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <RefreshCw className="w-4 h-4" />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Tahun Ajaran Aktif</p>
          <p className="text-sm text-blue-900 font-semibold">{academicYearName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <Plus className="w-4 h-4" />
            Tambah Program
          </button>
        </div>
      </div>

      {endpointUnavailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Endpoint `Program Ujian` belum tersedia di backend. Saat ini ditampilkan konfigurasi default.
          </p>
        </div>
      ) : null}

      {componentsEndpointUnavailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Endpoint `Master Komponen Nilai` belum tersedia di backend. Saat ini menggunakan data fallback lokal.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Master Komponen Nilai</h3>
            <p className="text-xs text-gray-500">Kelola daftar komponen nilai yang dipakai di Program Ujian.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addComponentRow}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              Tambah Komponen
            </button>
            <button
              type="button"
              onClick={() => void handleSaveComponents()}
              disabled={!isComponentDirty || savingComponents || componentsEndpointUnavailable}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                !isComponentDirty || savingComponents || componentsEndpointUnavailable
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {savingComponents ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan Komponen
            </button>
          </div>
        </div>

        {componentRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
            Belum ada komponen nilai. Tambahkan komponen dulu sebelum membuat Program Ujian.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-[1500px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-10">No</th>
                  <th className="px-3 py-2">Kode</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Tipe</th>
                  <th className="px-3 py-2">Mode Input</th>
                  <th className="px-3 py-2">Slot Rapor</th>
                  <th className="px-3 py-2">Urutan</th>
                  <th className="px-3 py-2 text-center">Aktif</th>
                  <th className="px-3 py-2 text-center">Nilai Akhir</th>
                  <th className="px-3 py-2">Deskripsi</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {componentRows.map((component, index) => {
                  const isEditing = editingComponentRowId === component.rowId;
                  return (
                    <tr key={component.rowId} className="align-top">
                      <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                      <td className="px-3 py-2">
                        <input
                          value={component.code}
                          onChange={(event) => {
                            if (!isEditing) return;
                            const nextCode = normalizeComponentCode(event.target.value);
                            const nextTypeCode = inferGradeComponentTypeByCode(nextCode, 'CUSTOM');
                            const nextEntryModeCode = inferGradeEntryModeByCode(nextCode, 'SINGLE_SCORE');
                            const nextReportSlotCode = defaultReportSlotByCode(nextCode);
                            updateComponentRow(component.rowId, {
                              code: nextCode,
                              typeCode: nextTypeCode,
                              type: inferGradeComponentTypeByCode(nextTypeCode, component.type),
                              entryModeCode: nextEntryModeCode,
                              entryMode: resolveEntryModeByCode(nextEntryModeCode, component.entryMode),
                              reportSlotCode: nextReportSlotCode,
                              reportSlot: resolveReportSlotByCode(nextReportSlotCode, component.reportSlot),
                              includeInFinalScore: defaultIncludeInFinalScoreBySlot(nextReportSlotCode),
                            });
                          }}
                          disabled={!isEditing}
                          className={`w-[180px] rounded-lg border px-2.5 py-1.5 text-xs ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                          placeholder="Contoh: PSAJ"
                          maxLength={50}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={component.label}
                          onChange={(event) => isEditing && updateComponentRow(component.rowId, { label: event.target.value })}
                          disabled={!isEditing}
                          className={`w-[180px] rounded-lg border px-2.5 py-1.5 text-xs ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                          placeholder="Contoh: Penilaian Akhir"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={component.typeCode}
                          onChange={(event) => {
                            if (!isEditing) return;
                            const nextTypeCode = normalizeComponentCode(event.target.value);
                            updateComponentRow(component.rowId, {
                              typeCode: nextTypeCode,
                              type: inferGradeComponentTypeByCode(nextTypeCode, component.type),
                            });
                          }}
                          disabled={!isEditing}
                          className={`w-[150px] rounded-lg border px-2.5 py-1.5 text-xs ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                          list="exam-component-type-code-options"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={component.entryModeCode}
                          onChange={(event) => {
                            if (!isEditing) return;
                            const nextEntryModeCode = normalizeComponentCode(event.target.value);
                            updateComponentRow(component.rowId, {
                              entryModeCode: nextEntryModeCode,
                              entryMode: resolveEntryModeByCode(nextEntryModeCode, component.entryMode),
                            });
                          }}
                          disabled={!isEditing}
                          className={`w-[180px] rounded-lg border px-2.5 py-1.5 text-xs ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                          list="exam-component-entry-mode-options"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={component.reportSlotCode}
                          onChange={(event) => {
                            if (!isEditing) return;
                            const nextReportSlotCode = normalizeComponentCode(event.target.value);
                            updateComponentRow(component.rowId, {
                              reportSlotCode: nextReportSlotCode,
                              reportSlot: resolveReportSlotByCode(nextReportSlotCode, component.reportSlot),
                              includeInFinalScore: defaultIncludeInFinalScoreBySlot(
                                resolveReportSlotByCode(nextReportSlotCode, component.reportSlot),
                              ),
                            });
                          }}
                          disabled={!isEditing}
                          className={`w-[180px] rounded-lg border px-2.5 py-1.5 text-xs ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                          list="exam-component-report-slot-options"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={component.order}
                          onChange={(event) =>
                            isEditing && updateComponentRow(component.rowId, { order: Number(event.target.value) || 0 })
                          }
                          disabled={!isEditing}
                          className={`w-[90px] rounded-lg border px-2.5 py-1.5 text-xs ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={component.isActive}
                          onChange={(event) =>
                            isEditing &&
                            updateComponentRow(component.rowId, {
                              isActive: event.target.checked,
                            })
                          }
                          disabled={!isEditing}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={component.includeInFinalScore}
                          onChange={(event) =>
                            isEditing &&
                            updateComponentRow(component.rowId, {
                              includeInFinalScore: event.target.checked,
                            })
                          }
                          disabled={!isEditing}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={component.description}
                          onChange={(event) =>
                            isEditing && updateComponentRow(component.rowId, { description: event.target.value })
                          }
                          disabled={!isEditing}
                          className={`w-[260px] rounded-lg border px-2.5 py-1.5 text-xs ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                          placeholder="Opsional"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => cancelComponentEdit(component.rowId)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <X className="w-3.5 h-3.5" />
                              Batal
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startComponentEdit(component.rowId)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeComponentRow(component.rowId)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <datalist id="exam-component-type-code-options">
          <option value="FORMATIVE" />
          <option value="MIDTERM" />
          <option value="FINAL" />
          <option value="SKILL" />
          <option value="US_PRACTICE" />
          <option value="US_THEORY" />
          <option value="CUSTOM" />
        </datalist>
        <datalist id="exam-component-entry-mode-options">
          {GRADE_ENTRY_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} />
          ))}
        </datalist>
        <datalist id="exam-component-report-slot-options">
          {REPORT_SLOT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} />
          ))}
        </datalist>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Program Ujian</h3>
          <p className="text-xs text-gray-500">Susun menu ujian guru/siswa berbasis komponen nilai.</p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
            Belum ada konfigurasi program ujian. Klik <span className="font-semibold">Tambah Program</span> untuk mulai membuat.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-[1800px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-10">No</th>
                  <th className="px-3 py-2">Kode Program</th>
                  <th className="px-3 py-2">Komponen Nilai</th>
                  <th className="px-3 py-2">Label Komponen</th>
                  <th className="px-3 py-2">Mode Input</th>
                  <th className="px-3 py-2">Label Menu</th>
                  <th className="px-3 py-2">Label Singkat</th>
                  <th className="px-3 py-2">Urutan</th>
                  <th className="px-3 py-2">Semester</th>
                  <th className="px-3 py-2">Pola</th>
                  <th className="px-3 py-2 text-center">Aktif</th>
                  <th className="px-3 py-2 text-center">Guru</th>
                  <th className="px-3 py-2 text-center">Siswa</th>
                  <th className="px-3 py-2">Deskripsi</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, index) => (
                  <tr key={row.rowId} className="align-top">
                    <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-3 py-2 space-y-1.5">
                      <input
                        id={`program-code-${row.rowId}`}
                        value={row.code}
                        onChange={(event) => updateRow(row.rowId, { code: event.target.value.toUpperCase() })}
                        className={`w-[170px] rounded-lg border px-2.5 py-1.5 text-xs ${
                          row.isCodeLocked
                            ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed'
                            : 'border-gray-300 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500'
                        }`}
                        placeholder="Contoh: PSAJ"
                        disabled={row.isCodeLocked}
                        maxLength={50}
                      />
                      <div className="flex items-center gap-1.5">
                        {row.isCodeLocked ? (
                          <button
                            type="button"
                            onClick={() => unlockCodeEditing(row.rowId)}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        ) : row.source !== 'new' ? (
                          <button
                            type="button"
                            onClick={() => cancelCodeEdit(row.rowId)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            Batal Edit
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.gradeComponentCode}
                        onChange={(event) => {
                          const nextCode = normalizeComponentCode(event.target.value);
                          const selectedComponent = componentRows.find((item) => normalizeComponentCode(item.code) === nextCode);
                          const nextGradeTypeCode = normalizeComponentCode(
                            selectedComponent?.typeCode || selectedComponent?.type || nextCode,
                          );
                          const nextGradeEntryModeCode = normalizeComponentCode(
                            selectedComponent?.entryModeCode || selectedComponent?.entryMode || inferGradeEntryModeByCode(nextCode, row.gradeEntryMode),
                          );
                          const nextBaseTypeCode = inferBaseTypeByComponentCode(
                            nextCode,
                            row.fixedSemester,
                            row.baseTypeCode || row.baseType,
                          );
                          updateRow(row.rowId, {
                            gradeComponentCode: nextCode,
                            gradeComponentType:
                              selectedComponent?.type || inferGradeComponentTypeByCode(nextGradeTypeCode),
                            gradeComponentTypeCode: nextGradeTypeCode,
                            gradeComponentLabel:
                              selectedComponent?.label || nextCode.replace(/_/g, ' '),
                            gradeEntryMode:
                              selectedComponent?.entryMode || resolveEntryModeByCode(nextGradeEntryModeCode, inferGradeEntryModeByCode(nextCode, row.gradeEntryMode)),
                            gradeEntryModeCode: nextGradeEntryModeCode,
                            baseType: nextBaseTypeCode,
                            baseTypeCode: nextBaseTypeCode,
                          });
                        }}
                        className="w-[190px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Pilih komponen nilai</option>
                        {componentRows.map((component) => (
                          <option key={component.rowId} value={component.code}>
                            {component.code} - {component.label}
                            {component.isActive ? '' : ' (nonaktif)'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.gradeComponentLabel}
                        readOnly
                        className="w-[190px] rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-1.5 text-xs text-gray-600"
                        placeholder="Pilih komponen"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.gradeEntryModeCode}
                        onChange={(event) => {
                          const nextGradeEntryModeCode = normalizeComponentCode(event.target.value);
                          updateRow(row.rowId, {
                            gradeEntryModeCode: nextGradeEntryModeCode,
                            gradeEntryMode: resolveEntryModeByCode(nextGradeEntryModeCode, row.gradeEntryMode),
                          });
                        }}
                        className="w-[180px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        list="exam-program-entry-mode-options"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.label}
                        onChange={(event) => updateRow(row.rowId, { label: event.target.value })}
                        className="w-[210px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Contoh: Ulangan Harian"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.shortLabel}
                        onChange={(event) => updateRow(row.rowId, { shortLabel: event.target.value })}
                        className="w-[150px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Contoh: UH"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={row.order}
                        onChange={(event) => updateRow(row.rowId, { order: Number(event.target.value) || 0 })}
                        className="w-[90px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.fixedSemester || ''}
                        onChange={(event) => {
                          const nextSemester = event.target.value ? (event.target.value as 'ODD' | 'EVEN') : null;
                          const componentCode = normalizeComponentCode(row.gradeComponentCode);
                          const nextBaseTypeCode = inferBaseTypeByComponentCode(
                            componentCode,
                            nextSemester,
                            row.baseTypeCode || row.baseType,
                          );
                          updateRow(row.rowId, {
                            fixedSemester: nextSemester,
                            baseType: nextBaseTypeCode,
                            baseTypeCode: nextBaseTypeCode,
                          });
                        }}
                        className="w-[125px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Otomatis</option>
                        <option value="ODD">Ganjil</option>
                        <option value="EVEN">Genap</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.baseTypeCode || row.baseType}
                        onChange={(event) => {
                          const nextBaseTypeCode = normalizeComponentCode(event.target.value);
                          updateRow(row.rowId, {
                            baseTypeCode: nextBaseTypeCode,
                            baseType: inferBaseTypeByComponentCode(
                              normalizeComponentCode(row.gradeComponentCode),
                              row.fixedSemester,
                              nextBaseTypeCode || row.baseType,
                            ),
                          });
                        }}
                        className="w-[130px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        list="exam-program-base-type-options"
                      />
                      <p className="mt-1 text-[10px] text-gray-500">{baseTypeLabel(row.baseType)}</p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.isActive}
                        onChange={(event) => updateRow(row.rowId, { isActive: event.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.showOnTeacherMenu}
                        onChange={(event) => updateRow(row.rowId, { showOnTeacherMenu: event.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.showOnStudentMenu}
                        onChange={(event) => updateRow(row.rowId, { showOnStudentMenu: event.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(event) => updateRow(row.rowId, { description: event.target.value })}
                        className="w-[260px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Penjelasan program ujian"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {row.source === 'new' ? (
                          <button
                            type="button"
                            onClick={() => cancelNewRow(row.rowId)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            Batal
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeRow(row.rowId)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <datalist id="exam-program-entry-mode-options">
          {GRADE_ENTRY_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} />
          ))}
        </datalist>
        <datalist id="exam-program-base-type-options">
          <option value="FORMATIF" />
          <option value="SBTS" />
          <option value="SAS" />
          <option value="SAT" />
          <option value="US_PRACTICE" />
          <option value="US_THEORY" />
        </datalist>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!isProgramDirty || saving}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            !isProgramDirty || saving
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan Konfigurasi
        </button>
      </div>
    </div>
  );
}
