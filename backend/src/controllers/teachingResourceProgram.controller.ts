import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

type TeachingResourceProgramDefinition = {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  targetClassLevels: string[];
  schema: TeachingResourceProgramSchema;
};

type TeachingResourceProgramPayload = {
  id?: number;
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  targetClassLevels: string[];
  source: 'default' | 'custom';
  schema: TeachingResourceProgramSchema;
};

type UpsertTeachingResourceProgramInput = {
  code: string;
  displayLabel: string;
  shortLabel: string | null;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  targetClassLevels: string[];
  schema: TeachingResourceProgramSchema;
};

type RoleContext = 'teacher' | 'all';
type TeachingResourceEntryStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
type TeachingResourceColumnDataType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'SELECT'
  | 'SEMESTER'
  | 'MONTH'
  | 'WEEK'
  | 'WEEK_GRID'
  | 'READONLY_BOUND';
type TeachingResourceColumnValueSource =
  | 'MANUAL'
  | 'SYSTEM_ACTIVE_YEAR'
  | 'SYSTEM_SEMESTER'
  | 'SYSTEM_SUBJECT'
  | 'SYSTEM_CLASS_LEVEL'
  | 'SYSTEM_CLASS_NAME'
  | 'SYSTEM_SKILL_PROGRAM'
  | 'SYSTEM_TEACHER_NAME'
  | 'SYSTEM_PLACE_DATE'
  | 'SYSTEM_WEEKLY_CLASS_HOURS'
  | 'SYSTEM_WEEKLY_TOTAL_HOURS'
  | 'BOUND';
type TeachingResourceSchemaMode = 'LEGACY_SECTIONS' | 'BLOCKS_V1';
type TeachingResourceBlockType = 'HEADER' | 'CONTEXT' | 'TABLE' | 'RICH_TEXT' | 'SIGNATURE' | 'NOTE';
type TeachingResourceBlockLayout = 'STACK' | 'GRID' | 'TABLE';
type TeachingResourceFieldSourceType =
  | 'MANUAL'
  | 'SYSTEM'
  | 'DOCUMENT_REFERENCE'
  | 'DOCUMENT_SNAPSHOT'
  | 'DERIVED'
  | 'STATIC_OPTION';
type TeachingResourceFieldSyncMode = 'LIVE_REFERENCE' | 'SNAPSHOT_ON_SELECT' | 'SYSTEM_DYNAMIC';
type TeachingResourceReferenceSelectionMode = 'AUTO' | 'PICK_SINGLE' | 'PICK_MULTIPLE';
type TeachingResourceTeacherEditMode = 'SYSTEM_LOCKED' | 'TEACHER_EDITABLE' | 'TEACHER_APPEND_ONLY';

type TeachingResourceVisibilityRules = {
  roleScopes?: string[];
  targetClassLevels?: string[];
  hideWhenEmpty?: boolean;
};

type TeachingResourceTeacherRules = {
  allowAddSection?: boolean;
  allowDeleteSection?: boolean;
  allowAddRow?: boolean;
  allowDeleteRow?: boolean;
  allowReorderRow?: boolean;
  allowAddCustomColumn?: boolean;
  allowDeleteCustomColumn?: boolean;
  allowEditFieldLabel?: boolean;
  allowEditBinding?: boolean;
  allowOverrideReadOnlyValue?: boolean;
};

type TeachingResourcePrintRules = {
  showInstitutionHeader?: boolean;
  showDocumentTitle?: boolean;
  compactTable?: boolean;
  signatureMode?: 'SYSTEM_DEFAULT' | 'MANUAL';
};

type TeachingResourceFieldBinding = {
  systemKey?: string;
  sourceProgramCode?: string;
  sourceDocumentFieldIdentity?: string;
  sourceFieldIdentity?: string;
  filterByContext?: boolean;
  matchBySubject?: boolean;
  matchByClassLevel?: boolean;
  matchByMajor?: boolean;
  matchByActiveSemester?: boolean;
  selectionMode?: TeachingResourceReferenceSelectionMode;
  syncMode?: TeachingResourceFieldSyncMode;
  allowManualOverride?: boolean;
};

type TeachingResourceColumnSchema = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  dataType?: TeachingResourceColumnDataType;
  semanticKey?: string;
  bindingKey?: string;
  valueSource?: TeachingResourceColumnValueSource;
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
  fieldId?: string;
  fieldIdentity?: string;
  sourceType?: TeachingResourceFieldSourceType;
  binding?: TeachingResourceFieldBinding;
  teacherEditMode?: TeachingResourceTeacherEditMode;
  exposeAsReference?: boolean;
  isCoreField?: boolean;
};

type TeachingResourceSectionSchema = {
  key: string;
  label: string;
  description?: string;
  repeatable: boolean;
  defaultRows: number;
  editorType?: 'TEXT' | 'TABLE';
  columns?: TeachingResourceColumnSchema[];
  prefillRows?: Array<Record<string, string>>;
  sectionTitleEditable?: boolean;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  blockId?: string;
  blockType?: TeachingResourceBlockType;
  layout?: TeachingResourceBlockLayout;
  visibilityRules?: TeachingResourceVisibilityRules;
  teacherRules?: TeachingResourceTeacherRules;
};

type TeachingResourceProgramSchema = {
  version: number;
  sourceSheet?: string;
  intro: string;
  titleHint?: string;
  summaryHint?: string;
  schemaMode?: TeachingResourceSchemaMode;
  documentTitle?: string;
  documentShortTitle?: string;
  teacherRules?: TeachingResourceTeacherRules;
  printRules?: TeachingResourcePrintRules;
  sections: TeachingResourceSectionSchema[];
};

type TeacherProgramScope = {
  includeAll: boolean;
  classLevels: Set<string>;
};

type TeachingResourceEntryContent = {
  sections?: Array<{
    schemaKey?: string;
    title?: string;
    body?: string;
    columns?: Array<Partial<TeachingResourceColumnSchema>>;
    rows?: Array<Record<string, string>>;
  }>;
  references?: string[];
  notes?: string;
  [key: string]: unknown;
};

type TeachingResourceReferenceProjectionRequest = {
  requestKey: string;
  sourceProgramCode: string;
  candidates: string[];
  filterByContext?: boolean;
  matchBySubject?: boolean;
  matchByClassLevel?: boolean;
  matchByMajor?: boolean;
  matchByActiveSemester?: boolean;
  context?: {
    subjectId?: number;
    classLevel?: string;
    programKeahlian?: string;
    semester?: string;
  };
};

type TeachingResourceProjectedReferenceOption = {
  requestKey: string;
  selectValue: string;
  value: string;
  label: string;
  sourceProgramCode: string;
  sourceEntryId: number;
  sourceEntryTitle?: string;
  sourceFieldKey?: string;
  sourceFieldIdentity?: string;
  snapshot: Record<string, string>;
};

const PROGRAMS_CACHE_TTL_MS = 15000;
const programsResponseCache = new Map<string, { expiresAt: number; payload: unknown }>();
const TEACHING_RESOURCE_ENTRY_STATUSES: TeachingResourceEntryStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
const TEACHING_RESOURCE_EDITOR_TYPES = ['TEXT', 'TABLE'] as const;
const TEACHING_RESOURCE_COLUMN_DATA_TYPES = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'BOOLEAN',
  'SELECT',
  'SEMESTER',
  'MONTH',
  'WEEK',
  'WEEK_GRID',
  'READONLY_BOUND',
] as const;
const TEACHING_RESOURCE_COLUMN_VALUE_SOURCES = [
  'MANUAL',
  'SYSTEM_ACTIVE_YEAR',
  'SYSTEM_SEMESTER',
  'SYSTEM_SUBJECT',
  'SYSTEM_CLASS_LEVEL',
  'SYSTEM_CLASS_NAME',
  'SYSTEM_SKILL_PROGRAM',
  'SYSTEM_TEACHER_NAME',
  'SYSTEM_PLACE_DATE',
  'SYSTEM_WEEKLY_CLASS_HOURS',
  'SYSTEM_WEEKLY_TOTAL_HOURS',
  'BOUND',
] as const;
const TEACHING_RESOURCE_SCHEMA_MODES = ['LEGACY_SECTIONS', 'BLOCKS_V1'] as const;
const TEACHING_RESOURCE_BLOCK_TYPES = ['HEADER', 'CONTEXT', 'TABLE', 'RICH_TEXT', 'SIGNATURE', 'NOTE'] as const;
const TEACHING_RESOURCE_BLOCK_LAYOUTS = ['STACK', 'GRID', 'TABLE'] as const;
const TEACHING_RESOURCE_FIELD_SOURCE_TYPES = [
  'MANUAL',
  'SYSTEM',
  'DOCUMENT_REFERENCE',
  'DOCUMENT_SNAPSHOT',
  'DERIVED',
  'STATIC_OPTION',
] as const;
const TEACHING_RESOURCE_FIELD_SYNC_MODES = ['LIVE_REFERENCE', 'SNAPSHOT_ON_SELECT', 'SYSTEM_DYNAMIC'] as const;
const TEACHING_RESOURCE_REFERENCE_SELECTION_MODES = ['AUTO', 'PICK_SINGLE', 'PICK_MULTIPLE'] as const;
const TEACHING_RESOURCE_TEACHER_EDIT_MODES = ['SYSTEM_LOCKED', 'TEACHER_EDITABLE', 'TEACHER_APPEND_ONLY'] as const;

const PROSEM_GANJIL_WEEK_COLUMNS: TeachingResourceSectionSchema['columns'] = [
  { key: 'juli_1', label: 'Juli-1' },
  { key: 'juli_2', label: 'Juli-2' },
  { key: 'juli_3', label: 'Juli-3' },
  { key: 'agustus_1', label: 'Agustus-1' },
  { key: 'agustus_2', label: 'Agustus-2' },
  { key: 'agustus_3', label: 'Agustus-3' },
  { key: 'agustus_4', label: 'Agustus-4' },
  { key: 'september_1', label: 'September-1' },
  { key: 'september_2', label: 'September-2' },
  { key: 'september_3', label: 'September-3' },
  { key: 'september_4', label: 'September-4' },
  { key: 'oktober_1', label: 'Oktober-1' },
  { key: 'oktober_2', label: 'Oktober-2' },
  { key: 'oktober_3', label: 'Oktober-3' },
  { key: 'oktober_4', label: 'Oktober-4' },
  { key: 'oktober_5', label: 'Oktober-5' },
  { key: 'nopember_1', label: 'Nopember-1' },
  { key: 'nopember_2', label: 'Nopember-2' },
  { key: 'nopember_3', label: 'Nopember-3' },
  { key: 'nopember_4', label: 'Nopember-4' },
  { key: 'desember_1', label: 'Desember-1' },
  { key: 'desember_2', label: 'Desember-2' },
  { key: 'desember_3', label: 'Desember-3' },
  { key: 'desember_4', label: 'Desember-4' },
  { key: 'desember_5', label: 'Desember-5' },
];

const PROSEM_GENAP_WEEK_COLUMNS: TeachingResourceSectionSchema['columns'] = [
  { key: 'januari_1', label: 'Januari-1' },
  { key: 'januari_2', label: 'Januari-2' },
  { key: 'januari_3', label: 'Januari-3' },
  { key: 'januari_4', label: 'Januari-4' },
  { key: 'januari_5', label: 'Januari-5' },
  { key: 'februari_1', label: 'Februari-1' },
  { key: 'februari_2', label: 'Februari-2' },
  { key: 'februari_3', label: 'Februari-3' },
  { key: 'februari_4', label: 'Februari-4' },
  { key: 'maret_1', label: 'Maret-1' },
  { key: 'maret_2', label: 'Maret-2' },
  { key: 'maret_3', label: 'Maret-3' },
  { key: 'maret_4', label: 'Maret-4' },
  { key: 'april_1', label: 'April-1' },
  { key: 'april_2', label: 'April-2' },
  { key: 'april_3', label: 'April-3' },
  { key: 'april_4', label: 'April-4' },
  { key: 'april_5', label: 'April-5' },
  { key: 'mei_1', label: 'Mei-1' },
  { key: 'mei_2', label: 'Mei-2' },
  { key: 'mei_3', label: 'Mei-3' },
  { key: 'mei_4', label: 'Mei-4' },
  { key: 'juni_1', label: 'Juni-1' },
  { key: 'juni_2', label: 'Juni-2' },
  { key: 'juni_3', label: 'Juni-3' },
  { key: 'juni_4', label: 'Juni-4' },
];

const MATRIKS_WEEK_COLUMNS: TeachingResourceSectionSchema['columns'] = Array.from({ length: 19 }, (_, index) => ({
  key: `minggu_${index + 1}`,
  label: `Minggu ${index + 1}`,
}));

const ALOKASI_WAKTU_SEMESTER_1_PREFILL_ROWS: Record<string, string>[] = [
  { bulan: 'Juli' },
  { bulan: 'Agustus' },
  { bulan: 'September' },
  { bulan: 'Oktober' },
  { bulan: 'Nopember' },
  { bulan: 'Desember' },
  { bulan: 'Jumlah' },
];

const ALOKASI_WAKTU_SEMESTER_2_PREFILL_ROWS: Record<string, string>[] = [
  { bulan: 'Januari' },
  { bulan: 'Februari' },
  { bulan: 'Maret' },
  { bulan: 'April' },
  { bulan: 'Mei' },
  { bulan: 'Juni' },
  { bulan: 'Jumlah' },
];

const SIGNATURE_SECTION_COLUMNS: TeachingResourceSectionSchema['columns'] = [
  { key: 'pihak_1_jabatan', label: 'Pihak 1 (Jabatan)', placeholder: 'Contoh: Kepala Sekolah' },
  { key: 'pihak_1_nama', label: 'Pihak 1 (Nama)', placeholder: 'Nama pejabat' },
  { key: 'tempat_tanggal', label: 'Tempat, Tanggal', placeholder: 'Contoh: Bekasi, 14 Juli 2025' },
  { key: 'pihak_2_jabatan', label: 'Pihak 2 (Jabatan)', placeholder: 'Contoh: Guru Mata Pelajaran' },
  { key: 'pihak_2_nama', label: 'Pihak 2 (Nama)', placeholder: 'Nama guru mapel' },
];

const GENERIC_PROGRAM_SCHEMA: TeachingResourceProgramSchema = {
  version: 1,
  intro: 'Dokumen perangkat ajar dinamis. Tambahkan bagian sesuai kebijakan kurikulum.',
  titleHint: 'Judul dokumen perangkat ajar',
  summaryHint: 'Ringkasan singkat isi dokumen',
  sections: [
    {
      key: 'bagian_utama',
      label: 'Bagian Dokumen',
      description: 'Isi inti dokumen. Bagian ini dapat ditambah sesuai kebutuhan.',
      repeatable: true,
      defaultRows: 1,
      editorType: 'TEXT',
      titlePlaceholder: 'Judul bagian',
      bodyPlaceholder: 'Isi bagian dokumen...',
    },
  ],
};

const PROGRAM_SCHEMA_CP: TeachingResourceProgramSchema = {
  version: 6,
  sourceSheet: 'ANALISIS CP',
  intro: 'Analisis CP per elemen: turunkan CP menjadi kompetensi, materi, tujuan pembelajaran, dan dimensi profil lulusan.',
  titleHint: 'Analisis CP - [Mapel] - [Kelas/Fase]',
  summaryHint: 'Ringkasan fokus analisis CP semester berjalan.',
  sections: [
    {
      key: 'konteks_dokumen',
      label: 'Konteks Dokumen',
      description: 'Identitas dokumen sesuai sheet ANALISIS CP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'mata_pelajaran', label: 'Mata Pelajaran', placeholder: 'Contoh: Network Client Server' },
        { key: 'tingkat', label: 'Tingkat', placeholder: 'Contoh: XII' },
        { key: 'program_keahlian', label: 'Program Keahlian', placeholder: 'Contoh: Teknik Komputer dan Jaringan' },
      ],
    },
    {
      key: 'analisis_cp',
      label: 'Analisis CP',
      description: 'Tabel analisis capaian pembelajaran sesuai format lembar ANALISIS CP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'no', label: 'No', placeholder: '1' },
        { key: 'elemen', label: 'Elemen', placeholder: 'Elemen CP', multiline: true },
        { key: 'capaian_pembelajaran', label: 'Capaian Pembelajaran', placeholder: 'Isi CP', multiline: true },
        { key: 'kompetensi', label: 'Kompetensi', placeholder: 'Kompetensi' },
        { key: 'konten_materi', label: 'Konten/Materi', placeholder: 'Konten materi', multiline: true },
        { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', placeholder: 'TP', multiline: true },
        { key: 'dimensi_profil', label: 'Dimensi Profil Lulusan', placeholder: 'Dimensi profil', multiline: true },
      ],
    },
  ],
};

const PROGRAM_SCHEMA_ATP: TeachingResourceProgramSchema = {
  version: 5,
  sourceSheet: 'ATP',
  intro: 'Turunkan CP menjadi alur tujuan pembelajaran (ATP) berbasis elemen, materi pokok, profil lulusan, dan alokasi waktu.',
  titleHint: 'ATP - [Mapel] - [Kelas/Fase]',
  summaryHint: 'Ringkasan ATP semester berjalan.',
  sections: [
    {
      key: 'konteks_dokumen',
      label: 'Konteks Dokumen',
      description: 'Identitas ATP sesuai sheet ATP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'mata_pelajaran', label: 'Mata Pelajaran', placeholder: 'Contoh: Network Client Server' },
        { key: 'tingkat', label: 'Tingkat', placeholder: 'Contoh: XII' },
        { key: 'program_keahlian', label: 'Program Keahlian', placeholder: 'Contoh: Teknik Komputer dan Jaringan' },
        { key: 'semester', label: 'Semester', placeholder: 'Contoh: 1 / 2' },
      ],
    },
    {
      key: 'cp_fase',
      label: 'Capaian Pembelajaran Fase',
      description: 'Isi ringkasan CP Fase yang menjadi acuan ATP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TEXT',
      titlePlaceholder: 'CP Fase',
      bodyPlaceholder: 'Tuliskan CP fase lengkap...',
    },
    {
      key: 'tabel_atp',
      label: 'Tabel ATP',
      description: 'Tabel ATP per tujuan pembelajaran.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'no', label: 'No', placeholder: '1' },
        { key: 'elemen', label: 'Elemen', placeholder: 'Elemen' },
        { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', placeholder: 'TP', multiline: true },
        { key: 'materi_pokok', label: 'Materi Pokok', placeholder: 'Materi pokok', multiline: true },
        { key: 'dimensi_profil', label: 'Dimensi Profil Lulusan', placeholder: 'Dimensi profil', multiline: true },
        {
          key: 'alokasi_jp',
          label: 'Alokasi Waktu (JP)',
          placeholder: 'JP',
          dataType: 'NUMBER',
          semanticKey: 'alokasi_jp',
          valueSource: 'SYSTEM_WEEKLY_CLASS_HOURS',
          sourceType: 'SYSTEM',
          teacherEditMode: 'TEACHER_EDITABLE',
          exposeAsReference: true,
          binding: { systemKey: 'weekly_class_hours', syncMode: 'SYSTEM_DYNAMIC', allowManualOverride: true },
        },
      ],
    },
    {
      key: 'ttd_dokumen',
      label: 'Pengesahan Dokumen',
      description: 'Bagian tanda tangan sesuai format lembar ATP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
  ],
};

const PROGRAM_SCHEMA_PROTA: TeachingResourceProgramSchema = {
  version: 5,
  sourceSheet: 'PROTA',
  intro: 'Program tahunan memetakan distribusi tujuan pembelajaran dan alokasi waktu (JP) untuk semester ganjil/genap.',
  titleHint: 'Program Tahunan - [Mapel] - [Tahun Ajaran]',
  summaryHint: 'Ringkasan beban ajar dan distribusi tujuan pembelajaran setahun.',
  sections: [
    {
      key: 'konteks_dokumen',
      label: 'Konteks Dokumen',
      description: 'Identitas Prota sesuai format contoh (mapel, tingkat, program keahlian, tahun ajaran).',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'mata_pelajaran', label: 'Mata Pelajaran', placeholder: 'Contoh: Network Client Server' },
        { key: 'tingkat', label: 'Tingkat', placeholder: 'Contoh: XII' },
        { key: 'program_keahlian', label: 'Program Keahlian', placeholder: 'Contoh: Teknik Komputer dan Jaringan' },
      ],
    },
    {
      key: 'tabel_prota',
      label: 'Tabel Prota',
      description: 'Tabel program tahunan sesuai sheet PROTA.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'semester', label: 'Semester', placeholder: '1 / 2' },
        { key: 'no', label: 'No', placeholder: '1' },
        { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', placeholder: 'TP', multiline: true },
        {
          key: 'alokasi_jp',
          label: 'Alokasi Waktu (JP)',
          placeholder: 'JP',
          dataType: 'NUMBER',
          semanticKey: 'alokasi_jp',
          valueSource: 'SYSTEM_WEEKLY_CLASS_HOURS',
          sourceType: 'SYSTEM',
          teacherEditMode: 'TEACHER_EDITABLE',
          exposeAsReference: true,
          binding: { systemKey: 'weekly_class_hours', syncMode: 'SYSTEM_DYNAMIC', allowManualOverride: true },
        },
        { key: 'dimensi_profil', label: 'Dimensi Profil Lulusan', placeholder: 'Dimensi', multiline: true },
      ],
    },
    {
      key: 'ringkasan_jumlah_jp',
      label: 'Ringkasan Jumlah JP',
      description: 'Isi total alokasi JP (baris JUMLAH) sesuai format PROTA.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [{ key: 'jumlah_jp', label: 'Jumlah JP', placeholder: 'Contoh: 152' }],
    },
    {
      key: 'ttd_dokumen',
      label: 'Pengesahan Dokumen',
      description: 'Bagian tanda tangan sesuai format lembar PROTA.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
  ],
};

const PROGRAM_SCHEMA_PROMES: TeachingResourceProgramSchema = {
  version: 6,
  sourceSheet: 'PROSEM',
  intro: 'Program semester memecah Prota menjadi penjadwalan mingguan (bulan vs minggu ke-) dan target TP.',
  titleHint: 'Program Semester - [Mapel] - [Semester]',
  summaryHint: 'Ringkasan distribusi minggu pelaksanaan tiap TP.',
  sections: [
    {
      key: 'konteks_dokumen',
      label: 'Konteks Dokumen',
      description: 'Identitas Promes sesuai format contoh (mapel, tingkat, program keahlian, semester, tahun ajaran).',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'mata_pelajaran', label: 'Mata Pelajaran', placeholder: 'Contoh: Network Client Server' },
        { key: 'tingkat', label: 'Tingkat', placeholder: 'Contoh: XII' },
        { key: 'program_keahlian', label: 'Program Keahlian', placeholder: 'Contoh: Teknik Komputer dan Jaringan' },
        { key: 'semester', label: 'Semester', placeholder: 'Contoh: 1 / 2' },
      ],
    },
    {
      key: 'tabel_promes_ganjil',
      label: 'Tabel Promes Semester Ganjil',
      description: 'Tabel program semester ganjil (Juli-Desember) sesuai sheet PROSEM.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'no', label: 'No', placeholder: '1' },
        { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', placeholder: 'TP', multiline: true },
        {
          key: 'alokasi_jp',
          label: 'Alokasi Waktu (JP)',
          placeholder: 'JP',
          dataType: 'NUMBER',
          semanticKey: 'alokasi_jp',
          valueSource: 'SYSTEM_WEEKLY_CLASS_HOURS',
          sourceType: 'SYSTEM',
          teacherEditMode: 'TEACHER_EDITABLE',
          exposeAsReference: true,
          binding: { systemKey: 'weekly_class_hours', syncMode: 'SYSTEM_DYNAMIC', allowManualOverride: true },
        },
        ...(PROSEM_GANJIL_WEEK_COLUMNS || []),
        { key: 'keterangan', label: 'Ket.', placeholder: 'Keterangan', multiline: true },
      ],
    },
    {
      key: 'tabel_promes_genap',
      label: 'Tabel Promes Semester Genap',
      description: 'Tabel program semester genap (Januari-Juni) sesuai sheet PROSEM.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'no', label: 'No', placeholder: '1' },
        { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', placeholder: 'TP', multiline: true },
        {
          key: 'alokasi_jp',
          label: 'Alokasi Waktu (JP)',
          placeholder: 'JP',
          dataType: 'NUMBER',
          semanticKey: 'alokasi_jp',
          valueSource: 'SYSTEM_WEEKLY_CLASS_HOURS',
          sourceType: 'SYSTEM',
          teacherEditMode: 'TEACHER_EDITABLE',
          exposeAsReference: true,
          binding: { systemKey: 'weekly_class_hours', syncMode: 'SYSTEM_DYNAMIC', allowManualOverride: true },
        },
        ...(PROSEM_GENAP_WEEK_COLUMNS || []),
        { key: 'keterangan', label: 'Ket.', placeholder: 'Keterangan', multiline: true },
      ],
    },
    {
      key: 'ttd_semester_ganjil',
      label: 'Pengesahan Semester Ganjil',
      description: 'Bagian tanda tangan setelah tabel semester ganjil.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
    {
      key: 'ttd_semester_genap',
      label: 'Pengesahan Semester Genap',
      description: 'Bagian tanda tangan setelah tabel semester genap.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
  ],
};

const PROGRAM_SCHEMA_MODUL_AJAR: TeachingResourceProgramSchema = {
  version: 4,
  intro: 'Modul Ajar fleksibel dan dinamis. Struktur menyesuaikan kebijakan kurikulum sekolah (format Word/PDF internal).',
  titleHint: 'Modul Ajar - [Topik] - [Kelas]',
  summaryHint: 'Ringkasan tujuan, strategi, asesmen, dan diferensiasi.',
  sections: [
    {
      key: 'identitas_modul',
      label: 'Identitas Modul',
      description: 'Data umum: mapel, fase/kelas, alokasi waktu, penyusun.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TEXT',
      titlePlaceholder: 'Identitas modul',
      bodyPlaceholder: 'Mapel:\nKelas/Fase:\nAlokasi waktu:\nPenyusun:',
    },
    {
      key: 'komponen_inti',
      label: 'Komponen Inti',
      description: 'Tujuan pembelajaran, pemahaman bermakna, pertanyaan pemantik, langkah pembelajaran.',
      repeatable: true,
      defaultRows: 2,
      editorType: 'TEXT',
      titlePlaceholder: 'Komponen inti',
      bodyPlaceholder:
        'Tujuan pembelajaran:\nPemahaman bermakna:\nPertanyaan pemantik:\nLangkah kegiatan:',
    },
    {
      key: 'asesmen_diferensiasi',
      label: 'Asesmen & Diferensiasi',
      description: 'Asesmen diagnostik-formatif-sumatif, remedial, dan pengayaan.',
      repeatable: true,
      defaultRows: 1,
      editorType: 'TEXT',
      titlePlaceholder: 'Asesmen',
      bodyPlaceholder: 'Diagnostik:\nFormatif:\nSumatif:\nRemedial:\nPengayaan:',
    },
    {
      key: 'lampiran_media',
      label: 'Lampiran & Media',
      description: 'Bahan ajar, LKPD, referensi, media belajar, dan instrumen.',
      repeatable: true,
      defaultRows: 1,
      editorType: 'TEXT',
      titlePlaceholder: 'Lampiran/Media',
      bodyPlaceholder: 'Daftar bahan ajar, media, dan lampiran pendukung.',
    },
  ],
};

const PROGRAM_SCHEMA_KKTP: TeachingResourceProgramSchema = {
  version: 6,
  sourceSheet: 'KKTP',
  intro: 'KKTP memetakan indikator ketercapaian TP dan kriteria penetapan (kurang memadai/memadai).',
  titleHint: 'KKTP - [Mapel] - [Kelas]',
  summaryHint: 'Ringkasan standar ketercapaian per TP.',
  sections: [
    {
      key: 'konteks_dokumen',
      label: 'Konteks Dokumen',
      description: 'Identitas KKTP sesuai sheet KKTP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'mata_pelajaran', label: 'Mata Pelajaran', placeholder: 'Contoh: Network Client Server' },
        { key: 'tingkat', label: 'Tingkat', placeholder: 'Contoh: XII' },
        { key: 'program_keahlian', label: 'Program Keahlian', placeholder: 'Contoh: Teknik Komputer dan Jaringan' },
      ],
    },
    {
      key: 'tabel_kktp',
      label: 'Tabel KKTP',
      description: 'Tabel KKTP sesuai format sheet KKTP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'no', label: 'No', placeholder: '1' },
        { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran (TP)', placeholder: 'TP', multiline: true },
        {
          key: 'indikator_ketercapaian',
          label: 'Indikator Ketercapaian TP (IKTP)',
          placeholder: 'IKTP',
          multiline: true,
        },
        { key: 'kurang_memadai', label: 'Kurang Memadai', placeholder: 'Kriteria', multiline: true },
        { key: 'memadai', label: 'Memadai', placeholder: 'Kriteria', multiline: true },
      ],
    },
    {
      key: 'ringkasan_kktp',
      label: 'Ringkasan KKTP',
      description: 'Rekap jumlah kriteria dan nilai KKTP mapel sesuai bagian bawah sheet KKTP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'jumlah_kurang_memadai', label: 'Jumlah Kriteria Kurang Memadai', placeholder: 'Contoh: 8' },
        { key: 'jumlah_memadai', label: 'Jumlah Kriteria Memadai', placeholder: 'Contoh: 32' },
        { key: 'presentase_kurang_memadai', label: 'Persentase Kurang Memadai', placeholder: 'Contoh: 20%' },
        { key: 'presentase_memadai', label: 'Persentase Memadai', placeholder: 'Contoh: 80%' },
        { key: 'kktp_mapel', label: 'KKTP Mata Pelajaran', placeholder: 'Contoh: 80' },
      ],
    },
    {
      key: 'ttd_dokumen',
      label: 'Pengesahan Dokumen',
      description: 'Bagian tanda tangan sesuai format lembar KKTP.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
  ],
};

const PROGRAM_SCHEMA_MATRIKS: TeachingResourceProgramSchema = {
  version: 5,
  sourceSheet: 'MATRIKS',
  intro: 'Matriks sebaran menampilkan distribusi TP per minggu pelaksanaan, semester, serta jumlah jam.',
  titleHint: 'Matriks Sebaran - [Mapel] - [Semester]',
  summaryHint: 'Ringkasan sebaran TP terhadap kalender minggu.',
  sections: [
    {
      key: 'konteks_dokumen',
      label: 'Konteks Dokumen',
      description: 'Identitas matriks sebaran sesuai sheet MATRIKS.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'mata_pelajaran', label: 'Mata Pelajaran', placeholder: 'Contoh: Network Client Server' },
        { key: 'tingkat', label: 'Tingkat', placeholder: 'Contoh: XII' },
        { key: 'program_keahlian', label: 'Program Keahlian', placeholder: 'Contoh: Teknik Komputer dan Jaringan' },
      ],
    },
    {
      key: 'tabel_matriks',
      label: 'Tabel Matriks Sebaran',
      description: 'Sebaran TP per minggu pelaksanaan.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'no', label: 'No', placeholder: '1' },
        { key: 'tujuan_pembelajaran', label: 'Tujuan Pembelajaran', placeholder: 'TP', multiline: true },
        {
          key: 'waktu_jumlah_jam',
          label: 'Waktu/Jumlah Jam',
          placeholder: 'JP',
          dataType: 'NUMBER',
          semanticKey: 'alokasi_jp',
          valueSource: 'SYSTEM_WEEKLY_CLASS_HOURS',
          sourceType: 'SYSTEM',
          teacherEditMode: 'TEACHER_EDITABLE',
          exposeAsReference: true,
          binding: { systemKey: 'weekly_class_hours', syncMode: 'SYSTEM_DYNAMIC', allowManualOverride: true },
        },
        { key: 'semester', label: 'Semester', placeholder: '1 / 2' },
        ...(MATRIKS_WEEK_COLUMNS || []),
        { key: 'keterangan', label: 'KET', placeholder: 'Keterangan', multiline: true },
      ],
    },
    {
      key: 'ttd_dokumen',
      label: 'Pengesahan Dokumen',
      description: 'Bagian tanda tangan sesuai format lembar MATRIKS.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
  ],
};

const PROGRAM_SCHEMA_ALOKASI_WAKTU: TeachingResourceProgramSchema = {
  version: 6,
  sourceSheet: 'ALOKASI WAKTU',
  intro:
    'Perhitungan jumlah minggu efektif per semester untuk dasar penyusunan ATP, Prota, Promes, dan matriks sebaran.',
  titleHint: 'Alokasi Waktu Efektif - [Mapel] - [Tahun Ajaran]',
  summaryHint: 'Ringkasan minggu efektif semester 1 dan semester 2.',
  sections: [
    {
      key: 'konteks_dokumen',
      label: 'Konteks Dokumen',
      description: 'Identitas dokumen alokasi waktu.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'mata_pelajaran', label: 'Mata Pelajaran', placeholder: 'Contoh: Network Client Server' },
        { key: 'tingkat', label: 'Tingkat', placeholder: 'Contoh: XII' },
        { key: 'program_keahlian', label: 'Program Keahlian', placeholder: 'Contoh: Teknik Komputer dan Jaringan' },
      ],
    },
    {
      key: 'alokasi_semester_1',
      label: 'Perhitungan Minggu Efektif Semester 1',
      description: 'Isi sesuai tabel semester 1 (Juli-Desember).',
      repeatable: false,
      defaultRows: 7,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'bulan', label: 'Bulan', placeholder: 'Juli / Agustus / ...' },
        { key: 'total_minggu', label: 'Total', placeholder: 'Contoh: 4' },
        { key: 'tidak_efektif', label: 'Tidak Efektif', placeholder: 'Contoh: 1' },
        { key: 'efektif', label: 'Efektif', placeholder: 'Contoh: 3' },
        { key: 'keterangan', label: 'Keterangan', placeholder: 'Agenda khusus', multiline: true },
        { key: 'minggu_ke', label: 'Minggu Ke-', placeholder: '1-4', multiline: true },
      ],
      prefillRows: ALOKASI_WAKTU_SEMESTER_1_PREFILL_ROWS,
    },
    {
      key: 'alokasi_semester_2',
      label: 'Perhitungan Minggu Efektif Semester 2',
      description: 'Isi sesuai tabel semester 2 (Januari-Juni).',
      repeatable: false,
      defaultRows: 7,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: [
        { key: 'bulan', label: 'Bulan', placeholder: 'Januari / Februari / ...' },
        { key: 'total_minggu', label: 'Total', placeholder: 'Contoh: 4' },
        { key: 'tidak_efektif', label: 'Tidak Efektif', placeholder: 'Contoh: 1' },
        { key: 'efektif', label: 'Efektif', placeholder: 'Contoh: 3' },
        { key: 'keterangan', label: 'Keterangan', placeholder: 'Agenda khusus', multiline: true },
        { key: 'minggu_ke', label: 'Minggu Ke-', placeholder: '1-4', multiline: true },
      ],
      prefillRows: ALOKASI_WAKTU_SEMESTER_2_PREFILL_ROWS,
    },
    {
      key: 'ttd_semester_1',
      label: 'Pengesahan Semester 1',
      description: 'Bagian tanda tangan setelah tabel semester 1.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
    {
      key: 'ttd_semester_2',
      label: 'Pengesahan Semester 2',
      description: 'Bagian tanda tangan setelah tabel semester 2.',
      repeatable: false,
      defaultRows: 1,
      editorType: 'TABLE',
      sectionTitleEditable: false,
      columns: SIGNATURE_SECTION_COLUMNS,
    },
  ],
};

const DEFAULT_TEACHING_RESOURCE_PROGRAMS: TeachingResourceProgramDefinition[] = [
  {
    code: 'CP',
    label: 'Capaian Pembelajaran (CP)',
    shortLabel: 'CP',
    description: 'Perumusan capaian pembelajaran per mapel/fase.',
    order: 10,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_CP,
  },
  {
    code: 'ATP',
    label: 'Alur Tujuan Pembelajaran (ATP)',
    shortLabel: 'ATP',
    description: 'Alur tujuan pembelajaran turunan dari CP.',
    order: 20,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_ATP,
  },
  {
    code: 'PROTA',
    label: 'Program Tahunan',
    shortLabel: 'Prota',
    description: 'Perencanaan distribusi materi satu tahun ajaran.',
    order: 30,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_PROTA,
  },
  {
    code: 'PROMES',
    label: 'Program Semester',
    shortLabel: 'Promes',
    description: 'Turunan Prota per semester berjalan.',
    order: 40,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_PROMES,
  },
  {
    code: 'ALOKASI_WAKTU',
    label: 'Alokasi Waktu',
    shortLabel: 'Alokasi Waktu',
    description: 'Perhitungan minggu efektif semester 1 dan 2 sebagai dasar distribusi pembelajaran.',
    order: 45,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_ALOKASI_WAKTU,
  },
  {
    code: 'MODUL_AJAR',
    label: 'Modul Ajar',
    shortLabel: 'Modul',
    description: 'Dokumen modul ajar per topik pertemuan.',
    order: 50,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_MODUL_AJAR,
  },
  {
    code: 'KKTP',
    label: 'Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)',
    shortLabel: 'KKTP',
    description: 'Standar ketercapaian per tujuan pembelajaran.',
    order: 60,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_KKTP,
  },
  {
    code: 'MATRIKS_SEBARAN',
    label: 'Matriks Sebaran',
    shortLabel: 'Matriks',
    description: 'Peta sebaran materi, tujuan, asesmen, dan kalender ajar.',
    order: 70,
    isActive: true,
    showOnTeacherMenu: true,
    targetClassLevels: [],
    schema: PROGRAM_SCHEMA_MATRIKS,
  },
];

function normalizeProgramCode(raw: unknown): string {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (normalized === 'PROSEM') return 'PROMES';
  if (normalized === 'MODUL' || normalized === 'MODULES') return 'MODUL_AJAR';
  if (normalized === 'MATRIKS') return 'MATRIKS_SEBARAN';
  return normalized;
}

function normalizeReferenceToken(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isMeaningfulReferenceValue(raw: unknown): boolean {
  const normalized = String(raw ?? '').trim();
  return Boolean(normalized && !['-', '—', '–'].includes(normalized));
}

function extractReferenceCandidatesFromColumn(column: Partial<TeachingResourceColumnSchema> | null | undefined): string[] {
  const candidates = new Set<string>();
  [
    column?.binding?.sourceFieldIdentity,
    column?.binding?.sourceDocumentFieldIdentity,
    column?.fieldIdentity,
    column?.bindingKey,
    column?.semanticKey,
    column?.key,
  ].forEach((item) => {
    const token = String(item || '').trim();
    if (!token) return;
    const normalized = normalizeReferenceToken(token);
    if (normalized) candidates.add(normalized);
    const tail = normalizeReferenceToken(token.split('.').pop());
    if (tail) candidates.add(tail);
  });
  return Array.from(candidates);
}

const REFERENCE_IDENTITY_ALIASES: Record<string, string> = {
  tp: 'tujuan_pembelajaran',
  tujuan_pembelajaran: 'tujuan_pembelajaran',
  dpl: 'dimensi_profil',
  dimensi_profil_lulusan: 'dimensi_profil',
  dimensi_profil: 'dimensi_profil',
  materi_pokok: 'konten_materi',
  konten_materi: 'konten_materi',
};

const CONTEXT_REFERENCE_IDENTITIES = new Set(['mata_pelajaran', 'tingkat', 'program_keahlian', 'semester', 'tahun_ajaran']);

function normalizeReferenceIdentity(raw: unknown): string {
  const token = normalizeReferenceToken(raw);
  return REFERENCE_IDENTITY_ALIASES[token] || token;
}

function getColumnIdentityCandidates(column: Partial<TeachingResourceColumnSchema> | null | undefined): string[] {
  const candidates = new Set<string>();
  [
    column?.binding?.sourceFieldIdentity,
    column?.binding?.sourceDocumentFieldIdentity,
    column?.fieldIdentity,
    column?.semanticKey,
    column?.bindingKey,
    column?.key,
    column?.label,
  ].forEach((item) => {
    const token = normalizeReferenceIdentity(item);
    if (token) candidates.add(token);
  });
  return Array.from(candidates);
}

function getProgramReferenceIdentityMap(program: TeachingResourceProgramPayload | undefined): Map<string, string> {
  const map = new Map<string, string>();
  (program?.schema?.sections || []).forEach((section) => {
    if ((section.editorType || 'TABLE') !== 'TABLE') return;
    (section.columns || []).forEach((column) => {
      const sourceValue = String(column.fieldIdentity || column.semanticKey || column.bindingKey || column.key || '').trim();
      const sourceLabel = String(column.label || '').trim();
      const normalizedValue = normalizeReferenceIdentity(sourceValue);
      if (normalizedValue && !map.has(normalizedValue)) map.set(normalizedValue, normalizeReferenceToken(sourceValue) || normalizedValue);
      const normalizedLabel = normalizeReferenceIdentity(sourceLabel);
      if (normalizedLabel && !map.has(normalizedLabel)) map.set(normalizedLabel, normalizeReferenceToken(sourceValue) || normalizedLabel);
    });
  });
  return map;
}

function resolveBestReferenceSource(
  column: TeachingResourceColumnSchema,
  sectionColumns: TeachingResourceColumnSchema[],
  programMetaByCode: Map<string, TeachingResourceProgramPayload>,
): { sourceProgramCode: string; sourceFieldIdentity: string } | null {
  const currentSourceProgramCode = normalizeProgramCode(column.binding?.sourceProgramCode);
  const currentSourceIdentity = normalizeReferenceIdentity(
    column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity,
  );
  const localCandidates = getColumnIdentityCandidates(column).filter((candidate) => !CONTEXT_REFERENCE_IDENTITIES.has(candidate));
  const sourceProgramCodes = Array.from(
    new Set(
      [
        currentSourceProgramCode,
        ...sectionColumns.map((item) => normalizeProgramCode(item.binding?.sourceProgramCode)),
      ].filter(Boolean),
    ),
  );

  let best: { sourceProgramCode: string; sourceFieldIdentity: string; score: number } | null = null;
  sourceProgramCodes.forEach((sourceProgramCode) => {
    const identityMap = getProgramReferenceIdentityMap(programMetaByCode.get(sourceProgramCode));
    localCandidates.forEach((candidate) => {
      const sourceFieldIdentity = identityMap.get(candidate);
      if (!sourceFieldIdentity) return;
      let score = 10;
      if (sourceProgramCode === currentSourceProgramCode && currentSourceIdentity === candidate) score += 8;
      if (sourceProgramCode === currentSourceProgramCode && currentSourceIdentity && !CONTEXT_REFERENCE_IDENTITIES.has(currentSourceIdentity)) {
        score += 2;
      }
      if (sourceProgramCode !== currentSourceProgramCode && CONTEXT_REFERENCE_IDENTITIES.has(currentSourceIdentity)) score += 4;
      const isUsedBySibling = sectionColumns.some(
        (item) => normalizeProgramCode(item.binding?.sourceProgramCode) === sourceProgramCode && item.key !== column.key,
      );
      if (isUsedBySibling) score += 2;
      if (!best || score > best.score) {
        best = { sourceProgramCode, sourceFieldIdentity, score };
      }
    });
  });

  if (!best) return null;
  const resolved = best as { sourceProgramCode: string; sourceFieldIdentity: string; score: number };
  return { sourceProgramCode: resolved.sourceProgramCode, sourceFieldIdentity: resolved.sourceFieldIdentity };
}

function normalizeProgramReferenceSchemas(programs: TeachingResourceProgramPayload[]): TeachingResourceProgramPayload[] {
  const programMetaByCode = new Map(programs.map((program) => [normalizeProgramCode(program.code), program]));
  return programs.map((program) => {
    const sections = program.schema.sections.map((section) => {
      const columns = section.columns || [];
      if ((section.editorType || 'TABLE') !== 'TABLE' || columns.length === 0) return section;

      let nextColumns = columns.map((column) => ({ ...column, binding: column.binding ? { ...column.binding } : undefined }));
      const hasReferencePicker = nextColumns.some((column) => column.sourceType === 'DOCUMENT_REFERENCE');
      if (!hasReferencePicker) {
        const promotedIndex = nextColumns.findIndex(
          (column) => column.sourceType === 'DOCUMENT_SNAPSHOT' && Boolean(resolveBestReferenceSource(column, nextColumns, programMetaByCode)),
        );
        if (promotedIndex >= 0) {
          const promoted = nextColumns[promotedIndex];
          const bestSource = resolveBestReferenceSource(promoted, nextColumns, programMetaByCode);
          if (bestSource) {
            nextColumns[promotedIndex] = {
              ...promoted,
              sourceType: 'DOCUMENT_REFERENCE',
              valueSource: 'MANUAL',
              readOnly: false,
              teacherEditMode: 'TEACHER_EDITABLE',
              exposeAsReference: false,
              binding: {
                ...(promoted.binding || {}),
                sourceProgramCode: bestSource.sourceProgramCode,
                sourceFieldIdentity: bestSource.sourceFieldIdentity,
                sourceDocumentFieldIdentity: bestSource.sourceFieldIdentity,
                selectionMode: promoted.binding?.selectionMode || 'PICK_SINGLE',
                syncMode: 'SNAPSHOT_ON_SELECT',
              },
            };
          }
        }
      }

      const primaryReference = nextColumns.find((column) => column.sourceType === 'DOCUMENT_REFERENCE');
      const primarySourceProgramCode = normalizeProgramCode(primaryReference?.binding?.sourceProgramCode);
      const primarySourceIdentityMap = getProgramReferenceIdentityMap(programMetaByCode.get(primarySourceProgramCode));
      if (primarySourceProgramCode && primarySourceIdentityMap.size > 0) {
        nextColumns = nextColumns.map((column) => {
          if (column.sourceType === 'DOCUMENT_REFERENCE') return column;
          if (column.sourceType !== 'DOCUMENT_SNAPSHOT') return column;
          const match = getColumnIdentityCandidates(column).map((candidate) => primarySourceIdentityMap.get(candidate)).find(Boolean);
          if (!match) return column;
          return {
            ...column,
            binding: {
              ...(column.binding || {}),
              sourceProgramCode: primarySourceProgramCode,
              sourceFieldIdentity: match,
              sourceDocumentFieldIdentity: match,
            },
          };
        });
      }

      return { ...section, columns: nextColumns };
    });
    return { ...program, schema: { ...program.schema, sections } };
  });
}

function buildReferenceSnapshotFromRow(
  columns: Array<Partial<TeachingResourceColumnSchema>>,
  row: Record<string, string>,
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  columns.forEach((column) => {
    const key = String(column.key || '').trim();
    const value = String(row[key] || '').trim();
    if (!key || !isMeaningfulReferenceValue(value)) return;
    const tokens = new Set<string>([
      normalizeReferenceToken(key),
      ...extractReferenceCandidatesFromColumn(column),
    ]);
    tokens.forEach((token) => {
      if (!token || snapshot[token]) return;
      snapshot[token] = value;
    });
  });
  Object.entries(row).forEach(([key, rawValue]) => {
    const normalizedKey = normalizeReferenceToken(key);
    const value = String(rawValue || '').trim();
    if (!normalizedKey || !isMeaningfulReferenceValue(value) || snapshot[normalizedKey]) return;
    snapshot[normalizedKey] = value;
  });
  return snapshot;
}

function splitReferenceCellLines(raw: unknown): string[] {
  const lines = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  return lines.length > 0 ? lines : [''];
}

function buildReferenceSnapshotFromRowLine(
  columns: Array<Partial<TeachingResourceColumnSchema>>,
  row: Record<string, string>,
  lineIndex: number,
): Record<string, string> {
  const projectedRow = Object.entries(row).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const lines = splitReferenceCellLines(rawValue);
    acc[key] = lines.length > 1 ? String(lines[lineIndex] || '').trim() : String(rawValue || '').trim();
    return acc;
  }, {});
  return buildReferenceSnapshotFromRow(columns, projectedRow);
}

function parseReferenceProjectionRequests(raw: unknown): TeachingResourceReferenceProjectionRequest[] {
  const source = String(raw || '').trim();
  if (!source) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const requests: TeachingResourceReferenceProjectionRequest[] = [];
  parsed.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const input = item as {
        requestKey?: unknown;
        sourceProgramCode?: unknown;
        candidates?: unknown;
        filterByContext?: unknown;
        matchBySubject?: unknown;
        matchByClassLevel?: unknown;
        matchByMajor?: unknown;
        matchByActiveSemester?: unknown;
        context?: {
          subjectId?: unknown;
          classLevel?: unknown;
          programKeahlian?: unknown;
          semester?: unknown;
        };
      };
      const sourceProgramCode = normalizeProgramCode(input.sourceProgramCode);
      const requestKey = String(input.requestKey || `${sourceProgramCode || 'source'}::${index}`).trim();
      const candidates = Array.isArray(input.candidates)
        ? Array.from(
            new Set(input.candidates.map((candidate) => normalizeReferenceToken(candidate)).filter(Boolean)),
          )
        : [];
      if (!sourceProgramCode || !requestKey || candidates.length === 0) return;
      requests.push({
        requestKey,
        sourceProgramCode,
        candidates,
        filterByContext: toBoolean(input.filterByContext, false) || undefined,
        matchBySubject: toBoolean(input.matchBySubject, false) || undefined,
        matchByClassLevel: toBoolean(input.matchByClassLevel, false) || undefined,
        matchByMajor: toBoolean(input.matchByMajor, false) || undefined,
        matchByActiveSemester: toBoolean(input.matchByActiveSemester, false) || undefined,
        context: input.context
          ? {
              subjectId: toNumber(input.context.subjectId, 0) || undefined,
              classLevel: normalizeClassLevelToken(input.context.classLevel) || undefined,
              programKeahlian: String(input.context.programKeahlian || '').trim() || undefined,
              semester: String(input.context.semester || '').trim() || undefined,
          }
          : undefined,
      });
    });
  return requests.slice(0, 50);
}

function normalizeRoleContext(raw: unknown): RoleContext {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'teacher') return 'teacher';
  return 'all';
}

function toBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.trim().toLowerCase();
    if (['1', 'true', 'ya', 'yes'].includes(cleaned)) return true;
    if (['0', 'false', 'tidak', 'no'].includes(cleaned)) return false;
  }
  if (typeof raw === 'number') return raw > 0;
  return fallback;
}

function toNumber(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function sanitizeTargetClassLevels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  raw.forEach((value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function sanitizeProgramSectionKey(raw: unknown, fallbackKey: string): string {
  const normalized =
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || fallbackKey;
  return normalized || fallbackKey;
}

function sanitizeStringList(raw: unknown, options?: { upperCase?: boolean }): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  raw.forEach((value) => {
    const base = String(value || '').trim();
    const normalized = options?.upperCase ? base.toUpperCase() : base;
    if (!normalized) return;
    const key = options?.upperCase ? normalized : normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function inferFieldSourceType(
  valueSource?: TeachingResourceColumnValueSource,
  readOnly?: boolean,
): TeachingResourceFieldSourceType {
  if (valueSource && valueSource !== 'MANUAL' && valueSource !== 'BOUND') return 'SYSTEM';
  if (valueSource === 'BOUND') return 'DOCUMENT_SNAPSHOT';
  if (readOnly) return 'DERIVED';
  return 'MANUAL';
}

function inferFieldSyncMode(
  sourceType?: TeachingResourceFieldSourceType,
  valueSource?: TeachingResourceColumnValueSource,
): TeachingResourceFieldSyncMode | undefined {
  if (sourceType === 'SYSTEM') return 'SYSTEM_DYNAMIC';
  if (sourceType === 'DOCUMENT_REFERENCE' || sourceType === 'DOCUMENT_SNAPSHOT' || valueSource === 'BOUND') {
    return 'SNAPSHOT_ON_SELECT';
  }
  return undefined;
}

function inferTeacherEditMode(column: {
  readOnly?: boolean;
  valueSource?: TeachingResourceColumnValueSource;
}): TeachingResourceTeacherEditMode {
  if (column.readOnly || (column.valueSource && column.valueSource !== 'MANUAL')) return 'SYSTEM_LOCKED';
  return 'TEACHER_EDITABLE';
}

function inferBlockType(section: Partial<TeachingResourceSectionSchema>): TeachingResourceBlockType {
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

function inferBlockLayout(section: Partial<TeachingResourceSectionSchema>): TeachingResourceBlockLayout {
  if (section.editorType === 'TABLE') return 'TABLE';
  return 'STACK';
}

function inferFieldIdentity(column: Partial<TeachingResourceColumnSchema>, fallbackKey: string): string {
  return sanitizeProgramSectionKey(
    column.fieldIdentity || column.semanticKey || column.bindingKey || column.key,
    fallbackKey,
  );
}

function sanitizeVisibilityRules(raw: unknown): TeachingResourceVisibilityRules | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as TeachingResourceVisibilityRules;
  const roleScopes = sanitizeStringList(input.roleScopes, { upperCase: true });
  const targetClassLevels = sanitizeTargetClassLevels(input.targetClassLevels);
  const hideWhenEmpty = toBoolean(input.hideWhenEmpty, false);

  const value: TeachingResourceVisibilityRules = {};
  if (roleScopes.length > 0) value.roleScopes = roleScopes;
  if (targetClassLevels.length > 0) value.targetClassLevels = targetClassLevels;
  if (hideWhenEmpty) value.hideWhenEmpty = true;
  return Object.keys(value).length > 0 ? value : undefined;
}

function sanitizeTeacherRules(raw: unknown): TeachingResourceTeacherRules | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as TeachingResourceTeacherRules;
  const value: TeachingResourceTeacherRules = {
    allowAddSection: toBoolean(input.allowAddSection, false) || undefined,
    allowDeleteSection: toBoolean(input.allowDeleteSection, false) || undefined,
    allowAddRow: toBoolean(input.allowAddRow, false) || undefined,
    allowDeleteRow: toBoolean(input.allowDeleteRow, false) || undefined,
    allowReorderRow: toBoolean(input.allowReorderRow, false) || undefined,
    allowAddCustomColumn: toBoolean(input.allowAddCustomColumn, false) || undefined,
    allowDeleteCustomColumn: toBoolean(input.allowDeleteCustomColumn, false) || undefined,
    allowEditFieldLabel: toBoolean(input.allowEditFieldLabel, false) || undefined,
    allowEditBinding: toBoolean(input.allowEditBinding, false) || undefined,
    allowOverrideReadOnlyValue: toBoolean(input.allowOverrideReadOnlyValue, false) || undefined,
  };
  return Object.values(value).some((item) => item !== undefined) ? value : undefined;
}

function sanitizePrintRules(raw: unknown): TeachingResourcePrintRules | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as TeachingResourcePrintRules;
  const signatureModeRaw = String(input.signatureMode || '')
    .trim()
    .toUpperCase();
  const signatureMode =
    signatureModeRaw === 'MANUAL' || signatureModeRaw === 'SYSTEM_DEFAULT'
      ? (signatureModeRaw as TeachingResourcePrintRules['signatureMode'])
      : undefined;
  const value: TeachingResourcePrintRules = {
    showInstitutionHeader: toBoolean(input.showInstitutionHeader, false) || undefined,
    showDocumentTitle: toBoolean(input.showDocumentTitle, false) || undefined,
    compactTable: toBoolean(input.compactTable, false) || undefined,
    signatureMode,
  };
  return Object.values(value).some((item) => item !== undefined) ? value : undefined;
}

function sanitizeFieldBinding(
  raw: unknown,
  fallback?: TeachingResourceFieldBinding,
  sourceType?: TeachingResourceFieldSourceType,
  valueSource?: TeachingResourceColumnValueSource,
): TeachingResourceFieldBinding | undefined {
  const input = raw && typeof raw === 'object' ? (raw as TeachingResourceFieldBinding) : {};
  const selectionModeRaw = String(input.selectionMode || fallback?.selectionMode || '')
    .trim()
    .toUpperCase();
  const syncModeRaw = String(input.syncMode || fallback?.syncMode || inferFieldSyncMode(sourceType, valueSource) || '')
    .trim()
    .toUpperCase();
  const selectionMode = TEACHING_RESOURCE_REFERENCE_SELECTION_MODES.includes(
    selectionModeRaw as (typeof TEACHING_RESOURCE_REFERENCE_SELECTION_MODES)[number],
  )
    ? (selectionModeRaw as TeachingResourceReferenceSelectionMode)
    : undefined;
  const syncMode = TEACHING_RESOURCE_FIELD_SYNC_MODES.includes(
    syncModeRaw as (typeof TEACHING_RESOURCE_FIELD_SYNC_MODES)[number],
  )
    ? (syncModeRaw as TeachingResourceFieldSyncMode)
    : undefined;

  const value: TeachingResourceFieldBinding = {
    systemKey: sanitizeProgramSectionKey(input.systemKey, String(fallback?.systemKey || '').trim()) || undefined,
    sourceProgramCode: normalizeProgramCode(input.sourceProgramCode) || undefined,
    sourceDocumentFieldIdentity:
      sanitizeProgramSectionKey(
        input.sourceDocumentFieldIdentity,
        String(fallback?.sourceDocumentFieldIdentity || '').trim(),
      ) || undefined,
    sourceFieldIdentity:
      sanitizeProgramSectionKey(input.sourceFieldIdentity, String(fallback?.sourceFieldIdentity || '').trim()) ||
      undefined,
    filterByContext: toBoolean(input.filterByContext, Boolean(fallback?.filterByContext)) || undefined,
    matchBySubject: toBoolean(input.matchBySubject, Boolean(fallback?.matchBySubject)) || undefined,
    matchByClassLevel: toBoolean(input.matchByClassLevel, Boolean(fallback?.matchByClassLevel)) || undefined,
    matchByMajor: toBoolean(input.matchByMajor, Boolean(fallback?.matchByMajor)) || undefined,
    matchByActiveSemester:
      toBoolean(input.matchByActiveSemester, Boolean(fallback?.matchByActiveSemester)) || undefined,
    selectionMode,
    syncMode,
    allowManualOverride:
      toBoolean(input.allowManualOverride, Boolean(fallback?.allowManualOverride)) || undefined,
  };

  return Object.values(value).some((item) => item !== undefined) ? value : undefined;
}

function cloneProgramSchema(schema: TeachingResourceProgramSchema): TeachingResourceProgramSchema {
  return {
    version: Number(schema.version || 1),
    sourceSheet: schema.sourceSheet,
    intro: String(schema.intro || ''),
    titleHint: schema.titleHint,
    summaryHint: schema.summaryHint,
    schemaMode: schema.schemaMode,
    documentTitle: schema.documentTitle,
    documentShortTitle: schema.documentShortTitle,
    teacherRules: schema.teacherRules ? { ...schema.teacherRules } : undefined,
    printRules: schema.printRules ? { ...schema.printRules } : undefined,
    sections: Array.isArray(schema.sections)
      ? schema.sections.map((section, index) => ({
          key: String(section.key || `section_${index + 1}`),
          label: String(section.label || `Section ${index + 1}`),
          description: section.description ? String(section.description) : undefined,
          repeatable: Boolean(section.repeatable),
          defaultRows: Math.max(1, Number(section.defaultRows || 1)),
          editorType: section.editorType === 'TABLE' ? 'TABLE' : 'TEXT',
          columns: Array.isArray(section.columns)
            ? section.columns
                .map((column, colIndex) => ({
                  key: String(column.key || `col_${colIndex + 1}`),
                  label: String(column.label || `Kolom ${colIndex + 1}`),
                  placeholder: column.placeholder ? String(column.placeholder) : undefined,
                  multiline: Boolean(column.multiline),
                  dataType: column.dataType,
                  semanticKey: column.semanticKey ? String(column.semanticKey) : undefined,
                  bindingKey: column.bindingKey ? String(column.bindingKey) : undefined,
                  valueSource: column.valueSource,
                  required: Boolean(column.required),
                  readOnly: Boolean(column.readOnly),
                  options: Array.isArray(column.options)
                    ? column.options.map((option) => String(option || '').trim()).filter(Boolean)
                    : undefined,
                  fieldId: column.fieldId ? String(column.fieldId) : undefined,
                  fieldIdentity: column.fieldIdentity ? String(column.fieldIdentity) : undefined,
                  sourceType: column.sourceType,
                  binding: column.binding
                    ? {
                        ...column.binding,
                      }
                    : undefined,
                  teacherEditMode: column.teacherEditMode,
                  exposeAsReference: Boolean(column.exposeAsReference),
                  isCoreField: Boolean(column.isCoreField),
                }))
                .filter((column) => column.key && column.label)
            : undefined,
          prefillRows: Array.isArray(section.prefillRows)
            ? section.prefillRows.map((row) => {
                const normalizedRow: Record<string, string> = {};
                Object.entries(row || {}).forEach(([key, value]) => {
                  const rowKey = String(key || '').trim();
                  if (!rowKey) return;
                  normalizedRow[rowKey] = String(value ?? '').trim();
                });
                return normalizedRow;
              })
            : undefined,
          sectionTitleEditable: section.sectionTitleEditable,
          titlePlaceholder: section.titlePlaceholder,
          bodyPlaceholder: section.bodyPlaceholder,
          blockId: section.blockId,
          blockType: section.blockType,
          layout: section.layout,
          visibilityRules: section.visibilityRules ? { ...section.visibilityRules } : undefined,
          teacherRules: section.teacherRules ? { ...section.teacherRules } : undefined,
        }))
      : [],
  };
}

function sanitizeProgramSchema(
  raw: unknown,
  fallback: TeachingResourceProgramSchema = GENERIC_PROGRAM_SCHEMA,
): TeachingResourceProgramSchema {
  const safeFallback = cloneProgramSchema(fallback);
  if (!raw || typeof raw !== 'object') return safeFallback;

  const input = raw as Partial<TeachingResourceProgramSchema> & { sections?: unknown };
  const sectionsInput = Array.isArray(input.sections) ? input.sections : [];

  const sanitizedSections = sectionsInput.reduce<TeachingResourceSectionSchema[]>((acc, section, index) => {
    if (!section || typeof section !== 'object') return acc;
    const row = section as Partial<TeachingResourceSectionSchema> & { columns?: unknown; prefillRows?: unknown };
    const fallbackSection = safeFallback.sections[index] || safeFallback.sections[0];
    const key = sanitizeProgramSectionKey(row.key, fallbackSection?.key || `section_${index + 1}`);
    const label = String(row.label || fallbackSection?.label || `Section ${index + 1}`).trim();
    if (!label) return acc;

    const requestedEditorType = String(row.editorType || '').trim().toUpperCase();
    const editorType =
      requestedEditorType === 'TABLE' || requestedEditorType === 'TEXT'
        ? (requestedEditorType as (typeof TEACHING_RESOURCE_EDITOR_TYPES)[number])
        : fallbackSection?.editorType || 'TEXT';
    const requestedBlockType = String(row.blockType || fallbackSection?.blockType || inferBlockType(row))
      .trim()
      .toUpperCase();
    const blockType = TEACHING_RESOURCE_BLOCK_TYPES.includes(
      requestedBlockType as (typeof TEACHING_RESOURCE_BLOCK_TYPES)[number],
    )
      ? (requestedBlockType as TeachingResourceBlockType)
      : inferBlockType({ ...fallbackSection, ...row, editorType });
    const requestedLayout = String(row.layout || fallbackSection?.layout || inferBlockLayout(row))
      .trim()
      .toUpperCase();
    const layout = TEACHING_RESOURCE_BLOCK_LAYOUTS.includes(
      requestedLayout as (typeof TEACHING_RESOURCE_BLOCK_LAYOUTS)[number],
    )
      ? (requestedLayout as TeachingResourceBlockLayout)
      : inferBlockLayout({ ...fallbackSection, ...row, editorType });
    const columnsInput = Array.isArray(row.columns) ? row.columns : [];
    const columns =
      editorType === 'TABLE'
        ? columnsInput.reduce<NonNullable<TeachingResourceSectionSchema['columns']>>((colAcc, column, colIndex) => {
            if (!column || typeof column !== 'object') return colAcc;
            const col = column as {
              key?: unknown;
              label?: unknown;
              placeholder?: unknown;
              multiline?: unknown;
              dataType?: unknown;
              semanticKey?: unknown;
              bindingKey?: unknown;
              valueSource?: unknown;
              required?: unknown;
              readOnly?: unknown;
              options?: unknown;
              fieldId?: unknown;
              fieldIdentity?: unknown;
              sourceType?: unknown;
              binding?: unknown;
              teacherEditMode?: unknown;
              exposeAsReference?: unknown;
              isCoreField?: unknown;
            };
            const fallbackCol = fallbackSection?.columns?.[colIndex];
            const colKey = sanitizeProgramSectionKey(col.key, fallbackCol?.key || `col_${colIndex + 1}`);
            const colLabel = String(col.label || fallbackCol?.label || `Kolom ${colIndex + 1}`).trim();
            if (!colKey || !colLabel) return colAcc;

            const requestedDataType = String(col.dataType || fallbackCol?.dataType || 'TEXT')
              .trim()
              .toUpperCase();
            const dataType = TEACHING_RESOURCE_COLUMN_DATA_TYPES.includes(
              requestedDataType as (typeof TEACHING_RESOURCE_COLUMN_DATA_TYPES)[number],
            )
              ? (requestedDataType as (typeof TEACHING_RESOURCE_COLUMN_DATA_TYPES)[number])
              : 'TEXT';
            const requestedValueSource = String(col.valueSource || fallbackCol?.valueSource || 'MANUAL')
              .trim()
              .toUpperCase();
            const valueSource = TEACHING_RESOURCE_COLUMN_VALUE_SOURCES.includes(
              requestedValueSource as (typeof TEACHING_RESOURCE_COLUMN_VALUE_SOURCES)[number],
            )
              ? (requestedValueSource as (typeof TEACHING_RESOURCE_COLUMN_VALUE_SOURCES)[number])
              : 'MANUAL';
            const options = Array.isArray(col.options)
              ? col.options.map((option) => String(option || '').trim()).filter(Boolean)
              : Array.isArray(fallbackCol?.options)
                ? fallbackCol.options
                : undefined;
            const semanticKey = sanitizeProgramSectionKey(col.semanticKey, String(fallbackCol?.semanticKey || '').trim());
            const bindingKey = sanitizeProgramSectionKey(col.bindingKey, String(fallbackCol?.bindingKey || '').trim());
            const fieldId = sanitizeProgramSectionKey(col.fieldId, String(fallbackCol?.fieldId || colKey).trim() || colKey);
            const fieldIdentity = inferFieldIdentity(
              {
                fieldIdentity: String(col.fieldIdentity ?? fallbackCol?.fieldIdentity ?? '').trim() || undefined,
                key: colKey,
                semanticKey,
                bindingKey,
              },
              String(fallbackCol?.fieldIdentity || fieldId || colKey).trim() || fieldId || colKey,
            );
            const requestedSourceType = String(
              col.sourceType || fallbackCol?.sourceType || inferFieldSourceType(valueSource, toBoolean(col.readOnly, Boolean(fallbackCol?.readOnly))),
            )
              .trim()
              .toUpperCase();
            const sourceType = TEACHING_RESOURCE_FIELD_SOURCE_TYPES.includes(
              requestedSourceType as (typeof TEACHING_RESOURCE_FIELD_SOURCE_TYPES)[number],
            )
              ? (requestedSourceType as TeachingResourceFieldSourceType)
              : inferFieldSourceType(valueSource, toBoolean(col.readOnly, Boolean(fallbackCol?.readOnly)));
            const requestedTeacherEditMode = String(
              col.teacherEditMode || fallbackCol?.teacherEditMode || inferTeacherEditMode({
                readOnly: toBoolean(col.readOnly, Boolean(fallbackCol?.readOnly)),
                valueSource,
              }),
            )
              .trim()
              .toUpperCase();
            const teacherEditMode = TEACHING_RESOURCE_TEACHER_EDIT_MODES.includes(
              requestedTeacherEditMode as (typeof TEACHING_RESOURCE_TEACHER_EDIT_MODES)[number],
            )
              ? (requestedTeacherEditMode as TeachingResourceTeacherEditMode)
              : inferTeacherEditMode({
                  readOnly: toBoolean(col.readOnly, Boolean(fallbackCol?.readOnly)),
                  valueSource,
                });
            const binding = sanitizeFieldBinding(col.binding, fallbackCol?.binding, sourceType, valueSource);

            colAcc.push({
              key: colKey,
              label: colLabel,
              placeholder: String(col.placeholder || fallbackCol?.placeholder || '').trim() || undefined,
              multiline: toBoolean(col.multiline, Boolean(fallbackCol?.multiline) || dataType === 'TEXTAREA'),
              dataType,
              semanticKey: semanticKey || undefined,
              bindingKey: bindingKey || undefined,
              valueSource,
              required: toBoolean(col.required, Boolean(fallbackCol?.required)),
              readOnly: toBoolean(col.readOnly, Boolean(fallbackCol?.readOnly)),
              options: options && options.length > 0 ? options : undefined,
              fieldId,
              fieldIdentity: fieldIdentity || undefined,
              sourceType,
              binding,
              teacherEditMode,
              exposeAsReference: toBoolean(col.exposeAsReference, Boolean(fallbackCol?.exposeAsReference)) || undefined,
              isCoreField:
                toBoolean(
                  col.isCoreField,
                  Boolean(fallbackCol?.isCoreField) || Boolean(valueSource && valueSource !== 'MANUAL') || Boolean(binding),
                ) || undefined,
            });
            return colAcc;
          }, [])
        : undefined;

    const prefillRowsInput = Array.isArray(row.prefillRows) ? row.prefillRows : [];
    const prefillRows =
      editorType === 'TABLE'
        ? prefillRowsInput
            .map((rawRow) => {
              if (!rawRow || typeof rawRow !== 'object') return null;
              const normalizedRow = Object.entries(rawRow as Record<string, unknown>).reduce<Record<string, string>>(
                (acc, [key, value]) => {
                  const normalizedKey = String(key || '').trim();
                  if (!normalizedKey) return acc;
                  acc[normalizedKey] = String(value ?? '').trim();
                  return acc;
                },
                {},
              );
              return Object.keys(normalizedRow).length ? normalizedRow : null;
            })
            .filter((rowItem): rowItem is Record<string, string> => Boolean(rowItem))
        : undefined;

    const resolvedColumns =
      editorType === 'TABLE'
        ? columns && columns.length > 0
          ? columns
          : fallbackSection?.columns && fallbackSection.columns.length > 0
            ? fallbackSection.columns
            : [
                { key: 'item', label: 'Item' },
                { key: 'nilai', label: 'Nilai', multiline: true },
              ]
        : undefined;

    const sanitizedSection: TeachingResourceSectionSchema = {
      key,
      label,
      description: String(row.description || fallbackSection?.description || '').trim() || undefined,
      repeatable: toBoolean(row.repeatable, Boolean(fallbackSection?.repeatable)),
      defaultRows: Math.max(1, toNumber(row.defaultRows, fallbackSection?.defaultRows || 1)),
      editorType,
      columns: resolvedColumns,
      prefillRows:
        editorType === 'TABLE'
          ? (prefillRows && prefillRows.length > 0
              ? prefillRows
              : Array.isArray(fallbackSection?.prefillRows)
                ? fallbackSection.prefillRows
                : undefined)
          : undefined,
      sectionTitleEditable: toBoolean(
        row.sectionTitleEditable,
        editorType === 'TABLE' ? Boolean(fallbackSection?.sectionTitleEditable) : true,
      ),
      titlePlaceholder: String(row.titlePlaceholder || fallbackSection?.titlePlaceholder || '').trim() || undefined,
      bodyPlaceholder: String(row.bodyPlaceholder || fallbackSection?.bodyPlaceholder || '').trim() || undefined,
      blockId: sanitizeProgramSectionKey(row.blockId, String(fallbackSection?.blockId || key).trim() || key),
      blockType,
      layout,
      visibilityRules: sanitizeVisibilityRules(row.visibilityRules) || fallbackSection?.visibilityRules,
      teacherRules: sanitizeTeacherRules(row.teacherRules) || fallbackSection?.teacherRules,
    };
    acc.push(sanitizedSection);
    return acc;
  }, []);

  const requestedSchemaMode = String(input.schemaMode || safeFallback.schemaMode || 'BLOCKS_V1')
    .trim()
    .toUpperCase();
  const schemaMode = TEACHING_RESOURCE_SCHEMA_MODES.includes(
    requestedSchemaMode as (typeof TEACHING_RESOURCE_SCHEMA_MODES)[number],
  )
    ? (requestedSchemaMode as TeachingResourceSchemaMode)
    : 'BLOCKS_V1';

  return {
    version: Math.max(1, toNumber(input.version, safeFallback.version || 1)),
    sourceSheet: String(input.sourceSheet || safeFallback.sourceSheet || '').trim() || undefined,
    intro: String(input.intro || safeFallback.intro || '').trim() || safeFallback.intro,
    titleHint: String(input.titleHint || safeFallback.titleHint || '').trim() || undefined,
    summaryHint: String(input.summaryHint || safeFallback.summaryHint || '').trim() || undefined,
    schemaMode,
    documentTitle:
      String(input.documentTitle || safeFallback.documentTitle || input.titleHint || safeFallback.titleHint || '')
        .trim() || undefined,
    documentShortTitle: String(input.documentShortTitle || safeFallback.documentShortTitle || '').trim() || undefined,
    teacherRules: sanitizeTeacherRules(input.teacherRules) || safeFallback.teacherRules,
    printRules: sanitizePrintRules(input.printRules) || safeFallback.printRules,
    sections: sanitizedSections.length ? sanitizedSections : safeFallback.sections,
  };
}

function shouldBackfillProgramSchema(raw: unknown, defaults?: TeachingResourceProgramDefinition): boolean {
  if (!defaults) return false;
  if (!raw || typeof raw !== 'object') return true;
  const input = raw as { sections?: unknown; sourceSheet?: unknown; version?: unknown };
  const sections = Array.isArray(input.sections) ? input.sections : [];
  if (sections.length === 0) return true;

  const keys = sections
    .map((section) => (section && typeof section === 'object' ? String((section as { key?: unknown }).key || '') : ''))
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);

  if (keys.length === 0) return true;
  // Legacy generic schema from tahap awal (single "bagian_utama")
  if (keys.length === 1 && keys[0] === 'bagian_utama') return true;

  return false;
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  raw.forEach((value) => {
    const tag = String(value || '').trim();
    if (!tag) return;
    const normalized = tag.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(tag);
  });
  return result.slice(0, 12);
}

function sanitizeEntryStatus(raw: unknown, fallback: TeachingResourceEntryStatus): TeachingResourceEntryStatus {
  const status = String(raw || '').trim().toUpperCase() as TeachingResourceEntryStatus;
  if (TEACHING_RESOURCE_ENTRY_STATUSES.includes(status)) return status;
  return fallback;
}

function toReferenceEntrySections(
  content: Prisma.JsonValue | TeachingResourceEntryContent | null,
  sourceProgram?: TeachingResourceProgramPayload,
) {
  const rawContent = content && typeof content === 'object' ? (content as TeachingResourceEntryContent) : {};
  const rawSections = Array.isArray(rawContent.sections) ? rawContent.sections : [];
  const schemaMap = new Map<string, TeachingResourceSectionSchema>();
  (sourceProgram?.schema?.sections || []).forEach((section) => {
    schemaMap.set(String(section.key || '').trim(), section);
  });

  return rawSections
    .map((section) => {
      if (!section || typeof section !== 'object') return null;
      const schemaKey = String(section.schemaKey || '').trim();
      const schema = schemaMap.get(schemaKey);
      const rawColumns = Array.isArray(section.columns) && section.columns.length > 0 ? section.columns : schema?.columns || [];
      const columns = rawColumns
        .map((column) => (column && typeof column === 'object' ? (column as Partial<TeachingResourceColumnSchema>) : null))
        .filter((column): column is Partial<TeachingResourceColumnSchema> => Boolean(column));
      const rows = Array.isArray(section.rows)
        ? section.rows
            .map((row) => {
              if (!row || typeof row !== 'object') return null;
              const normalizedRow: Record<string, string> = {};
              Object.entries(row as Record<string, unknown>).forEach(([key, value]) => {
                const rowKey = String(key || '').trim();
                if (!rowKey) return;
                normalizedRow[rowKey] = String(value ?? '').trim();
              });
              return normalizedRow;
            })
            .filter((row): row is Record<string, string> => Boolean(row))
        : [];
      return {
        schemaKey,
        title: String(section.title || '').trim(),
        columns,
        rows,
      };
    })
    .filter((section): section is NonNullable<typeof section> => Boolean(section));
}

function extractReferenceEntryContext(
  entry: { classLevel?: string | null; content: Prisma.JsonValue },
  sourceProgram?: TeachingResourceProgramPayload,
) {
  const contextSection = toReferenceEntrySections(entry.content, sourceProgram).find((section) => {
    const key = String(section.schemaKey || '').toLowerCase();
    const title = String(section.title || '').toLowerCase();
    return key.includes('konteks') || title.includes('konteks');
  });
  const firstRow = contextSection?.rows?.[0] || {};
  return {
    tingkat: String(firstRow.tingkat || entry.classLevel || '').trim(),
    programKeahlian: String(firstRow.program_keahlian || '').trim(),
    semester: String(firstRow.semester || '').trim(),
  };
}

function referenceEntryMatchesProjectionContext(
  entry: {
    subjectId?: number | null;
    classLevel?: string | null;
    content: Prisma.JsonValue;
  },
  sourceProgram: TeachingResourceProgramPayload | undefined,
  request: TeachingResourceReferenceProjectionRequest,
): boolean {
  const context = request.context;
  if (!context) return true;

  const shouldMatchSubject = Boolean(request.filterByContext) || Boolean(request.matchBySubject);
  const shouldMatchClassLevel = Boolean(request.filterByContext) || Boolean(request.matchByClassLevel);
  const shouldMatchMajor = Boolean(request.filterByContext) || Boolean(request.matchByMajor);
  const shouldMatchSemester = Boolean(request.matchByActiveSemester);
  const entryContext = extractReferenceEntryContext(entry, sourceProgram);
  const entryMajor = String(entryContext.programKeahlian || '').trim().toLowerCase();
  const entrySemester = String(entryContext.semester || '').trim().toLowerCase();

  if (shouldMatchSubject && Number(entry.subjectId || 0) !== Number(context.subjectId || 0)) return false;
  if (
    shouldMatchClassLevel &&
    normalizeClassLevelToken(entryContext.tingkat || entry.classLevel || '') !== normalizeClassLevelToken(context.classLevel)
  ) {
    return false;
  }
  if (shouldMatchMajor && entryMajor && entryMajor !== String(context.programKeahlian || '').trim().toLowerCase()) {
    return false;
  }
  if (shouldMatchSemester && entrySemester && entrySemester !== String(context.semester || '').trim().toLowerCase()) {
    return false;
  }
  return true;
}

function buildProjectedReferenceOptions(
  entry: {
    id: number;
    programCode: string;
    subjectId?: number | null;
    classLevel?: string | null;
    title: string;
    content: Prisma.JsonValue;
  },
  sourceProgram: TeachingResourceProgramPayload | undefined,
  requests: TeachingResourceReferenceProjectionRequest[],
): TeachingResourceProjectedReferenceOption[] {
  const sourceProgramCode = normalizeProgramCode(entry.programCode);
  const relevantRequests = requests.filter(
    (request) =>
      request.sourceProgramCode === sourceProgramCode &&
      referenceEntryMatchesProjectionContext(entry, sourceProgram, request),
  );
  if (relevantRequests.length === 0) return [];

  const sections = toReferenceEntrySections(entry.content, sourceProgram);
  const options: TeachingResourceProjectedReferenceOption[] = [];

  sections.forEach((section) => {
    section.rows.forEach((row) => {
      const snapshot = buildReferenceSnapshotFromRow(section.columns, row);
      section.columns.forEach((column) => {
        const columnKey = String(column.key || '').trim();
        if (!columnKey) return;
        const columnCandidates = extractReferenceCandidatesFromColumn(column);
        if (columnCandidates.length === 0) return;
        const rawValue = String(row[columnKey] || '').trim();
        if (!isMeaningfulReferenceValue(rawValue)) return;
        const valueLines = splitReferenceCellLines(rawValue)
          .map((line) => line.trim())
          .filter(isMeaningfulReferenceValue);
        const lineOptions =
          valueLines.length > 1
            ? valueLines.map((value, lineIndex) => ({
                value,
                snapshot: buildReferenceSnapshotFromRowLine(section.columns, row, lineIndex),
                selectValue: `${entry.id}::${columnKey}::${lineIndex + 1}::${value}`,
              }))
            : [
                {
                  value: rawValue,
                  snapshot,
                  selectValue: `${entry.id}::${columnKey}::${rawValue}`,
                },
              ];

        relevantRequests.forEach((request) => {
          if (!columnCandidates.some((candidate) => request.candidates.includes(candidate))) return;
          lineOptions.forEach((lineOption) => {
            const label =
              entry.title && entry.title.trim() && entry.title.trim() !== lineOption.value
                ? `${lineOption.value} - ${entry.title}`
                : lineOption.value;
            options.push({
              requestKey: request.requestKey,
              selectValue: lineOption.selectValue,
              value: lineOption.value,
              label,
              sourceProgramCode,
              sourceEntryId: Number(entry.id),
              sourceEntryTitle: String(entry.title || '').trim() || undefined,
              sourceFieldKey: columnKey,
              sourceFieldIdentity: String(column.fieldIdentity || '').trim() || undefined,
              snapshot: lineOption.snapshot,
            });
          });
        });
      });
    });
  });

  return options;
}

function sanitizeEntryContent(raw: unknown): TeachingResourceEntryContent {
  if (!raw || typeof raw !== 'object') {
    const textValue = String(raw || '').trim();
    return { sections: textValue ? [{ title: 'Catatan', body: textValue }] : [] };
  }

  const normalized = raw as TeachingResourceEntryContent;
  const sections = Array.isArray(normalized.sections)
    ? normalized.sections
        .map((section) => {
          const columns = Array.isArray(section?.columns)
            ? section.columns.reduce<
                Array<{
                  key: string;
                  label: string;
                  placeholder?: string;
                  multiline: boolean;
                  dataType?: TeachingResourceColumnDataType;
                  semanticKey?: string;
                  bindingKey?: string;
                  valueSource?: TeachingResourceColumnValueSource;
                  required?: boolean;
                  readOnly?: boolean;
                  options?: string[];
                  fieldId?: string;
                  fieldIdentity?: string;
                  sourceType?: TeachingResourceFieldSourceType;
                  binding?: TeachingResourceFieldBinding;
                  teacherEditMode?: TeachingResourceTeacherEditMode;
                  exposeAsReference?: boolean;
                  isCoreField?: boolean;
                }>
              >((acc, column) => {
                if (!column || typeof column !== 'object') return acc;
                const normalizedColumn = column as {
                  key?: unknown;
                  label?: unknown;
                  placeholder?: unknown;
                  multiline?: unknown;
                  dataType?: unknown;
                  semanticKey?: unknown;
                  bindingKey?: unknown;
                  valueSource?: unknown;
                  required?: unknown;
                  readOnly?: unknown;
                  options?: unknown;
                  fieldId?: unknown;
                  fieldIdentity?: unknown;
                  sourceType?: unknown;
                  binding?: unknown;
                  teacherEditMode?: unknown;
                  exposeAsReference?: unknown;
                  isCoreField?: unknown;
                };
                const key = String(normalizedColumn.key || '').trim();
                const label = String(normalizedColumn.label || '').trim();
                if (!key || !label) return acc;
                const placeholder = String(normalizedColumn.placeholder || '').trim();
                const requestedDataType = String(normalizedColumn.dataType || '').trim().toUpperCase();
                const requestedValueSource = String(normalizedColumn.valueSource || '').trim().toUpperCase();
                const options = Array.isArray(normalizedColumn.options)
                  ? normalizedColumn.options.map((option) => String(option || '').trim()).filter(Boolean)
                  : undefined;
                const inferredSourceType = inferFieldSourceType(
                  TEACHING_RESOURCE_COLUMN_VALUE_SOURCES.includes(
                    requestedValueSource as (typeof TEACHING_RESOURCE_COLUMN_VALUE_SOURCES)[number],
                  )
                    ? (requestedValueSource as TeachingResourceColumnValueSource)
                    : undefined,
                  toBoolean(normalizedColumn.readOnly, false),
                );
                const sourceTypeRaw = String(normalizedColumn.sourceType || '').trim().toUpperCase();
                const sourceType = TEACHING_RESOURCE_FIELD_SOURCE_TYPES.includes(
                  sourceTypeRaw as (typeof TEACHING_RESOURCE_FIELD_SOURCE_TYPES)[number],
                )
                  ? (sourceTypeRaw as TeachingResourceFieldSourceType)
                  : inferredSourceType;
                const valueSource = TEACHING_RESOURCE_COLUMN_VALUE_SOURCES.includes(
                  requestedValueSource as (typeof TEACHING_RESOURCE_COLUMN_VALUE_SOURCES)[number],
                )
                  ? (requestedValueSource as (typeof TEACHING_RESOURCE_COLUMN_VALUE_SOURCES)[number])
                  : undefined;
                const teacherEditModeRaw = String(normalizedColumn.teacherEditMode || '').trim().toUpperCase();
                const teacherEditMode = TEACHING_RESOURCE_TEACHER_EDIT_MODES.includes(
                  teacherEditModeRaw as (typeof TEACHING_RESOURCE_TEACHER_EDIT_MODES)[number],
                )
                  ? (teacherEditModeRaw as TeachingResourceTeacherEditMode)
                  : inferTeacherEditMode({
                      readOnly: toBoolean(normalizedColumn.readOnly, false),
                      valueSource,
                    });
                const binding = sanitizeFieldBinding(normalizedColumn.binding, undefined, sourceType, valueSource);
                acc.push({
                  key,
                  label,
                  placeholder: placeholder || undefined,
                  multiline: toBoolean(normalizedColumn.multiline, false),
                  dataType: TEACHING_RESOURCE_COLUMN_DATA_TYPES.includes(
                    requestedDataType as (typeof TEACHING_RESOURCE_COLUMN_DATA_TYPES)[number],
                  )
                    ? (requestedDataType as (typeof TEACHING_RESOURCE_COLUMN_DATA_TYPES)[number])
                    : undefined,
                  semanticKey: String(normalizedColumn.semanticKey || '').trim() || undefined,
                  bindingKey: String(normalizedColumn.bindingKey || '').trim() || undefined,
                  valueSource,
                  required: toBoolean(normalizedColumn.required, false) || undefined,
                  readOnly: toBoolean(normalizedColumn.readOnly, false) || undefined,
                  options: options && options.length > 0 ? options : undefined,
                  fieldId: sanitizeProgramSectionKey(normalizedColumn.fieldId, key) || undefined,
                  fieldIdentity: inferFieldIdentity(
                    {
                      fieldIdentity: String(normalizedColumn.fieldIdentity || '').trim() || undefined,
                      semanticKey: String(normalizedColumn.semanticKey || '').trim() || undefined,
                      bindingKey: String(normalizedColumn.bindingKey || '').trim() || undefined,
                      key,
                    },
                    key,
                  ),
                  sourceType,
                  binding,
                  teacherEditMode,
                  exposeAsReference: toBoolean(normalizedColumn.exposeAsReference, false) || undefined,
                  isCoreField:
                    toBoolean(
                      normalizedColumn.isCoreField,
                      Boolean(valueSource && valueSource !== 'MANUAL') || Boolean(binding),
                    ) || undefined,
                });
                return acc;
              }, [])
            : [];
          const rows = Array.isArray(section?.rows)
            ? section.rows
                .map((row) => {
                  if (!row || typeof row !== 'object') return null;
                  const normalizedRow: Record<string, string> = {};
                  Object.entries(row as Record<string, unknown>).forEach(([key, value]) => {
                    const rowKey = String(key || '').trim();
                    if (!rowKey) return;
                    normalizedRow[rowKey] = String(value ?? '').trim();
                  });
                  return Object.keys(normalizedRow).length ? normalizedRow : null;
                })
                .filter((row): row is Record<string, string> => Boolean(row))
            : [];

          return {
            schemaKey: String(section?.schemaKey || '').trim() || undefined,
            title: String(section?.title || '').trim(),
            body: String(section?.body || '').trim(),
            columns: columns.length > 0 ? columns : undefined,
            rows,
          };
        })
        .filter(
          (section) =>
            section.title ||
            section.body ||
            (Array.isArray(section.columns) && section.columns.length > 0) ||
            (Array.isArray(section.rows) && section.rows.some((row) => Object.values(row).some((value) => value))),
        )
    : [];
  const references = Array.isArray(normalized.references)
    ? normalized.references.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const notes = String(normalized.notes || '').trim();

  return {
    ...normalized,
    sections,
    references,
    notes: notes || undefined,
  };
}

function toJsonValue(value: TeachingResourceEntryContent): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toProgramSchemaJsonValue(value: TeachingResourceProgramSchema): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function normalizeClassLevelToken(raw: unknown): string {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return '';
  if (value === 'X' || value === '10') return 'X';
  if (value === 'XI' || value === '11') return 'XI';
  if (value === 'XII' || value === '12') return 'XII';

  const numericMatch = value.match(/\b(10|11|12)\b/);
  if (numericMatch) {
    if (numericMatch[1] === '10') return 'X';
    if (numericMatch[1] === '11') return 'XI';
    if (numericMatch[1] === '12') return 'XII';
  }

  const romanMatch = value.match(/\b(XII|XI|X)\b/);
  if (romanMatch) return romanMatch[1];

  return value;
}

function getDefaultsByCode() {
  const map = new Map<string, TeachingResourceProgramDefinition>();
  DEFAULT_TEACHING_RESOURCE_PROGRAMS.forEach((item) => {
    map.set(item.code, item);
  });
  return map;
}

function buildProgramsCacheKey(params: {
  academicYearId: number;
  roleContext: RoleContext;
  includeInactive: boolean;
  authRole: string;
  authUserId: number;
}): string {
  return [
    params.academicYearId,
    params.roleContext,
    params.includeInactive ? 'incl-inactive' : 'active-only',
    params.authRole || 'UNKNOWN',
    params.authUserId || 0,
  ].join(':');
}

function getProgramsCache(key: string): unknown | null {
  const now = Date.now();
  const cached = programsResponseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    programsResponseCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setProgramsCache(key: string, payload: unknown) {
  programsResponseCache.set(key, {
    payload,
    expiresAt: Date.now() + PROGRAMS_CACHE_TTL_MS,
  });
}

function invalidateProgramsCache(academicYearId?: number) {
  if (!academicYearId) {
    programsResponseCache.clear();
    return;
  }
  const prefix = `${academicYearId}:`;
  for (const key of programsResponseCache.keys()) {
    if (key.startsWith(prefix)) programsResponseCache.delete(key);
  }
}

async function resolveAcademicYearId(rawAcademicYearId: unknown): Promise<number> {
  const explicitId = Number(rawAcademicYearId);
  if (Number.isFinite(explicitId) && explicitId > 0) {
    const exists = await prisma.academicYear.findUnique({
      where: { id: explicitId },
      select: { id: true },
    });
    if (!exists) {
      throw new ApiError(404, 'Tahun ajaran tidak ditemukan.');
    }
    return explicitId;
  }

  const active = await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  if (!active) {
    throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan.');
  }

  return active.id;
}

async function assertCanManageProgramConfig(user: { id: number; role: string }) {
  if (user.role === 'ADMIN') return;

  if (user.role !== 'TEACHER') {
    throw new ApiError(403, 'Hanya Admin atau Wakasek Kurikulum yang dapat mengubah konfigurasi perangkat ajar.');
  }

  const actor = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { additionalDuties: true },
  });

  const duties = (actor?.additionalDuties || []).map((duty) => String(duty || '').trim().toUpperCase());
  const canManage = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');

  if (!canManage) {
    throw new ApiError(403, 'Akses ditolak. Fitur ini khusus Admin/Wakasek Kurikulum.');
  }
}

async function assertCanReviewTeachingResourceEntries(user: { id: number; role: string }) {
  if (user.role === 'ADMIN' || user.role === 'PRINCIPAL') return;

  if (user.role !== 'TEACHER') {
    throw new ApiError(403, 'Hanya Admin, Principal, atau Kurikulum yang dapat me-review perangkat ajar.');
  }

  const actor = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { additionalDuties: true },
  });

  const duties = (actor?.additionalDuties || []).map((duty) => String(duty || '').trim().toUpperCase());
  const canReview = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');

  if (!canReview) {
    throw new ApiError(403, 'Akses ditolak. Fitur review perangkat ajar khusus Kurikulum/Admin/Principal.');
  }
}

function mapPrograms(
  rows: Array<{
    id: number;
    code: string;
    displayLabel: string;
    shortLabel: string | null;
    description: string | null;
    displayOrder: number;
    isActive: boolean;
    showOnTeacherMenu: boolean;
    targetClassLevels: string[];
    schema: Prisma.JsonValue | null;
  }>,
): TeachingResourceProgramPayload[] {
  const defaultsByCode = getDefaultsByCode();
  const mergedByCode = new Map<string, TeachingResourceProgramPayload>();

  rows.forEach((row) => {
    const normalizedCode = normalizeProgramCode(row.code);
    if (!normalizedCode) return;
    const defaults = defaultsByCode.get(normalizedCode);
    mergedByCode.set(normalizedCode, {
      id: row.id,
      code: normalizedCode,
      label: String(row.displayLabel || defaults?.label || normalizedCode.replace(/_/g, ' ')).trim(),
      shortLabel: String(row.shortLabel || defaults?.shortLabel || normalizedCode).trim(),
      description: String(row.description || defaults?.description || '').trim(),
      order: Number.isFinite(row.displayOrder) ? row.displayOrder : defaults?.order || 0,
      isActive: row.isActive,
      showOnTeacherMenu: row.showOnTeacherMenu,
      targetClassLevels: Array.isArray(row.targetClassLevels)
        ? row.targetClassLevels.map((level) => String(level || '').trim().toUpperCase()).filter(Boolean)
        : defaults?.targetClassLevels || [],
      source: 'custom',
      schema: sanitizeProgramSchema(row.schema, defaults?.schema || GENERIC_PROGRAM_SCHEMA),
    });
  });

  const programs = Array.from(mergedByCode.values()).sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.label || '').localeCompare(String(b.label || '')),
  );
  return normalizeProgramReferenceSchemas(programs);
}

async function loadPrograms(academicYearId: number): Promise<TeachingResourceProgramPayload[]> {
  let rows = await prisma.teachingResourceProgramConfig.findMany({
    where: { academicYearId },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      displayLabel: true,
      shortLabel: true,
      description: true,
      displayOrder: true,
      isActive: true,
      showOnTeacherMenu: true,
      targetClassLevels: true,
      schema: true,
    },
  });

  const defaultsByCode = getDefaultsByCode();
  const backfillUpdates = rows
    .map((row) => {
      const defaults = defaultsByCode.get(normalizeProgramCode(row.code));
      if (!defaults) return null;
      if (!shouldBackfillProgramSchema(row.schema, defaults)) return null;
      return {
        id: row.id,
        schema: defaults.schema,
      };
    })
    .filter((item): item is { id: number; schema: TeachingResourceProgramSchema } => Boolean(item));

  if (backfillUpdates.length > 0) {
    await prisma.$transaction(
      backfillUpdates.map((item) =>
        prisma.teachingResourceProgramConfig.update({
          where: { id: item.id },
          data: {
            schema: toProgramSchemaJsonValue(item.schema),
          },
        }),
      ),
    );

    backfillUpdates.forEach((item) => {
      const target = rows.find((row) => row.id === item.id);
      if (target) {
        target.schema = toProgramSchemaJsonValue(item.schema) as Prisma.JsonValue;
      }
    });
  }

  return mapPrograms(rows);
}

async function resolveTeacherProgramScope(userId: number, academicYearId: number): Promise<TeacherProgramScope> {
  const teacher = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      additionalDuties: true,
      teacherAssignments: {
        where: { academicYearId: Number(academicYearId) },
        select: {
          class: {
            select: { level: true },
          },
        },
      },
    },
  });

  const duties = (teacher?.additionalDuties || []).map((duty) => String(duty || '').trim().toUpperCase());
  const privileged =
    duties.includes('WAKASEK_KURIKULUM') ||
    duties.includes('SEKRETARIS_KURIKULUM') ||
    duties.includes('ADMIN');

  const classLevels = new Set<string>(
    (teacher?.teacherAssignments || [])
      .map((assignment: { class?: { level?: string | null } | null }) =>
        normalizeClassLevelToken(assignment?.class?.level),
      )
      .filter(Boolean),
  );

  if (privileged || classLevels.size === 0) {
    return { includeAll: true, classLevels };
  }

  return { includeAll: false, classLevels };
}

function filterPrograms(
  programs: TeachingResourceProgramPayload[],
  roleContext: RoleContext,
  includeInactive: boolean,
  teacherScope: TeacherProgramScope | null = null,
) {
  return programs.filter((program) => {
    if (!includeInactive && !program.isActive) return false;
    if (roleContext === 'teacher') {
      if (!program.showOnTeacherMenu) return false;
      if (!teacherScope || teacherScope.includeAll) return true;

      const targetLevels = (Array.isArray(program.targetClassLevels) ? program.targetClassLevels : [])
        .map((level) => normalizeClassLevelToken(level))
        .filter(Boolean);
      if (targetLevels.length === 0) return true;

      return targetLevels.some((level) => teacherScope.classLevels.has(level));
    }
    return true;
  });
}

export const getTeachingResourcePrograms = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  const academicYearId = await resolveAcademicYearId(req.query?.academicYearId);
  const roleContext = normalizeRoleContext(req.query?.roleContext);
  const includeInactive = toBoolean(req.query?.includeInactive, false);
  const authRole = String(user?.role || '').toUpperCase();
  const authUserId = Number(user?.id || 0);
  const cacheKey = buildProgramsCacheKey({
    academicYearId,
    roleContext,
    includeInactive,
    authRole,
    authUserId,
  });
  const shouldUseCache = false;
  const cachedPayload = shouldUseCache ? getProgramsCache(cacheKey) : null;
  if (cachedPayload) {
    return res
      .status(200)
      .json(new ApiResponse(200, cachedPayload, 'Konfigurasi program perangkat ajar berhasil dimuat.'));
  }

  const programs = await loadPrograms(academicYearId);
  const teacherScope =
    roleContext === 'teacher' && authRole === 'TEACHER' && authUserId > 0
      ? await resolveTeacherProgramScope(authUserId, academicYearId)
      : null;
  const payload = {
    academicYearId,
    roleContext,
    programs: filterPrograms(programs, roleContext, includeInactive, teacherScope),
  };
  if (shouldUseCache) {
    setProgramsCache(cacheKey, payload);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, payload, 'Konfigurasi program perangkat ajar berhasil dimuat.'));
});

export const getTeachingResourceSignatureDefaults = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const academicYearId = await resolveAcademicYearId(req.query?.academicYearId);
  const principal = await prisma.user.findFirst({
    where: {
      role: 'PRINCIPAL',
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      name: true,
      nip: true,
      nuptk: true,
    },
  });

  const curriculum =
    (await prisma.user.findFirst({
      where: {
        role: 'TEACHER',
        additionalDuties: {
          has: 'WAKASEK_KURIKULUM',
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        name: true,
        nip: true,
        nuptk: true,
      },
    })) ||
    (await prisma.user.findFirst({
      where: {
        role: 'TEACHER',
        additionalDuties: {
          has: 'SEKRETARIS_KURIKULUM',
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        name: true,
        nip: true,
        nuptk: true,
      },
    }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        curriculum: {
          id: Number(curriculum?.id || 0) || null,
          roleTitle: 'Wakasek Kurikulum',
          name: String(curriculum?.name || '').trim(),
          identityNumber: String(curriculum?.nip || curriculum?.nuptk || '').trim(),
        },
        principal: {
          id: Number(principal?.id || 0) || null,
          roleTitle: 'Kepala Sekolah',
          name: String(principal?.name || '').trim(),
          identityNumber: String(principal?.nip || principal?.nuptk || '').trim(),
        },
        teacher: {
          roleTitle: 'Guru Mata Pelajaran',
        },
      },
      'Default pengesahan dokumen berhasil dimuat.',
    ),
  );
});

export const upsertTeachingResourcePrograms = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCanManageProgramConfig({ id: Number(user.id), role: String(user.role) });

  const academicYearId = await resolveAcademicYearId(req.body?.academicYearId);
  const inputPrograms = Array.isArray(req.body?.programs) ? req.body.programs : [];
  if (inputPrograms.length === 0) {
    throw new ApiError(400, 'Daftar program perangkat ajar wajib diisi.');
  }

  const defaultsByCode = getDefaultsByCode();
  const normalizedPrograms: UpsertTeachingResourceProgramInput[] = inputPrograms.map((raw: any, index: number) => {
    const code = normalizeProgramCode(raw?.code);
    if (!code) {
      throw new ApiError(400, `Kode program pada baris ${index + 1} wajib diisi.`);
    }

    const defaults = defaultsByCode.get(code);
    const label = String(raw?.label || defaults?.label || code.replace(/_/g, ' ')).trim();
    if (!label) {
      throw new ApiError(400, `Label program pada baris ${index + 1} wajib diisi.`);
    }

    return {
      code,
      displayLabel: label,
      shortLabel: String(raw?.shortLabel || defaults?.shortLabel || code).trim() || null,
      description: String(raw?.description || defaults?.description || '').trim() || null,
      displayOrder: toNumber(raw?.order, defaults?.order ?? index * 10),
      isActive: toBoolean(raw?.isActive, defaults?.isActive ?? true),
      showOnTeacherMenu: toBoolean(raw?.showOnTeacherMenu, defaults?.showOnTeacherMenu ?? true),
      targetClassLevels: sanitizeTargetClassLevels(raw?.targetClassLevels),
      schema: sanitizeProgramSchema(raw?.schema, defaults?.schema || GENERIC_PROGRAM_SCHEMA),
    };
  });

  const seenCodes = new Set<string>();
  normalizedPrograms.forEach((program) => {
    if (seenCodes.has(program.code)) {
      throw new ApiError(400, `Kode program perangkat ajar duplikat: ${program.code}`);
    }
    seenCodes.add(program.code);
  });

  const existingPrograms = await prisma.teachingResourceProgramConfig.findMany({
    where: { academicYearId },
    select: { code: true },
  });

  const submittedCodes = new Set(normalizedPrograms.map((program) => program.code));
  const removableCodes = existingPrograms
    .map((program) => normalizeProgramCode(program.code))
    .filter((code): code is string => Boolean(code))
    .filter((code) => !submittedCodes.has(code));

  await prisma.$transaction([
    ...(removableCodes.length > 0
      ? [
          prisma.teachingResourceProgramConfig.deleteMany({
            where: {
              academicYearId,
              code: {
                in: removableCodes,
              },
            },
          }),
        ]
      : []),
    ...normalizedPrograms.map((program) =>
      prisma.teachingResourceProgramConfig.upsert({
        where: {
          academicYearId_code: {
            academicYearId,
            code: program.code,
          },
        },
        update: {
          displayLabel: program.displayLabel,
          shortLabel: program.shortLabel,
          description: program.description,
          displayOrder: program.displayOrder,
          isActive: program.isActive,
          showOnTeacherMenu: program.showOnTeacherMenu,
          targetClassLevels: program.targetClassLevels,
          schema: toProgramSchemaJsonValue(program.schema),
        },
        create: {
          academicYearId,
          code: program.code,
          displayLabel: program.displayLabel,
          shortLabel: program.shortLabel,
          description: program.description,
          displayOrder: program.displayOrder,
          isActive: program.isActive,
          showOnTeacherMenu: program.showOnTeacherMenu,
          targetClassLevels: program.targetClassLevels,
          schema: toProgramSchemaJsonValue(program.schema),
        },
      }),
    ),
  ]);

  invalidateProgramsCache(academicYearId);
  const programs = await loadPrograms(academicYearId);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        programs,
      },
      'Konfigurasi program perangkat ajar berhasil diperbarui.',
    ),
  );
});

export const deleteTeachingResourceProgram = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCanManageProgramConfig({ id: Number(user.id), role: String(user.role) });

  const programId = toNumber(req.params?.id, 0);
  if (!programId || programId <= 0) {
    throw new ApiError(400, 'Program perangkat ajar tidak valid.');
  }

  const academicYearId = await resolveAcademicYearId(req.query?.academicYearId ?? req.body?.academicYearId);
  const program = await prisma.teachingResourceProgramConfig.findFirst({
    where: {
      id: programId,
      academicYearId,
    },
    select: {
      id: true,
      code: true,
      displayLabel: true,
    },
  });

  if (!program) {
    throw new ApiError(404, 'Program perangkat ajar tidak ditemukan.');
  }

  const normalizedCode = normalizeProgramCode(program.code);
  const cascadeEntries = toBoolean(req.query?.cascadeEntries ?? req.body?.cascadeEntries, false);

  const relatedEntriesCount = await prisma.teachingResourceEntry.count({
    where: {
      academicYearId,
      programCode: normalizedCode,
    },
  });
  if (relatedEntriesCount > 0 && !cascadeEntries) {
    throw new ApiError(
      400,
      `Program ${program.displayLabel} tidak dapat dihapus karena sudah memiliki ${relatedEntriesCount} dokumen.`,
    );
  }

  await prisma.$transaction([
    ...(relatedEntriesCount > 0
      ? [
          prisma.teachingResourceEntry.deleteMany({
            where: {
              academicYearId,
              programCode: normalizedCode,
            },
          }),
        ]
      : []),
    prisma.teachingResourceProgramConfig.delete({
      where: {
        id: program.id,
      },
    }),
  ]);

  invalidateProgramsCache(academicYearId);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        id: program.id,
        code: normalizedCode,
        academicYearId,
        deletedEntries: relatedEntriesCount,
      },
      'Program perangkat ajar berhasil dihapus.',
    ),
  );
});

export const getTeachingResourceEntries = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const page = Math.max(1, toNumber(req.query?.page, 1));
  const limit = Math.min(100, Math.max(1, toNumber(req.query?.limit, 20)));
  const skip = (page - 1) * limit;
  const academicYearId = await resolveAcademicYearId(req.query?.academicYearId);
  const viewMode = String(req.query?.view || 'mine').trim().toLowerCase();
  const search = String(req.query?.search || '').trim();
  const programCode = normalizeProgramCode(req.query?.programCode);
  const status = sanitizeEntryStatus(req.query?.status, 'DRAFT');
  const statusRaw = String(req.query?.status || '').trim();
  const selectedTeacherId = Number(req.query?.teacherId || 0);

  const where: Record<string, unknown> = {
    academicYearId,
  };

  if (programCode) where.programCode = programCode;
  if (statusRaw && statusRaw.toUpperCase() !== 'ALL') where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { summary: { contains: search, mode: 'insensitive' } },
      { className: { contains: search, mode: 'insensitive' } },
    ];
  }

  let canReview = false;
  try {
    await assertCanReviewTeachingResourceEntries({ id: Number(user.id), role: String(user.role) });
    canReview = true;
  } catch {
    canReview = false;
  }

  if (viewMode === 'review') {
    if (!canReview) {
      throw new ApiError(403, 'Akses review perangkat ajar ditolak.');
    }
    if (selectedTeacherId > 0) where.teacherId = selectedTeacherId;
  } else if (String(user.role).toUpperCase() === 'TEACHER') {
    where.teacherId = Number(user.id);
  } else if (selectedTeacherId > 0) {
    where.teacherId = selectedTeacherId;
  }

  const [total, rows, statusSummary, programSummary] = await Promise.all([
    prisma.teachingResourceEntry.count({ where }),
    prisma.teachingResourceEntry.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: {
        teacher: {
          select: { id: true, name: true, username: true },
        },
        reviewer: {
          select: { id: true, name: true, role: true },
        },
      },
    }),
    prisma.teachingResourceEntry.groupBy({
      by: ['status'],
      where: { academicYearId, ...(programCode ? { programCode } : {}) },
      _count: { _all: true },
    }),
    prisma.teachingResourceEntry.groupBy({
      by: ['programCode'],
      where: { academicYearId },
      _count: { _all: true },
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        canReview,
        rows,
        summary: {
          byStatus: statusSummary.map((item) => ({
            status: item.status,
            total: Number(item._count?._all || 0),
          })),
          byProgram: programSummary.map((item) => ({
            programCode: item.programCode,
            total: Number(item._count?._all || 0),
          })),
        },
      },
      'Data perangkat ajar berhasil dimuat.',
    ),
  );
});

export const getTeachingResourceReferenceEntries = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const academicYearId = await resolveAcademicYearId(req.query?.academicYearId);
  const rawProgramCodes = Array.isArray(req.query?.programCodes)
    ? req.query.programCodes.join(',')
    : String(req.query?.programCodes || '');
  const programCodes = Array.from(
    new Set(
      rawProgramCodes
        .split(',')
        .map((item) => normalizeProgramCode(item))
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const limitPerProgram = Math.min(300, Math.max(1, toNumber(req.query?.limitPerProgram, 200)));
  const search = String(req.query?.search || '').trim();
  const selectedTeacherId = Number(req.query?.teacherId || 0);
  const roleUpper = String(user.role).trim().toUpperCase();
  const referenceRequests = parseReferenceProjectionRequests(req.query?.referenceRequests);
  const includeRows = toBoolean(req.query?.includeRows, referenceRequests.length === 0);

  if (programCodes.length === 0) {
    throw new ApiError(400, 'Program sumber referensi wajib diisi.');
  }

  let canReview = false;
  try {
    await assertCanReviewTeachingResourceEntries({ id: Number(user.id), role: String(user.role) });
    canReview = true;
  } catch {
    canReview = false;
  }

  const teacherId =
    canReview && selectedTeacherId > 0
      ? selectedTeacherId
      : roleUpper === 'TEACHER'
        ? Number(user.id)
        : selectedTeacherId > 0
          ? selectedTeacherId
          : 0;

  const buildWhere = (programCode: string): Prisma.TeachingResourceEntryWhereInput => {
    const where: Prisma.TeachingResourceEntryWhereInput = {
      academicYearId,
      programCode,
    };
    if (teacherId > 0) where.teacherId = teacherId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { className: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  };

  const programMetaByCode =
    referenceRequests.length > 0
      ? new Map((await loadPrograms(academicYearId)).map((program) => [normalizeProgramCode(program.code), program]))
      : new Map<string, TeachingResourceProgramPayload>();

  const programs = await Promise.all(
    programCodes.map(async (programCode) => {
      const where = buildWhere(programCode);
      const [total, rows] = await Promise.all([
        prisma.teachingResourceEntry.count({ where }),
        prisma.teachingResourceEntry.findMany({
          where,
          take: limitPerProgram,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            academicYearId: true,
            teacherId: true,
            reviewerId: true,
            programCode: true,
            subjectId: true,
            classLevel: true,
            className: true,
            title: true,
            summary: true,
            content: true,
            tags: true,
            status: true,
            submittedAt: true,
            reviewedAt: true,
            reviewNote: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);
      const sourceProgram = programMetaByCode.get(programCode);
      const optionDedupe = new Set<string>();
      const options =
        referenceRequests.length > 0
          ? rows
              .flatMap((entry) =>
                buildProjectedReferenceOptions(
                  {
                    id: Number(entry.id),
                    programCode: String(entry.programCode || ''),
                    subjectId: Number(entry.subjectId || 0) || null,
                    classLevel: String(entry.classLevel || '').trim() || null,
                    title: String(entry.title || ''),
                    content: entry.content,
                  },
                  sourceProgram,
                  referenceRequests,
                ),
              )
              .filter((option) => {
                const token = `${option.requestKey}::${option.selectValue}`.toLowerCase();
                if (optionDedupe.has(token)) return false;
                optionDedupe.add(token);
                return true;
              })
          : [];

      return {
        programCode,
        total,
        limit: limitPerProgram,
        loaded: rows.length,
        rows: includeRows ? rows : [],
        options,
      };
    }),
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        limitPerProgram,
        teacherId: teacherId || null,
        programs,
      },
      'Data referensi perangkat ajar berhasil dimuat.',
    ),
  );
});

export const createTeachingResourceEntry = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const academicYearId = await resolveAcademicYearId(req.body?.academicYearId);
  const roleUpper = String(user.role).trim().toUpperCase();
  const teacherId = Number(req.body?.teacherId || user.id);
  const programCode = normalizeProgramCode(req.body?.programCode);
  const title = String(req.body?.title || '').trim();
  const summary = String(req.body?.summary || '').trim();
  const classLevel = normalizeClassLevelToken(req.body?.classLevel);
  const className = String(req.body?.className || '').trim();
  const subjectId = Number(req.body?.subjectId || 0);
  const content = sanitizeEntryContent(req.body?.content);
  const tags = sanitizeTags(req.body?.tags);

  if (!programCode) throw new ApiError(400, 'Program perangkat ajar wajib diisi.');
  if (!title) throw new ApiError(400, 'Judul perangkat ajar wajib diisi.');
  if (roleUpper === 'TEACHER' && teacherId !== Number(user.id)) {
    throw new ApiError(403, 'Guru hanya dapat membuat data milik sendiri.');
  }
  if (!['TEACHER', 'ADMIN', 'PRINCIPAL'].includes(roleUpper)) {
    throw new ApiError(403, 'Role Anda tidak memiliki akses membuat perangkat ajar.');
  }

  const programs = await loadPrograms(academicYearId);
  const selectedProgram = programs.find((program) => program.code === programCode && program.isActive);
  if (!selectedProgram) {
    throw new ApiError(400, 'Program perangkat ajar tidak aktif atau tidak ditemukan.');
  }

  if (roleUpper === 'TEACHER') {
    const teacherScope = await resolveTeacherProgramScope(Number(user.id), academicYearId);
    const filtered = filterPrograms([selectedProgram], 'teacher', false, teacherScope);
    if (filtered.length === 0) {
      throw new ApiError(403, 'Program perangkat ajar ini tidak tersedia untuk akun Anda pada tahun ajaran aktif.');
    }
  }

  const entry = await prisma.teachingResourceEntry.create({
    data: {
      academicYearId,
      teacherId,
      programCode,
      subjectId: Number.isFinite(subjectId) && subjectId > 0 ? subjectId : null,
      classLevel: classLevel || null,
      className: className || null,
      title,
      summary: summary || null,
      content: toJsonValue(content),
      tags,
      status: 'DRAFT',
    },
    include: {
      teacher: { select: { id: true, name: true, username: true } },
    },
  });

  return res.status(201).json(new ApiResponse(201, entry, 'Perangkat ajar berhasil dibuat.'));
});

export const updateTeachingResourceEntry = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const entryId = Number(req.params?.id || 0);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ApiError(400, 'ID perangkat ajar tidak valid.');
  }

  const existing = await prisma.teachingResourceEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      academicYearId: true,
      teacherId: true,
      status: true,
      programCode: true,
    },
  });
  if (!existing) throw new ApiError(404, 'Perangkat ajar tidak ditemukan.');

  const roleUpper = String(user.role).trim().toUpperCase();
  let canReview = false;
  try {
    await assertCanReviewTeachingResourceEntries({ id: Number(user.id), role: String(user.role) });
    canReview = true;
  } catch {
    canReview = false;
  }

  if (roleUpper === 'TEACHER' && Number(existing.teacherId) !== Number(user.id) && !canReview) {
    throw new ApiError(403, 'Anda tidak dapat mengubah data milik pengguna lain.');
  }
  if (!canReview && ['SUBMITTED', 'APPROVED'].includes(String(existing.status))) {
    throw new ApiError(400, 'Data yang sudah dikirim/disetujui tidak dapat diedit.');
  }

  const payload: Record<string, unknown> = {};
  if (req.body?.title !== undefined) {
    const title = String(req.body.title || '').trim();
    if (!title) throw new ApiError(400, 'Judul perangkat ajar wajib diisi.');
    payload.title = title;
  }
  if (req.body?.summary !== undefined) payload.summary = String(req.body.summary || '').trim() || null;
  if (req.body?.content !== undefined) payload.content = toJsonValue(sanitizeEntryContent(req.body.content));
  if (req.body?.tags !== undefined) payload.tags = sanitizeTags(req.body.tags);
  if (req.body?.classLevel !== undefined) payload.classLevel = normalizeClassLevelToken(req.body.classLevel) || null;
  if (req.body?.className !== undefined) payload.className = String(req.body.className || '').trim() || null;
  if (req.body?.subjectId !== undefined) {
    const subjectId = Number(req.body.subjectId || 0);
    payload.subjectId = Number.isFinite(subjectId) && subjectId > 0 ? subjectId : null;
  }

  if (Object.keys(payload).length === 0) {
    throw new ApiError(400, 'Tidak ada perubahan yang dikirim.');
  }

  const updated = await prisma.teachingResourceEntry.update({
    where: { id: entryId },
    data: payload,
    include: {
      teacher: { select: { id: true, name: true, username: true } },
      reviewer: { select: { id: true, name: true, role: true } },
    },
  });

  return res.status(200).json(new ApiResponse(200, updated, 'Perangkat ajar berhasil diperbarui.'));
});

export const deleteTeachingResourceEntry = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const entryId = Number(req.params?.id || 0);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ApiError(400, 'ID perangkat ajar tidak valid.');
  }

  const existing = await prisma.teachingResourceEntry.findUnique({
    where: { id: entryId },
    select: { id: true, teacherId: true, status: true },
  });
  if (!existing) throw new ApiError(404, 'Perangkat ajar tidak ditemukan.');

  const roleUpper = String(user.role).trim().toUpperCase();
  let canReview = false;
  try {
    await assertCanReviewTeachingResourceEntries({ id: Number(user.id), role: String(user.role) });
    canReview = true;
  } catch {
    canReview = false;
  }

  const isOwner = Number(existing.teacherId) === Number(user.id);
  const isPrivileged = ['ADMIN', 'PRINCIPAL'].includes(roleUpper) || canReview;

  if (!isOwner && !isPrivileged) {
    throw new ApiError(403, 'Anda tidak memiliki izin menghapus data ini.');
  }

  if (!isPrivileged && ['SUBMITTED', 'APPROVED'].includes(String(existing.status))) {
    throw new ApiError(400, 'Data yang sudah dikirim/disetujui tidak dapat dihapus.');
  }

  await prisma.teachingResourceEntry.delete({ where: { id: entryId } });
  return res.status(200).json(new ApiResponse(200, { id: entryId }, 'Perangkat ajar berhasil dihapus.'));
});

export const submitTeachingResourceEntry = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const entryId = Number(req.params?.id || 0);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ApiError(400, 'ID perangkat ajar tidak valid.');
  }

  const existing = await prisma.teachingResourceEntry.findUnique({
    where: { id: entryId },
    select: { id: true, teacherId: true, status: true },
  });
  if (!existing) throw new ApiError(404, 'Perangkat ajar tidak ditemukan.');

  const roleUpper = String(user.role).trim().toUpperCase();
  const isOwner = Number(existing.teacherId) === Number(user.id);
  const isPrivileged = ['ADMIN', 'PRINCIPAL'].includes(roleUpper);
  if (!isOwner && !isPrivileged) {
    throw new ApiError(403, 'Anda tidak memiliki akses submit data ini.');
  }
  if (String(existing.status) === 'APPROVED') {
    throw new ApiError(400, 'Data yang sudah disetujui tidak perlu dikirim ulang.');
  }

  const updated = await prisma.teachingResourceEntry.update({
    where: { id: entryId },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      reviewedAt: null,
      reviewerId: null,
      reviewNote: null,
    },
    include: {
      teacher: { select: { id: true, name: true, username: true } },
      reviewer: { select: { id: true, name: true, role: true } },
    },
  });

  return res.status(200).json(new ApiResponse(200, updated, 'Perangkat ajar berhasil dikirim untuk review.'));
});

export const reviewTeachingResourceEntry = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCanReviewTeachingResourceEntries({ id: Number(user.id), role: String(user.role) });

  const entryId = Number(req.params?.id || 0);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ApiError(400, 'ID perangkat ajar tidak valid.');
  }

  const actionRaw = String(req.body?.action || '').trim().toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(actionRaw)) {
    throw new ApiError(400, 'Aksi review tidak valid.');
  }
  const reviewNote = String(req.body?.reviewNote || '').trim();

  const existing = await prisma.teachingResourceEntry.findUnique({
    where: { id: entryId },
    select: { id: true, status: true, teacherId: true },
  });
  if (!existing) throw new ApiError(404, 'Perangkat ajar tidak ditemukan.');
  if (Number(existing.teacherId) === Number(user.id) && String(user.role).toUpperCase() === 'TEACHER') {
    throw new ApiError(403, 'Reviewer tidak boleh memproses data miliknya sendiri.');
  }
  if (String(existing.status) !== 'SUBMITTED' && String(existing.status) !== 'REJECTED') {
    throw new ApiError(400, 'Data belum berada pada status yang bisa direview.');
  }

  const nextStatus: TeachingResourceEntryStatus = actionRaw === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const updated = await prisma.teachingResourceEntry.update({
    where: { id: entryId },
    data: {
      status: nextStatus,
      reviewerId: Number(user.id),
      reviewedAt: new Date(),
      reviewNote: reviewNote || null,
    },
    include: {
      teacher: { select: { id: true, name: true, username: true } },
      reviewer: { select: { id: true, name: true, role: true } },
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updated, nextStatus === 'APPROVED' ? 'Perangkat ajar disetujui.' : 'Perangkat ajar ditolak.'));
});

export const getTeachingResourceEntriesSummary = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { id?: number; role?: string } }).user;
  if (!user?.id || !user?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const academicYearId = await resolveAcademicYearId(req.query?.academicYearId);
  const programCode = normalizeProgramCode(req.query?.programCode);
  const where: Record<string, unknown> = {
    academicYearId,
  };
  if (programCode) where.programCode = programCode;

  let canReview = false;
  try {
    await assertCanReviewTeachingResourceEntries({ id: Number(user.id), role: String(user.role) });
    canReview = true;
  } catch {
    canReview = false;
  }

  if (!canReview && String(user.role).toUpperCase() === 'TEACHER') {
    where.teacherId = Number(user.id);
  }

  const [total, byStatus, byProgram, latest] = await Promise.all([
    prisma.teachingResourceEntry.count({ where }),
    prisma.teachingResourceEntry.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.teachingResourceEntry.groupBy({
      by: ['programCode'],
      where,
      _count: { _all: true },
    }),
    prisma.teachingResourceEntry.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 8,
      include: {
        teacher: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        total,
        canReview,
        byStatus: byStatus.map((item) => ({
          status: item.status,
          total: Number(item._count?._all || 0),
        })),
        byProgram: byProgram.map((item) => ({
          programCode: item.programCode,
          total: Number(item._count?._all || 0),
        })),
        latest,
      },
      'Ringkasan perangkat ajar berhasil dimuat.',
    ),
  );
});
