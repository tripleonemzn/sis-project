import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  normalizeTeachingResourceProgramCode,
  teachingResourceProgramService,
  type TeachingResourceBlockLayout,
  type TeachingResourceBlockType,
  type TeachingResourceColumnDataType,
  type TeachingResourceColumnValueSource,
  type TeachingResourceFieldSourceType,
  type TeachingResourceFieldSyncMode,
  type TeachingResourcePrintRules,
  type TeachingResourceProgramColumnSchema,
  type TeachingResourceProgram,
  type TeachingResourceProgramSchema,
  type TeachingResourceProgramSectionSchema,
  type TeachingResourceReferenceSelectionMode,
  type TeachingResourceSchemaMode,
  type TeachingResourceTeacherEditMode,
  type TeachingResourceTeacherRules,
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

type ProgramEditorMode = 'SIMPLE' | 'ADVANCED';
type ProgramBlueprintMode = 'GROUPED_ANALYSIS' | 'TIME_DISTRIBUTION' | 'MATRIX_GRID' | 'RICH_MIXED' | 'FREEFORM';
type ColumnOperationalRole =
  | 'MANUAL_FIELD'
  | 'REFERENCE_SOURCE'
  | 'REFERENCE_PICKER'
  | 'SNAPSHOT_TARGET'
  | 'SYSTEM_FIELD';

const TARGET_CLASS_OPTIONS = [
  { value: 'X', label: 'X' },
  { value: 'XI', label: 'XI' },
  { value: 'XII', label: 'XII' },
];

const EDITOR_MODE_OPTIONS: Array<{ value: ProgramEditorMode; label: string; description: string }> = [
  {
    value: 'SIMPLE',
    label: 'Mode Siap Pakai',
    description: 'Untuk operasional harian: cukup isi nama menu, pilih bentuk dokumen, lalu simpan.',
  },
  {
    value: 'ADVANCED',
    label: 'Mode Teknisi',
    description: 'Khusus admin/kurikulum yang paham struktur kolom, kode sistem, binding, dan schema detail.',
  },
];

const BLUEPRINT_MODE_OPTIONS: Array<{
  value: ProgramBlueprintMode;
  label: string;
  description: string;
  helper: string;
}> = [
  {
    value: 'GROUPED_ANALYSIS',
    label: 'Analisis / Pemetaan',
    description: 'Untuk dokumen yang memetakan elemen, tujuan pembelajaran, materi, aktivitas, dan asesmen.',
    helper: 'Pilih ini jika guru perlu mengisi tabel analisis pembelajaran yang cukup lengkap.',
  },
  {
    value: 'TIME_DISTRIBUTION',
    label: 'Distribusi Waktu',
    description: 'Untuk dokumen yang mengatur semester, bulan, minggu, tujuan pembelajaran, dan alokasi JP.',
    helper: 'Paling cocok untuk Prota, Promes, atau sebaran waktu mengajar.',
  },
  {
    value: 'MATRIX_GRID',
    label: 'Matriks Minggu',
    description: 'Untuk dokumen yang menandai pelaksanaan pembelajaran pada minggu ke-1 sampai minggu ke-19.',
    helper: 'Pilih ini jika guru cukup menandai minggu pelaksanaan pada grid.',
  },
  {
    value: 'RICH_MIXED',
    label: 'Narasi + Tabel',
    description: 'Untuk dokumen yang berisi paragraf penjelasan dan tabel kerja.',
    helper: 'Pilih ini jika guru perlu menulis narasi sekaligus mengisi tabel.',
  },
  {
    value: 'FREEFORM',
    label: 'Format Bebas',
    description: 'Untuk format yang belum cocok dengan pilihan lain.',
    helper: 'Gunakan jika bentuk dokumen masih eksperimen atau belum punya pola tetap.',
  },
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
const SCHEMA_MODE_OPTIONS: Array<{ value: TeachingResourceSchemaMode; label: string }> = [
  { value: 'BLOCKS_V1', label: 'Blocks V1' },
  { value: 'LEGACY_SECTIONS', label: 'Legacy Sections' },
];
const BLOCK_TYPE_OPTIONS: Array<{ value: TeachingResourceBlockType; label: string }> = [
  { value: 'HEADER', label: 'Header Dokumen' },
  { value: 'CONTEXT', label: 'Info Konteks' },
  { value: 'TABLE', label: 'Tabel Utama' },
  { value: 'RICH_TEXT', label: 'Narasi / Rich Text' },
  { value: 'SIGNATURE', label: 'Pengesahan / TTD' },
  { value: 'NOTE', label: 'Catatan' },
];
const BLOCK_LAYOUT_OPTIONS: Array<{ value: TeachingResourceBlockLayout; label: string }> = [
  { value: 'STACK', label: 'Stack' },
  { value: 'GRID', label: 'Grid' },
  { value: 'TABLE', label: 'Table' },
];
const FIELD_SOURCE_TYPE_OPTIONS: Array<{ value: TeachingResourceFieldSourceType; label: string }> = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'SYSTEM', label: 'System' },
  { value: 'DOCUMENT_REFERENCE', label: 'Referensi Dokumen' },
  { value: 'DOCUMENT_SNAPSHOT', label: 'Snapshot Dokumen' },
  { value: 'DERIVED', label: 'Turunan / Derived' },
  { value: 'STATIC_OPTION', label: 'Opsi Tetap' },
];
const FIELD_SYNC_MODE_OPTIONS: Array<{ value: TeachingResourceFieldSyncMode; label: string }> = [
  { value: 'SYSTEM_DYNAMIC', label: 'System Dynamic' },
  { value: 'SNAPSHOT_ON_SELECT', label: 'Snapshot on Select' },
  { value: 'LIVE_REFERENCE', label: 'Live Reference' },
];
const FIELD_SELECTION_MODE_OPTIONS: Array<{ value: TeachingResourceReferenceSelectionMode; label: string }> = [
  { value: 'AUTO', label: 'Auto' },
  { value: 'PICK_SINGLE', label: 'Pilih Satu' },
  { value: 'PICK_MULTIPLE', label: 'Pilih Banyak' },
];
const FIELD_TEACHER_EDIT_MODE_OPTIONS: Array<{ value: TeachingResourceTeacherEditMode; label: string }> = [
  { value: 'SYSTEM_LOCKED', label: 'Dikunci Sistem' },
  { value: 'TEACHER_EDITABLE', label: 'Guru Boleh Edit' },
  { value: 'TEACHER_APPEND_ONLY', label: 'Guru Tambah Saja' },
];
const COLUMN_OPERATIONAL_ROLE_OPTIONS: Array<{
  value: ColumnOperationalRole;
  label: string;
  description: string;
}> = [
  {
    value: 'MANUAL_FIELD',
    label: 'Input Biasa',
    description: 'Guru mengisi kolom ini secara manual tanpa integrasi khusus.',
  },
  {
    value: 'REFERENCE_SOURCE',
    label: 'Sumber Referensi',
    description: 'Kolom ini boleh dibaca dokumen lain sebagai sumber pilihan referensi.',
  },
  {
    value: 'REFERENCE_PICKER',
    label: 'Pilihan Referensi',
    description: 'Guru memilih data dari dokumen lain lewat dropdown referensi.',
  },
  {
    value: 'SNAPSHOT_TARGET',
    label: 'Field Turunan',
    description: 'Nilai kolom ini diisi otomatis dari snapshot dokumen sumber.',
  },
  {
    value: 'SYSTEM_FIELD',
    label: 'Nilai Sistem',
    description: 'Kolom ini diisi oleh sistem aktif seperti mapel, semester, atau tahun ajaran.',
  },
];

const QUICK_GUIDE_STEPS = [
  'Konfigurasi ini selalu mengikuti tahun ajaran aktif yang tampil di header aplikasi.',
  'Tambahkan/Edit program, lalu atur status aktif dan visibilitas menu guru.',
  'Pilih starter template jika ingin mulai dari pola dokumen yang sudah siap, lalu sesuaikan metadata.',
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

function inferFieldSourceType(column: Partial<TeachingResourceProgramColumnSchema>): TeachingResourceFieldSourceType {
  if (column.sourceType) return column.sourceType;
  if (column.valueSource && column.valueSource !== 'MANUAL' && column.valueSource !== 'BOUND') return 'SYSTEM';
  if (column.valueSource === 'BOUND') return 'DOCUMENT_SNAPSHOT';
  if (column.readOnly) return 'DERIVED';
  return 'MANUAL';
}

function inferTeacherEditMode(column: Partial<TeachingResourceProgramColumnSchema>): TeachingResourceTeacherEditMode {
  if (column.teacherEditMode) return column.teacherEditMode;
  if (column.readOnly || (column.valueSource && column.valueSource !== 'MANUAL')) return 'SYSTEM_LOCKED';
  return 'TEACHER_EDITABLE';
}

function inferBlockType(section: Partial<TeachingResourceProgramSectionSchema>): TeachingResourceBlockType {
  if (section.blockType) return section.blockType;
  const key = String(section.key || '')
    .trim()
    .toLowerCase();
  const label = String(section.label || '')
    .trim()
    .toLowerCase();
  if (section.editorType === 'TABLE') return 'TABLE';
  if (key.startsWith('ttd') || key.includes('pengesahan') || label.includes('pengesahan')) return 'SIGNATURE';
  if (key.includes('konteks') || label.includes('konteks')) return 'CONTEXT';
  if (key.includes('header') || label.includes('header')) return 'HEADER';
  if (key.includes('catatan') || label.includes('catatan')) return 'NOTE';
  return 'RICH_TEXT';
}

function inferBlockLayout(section: Partial<TeachingResourceProgramSectionSchema>): TeachingResourceBlockLayout {
  if (section.layout) return section.layout;
  if (section.editorType === 'TABLE') return 'TABLE';
  return 'STACK';
}

function inferFieldSyncMode(column: Partial<TeachingResourceProgramColumnSchema>): TeachingResourceFieldSyncMode | undefined {
  if (column.binding?.syncMode) return column.binding.syncMode;
  const sourceType = inferFieldSourceType(column);
  if (sourceType === 'SYSTEM') return 'SYSTEM_DYNAMIC';
  if (sourceType === 'DOCUMENT_REFERENCE' || sourceType === 'DOCUMENT_SNAPSHOT' || column.valueSource === 'BOUND') {
    return 'SNAPSHOT_ON_SELECT';
  }
  return undefined;
}

function inferColumnOperationalRole(column: Partial<TeachingResourceProgramColumnSchema>): ColumnOperationalRole {
  const sourceType = inferFieldSourceType(column);
  const normalizedValueSource = String(column.valueSource || '').trim().toUpperCase();
  if (sourceType === 'DOCUMENT_REFERENCE') return 'REFERENCE_PICKER';
  if (sourceType === 'DOCUMENT_SNAPSHOT' || normalizedValueSource === 'BOUND') return 'SNAPSHOT_TARGET';
  if (sourceType === 'SYSTEM' || (!!normalizedValueSource && normalizedValueSource !== 'MANUAL' && normalizedValueSource !== 'BOUND')) {
    return 'SYSTEM_FIELD';
  }
  if (column.exposeAsReference) return 'REFERENCE_SOURCE';
  return 'MANUAL_FIELD';
}

function getColumnOperationalRoleDescription(role: ColumnOperationalRole): string {
  return COLUMN_OPERATIONAL_ROLE_OPTIONS.find((option) => option.value === role)?.description || '';
}

function applyColumnOperationalRole(
  column: TeachingResourceProgramColumnSchema,
  role: ColumnOperationalRole,
): TeachingResourceProgramColumnSchema {
  const normalizedFieldIdentity = normalizeSchemaKey(
    column.fieldIdentity || column.semanticKey || column.bindingKey || column.key,
    normalizeSchemaKey(column.key, 'kolom'),
  );
  const baseBinding = {
    ...(column.binding || {}),
    selectionMode: column.binding?.selectionMode || 'AUTO',
    syncMode: column.binding?.syncMode || inferFieldSyncMode(column),
  };

  switch (role) {
    case 'REFERENCE_SOURCE':
      return {
        ...column,
        fieldIdentity: normalizedFieldIdentity,
        sourceType: 'MANUAL',
        valueSource: 'MANUAL',
        readOnly: false,
        exposeAsReference: true,
        teacherEditMode: 'TEACHER_EDITABLE',
        binding: {
          ...baseBinding,
          syncMode: undefined,
        },
      };
    case 'REFERENCE_PICKER':
      return {
        ...column,
        sourceType: 'DOCUMENT_REFERENCE',
        valueSource: 'MANUAL',
        readOnly: false,
        exposeAsReference: false,
        teacherEditMode: 'TEACHER_EDITABLE',
        binding: {
          ...baseBinding,
          selectionMode: baseBinding.selectionMode || 'PICK_SINGLE',
          syncMode: 'SNAPSHOT_ON_SELECT',
        },
      };
    case 'SNAPSHOT_TARGET':
      return {
        ...column,
        sourceType: 'DOCUMENT_SNAPSHOT',
        valueSource: 'BOUND',
        readOnly: true,
        teacherEditMode: 'SYSTEM_LOCKED',
        binding: {
          ...baseBinding,
          syncMode: 'SNAPSHOT_ON_SELECT',
        },
      };
    case 'SYSTEM_FIELD':
      return {
        ...column,
        sourceType: 'SYSTEM',
        readOnly: true,
        exposeAsReference: false,
        teacherEditMode: 'SYSTEM_LOCKED',
        binding: {
          ...baseBinding,
          syncMode: 'SYSTEM_DYNAMIC',
        },
      };
    case 'MANUAL_FIELD':
    default:
      return {
        ...column,
        sourceType: 'MANUAL',
        valueSource: 'MANUAL',
        readOnly: false,
        exposeAsReference: false,
        teacherEditMode: 'TEACHER_EDITABLE',
        binding: {
          ...baseBinding,
          syncMode: undefined,
        },
      };
  }
}

function applySchemaFoundationDefaults(
  schema: TeachingResourceProgramSchema | undefined,
  code: string,
  label: string,
): TeachingResourceProgramSchema {
  const fallback = createDefaultProgramSchema(code || 'CUSTOM_PROGRAM', label || 'Program Custom');
  const base = schema || fallback;
  const normalizedDocumentTitle = String(base.documentTitle || base.titleHint || label || code || '').trim();
  const normalizedDocumentShortTitle = String(base.documentShortTitle || label || code || '').trim();

  return {
    ...base,
    schemaMode: base.schemaMode || 'BLOCKS_V1',
    documentTitle: normalizedDocumentTitle || undefined,
    documentShortTitle: normalizedDocumentShortTitle || undefined,
    printRules: {
      showInstitutionHeader: base.printRules?.showInstitutionHeader ?? true,
      showDocumentTitle: base.printRules?.showDocumentTitle ?? true,
      compactTable: base.printRules?.compactTable ?? false,
      signatureMode: base.printRules?.signatureMode || 'SYSTEM_DEFAULT',
    },
    teacherRules: {
      allowAddSection: base.teacherRules?.allowAddSection ?? false,
      allowDeleteSection: base.teacherRules?.allowDeleteSection ?? false,
      allowAddRow: base.teacherRules?.allowAddRow ?? true,
      allowDeleteRow: base.teacherRules?.allowDeleteRow ?? true,
      allowReorderRow: base.teacherRules?.allowReorderRow ?? true,
      allowAddCustomColumn: base.teacherRules?.allowAddCustomColumn ?? false,
      allowDeleteCustomColumn: base.teacherRules?.allowDeleteCustomColumn ?? false,
      allowEditFieldLabel: base.teacherRules?.allowEditFieldLabel ?? false,
      allowEditBinding: base.teacherRules?.allowEditBinding ?? false,
      allowOverrideReadOnlyValue: base.teacherRules?.allowOverrideReadOnlyValue ?? false,
    },
    sections: (Array.isArray(base.sections) ? base.sections : []).map((section, sectionIndex) => ({
      ...section,
      blockId: section.blockId || section.key || `bagian_${sectionIndex + 1}`,
      blockType: inferBlockType(section),
      layout: inferBlockLayout(section),
      teacherRules: {
        allowAddSection: section.teacherRules?.allowAddSection ?? false,
        allowDeleteSection: section.teacherRules?.allowDeleteSection ?? false,
        allowAddRow: section.teacherRules?.allowAddRow ?? true,
        allowDeleteRow: section.teacherRules?.allowDeleteRow ?? true,
        allowReorderRow: section.teacherRules?.allowReorderRow ?? true,
        allowAddCustomColumn: section.teacherRules?.allowAddCustomColumn ?? false,
        allowDeleteCustomColumn: section.teacherRules?.allowDeleteCustomColumn ?? false,
        allowEditFieldLabel: section.teacherRules?.allowEditFieldLabel ?? false,
        allowEditBinding: section.teacherRules?.allowEditBinding ?? false,
        allowOverrideReadOnlyValue: section.teacherRules?.allowOverrideReadOnlyValue ?? false,
      },
      columns: (section.columns || []).map((column, columnIndex) => {
        const fieldId = normalizeSchemaKey(column.fieldId || column.key, `field_${columnIndex + 1}`);
        const fieldIdentity = normalizeSchemaKey(
          column.fieldIdentity || column.semanticKey || column.bindingKey || column.key,
          fieldId,
        );
        const sourceType = inferFieldSourceType(column);
        return {
          ...column,
          fieldId,
          fieldIdentity,
          sourceType,
          teacherEditMode: inferTeacherEditMode(column),
          exposeAsReference: column.exposeAsReference ?? Boolean(column.semanticKey || fieldIdentity),
          isCoreField: column.isCoreField ?? Boolean(column.valueSource && column.valueSource !== 'MANUAL'),
          binding: {
            ...column.binding,
            sourceProgramCode: column.binding?.sourceProgramCode
              ? normalizeTeachingResourceProgramCode(column.binding.sourceProgramCode)
              : undefined,
            sourceDocumentFieldIdentity: column.binding?.sourceDocumentFieldIdentity
              ? normalizeSchemaKey(column.binding.sourceDocumentFieldIdentity, '')
              : undefined,
            sourceFieldIdentity: column.binding?.sourceFieldIdentity
              ? normalizeSchemaKey(column.binding.sourceFieldIdentity, '')
              : undefined,
            systemKey: column.binding?.systemKey ? normalizeSchemaKey(column.binding.systemKey, '') : undefined,
            selectionMode: column.binding?.selectionMode || 'AUTO',
            syncMode: column.binding?.syncMode || inferFieldSyncMode(column),
          },
        };
      }),
    })),
  };
}

function updateTeacherRules(
  rules: TeachingResourceTeacherRules | undefined,
  key: keyof TeachingResourceTeacherRules,
  value: boolean,
): TeachingResourceTeacherRules {
  return {
    ...(rules || {}),
    [key]: value,
  };
}

function createEmptyColumn(index = 0): TeachingResourceProgramColumnSchema {
  const key = `kolom_${index + 1}`;
  return {
    key,
    label: `Kolom ${index + 1}`,
    dataType: 'TEXT',
    valueSource: 'MANUAL',
    multiline: false,
    required: false,
    readOnly: false,
    fieldId: key,
    fieldIdentity: key,
    sourceType: 'MANUAL',
    teacherEditMode: 'TEACHER_EDITABLE',
    exposeAsReference: false,
    isCoreField: false,
    binding: {
      selectionMode: 'AUTO',
    },
  };
}

function createEmptySection(index = 0, editorType: 'TEXT' | 'TABLE' = 'TABLE'): TeachingResourceProgramSectionSchema {
  const key = `bagian_${index + 1}`;
  return {
    key,
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
    blockId: key,
    blockType: editorType === 'TABLE' ? 'TABLE' : 'RICH_TEXT',
    layout: editorType === 'TABLE' ? 'TABLE' : 'STACK',
    teacherRules: {
      allowAddRow: true,
      allowDeleteRow: true,
      allowReorderRow: true,
      allowAddCustomColumn: false,
      allowDeleteCustomColumn: false,
      allowEditBinding: false,
    },
  };
}

function createDefaultProgramSchema(code: string, label: string): TeachingResourceProgramSchema {
  const normalizedCode = normalizeTeachingResourceProgramCode(code || label || 'CUSTOM_PROGRAM');
  return applySchemaFoundationDefaults(
    {
    version: 1,
      schemaMode: 'BLOCKS_V1',
    sourceSheet: normalizedCode,
    intro: `Struktur dokumen ${label || normalizedCode} diatur kurikulum dan diisi guru sesuai template aktif.`,
    titleHint: `Dokumen ${label || normalizedCode}`,
    summaryHint: 'Ringkasan singkat dokumen',
      documentTitle: label || normalizedCode,
      documentShortTitle: label || normalizedCode,
    sections: [createEmptySection(0, 'TABLE')],
    },
    normalizedCode,
    label || normalizedCode,
  );
}

function createContextSection(): TeachingResourceProgramSectionSchema {
  return {
    key: 'konteks_dokumen',
    label: 'Konteks Dokumen',
    description: 'Identitas dokumen mengikuti assignment guru dan tahun ajaran aktif.',
    repeatable: false,
    defaultRows: 1,
    editorType: 'TABLE',
    sectionTitleEditable: false,
    columns: [
      {
        key: 'mata_pelajaran',
        label: 'Mata Pelajaran',
        valueSource: 'SYSTEM_SUBJECT',
        semanticKey: 'mata_pelajaran',
        placeholder: 'Mapel dari assignment',
      },
      {
        key: 'tingkat',
        label: 'Tingkat',
        valueSource: 'SYSTEM_CLASS_LEVEL',
        semanticKey: 'tingkat',
        placeholder: 'Tingkat dari assignment',
      },
      {
        key: 'program_keahlian',
        label: 'Program Keahlian',
        valueSource: 'SYSTEM_SKILL_PROGRAM',
        semanticKey: 'program_keahlian',
        placeholder: 'Program keahlian dari assignment',
      },
      {
        key: 'tahun_ajaran',
        label: 'Tahun Ajaran',
        valueSource: 'SYSTEM_ACTIVE_YEAR',
        semanticKey: 'tahun_ajaran',
        placeholder: 'Tahun ajaran aktif',
      },
    ],
  };
}

function createSignatureSection(): TeachingResourceProgramSectionSchema {
  return {
    key: 'pengesahan_dokumen',
    label: 'Pengesahan Dokumen',
    description: 'Blok pengesahan ringan yang bisa dipakai saat dokumen dicetak.',
    repeatable: false,
    defaultRows: 1,
    editorType: 'TABLE',
    sectionTitleEditable: false,
    columns: [
      { key: 'tempat_tanggal', label: 'Tempat, Tanggal', valueSource: 'SYSTEM_PLACE_DATE' },
      { key: 'guru_mapel', label: 'Guru Mata Pelajaran', valueSource: 'SYSTEM_TEACHER_NAME' },
      { key: 'catatan_pengesahan', label: 'Catatan Pengesahan', multiline: true },
    ],
  };
}

function createSchemaPreset(
  mode: ProgramBlueprintMode,
  code: string,
  label: string,
): TeachingResourceProgramSchema {
  const normalizedCode = normalizeTeachingResourceProgramCode(code || label || 'CUSTOM_PROGRAM');
  const displayLabel = label || normalizedCode;
  const base = {
    sourceSheet: normalizedCode,
    titleHint: `${displayLabel} - [Mapel] - [Kelas]`,
    summaryHint: `Ringkasan ${displayLabel}.`,
  };

  if (mode === 'GROUPED_ANALYSIS') {
    return {
      version: 2,
      ...base,
      intro: `${displayLabel} disusun sebagai analisis bertingkat dari konteks utama ke rincian pembelajaran.`,
      sections: [
        createContextSection(),
        {
          key: 'analisis_bertahap',
          label: 'Analisis Bertahap',
          description: 'Gunakan section ini untuk memecah elemen besar menjadi tujuan, materi, aktivitas, dan asesmen.',
          repeatable: true,
          defaultRows: 3,
          editorType: 'TABLE',
          sectionTitleEditable: true,
          columns: [
            { key: 'no', label: 'No', placeholder: '1' },
            { key: 'elemen', label: 'Elemen / Unit', semanticKey: 'elemen', multiline: true },
            { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', semanticKey: 'tujuan_pembelajaran', multiline: true },
            { key: 'materi_pokok', label: 'Materi Pokok', semanticKey: 'materi_pokok', multiline: true },
            { key: 'aktivitas_pembelajaran', label: 'Aktivitas Pembelajaran', multiline: true },
            { key: 'asesmen', label: 'Asesmen', semanticKey: 'asesmen', multiline: true },
            { key: 'catatan', label: 'Catatan', multiline: true },
          ],
        },
        createSignatureSection(),
      ],
    };
  }

  if (mode === 'TIME_DISTRIBUTION') {
    return {
      version: 2,
      ...base,
      intro: `${displayLabel} memetakan distribusi waktu pembelajaran per semester, bulan, minggu, dan alokasi JP.`,
      titleHint: `${displayLabel} - [Mapel] - [Tahun Ajaran]`,
      summaryHint: 'Ringkasan distribusi waktu dan alokasi JP.',
      sections: [
        createContextSection(),
        {
          key: 'distribusi_waktu',
          label: 'Distribusi Waktu',
          description: 'Susun sebaran TP dan JP berdasarkan semester, bulan, serta minggu pelaksanaan.',
          repeatable: false,
          defaultRows: 6,
          editorType: 'TABLE',
          sectionTitleEditable: false,
          columns: [
            { key: 'semester', label: 'Semester', dataType: 'SEMESTER', valueSource: 'SYSTEM_SEMESTER' },
            { key: 'bulan', label: 'Bulan', dataType: 'MONTH', semanticKey: 'bulan' },
            { key: 'minggu_ke', label: 'Minggu Ke-', dataType: 'WEEK', semanticKey: 'minggu_ke' },
            { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', semanticKey: 'tujuan_pembelajaran', multiline: true },
            { key: 'alokasi_jp', label: 'Alokasi JP', dataType: 'NUMBER', semanticKey: 'alokasi_jp' },
            { key: 'keterangan', label: 'Keterangan', multiline: true },
          ],
        },
        createSignatureSection(),
      ],
    };
  }

  if (mode === 'MATRIX_GRID') {
    return {
      version: 2,
      ...base,
      intro: `${displayLabel} disusun sebagai matriks ringkas untuk membaca sebaran tujuan pembelajaran terhadap periode pelaksanaan.`,
      titleHint: `${displayLabel} - Matriks [Mapel]`,
      summaryHint: 'Ringkasan matriks sebaran pembelajaran.',
      sections: [
        createContextSection(),
        {
          key: 'matriks_sebaran',
          label: 'Matriks Sebaran',
          description: 'Gunakan grid minggu untuk menandai periode pelaksanaan tiap tujuan pembelajaran.',
          repeatable: false,
          defaultRows: 5,
          editorType: 'TABLE',
          sectionTitleEditable: false,
          columns: [
            { key: 'no', label: 'No', placeholder: '1' },
            { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', semanticKey: 'tujuan_pembelajaran', multiline: true },
            { key: 'alokasi_jp', label: 'Alokasi JP', dataType: 'NUMBER', semanticKey: 'alokasi_jp' },
            { key: 'grid_minggu', label: 'Grid Minggu', dataType: 'WEEK_GRID', semanticKey: 'grid_minggu' },
            { key: 'keterangan', label: 'Keterangan', multiline: true },
          ],
        },
        createSignatureSection(),
      ],
    };
  }

  if (mode === 'RICH_MIXED') {
    return {
      version: 2,
      ...base,
      intro: `${displayLabel} menggabungkan narasi pembuka, tabel kerja, dan catatan reflektif.`,
      sections: [
        createContextSection(),
        {
          key: 'narasi_awal',
          label: 'Narasi Awal',
          description: 'Bagian naratif untuk tujuan, rasional, atau gambaran umum dokumen.',
          repeatable: false,
          defaultRows: 1,
          editorType: 'TEXT',
          sectionTitleEditable: true,
          titlePlaceholder: 'Judul narasi',
          bodyPlaceholder: 'Tuliskan narasi pembuka dokumen...',
        },
        {
          key: 'tabel_kerja',
          label: 'Tabel Kerja',
          description: 'Tabel inti untuk rincian kegiatan, materi, asesmen, dan tindak lanjut.',
          repeatable: true,
          defaultRows: 3,
          editorType: 'TABLE',
          sectionTitleEditable: true,
          columns: [
            { key: 'no', label: 'No', placeholder: '1' },
            { key: 'fokus', label: 'Fokus', semanticKey: 'fokus', multiline: true },
            { key: 'uraian', label: 'Uraian', multiline: true },
            { key: 'bukti_dukung', label: 'Bukti Dukung', multiline: true },
            { key: 'tindak_lanjut', label: 'Tindak Lanjut', multiline: true },
          ],
        },
        {
          key: 'catatan_akhir',
          label: 'Catatan Akhir',
          description: 'Ruang catatan tambahan sebelum pengesahan.',
          repeatable: false,
          defaultRows: 1,
          editorType: 'TEXT',
          sectionTitleEditable: true,
          titlePlaceholder: 'Catatan akhir',
          bodyPlaceholder: 'Tuliskan catatan akhir dokumen...',
        },
        createSignatureSection(),
      ],
    };
  }

  return {
    version: 2,
    ...base,
    intro: `${displayLabel} memakai struktur fleksibel yang bisa disesuaikan Wakakur dan guru.`,
    sections: [
      createContextSection(),
      {
        key: 'bagian_fleksibel',
        label: 'Bagian Fleksibel',
        description: 'Blok isi bebas untuk format yang belum punya struktur baku.',
        repeatable: true,
        defaultRows: 1,
        editorType: 'TEXT',
        sectionTitleEditable: true,
        titlePlaceholder: 'Judul bagian',
        bodyPlaceholder: 'Isi bagian dokumen...',
      },
      createSignatureSection(),
    ],
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
  return applySchemaFoundationDefaults(
    JSON.parse(JSON.stringify(schema || fallback)) as TeachingResourceProgramSchema,
    code,
    label,
  );
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
      schema: applySchemaFoundationDefaults(program.schema, program.code, program.label),
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

function inferBlueprintMode(schema?: TeachingResourceProgramSchema): ProgramBlueprintMode {
  const sections = Array.isArray(schema?.sections) ? schema?.sections : [];
  if (sections.length === 0) return 'FREEFORM';

  const tableSections = sections.filter((section) => (section.editorType || 'TABLE') === 'TABLE');
  const hasTextSection = sections.some((section) => section.editorType === 'TEXT');
  const allColumns = tableSections.flatMap((section) => section.columns || []);
  const dataTypes = new Set(allColumns.map((column) => column.dataType || 'TEXT'));

  if (dataTypes.has('WEEK_GRID')) return 'MATRIX_GRID';
  if (dataTypes.has('MONTH') || dataTypes.has('WEEK') || dataTypes.has('SEMESTER')) return 'TIME_DISTRIBUTION';
  if (hasTextSection && tableSections.length > 0) return 'RICH_MIXED';
  if (tableSections.some((section) => section.repeatable) || tableSections.some((section) => (section.columns || []).length >= 5)) {
    return 'GROUPED_ANALYSIS';
  }
  return 'FREEFORM';
}

function summarizeSchema(schema?: TeachingResourceProgramSchema) {
  const sections = Array.isArray(schema?.sections) ? schema.sections : [];
  const tableSections = sections.filter((section) => (section.editorType || 'TABLE') === 'TABLE');
  const textSections = sections.filter((section) => section.editorType === 'TEXT');
  const repeatableSections = sections.filter((section) => section.repeatable);
  const totalColumns = tableSections.reduce((total, section) => total + (section.columns || []).length, 0);

  return {
    totalSections: sections.length,
    tableSections: tableSections.length,
    textSections: textSections.length,
    repeatableSections: repeatableSections.length,
    totalColumns,
  };
}

function getColumnDataTypeLabel(dataType?: TeachingResourceColumnDataType) {
  return COLUMN_DATA_TYPE_OPTIONS.find((option) => option.value === (dataType || 'TEXT'))?.label || 'Teks Singkat';
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
  const [editorMode, setEditorMode] = useState<ProgramEditorMode>('SIMPLE');
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
    setEditorMode('SIMPLE');
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
    setEditorMode('SIMPLE');
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setEditingRowId(null);
    setEditorMode('SIMPLE');
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
      schema: applySchemaFoundationDefaults(updater(cloneProgramSchema(prev.schema, prev.code, prev.label)), prev.code, prev.label),
    }));
  };

  const handleApplyBlueprintPreset = (mode: ProgramBlueprintMode) => {
    setCreateDraft((prev) => ({
      ...prev,
      schema: applySchemaFoundationDefaults(createSchemaPreset(mode, prev.code, prev.label), prev.code, prev.label),
    }));
    const selectedPreset = BLUEPRINT_MODE_OPTIONS.find((option) => option.value === mode);
    toast.success(`Starter ${selectedPreset?.label || 'template'} diterapkan ke draft.`);
  };

  const handleSchemaMetaChange = (
    field: keyof TeachingResourceProgramSchema,
    value: TeachingResourceProgramSchema[keyof TeachingResourceProgramSchema],
  ) => {
    updateDraftSchema((schema) => ({
      ...schema,
      [field]: value,
    }));
  };

  const handleSchemaPrintRuleChange = (field: keyof TeachingResourcePrintRules, value: boolean | 'SYSTEM_DEFAULT' | 'MANUAL') => {
    updateDraftSchema((schema) => ({
      ...schema,
      printRules: {
        ...(schema.printRules || {}),
        [field]: value,
      },
    }));
  };

  const handleSchemaTeacherRuleChange = (field: keyof TeachingResourceTeacherRules, value: boolean) => {
    updateDraftSchema((schema) => ({
      ...schema,
      teacherRules: updateTeacherRules(schema.teacherRules, field, value),
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

  const handleSectionTeacherRuleChange = (
    sectionIndex: number,
    field: keyof TeachingResourceTeacherRules,
    value: boolean,
  ) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              teacherRules: updateTeacherRules(section.teacherRules, field, value),
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

  const handleColumnBindingChange = (
    sectionIndex: number,
    columnIndex: number,
    field: NonNullable<TeachingResourceProgramColumnSchema['binding']> extends infer T
      ? keyof Extract<T, object>
      : never,
    value: string | boolean | undefined,
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
                      binding: {
                        ...(column.binding || {}),
                        [field]: value,
                      },
                    }
                  : column,
              ),
            }
          : section,
      ),
    }));
  };

  const handleApplyColumnOperationalRole = (
    sectionIndex: number,
    columnIndex: number,
    role: ColumnOperationalRole,
  ) => {
    updateDraftSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              columns: (section.columns || []).map((column, currentColumnIndex) =>
                currentColumnIndex === columnIndex ? applyColumnOperationalRole(column, role) : column,
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
  const draftBlueprintMode = inferBlueprintMode(createDraft.schema);
  const draftBlueprint = BLUEPRINT_MODE_OPTIONS.find((option) => option.value === draftBlueprintMode) || BLUEPRINT_MODE_OPTIONS[4];
  const draftSchemaSummary = summarizeSchema(createDraft.schema);

  return (
    <div className="space-y-6 w-full pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Program Perangkat Ajar</h1>
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
            <div className="text-sm font-semibold text-gray-900">Alur aman untuk Wakakur</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                { title: '1. Buat menu', text: 'Isi nama program dan tentukan kelas yang melihat menu.' },
                { title: '2. Pilih bentuk', text: 'Gunakan template siap pakai sesuai kebutuhan dokumen.' },
                { title: '3. Simpan', text: 'Guru langsung mendapat format isian yang lebih rapi.' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-gray-600">{item.text}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-1 flex items-end">
            <div className="w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Default halaman ini sekarang untuk user non-teknis. Pengaturan kode/schema detail tetap ada di <b>Mode Teknisi</b>.
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
          <div
            className={`w-full rounded-2xl bg-white shadow-2xl ${
              editorMode === 'ADVANCED' ? 'max-w-7xl' : 'max-w-5xl'
            }`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingRowId ? 'Edit Program Perangkat Ajar' : 'Tambah Program Perangkat Ajar'}
                </h2>
                <p className="text-sm text-gray-500">
                  Gunakan Mode Siap Pakai untuk pekerjaan harian. Mode Teknisi hanya dibuka jika perlu mengubah struktur detail.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[78vh] space-y-6 overflow-y-auto px-5 py-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Nama Menu Guru</h3>
                  <p className="text-xs text-gray-500">Bagian ini cukup mengatur nama menu, kelas yang boleh melihat, dan apakah menu aktif.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {editorMode === 'ADVANCED' ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Kode Sistem</label>
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
                  ) : null}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nama Menu</label>
                    <input
                      type="text"
                      value={createDraft.label}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, label: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Contoh: Program Semester"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nama Singkat</label>
                    <input
                      type="text"
                      value={createDraft.shortLabel}
                      onChange={(event) => setCreateDraft((prev) => ({ ...prev, shortLabel: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Contoh: Promes"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Tampil Untuk Kelas</label>
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
                    Program bisa dipakai
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
                    Muncul di menu guru
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Mode Konfigurasi</h3>
                  <p className="text-xs text-gray-500">
                    Wakakur bisa mulai dari mode sederhana. Schema mentah tetap tersedia di mode lanjutan tanpa mengurangi fleksibilitas dinamis.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {EDITOR_MODE_OPTIONS.map((option) => {
                    const active = editorMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setEditorMode(option.value)}
                        className={`rounded-xl border p-4 text-left transition ${
                          active
                            ? 'border-blue-300 bg-blue-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">{option.label}</div>
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                              active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {active ? 'Aktif' : 'Pilih'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-gray-600">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Pilih Bentuk Dokumen</h3>
                  <p className="text-xs text-gray-500">
                    Pilih bentuk yang paling dekat. Setelah dipilih, sistem otomatis menyiapkan isian awal untuk guru.
                  </p>
                </div>

                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-blue-900">Bentuk yang sedang dipakai</div>
                      <p className="mt-1 text-xs leading-5 text-blue-800">{draftBlueprint.description}</p>
                    </div>
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                      {draftBlueprint.label}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-blue-800">{draftBlueprint.helper}</p>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {BLUEPRINT_MODE_OPTIONS.map((option) => {
                    const active = draftBlueprintMode === option.value;
                    return (
                      <div
                        key={option.value}
                        className={`rounded-xl border p-3 ${
                          active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">{option.label}</div>
                          {active ? (
                            <span className="inline-flex rounded-full bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">
                              Saat Ini
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-gray-600">{option.description}</p>
                        <p className="mt-2 text-xs leading-5 text-gray-500">{option.helper}</p>
                        <button
                          type="button"
                          onClick={() => handleApplyBlueprintPreset(option.value)}
                          className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                            active
                              ? 'border-blue-300 bg-white text-blue-700 hover:bg-blue-100'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                        >
                          <Pencil size={13} />
                          {active ? 'Gunakan Ulang Template Ini' : 'Gunakan Template Ini'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {editorMode === 'SIMPLE' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
                    Di Mode Siap Pakai, guru tetap bisa mengubah judul dan ringkasan saat membuat dokumen. Jika perlu mengatur kode template,
                    hint judul, atau metadata teknis lain, buka <b>Mode Teknisi</b>.
                  </div>
                ) : null}

                {editorMode === 'ADVANCED' ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Mode Schema</label>
                    <select
                      value={createDraft.schema.schemaMode || 'BLOCKS_V1'}
                      onChange={(event) => handleSchemaMetaChange('schemaMode', event.target.value as TeachingResourceSchemaMode)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {SCHEMA_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Source Sheet / Kode Template</label>
                    <input
                      type="text"
                      value={createDraft.schema.sourceSheet || ''}
                      onChange={(event) =>
                        handleSchemaMetaChange('sourceSheet', normalizeTeachingResourceProgramCode(event.target.value))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="CONTOH: PROTA"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Judul Dokumen Sistem</label>
                    <input
                      type="text"
                      value={createDraft.schema.documentTitle || ''}
                      onChange={(event) => handleSchemaMetaChange('documentTitle', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Contoh: Distribusi Tujuan Pembelajaran"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nama Pendek Dokumen</label>
                    <input
                      type="text"
                      value={createDraft.schema.documentShortTitle || ''}
                      onChange={(event) => handleSchemaMetaChange('documentShortTitle', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Contoh: Distribusi TP"
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
                  <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">Aturan Umum Dokumen</div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={createDraft.schema.teacherRules?.allowAddRow ?? false}
                          onChange={(event) => handleSchemaTeacherRuleChange('allowAddRow', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Guru boleh tambah baris
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={createDraft.schema.teacherRules?.allowDeleteRow ?? false}
                          onChange={(event) => handleSchemaTeacherRuleChange('allowDeleteRow', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Guru boleh hapus baris
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={createDraft.schema.teacherRules?.allowAddCustomColumn ?? false}
                          onChange={(event) => handleSchemaTeacherRuleChange('allowAddCustomColumn', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Guru boleh tambah kolom custom
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={createDraft.schema.teacherRules?.allowEditBinding ?? false}
                          onChange={(event) => handleSchemaTeacherRuleChange('allowEditBinding', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Guru boleh ubah binding
                      </label>
                    </div>
                  </div>
                  <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">Aturan Print</div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={createDraft.schema.printRules?.showInstitutionHeader ?? false}
                          onChange={(event) => handleSchemaPrintRuleChange('showInstitutionHeader', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Pakai header sekolah
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={createDraft.schema.printRules?.showDocumentTitle ?? false}
                          onChange={(event) => handleSchemaPrintRuleChange('showDocumentTitle', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Tampilkan judul dokumen
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={createDraft.schema.printRules?.compactTable ?? false}
                          onChange={(event) => handleSchemaPrintRuleChange('compactTable', event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Tabel ringkas
                      </label>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Mode Tanda Tangan</label>
                        <select
                          value={createDraft.schema.printRules?.signatureMode || 'SYSTEM_DEFAULT'}
                          onChange={(event) =>
                            handleSchemaPrintRuleChange('signatureMode', event.target.value as 'SYSTEM_DEFAULT' | 'MANUAL')
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          <option value="SYSTEM_DEFAULT">System Default</option>
                          <option value="MANUAL">Manual</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Yang Akan Dilihat Guru</h3>
                    <p className="text-xs text-gray-500">
                      Ringkasan sederhana agar Wakakur tahu kira-kira bentuk isian guru tanpa membaca kode/schema.
                    </p>
                  </div>
                  {editorMode === 'SIMPLE' ? (
                    <button
                      type="button"
                      onClick={() => setEditorMode('ADVANCED')}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Buka Mode Teknisi
                    </button>
                  ) : (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      Mode teknisi aktif
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Jumlah Bagian</div>
                    <div className="mt-1 text-xl font-bold text-gray-900">{draftSchemaSummary.totalSections}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Bagian Tabel</div>
                    <div className="mt-1 text-xl font-bold text-gray-900">{draftSchemaSummary.tableSections}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Bagian Teks</div>
                    <div className="mt-1 text-xl font-bold text-gray-900">{draftSchemaSummary.textSections}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Kolom Isian</div>
                    <div className="mt-1 text-xl font-bold text-gray-900">{draftSchemaSummary.totalColumns}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Bisa Ditambah</div>
                    <div className="mt-1 text-xl font-bold text-gray-900">{draftSchemaSummary.repeatableSections}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {createDraft.schema.sections.map((section, sectionIndex) => (
                    <div key={`${section.key}-summary-${sectionIndex}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            Bagian {sectionIndex + 1}: {section.label || `Bagian ${sectionIndex + 1}`}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            {section.description || 'Belum ada deskripsi section.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
                            {section.editorType === 'TEXT' ? 'Teks / Narasi' : 'Tabel Isian'}
                          </span>
                          <span className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
                            {section.defaultRows || 1} baris awal
                          </span>
                          {section.repeatable ? (
                            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                              Bisa ditambah
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {section.editorType === 'TABLE' ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(section.columns || []).length > 0 ? (
                            (section.columns || []).map((column, columnIndex) => (
                              <span
                                key={`${section.key}-${column.key}-summary-${columnIndex}`}
                                className="inline-flex rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                              >
                                {column.label || `Kolom ${columnIndex + 1}`} · {getColumnDataTypeLabel(column.dataType)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">Belum ada kolom tabel.</span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-gray-500">
                          Petunjuk judul: {section.titlePlaceholder || '-'} | Petunjuk isi: {section.bodyPlaceholder || '-'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {editorMode === 'ADVANCED' ? (
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

                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                    Mode Teknisi dipakai hanya saat Wakakur benar-benar perlu menyusun struktur detail seperti key kolom, binding,
                    semantic key, atau bagian dokumen yang belum bisa diwakili oleh Mode Siap Pakai.
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
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Block ID</label>
                            <input
                              type="text"
                              value={section.blockId || ''}
                              onChange={(event) =>
                                handleSectionChange(sectionIndex, 'blockId', normalizeSchemaKey(event.target.value, `bagian_${sectionIndex + 1}`))
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </div>
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
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tipe Block</label>
                            <select
                              value={section.blockType || inferBlockType(section)}
                              onChange={(event) => handleSectionChange(sectionIndex, 'blockType', event.target.value as TeachingResourceBlockType)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              {BLOCK_TYPE_OPTIONS.map((option) => (
                                <option key={`${section.key}-block-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
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
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Layout</label>
                            <select
                              value={section.layout || inferBlockLayout(section)}
                              onChange={(event) => handleSectionChange(sectionIndex, 'layout', event.target.value as TeachingResourceBlockLayout)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              {BLOCK_LAYOUT_OPTIONS.map((option) => (
                                <option key={`${section.key}-layout-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
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
                          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={section.teacherRules?.allowAddRow ?? false}
                              onChange={(event) => handleSectionTeacherRuleChange(sectionIndex, 'allowAddRow', event.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Guru boleh tambah baris
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={section.teacherRules?.allowDeleteRow ?? false}
                              onChange={(event) => handleSectionTeacherRuleChange(sectionIndex, 'allowDeleteRow', event.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Guru boleh hapus baris
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={section.teacherRules?.allowAddCustomColumn ?? false}
                              onChange={(event) => handleSectionTeacherRuleChange(sectionIndex, 'allowAddCustomColumn', event.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Boleh kolom custom
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={section.teacherRules?.allowEditBinding ?? false}
                              onChange={(event) => handleSectionTeacherRuleChange(sectionIndex, 'allowEditBinding', event.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Boleh ubah binding
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
                              {(section.columns || []).map((column, columnIndex) => {
                                const operationalRole = inferColumnOperationalRole(column);
                                const operationalDescription = getColumnOperationalRoleDescription(operationalRole);
                                const normalizedSourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode || '');
                                const sourceProgramLabel =
                                  rows.find((row) => normalizeTeachingResourceProgramCode(row.code) === normalizedSourceProgramCode)?.label || '';
                                return (
                                <div key={`${section.key}-${column.key}-${columnIndex}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-gray-900">
                                        Kolom {columnIndex + 1}: {column.label || `Kolom ${columnIndex + 1}`}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        Gunakan semantic key yang sama bila kolom ini harus terhubung dengan program lain.
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">
                                          {COLUMN_OPERATIONAL_ROLE_OPTIONS.find((option) => option.value === operationalRole)?.label || 'Input Biasa'}
                                        </span>
                                        {column.fieldIdentity ? (
                                          <span className="rounded-full bg-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700">
                                            identity: {column.fieldIdentity}
                                          </span>
                                        ) : null}
                                        {normalizedSourceProgramCode ? (
                                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">
                                            sumber: {sourceProgramLabel || normalizedSourceProgramCode}
                                          </span>
                                        ) : null}
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

                                  <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-800">Peran Operasional Kolom</div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                      <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Peran Kolom</label>
                                        <select
                                          value={operationalRole}
                                          onChange={(event) =>
                                            handleApplyColumnOperationalRole(
                                              sectionIndex,
                                              columnIndex,
                                              event.target.value as ColumnOperationalRole,
                                            )
                                          }
                                          className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        >
                                          {COLUMN_OPERATIONAL_ROLE_OPTIONS.map((option) => (
                                            <option key={`${section.key}-${column.key}-role-${option.value}`} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="rounded-lg border border-sky-100 bg-white/80 px-3 py-2 text-xs leading-5 text-sky-900">
                                        {operationalDescription}
                                        {operationalRole === 'REFERENCE_SOURCE'
                                          ? ' Pastikan field identity stabil agar dokumen lain mudah menaut.'
                                          : operationalRole === 'REFERENCE_PICKER'
                                            ? ' Isi Program Sumber dan Field Sumber agar dropdown guru membaca data yang tepat.'
                                            : operationalRole === 'SNAPSHOT_TARGET'
                                              ? ' Kolom ini akan diisi dari snapshot dokumen sumber pada baris yang sama.'
                                              : operationalRole === 'SYSTEM_FIELD'
                                                ? ' Lengkapi Sumber Nilai atau System Key agar kolom benar-benar diisi otomatis.'
                                                : ' Gunakan ini untuk input guru biasa tanpa integrasi khusus.'}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div>
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Field ID</label>
                                      <input
                                        type="text"
                                        value={column.fieldId || ''}
                                        onChange={(event) =>
                                          handleColumnChange(
                                            sectionIndex,
                                            columnIndex,
                                            'fieldId',
                                            normalizeSchemaKey(event.target.value, `field_${columnIndex + 1}`),
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      />
                                    </div>
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
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Field Identity</label>
                                      <input
                                        type="text"
                                        value={column.fieldIdentity || ''}
                                        onChange={(event) =>
                                          handleColumnChange(
                                            sectionIndex,
                                            columnIndex,
                                            'fieldIdentity',
                                            normalizeSchemaKey(event.target.value, ''),
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="contoh: learning_outcome_text"
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
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Source Type</label>
                                      <select
                                        value={column.sourceType || inferFieldSourceType(column)}
                                        onChange={(event) =>
                                          handleColumnChange(
                                            sectionIndex,
                                            columnIndex,
                                            'sourceType',
                                            event.target.value as TeachingResourceFieldSourceType,
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      >
                                        {FIELD_SOURCE_TYPE_OPTIONS.map((option) => (
                                          <option key={`${section.key}-${column.key}-source-${option.value}`} value={option.value}>
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
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Edit Mode Guru</label>
                                      <select
                                        value={column.teacherEditMode || inferTeacherEditMode(column)}
                                        onChange={(event) =>
                                          handleColumnChange(
                                            sectionIndex,
                                            columnIndex,
                                            'teacherEditMode',
                                            event.target.value as TeachingResourceTeacherEditMode,
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      >
                                        {FIELD_TEACHER_EDIT_MODE_OPTIONS.map((option) => (
                                          <option key={`${section.key}-${column.key}-edit-${option.value}`} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
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
                                    <div>
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Binding Program</label>
                                      <input
                                        type="text"
                                        list="teaching-resource-program-code-options"
                                        value={column.binding?.sourceProgramCode || ''}
                                        onChange={(event) =>
                                          handleColumnBindingChange(
                                            sectionIndex,
                                            columnIndex,
                                            'sourceProgramCode',
                                            normalizeTeachingResourceProgramCode(event.target.value),
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none"
                                        placeholder="contoh: CAPAIAN_PEMBELAJARAN"
                                      />
                                      {sourceProgramLabel ? (
                                        <div className="mt-1 text-[11px] text-emerald-700">Terhubung ke: {sourceProgramLabel}</div>
                                      ) : null}
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Binding Field Identity</label>
                                      <input
                                        type="text"
                                        value={column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity || ''}
                                        onChange={(event) => {
                                          const nextValue = normalizeSchemaKey(event.target.value, '');
                                          handleColumnBindingChange(sectionIndex, columnIndex, 'sourceFieldIdentity', nextValue);
                                          handleColumnBindingChange(sectionIndex, columnIndex, 'sourceDocumentFieldIdentity', nextValue);
                                        }}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="contoh: learning_outcome_text"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Binding System Key</label>
                                      <input
                                        type="text"
                                        value={column.binding?.systemKey || ''}
                                        onChange={(event) =>
                                          handleColumnBindingChange(
                                            sectionIndex,
                                            columnIndex,
                                            'systemKey',
                                            normalizeSchemaKey(event.target.value, ''),
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="contoh: active_semester"
                                      />
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Selection Mode</label>
                                      <select
                                        value={column.binding?.selectionMode || 'AUTO'}
                                        onChange={(event) =>
                                          handleColumnBindingChange(
                                            sectionIndex,
                                            columnIndex,
                                            'selectionMode',
                                            event.target.value as TeachingResourceReferenceSelectionMode,
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      >
                                        {FIELD_SELECTION_MODE_OPTIONS.map((option) => (
                                          <option key={`${section.key}-${column.key}-selection-${option.value}`} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Sync Mode</label>
                                      <select
                                        value={column.binding?.syncMode || inferFieldSyncMode(column) || 'SNAPSHOT_ON_SELECT'}
                                        onChange={(event) =>
                                          handleColumnBindingChange(
                                            sectionIndex,
                                            columnIndex,
                                            'syncMode',
                                            event.target.value as TeachingResourceFieldSyncMode,
                                          )
                                        }
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                      >
                                        {FIELD_SYNC_MODE_OPTIONS.map((option) => (
                                          <option key={`${section.key}-${column.key}-sync-${option.value}`} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
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
                                    <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={column.exposeAsReference ?? false}
                                        onChange={(event) => handleColumnChange(sectionIndex, columnIndex, 'exposeAsReference', event.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      Ekspos ke dokumen lain
                                    </label>
                                    <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={column.isCoreField ?? false}
                                        onChange={(event) => handleColumnChange(sectionIndex, columnIndex, 'isCoreField', event.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      Kolom inti
                                    </label>
                                  </div>
                                </div>
                              )})}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <datalist id="teaching-resource-program-code-options">
                    {rows.map((row) => (
                      <option key={`program-code-option-${row.rowId}`} value={normalizeTeachingResourceProgramCode(row.code)}>
                        {row.label}
                      </option>
                    ))}
                  </datalist>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={closeCreateModal}
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
