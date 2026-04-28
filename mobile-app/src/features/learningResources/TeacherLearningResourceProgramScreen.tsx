import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scaleWithAppTextScale } from '../../theme/AppTextScaleProvider';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileMenuTab } from '../../components/MobileMenuTab';
import { MobileSelectField } from '../../components/MobileSelectField';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../lib/ui/feedback';
import { academicYearApi } from '../academicYear/academicYearApi';
import { useAuth } from '../auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../teacherAssignments/useTeacherAssignmentsQuery';
import { TeacherAssignment } from '../teacherAssignments/types';
import { filterRegularTeacherAssignments } from '../teacherAssignments/utils';
import {
  teachingResourceProgramApi,
  TeachingResourceEntryReferenceSelection,
  TeachingResourceFieldBinding,
  TeachingResourceFieldSourceType,
  TeachingResourceEntryItem,
  TeachingResourceColumnValueSource,
  TeachingResourceProgramColumnSchema,
  TeachingResourceProgramItem,
  TeachingResourceProgramSectionSchema,
  TeachingResourceEntryStatus,
} from './teachingResourceProgramApi';

type ProgramScreenProps = {
  programCode: string;
  fallbackTitle: string;
  fallbackDescription: string;
  icon?: keyof typeof Feather.glyphMap;
};

type EntrySectionDraft = {
  id: string;
  schemaKey?: string;
  title: string;
  body: string;
  rows: EntrySectionRowDraft[];
};

type EntrySectionRowDraft = {
  id: string;
  values: Record<string, string>;
  referenceSelections?: Record<string, TeachingResourceEntryReferenceSelection>;
};

type TeacherAssignmentContextOption = {
  key: string;
  subjectId: number;
  subjectName: string;
  classLevel: string;
  className: string;
  programKeahlian: string;
  teacherName: string;
  label: string;
  coveredClasses: string[];
  assignmentIds: number[];
};

type StatusFilter = 'ALL' | TeachingResourceEntryStatus;

type ReferenceOption = {
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

const INPUT_BASE_STYLE = {
  borderWidth: 1,
  borderColor: '#cbd5e1',
  borderRadius: 10,
  backgroundColor: '#fff',
  paddingHorizontal: 10,
  paddingVertical: 9,
  color: BRAND_COLORS.textDark,
  fontSize: scaleWithAppTextScale(13),
} as const;

const STATUS_META: Record<
  TeachingResourceEntryStatus,
  {
    label: string;
    pillBg: string;
    pillBorder: string;
    pillText: string;
  }
> = {
  DRAFT: {
    label: 'Draft',
    pillBg: '#f8fafc',
    pillBorder: '#cbd5e1',
    pillText: '#475569',
  },
  SUBMITTED: {
    label: 'Menunggu Review',
    pillBg: '#fffbeb',
    pillBorder: '#fde68a',
    pillText: '#a16207',
  },
  APPROVED: {
    label: 'Disetujui',
    pillBg: '#ecfdf5',
    pillBorder: '#86efac',
    pillText: '#166534',
  },
  REJECTED: {
    label: 'Perlu Revisi',
    pillBg: '#fef2f2',
    pillBorder: '#fca5a5',
    pillText: '#b91c1c',
  },
};

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: 'Semua Status' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Menunggu Review' },
  { key: 'APPROVED', label: 'Disetujui' },
  { key: 'REJECTED', label: 'Perlu Revisi' },
];

const MONTH_OPTIONS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'Nopember',
  'Desember',
].map((month) => ({ value: month, label: month }));
const WEEK_OPTIONS = Array.from({ length: 19 }, (_, index) => String(index + 1));
const WEEK_SELECT_OPTIONS = WEEK_OPTIONS.map((week) => ({ value: week, label: `Minggu ${week}` }));
const SEMESTER_OPTIONS = ['Ganjil', 'Genap'].map((semester) => ({ value: semester, label: semester }));

const PROGRAM_NAVIGATION = [
  { code: 'CP', route: '/teacher/learning-cp', label: 'CP' },
  { code: 'ATP', route: '/teacher/learning-atp', label: 'ATP' },
  { code: 'PROTA', route: '/teacher/learning-prota', label: 'Program Tahunan' },
  { code: 'PROMES', route: '/teacher/learning-promes', label: 'Program Semester' },
  { code: 'MODUL_AJAR', route: '/teacher/learning-modules', label: 'Modul Ajar' },
  { code: 'KKTP', route: '/teacher/learning-kktp', label: 'KKTP' },
  { code: 'MATRIKS_SEBARAN', route: '/teacher/learning-matriks-sebaran', label: 'Matriks Sebaran' },
];

function normalizeProgramCode(raw: unknown): string {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (normalized === 'MODULES' || normalized === 'MODUL') return 'MODUL_AJAR';
  if (normalized === 'MATRIKS') return 'MATRIKS_SEBARAN';
  return normalized;
}

function normalizeClassLevel(raw: unknown): string {
  const value = String(raw || '').trim().toUpperCase();
  if (value === '10') return 'X';
  if (value === '11') return 'XI';
  if (value === '12') return 'XII';
  return value;
}

function buildAssignmentAggregateClassName(assignment: TeacherAssignment): string {
  const level = normalizeClassLevel(assignment.class?.level);
  const majorCode = String(assignment.class?.major?.code || '').trim().toUpperCase();
  const majorName = String(assignment.class?.major?.name || '').trim();
  const fallbackClassName = String(assignment.class?.name || '').trim();
  const suffix =
    majorCode ||
    majorName ||
    fallbackClassName
      .replace(new RegExp(`^${level}\\s*`, 'i'), '')
      .replace(/\s+\d+$/, '')
      .trim();
  return [level, suffix].filter(Boolean).join(' ').trim() || fallbackClassName;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function extractCoveredClasses(entry: TeachingResourceEntryItem): string[] {
  const rawClasses = Array.isArray(entry.content?.contextScope?.coveredClasses)
    ? entry.content.contextScope.coveredClasses
    : [];
  return rawClasses
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' }));
}

function resolveEntryContextLabel(
  entry: TeachingResourceEntryItem,
  contexts: TeacherAssignmentContextOption[],
): string {
  const coveredClasses = extractCoveredClasses(entry);
  const entryClassName =
    String(entry.content?.contextScope?.aggregatedClassName || '').trim() ||
    String(entry.className || '').trim();
  const normalizedEntryClassName = entryClassName.toLowerCase();
  const matchedContext = contexts.find((context) => {
    if (Number(context.subjectId) !== Number(entry.subjectId || 0)) return false;
    if (String(context.className || '').trim().toLowerCase() === normalizedEntryClassName) return true;
    if (context.coveredClasses.some((item) => item.trim().toLowerCase() === normalizedEntryClassName)) return true;
    return (
      coveredClasses.length > 0 &&
      coveredClasses.every((item) => context.coveredClasses.includes(item))
    );
  });
  if (matchedContext) return matchedContext.label;
  return [entry.classLevel, entryClassName].filter(Boolean).join(' - ');
}

function isDigitalApprovalOnlySection(schemaKey?: string, title?: string): boolean {
  const key = String(schemaKey || '')
    .trim()
    .toLowerCase();
  const label = String(title || '')
    .trim()
    .toLowerCase();
  if (key.startsWith('ttd_')) return true;
  if (key.includes('pengesahan')) return true;
  if (label.includes('pengesahan dokumen')) return true;
  if (label.includes('pengesahan semester')) return true;
  return false;
}

function createSection(schema?: TeachingResourceProgramSectionSchema, rowIndex = 0): EntrySectionDraft {
  const editorType = schema?.editorType === 'TABLE' ? 'TABLE' : 'TEXT';
  const columns = Array.isArray(schema?.columns) ? schema.columns : [];
  const prefillRows = Array.isArray(schema?.prefillRows) ? schema.prefillRows : [];
  const defaultRowCount = editorType === 'TABLE' ? Math.max(1, Number(schema?.defaultRows || 1)) : 0;
  const resolvedRows =
    editorType === 'TABLE'
      ? (prefillRows.length > 0 ? prefillRows : Array.from({ length: defaultRowCount }, () => ({} as Record<string, string>))).map(
          (prefill, tableRowIndex) => {
            const safePrefill: Record<string, string> = prefill || {};
            return {
              id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${tableRowIndex}`,
              values: columns.reduce<Record<string, string>>((acc, column) => {
                const key = String(column.key || '').trim();
                if (!key) return acc;
                acc[key] = String(safePrefill[key] || '').trim();
                return acc;
              }, {}),
            };
          },
        )
      : [];
  return {
    id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    schemaKey: schema?.key,
    title:
      rowIndex === 0
        ? String(schema?.label || '').trim()
        : schema?.repeatable
          ? `${String(schema?.label || 'Bagian').trim()} #${rowIndex + 1}`
          : String(schema?.label || '').trim(),
    body: '',
    rows: resolvedRows,
  };
}

function formatDateTime(value?: string | null): string {
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

function resolveSemesterLabel(semester: unknown): string {
  const token = String(semester || '').trim().toUpperCase();
  if (!token) return '';
  if (token === 'ODD' || token === 'GANJIL') return 'Ganjil';
  if (token === 'EVEN' || token === 'GENAP') return 'Genap';
  return token;
}

function formatLongDate(value = new Date()): string {
  return value.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function normalizeSheetToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sanitizeReferenceSnapshot(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const normalizedKey = normalizeSheetToken(key);
    const resolvedValue = String(rawValue ?? '').trim();
    if (!normalizedKey || !resolvedValue) return acc;
    acc[normalizedKey] = resolvedValue;
    return acc;
  }, {});
}

function buildReferenceSelectionStorageKey(sectionIndex: number, rowIndex: number, columnKey: string): string {
  return `${sectionIndex}::${rowIndex}::${String(columnKey || '').trim()}`;
}

function extractBindingCandidates(column: TeachingResourceProgramColumnSchema): string[] {
  const candidates = new Set<string>();
  [
    column.binding?.sourceFieldIdentity,
    column.binding?.sourceDocumentFieldIdentity,
    column.fieldIdentity,
    column.bindingKey,
    column.semanticKey,
    column.key,
  ].forEach((item) => {
    const token = String(item || '').trim();
    if (!token) return;
    const normalized = normalizeSheetToken(token);
    if (normalized) candidates.add(normalized);
    const tail = normalizeSheetToken(token.split('.').pop());
    if (tail) candidates.add(tail);
  });
  return Array.from(candidates);
}

function extractReferenceCandidates(column: TeachingResourceProgramColumnSchema | null | undefined): string[] {
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
    const normalized = normalizeSheetToken(token);
    if (normalized) candidates.add(normalized);
    const tail = normalizeSheetToken(token.split('.').pop());
    if (tail) candidates.add(tail);
  });
  return Array.from(candidates);
}

function isDocumentReferenceColumn(column: TeachingResourceProgramColumnSchema | null | undefined): boolean {
  const sourceType = String(column?.sourceType || '').trim().toUpperCase();
  return sourceType === 'DOCUMENT_REFERENCE' || sourceType === 'DOCUMENT_SNAPSHOT';
}

function buildReferenceSnapshot(
  columns: TeachingResourceProgramColumnSchema[],
  row: Record<string, string>,
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  columns.forEach((column) => {
    const key = String(column.key || '').trim();
    const value = String(row[key] || '').trim();
    if (!key || !value) return;
    const tokens = new Set<string>([
      normalizeSheetToken(key),
      ...extractBindingCandidates(column),
      ...extractReferenceCandidates(column),
    ]);
    tokens.forEach((token) => {
      if (!token || snapshot[token]) return;
      snapshot[token] = value;
    });
  });
  Object.entries(row).forEach(([key, rawValue]) => {
    const normalizedKey = normalizeSheetToken(key);
    const value = String(rawValue || '').trim();
    if (!normalizedKey || !value || snapshot[normalizedKey]) return;
    snapshot[normalizedKey] = value;
  });
  return snapshot;
}

function resolveSystemValueForColumn(
  column: TeachingResourceProgramColumnSchema,
  context: {
    mapel: string;
    tingkat: string;
    kelas: string;
    programKeahlian: string;
    tahunAjaran: string;
    semester: string;
    guruMapel: string;
    tempatTanggal: string;
  },
): string {
  switch (String(column.valueSource || 'MANUAL').trim().toUpperCase() as TeachingResourceColumnValueSource) {
    case 'SYSTEM_ACTIVE_YEAR':
      return context.tahunAjaran;
    case 'SYSTEM_SEMESTER':
      return context.semester;
    case 'SYSTEM_SUBJECT':
      return context.mapel;
    case 'SYSTEM_CLASS_LEVEL':
      return context.tingkat;
    case 'SYSTEM_CLASS_NAME':
      return context.kelas;
    case 'SYSTEM_SKILL_PROGRAM':
      return context.programKeahlian;
    case 'SYSTEM_TEACHER_NAME':
      return context.guruMapel;
    case 'SYSTEM_PLACE_DATE':
      return context.tempatTanggal;
    default:
      return '';
  }
}

function getColumnDataType(column?: Pick<TeachingResourceProgramColumnSchema, 'dataType'> | null): string {
  return String(column?.dataType || 'TEXT')
    .trim()
    .toUpperCase();
}

function isSystemManagedColumn(column: TeachingResourceProgramColumnSchema): boolean {
  if (isDocumentReferenceColumn(column)) return false;
  const valueSource = String(column.valueSource || 'MANUAL').trim().toUpperCase();
  const dataType = getColumnDataType(column);
  return Boolean(column.readOnly) || dataType === 'READONLY_BOUND' || (!!valueSource && valueSource !== 'MANUAL');
}

function parseWeekGridValue(value: unknown): string[] {
  const seen = new Set<string>();
  String(value || '')
    .split(/[,\s;|]+/)
    .map((token) => token.trim().replace(/^m(inggu)?[-_\s]*/i, ''))
    .forEach((token) => {
      const numeric = Number(token);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > WEEK_OPTIONS.length) return;
      seen.add(String(numeric));
    });
  return WEEK_OPTIONS.filter((week) => seen.has(week));
}

function toggleWeekGridValue(value: unknown, week: string): string {
  const selected = new Set(parseWeekGridValue(value));
  if (selected.has(week)) {
    selected.delete(week);
  } else {
    selected.add(week);
  }
  return WEEK_OPTIONS.filter((item) => selected.has(item)).join(', ');
}

function buildAutoSheetTitle(params: {
  programLabel: string;
  context: TeacherAssignmentContextOption | null;
  academicYearName: string;
  semesterLabel: string;
}): string {
  const parts = [
    String(params.programLabel || '').trim(),
    String(params.context?.subjectName || '').trim(),
    String(params.context?.className || '').trim(),
    String(params.academicYearName || '').trim(),
    String(params.semesterLabel || '').trim(),
  ].filter(Boolean);
  return parts.join(' - ');
}

function hydrateSheetSections(params: {
  sections: EntrySectionDraft[];
  schemaMap: Map<string, TeachingResourceProgramSectionSchema>;
  context: TeacherAssignmentContextOption | null;
  academicYearName: string;
  semesterLabel: string;
}): EntrySectionDraft[] {
  const mapel = String(params.context?.subjectName || '').trim();
  const tingkat = String(params.context?.classLevel || '').trim();
  const kelas = String(params.context?.className || '').trim();
  const programKeahlian = String(params.context?.programKeahlian || '').trim();
  const tahunAjaran = String(params.academicYearName || '').trim();
  const semester = String(params.semesterLabel || '').trim();
  const guruMapel = String(params.context?.teacherName || '').trim();
  const tempatTanggal = `Bekasi, ${formatLongDate(new Date())}`;

  const setIfBlank = (target: Record<string, string>, key: string, value: string) => {
    if (!key || !value) return;
    if (!String(target[key] || '').trim()) {
      target[key] = value;
    }
  };

  const hydratedSections = params.sections.map((section) => {
    const schema = params.schemaMap.get(String(section.schemaKey || '').trim());
    if (!schema || (schema.editorType || 'TEXT') !== 'TABLE') return section;
    const columns = ensureArray<TeachingResourceProgramColumnSchema>(schema.columns);
    const columnKeys = columns.map((column) => String(column.key || '').trim()).filter(Boolean);
    const rows = (section.rows.length > 0 ? section.rows : createSection(schema, 0).rows).map((row, rowIndex) => {
      const values = {
        ...row.values,
      };
      if (columnKeys.includes('no')) setIfBlank(values, 'no', String(rowIndex + 1));
      if (columnKeys.includes('mata_pelajaran')) setIfBlank(values, 'mata_pelajaran', mapel);
      if (columnKeys.includes('tingkat')) setIfBlank(values, 'tingkat', tingkat);
      if (columnKeys.includes('program_keahlian')) setIfBlank(values, 'program_keahlian', programKeahlian);
      if (columnKeys.includes('tahun_ajaran')) setIfBlank(values, 'tahun_ajaran', tahunAjaran);
      if (columnKeys.includes('semester')) setIfBlank(values, 'semester', semester);
      if (columnKeys.includes('pihak_1_jabatan')) setIfBlank(values, 'pihak_1_jabatan', 'Kepala Sekolah');
      if (columnKeys.includes('pihak_2_jabatan')) setIfBlank(values, 'pihak_2_jabatan', 'Guru Mata Pelajaran');
      if (columnKeys.includes('pihak_2_nama')) setIfBlank(values, 'pihak_2_nama', guruMapel);
      if (columnKeys.includes('tempat_tanggal')) setIfBlank(values, 'tempat_tanggal', tempatTanggal);
      columns.forEach((column) => {
        const key = String(column.key || '').trim();
        if (!key) return;
        const systemValue = resolveSystemValueForColumn(column, {
          mapel,
          tingkat,
          kelas,
          programKeahlian,
          tahunAjaran,
          semester,
          guruMapel,
          tempatTanggal,
        });
        if (systemValue) {
          setIfBlank(values, key, systemValue);
        }
      });
      return {
        ...row,
        values,
      };
    });

    return {
      ...section,
      title: section.title || String(schema.label || '').trim(),
      rows,
    };
  });

  const semanticValueIndex = new Map<string, string[]>();
  hydratedSections.forEach((section) => {
    const schema = params.schemaMap.get(String(section.schemaKey || '').trim());
    const columns = ensureArray<TeachingResourceProgramColumnSchema>(schema?.columns);
    section.rows.forEach((row, rowIndex) => {
      columns.forEach((column) => {
        const value = String(row.values[String(column.key || '').trim()] || '').trim();
        if (!value) return;
        extractBindingCandidates(column).forEach((candidate) => {
          if (!candidate) return;
          const current = semanticValueIndex.get(candidate) || [];
          if (!String(current[rowIndex] || '').trim()) {
            current[rowIndex] = value;
            semanticValueIndex.set(candidate, current);
          } else if (!current.some((item) => String(item || '').trim() === value)) {
            current.push(value);
            semanticValueIndex.set(candidate, current);
          }
        });
      });
    });
  });

  return hydratedSections.map((section) => {
    const schema = params.schemaMap.get(String(section.schemaKey || '').trim());
    const columns = ensureArray<TeachingResourceProgramColumnSchema>(schema?.columns);
    if (!columns.length) return section;
    return {
      ...section,
      rows: section.rows.map((row, rowIndex) => {
        const values = {
          ...row.values,
        };
        columns.forEach((column) => {
          if (String(column.valueSource || 'MANUAL').trim().toUpperCase() !== 'BOUND') return;
          const key = String(column.key || '').trim();
          if (!key || String(values[key] || '').trim()) return;
          const candidates = extractBindingCandidates(column);
          for (const candidate of candidates) {
            const candidateValues = semanticValueIndex.get(candidate) || [];
            const resolvedValue =
              String(candidateValues[rowIndex] || '').trim() ||
              candidateValues.find((item) => String(item || '').trim()) ||
              '';
            if (resolvedValue) {
              values[key] = resolvedValue;
              break;
            }
          }
        });
        return {
          ...row,
          values,
        };
      }),
    };
  });
}

function buildDefaultSections(schemaSections: TeachingResourceProgramSectionSchema[]): EntrySectionDraft[] {
  const normalizedSections = ensureArray<TeachingResourceProgramSectionSchema>(schemaSections).filter(
    (section) =>
      !isDigitalApprovalOnlySection(String(section?.key || '').trim(), String(section?.label || '').trim()),
  );
  if (!normalizedSections.length) return [createSection()];
  const generated: EntrySectionDraft[] = [];
  normalizedSections.forEach((schema) => {
    const isTable = schema.editorType === 'TABLE';
    if (isTable) {
      generated.push(createSection(schema, 0));
      return;
    }
    const sectionCount = schema.repeatable ? Math.max(1, Number(schema.defaultRows || 1)) : 1;
    for (let idx = 0; idx < sectionCount; idx += 1) {
      generated.push(createSection(schema, idx));
    }
  });
  return generated.length ? generated : [createSection()];
}

function normalizeSectionsFromEntry(
  entry: TeachingResourceEntryItem,
  defaultSections: EntrySectionDraft[],
): EntrySectionDraft[] {
  const referenceSelections = (
    Array.isArray(entry.content?.referenceSelections) ? entry.content.referenceSelections : []
  ).reduce<Map<string, TeachingResourceEntryReferenceSelection>>((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const normalized = item as TeachingResourceEntryReferenceSelection;
    const columnKey = String(normalized.columnKey || '').trim();
    const sectionIndex = Number(normalized.sectionIndex);
    const rowIndex = Number(normalized.rowIndex);
    if (!columnKey || !Number.isInteger(sectionIndex) || sectionIndex < 0 || !Number.isInteger(rowIndex) || rowIndex < 0) {
      return acc;
    }
    acc.set(buildReferenceSelectionStorageKey(sectionIndex, rowIndex, columnKey), {
      sectionSchemaKey: String(normalized.sectionSchemaKey || '').trim() || undefined,
      sectionIndex,
      rowIndex,
      columnKey,
      selectionToken: String(normalized.selectionToken || '').trim() || undefined,
      sourceProgramCode: String(normalized.sourceProgramCode || '').trim() || undefined,
      sourceEntryId: Number.isFinite(Number(normalized.sourceEntryId)) ? Number(normalized.sourceEntryId) : undefined,
      sourceEntryTitle: String(normalized.sourceEntryTitle || '').trim() || undefined,
      sourceFieldKey: String(normalized.sourceFieldKey || '').trim() || undefined,
      sourceFieldIdentity: String(normalized.sourceFieldIdentity || '').trim() || undefined,
      value: String(normalized.value || '').trim(),
      label: String(normalized.label || '').trim() || undefined,
      snapshot: sanitizeReferenceSnapshot(normalized.snapshot),
    });
    return acc;
  }, new Map<string, TeachingResourceEntryReferenceSelection>());
  const rawSections = ensureArray<{
    schemaKey?: unknown;
    title?: unknown;
    body?: unknown;
    rows?: unknown;
  }>(entry.content?.sections);
  const parsed = rawSections
    .map((item, index) => {
      const rows = Array.isArray(item?.rows)
        ? item.rows
            .map((rawRow, rowIndex) => {
              if (!rawRow || typeof rawRow !== 'object') return null;
              const values = Object.entries(rawRow as Record<string, unknown>).reduce<Record<string, string>>(
                (acc, [key, value]) => {
                  const normalizedKey = String(key || '').trim();
                  if (!normalizedKey) return acc;
                  acc[normalizedKey] = String(value ?? '').trim();
                  return acc;
                },
                {},
              );
              if (!Object.keys(values).length) return null;
              const rowReferenceSelections = Object.fromEntries(
                Array.from(referenceSelections.entries())
                  .filter(([storageKey]) => storageKey.startsWith(`${index}::${rowIndex}::`))
                  .map(([, selection]) => [String(selection.columnKey || '').trim(), selection] as const)
                  .filter(([columnKey]) => Boolean(columnKey)),
              );
              return {
                id: `row-${entry.id}-${index + 1}-${rowIndex + 1}`,
                values,
                referenceSelections: Object.keys(rowReferenceSelections).length > 0 ? rowReferenceSelections : undefined,
              };
            })
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
        : [];
      return {
        id: `section-${entry.id}-${index + 1}`,
        schemaKey: String(item?.schemaKey || '').trim() || undefined,
        title: String(item?.title || '').trim(),
        body: String(item?.body || '').trim(),
        rows,
      };
    })
    .filter((item) => !isDigitalApprovalOnlySection(item.schemaKey, item.title))
    .filter((item) => item.title || item.body || item.rows.length > 0);
  return parsed.length > 0 ? parsed : defaultSections;
}

function toEntryReferenceSections(entry: TeachingResourceEntryItem) {
  const rawSections = ensureArray<{
    schemaKey?: unknown;
    title?: unknown;
    columns?: unknown;
    rows?: unknown;
  }>(entry.content?.sections);
  return rawSections
    .map((item) => {
      const rows = Array.isArray(item?.rows)
        ? item.rows
            .map((rawRow) => {
              if (!rawRow || typeof rawRow !== 'object') return null;
              return Object.entries(rawRow as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
                const normalizedKey = String(key || '').trim();
                if (!normalizedKey) return acc;
                acc[normalizedKey] = String(value ?? '').trim();
                return acc;
              }, {});
            })
            .filter((row): row is Record<string, string> => Boolean(row))
        : [];
      return {
        schemaKey: String(item?.schemaKey || '').trim(),
        title: String(item?.title || '').trim(),
        columns: ensureArray<TeachingResourceProgramColumnSchema>(item?.columns),
        rows,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function TeacherLearningResourceProgramScreen({
  programCode,
  fallbackTitle,
  fallbackDescription,
  icon = 'book-open',
}: ProgramScreenProps) {
  const normalizedProgramCode = useMemo(() => normalizeProgramCode(programCode), [programCode]);
  const queryClient = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 110 });

  const [selectedContextKey, setSelectedContextKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeachingResourceEntryItem | null>(null);
  const [entryTitle, setEntryTitle] = useState('');
  const [entrySummary, setEntrySummary] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entryTags, setEntryTags] = useState('');
  const [sections, setSections] = useState<EntrySectionDraft[]>(() => [createSection()]);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-learning-program-active-year', normalizedProgramCode],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const assignmentsQuery = useTeacherAssignmentsQuery({
    enabled: isAuthenticated,
    user,
  });

  const assignments = useMemo(
    () => filterRegularTeacherAssignments(ensureArray<TeacherAssignment>(assignmentsQuery.data?.assignments)),
    [assignmentsQuery.data?.assignments],
  );
  const relevantAssignments = useMemo(() => {
    if (!activeYearQuery.data?.id) return assignments;
    return assignments.filter((item) => Number(item.academicYear.id) === Number(activeYearQuery.data?.id));
  }, [assignments, activeYearQuery.data?.id]);
  const assignmentContextOptions = useMemo<TeacherAssignmentContextOption[]>(() => {
    const grouped = new Map<
      string,
      Omit<TeacherAssignmentContextOption, 'coveredClasses' | 'assignmentIds'> & {
        coveredClasses: Set<string>;
        assignmentIds: number[];
      }
    >();

    relevantAssignments.forEach((assignment) => {
      const subjectId = Number(assignment.subject?.id || assignment.subjectId || 0);
      const classLevel = normalizeClassLevel(assignment.class?.level);
      const className = buildAssignmentAggregateClassName(assignment);
      const programKeahlian = String(assignment.class?.major?.name || '').trim();
      const teacherName = String(assignment.teacher?.name || '').trim();
      const groupKey = `${subjectId}::${className}`;
      const coveredClass = String(assignment.class?.name || '').trim();
      const existing = grouped.get(groupKey);

      if (existing) {
        if (coveredClass) existing.coveredClasses.add(coveredClass);
        existing.assignmentIds.push(Number(assignment.id));
        return;
      }

      grouped.set(groupKey, {
        key: groupKey,
        subjectId,
        subjectName: String(assignment.subject?.name || '').trim(),
        classLevel,
        className,
        programKeahlian,
        teacherName,
        label: `${String(assignment.subject?.name || '').trim()} - ${className}`,
        coveredClasses: new Set(coveredClass ? [coveredClass] : []),
        assignmentIds: [Number(assignment.id)],
      });
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        coveredClasses: Array.from(item.coveredClasses).sort((left, right) =>
          left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' }),
        ),
      }))
      .sort((left, right) => {
        const subjectCompare = left.subjectName.localeCompare(right.subjectName, 'id', {
          numeric: true,
          sensitivity: 'base',
        });
        if (subjectCompare !== 0) return subjectCompare;
        return left.className.localeCompare(right.className, 'id', {
          numeric: true,
          sensitivity: 'base',
        });
      });
  }, [relevantAssignments]);
  const assignmentOptions = useMemo(
    () =>
      assignmentContextOptions.map((context) => ({
        value: context.key,
        label:
          context.coveredClasses.length > 1
            ? `${context.label} (${context.coveredClasses.length} rombel)`
            : context.label || 'Konteks mengajar',
      })),
    [assignmentContextOptions],
  );

  const effectiveSelectedContextKey = useMemo(() => {
    if (!assignmentContextOptions.length) return '';
    if (selectedContextKey !== null) {
      return assignmentContextOptions.some((item) => item.key === selectedContextKey) ? selectedContextKey : '';
    }
    return assignmentContextOptions[0]?.key || '';
  }, [assignmentContextOptions, selectedContextKey]);

  const selectedContext =
    assignmentContextOptions.find((item) => item.key === effectiveSelectedContextKey) || null;
  const academicYearName = useMemo(() => String(activeYearQuery.data?.name || '').trim(), [activeYearQuery.data?.name]);
  const activeSemesterLabel = useMemo(
    () => resolveSemesterLabel(activeYearQuery.data?.semester),
    [activeYearQuery.data?.semester],
  );

  const programsQuery = useQuery({
    queryKey: ['mobile-learning-program-config', activeYearQuery.data?.id],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!activeYearQuery.data?.id,
    queryFn: async () =>
      teachingResourceProgramApi.getTeachingResourcePrograms({
        academicYearId: Number(activeYearQuery.data?.id),
        roleContext: 'teacher',
        includeInactive: true,
      }),
    staleTime: 2 * 60 * 1000,
  });

  const activeProgram = useMemo(() => {
    const programs = ensureArray<TeachingResourceProgramItem>(programsQuery.data?.programs);
    return programs.find((item) => normalizeProgramCode(item.code) === normalizedProgramCode) || null;
  }, [normalizedProgramCode, programsQuery.data?.programs]);
  const navigationItems = useMemo(() => {
    const programs = ensureArray<TeachingResourceProgramItem>(programsQuery.data?.programs)
      .filter((item) => item.isActive && item.showOnTeacherMenu)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.code.localeCompare(b.code));

    if (programs.length === 0) {
      return PROGRAM_NAVIGATION.map((item) => ({
        code: normalizeProgramCode(item.code),
        route: item.route,
        label: item.label,
      }));
    }

    return programs.map((program) => {
      const normalizedCode = normalizeProgramCode(program.code);
      const fallback = PROGRAM_NAVIGATION.find((item) => normalizeProgramCode(item.code) === normalizedCode);
      const label = String(program.label || program.shortLabel || program.code).trim() || normalizedCode;
      return {
        code: normalizedCode,
        route:
          fallback?.route ||
          `/teacher/learning-program/${encodeURIComponent(normalizedCode)}?label=${encodeURIComponent(label)}&code=${encodeURIComponent(normalizedCode)}`,
        label,
      };
    });
  }, [programsQuery.data?.programs]);

  const effectiveTitle = useMemo(() => {
    const value = String(activeProgram?.label || '').trim();
    return value || fallbackTitle;
  }, [activeProgram?.label, fallbackTitle]);

  const effectiveDescription = useMemo(() => {
    const value = String(activeProgram?.description || '').trim();
    return value || fallbackDescription;
  }, [activeProgram?.description, fallbackDescription]);

  const activeProgramSchemaSections = useMemo(
    () =>
      ensureArray<TeachingResourceProgramSectionSchema>(activeProgram?.schema?.sections).filter(
        (section) =>
          !isDigitalApprovalOnlySection(String(section?.key || '').trim(), String(section?.label || '').trim()),
      ),
    [activeProgram?.schema?.sections],
  );
  const usesSheetTemplate = useMemo(
    () => Boolean(String(activeProgram?.schema?.sourceSheet || '').trim()),
    [activeProgram?.schema?.sourceSheet],
  );
  const canAddSection = useMemo(() => {
    if (!activeProgramSchemaSections.length) return true;
    return activeProgramSchemaSections.some((section) => section.repeatable);
  }, [activeProgramSchemaSections]);

  const activeProgramSchemaMap = useMemo(() => {
    const map = new Map<string, TeachingResourceProgramSectionSchema>();
    activeProgramSchemaSections.forEach((section) => {
      map.set(String(section.key || '').trim(), section);
    });
    return map;
  }, [activeProgramSchemaSections]);
  const programMetaByCode = useMemo(() => {
    const map = new Map<string, TeachingResourceProgramItem>();
    ensureArray<TeachingResourceProgramItem>(programsQuery.data?.programs).forEach((program) => {
      map.set(normalizeProgramCode(program.code), program);
    });
    return map;
  }, [programsQuery.data?.programs]);
  const referenceSourceProgramCodes = useMemo(() => {
    const codes = new Set<string>();
    activeProgramSchemaSections.forEach((section) => {
      ensureArray<TeachingResourceProgramColumnSchema>(section.columns).forEach((column) => {
        if (!isDocumentReferenceColumn(column)) return;
        const sourceProgramCode = normalizeProgramCode(column.binding?.sourceProgramCode || '');
        if (!sourceProgramCode) return;
        codes.add(sourceProgramCode);
      });
    });
    return Array.from(codes).sort();
  }, [activeProgramSchemaSections]);

  const hydrateSectionsForAssignment = (
    sourceSections: EntrySectionDraft[],
    context: TeacherAssignmentContextOption | null = selectedContext,
  ): EntrySectionDraft[] => {
    if (!usesSheetTemplate) return sourceSections;
    return hydrateSheetSections({
      sections: sourceSections,
      schemaMap: activeProgramSchemaMap,
      context,
      academicYearName,
      semesterLabel: activeSemesterLabel,
    });
  };

  const entriesQuery = useQuery({
    queryKey: [
      'mobile-learning-resource-entries',
      normalizedProgramCode,
      activeYearQuery.data?.id,
      page,
      statusFilter,
      search,
    ],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!activeYearQuery.data?.id,
    queryFn: async () =>
      teachingResourceProgramApi.getEntries({
        academicYearId: Number(activeYearQuery.data?.id),
        page,
        limit: 20,
        programCode: normalizedProgramCode,
        status: statusFilter,
        search: search || undefined,
        view: 'mine',
      }),
    staleTime: 10 * 1000,
  });
  const referenceEntriesQuery = useQuery({
    queryKey: ['mobile-learning-reference-entries', activeYearQuery.data?.id, user?.id || 0, referenceSourceProgramCodes],
    enabled:
      isAuthenticated &&
      user?.role === 'TEACHER' &&
      !!activeYearQuery.data?.id &&
      referenceSourceProgramCodes.length > 0 &&
      isEditorOpen,
    queryFn: async () => {
      const results = await Promise.all(
        referenceSourceProgramCodes.map(async (sourceProgramCode) => {
          const payload = await teachingResourceProgramApi.getEntries({
            academicYearId: Number(activeYearQuery.data?.id),
            page: 1,
            limit: 100,
            programCode: sourceProgramCode,
            status: 'ALL',
            search: undefined,
            view: 'mine',
          });
          return [sourceProgramCode, ensureArray<TeachingResourceEntryItem>(payload.rows)] as const;
        }),
      );
      return new Map<string, TeachingResourceEntryItem[]>(results);
    },
    staleTime: 30 * 1000,
  });

  const rows = ensureArray<TeachingResourceEntryItem>(entriesQuery.data?.rows);
  const total = Number(entriesQuery.data?.total || 0);
  const totalPages = Math.max(1, Number(entriesQuery.data?.totalPages || 1));
  const currentPage = Math.min(page, totalPages);
  const referenceOptionsByColumnKey = useMemo(() => {
    const map = new Map<string, ReferenceOption[]>();
    const referenceEntriesByProgram = referenceEntriesQuery.data || new Map<string, TeachingResourceEntryItem[]>();

    const matchesContext = (entry: TeachingResourceEntryItem, binding?: TeachingResourceFieldBinding): boolean => {
      if (!binding || !selectedContext) return true;
      const shouldMatchSubject = Boolean(binding.filterByContext) || Boolean(binding.matchBySubject);
      const shouldMatchClassLevel = Boolean(binding.filterByContext) || Boolean(binding.matchByClassLevel);
      const shouldMatchMajor = Boolean(binding.filterByContext) || Boolean(binding.matchByMajor);
      const shouldMatchSemester = Boolean(binding.matchByActiveSemester);
      const contextSemester = String(activeSemesterLabel || '').trim().toLowerCase();
      const entrySemester = String(
        ensureArray<{ rows?: Array<Record<string, string>> }>(entry.content?.sections)
          .flatMap((section) => ensureArray<Record<string, string>>(section.rows))
          .map((row) => String(row.semester || '').trim())
          .find(Boolean) || '',
      )
        .trim()
        .toLowerCase();
      const entryMajor = String(
        ensureArray<{ rows?: Array<Record<string, string>> }>(entry.content?.sections)
          .flatMap((section) => ensureArray<Record<string, string>>(section.rows))
          .map((row) => String(row.program_keahlian || '').trim())
          .find(Boolean) || '',
      )
        .trim()
        .toLowerCase();

      if (shouldMatchSubject && Number(entry.subjectId || 0) !== Number(selectedContext.subjectId || 0)) return false;
      if (
        shouldMatchClassLevel &&
        normalizeClassLevel(entry.classLevel || '') !== normalizeClassLevel(selectedContext.classLevel)
      ) {
        return false;
      }
      if (shouldMatchMajor && entryMajor && entryMajor !== String(selectedContext.programKeahlian || '').trim().toLowerCase()) {
        return false;
      }
      if (shouldMatchSemester && entrySemester && entrySemester !== contextSemester) {
        return false;
      }
      return true;
    };

    const extractOptionsFromEntry = (
      entry: TeachingResourceEntryItem,
      sourceProgram: TeachingResourceProgramItem | undefined,
      candidates: string[],
    ): ReferenceOption[] => {
      const sections = toEntryReferenceSections(entry);
      const schemaMap = new Map<string, TeachingResourceProgramSectionSchema>();
      ensureArray<TeachingResourceProgramSectionSchema>(sourceProgram?.schema?.sections).forEach((section) => {
        schemaMap.set(String(section.key || '').trim(), section);
      });
      const options: ReferenceOption[] = [];
      sections.forEach((section) => {
        const schema = schemaMap.get(String(section.schemaKey || '').trim());
        const columns = section.columns.length > 0 ? section.columns : ensureArray<TeachingResourceProgramColumnSchema>(schema?.columns);
        section.rows.forEach((row) => {
          const snapshot = buildReferenceSnapshot(columns, row);
          columns.forEach((column) => {
            const columnCandidates = extractReferenceCandidates(column);
            if (!columnCandidates.some((candidate) => candidates.includes(candidate))) return;
            const value = String(row[String(column.key || '').trim()] || '').trim();
            if (!value) return;
            const label = entry.title && entry.title.trim() && entry.title.trim() !== value ? `${value} - ${entry.title}` : value;
            options.push({
              selectValue: `${entry.id}::${String(column.key || '').trim()}::${value}`,
              value,
              label,
              sourceProgramCode: normalizeProgramCode(entry.programCode),
              sourceEntryId: Number(entry.id),
              sourceEntryTitle: String(entry.title || '').trim() || undefined,
              sourceFieldKey: String(column.key || '').trim() || undefined,
              sourceFieldIdentity: String(column.fieldIdentity || '').trim() || undefined,
              snapshot,
            });
          });
          if (columns.length > 0) return;
          Object.entries(row).forEach(([key, rawValue]) => {
            const normalizedKey = normalizeSheetToken(key);
            if (!normalizedKey || !candidates.includes(normalizedKey)) return;
            const value = String(rawValue || '').trim();
            if (!value) return;
            const label = entry.title && entry.title.trim() && entry.title.trim() !== value ? `${value} - ${entry.title}` : value;
            options.push({
              selectValue: `${entry.id}::${String(key || '').trim()}::${value}`,
              value,
              label,
              sourceProgramCode: normalizeProgramCode(entry.programCode),
              sourceEntryId: Number(entry.id),
              sourceEntryTitle: String(entry.title || '').trim() || undefined,
              sourceFieldKey: String(key || '').trim() || undefined,
              sourceFieldIdentity: undefined,
              snapshot,
            });
          });
        });
      });
      return options;
    };

    activeProgramSchemaSections.forEach((section) => {
      ensureArray<TeachingResourceProgramColumnSchema>(section.columns).forEach((column) => {
        if (!isDocumentReferenceColumn(column)) return;
        const sourceProgramCode = normalizeProgramCode(column.binding?.sourceProgramCode || '');
        if (!sourceProgramCode) return;
        const referenceEntries = referenceEntriesByProgram.get(sourceProgramCode) || [];
        const sourceProgram = programMetaByCode.get(sourceProgramCode);
        const candidates = extractReferenceCandidates(column);
        if (!candidates.length) return;
        const dedupe = new Set<string>();
        const options = referenceEntries
          .filter((entry) => matchesContext(entry, column.binding))
          .flatMap((entry) => extractOptionsFromEntry(entry, sourceProgram, candidates))
          .filter((option) => {
            const token = String(option.selectValue || '').trim().toLowerCase();
            if (!option.value || !token || dedupe.has(token)) return false;
            dedupe.add(token);
            return true;
          });
        map.set(`${String(section.key || '').trim()}::${String(column.key || '').trim()}`, options);
      });
    });

    return map;
  }, [
    activeProgramSchemaSections,
    activeSemesterLabel,
    programMetaByCode,
    referenceEntriesQuery.data,
    selectedContext,
  ]);
  const buildReferenceSelectionPayload = (sourceSections: EntrySectionDraft[]) => {
    const referenceSelections: TeachingResourceEntryReferenceSelection[] = [];
    const references = new Set<string>();

    sourceSections.forEach((section, sectionIndex) => {
      section.rows.forEach((row, rowIndex) => {
        Object.entries(row.referenceSelections || {}).forEach(([columnKey, selection]) => {
          if (!selection) return;
          const value = String(selection.value || row.values[columnKey] || '').trim();
          if (!value) return;
          const sourceProgramCode = normalizeProgramCode(selection.sourceProgramCode || '');
          const sourceEntryId = Number(selection.sourceEntryId || 0);
          if (sourceProgramCode && sourceEntryId > 0) {
            references.add(`${sourceProgramCode}::${sourceEntryId}`);
          }
          referenceSelections.push({
            sectionSchemaKey: String(section.schemaKey || '').trim() || undefined,
            sectionIndex,
            rowIndex,
            columnKey,
            selectionToken: String(selection.selectionToken || '').trim() || undefined,
            sourceProgramCode: sourceProgramCode || undefined,
            sourceEntryId: sourceEntryId > 0 ? sourceEntryId : undefined,
            sourceEntryTitle: String(selection.sourceEntryTitle || '').trim() || undefined,
            sourceFieldKey: String(selection.sourceFieldKey || '').trim() || undefined,
            sourceFieldIdentity: String(selection.sourceFieldIdentity || '').trim() || undefined,
            value,
            label: String(selection.label || '').trim() || undefined,
            snapshot: sanitizeReferenceSnapshot(selection.snapshot),
          });
        });
      });
    });

    return {
      references: Array.from(references).sort(),
      referenceSelections,
    };
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingEntry(null);
    setEntryTitle('');
    setEntrySummary('');
    setEntryNotes('');
    setEntryTags('');
    setSections(buildDefaultSections(activeProgramSchemaSections));
  };

  const openCreateEditor = () => {
    const defaultContextKey = effectiveSelectedContextKey;
    const context = assignmentContextOptions.find((item) => item.key === defaultContextKey) || null;
    const generatedSections = buildDefaultSections(activeProgramSchemaSections);
    const hydratedSections = usesSheetTemplate
      ? hydrateSheetSections({
          sections: generatedSections,
          schemaMap: activeProgramSchemaMap,
          context,
          academicYearName,
          semesterLabel: activeSemesterLabel,
        })
      : generatedSections;

    setEditingEntry(null);
    setEntryTitle(
      usesSheetTemplate
        ? buildAutoSheetTitle({
            programLabel: effectiveTitle,
            context,
            academicYearName,
            semesterLabel: activeSemesterLabel,
          })
        : '',
    );
    setEntrySummary('');
    setEntryNotes('');
    setEntryTags('');
    setSelectedContextKey(defaultContextKey || '');
    setSections(hydratedSections);
    setIsEditorOpen(true);
  };

  const openEditEditor = (entry: TeachingResourceEntryItem) => {
    const coveredClasses = extractCoveredClasses(entry);
    const matchedContext =
      assignmentContextOptions.find((context) => {
        if (Number(context.subjectId) !== Number(entry.subjectId || 0)) return false;
        const entryClassName = String(entry.className || '').trim().toLowerCase();
        if (String(context.className || '').trim().toLowerCase() === entryClassName) return true;
        if (context.coveredClasses.some((item) => item.trim().toLowerCase() === entryClassName)) return true;
        return (
          coveredClasses.length > 0 &&
          coveredClasses.every((item) => context.coveredClasses.includes(item))
        );
      }) || null;

    setEditingEntry(entry);
    setEntryTitle(String(entry.title || ''));
    setEntrySummary(String(entry.summary || ''));
    setEntryNotes(String(entry.content?.notes || ''));
    setEntryTags((entry.tags || []).join(', '));
    setSections(normalizeSectionsFromEntry(entry, buildDefaultSections(activeProgramSchemaSections)));
    setSelectedContextKey(matchedContext ? matchedContext.key : '');
    setIsEditorOpen(true);
  };

  const mutateSuccess = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ['mobile-learning-resource-entries'] });
    await queryClient.invalidateQueries({ queryKey: ['mobile-learning-resource-summary'] });
    notifySuccess(message);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeYearQuery.data?.id) throw new Error('Tahun ajaran aktif tidak ditemukan.');
      if (!entryTitle.trim()) throw new Error('Judul wajib diisi.');

      const hydratedSections = hydrateSectionsForAssignment(sections);
      const normalizedSections = hydratedSections
        .map((item) => {
          const rows = item.rows
            .map((row) => {
              const values = Object.entries(row.values || {}).reduce<Record<string, string>>((acc, [key, value]) => {
                const normalizedKey = String(key || '').trim();
                if (!normalizedKey) return acc;
                acc[normalizedKey] = String(value ?? '').trim();
                return acc;
              }, {});
              return Object.values(values).some((value) => value) ? values : null;
            })
            .filter((row): row is Record<string, string> => Boolean(row));
          return {
            schemaKey: String(item.schemaKey || '').trim() || undefined,
            title: String(item.title || '').trim(),
            body: String(item.body || '').trim(),
            rows,
          };
        })
        .filter((item) => item.title || item.body || item.rows.length > 0);
      const referencePayload = buildReferenceSelectionPayload(hydratedSections);

      if (!normalizedSections.length) {
        throw new Error('Minimal 1 bagian isi dokumen wajib diisi.');
      }

      return teachingResourceProgramApi.createEntry({
        academicYearId: Number(activeYearQuery.data.id),
        programCode: normalizedProgramCode,
        title: entryTitle.trim(),
        summary: entrySummary.trim() || undefined,
        subjectId: selectedContext ? Number(selectedContext.subjectId) : undefined,
        classLevel: selectedContext ? selectedContext.classLevel : undefined,
        className: selectedContext ? selectedContext.className : undefined,
        tags: entryTags
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
        content: {
          sections: normalizedSections,
          references: referencePayload.references,
          referenceSelections: referencePayload.referenceSelections,
          notes: entryNotes.trim() || undefined,
          schemaVersion: Number(activeProgram?.schema?.version || 1),
          schemaSourceSheet: String(activeProgram?.schema?.sourceSheet || '').trim() || undefined,
          contextScope: selectedContext
            ? {
                assignmentIds: selectedContext.assignmentIds,
                coveredClasses: selectedContext.coveredClasses,
                aggregatedClassName: selectedContext.className,
              }
            : undefined,
        },
      });
    },
    onSuccess: async () => {
      await mutateSuccess('Dokumen perangkat ajar berhasil dibuat.');
      closeEditor();
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal membuat dokumen perangkat ajar.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingEntry?.id) throw new Error('Data edit tidak valid.');
      if (!entryTitle.trim()) throw new Error('Judul wajib diisi.');

      const hydratedSections = hydrateSectionsForAssignment(sections);
      const normalizedSections = hydratedSections
        .map((item) => {
          const rows = item.rows
            .map((row) => {
              const values = Object.entries(row.values || {}).reduce<Record<string, string>>((acc, [key, value]) => {
                const normalizedKey = String(key || '').trim();
                if (!normalizedKey) return acc;
                acc[normalizedKey] = String(value ?? '').trim();
                return acc;
              }, {});
              return Object.values(values).some((value) => value) ? values : null;
            })
            .filter((row): row is Record<string, string> => Boolean(row));
          return {
            schemaKey: String(item.schemaKey || '').trim() || undefined,
            title: String(item.title || '').trim(),
            body: String(item.body || '').trim(),
            rows,
          };
        })
        .filter((item) => item.title || item.body || item.rows.length > 0);
      const referencePayload = buildReferenceSelectionPayload(hydratedSections);

      if (!normalizedSections.length) {
        throw new Error('Minimal 1 bagian isi dokumen wajib diisi.');
      }

      return teachingResourceProgramApi.updateEntry(Number(editingEntry.id), {
        title: entryTitle.trim(),
        summary: entrySummary.trim() || '',
        subjectId: selectedContext ? Number(selectedContext.subjectId) : Number(editingEntry.subjectId || 0) || null,
        classLevel: selectedContext ? selectedContext.classLevel : editingEntry.classLevel || null,
        className: selectedContext ? selectedContext.className : editingEntry.className || null,
        tags: entryTags
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
        content: {
          sections: normalizedSections,
          references: referencePayload.references,
          referenceSelections: referencePayload.referenceSelections,
          notes: entryNotes.trim() || undefined,
          schemaVersion: Number(activeProgram?.schema?.version || 1),
          schemaSourceSheet: String(activeProgram?.schema?.sourceSheet || '').trim() || undefined,
          contextScope: selectedContext
            ? {
                assignmentIds: selectedContext.assignmentIds,
                coveredClasses: selectedContext.coveredClasses,
                aggregatedClassName: selectedContext.className,
              }
            : editingEntry.content?.contextScope,
        },
      });
    },
    onSuccess: async () => {
      await mutateSuccess('Dokumen perangkat ajar berhasil diperbarui.');
      closeEditor();
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal memperbarui dokumen perangkat ajar.');
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (entryId: number) => teachingResourceProgramApi.submitEntry(entryId),
    onSuccess: async () => {
      await mutateSuccess('Dokumen berhasil dikirim untuk review.');
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal mengirim dokumen untuk review.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: number) => teachingResourceProgramApi.deleteEntry(entryId),
    onSuccess: async () => {
      await mutateSuccess('Dokumen perangkat ajar berhasil dihapus.');
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menghapus dokumen perangkat ajar.');
    },
  });

  const onSaveEditor = () => {
    if (editingEntry) {
      void updateMutation.mutateAsync();
      return;
    }
    void createMutation.mutateAsync();
  };

  const resolveSectionSchema = (section: EntrySectionDraft): TeachingResourceProgramSectionSchema | undefined =>
    activeProgramSchemaMap.get(String(section.schemaKey || '').trim());

  const isTableSection = (section: EntrySectionDraft): boolean =>
    (resolveSectionSchema(section)?.editorType || 'TEXT') === 'TABLE';

  const getMinimumRowCount = (section: EntrySectionDraft): number => {
    const schema = resolveSectionSchema(section);
    if (!schema) return 1;
    const defaultRows = Math.max(1, Number(schema.defaultRows || 1));
    const prefillRows = Array.isArray(schema.prefillRows) ? schema.prefillRows.length : 0;
    return Math.max(defaultRows, prefillRows, 1);
  };

  const canAddRowForSection = (section: EntrySectionDraft): boolean => {
    const schema = resolveSectionSchema(section);
    if (!schema) return true;
    const defaultRows = Math.max(1, Number(schema.defaultRows || 1));
    const prefillRows = Array.isArray(schema.prefillRows) ? schema.prefillRows.length : 0;
    const minimumRows = Math.max(defaultRows, prefillRows, 1);
    if (minimumRows <= 1 && !schema.repeatable) return false;
    return true;
  };

  const isSingleRowSheetForm = (section: EntrySectionDraft): boolean => {
    if (!usesSheetTemplate || !isTableSection(section)) return false;
    const schema = resolveSectionSchema(section);
    if (!schema) return false;
    const columns = Array.isArray(schema.columns) ? schema.columns : [];
    if (columns.length === 0 || columns.length > 8) return false;
    return getMinimumRowCount(section) <= 1 && section.rows.length <= 1;
  };

  const canEditSectionTitle = (section: EntrySectionDraft): boolean => {
    const schema = resolveSectionSchema(section);
    if (!schema) return true;
    if ((schema.editorType || 'TEXT') !== 'TABLE') return true;
    return schema.sectionTitleEditable === true;
  };

  const canDeleteSection = (section: EntrySectionDraft): boolean => {
    if (sections.length <= 1) return false;
    const schema = resolveSectionSchema(section);
    if (!schema) return true;
    return schema.repeatable;
  };

  const addSection = () => {
    setSections((prev) => {
      const repeatableSection = activeProgramSchemaSections.find((section) => section.repeatable) || null;
      if (repeatableSection) {
        const repeatableCount = prev.filter(
          (item) => String(item.schemaKey || '').trim() === String(repeatableSection.key || '').trim(),
        ).length;
        return hydrateSectionsForAssignment([...prev, createSection(repeatableSection, repeatableCount)]);
      }
      if (activeProgramSchemaSections.length > 0) return prev;
      return hydrateSectionsForAssignment([...prev, createSection(undefined, prev.length)]);
    });
  };

  const updateSection = (id: string, field: 'title' | 'body', value: string) => {
    setSections((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const addSectionRow = (sectionId: string) => {
    setSections((prev) =>
      hydrateSectionsForAssignment(prev.map((item) => {
        if (item.id !== sectionId) return item;
        if (!canAddRowForSection(item)) return item;
        const schema = resolveSectionSchema(item);
        const columns = Array.isArray(schema?.columns) ? schema.columns : [];
        const nextRow = {
          id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          values: columns.reduce<Record<string, string>>((acc, column) => {
            const key = String(column.key || '').trim();
            if (!key) return acc;
            acc[key] = '';
            return acc;
          }, {}),
        };
        return {
          ...item,
          rows: [...item.rows, nextRow],
        };
      })),
    );
  };

  const updateSectionRow = (sectionId: string, rowId: string, columnKey: string, value: string) => {
    setSections((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        return {
          ...item,
          rows: item.rows.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  values: {
                    ...row.values,
                    [columnKey]: value,
                  },
                }
              : row,
          ),
        };
      }),
    );
  };

  const applyDocumentReferenceSelection = (
    sectionId: string,
    rowId: string,
    sourceColumn: TeachingResourceProgramColumnSchema,
    selectionToken: string,
  ) => {
    setSections((prev) =>
      hydrateSectionsForAssignment(
        prev.map((item) => {
          if (item.id !== sectionId) return item;
          const schema = resolveSectionSchema(item);
          const columns = ensureArray<TeachingResourceProgramColumnSchema>(schema?.columns);
          return {
            ...item,
            rows: item.rows.map((row) => {
              if (row.id !== rowId) return row;
              const columnKey = String(sourceColumn.key || '').trim();
              const referenceOptions =
                referenceOptionsByColumnKey.get(`${String(item.schemaKey || '').trim()}::${columnKey}`) || [];
              const selectedOption = referenceOptions.find((option) => option.selectValue === selectionToken);
              const nextValues = {
                ...row.values,
                [columnKey]: selectedOption?.value || '',
              };
              const nextReferenceSelections = {
                ...(row.referenceSelections || {}),
              };
              if (selectedOption) {
                nextReferenceSelections[columnKey] = {
                  sectionSchemaKey: String(item.schemaKey || '').trim() || undefined,
                  columnKey,
                  selectionToken: selectedOption.selectValue,
                  sourceProgramCode: selectedOption.sourceProgramCode,
                  sourceEntryId: selectedOption.sourceEntryId,
                  sourceEntryTitle: selectedOption.sourceEntryTitle,
                  sourceFieldKey: selectedOption.sourceFieldKey,
                  sourceFieldIdentity: selectedOption.sourceFieldIdentity,
                  value: selectedOption.value,
                  label: selectedOption.label,
                  snapshot: selectedOption.snapshot,
                };
              } else {
                delete nextReferenceSelections[columnKey];
              }

              const selectedSourceProgramCode = normalizeProgramCode(
                selectedOption?.sourceProgramCode || sourceColumn.binding?.sourceProgramCode || '',
              );
              columns.forEach((targetColumn) => {
                const targetKey = String(targetColumn.key || '').trim();
                if (!targetKey || targetKey === columnKey) return;
                const targetSourceType = String(targetColumn.sourceType || '').trim().toUpperCase();
                if (targetSourceType !== 'DOCUMENT_SNAPSHOT') return;
                const targetProgramCode = normalizeProgramCode(targetColumn.binding?.sourceProgramCode || '');
                if (selectedSourceProgramCode && targetProgramCode && targetProgramCode !== selectedSourceProgramCode) return;
                const allowManualOverride = Boolean(targetColumn.binding?.allowManualOverride);
                if (!selectedOption) {
                  if (!allowManualOverride) {
                    nextValues[targetKey] = '';
                  }
                  return;
                }
                if (allowManualOverride && String(nextValues[targetKey] || '').trim()) return;
                const candidates = extractBindingCandidates(targetColumn);
                for (const candidate of candidates) {
                  const resolvedValue = String(selectedOption.snapshot[candidate] || '').trim();
                  if (!resolvedValue) continue;
                  nextValues[targetKey] = resolvedValue;
                  break;
                }
              });

              return {
                ...row,
                values: nextValues,
                referenceSelections: Object.keys(nextReferenceSelections).length > 0 ? nextReferenceSelections : undefined,
              };
            }),
          };
        }),
      ),
    );
  };

  const renderColumnInput = (
    section: EntrySectionDraft,
    row: EntrySectionDraft['rows'][number] | undefined,
    column: TeachingResourceProgramColumnSchema,
  ) => {
    const columnKey = String(column.key || '').trim();
    const value = String(row?.values?.[columnKey] || '');
    const dataType = getColumnDataType(column);
    const readOnly = isSystemManagedColumn(column);
    const referenceSelection = row?.referenceSelections?.[columnKey];
    const referenceOptions =
      referenceOptionsByColumnKey.get(`${String(section.schemaKey || '').trim()}::${columnKey}`) || [];
    const referenceSelectValue =
      String(referenceSelection?.selectionToken || '').trim() ||
      referenceOptions.find((option) => option.value === value)?.selectValue ||
      '';
    const sourceProgramCode = normalizeProgramCode(column.binding?.sourceProgramCode || '');
    const sourceFieldIdentity =
      String(column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity || '').trim();
    const sourceProgramLabel =
      String(programMetaByCode.get(sourceProgramCode)?.label || '').trim() || sourceProgramCode || 'program sumber';
    const hasReferenceBinding = Boolean(sourceProgramCode && sourceFieldIdentity);
    const fallbackReferenceOption =
      referenceSelectValue &&
      !referenceOptions.some((option) => option.selectValue === referenceSelectValue)
        ? {
            selectValue: referenceSelectValue,
            value: String(referenceSelection?.value || value || '').trim(),
            label: String(referenceSelection?.label || referenceSelection?.sourceEntryTitle || value || 'Referensi tersimpan').trim(),
            sourceProgramCode: sourceProgramCode || String(referenceSelection?.sourceProgramCode || '').trim(),
            sourceEntryId: Number(referenceSelection?.sourceEntryId || 0),
            sourceEntryTitle: String(referenceSelection?.sourceEntryTitle || '').trim() || undefined,
            sourceFieldKey: String(referenceSelection?.sourceFieldKey || '').trim() || undefined,
            sourceFieldIdentity: String(referenceSelection?.sourceFieldIdentity || '').trim() || undefined,
            snapshot: {},
          }
        : null;
    const referenceSelectOptions = [...(fallbackReferenceOption ? [fallbackReferenceOption] : []), ...referenceOptions].filter(
      (option, index, collection) =>
        collection.findIndex((candidate) => candidate.selectValue === option.selectValue) === index,
    );
    const disableReferenceSelect =
      !row?.id || !hasReferenceBinding || (referenceSelectOptions.length === 0 && !referenceSelectValue);
    const referencePlaceholder = !hasReferenceBinding
      ? 'Referensi belum dikonfigurasi'
      : referenceSelectOptions.length > 0
        ? 'Pilih Referensi'
        : 'Belum ada data sumber';
    const referenceHelperText = !hasReferenceBinding
      ? 'Wakakur belum melengkapi Program Sumber atau Field Sumber untuk kolom ini.'
      : referenceOptions.length === 0 && referenceSelectValue
        ? `Referensi lama tetap ditampilkan, tetapi saat ini belum ada dokumen ${sourceProgramLabel} lain yang cocok pada konteks ini.`
        : referenceOptions.length === 0
          ? `Belum ada dokumen ${sourceProgramLabel} yang cocok pada konteks mapel, tingkat, program, atau semester aktif.`
          : '';
    const updateValue = (nextValue: string) => {
      if (!row?.id) return;
      updateSectionRow(section.id, row.id, columnKey, nextValue);
    };
    const inputStyle = [
      INPUT_BASE_STYLE,
      column.multiline || dataType === 'TEXTAREA' ? { minHeight: 74 } : null,
      readOnly ? { backgroundColor: '#f8fafc', color: '#475569' } : null,
    ];

    if (readOnly) {
      return (
        <TextInput
          value={value}
          editable={false}
          placeholder={column.placeholder || ''}
          placeholderTextColor="#94a3b8"
          multiline={Boolean(column.multiline) || dataType === 'TEXTAREA'}
          textAlignVertical={column.multiline || dataType === 'TEXTAREA' ? 'top' : 'center'}
          style={inputStyle}
        />
      );
    }

    if (isDocumentReferenceColumn(column)) {
      return (
        <MobileSelectField
          value={referenceSelectValue}
          options={referenceSelectOptions.map((option) => ({ value: option.selectValue, label: option.label }))}
          onChange={(nextValue) => {
            if (!row?.id) return;
            applyDocumentReferenceSelection(section.id, row.id, column, nextValue);
          }}
          placeholder={referencePlaceholder}
          helperText={referenceHelperText || undefined}
          disabled={disableReferenceSelect}
          maxHeight={320}
        />
      );
    }

    if (dataType === 'MONTH') {
      return (
        <MobileSelectField
          value={value}
          options={MONTH_OPTIONS}
          onChange={updateValue}
          placeholder="Pilih bulan"
          maxHeight={260}
        />
      );
    }

    if (dataType === 'WEEK') {
      return (
        <MobileSelectField
          value={value}
          options={WEEK_SELECT_OPTIONS}
          onChange={updateValue}
          placeholder="Pilih minggu"
          maxHeight={260}
        />
      );
    }

    if (dataType === 'SEMESTER') {
      return (
        <MobileSelectField
          value={value}
          options={SEMESTER_OPTIONS}
          onChange={updateValue}
          placeholder="Pilih semester"
        />
      );
    }

    if (dataType === 'SELECT' && Array.isArray(column.options) && column.options.length > 0) {
      return (
        <MobileSelectField
          value={value}
          options={column.options.map((option) => ({ value: option, label: option }))}
          onChange={updateValue}
          placeholder="Pilih"
          maxHeight={260}
        />
      );
    }

    if (dataType === 'WEEK_GRID') {
      const selectedWeeks = new Set(parseWeekGridValue(value));
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: -4 }}>
          {WEEK_OPTIONS.map((week) => {
            const active = selectedWeeks.has(week);
            return (
              <Pressable
                key={`${section.id}-${row?.id || 'row'}-${columnKey}-${week}`}
                onPress={() => updateValue(toggleWeekGridValue(value, week))}
                style={{
                  width: '19%',
                  borderWidth: 1,
                  borderColor: active ? '#34d399' : '#cbd5e1',
                  backgroundColor: active ? '#ecfdf5' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 7,
                  alignItems: 'center',
                  marginRight: '1%',
                  marginTop: 5,
                }}
              >
                <Text
                  style={{
                    color: active ? '#047857' : '#64748b',
                    fontSize: scaleWithAppTextScale(11),
                    fontWeight: '700',
                  }}
                >
                  M{week}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    if (dataType === 'BOOLEAN') {
      const active = ['1', 'true', 'ya', 'yes', 'v', 'x', '✓'].includes(value.trim().toLowerCase());
      return (
        <Pressable
          onPress={() => updateValue(active ? '' : '✓')}
          style={{
            borderWidth: 1,
            borderColor: active ? '#34d399' : '#cbd5e1',
            backgroundColor: active ? '#ecfdf5' : '#fff',
            borderRadius: 10,
            paddingVertical: 9,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: active ? '#047857' : '#64748b', fontWeight: '700' }}>{active ? '✓' : '-'}</Text>
        </Pressable>
      );
    }

    return (
      <TextInput
        value={value}
        onChangeText={updateValue}
        placeholder={column.placeholder || ''}
        placeholderTextColor="#94a3b8"
        keyboardType={dataType === 'NUMBER' ? 'numeric' : 'default'}
        multiline={Boolean(column.multiline) || dataType === 'TEXTAREA'}
        textAlignVertical={column.multiline || dataType === 'TEXTAREA' ? 'top' : 'center'}
        style={inputStyle}
      />
    );
  };

  const removeSectionRow = (sectionId: string, rowId: string) => {
    setSections((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        if (item.rows.length <= getMinimumRowCount(item)) return item;
        return {
          ...item,
          rows: item.rows.filter((row) => row.id !== rowId),
        };
      }),
    );
  };

  const removeSection = (id: string) => {
    setSections((prev) => {
      if (prev.length <= 1) {
        notifyInfo('Minimal harus ada 1 section.');
        return prev;
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const onContextChange = (contextKey: string) => {
    setSelectedContextKey(contextKey);
    if (!isEditorOpen || Boolean(editingEntry) || !usesSheetTemplate) return;
    const nextContext = assignmentContextOptions.find((item) => item.key === contextKey) || null;
    setEntryTitle(
      buildAutoSheetTitle({
        programLabel: effectiveTitle,
        context: nextContext,
        academicYearName,
        semesterLabel: activeSemesterLabel,
      }),
    );
    setSections((prev) =>
      hydrateSheetSections({
        sections: prev,
        schemaMap: activeProgramSchemaMap,
        context: nextContext,
        academicYearName,
        semesterLabel: activeSemesterLabel,
      }),
    );
  };

  const onDeleteEntry = (entry: TeachingResourceEntryItem) => {
    Alert.alert('Hapus dokumen', `Hapus "${entry.title}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void deleteMutation.mutateAsync(entry.id);
        },
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat perangkat ajar..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>{effectiveTitle}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pagePadding}
        refreshControl={
          <RefreshControl
            refreshing={
              activeYearQuery.isFetching ||
              assignmentsQuery.isFetching ||
              programsQuery.isFetching ||
              entriesQuery.isFetching
            }
            onRefresh={() => {
              void activeYearQuery.refetch();
              void assignmentsQuery.refetch();
              void programsQuery.refetch();
              void entriesQuery.refetch();
            }}
          />
        }
      >
        <View
          style={{
            backgroundColor: '#1e3a8a',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.4)',
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <Feather name={icon} size={18} color="#e2e8f0" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: scaleWithAppTextScale(20), fontWeight: '700' }}>{effectiveTitle}</Text>
            <Text style={{ color: '#dbeafe', marginTop: 2 }}>{effectiveDescription}</Text>
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Navigasi Perangkat Ajar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
              {navigationItems.map((item) => {
                const active = item.code === normalizedProgramCode;
                return (
                  <MobileMenuTab
                    key={item.code}
                    active={active}
                    label={item.label}
                    onPress={() => {
                      if (active) return;
                      router.replace(item.route as never);
                    }}
                    minWidth={96}
                  />
                );
              })}
            </View>
          </ScrollView>
        </View>

        {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Mapel & Tingkat</Text>
            {assignmentContextOptions.length > 0 ? (
              <MobileSelectField
                value={effectiveSelectedContextKey}
                options={assignmentOptions}
                onChange={onContextChange}
                placeholder="Pilih mapel & tingkat"
                helperText={
                  selectedContext?.coveredClasses.length
                    ? `Berlaku untuk seluruh rombel terkait: ${selectedContext.coveredClasses.join(', ')}`
                    : undefined
                }
              />
            ) : (
              <Text style={{ color: '#64748b' }}>Belum ada assignment aktif pada tahun ajaran ini.</Text>
            )}
          </View>
        ) : null}

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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Filter Dokumen</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {STATUS_FILTERS.map((item) => {
              const active = item.key === statusFilter;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    setStatusFilter(item.key);
                    setPage(1);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                    backgroundColor: active ? '#e9f1ff' : '#fff',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    marginRight: 8,
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ color: active ? BRAND_COLORS.navy : '#64748b', fontWeight: '600', fontSize: scaleWithAppTextScale(11) }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Cari judul/kelas..."
            placeholderTextColor="#94a3b8"
            style={INPUT_BASE_STYLE}
            onSubmitEditing={() => {
              setSearch(searchInput.trim());
              setPage(1);
            }}
          />

          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Pressable
              onPress={() => {
                setSearch(searchInput.trim());
                setPage(1);
              }}
              style={{
                flex: 1,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#c7d8f6',
                backgroundColor: '#eef4ff',
                paddingVertical: 10,
                alignItems: 'center',
                marginRight: 6,
              }}
            >
              <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Terapkan Filter</Text>
            </Pressable>
            <Pressable
              onPress={openCreateEditor}
              style={{
                flex: 1,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: BRAND_COLORS.blue,
                backgroundColor: BRAND_COLORS.blue,
                paddingVertical: 10,
                alignItems: 'center',
                marginLeft: 6,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Tambah Dokumen</Text>
            </Pressable>
          </View>
        </View>

        {entriesQuery.isLoading ? <QueryStateView type="loading" message="Memuat dokumen perangkat ajar..." /> : null}
        {entriesQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat dokumen perangkat ajar."
            onRetry={() => {
              void entriesQuery.refetch();
            }}
          />
        ) : null}

        {!entriesQuery.isLoading && !entriesQuery.isError ? (
          rows.length > 0 ? (
            <View>
              {rows.map((entry) => {
                const statusMeta = STATUS_META[entry.status] || STATUS_META.DRAFT;
                const coveredClasses = extractCoveredClasses(entry);
                const contextLabel = resolveEntryContextLabel(entry, assignmentContextOptions);
                const canEdit = entry.status === 'DRAFT' || entry.status === 'REJECTED';
                const canSubmit = entry.status === 'DRAFT' || entry.status === 'REJECTED';

                return (
                  <View
                    key={entry.id}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>{entry.title}</Text>
                        {entry.summary ? (
                          <Text style={{ color: '#64748b', marginTop: 2 }}>{entry.summary}</Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: statusMeta.pillBorder,
                          backgroundColor: statusMeta.pillBg,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: statusMeta.pillText, fontWeight: '700', fontSize: scaleWithAppTextScale(11) }}>{statusMeta.label}</Text>
                      </View>
                    </View>

                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 6 }}>Update: {formatDateTime(entry.updatedAt)}</Text>
                    {contextLabel ? (
                      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                        Mapel & Tingkat: {contextLabel}
                      </Text>
                    ) : null}
                    {coveredClasses.length > 0 ? (
                      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                        Cakupan: {coveredClasses.length} rombel ({coveredClasses.join(', ')})
                      </Text>
                    ) : null}

                    <View style={{ flexDirection: 'row', marginTop: 10 }}>
                      <Pressable
                        onPress={() => openEditEditor(entry)}
                        disabled={!canEdit}
                        style={{
                          flex: 1,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: canEdit ? '#c7d8f6' : '#e2e8f0',
                          backgroundColor: canEdit ? '#eef4ff' : '#f8fafc',
                          paddingVertical: 9,
                          alignItems: 'center',
                          marginRight: 6,
                          opacity: canEdit ? 1 : 0.65,
                        }}
                      >
                        <Text style={{ color: canEdit ? BRAND_COLORS.navy : '#94a3b8', fontWeight: '700' }}>Edit</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          if (!canSubmit) return;
                          void submitMutation.mutateAsync(entry.id);
                        }}
                        disabled={!canSubmit || submitMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: canSubmit ? '#86efac' : '#e2e8f0',
                          backgroundColor: canSubmit ? '#ecfdf5' : '#f8fafc',
                          paddingVertical: 9,
                          alignItems: 'center',
                          marginHorizontal: 6,
                          opacity: canSubmit ? 1 : 0.65,
                        }}
                      >
                        <Text style={{ color: canSubmit ? '#166534' : '#94a3b8', fontWeight: '700' }}>Kirim Review</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => onDeleteEntry(entry)}
                        disabled={deleteMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#fecaca',
                          backgroundColor: '#fef2f2',
                          paddingVertical: 9,
                          alignItems: 'center',
                          marginLeft: 6,
                        }}
                      >
                        <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 12,
                padding: 14,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada dokumen</Text>
              <Text style={{ color: '#64748b' }}>
                Belum ada entri perangkat ajar untuk program {effectiveTitle}. Gunakan tombol "Tambah Dokumen".
              </Text>
            </View>
          )
        ) : null}

        {!entriesQuery.isLoading && !entriesQuery.isError && totalPages > 1 ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: '#64748b' }}>
              Halaman {currentPage}/{totalPages} • Total {total} dokumen
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <Pressable
                onPress={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: currentPage <= 1 ? '#f8fafc' : '#fff',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  marginRight: 8,
                  opacity: currentPage <= 1 ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>Sebelumnya</Text>
              </Pressable>
              <Pressable
                onPress={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: currentPage >= totalPages ? '#f8fafc' : '#fff',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  opacity: currentPage >= totalPages ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>Berikutnya</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={isEditorOpen} transparent animationType="slide" onRequestClose={closeEditor}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 14 }}>
          <View
            style={{
              maxHeight: '90%',
              borderRadius: 14,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#e2e8f0',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16) }}>
                {editingEntry ? 'Edit Dokumen' : 'Dokumen Baru'}
              </Text>
              <Pressable onPress={closeEditor} hitSlop={8}>
                <Feather name="x" size={18} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14 }}>
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>Judul Dokumen</Text>
              <TextInput
                value={entryTitle}
                onChangeText={setEntryTitle}
                placeholder={String(activeProgram?.schema?.titleHint || 'Contoh: ATP Semester Genap XII')}
                placeholderTextColor="#94a3b8"
                style={INPUT_BASE_STYLE}
              />

              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4, marginTop: 10 }}>Ringkasan</Text>
              <TextInput
                value={entrySummary}
                onChangeText={setEntrySummary}
                placeholder={String(activeProgram?.schema?.summaryHint || 'Ringkasan dokumen')}
                placeholderTextColor="#94a3b8"
                style={INPUT_BASE_STYLE}
              />

              {!usesSheetTemplate ? (
                <>
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4, marginTop: 10 }}>
                    Tag (pisahkan koma)
                  </Text>
                  <TextInput
                    value={entryTags}
                    onChangeText={setEntryTags}
                    placeholder="cp, semester genap, fase f"
                    placeholderTextColor="#94a3b8"
                    style={INPUT_BASE_STYLE}
                  />

                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4, marginTop: 10 }}>Catatan</Text>
                  <TextInput
                    value={entryNotes}
                    onChangeText={setEntryNotes}
                    placeholder="Catatan tambahan untuk reviewer"
                    placeholderTextColor="#94a3b8"
                    multiline
                    textAlignVertical="top"
                    style={[INPUT_BASE_STYLE, { minHeight: 72 }]}
                  />
                </>
              ) : null}

              <View style={{ marginTop: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Isi Dokumen</Text>
                {sections.map((section, index) => (
                  <View
                    key={section.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 10,
                      backgroundColor: '#f8fbff',
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexShrink: 1, paddingRight: 8 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                          {usesSheetTemplate
                            ? resolveSectionSchema(section)?.label || section.title || `Bagian ${index + 1}`
                            : `Bagian ${index + 1}`}
                        </Text>
                        {resolveSectionSchema(section)?.description ? (
                          <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                            {resolveSectionSchema(section)?.description}
                          </Text>
                        ) : null}
                      </View>
                      {canDeleteSection(section) ? (
                        <Pressable onPress={() => removeSection(section.id)} hitSlop={8}>
                          <Feather name="trash-2" size={15} color="#b91c1c" />
                        </Pressable>
                      ) : null}
                    </View>

                    {canEditSectionTitle(section) ? (
                      <>
                        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4, marginTop: 8 }}>Judul Bagian</Text>
                        <TextInput
                          value={section.title}
                          onChangeText={(value) => updateSection(section.id, 'title', value)}
                          placeholder={resolveSectionSchema(section)?.titlePlaceholder || 'Judul bagian'}
                          placeholderTextColor="#94a3b8"
                          style={INPUT_BASE_STYLE}
                        />
                      </>
                    ) : (
                      <View
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 10,
                          backgroundColor: '#f8fafc',
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: '#334155', fontWeight: '600' }}>
                          {section.title || resolveSectionSchema(section)?.label || `Bagian ${index + 1}`}
                        </Text>
                      </View>
                    )}

                    {isTableSection(section) ? (
                      isSingleRowSheetForm(section) ? (
                        <View
                          style={{
                            marginTop: 8,
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 10,
                            backgroundColor: '#fff',
                            padding: 9,
                          }}
                        >
                          {(resolveSectionSchema(section)?.columns || []).map((column) => {
                            return (
                              <View key={`${section.id}-single-${column.key}`} style={{ marginTop: 8 }}>
                                <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>
                                  {column.label}
                                </Text>
                                {renderColumnInput(section, section.rows[0], column)}
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <View style={{ marginTop: 8 }}>
                          {section.rows.map((row, rowIndex) => (
                            <View
                              key={row.id}
                              style={{
                                borderWidth: 1,
                                borderColor: '#e2e8f0',
                                borderRadius: 10,
                                backgroundColor: '#fff',
                                padding: 9,
                                marginBottom: 7,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), fontWeight: '700' }}>Baris {rowIndex + 1}</Text>
                                <Pressable
                                  onPress={() => removeSectionRow(section.id, row.id)}
                                  disabled={section.rows.length <= getMinimumRowCount(section)}
                                  style={{
                                    opacity: section.rows.length <= getMinimumRowCount(section) ? 0.45 : 1,
                                    borderWidth: 1,
                                    borderColor: '#fecaca',
                                    backgroundColor: '#fef2f2',
                                    borderRadius: 8,
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                  }}
                                >
                                  <Text style={{ color: '#b91c1c', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>Hapus</Text>
                                </Pressable>
                              </View>
                              {(resolveSectionSchema(section)?.columns || []).map((column) => {
                                return (
                                  <View key={`${row.id}-${column.key}`} style={{ marginTop: 8 }}>
                                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>
                                      {column.label}
                                    </Text>
                                    {renderColumnInput(section, row, column)}
                                  </View>
                                );
                              })}
                            </View>
                          ))}
                          {canAddRowForSection(section) ? (
                            <Pressable
                              onPress={() => addSectionRow(section.id)}
                              style={{
                                borderWidth: 1,
                                borderColor: '#c7d8f6',
                                backgroundColor: '#eef4ff',
                                borderRadius: 10,
                                paddingVertical: 9,
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Tambah Baris</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      )
                    ) : (
                      <>
                        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4, marginTop: 8 }}>Isi</Text>
                        <TextInput
                          value={section.body}
                          onChangeText={(value) => updateSection(section.id, 'body', value)}
                          placeholder={resolveSectionSchema(section)?.bodyPlaceholder || 'Isi konten bagian'}
                          placeholderTextColor="#94a3b8"
                          multiline
                          textAlignVertical="top"
                          style={[INPUT_BASE_STYLE, { minHeight: 92 }]}
                        />
                      </>
                    )}
                  </View>
                ))}

                {canAddSection ? (
                  <Pressable
                    onPress={addSection}
                    style={{
                      borderWidth: 1,
                      borderColor: '#c7d8f6',
                      backgroundColor: '#eef4ff',
                      borderRadius: 10,
                      paddingVertical: 9,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Tambah Bagian</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={{ height: 8 }} />
            </ScrollView>

            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: '#e2e8f0',
                flexDirection: 'row',
              }}
            >
              <Pressable
                onPress={closeEditor}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 10,
                  marginRight: 6,
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
              </Pressable>

              <Pressable
                onPress={onSaveEditor}
                disabled={createMutation.isPending || updateMutation.isPending}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: BRAND_COLORS.blue,
                  backgroundColor: BRAND_COLORS.blue,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 10,
                  marginLeft: 6,
                  opacity: createMutation.isPending || updateMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
