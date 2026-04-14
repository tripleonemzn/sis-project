import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  normalizeTeachingResourceProgramCode,
  teachingResourceProgramService,
  type TeachingResourceColumnDataType,
  type TeachingResourceColumnValueSource,
  type TeachingResourceProgramColumnSchema,
  type TeachingResourceProgram,
  type TeachingResourceProgramSchema,
  type TeachingResourceProgramSectionSchema,
} from '../../../../services/teachingResourceProgram.service';
import { useActiveAcademicYear } from '../../../../hooks/useActiveAcademicYear';

type ProgramFormRow = {
  rowId: string;
  id?: number;
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  targetClassLevels: string[];
  schema?: TeachingResourceProgramSchema;
  source: 'default' | 'custom' | 'new';
};

type CreateProgramDraft = {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  targetClassLevels: string[];
  schema: TeachingResourceProgramSchema;
};

const TARGET_CLASS_OPTIONS = [
  { value: 'X', label: 'X' },
  { value: 'XI', label: 'XI' },
  { value: 'XII', label: 'XII' },
];

const DEFAULT_CUSTOM_DESCRIPTION = 'Program perangkat ajar tambahan sesuai kebijakan kurikulum.';
const COLUMN_DATA_TYPE_OPTIONS: Array<{ value: TeachingResourceColumnDataType; label: string }> = [
  { value: 'TEXT', label: 'Teks Singkat' },
  { value: 'TEXTAREA', label: 'Paragraf' },
  { value: 'NUMBER', label: 'Angka' },
  { value: 'BOOLEAN', label: 'Ya / Tidak' },
  { value: 'SELECT', label: 'Pilihan' },
  { value: 'SEMESTER', label: 'Semester Sistem' },
  { value: 'MONTH', label: 'Bulan' },
  { value: 'WEEK', label: 'Minggu Ke-' },
  { value: 'WEEK_GRID', label: 'Grid Minggu' },
  { value: 'READONLY_BOUND', label: 'Readonly Terikat' },
];
const COLUMN_VALUE_SOURCE_OPTIONS: Array<{ value: TeachingResourceColumnValueSource; label: string }> = [
  { value: 'MANUAL', label: 'Input Manual' },
  { value: 'SYSTEM_ACTIVE_YEAR', label: 'Tahun Ajaran Aktif' },
  { value: 'SYSTEM_SEMESTER', label: 'Semester Aktif' },
  { value: 'SYSTEM_SUBJECT', label: 'Mapel dari Assignment' },
  { value: 'SYSTEM_CLASS_LEVEL', label: 'Tingkat dari Assignment' },
  { value: 'SYSTEM_CLASS_NAME', label: 'Kelas/Rombel dari Assignment' },
  { value: 'SYSTEM_SKILL_PROGRAM', label: 'Program Keahlian dari Assignment' },
  { value: 'SYSTEM_TEACHER_NAME', label: 'Nama Guru Login' },
  { value: 'SYSTEM_PLACE_DATE', label: 'Tempat dan Tanggal Otomatis' },
  { value: 'BOUND', label: 'Ambil dari Kolom Terikat' },
];

const QUICK_GUIDE_STEPS = [
  'Konfigurasi ini selalu mengikuti tahun ajaran aktif yang tampil di header aplikasi.',
  'Tambahkan/Edit program, lalu atur status aktif dan visibilitas menu guru.',
  'Di dalam template dokumen, susun section dan kolom sesuai kebutuhan kurikulum.',
  'Gunakan semantic key dan binding key jika kolom perlu terintegrasi antar program.',
  'Simpan perubahan agar struktur langsung tersinkron ke menu Perangkat Ajar guru.',
];

const ADVANCED_GUIDE_SECTIONS: Array<{ title: string; items: string[] }> = [
  {
    title: 'A. Struktur Program',
    items: [
      'Kode Program: identitas unik program (contoh: CP, ATP, PROTA).',
      'Label Program: nama menu yang tampil di role guru.',
      'Label Pendek: singkatan untuk badge/konteks ringkas.',
      'Target Kelas: batasi program hanya untuk tingkat X/XI/XII (kosong = semua kelas).',
      'Menu Guru: jika nonaktif, menu tidak muncul di role guru.',
    ],
  },
  {
    title: 'B. Struktur Dokumen',
    items: [
      'Section TABLE: cocok untuk format grid/tabel seperti CP, ATP, PROTA, PROSEM, KKTP, Matriks.',
      'Section TEXT: cocok untuk narasi seperti catatan, tujuan umum, arahan dokumen.',
      'Baris Default menentukan jumlah baris awal saat guru membuat dokumen baru.',
      'Section repeatable memungkinkan guru menambah blok/kelompok data baru.',
    ],
  },
  {
    title: 'C. Tipe Data Kolom',
    items: [
      'TEXT/TEXTAREA untuk teks biasa, NUMBER untuk nilai angka/jam/alokasi.',
      'SELECT untuk pilihan tetap (opsi dipisah koma).',
      'SEMESTER/MONTH/WEEK/WEEK_GRID untuk kebutuhan kalender pembelajaran.',
      'READONLY_BOUND untuk kolom turunan yang mengambil data dari binding.',
    ],
  },
  {
    title: 'D. Integrasi Antar Program',
    items: [
      'Gunakan semantic key yang sama pada kolom dengan makna sama, contoh: tujuan_pembelajaran.',
      'Gunakan binding key saat kolom harus menarik nilai dari program lain, contoh: cp.tujuan_pembelajaran.',
      'Value source BOUND dipakai untuk kolom turunan agar guru tidak input ulang data yang sama.',
    ],
  },
  {
    title: 'E. Operasional Aman',
    items: [
      'Simpan perubahan setelah edit agar sinkron ke role guru.',
      'Hindari mengubah key kolom yang sudah dipakai dokumen berjalan, kecuali benar-benar diperlukan.',
      'Jika perlu ubah struktur besar, lakukan di awal tahun ajaran sebelum dokumen guru terisi banyak data.',
    ],
  },
];

function createEmptyColumn(index = 0): TeachingResourceProgramColumnSchema {
  return {
    key: `kolom_${index + 1}`,
    label: `Kolom ${index + 1}`,
    dataType: 'TEXT',
    valueSource: 'MANUAL',
    multiline: false,
    required: false,
    readOnly: false,
  };
}

function createEmptySection(index = 0, editorType: 'TEXT' | 'TABLE' = 'TABLE'): TeachingResourceProgramSectionSchema {
  return {
    key: `bagian_${index + 1}`,
    label: `Bagian ${index + 1}`,
    description: '',
    repeatable: false,
    defaultRows: 1,
    editorType,
    columns: editorType === 'TABLE' ? [createEmptyColumn(0)] : [],
    prefillRows: [],
    sectionTitleEditable: editorType !== 'TABLE',
    titlePlaceholder: editorType === 'TEXT' ? 'Judul bagian' : undefined,
    bodyPlaceholder: editorType === 'TEXT' ? 'Isi bagian dokumen...' : undefined,
  };
}

function createDefaultProgramSchema(code: string, label: string): TeachingResourceProgramSchema {
  const normalizedCode = normalizeTeachingResourceProgramCode(code || label || 'CUSTOM_PROGRAM');
  return {
    version: 1,
    sourceSheet: normalizedCode,
    intro: `Struktur dokumen ${label || normalizedCode} diatur kurikulum dan diisi guru sesuai template aktif.`,
    titleHint: `Dokumen ${label || normalizedCode}`,
    summaryHint: 'Ringkasan singkat dokumen',
    sections: [createEmptySection(0, 'TABLE')],
  };
}

function normalizeSchemaKey(raw: unknown, fallback: string): string {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function cloneProgramSchema(schema?: TeachingResourceProgramSchema, code = 'CUSTOM_PROGRAM', label = 'Program Custom') {
  const fallback = createDefaultProgramSchema(code, label);
  return JSON.parse(JSON.stringify(schema || fallback)) as TeachingResourceProgramSchema;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string } }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
}

function toProgramRows(payload: unknown): ProgramFormRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const normalized = payload as {
    data?: {
      programs?: TeachingResourceProgram[];
      data?: {
        programs?: TeachingResourceProgram[];
      };
    };
    programs?: TeachingResourceProgram[];
  };
  const programs = Array.isArray(normalized.data?.programs)
    ? normalized.data.programs
    : Array.isArray(normalized.data?.data?.programs)
      ? normalized.data.data.programs
      : Array.isArray(normalized.programs)
        ? normalized.programs
        : [];
  return programs
    .map((program, index) => ({
      rowId: `${program.code || 'program'}-${program.id || index}`,
      id: program.id,
      code: normalizeTeachingResourceProgramCode(program.code),
      label: String(program.label || '').trim(),
      shortLabel: String(program.shortLabel || '').trim(),
      description: String(program.description || '').trim(),
      order: Number(program.order || (index + 1) * 10),
      isActive: Boolean(program.isActive),
      showOnTeacherMenu: Boolean(program.showOnTeacherMenu),
      targetClassLevels: Array.isArray(program.targetClassLevels)
        ? program.targetClassLevels.map((level) => String(level || '').trim().toUpperCase()).filter(Boolean)
        : [],
      schema: program.schema,
      source: program.source || 'custom',
    }))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.label.localeCompare(b.label));
}

function normalizeOrder(rows: ProgramFormRow[]): ProgramFormRow[] {
  return [...rows]
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.label.localeCompare(b.label))
    .map((row, index) => ({
      ...row,
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : (index + 1) * 10,
    }));
}

function createDefaultDraft(seed: number): CreateProgramDraft {
  const code = normalizeTeachingResourceProgramCode(`CUSTOM_${seed}`);
  return {
    code,
    label: `Program Custom ${seed}`,
    shortLabel: `Custom ${seed}`,
    description: DEFAULT_CUSTOM_DESCRIPTION,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: createDefaultProgramSchema(code, `Program Custom ${seed}`),
  };
}

export default function TeachingResourceProgramManagementPage() {
  const queryClient = useQueryClient();
  const { data: activeYear, isLoading: isActiveYearLoading } = useActiveAcademicYear();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProgramFormRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateProgramDraft>(createDefaultDraft(1));
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<ProgramFormRow | null>(null);

  useEffect(() => {
    const activeId = Number(activeYear?.id || activeYear?.academicYearId || 0);
    if (Number.isFinite(activeId) && activeId > 0) {
      setSelectedAcademicYearId(activeId);
      return;
    }
    setSelectedAcademicYearId(null);
  }, [activeYear?.academicYearId, activeYear?.id]);

  const programsQuery = useQuery({
    queryKey: ['teaching-resource-program-config', 'management', selectedAcademicYearId],
    enabled: Boolean(selectedAcademicYearId),
    queryFn: () =>
      teachingResourceProgramService.getPrograms({
        academicYearId: Number(selectedAcademicYearId),
        roleContext: 'all',
        includeInactive: true,
      }),
    staleTime: 2 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!programsQuery.data) return;
    setRows(normalizeOrder(toProgramRows(programsQuery.data)));
    setIsDirty(false);
  }, [programsQuery.data]);

  const handleResetChanges = () => {
    if (!programsQuery.data) return;
    setRows(normalizeOrder(toProgramRows(programsQuery.data)));
    setIsDirty(false);
  };

  const handleAddProgram = () => {
    const seed = rows.length + 1;
    setCreateDraft(createDefaultDraft(seed));
    setEditingRowId(null);
    setIsCreateModalOpen(true);
  };

  const handleEditProgram = (row: ProgramFormRow) => {
    setCreateDraft({
      code: row.code,
      label: row.label,
      shortLabel: row.shortLabel,
      description: row.description,
      isActive: row.isActive,
      showOnTeacherMenu: row.showOnTeacherMenu,
      targetClassLevels: row.targetClassLevels,
      schema: cloneProgramSchema(row.schema, row.code, row.label),
    });
    setEditingRowId(row.rowId);
    setIsCreateModalOpen(true);
  };

  const handleCreateDraftToggleLevel = (level: string) => {
    const normalizedLevel = String(level || '').trim().toUpperCase();
    setCreateDraft((prev) => {
      const set = new Set(prev.targetClassLevels || []);
      if (set.has(normalizedLevel)) {
        set.delete(normalizedLevel);
      } else {
        set.add(normalizedLevel);
      }
      return {
        ...prev,
        targetClassLevels: Array.from(set),
      };
    });
  };

  const updateDraftSchema = (updater: (schema: TeachingResourceProgramSchema) => TeachingResourceProgramSchema) => {
    setCreateDraft((prev) => ({
      ...prev,
      schema: updater(cloneProgramSchema(prev.schema, prev.code, prev.label)),
    }));
  };

  const handleSchemaMetaChange = (field: keyof TeachingResourceProgramSchema, value: string | number) => {
    updateDraftSchema((schema) => ({
      ...schema,
      [field]: value,
    }));
  };

  const handleSectionChange = (
    sectionIndex: number,
    field: keyof TeachingResourceProgramSectionSchema,
    value: TeachingResourceProgramSectionSchema[keyof TeachingResourceProgramSectionSchema],
  ) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              [field]: value,
            }
          : section,
      ),
    }));
  };

  const handleMoveSection = (sectionIndex: number, direction: -1 | 1) => {
    updateDraftSchema((schema) => {
      const targetIndex = sectionIndex + direction;
      if (targetIndex < 0 || targetIndex >= schema.sections.length) return schema;
      const sections = [...schema.sections];
      const [movedSection] = sections.splice(sectionIndex, 1);
      sections.splice(targetIndex, 0, movedSection);
      return {
        ...schema,
        sections,
      };
    });
  };

  const handleAddSection = (editorType: 'TEXT' | 'TABLE' = 'TABLE') => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: [...schema.sections, createEmptySection(schema.sections.length, editorType)],
    }));
  };

  const handleRemoveSection = (sectionIndex: number) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.filter((_, index) => index !== sectionIndex),
    }));
  };

  const handleColumnChange = (
    sectionIndex: number,
    columnIndex: number,
    field: keyof TeachingResourceProgramColumnSchema,
    value: TeachingResourceProgramColumnSchema[keyof TeachingResourceProgramColumnSchema],
  ) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              columns: (section.columns || []).map((column, currentColumnIndex) =>
                currentColumnIndex === columnIndex
                  ? {
                      ...column,
                      [field]: value,
                    }
                  : column,
              ),
            }
          : section,
      ),
    }));
  };

  const handleMoveColumn = (sectionIndex: number, columnIndex: number, direction: -1 | 1) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section, index) => {
        if (index !== sectionIndex) return section;
        const columns = [...(section.columns || [])];
        const targetIndex = columnIndex + direction;
        if (targetIndex < 0 || targetIndex >= columns.length) return section;
        const [movedColumn] = columns.splice(columnIndex, 1);
        columns.splice(targetIndex, 0, movedColumn);
        return {
          ...section,
          columns,
        };
      }),
    }));
  };

  const handleAddColumn = (sectionIndex: number) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              columns: [...(section.columns || []), createEmptyColumn((section.columns || []).length)],
            }
          : section,
      ),
    }));
  };

  const handleRemoveColumn = (sectionIndex: number, columnIndex: number) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              columns: (section.columns || []).filter((_, currentColumnIndex) => currentColumnIndex !== columnIndex),
            }
          : section,
      ),
    }));
  };

  const handleCreateProgram = async () => {
    const seed = rows.length + 1;
    const label = createDraft.label.trim();
    const normalizedCode =
      normalizeTeachingResourceProgramCode(createDraft.code) ||
      normalizeTeachingResourceProgramCode(label.replace(/\s+/g, '_')) ||
      normalizeTeachingResourceProgramCode(`CUSTOM_${seed}`);
    if (!normalizedCode) {
      toast.error('Kode program wajib diisi.');
      return;
    }
    if (!label) {
      toast.error('Label program wajib diisi.');
      return;
    }
    if (
      rows.some(
        (row) =>
          row.rowId !== editingRowId &&
          normalizeTeachingResourceProgramCode(row.code) === normalizedCode,
      )
    ) {
      toast.error(`Kode program ${normalizedCode} sudah digunakan.`);
      return;
    }

    let nextRows: ProgramFormRow[];

    if (editingRowId) {
      nextRows = normalizeOrder(
        rows.map((row) =>
          row.rowId === editingRowId
            ? {
                ...row,
                code: normalizedCode,
                label,
                shortLabel: createDraft.shortLabel.trim() || label,
                description: createDraft.description.trim() || DEFAULT_CUSTOM_DESCRIPTION,
                isActive: createDraft.isActive,
                showOnTeacherMenu: createDraft.showOnTeacherMenu,
                targetClassLevels: createDraft.targetClassLevels,
                schema: cloneProgramSchema(createDraft.schema, normalizedCode, label),
              }
            : row,
        ),
      );
    } else {
      const rowId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      nextRows = normalizeOrder([
        ...rows,
        {
          rowId,
          code: normalizedCode,
          label,
          shortLabel: createDraft.shortLabel.trim() || label,
          description: createDraft.description.trim() || DEFAULT_CUSTOM_DESCRIPTION,
          order: (rows.length + 1) * 10,
          isActive: createDraft.isActive,
          showOnTeacherMenu: createDraft.showOnTeacherMenu,
          targetClassLevels: createDraft.targetClassLevels,
          schema: cloneProgramSchema(createDraft.schema, normalizedCode, label),
          source: 'new',
        },
      ]);
    }

    const success = await persistRows(
      nextRows,
      editingRowId ? 'Program perangkat ajar berhasil diperbarui.' : 'Program perangkat ajar berhasil ditambahkan.',
    );

    if (!success) return;

    setEditingRowId(null);
    setIsCreateModalOpen(false);
  };

  const handleRemoveProgram = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
    setIsDirty(true);
  };

  const handleRequestRemoveProgram = (row: ProgramFormRow) => {
    setPendingDeleteRow(row);
  };

  const handleConfirmRemoveProgram = async () => {
    if (!pendingDeleteRow) return;

    if (!pendingDeleteRow.id || pendingDeleteRow.source === 'new') {
      handleRemoveProgram(pendingDeleteRow.rowId);
      setPendingDeleteRow(null);
      toast.success('Program belum tersimpan berhasil dihapus dari daftar.');
      return;
    }

    if (!selectedAcademicYearId) {
      toast.error('Tahun ajaran belum dipilih.');
      return;
    }

    try {
      setIsDeleting(true);
      await teachingResourceProgramService.deleteProgram(Number(pendingDeleteRow.id), {
        academicYearId: Number(selectedAcademicYearId),
      });
      await programsQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['teaching-resource-program-config'] });
      await queryClient.invalidateQueries({ queryKey: ['sidebar-teaching-resource-programs'] });
      setPendingDeleteRow(null);
      toast.success('Program perangkat ajar berhasil dihapus.');
    } catch (error) {
      toast.error(toErrorMessage(error, 'Gagal menghapus program perangkat ajar.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const validateRows = (candidateRows: ProgramFormRow[]) => {
    if (candidateRows.length === 0) {
      throw new Error('Program perangkat ajar belum tersedia.');
    }
    const seenCode = new Set<string>();
    candidateRows.forEach((row, index) => {
      const code = normalizeTeachingResourceProgramCode(row.code);
      if (!code) throw new Error(`Kode program baris ${index + 1} wajib diisi.`);
      if (!row.label.trim()) throw new Error(`Label program baris ${index + 1} wajib diisi.`);
      if (seenCode.has(code)) throw new Error(`Kode program duplikat: ${code}`);
      seenCode.add(code);
    });
  };

  const persistRows = async (candidateRows: ProgramFormRow[], successMessage: string) => {
    if (!selectedAcademicYearId) {
      toast.error('Tahun ajaran belum dipilih.');
      return false;
    }

    try {
      validateRows(candidateRows);
      setIsSaving(true);
      const payload = candidateRows.map((row) => ({
        id: row.id,
        code: normalizeTeachingResourceProgramCode(row.code),
        label: row.label.trim(),
        shortLabel: row.shortLabel.trim(),
        description: row.description.trim(),
        order: Number(row.order || 0),
        isActive: row.isActive,
        showOnTeacherMenu: row.showOnTeacherMenu,
        targetClassLevels: row.targetClassLevels,
        schema: row.schema,
      }));
      await teachingResourceProgramService.updatePrograms({
        academicYearId: Number(selectedAcademicYearId),
        programs: payload,
      });
      setRows(candidateRows);
      await programsQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['teaching-resource-program-config'] });
      await queryClient.invalidateQueries({ queryKey: ['sidebar-teaching-resource-programs'] });
      setIsDirty(false);
      toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error, 'Gagal menyimpan program perangkat ajar.'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    await persistRows(rows, 'Program Perangkat Ajar berhasil disimpan.');
  };

  const isLoading = isActiveYearLoading || (Boolean(selectedAcademicYearId) && programsQuery.isLoading);

  return (
    <div className="space-y-6 w-full pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">Program Perangkat Ajar</h1>
          <p className="text-gray-500">
            Kelola daftar menu Perangkat Ajar secara dinamis per tahun ajaran. Perubahan langsung tersinkron ke menu guru.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsGuideModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
        >
          <BookOpen size={15} />
          Panduan Penggunaan
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
          </div>
          <div className="md:col-span-1 flex items-end">
            <div className="w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Konfigurasi ini setara konsep Program Ujian: dinamis, per tahun ajaran, dan menjadi sumber menu Perangkat Ajar guru.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Daftar Program</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetChanges}
              disabled={!isDirty || isSaving}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset Perubahan
            </button>
            <button
              type="button"
              onClick={handleAddProgram}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} />
              Tambah Program
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
            Memuat program perangkat ajar...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
            Belum ada data program.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Kode</th>
                  <th className="px-3 py-2">Label Program</th>
                  <th className="px-3 py-2">Label Pendek</th>
                  <th className="px-3 py-2">Deskripsi</th>
                  <th className="px-3 py-2">Target Kelas</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Menu Guru</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowId} className="border-b border-gray-100 align-top last:border-b-0">
                    <td className="px-3 py-3">
                      <div className="font-medium uppercase text-gray-900">{row.code}</div>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900">{row.label}</td>
                    <td className="px-3 py-3 text-gray-700">{row.shortLabel}</td>
                    <td className="px-3 py-3 text-gray-600">{row.description || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[180px] flex-wrap gap-2">
                        {row.targetClassLevels.length > 0 ? (
                          row.targetClassLevels.map((level) => (
                            <span
                              key={`${row.rowId}-${level}`}
                              className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                            >
                              {level}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">Semua kelas</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          row.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {row.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          row.showOnTeacherMenu ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {row.showOnTeacherMenu ? 'Tampil' : 'Sembunyikan'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditProgram(row)}
                          title="Edit program"
                          aria-label="Edit program"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRequestRemoveProgram(row)}
                          title="Hapus program"
                          aria-label="Hapus program"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="w-full max-w-7xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingRowId ? 'Edit Program Perangkat Ajar' : 'Tambah Program Perangkat Ajar'}
                </h2>
                <p className="text-sm text-gray-500">
                  Atur identitas program dan template struktur dokumen. Guru nantinya menerima struktur ini secara baku.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingRowId(null);
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[78vh] space-y-6 overflow-y-auto px-5 py-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Identitas Program</h3>
                  <p className="text-xs text-gray-500">Bagian ini mengatur nama program dan visibilitas menu guru.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Kode Program</label>
                    <input
                      type="text"
                      value={createDraft.code}
                      onChange={(event) =>
                        setCreateDraft((prev) => {
                          const nextCode = normalizeTeachingResourceProgramCode(event.target.value);
                          const currentSourceSheet = prev.schema?.sourceSheet;
                          return {
                            ...prev,
                            code: nextCode,
                            schema: {
                              ...cloneProgramSchema(prev.schema, nextCode, prev.label),
                              sourceSheet:
                                !currentSourceSheet || currentSourceSheet === normalizeTeachingResourceProgramCode(prev.code)
                                  ? nextCode
                                  : currentSourceSheet,
                            },
                          };
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="CUSTOM_PROGRAM"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Label Program</label>
                    <input
                      type="text"
                      value={createDraft.label}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, label: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Nama program"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Label Pendek</label>
                    <input
                      type="text"
                      value={createDraft.shortLabel}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, shortLabel: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Label singkat"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Target Kelas</label>
                    <div className="flex min-h-[42px] flex-wrap gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      {TARGET_CLASS_OPTIONS.map((option) => {
                        const checked = createDraft.targetClassLevels.includes(option.value);
                        return (
                          <label
                            key={`create-${option.value}`}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                              checked
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white text-gray-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleCreateDraftToggleLevel(option.value)}
                              className="sr-only"
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="xl:col-span-4">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Deskripsi</label>
                    <textarea
                      value={createDraft.description}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Deskripsi singkat program"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={createDraft.isActive}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Program aktif
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={createDraft.showOnTeacherMenu}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, showOnTeacherMenu: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Tampilkan di menu guru
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Template Dokumen</h3>
                  <p className="text-xs text-gray-500">
                    Kurikulum menentukan struktur dokumen di sini. Guru nantinya hanya menerima template aktif ini.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Source Sheet / Kode Template</label>
                    <input
                      type="text"
                      value={createDraft.schema.sourceSheet || ''}
                      onChange={(event) => handleSchemaMetaChange('sourceSheet', normalizeTeachingResourceProgramCode(event.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="CONTOH: PROTA"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Hint Judul Dokumen</label>
                    <input
                      type="text"
                      value={createDraft.schema.titleHint || ''}
                      onChange={(event) => handleSchemaMetaChange('titleHint', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Contoh: Program Tahunan - [Mapel]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Intro Dokumen</label>
                    <textarea
                      value={createDraft.schema.intro || ''}
                      onChange={(event) => handleSchemaMetaChange('intro', event.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Penjelasan singkat template dokumen ini"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Hint Ringkasan</label>
                    <input
                      type="text"
                      value={createDraft.schema.summaryHint || ''}
                      onChange={(event) => handleSchemaMetaChange('summaryHint', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Ringkasan singkat dokumen"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Struktur Section & Kolom</h3>
                    <p className="text-xs text-gray-500">
                      Atur bagian dokumen, tipe editor, dan kolom-kolom yang akan diterima guru.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddSection('TABLE')}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <Plus size={14} />
                      Tambah Section Tabel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddSection('TEXT')}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Plus size={14} />
                      Tambah Section Teks
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {createDraft.schema.sections.map((section, sectionIndex) => (
                    <div key={`${section.key}-${sectionIndex}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            Section {sectionIndex + 1}: {section.label || `Bagian ${sectionIndex + 1}`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {section.editorType === 'TABLE' ? 'Tabel kerja dinamis' : 'Blok teks / narasi'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMoveSection(sectionIndex, -1)}
                            disabled={sectionIndex === 0}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Naikkan section"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveSection(sectionIndex, 1)}
                            disabled={sectionIndex === createDraft.schema.sections.length - 1}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Turunkan section"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(sectionIndex)}
                            disabled={createDraft.schema.sections.length === 1}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title="Hapus section"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Key Section</label>
                          <input
                            type="text"
                            value={section.key}
                            onChange={(event) =>
                              handleSectionChange(sectionIndex, 'key', normalizeSchemaKey(event.target.value, `bagian_${sectionIndex + 1}`))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Label Section</label>
                          <input
                            type="text"
                            value={section.label}
                            onChange={(event) => handleSectionChange(sectionIndex, 'label', event.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tipe Editor</label>
                          <select
                            value={section.editorType || 'TABLE'}
                            onChange={(event) =>
                              handleSectionChange(
                                sectionIndex,
                                'editorType',
                                event.target.value === 'TEXT' ? 'TEXT' : 'TABLE',
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          >
                            <option value="TABLE">Table / Grid</option>
                            <option value="TEXT">Teks / Narasi</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Baris Default</label>
                          <input
                            type="number"
                            min={1}
                            value={section.defaultRows || 1}
                            onChange={(event) => handleSectionChange(sectionIndex, 'defaultRows', Math.max(1, Number(event.target.value || 1)))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div className="md:col-span-2 xl:col-span-4">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</label>
                          <textarea
                            value={section.description || ''}
                            onChange={(event) => handleSectionChange(sectionIndex, 'description', event.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Keterangan singkat fungsi section ini"
                          />
                        </div>
                        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={section.repeatable}
                            onChange={(event) => handleSectionChange(sectionIndex, 'repeatable', event.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Bisa tambah banyak blok/baris
                        </label>
                        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={section.sectionTitleEditable ?? false}
                            onChange={(event) => handleSectionChange(sectionIndex, 'sectionTitleEditable', event.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Judul section bisa diedit guru
                        </label>
                        {section.editorType === 'TEXT' ? (
                          <>
                            <div className="xl:col-span-2">
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Placeholder Judul</label>
                              <input
                                type="text"
                                value={section.titlePlaceholder || ''}
                                onChange={(event) => handleSectionChange(sectionIndex, 'titlePlaceholder', event.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                placeholder="Judul bagian"
                              />
                            </div>
                            <div className="xl:col-span-2">
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Placeholder Isi</label>
                              <input
                                type="text"
                                value={section.bodyPlaceholder || ''}
                                onChange={(event) => handleSectionChange(sectionIndex, 'bodyPlaceholder', event.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                placeholder="Isi bagian dokumen..."
                              />
                            </div>
                          </>
                        ) : null}
                      </div>

                      {section.editorType === 'TABLE' ? (
                        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">Kolom Section</div>
                              <div className="text-xs text-gray-500">
                                Tentukan label, tipe data, dan binding yang akan diterima guru.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddColumn(sectionIndex)}
                              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <Plus size={14} />
                              Tambah Kolom
                            </button>
                          </div>

                          <div className="space-y-3">
                            {(section.columns || []).map((column, columnIndex) => (
                              <div key={`${section.key}-${column.key}-${columnIndex}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">
                                      Kolom {columnIndex + 1}: {column.label || `Kolom ${columnIndex + 1}`}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      Gunakan semantic key yang sama bila kolom ini harus terhubung dengan program lain.
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleMoveColumn(sectionIndex, columnIndex, -1)}
                                      disabled={columnIndex === 0}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Naikkan kolom"
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveColumn(sectionIndex, columnIndex, 1)}
                                      disabled={columnIndex === (section.columns || []).length - 1}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Turunkan kolom"
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveColumn(sectionIndex, columnIndex)}
                                      disabled={(section.columns || []).length === 1}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Hapus kolom"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Key Kolom</label>
                                    <input
                                      type="text"
                                      value={column.key}
                                      onChange={(event) =>
                                        handleColumnChange(
                                          sectionIndex,
                                          columnIndex,
                                          'key',
                                          normalizeSchemaKey(event.target.value, `kolom_${columnIndex + 1}`),
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Label Kolom</label>
                                    <input
                                      type="text"
                                      value={column.label}
                                      onChange={(event) => handleColumnChange(sectionIndex, columnIndex, 'label', event.target.value)}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tipe Data</label>
                                    <select
                                      value={column.dataType || 'TEXT'}
                                      onChange={(event) =>
                                        handleColumnChange(
                                          sectionIndex,
                                          columnIndex,
                                          'dataType',
                                          event.target.value as TeachingResourceColumnDataType,
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    >
                                      {COLUMN_DATA_TYPE_OPTIONS.map((option) => (
                                        <option key={`${section.key}-${column.key}-${option.value}`} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Sumber Nilai</label>
                                    <select
                                      value={column.valueSource || 'MANUAL'}
                                      onChange={(event) =>
                                        handleColumnChange(
                                          sectionIndex,
                                          columnIndex,
                                          'valueSource',
                                          event.target.value as TeachingResourceColumnValueSource,
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                    >
                                      {COLUMN_VALUE_SOURCE_OPTIONS.map((option) => (
                                        <option key={`${section.key}-${column.key}-${option.value}`} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Semantic Key</label>
                                    <input
                                      type="text"
                                      value={column.semanticKey || ''}
                                      onChange={(event) =>
                                        handleColumnChange(
                                          sectionIndex,
                                          columnIndex,
                                          'semanticKey',
                                          normalizeSchemaKey(event.target.value, ''),
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      placeholder="contoh: tujuan_pembelajaran"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Binding Key</label>
                                    <input
                                      type="text"
                                      value={column.bindingKey || ''}
                                      onChange={(event) =>
                                        handleColumnChange(
                                          sectionIndex,
                                          columnIndex,
                                          'bindingKey',
                                          normalizeSchemaKey(event.target.value, ''),
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      placeholder="contoh: cp.tujuan_pembelajaran"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Placeholder</label>
                                    <input
                                      type="text"
                                      value={column.placeholder || ''}
                                      onChange={(event) => handleColumnChange(sectionIndex, columnIndex, 'placeholder', event.target.value)}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      placeholder="Petunjuk input"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Opsi Pilihan</label>
                                    <input
                                      type="text"
                                      value={(column.options || []).join(', ')}
                                      onChange={(event) =>
                                        handleColumnChange(
                                          sectionIndex,
                                          columnIndex,
                                          'options',
                                          event.target.value
                                            .split(',')
                                            .map((item) => item.trim())
                                            .filter(Boolean),
                                        )
                                      }
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      placeholder="opsi1, opsi2, opsi3"
                                    />
                                  </div>
                                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                    <input
                                      type="checkbox"
                                      checked={column.multiline ?? false}
                                      onChange={(event) => handleColumnChange(sectionIndex, columnIndex, 'multiline', event.target.checked)}
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Multiline
                                  </label>
                                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                    <input
                                      type="checkbox"
                                      checked={column.required ?? false}
                                      onChange={(event) => handleColumnChange(sectionIndex, columnIndex, 'required', event.target.checked)}
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Wajib isi
                                  </label>
                                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                    <input
                                      type="checkbox"
                                      checked={column.readOnly ?? false}
                                      onChange={(event) => handleColumnChange(sectionIndex, columnIndex, 'readOnly', event.target.checked)}
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Readonly
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingRowId(null);
                }}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateProgram}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editingRowId ? <Pencil size={14} /> : <Plus size={14} />}
                {isSaving ? 'Menyimpan...' : editingRowId ? 'Simpan Edit Program' : 'Tambah Program'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isGuideModalOpen ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Panduan Program Perangkat Ajar</h3>
                <p className="text-sm text-gray-500">
                  Dokumen ini menjadi acuan operasional kurikulum saat menyusun template perangkat ajar dinamis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideModalOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[76vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <h4 className="text-sm font-semibold text-blue-900">Alur Cepat</h4>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-blue-800">
                  {QUICK_GUIDE_STEPS.map((step) => (
                    <li key={`guide-${step}`}>{step}</li>
                  ))}
                </ol>
              </div>

              {ADVANCED_GUIDE_SECTIONS.map((section) => (
                <div key={section.title} className="rounded-xl border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-gray-900">{section.title}</h4>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-700">
                    {section.items.map((item) => (
                      <li key={`${section.title}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsGuideModalOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteRow ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Hapus Program?</h3>
              <p className="mt-1 text-sm text-gray-500">
                Program <span className="font-medium text-gray-800">{pendingDeleteRow.label}</span> akan dihapus dari daftar.
                Tindakan ini akan langsung tersimpan setelah Anda konfirmasi.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => setPendingDeleteRow(null)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveProgram}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Trash2 size={14} />
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-6 right-6 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving || !selectedAcademicYearId}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} />
          {isSaving ? 'Menyimpan...' : 'Simpan Program'}
        </button>
      </div>
    </div>
  );
}
