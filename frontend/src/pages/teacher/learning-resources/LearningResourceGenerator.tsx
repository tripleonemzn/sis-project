import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Check, Pencil, Plus, Printer, RotateCcw, Save, Send, Trash2, X } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { authService } from '../../../services/auth.service';
import {
  type TeachingResourceColumnDataType,
  type TeachingResourceColumnValueSource,
  type TeachingResourceEntry,
  type TeachingResourceEntryReferenceSelection,
  type TeachingResourceEntryStatus,
  type TeachingResourceFieldBinding,
  type TeachingResourceFieldSourceType,
  type TeachingResourceProgram,
  type TeachingResourceProgramColumnSchema,
  type TeachingResourceProgramDisplayMode,
  type TeachingResourceProgramSectionSchema,
  type TeachingResourceProjectedReferenceOption,
  type TeachingResourceReferenceProjectionRequest,
  type TeachingResourceSignatureDefaults,
  normalizeTeachingResourceProgramCode,
  teachingResourceProgramService,
} from '../../../services/teachingResourceProgram.service';
import {
  formatTeacherAssignmentLabel,
  sortTeacherAssignmentsBySubjectClass,
  teacherAssignmentService,
  type TeacherAssignment,
} from '../../../services/teacherAssignment.service';
import { scheduleService, type ScheduleEntry } from '../../../services/schedule.service';
import UnderlineTabBar from '../../../components/navigation/UnderlineTabBar';

interface LearningResourceGeneratorProps {
  type: string;
  routeSlug?: string;
  title: string;
  description: string;
  editorMode?: 'list' | 'create';
}

type EntrySectionForm = {
  id: string;
  schemaKey?: string;
  title: string;
  body: string;
  columns: EntrySectionColumnForm[];
  rows: EntrySectionRowForm[];
};

type EntrySectionRowForm = {
  id: string;
  values: Record<string, string>;
  referenceSelections?: Record<string, TeachingResourceEntryReferenceSelection>;
};

type EntrySectionColumnForm = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  dataType?: TeachingResourceColumnDataType;
  headerGroupKey?: string;
  headerGroupLabel?: string;
  gridColumnCount?: number;
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
  teacherEditMode?: string;
  exposeAsReference?: boolean;
  isCoreField?: boolean;
};

type ReferenceOption = {
  selectValue: string;
  value: string;
  label: string;
  isAggregate?: boolean;
  lineCount?: number;
  sourceProgramCode: string;
  sourceEntryId: number;
  sourceEntryTitle?: string;
  sourceFieldKey?: string;
  sourceFieldIdentity?: string;
  snapshot: Record<string, string>;
};

type ReferenceProgramMeta = {
  total: number;
  limit: number;
  loaded: number;
};

type MonthWeekColumnMeta = {
  monthKey: string;
  monthLabel: string;
  weekNumber: number;
};

type MonthWeekColumnGroup<TColumn> = {
  monthKey: string;
  monthLabel: string;
  columns: Array<{
    column: TColumn;
    weekNumber: number;
  }>;
};

type MonthWeekColumnLayout<TColumn> = {
  leadingColumns: TColumn[];
  weekGroups: Array<MonthWeekColumnGroup<TColumn>>;
  trailingColumns: TColumn[];
};

type HeaderGroupColumn = {
  key?: unknown;
  label?: unknown;
  headerGroupKey?: unknown;
  headerGroupLabel?: unknown;
};

type HeaderGroupLayout<TColumn extends HeaderGroupColumn> = Array<{
  key: string;
  label: string;
  columns: TColumn[];
  grouped: boolean;
}>;

type AcademicYearDateLike = {
  semester?: string;
  semester1Start?: string | Date | null;
  semester1End?: string | Date | null;
  semester2Start?: string | Date | null;
  semester2End?: string | Date | null;
};

type OutletUser = {
  id?: number;
  role?: string;
} | null;

type EntryFilterStatus = 'ALL' | TeachingResourceEntryStatus;
type EntryViewMode = 'mine' | 'review';

type EntryContextValues = {
  mataPelajaran: string;
  tingkat: string;
  programKeahlian: string;
  semester: string;
  tahunAjaran: string;
};

type EntrySignatureValues = {
  placeDate: string;
  curriculumTitle: string;
  curriculumName: string;
  principalOpening: string;
  principalTitle: string;
  principalName: string;
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

type TeachingLoadContext = {
  weeklyTotalHours: number;
  weeklyClassHours: number;
};

const DOCUMENT_TITLE_QUILL_MODULES = {
  toolbar: [[{ size: ['small', false, 'large', 'huge'] }], [{ align: [] }], ['bold', 'italic', 'underline'], ['clean']],
  history: {
    delay: 300,
    maxStack: 50,
    userOnly: true,
  },
};

const DOCUMENT_TITLE_QUILL_FORMATS = ['align', 'bold', 'italic', 'underline', 'size'];

const ENTRY_LIMIT = 12;
const TEACHING_RESOURCE_PROGRAM_CONFIG_QUERY_KEY = (academicYearId: number) => [
  'teaching-resource-program-config',
  'teacher',
  academicYearId,
];

const STATUS_META: Record<
  TeachingResourceEntryStatus,
  {
    label: string;
    pillClass: string;
  }
> = {
  DRAFT: {
    label: 'Draft',
    pillClass: 'bg-gray-100 text-gray-700 border border-gray-200',
  },
  SUBMITTED: {
    label: 'Menunggu Review',
    pillClass: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  APPROVED: {
    label: 'Disetujui',
    pillClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  REJECTED: {
    label: 'Perlu Revisi',
    pillClass: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
};

const normalizeProgramCode = (rawType: string): string => {
  const normalized = normalizeTeachingResourceProgramCode(rawType);
  if (normalized === 'MODUL' || normalized === 'MODULES') return 'MODUL_AJAR';
  if (normalized === 'MATRIKS') return 'MATRIKS_SEBARAN';
  return normalized;
};

const toProgramConfigArray = (payload: unknown): TeachingResourceProgram[] => {
  if (Array.isArray(payload)) return payload as TeachingResourceProgram[];
  if (!payload || typeof payload !== 'object') return [];
  const normalized = payload as {
    programs?: unknown;
    data?: {
      programs?: unknown;
    };
  };
  if (Array.isArray(normalized.programs)) return normalized.programs as TeachingResourceProgram[];
  if (Array.isArray(normalized.data?.programs)) return normalized.data.programs as TeachingResourceProgram[];
  return [];
};

const isDigitalApprovalOnlySection = (schemaKey?: string, title?: string): boolean => {
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
};

const isLegacySheetHintSection = (schemaKey?: string, title?: string, body?: string): boolean => {
  const key = String(schemaKey || '')
    .trim()
    .toLowerCase();
  const label = String(title || '')
    .trim()
    .toLowerCase();
  const text = String(body || '')
    .trim()
    .toLowerCase();
  if (key === 'sheet_hint' || key === 'mode_sheet_excel') return true;
  if (label.includes('mode sheet excel aktif')) return true;
  if (text.includes('mode sheet excel aktif')) return true;
  return false;
};

const normalizeClassLevel = (raw: unknown): string => {
  const token = String(raw || '').trim().toUpperCase();
  if (!token) return '';
  if (token === '10') return 'X';
  if (token === '11') return 'XI';
  if (token === '12') return 'XII';
  return token;
};

const buildAssignmentAggregateClassName = (assignment: TeacherAssignment): string => {
  const level = normalizeClassLevel(assignment.class?.level);
  const majorCode = String(assignment.class?.major?.code || '').trim().toUpperCase();
  const majorName = String(assignment.class?.major?.name || '').trim();
  const fallbackClassName = String(assignment.class?.name || '').trim();
  const suffix = majorCode || majorName || fallbackClassName.replace(new RegExp(`^${level}\\s*`, 'i'), '').replace(/\s+\d+$/, '').trim();
  return [level, suffix].filter(Boolean).join(' ').trim() || fallbackClassName;
};

const ensureArray = <T,>(value: unknown): T[] => {
  return Array.isArray(value) ? (value as T[]) : [];
};

const normalizeReferenceToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const isMeaningfulReferenceValue = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim();
  return Boolean(normalized && !['-', '—', '–'].includes(normalized));
};

const sanitizeReferenceSnapshot = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const normalizedKey = normalizeReferenceToken(key);
    const resolvedValue = String(rawValue ?? '').trim();
    if (!normalizedKey || !isMeaningfulReferenceValue(resolvedValue)) return acc;
    acc[normalizedKey] = resolvedValue;
    return acc;
  }, {});
};

const buildReferenceSelectionStorageKey = (sectionIndex: number, rowIndex: number, columnKey: string): string =>
  `${sectionIndex}::${rowIndex}::${String(columnKey || '').trim()}`;

const parseEntryReferenceSelections = (entry: TeachingResourceEntry) => {
  const rawSelections = Array.isArray(entry.content?.referenceSelections) ? entry.content.referenceSelections : [];
  return rawSelections.reduce<Map<string, TeachingResourceEntryReferenceSelection>>((acc, item) => {
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
};

const sanitizeSectionColumns = (value: unknown): EntrySectionColumnForm[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.reduce<EntrySectionColumnForm[]>((acc, item, index) => {
    if (!item || typeof item !== 'object') return acc;
    const column = item as {
      key?: unknown;
      label?: unknown;
      placeholder?: unknown;
      multiline?: unknown;
      dataType?: unknown;
      headerGroupKey?: unknown;
      headerGroupLabel?: unknown;
      gridColumnCount?: unknown;
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
    const key =
      String(column.key || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || `col_${index + 1}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    const label = String(column.label || '').trim() || `Kolom ${index + 1}`;
    const placeholder = String(column.placeholder || '').trim();
    acc.push({
      key,
      label,
      placeholder: placeholder || undefined,
      multiline: Boolean(column.multiline),
      dataType: String(column.dataType || '').trim().toUpperCase() as TeachingResourceColumnDataType,
      headerGroupKey: String(column.headerGroupKey || '').trim() || undefined,
      headerGroupLabel: String(column.headerGroupLabel || '').trim() || undefined,
      gridColumnCount: Number.isFinite(Number(column.gridColumnCount)) ? Number(column.gridColumnCount) : undefined,
      semanticKey: String(column.semanticKey || '').trim() || undefined,
      bindingKey: String(column.bindingKey || '').trim() || undefined,
      valueSource: String(column.valueSource || '').trim().toUpperCase() as TeachingResourceColumnValueSource,
      required: Boolean(column.required),
      readOnly: Boolean(column.readOnly),
      options: Array.isArray(column.options)
        ? column.options.map((option) => String(option || '').trim()).filter(Boolean)
        : undefined,
      fieldId: String(column.fieldId || '').trim() || undefined,
      fieldIdentity: String(column.fieldIdentity || '').trim() || undefined,
      sourceType: String(column.sourceType || '').trim().toUpperCase() as TeachingResourceFieldSourceType,
      binding:
        column.binding && typeof column.binding === 'object'
          ? {
              ...(column.binding as TeachingResourceFieldBinding),
            }
          : undefined,
      teacherEditMode: String(column.teacherEditMode || '').trim() || undefined,
      exposeAsReference: Boolean(column.exposeAsReference),
      isCoreField: Boolean(column.isCoreField),
    });
    return acc;
  }, []);
};

const mergeSectionColumnsWithSchema = (
  savedColumns: EntrySectionColumnForm[],
  schemaColumns: EntrySectionColumnForm[],
): EntrySectionColumnForm[] => {
  if (schemaColumns.length === 0) return savedColumns;
  if (savedColumns.length === 0) return schemaColumns;

  const schemaKeys = new Set(schemaColumns.map((column) => String(column.key || '').trim()).filter(Boolean));
  const customSavedColumns = savedColumns.filter((column) => {
    const key = String(column.key || '').trim();
    return key && !schemaKeys.has(key);
  });
  return [...schemaColumns, ...customSavedColumns];
};

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== 'object') return fallback;
  const normalized = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return normalized.response?.data?.message || normalized.message || fallback;
};

const createSection = (
  schema?: TeachingResourceProgramSectionSchema,
  rowIndex = 0,
): EntrySectionForm => {
  const editorType = schema?.editorType === 'TABLE' ? 'TABLE' : 'TEXT';
  const columns = sanitizeSectionColumns(schema?.columns);
  const prefillRows = Array.isArray(schema?.prefillRows) ? schema.prefillRows : [];
  const defaultRowCount = editorType === 'TABLE' ? Math.max(1, Number(schema?.defaultRows || 1)) : 0;
  const resolvedRows =
    editorType === 'TABLE'
      ? (prefillRows.length > 0 ? prefillRows : Array.from({ length: defaultRowCount }, () => ({} as Record<string, string>))).map(
          (prefill, tableRowIndex) => {
            const safePrefill: Record<string, string> = prefill || {};
            const values = columns.reduce<Record<string, string>>((acc, column) => {
              const key = String(column.key || '').trim();
              if (!key) return acc;
              acc[key] = String(safePrefill[key] || '').trim();
              return acc;
            }, {});
            return {
              id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${tableRowIndex}`,
              values,
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
    columns,
    rows: resolvedRows,
  };
};

const buildDefaultSections = (programMeta: TeachingResourceProgram | null): EntrySectionForm[] => {
  const schemaSections = Array.isArray(programMeta?.schema?.sections)
    ? programMeta!.schema!.sections.filter(
        (section) => !isDigitalApprovalOnlySection(String(section.key || '').trim(), String(section.label || '').trim()),
      )
    : [];
  if (schemaSections.length === 0) return [createSection()];

  const generated: EntrySectionForm[] = [];
  schemaSections.forEach((schema) => {
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
};

const resolveProgramDisplayMode = (programMeta: TeachingResourceProgram | null): TeachingResourceProgramDisplayMode => {
  const explicitMode = String(programMeta?.schema?.displayMode || '').trim().toUpperCase();
  if (explicitMode === 'TABS' || explicitMode === 'STACK') return explicitMode;
  const tableSectionCount = Array.isArray(programMeta?.schema?.sections)
    ? programMeta!.schema!.sections.filter((section) => section.editorType === 'TABLE').length
    : 0;
  return tableSectionCount > 1 ? 'TABS' : 'STACK';
};

const getRawCellValueForStorage = (key: string, value: unknown): string => {
  const rawValue = String(value ?? '').replace(/\r\n/g, '\n');
  return parseMonthWeekColumnKey(key) ? rawValue : rawValue.trim();
};

const parseEntrySections = (
  entry: TeachingResourceEntry,
  defaultSections: EntrySectionForm[],
): EntrySectionForm[] => {
  const rawSections = Array.isArray(entry.content?.sections)
    ? entry.content.sections
    : entry.content?.sections && typeof entry.content.sections === 'object'
      ? Object.values(entry.content.sections as Record<string, unknown>)
      : [];
  const referenceSelections = parseEntryReferenceSelections(entry);
  const normalized: EntrySectionForm[] = [];
  rawSections.forEach((section, index) => {
    if (!section || typeof section !== 'object') return;
    const item = section as {
      schemaKey?: unknown;
      title?: unknown;
      body?: unknown;
      columns?: unknown;
      rows?: unknown;
    };
    const schemaKey = String(item.schemaKey || '').trim() || undefined;
    const fallbackSection =
      defaultSections.find((sectionItem) => String(sectionItem.schemaKey || '').trim() === String(schemaKey || '').trim()) ||
      defaultSections[index];
    const parsedColumns = sanitizeSectionColumns(item.columns);
    const fallbackColumns = ensureArray<EntrySectionColumnForm>(fallbackSection?.columns);
    const effectiveColumns = mergeSectionColumnsWithSchema(parsedColumns, fallbackColumns);
    const parsedRows = Array.isArray(item.rows)
      ? item.rows
          .map((rawRow, rowIndex) => {
            if (!rawRow || typeof rawRow !== 'object') return null;
            const values = Object.entries(rawRow as Record<string, unknown>).reduce<Record<string, string>>(
              (acc, [key, value]) => {
                const normalizedKey = String(key || '').trim();
                if (!normalizedKey) return acc;
                acc[normalizedKey] = getRawCellValueForStorage(normalizedKey, value);
                return acc;
              },
              {},
            );
            if (Object.keys(values).length === 0) return null;
            const rowReferenceSelections = Object.fromEntries(
              effectiveColumns
                .map((column) => {
                  const columnKey = String(column.key || '').trim();
                  if (!columnKey) return null;
                  const selection = referenceSelections.get(
                    buildReferenceSelectionStorageKey(index, rowIndex, columnKey),
                  );
                  return selection ? [columnKey, selection] : null;
                })
                .filter((item): item is [string, TeachingResourceEntryReferenceSelection] => Boolean(item)),
            );
            return {
              id: `row-${entry.id}-${index + 1}-${rowIndex + 1}`,
              values,
              referenceSelections: Object.keys(rowReferenceSelections).length > 0 ? rowReferenceSelections : undefined,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
      : [];
    const parsed: EntrySectionForm = {
      id: `section-${entry.id}-${index + 1}`,
      schemaKey,
      title: String(item.title || '').trim(),
      body: String(item.body || '').trim(),
      columns: effectiveColumns,
      rows: parsedRows,
    };
    if (isDigitalApprovalOnlySection(parsed.schemaKey, parsed.title)) return;
    if (isLegacySheetHintSection(parsed.schemaKey, parsed.title, parsed.body)) return;
    if (parsed.title.length === 0 && parsed.body.length === 0 && parsed.rows.length === 0 && parsed.columns.length === 0) return;
    normalized.push(parsed);
  });
  if (normalized.length === 0) return defaultSections;
  const existingSchemaKeys = new Set(normalized.map((section) => String(section.schemaKey || '').trim()).filter(Boolean));
  const missingDefaultSections = defaultSections.filter((section) => {
    const schemaKey = String(section.schemaKey || '').trim();
    return schemaKey && !existingSchemaKeys.has(schemaKey);
  });
  return [...normalized, ...missingDefaultSections];
};

const toEntryRawSections = (entry: TeachingResourceEntry) => {
  const rawSections = Array.isArray(entry.content?.sections)
    ? entry.content.sections
    : entry.content?.sections && typeof entry.content.sections === 'object'
      ? Object.values(entry.content.sections as Record<string, unknown>)
      : [];
  return rawSections
    .map((section) => {
      if (!section || typeof section !== 'object') return null;
      const item = section as {
        schemaKey?: unknown;
        title?: unknown;
        rows?: unknown;
      };
      const rows = Array.isArray(item.rows)
        ? item.rows
            .map((row) => {
              if (!row || typeof row !== 'object') return null;
              return Object.entries(row as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
                const normalizedKey = String(key || '').trim();
                if (!normalizedKey) return acc;
                acc[normalizedKey] = String(value ?? '').trim();
                return acc;
              }, {});
            })
            .filter((row): row is Record<string, string> => Boolean(row))
        : [];
      return {
        schemaKey: String(item.schemaKey || '').trim(),
        title: String(item.title || '').trim(),
        rows,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const toEntryReferenceSections = (entry: TeachingResourceEntry) => {
  const rawSections = Array.isArray(entry.content?.sections)
    ? entry.content.sections
    : entry.content?.sections && typeof entry.content.sections === 'object'
      ? Object.values(entry.content.sections as Record<string, unknown>)
      : [];
  const referenceSelections = parseEntryReferenceSelections(entry);
  return rawSections
    .map((section, sectionIndex) => {
      if (!section || typeof section !== 'object') return null;
      const item = section as {
        schemaKey?: unknown;
        title?: unknown;
        columns?: unknown;
        rows?: unknown;
      };
      const columns = sanitizeSectionColumns(item.columns);
      const rows = Array.isArray(item.rows)
        ? item.rows
            .map((row, rowIndex) => {
              if (!row || typeof row !== 'object') return null;
              const values = Object.entries(row as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
                const normalizedKey = String(key || '').trim();
                if (!normalizedKey) return acc;
                acc[normalizedKey] = getRawCellValueForStorage(normalizedKey, value);
                return acc;
              }, {});
              columns.forEach((column) => {
                const columnKey = String(column.key || '').trim();
                if (!columnKey || isMeaningfulReferenceValue(values[columnKey])) return;
                const selection = referenceSelections.get(
                  buildReferenceSelectionStorageKey(sectionIndex, rowIndex, columnKey),
                );
                if (selection?.value && isMeaningfulReferenceValue(selection.value)) {
                  values[columnKey] = String(selection.value || '').trim();
                }
              });
              return values;
            })
            .filter((row): row is Record<string, string> => Boolean(row))
        : [];
      return {
        schemaKey: String(item.schemaKey || '').trim(),
        title: String(item.title || '').trim(),
        columns,
        rows,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const extractEntryContextValues = (
  entry: TeachingResourceEntry,
  defaults?: Partial<EntryContextValues>,
): EntryContextValues => {
  const fallback: EntryContextValues = {
    mataPelajaran: String(defaults?.mataPelajaran || '').trim(),
    tingkat: String(defaults?.tingkat || '').trim(),
    programKeahlian: String(defaults?.programKeahlian || '').trim(),
    semester: String(defaults?.semester || '').trim(),
    tahunAjaran: String(defaults?.tahunAjaran || '').trim(),
  };
  const contextSection = toEntryRawSections(entry).find((section) => {
    const key = String(section.schemaKey || '').toLowerCase();
    const title = String(section.title || '').toLowerCase();
    return key.includes('konteks') || title.includes('konteks');
  });
  const firstRow = contextSection?.rows?.[0] || {};
  return {
    mataPelajaran: String(firstRow.mata_pelajaran || fallback.mataPelajaran || '').trim(),
    tingkat: String(firstRow.tingkat || fallback.tingkat || '').trim(),
    programKeahlian: String(firstRow.program_keahlian || fallback.programKeahlian || '').trim(),
    semester: String(firstRow.semester || fallback.semester || '').trim(),
    tahunAjaran: String(firstRow.tahun_ajaran || fallback.tahunAjaran || '').trim(),
  };
};

const extractEntrySignatureValues = (
  entry: TeachingResourceEntry,
  defaults?: {
    curriculumTitle?: string;
    curriculumName?: string;
    principalTitle?: string;
    principalName?: string;
  },
): EntrySignatureValues => {
  const signatureSection = toEntryRawSections(entry).find((section) =>
    isDigitalApprovalOnlySection(section.schemaKey, section.title),
  );
  const firstRow = signatureSection?.rows?.[0] || {};
  const curriculumTitle = String(firstRow.pihak_1_jabatan || firstRow.guru_mapel_jabatan || defaults?.curriculumTitle || 'Guru Mata Pelajaran').trim();
  const curriculumName = String(firstRow.pihak_1_nama || defaults?.curriculumName || '-').trim();
  const principalOpening = String(firstRow.pihak_2_awalan || 'Mengetahui,').trim();
  const principalTitle = String(firstRow.pihak_2_jabatan || defaults?.principalTitle || 'Kepala Sekolah').trim();
  const principalName = String(firstRow.pihak_2_nama || defaults?.principalName || '-').trim();
  return {
    placeDate: String(firstRow.tempat_tanggal || '').trim(),
    curriculumTitle,
    curriculumName,
    principalOpening,
    principalTitle,
    principalName,
  };
};

const extractCoveredClasses = (entry: TeachingResourceEntry): string[] => {
  const rawClasses = Array.isArray(entry.content?.contextScope?.coveredClasses)
    ? entry.content.contextScope.coveredClasses
    : [];
  return rawClasses
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' }));
};

const extractReferenceCandidates = (column: Partial<EntrySectionColumnForm> | null | undefined): string[] => {
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
};

const isDocumentReferencePickerColumn = (column: Partial<EntrySectionColumnForm> | null | undefined): boolean =>
  String(column?.sourceType || '').trim().toUpperCase() === 'DOCUMENT_REFERENCE';

const getColumnSourceProgramCode = (column: Partial<EntrySectionColumnForm> | null | undefined): string =>
  normalizeTeachingResourceProgramCode(column?.binding?.sourceProgramCode);

const isSecondaryReferenceColumn = (
  section: { columns?: Array<Partial<EntrySectionColumnForm>> | null },
  column: Partial<EntrySectionColumnForm> | null | undefined,
): boolean => {
  if (!isDocumentReferencePickerColumn(column)) return false;
  const columnKey = String(column?.key || '').trim();
  const sourceProgramCode = getColumnSourceProgramCode(column);
  if (!columnKey || !sourceProgramCode) return false;
  const columns = ensureArray<Partial<EntrySectionColumnForm>>(section.columns);
  const columnIndex = columns.findIndex((item) => String(item.key || '').trim() === columnKey);
  if (columnIndex <= 0) return false;
  return columns.slice(0, columnIndex).some((candidate) => {
    const candidateKey = String(candidate.key || '').trim();
    return candidateKey !== columnKey && isDocumentReferencePickerColumn(candidate) && getColumnSourceProgramCode(candidate) === sourceProgramCode;
  });
};

const shouldRenderDocumentReferencePicker = (
  section: { columns?: Array<Partial<EntrySectionColumnForm>> | null },
  column: Partial<EntrySectionColumnForm> | null | undefined,
): boolean => isDocumentReferencePickerColumn(column) && !isSecondaryReferenceColumn(section, column);

const REFERENCE_IDENTITY_ALIASES: Record<string, string> = {
  tp: 'tujuan_pembelajaran',
  tujuan_pembelajaran: 'tujuan_pembelajaran',
  tujuan_pembelajaran_tp: 'tujuan_pembelajaran',
  dpl: 'dimensi_profil',
  dimensi_profil_lulusan: 'dimensi_profil',
  dimensi_profil: 'dimensi_profil',
  profil_lulusan: 'dimensi_profil',
  materi_pokok: 'konten_materi',
  konten_materi: 'konten_materi',
  konten_materi_pokok: 'konten_materi',
  alokasi_waktu: 'alokasi_jp',
  alokasi_waktu_jp: 'alokasi_jp',
  jumlah_jam: 'alokasi_jp',
  jp: 'alokasi_jp',
};

const CONTEXT_REFERENCE_IDENTITIES = new Set(['mata_pelajaran', 'tingkat', 'program_keahlian', 'semester', 'tahun_ajaran']);

const normalizeReferenceIdentity = (value: unknown): string => {
  const token = normalizeReferenceToken(value);
  return REFERENCE_IDENTITY_ALIASES[token] || token;
};

const getColumnIdentityCandidates = (column: Partial<EntrySectionColumnForm> | null | undefined): string[] => {
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
};

const getProgramReferenceIdentityMap = (program: TeachingResourceProgram | undefined): Map<string, string> => {
  const map = new Map<string, string>();
  ensureArray<TeachingResourceProgramSectionSchema>(program?.schema?.sections).forEach((section) => {
    if ((section.editorType || 'TABLE') !== 'TABLE') return;
    ensureArray<TeachingResourceProgramColumnSchema>(section.columns).forEach((column) => {
      const sourceValue = String(column.fieldIdentity || column.semanticKey || column.bindingKey || column.key || '').trim();
      const sourceLabel = String(column.label || '').trim();
      const normalizedValue = normalizeReferenceIdentity(sourceValue);
      if (normalizedValue && !map.has(normalizedValue)) map.set(normalizedValue, normalizeReferenceToken(sourceValue) || normalizedValue);
      const normalizedLabel = normalizeReferenceIdentity(sourceLabel);
      if (normalizedLabel && !map.has(normalizedLabel)) map.set(normalizedLabel, normalizeReferenceToken(sourceValue) || normalizedLabel);
    });
  });
  return map;
};

const getReferenceSourceCoverageCount = (
  sourceProgramCode: string,
  sectionColumns: TeachingResourceProgramColumnSchema[],
  programMetaByCode: Map<string, TeachingResourceProgram>,
): number => {
  const identityMap = getProgramReferenceIdentityMap(programMetaByCode.get(sourceProgramCode));
  if (identityMap.size === 0) return 0;
  return sectionColumns.filter((column) =>
    getColumnIdentityCandidates(column)
      .filter((candidate) => !CONTEXT_REFERENCE_IDENTITIES.has(candidate))
      .some((candidate) => Boolean(identityMap.get(candidate))),
  ).length;
};

const resolveBestReferenceSource = (
  column: TeachingResourceProgramColumnSchema,
  sectionColumns: TeachingResourceProgramColumnSchema[],
  programMetaByCode: Map<string, TeachingResourceProgram>,
): { sourceProgramCode: string; sourceFieldIdentity: string } | null => {
  const currentSourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
  const currentSourceIdentity = normalizeReferenceIdentity(
    column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity,
  );
  const localCandidates = getColumnIdentityCandidates(column).filter((candidate) => !CONTEXT_REFERENCE_IDENTITIES.has(candidate));
  const sourceProgramCodes = Array.from(
    new Set(
      [
        currentSourceProgramCode,
        ...sectionColumns.map((item) => normalizeTeachingResourceProgramCode(item.binding?.sourceProgramCode)),
      ].filter(Boolean),
    ),
  );

  let best: { sourceProgramCode: string; sourceFieldIdentity: string; score: number } | null = null;
  sourceProgramCodes.forEach((sourceProgramCode) => {
    const identityMap = getProgramReferenceIdentityMap(programMetaByCode.get(sourceProgramCode));
    localCandidates.forEach((candidate) => {
      const sourceFieldIdentity = identityMap.get(candidate);
      if (!sourceFieldIdentity) return;
      let score = 10 + getReferenceSourceCoverageCount(sourceProgramCode, sectionColumns, programMetaByCode) * 10;
      if (sourceProgramCode === currentSourceProgramCode && currentSourceIdentity === candidate) score += 4;
      if (sourceProgramCode === currentSourceProgramCode && currentSourceIdentity && !CONTEXT_REFERENCE_IDENTITIES.has(currentSourceIdentity)) {
        score += 1;
      }
      if (sourceProgramCode !== currentSourceProgramCode && CONTEXT_REFERENCE_IDENTITIES.has(currentSourceIdentity)) score += 4;
      const isUsedBySibling = sectionColumns.some(
        (item) => normalizeTeachingResourceProgramCode(item.binding?.sourceProgramCode) === sourceProgramCode && item.key !== column.key,
      );
      if (isUsedBySibling) score += 6;
      if (!best || score > best.score) {
        best = { sourceProgramCode, sourceFieldIdentity, score };
      }
    });
  });

  if (!best) return null;
  const resolved = best as { sourceProgramCode: string; sourceFieldIdentity: string; score: number };
  return { sourceProgramCode: resolved.sourceProgramCode, sourceFieldIdentity: resolved.sourceFieldIdentity };
};

const normalizeTeacherReferenceSections = (
  sections: TeachingResourceProgramSectionSchema[],
  programMetaByCode: Map<string, TeachingResourceProgram>,
  currentProgramCode = '',
): TeachingResourceProgramSectionSchema[] =>
  sections.map((section) => {
    const columns = ensureArray<TeachingResourceProgramColumnSchema>(section.columns);
    if ((section.editorType || 'TABLE') !== 'TABLE' || columns.length === 0) return section;

    let nextColumns = columns.map((column) => ({ ...column, binding: column.binding ? { ...column.binding } : undefined }));
    const normalizedCurrentProgramCode = normalizeTeachingResourceProgramCode(currentProgramCode);
    const hasMonthWeekLayout = Boolean(buildMonthWeekColumnLayout(nextColumns));
    if (normalizedCurrentProgramCode === 'PROMES' && hasMonthWeekLayout) {
      const preferredSourceProgramCode = programMetaByCode.has('PROTA')
        ? 'PROTA'
        : programMetaByCode.has('ATP')
          ? 'ATP'
          : '';
      if (preferredSourceProgramCode) {
        nextColumns = nextColumns.map((column) => {
          const candidates = getColumnIdentityCandidates(column);
          if (candidates.includes('tujuan_pembelajaran') && !isDocumentReferencePickerColumn(column)) {
            return {
              ...column,
              sourceType: 'DOCUMENT_REFERENCE' as const,
              valueSource: 'MANUAL' as const,
              readOnly: false,
              teacherEditMode: 'TEACHER_EDITABLE' as const,
              binding: {
                ...(column.binding || {}),
                sourceProgramCode: preferredSourceProgramCode,
                sourceFieldIdentity: 'tujuan_pembelajaran',
                sourceDocumentFieldIdentity: 'tujuan_pembelajaran',
                filterByContext: true,
                matchBySubject: true,
                matchByClassLevel: true,
                matchByMajor: true,
                matchByActiveSemester: false,
                selectionMode: 'PICK_SINGLE',
                syncMode: 'SNAPSHOT_ON_SELECT',
              },
            };
          }
          if (candidates.includes('alokasi_jp')) {
            return {
              ...column,
              sourceType: 'DOCUMENT_SNAPSHOT' as const,
              valueSource: 'BOUND' as const,
              readOnly: true,
              teacherEditMode: 'SYSTEM_LOCKED' as const,
              binding: {
                ...(column.binding || {}),
                sourceProgramCode: preferredSourceProgramCode,
                sourceFieldIdentity: 'alokasi_jp',
                sourceDocumentFieldIdentity: 'alokasi_jp',
                filterByContext: true,
                matchBySubject: true,
                matchByClassLevel: true,
                matchByMajor: true,
                matchByActiveSemester: false,
                selectionMode: 'PICK_SINGLE',
                syncMode: 'SNAPSHOT_ON_SELECT',
                allowManualOverride: false,
              },
            };
          }
          return column;
        });
      }
    }
    nextColumns = nextColumns.map((column) => {
      const sourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
      const sourceFieldIdentity = normalizeReferenceIdentity(
        column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity,
      );
      const sourceType = String(column.sourceType || '').trim().toUpperCase();
      if (!sourceProgramCode || !sourceFieldIdentity || sourceType !== 'MANUAL') return column;
      return {
        ...column,
        sourceType: 'DOCUMENT_REFERENCE' as const,
        valueSource: 'MANUAL' as const,
        readOnly: false,
        teacherEditMode: 'TEACHER_EDITABLE' as const,
        binding: {
          ...(column.binding || {}),
          sourceProgramCode,
          sourceFieldIdentity,
          sourceDocumentFieldIdentity: sourceFieldIdentity,
          selectionMode: column.binding?.selectionMode || 'PICK_SINGLE',
          syncMode: column.binding?.syncMode || 'SNAPSHOT_ON_SELECT',
        },
      };
    });

    const hasReferencePicker = nextColumns.some(isDocumentReferencePickerColumn);

    if (!hasReferencePicker) {
      const promotedIndex = nextColumns.findIndex((column) => {
        if (String(column.sourceType || '').trim().toUpperCase() !== 'DOCUMENT_SNAPSHOT') return false;
        return Boolean(resolveBestReferenceSource(column, nextColumns, programMetaByCode));
      });
      if (promotedIndex >= 0) {
        const promoted = nextColumns[promotedIndex];
        const bestSource = resolveBestReferenceSource(promoted, nextColumns, programMetaByCode);
        if (bestSource) {
          nextColumns[promotedIndex] = {
            ...promoted,
            sourceType: 'DOCUMENT_REFERENCE' as const,
            valueSource: 'MANUAL' as const,
            readOnly: false,
            teacherEditMode: 'TEACHER_EDITABLE' as const,
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

    nextColumns = nextColumns.map((column) => {
      if (!isDocumentReferencePickerColumn(column)) return column;
      const bestSource = resolveBestReferenceSource(column, nextColumns, programMetaByCode);
      if (!bestSource) return column;
      const currentSourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
      const currentSourceIdentity = normalizeReferenceIdentity(
        column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity,
      );
      if (
        currentSourceProgramCode === bestSource.sourceProgramCode &&
        currentSourceIdentity === normalizeReferenceIdentity(bestSource.sourceFieldIdentity)
      ) {
        return column;
      }
      return {
        ...column,
        binding: {
          ...(column.binding || {}),
          sourceProgramCode: bestSource.sourceProgramCode,
          sourceFieldIdentity: bestSource.sourceFieldIdentity,
          sourceDocumentFieldIdentity: bestSource.sourceFieldIdentity,
          selectionMode: column.binding?.selectionMode || 'PICK_SINGLE',
          syncMode: 'SNAPSHOT_ON_SELECT',
        },
      };
    });

    const primaryReference = nextColumns.find(isDocumentReferencePickerColumn);
    const primarySourceProgramCode = normalizeTeachingResourceProgramCode(primaryReference?.binding?.sourceProgramCode);
    const primarySourceIdentityMap = getProgramReferenceIdentityMap(programMetaByCode.get(primarySourceProgramCode));
    if (primarySourceProgramCode && primarySourceIdentityMap.size > 0) {
      nextColumns = nextColumns.map((column) => {
        if (isDocumentReferencePickerColumn(column)) return column;
        if (String(column.sourceType || '').trim().toUpperCase() !== 'DOCUMENT_SNAPSHOT') return column;
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

const buildReferenceSnapshot = (
  columns: Array<Partial<EntrySectionColumnForm>>,
  row: Record<string, string>,
  baseSnapshot: Record<string, string> = {},
): Record<string, string> => {
  const snapshot: Record<string, string> = { ...baseSnapshot };
  columns.forEach((column) => {
    const key = String(column.key || '').trim();
    const value = String(row[key] || '').trim();
    if (!key || !isMeaningfulReferenceValue(value)) return;
    const tokens = new Set<string>([
      normalizeReferenceToken(key),
      ...extractBindingCandidates(column as EntrySectionColumnForm),
      ...extractReferenceCandidates(column),
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
};

const buildEntryContextSnapshot = (
  entry: TeachingResourceEntry,
  defaults?: Partial<EntryContextValues>,
): Record<string, string> => {
  const contextValues = extractEntryContextValues(entry, defaults);
  return {
    mata_pelajaran: contextValues.mataPelajaran,
    tingkat: contextValues.tingkat,
    program_keahlian: contextValues.programKeahlian,
    semester: contextValues.semester,
    tahun_ajaran: contextValues.tahunAjaran,
  };
};

const isGenericSubjectContextValue = (value: unknown): boolean => {
  const normalized = normalizeReferenceToken(value);
  if (!normalized) return true;
  return ['konsentrasi_keahlian', 'mata_pelajaran', 'mapel', 'subject'].includes(normalized);
};

const extractEntryReferencePointers = (
  entry: TeachingResourceEntry,
): Array<{ programCode: string; entryId: number }> => {
  const pointers = new Map<string, { programCode: string; entryId: number }>();
  ensureArray<string>(entry.content?.references).forEach((rawReference) => {
    const [programCodeRaw, entryIdRaw] = String(rawReference || '').split('::');
    const programCode = normalizeTeachingResourceProgramCode(programCodeRaw);
    const entryId = Number(entryIdRaw || 0);
    if (programCode && entryId > 0) pointers.set(`${programCode}::${entryId}`, { programCode, entryId });
  });
  ensureArray<TeachingResourceEntryReferenceSelection>(entry.content?.referenceSelections).forEach((selection) => {
    const programCode = normalizeTeachingResourceProgramCode(selection.sourceProgramCode);
    const entryId = Number(selection.sourceEntryId || 0);
    if (programCode && entryId > 0) pointers.set(`${programCode}::${entryId}`, { programCode, entryId });
  });
  return Array.from(pointers.values());
};

const getReferenceRowLineCount = (row: Record<string, string>): number =>
  Math.max(1, ...Object.values(row).map((rawValue) => splitCellLines(rawValue).filter(isMeaningfulReferenceValue).length));

const formatReferenceOptionLabel = (value: unknown, fallback = 'Referensi tersimpan'): string => {
  const firstLine = splitCellLines(value)
    .map((line) => line.trim())
    .find(isMeaningfulReferenceValue);
  return firstLine || fallback;
};

const getFirstReferenceValueLine = (value: unknown): string =>
  splitCellLines(value)
    .map((line) => line.trim())
    .find(isMeaningfulReferenceValue) || String(value || '').trim();

const truncateReferenceOptionSegment = (value: string, maxLength = 72): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const formatGroupedReferenceOptionLabel = (
  value: unknown,
  fallback = 'Referensi tersimpan',
  lineCount?: number,
  isAggregate?: boolean,
): string => {
  const lines = splitCellLines(value)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(isMeaningfulReferenceValue);
  const totalLines = Math.max(Number(lineCount || 0), lines.length);
  if ((isAggregate || totalLines > 1 || lines.length > 1) && lines.length > 1) {
    const firstLine = truncateReferenceOptionSegment(lines[0]);
    const lastLine = truncateReferenceOptionSegment(lines[lines.length - 1]);
    if (firstLine === lastLine) return `${firstLine} (${totalLines} baris)`;
    return `${firstLine} s.d. ${lastLine} (${totalLines} baris)`;
  }
  return formatReferenceOptionLabel(value || fallback, fallback);
};

const buildReferenceSnapshotForLine = (snapshot: Record<string, string>, lineIndex: number): Record<string, string> =>
  Object.entries(snapshot || {}).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const lines = parseMonthWeekColumnKey(key)
      ? splitEditableCellLines(rawValue)
      : splitCellLines(rawValue).filter((line) => line.trim().length > 0);
    acc[key] =
      lines.length > 1
        ? getRawCellValueForStorage(key, lines[Math.min(lineIndex, lines.length - 1)])
        : getRawCellValueForStorage(key, rawValue);
    return acc;
  }, {});

const splitReferenceOptionsIntoLineOptions = (options: ReferenceOption[]): ReferenceOption[] => {
  const nextOptions: ReferenceOption[] = [];
  const seen = new Set<string>();
  options.forEach((option) => {
    const valueLines = splitCellLines(option.value)
      .map((line) => line.trim())
      .filter(isMeaningfulReferenceValue);
    if (valueLines.length <= 1) {
      const token = String(option.selectValue || '').trim();
      if (token && !seen.has(token)) {
        seen.add(token);
        nextOptions.push(option);
      }
      return;
    }
    valueLines.forEach((line, lineIndex) => {
      const selectValue = `${option.selectValue}::LINE::${lineIndex + 1}`;
      if (seen.has(selectValue)) return;
      seen.add(selectValue);
      nextOptions.push({
        ...option,
        selectValue,
        value: line,
        label: formatReferenceOptionLabel(line),
        isAggregate: false,
        lineCount: undefined,
        snapshot: buildReferenceSnapshotForLine(option.snapshot || {}, lineIndex),
      });
    });
  });
  return nextOptions;
};

const getSnapshotValueForColumn = (snapshot: Record<string, string> | undefined, column: EntrySectionColumnForm): string => {
  if (!snapshot) return '';
  const candidates = new Set<string>([
    ...extractBindingCandidates(column),
    ...extractReferenceCandidates(column),
    ...getColumnIdentityCandidates(column),
  ]);
  for (const candidate of candidates) {
    const resolvedValue = String(snapshot[candidate] || '').trim();
    if (isMeaningfulReferenceValue(resolvedValue)) return resolvedValue;
  }
  return '';
};

const resolveEntryContextLabel = (
  entry: TeachingResourceEntry,
  assignmentLabelMap: Map<string, string>,
): string => {
  const scopeClassName =
    String(entry.content?.contextScope?.aggregatedClassName || '').trim() || String(entry.className || '').trim();
  return (
    assignmentLabelMap.get(`${Number(entry.subjectId || 0)}::${scopeClassName}`) ||
    [entry.classLevel, scopeClassName].filter(Boolean).join(' - ') ||
    '-'
  );
};

const formatDateTime = (value?: string | null): string => {
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
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toDocumentTitlePlainText = (value: unknown): string => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(rawValue, 'text/html');
    return String((parsed.body as HTMLElement).innerText || parsed.body.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return rawValue
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const createDocumentTitleHtml = (value: unknown): string => {
  const plainText = toDocumentTitlePlainText(value);
  return plainText ? `<p>${escapeHtml(plainText)}</p>` : '';
};

const sanitizeDocumentTitleHtml = (value: unknown): string => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return createDocumentTitleHtml(rawValue);
  }

  const wrapper = new DOMParser().parseFromString(`<div>${rawValue}</div>`, 'text/html').body
    .firstElementChild as HTMLElement | null;
  if (!wrapper) return createDocumentTitleHtml(rawValue);

  const allowedTags = new Set(['P', 'DIV', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'BR']);
  const allowedClasses = new Set([
    'ql-align-center',
    'ql-align-right',
    'ql-align-justify',
    'ql-size-small',
    'ql-size-large',
    'ql-size-huge',
  ]);

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    Array.from(element.childNodes).forEach(sanitizeNode);

    if (!allowedTags.has(element.tagName)) {
      const fragment = document.createDocumentFragment();
      while (element.firstChild) {
        fragment.appendChild(element.firstChild);
      }
      element.replaceWith(fragment);
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name === 'class') {
        const safeClasses = String(attribute.value || '')
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => allowedClasses.has(token));
        if (safeClasses.length > 0) {
          element.setAttribute('class', safeClasses.join(' '));
        } else {
          element.removeAttribute('class');
        }
        return;
      }
      element.removeAttribute(attribute.name);
    });
  };

  Array.from(wrapper.childNodes).forEach(sanitizeNode);
  const normalizedHtml = wrapper.innerHTML.trim();
  const normalizedText = toDocumentTitlePlainText(normalizedHtml);
  if (!normalizedText) return '';
  return normalizedHtml || createDocumentTitleHtml(normalizedText);
};

const formatMultilineHtml = (value: unknown): string => {
  const safe = escapeHtml(value);
  return safe.replace(/\n/g, '<br />');
};

const splitCellLines = (value: unknown, options: { trimTrailingBlank?: boolean } = {}): string[] => {
  const { trimTrailingBlank = true } = options;
  const lines = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  if (trimTrailingBlank) {
    while (lines.length > 1 && !String(lines[lines.length - 1] || '').trim()) lines.pop();
  }
  return lines.length > 0 ? lines : [''];
};

const splitEditableCellLines = (value: unknown): string[] => splitCellLines(value, { trimTrailingBlank: false });

const buildReferenceSelectionLineKey = (columnKey: string, lineIndex: number): string =>
  lineIndex > 0 ? `${columnKey}__line_${lineIndex}` : columnKey;

const setCellLineValue = (value: unknown, lineIndex: number, nextLineValue: unknown): string => {
  const safeLineIndex = Math.max(0, Number(lineIndex) || 0);
  const lines = splitEditableCellLines(value);
  while (lines.length <= safeLineIndex) lines.push('');
  lines[safeLineIndex] = String(nextLineValue ?? '');
  while (lines.length > safeLineIndex + 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
};

const formatStablePlaceDate = (value?: string | null): string => {
  const date = value ? new Date(value) : new Date();
  return `Bekasi, ${formatLongDate(Number.isNaN(date.getTime()) ? new Date() : date)}`;
};

const formatWeekGridPrintHtml = (value: unknown): string => {
  const selectedWeeks = new Set(parseWeekGridValue(value));
  if (selectedWeeks.size === 0) return '-';
  const cells = WEEK_OPTIONS.map((week) => {
    const active = selectedWeeks.has(week);
    return `<span class="week-grid-cell${active ? ' is-active' : ''}">M${escapeHtml(week)}</span>`;
  }).join('');
  return `<div class="week-grid-print">${cells}</div><div class="week-grid-summary">${escapeHtml(formatWeekGridPrintValue(value))}</div>`;
};

const formatCellPrintHtml = (value: unknown, column?: EntrySectionColumnForm): string => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '-';
  const dataType = getColumnDataType(column);
  if (dataType === 'WEEK_GRID') return formatWeekGridPrintHtml(rawValue);
  if (dataType === 'WEEK') return escapeHtml(/^\d+$/.test(rawValue) ? `Minggu ${rawValue}` : rawValue);
  if (dataType === 'BOOLEAN') return isTruthyMark(rawValue) ? MARK_VALUE : '-';
  if (dataType === 'NUMBER') return escapeHtml(formatNumericValue(parseNumber(rawValue)));
  return formatMultilineHtml(rawValue);
};

const formatMonthWeekPrintCellHtml = (value: unknown): string => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  if (isTruthyMark(rawValue)) return MARK_VALUE;
  return `<span class="month-week-cell-text">${escapeHtml(rawValue.replace(/\s+/g, ' '))}</span>`;
};

const resolveSemesterLabel = (semester: unknown): string => {
  const token = String(semester || '').trim().toUpperCase();
  if (!token) return '';
  if (token === 'ODD' || token === 'GANJIL') return 'Ganjil';
  if (token === 'EVEN' || token === 'GENAP') return 'Genap';
  return token;
};

const WEEK_COLUMN_PREFIXES = [
  'minggu_',
  'januari_',
  'februari_',
  'maret_',
  'april_',
  'mei_',
  'juni_',
  'juli_',
  'agustus_',
  'september_',
  'oktober_',
  'nopember_',
  'desember_',
];

const MONTH_WEEK_COLUMN_LABELS: Record<string, string> = {
  januari: 'Januari',
  februari: 'Februari',
  maret: 'Maret',
  april: 'April',
  mei: 'Mei',
  juni: 'Juni',
  juli: 'Juli',
  agustus: 'Agustus',
  september: 'September',
  oktober: 'Oktober',
  nopember: 'November',
  november: 'November',
  desember: 'Desember',
};

const MONTH_WEEK_ORDER = [
  'januari',
  'februari',
  'maret',
  'april',
  'mei',
  'juni',
  'juli',
  'agustus',
  'september',
  'oktober',
  'november',
  'desember',
];

const MONTH_WEEK_INDEX_BY_KEY = new Map(MONTH_WEEK_ORDER.map((monthKey, index) => [monthKey, index]));

const normalizeMonthWeekKey = (value: unknown): string => {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'nopember') return 'november';
  return key;
};

const toUtcDateOnly = (value: unknown): Date | null => {
  if (!value) return null;
  const rawDate = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(rawDate.getTime())) return null;
  return new Date(Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate()));
};

const addUtcDays = (date: Date, days: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

const startOfUtcWeekMonday = (date: Date): Date => {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addUtcDays(date, diff);
};

const getSemesterDateWindow = (
  academicYear: AcademicYearDateLike | null | undefined,
  semester: 'ODD' | 'EVEN',
): { start: Date; end: Date } | null => {
  const start = toUtcDateOnly(semester === 'EVEN' ? academicYear?.semester2Start : academicYear?.semester1Start);
  const end = toUtcDateOnly(semester === 'EVEN' ? academicYear?.semester2End : academicYear?.semester1End);
  if (!start || !end || start.getTime() > end.getTime()) return null;
  return { start, end };
};

const resolveMonthWeekSemesterFromSection = (
  section: Pick<EntrySectionForm, 'schemaKey' | 'title'> | Pick<TeachingResourceProgramSectionSchema, 'key' | 'label'>,
  fallbackSemester: unknown,
): 'ODD' | 'EVEN' => {
  const normalizedSection = section as {
    schemaKey?: unknown;
    title?: unknown;
    key?: unknown;
    label?: unknown;
  };
  const sectionToken = `${normalizedSection.schemaKey || normalizedSection.key || ''} ${
    normalizedSection.title || normalizedSection.label || ''
  }`.toLowerCase();
  if (sectionToken.includes('genap') || sectionToken.includes('semester_2') || sectionToken.includes('semester 2')) {
    return 'EVEN';
  }
  if (sectionToken.includes('ganjil') || sectionToken.includes('semester_1') || sectionToken.includes('semester 1')) {
    return 'ODD';
  }
  const normalized = String(fallbackSemester || '').trim().toUpperCase();
  return normalized === 'EVEN' || normalized === 'GENAP' ? 'EVEN' : 'ODD';
};

const buildAutoMonthWeekCounts = (
  academicYear: AcademicYearDateLike | null | undefined,
  semester: 'ODD' | 'EVEN',
): Map<string, number> => {
  const window = getSemesterDateWindow(academicYear, semester);
  const counts = new Map<string, number>();
  if (!window) return counts;

  for (
    let weekStart = startOfUtcWeekMonday(window.start);
    weekStart.getTime() <= window.end.getTime();
    weekStart = addUtcDays(weekStart, 7)
  ) {
    const weekEnd = addUtcDays(weekStart, 6);
    const overlapStart = weekStart.getTime() < window.start.getTime() ? window.start : weekStart;
    const overlapEnd = weekEnd.getTime() > window.end.getTime() ? window.end : weekEnd;
    if (overlapStart.getTime() > overlapEnd.getTime()) continue;

    const dayCounts = new Map<string, number>();
    for (let cursor = overlapStart; cursor.getTime() <= overlapEnd.getTime(); cursor = addUtcDays(cursor, 1)) {
      const monthKey = MONTH_WEEK_ORDER[cursor.getUTCMonth()];
      dayCounts.set(monthKey, (dayCounts.get(monthKey) || 0) + 1);
    }

    const assignedMonth =
      Array.from(dayCounts.entries()).sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return (MONTH_WEEK_INDEX_BY_KEY.get(left[0]) || 0) - (MONTH_WEEK_INDEX_BY_KEY.get(right[0]) || 0);
      })[0]?.[0] || MONTH_WEEK_ORDER[overlapStart.getUTCMonth()];
    counts.set(assignedMonth, (counts.get(assignedMonth) || 0) + 1);
  }

  return counts;
};

const parseMonthWeekColumnKey = (columnKey: unknown): MonthWeekColumnMeta | null => {
  const key = String(columnKey || '').trim().toLowerCase();
  const match = key.match(/^([a-z]+)_(\d{1,2})$/);
  if (!match) return null;
  const monthKey = match[1];
  const normalizedMonthKey = normalizeMonthWeekKey(monthKey);
  const monthLabel = MONTH_WEEK_COLUMN_LABELS[monthKey] || MONTH_WEEK_COLUMN_LABELS[normalizedMonthKey];
  const weekNumber = Number(match[2]);
  if (!monthLabel || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 6) return null;
  return { monthKey, monthLabel, weekNumber };
};

const buildMonthWeekColumnLayout = <TColumn extends { key?: unknown }>(
  columns: TColumn[],
): MonthWeekColumnLayout<TColumn> | null => {
  const leadingColumns: TColumn[] = [];
  const trailingColumns: TColumn[] = [];
  const weekGroups: Array<MonthWeekColumnGroup<TColumn>> = [];
  let hasSeenWeekColumn = false;

  columns.forEach((column) => {
    const parsed = parseMonthWeekColumnKey(column.key);
    if (!parsed) {
      if (hasSeenWeekColumn) {
        trailingColumns.push(column);
      } else {
        leadingColumns.push(column);
      }
      return;
    }

    hasSeenWeekColumn = true;
    const canonicalMonthKey = normalizeMonthWeekKey(parsed.monthKey);
    const existingGroup = weekGroups.find((group) => normalizeMonthWeekKey(group.monthKey) === canonicalMonthKey);
    if (existingGroup) {
      existingGroup.columns.push({ column, weekNumber: parsed.weekNumber });
      return;
    }

    weekGroups.push({
      monthKey: canonicalMonthKey,
      monthLabel: parsed.monthLabel,
      columns: [{ column, weekNumber: parsed.weekNumber }],
    });
  });

  const weekColumnCount = weekGroups.reduce((total, group) => total + group.columns.length, 0);
  if (weekGroups.length === 0 || weekColumnCount < 2) return null;
  return { leadingColumns, weekGroups, trailingColumns };
};

const normalizeHeaderGroupKey = (value: unknown, fallback: unknown): string => {
  const source = String(value || fallback || '').trim().toLowerCase();
  return (
    source
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'group'
  );
};

const buildHeaderGroupLayout = <TColumn extends HeaderGroupColumn>(
  columns: TColumn[],
): HeaderGroupLayout<TColumn> | null => {
  const hasGroupedColumn = columns.some((column) => String(column.headerGroupLabel || '').trim());
  if (!hasGroupedColumn) return null;

  return columns.reduce<HeaderGroupLayout<TColumn>>((groups, column, index) => {
    const groupLabel = String(column.headerGroupLabel || '').trim();
    if (!groupLabel) {
      groups.push({
        key: `standalone_${String(column.key || index)}`,
        label: String(column.label || column.key || '').trim(),
        columns: [column],
        grouped: false,
      });
      return groups;
    }

    const groupKey = normalizeHeaderGroupKey(column.headerGroupKey, groupLabel);
    const previousGroup = groups[groups.length - 1];
    if (previousGroup?.grouped && previousGroup.key === groupKey) {
      previousGroup.columns.push(column);
      return groups;
    }

    groups.push({
      key: groupKey,
      label: groupLabel,
      columns: [column],
      grouped: true,
    });
    return groups;
  }, []);
};

const PROMES_MONTH_WEEK_HIDDEN_COLUMN_KEYS = new Set(['keterangan', 'ket', 'catatan']);

const isPromesMonthWeekHiddenColumn = (column: { key?: unknown; label?: unknown }): boolean => {
  const key = String(column.key || '').trim().toLowerCase();
  const label = String(column.label || '').trim().toLowerCase();
  return PROMES_MONTH_WEEK_HIDDEN_COLUMN_KEYS.has(key) || PROMES_MONTH_WEEK_HIDDEN_COLUMN_KEYS.has(label);
};

const expandMonthWeekColumnsByCalendar = <TColumn extends { key?: unknown; label?: unknown }>(
  columns: TColumn[],
  academicYear: AcademicYearDateLike | null | undefined,
  semester: 'ODD' | 'EVEN',
): TColumn[] => {
  const layout = buildMonthWeekColumnLayout(columns);
  if (!layout) return columns;
  const autoCounts = buildAutoMonthWeekCounts(academicYear, semester);
  if (autoCounts.size === 0) return columns;

  const existingWeekColumns = new Map<string, TColumn>();
  const monthKeyPreference = new Map<string, string>();
  const templateByMonth = new Map<string, TColumn>();

  layout.weekGroups.forEach((group) => {
    const canonicalMonthKey = normalizeMonthWeekKey(group.monthKey);
    group.columns.forEach(({ column, weekNumber }) => {
      const parsed = parseMonthWeekColumnKey(column.key);
      const sourceMonthKey = parsed?.monthKey || group.monthKey;
      const canonicalSourceMonthKey = normalizeMonthWeekKey(sourceMonthKey);
      const storageMonthKey = monthKeyPreference.get(canonicalSourceMonthKey) || sourceMonthKey;
      monthKeyPreference.set(canonicalSourceMonthKey, storageMonthKey);
      if (!templateByMonth.has(canonicalSourceMonthKey)) templateByMonth.set(canonicalSourceMonthKey, column);
      existingWeekColumns.set(`${canonicalMonthKey}_${weekNumber}`, column);
    });
  });

  const generatedWeekColumns: TColumn[] = [];
  Array.from(autoCounts.entries())
    .sort(
      ([leftMonth], [rightMonth]) =>
        (MONTH_WEEK_INDEX_BY_KEY.get(leftMonth) || 0) - (MONTH_WEEK_INDEX_BY_KEY.get(rightMonth) || 0),
    )
    .forEach(([canonicalMonthKey, weekCount]) => {
      const storageMonthKey = monthKeyPreference.get(canonicalMonthKey) || canonicalMonthKey;
      const template = templateByMonth.get(canonicalMonthKey) || layout.weekGroups[0]?.columns[0]?.column;
      for (let weekNumber = 1; weekNumber <= weekCount; weekNumber += 1) {
        const existingColumn = existingWeekColumns.get(`${canonicalMonthKey}_${weekNumber}`);
        if (existingColumn) {
          generatedWeekColumns.push(existingColumn);
          continue;
        }
        generatedWeekColumns.push({
          ...(template || ({} as TColumn)),
          key: `${storageMonthKey}_${weekNumber}`,
          label: `${MONTH_WEEK_COLUMN_LABELS[canonicalMonthKey] || storageMonthKey}-${weekNumber}`,
        });
      }
    });

  return [...layout.leadingColumns, ...generatedWeekColumns, ...layout.trailingColumns];
};

const isWeekColumnKey = (columnKey: string): boolean => {
  const key = String(columnKey || '').trim().toLowerCase();
  return WEEK_COLUMN_PREFIXES.some((prefix) => key.startsWith(prefix));
};

const isTruthyMark = (value: string): boolean => {
  const token = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'ya', 'yes', 'v', 'x', '✓'].includes(token);
};

const MARK_VALUE = '✓';

const normalizeMonthWeekCellValue = (value: unknown): string => {
  const lines = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed) return '';
      return isTruthyMark(trimmed) ? MARK_VALUE : trimmed;
    });
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
};

const normalizeKktpCriteriaCellValue = (value: unknown): string => {
  const lines = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (isTruthyMark(String(line || '')) ? MARK_VALUE : ''));
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
};

const countTruthyCriteriaMarks = (value: unknown): number =>
  String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => isTruthyMark(String(line || ''))).length;

const getMergedMonthWeekNote = (value: unknown): { note: string; lineIndex: number } | null => {
  const lines = splitEditableCellLines(value);
  const noteIndex = lines.findIndex((line) => {
    const trimmed = String(line || '').trim();
    return Boolean(trimmed) && !isTruthyMark(trimmed);
  });
  if (noteIndex < 0) return null;
  return {
    note: String(lines[noteIndex] || '').trim(),
    lineIndex: noteIndex,
  };
};
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
];
const WEEK_OPTIONS = Array.from({ length: 19 }, (_, index) => String(index + 1));
const SEMESTER_OPTIONS = ['Ganjil', 'Genap'];
const MATRIKS_SEBARAN_WEEK_GROUP_KEY = 'pelaksanaan_minggu_ke';
const MATRIKS_SEBARAN_WEEK_GROUP_LABEL = 'Pelaksanaan Minggu Ke-';

const isKktpCriteriaColumnKey = (columnKey: string): boolean => {
  const key = String(columnKey || '').trim().toLowerCase();
  return key === 'kurang_memadai' || key === 'memadai';
};

const isMatriksSebaranWeekColumnKey = (columnKey: unknown): boolean => {
  const key = String(columnKey || '').trim().toLowerCase();
  const normalized = key.replace(/^minggu(?:_ke)?[-_\s]*/i, '');
  if (!/^\d{1,2}$/.test(normalized)) return false;
  const numeric = Number(normalized);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= WEEK_OPTIONS.length;
};

const isMatriksSebaranGroupedWeekColumn = (
  column?: Partial<HeaderGroupColumn> | null,
): boolean => {
  const groupKey = String(column?.headerGroupKey || '').trim().toLowerCase();
  const groupLabel = String(column?.headerGroupLabel || '').trim().toLowerCase();
  return groupKey === MATRIKS_SEBARAN_WEEK_GROUP_KEY || groupLabel.includes('pelaksanaan minggu');
};

const getColumnDataType = (column?: Pick<EntrySectionColumnForm, 'dataType'> | null): string =>
  String(column?.dataType || 'TEXT')
    .trim()
    .toUpperCase();

const isSystemManagedColumn = (column: EntrySectionColumnForm): boolean => {
  if (isDocumentReferencePickerColumn(column)) return false;
  if (
    String(column.teacherEditMode || '').trim().toUpperCase() === 'TEACHER_EDITABLE' &&
    Boolean(column.binding?.allowManualOverride)
  ) {
    return false;
  }
  const valueSource = String(column.valueSource || 'MANUAL').trim().toUpperCase();
  const dataType = getColumnDataType(column);
  return Boolean(column.readOnly) || dataType === 'READONLY_BOUND' || (!!valueSource && valueSource !== 'MANUAL');
};

const isSystemValueColumn = (column: Partial<EntrySectionColumnForm> | null | undefined): boolean => {
  const sourceType = String(column?.sourceType || '').trim().toUpperCase();
  const valueSource = String(column?.valueSource || '').trim().toUpperCase();
  return sourceType === 'SYSTEM' || valueSource.startsWith('SYSTEM_');
};

const CENTER_ALIGNED_REFERENCE_IDENTITIES = new Set([
  'no',
  'nomor',
  'number',
  'jp',
  'alokasi_jp',
  'alokasi_waktu',
  'jumlah_jp',
  'jam',
  'jumlah_jam',
]);

const LEFT_ALIGNED_REFERENCE_IDENTITIES = new Set([
  'tujuan_pembelajaran',
  'capaian_pembelajaran',
  'elemen',
  'kompetensi',
  'konten_materi',
  'dimensi_profil',
]);

const isCenterAlignedTableColumn = (column?: Partial<EntrySectionColumnForm> | null): boolean => {
  const dataType = getColumnDataType(column);
  const identityCandidates = getColumnIdentityCandidates(column);
  if (identityCandidates.some((candidate) => LEFT_ALIGNED_REFERENCE_IDENTITIES.has(candidate))) return false;
  if (isMatriksSebaranGroupedWeekColumn(column)) return true;
  if (isWeekColumnKey(String(column?.key || ''))) return true;
  if (['NUMBER', 'BOOLEAN', 'WEEK', 'SEMESTER', 'MONTH', 'WEEK_GRID'].includes(dataType)) return true;
  return identityCandidates.some((candidate) => CENTER_ALIGNED_REFERENCE_IDENTITIES.has(candidate));
};

const isMiddleAlignedTableColumn = (column?: Partial<EntrySectionColumnForm> | null): boolean => {
  const key = String(column?.key || '').trim().toLowerCase();
  const identityCandidates = getColumnIdentityCandidates(column);
  if (['no', 'nomor'].includes(key)) return true;
  if (key.includes('alokasi') || key.includes('jp')) return true;
  if (identityCandidates.includes('tujuan_pembelajaran')) return true;
  return isCenterAlignedTableColumn(column);
};

const parseWeekGridValue = (value: unknown): string[] => {
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
};

const toggleWeekGridValue = (value: unknown, week: string): string => {
  const selected = new Set(parseWeekGridValue(value));
  if (selected.has(week)) {
    selected.delete(week);
  } else {
    selected.add(week);
  }
  return WEEK_OPTIONS.filter((item) => selected.has(item)).join(', ');
};

const formatWeekGridPrintValue = (value: unknown): string => {
  const weeks = parseWeekGridValue(value);
  if (!weeks.length) return '-';
  return `Minggu ${weeks.join(', ')}`;
};

const formatNumericValue = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
};

const formatOptionalNumericValue = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return formatNumericValue(value);
};

const getPrintColumnClassName = (column?: EntrySectionColumnForm): string => {
  const dataType = getColumnDataType(column);
  const classes: string[] = [];
  if (isMatriksSebaranGroupedWeekColumn(column)) classes.push('print-matrix-week-column');
  if (dataType === 'WEEK_GRID') classes.push('print-week-grid-column');
  if (['no', 'nomor'].includes(String(column?.key || '').trim().toLowerCase())) classes.push('print-no-column');
  if (isWeekColumnKey(String(column?.key || ''))) classes.push('print-month-week-column');
  if (['NUMBER', 'BOOLEAN', 'WEEK', 'SEMESTER', 'MONTH'].includes(dataType) || isCenterAlignedTableColumn(column)) {
    classes.push('print-compact-column');
  }
  if (isCenterAlignedTableColumn(column)) classes.push('print-center-column');
  if (isMiddleAlignedTableColumn(column)) classes.push('print-middle-column');
  if (classes.length > 0) return Array.from(new Set(classes)).join(' ');
  return '';
};

const renderPrintClassAttribute = (className: string): string =>
  className ? ` class="${escapeHtml(className)}"` : '';

const parseNumber = (value: unknown): number => {
  const normalized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^0-9.\\-]/g, '')
    .trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const formatLongDate = (value = new Date()): string =>
  value.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const applyDerivedSheetSections = (
  inputSections: EntrySectionForm[],
  schemaMap: Map<string, TeachingResourceProgramSectionSchema>,
): EntrySectionForm[] => {
  const sections = inputSections.map((section) => ({
    ...section,
    columns: sanitizeSectionColumns(section.columns),
    rows: (Array.isArray(section.rows) ? section.rows : []).map((row) => ({
      ...row,
      values: {
        ...row.values,
      },
    })),
  }));

  let totalProtaJp = 0;
  let hasProta = false;
  let hasKktp = false;
  let totalKurangMemadai = 0;
  let totalMemadai = 0;

  sections.forEach((section) => {
    const schema = schemaMap.get(String(section.schemaKey || '').trim());
    if (!schema || (schema.editorType || 'TEXT') !== 'TABLE') return;

    const columns = section.columns.length > 0 ? section.columns : sanitizeSectionColumns(schema.columns);
    const columnKeys = columns.map((column) => String(column.key || '').trim()).filter(Boolean);
    const hasNoColumn = columnKeys.includes('no');

    section.rows = section.rows.map((row, rowIndex) => {
      const values = {
        ...row.values,
      };

      if (hasNoColumn) {
        values.no = String(rowIndex + 1);
      }

      columnKeys.forEach((columnKey) => {
        if (parseMonthWeekColumnKey(columnKey)) {
          values[columnKey] = normalizeMonthWeekCellValue(values[columnKey]);
          return;
        }
        if (isWeekColumnKey(columnKey)) {
          values[columnKey] = isTruthyMark(values[columnKey] || '') ? MARK_VALUE : '';
          return;
        }
        if (isKktpCriteriaColumnKey(columnKey)) {
          values[columnKey] = normalizeKktpCriteriaCellValue(values[columnKey]);
        }
      });

      return {
        ...row,
        values,
      };
    });

    const sectionKey = String(section.schemaKey || '').trim();
    if (sectionKey === 'tabel_prota') {
      hasProta = true;
      totalProtaJp += section.rows.reduce((acc, row) => acc + parseNumber(row.values.alokasi_jp), 0);
    }

    if (sectionKey === 'tabel_kktp') {
      hasKktp = true;
      section.rows.forEach((row) => {
        totalKurangMemadai += countTruthyCriteriaMarks(row.values.kurang_memadai);
        totalMemadai += countTruthyCriteriaMarks(row.values.memadai);
      });
    }
  });

  if (hasProta) {
    const summarySection = sections.find((section) => String(section.schemaKey || '').trim() === 'ringkasan_jumlah_jp');
    if (summarySection) {
      const baseRow = summarySection.rows[0] || {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        values: {},
      };
      const nextValues = {
        ...baseRow.values,
        jumlah_jp: formatNumericValue(totalProtaJp),
      };
      summarySection.rows = [{ ...baseRow, values: nextValues }];
    }
  }

  if (hasKktp) {
    const summarySection = sections.find((section) => String(section.schemaKey || '').trim() === 'ringkasan_kktp');
    if (summarySection) {
      const totalCriteria = totalKurangMemadai + totalMemadai;
      const percentKurangMemadai = totalCriteria > 0 ? (totalKurangMemadai / totalCriteria) * 100 : 0;
      const percentMemadai = totalCriteria > 0 ? (totalMemadai / totalCriteria) * 100 : 0;
      const baseRow = summarySection.rows[0] || {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        values: {},
      };
      const nextValues = {
        ...baseRow.values,
        jumlah_kurang_memadai: String(totalKurangMemadai),
        jumlah_memadai: String(totalMemadai),
        presentase_kurang_memadai: `${formatNumericValue(percentKurangMemadai)}%`,
        presentase_memadai: `${formatNumericValue(percentMemadai)}%`,
        kktp_mapel: formatNumericValue(percentMemadai),
      };
      summarySection.rows = [{ ...baseRow, values: nextValues }];
    }
  }

  return sections;
};

const buildAutoSheetTitle = (params: {
  programLabel: string;
  context: TeacherAssignmentContextOption | null;
  academicYearName: string;
  semesterLabel: string;
}): string => {
  const parts = [
    String(params.programLabel || '').trim(),
    String(params.context?.subjectName || '').trim(),
    String(params.context?.className || '').trim(),
    String(params.academicYearName || '').trim(),
    String(params.semesterLabel || '').trim(),
  ].filter(Boolean);
  return parts.join(' - ');
};

const normalizeSheetToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const extractBindingCandidates = (column: EntrySectionColumnForm): string[] => {
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
};

const resolveSystemValueForColumn = (
  column: EntrySectionColumnForm,
  context: {
    mapel: string;
    tingkat: string;
    kelas: string;
    programKeahlian: string;
    tahunAjaran: string;
    semester: string;
    guruMapel: string;
    tempatTanggal: string;
    jpMingguanRombel: string;
    totalJpMingguan: string;
  },
): string => {
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
    case 'SYSTEM_WEEKLY_CLASS_HOURS':
      return context.jpMingguanRombel;
    case 'SYSTEM_WEEKLY_TOTAL_HOURS':
      return context.totalJpMingguan;
    default:
      return '';
  }
};

const buildSemanticValueIndex = (
  sections: Array<{
    columns: EntrySectionColumnForm[];
    rows: Array<{ values: Record<string, string> }>;
  }>,
): Map<string, string[]> => {
  const index = new Map<string, string[]>();
  sections.forEach((section) => {
    section.rows.forEach((row, rowIndex) => {
      section.columns.forEach((column) => {
        const value = String(row.values[String(column.key || '').trim()] || '').trim();
        if (!value) return;
        extractBindingCandidates(column).forEach((candidate) => {
          if (!candidate) return;
          const current = index.get(candidate) || [];
          if (!String(current[rowIndex] || '').trim()) {
            current[rowIndex] = value;
            index.set(candidate, current);
          } else if (!current.some((item) => String(item || '').trim() === value)) {
            current.push(value);
            index.set(candidate, current);
          }
        });
      });
    });
  });
  return index;
};

const hydrateSheetSections = (params: {
  sections: EntrySectionForm[];
  schemaMap: Map<string, TeachingResourceProgramSectionSchema>;
  context: TeacherAssignmentContextOption | null;
  academicYearName: string;
  semesterLabel: string;
  teachingLoad?: TeachingLoadContext | null;
}): EntrySectionForm[] => {
  const mapel = String(params.context?.subjectName || '').trim();
  const tingkat = String(params.context?.classLevel || '').trim();
  const kelas = String(params.context?.className || '').trim();
  const programKeahlian = String(params.context?.programKeahlian || '').trim();
  const tahunAjaran = String(params.academicYearName || '').trim();
  const semester = String(params.semesterLabel || '').trim();
  const guruMapel = String(params.context?.teacherName || '').trim();
  const tempatTanggal = `Bekasi, ${formatLongDate(new Date())}`;
  const jpMingguanRombel = formatOptionalNumericValue(Number(params.teachingLoad?.weeklyClassHours || 0));
  const totalJpMingguan = formatOptionalNumericValue(Number(params.teachingLoad?.weeklyTotalHours || 0));

  const setIfBlank = (target: Record<string, string>, key: string, value: string) => {
    if (!key || !value) return;
    if (!String(target[key] || '').trim()) {
      target[key] = value;
    }
  };

  const hydratedSections = params.sections.map((section) => {
    const schema = params.schemaMap.get(String(section.schemaKey || '').trim());
    if (!schema || (schema.editorType || 'TEXT') !== 'TABLE') return section;
    const columns = section.columns.length > 0 ? section.columns : sanitizeSectionColumns(schema.columns);
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
      if (columnKeys.includes('pihak_1_jabatan')) setIfBlank(values, 'pihak_1_jabatan', 'Guru Mata Pelajaran');
      if (columnKeys.includes('pihak_1_nama')) setIfBlank(values, 'pihak_1_nama', guruMapel);
      if (columnKeys.includes('pihak_2_awalan')) setIfBlank(values, 'pihak_2_awalan', 'Mengetahui,');
      if (columnKeys.includes('pihak_2_jabatan')) setIfBlank(values, 'pihak_2_jabatan', 'Kepala Sekolah');
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
          jpMingguanRombel,
          totalJpMingguan,
        });
        if (systemValue) {
          if (isSystemValueColumn(column)) {
            values[key] = systemValue;
          } else {
            setIfBlank(values, key, systemValue);
          }
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
      columns,
      rows,
    };
  });

  const semanticValueIndex = buildSemanticValueIndex(
    hydratedSections.map((section) => ({
      columns: section.columns,
      rows: section.rows,
    })),
  );

  return hydratedSections.map((section) => ({
    ...section,
    rows: section.rows.map((row, rowIndex) => {
      const values = {
        ...row.values,
      };
      section.columns.forEach((column) => {
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
  }));
};

export const LearningResourceGenerator = ({
  type,
  routeSlug,
  title,
  description,
  editorMode = 'list',
}: LearningResourceGeneratorProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const { user: outletUser } = useOutletContext<{ user?: OutletUser }>() || {};
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<EntryFilterStatus>('ALL');
  const [viewMode, setViewMode] = useState<EntryViewMode>('mine');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [pageEditorInitialized, setPageEditorInitialized] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeachingResourceEntry | null>(null);
  const [selectedContextKey, setSelectedContextKey] = useState<string>('');
  const [entryTitleHtml, setEntryTitleHtml] = useState('');
  const [entrySummary, setEntrySummary] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entrySignaturePlaceDate, setEntrySignaturePlaceDate] = useState('');
  const [entryTags, setEntryTags] = useState('');
  const [sections, setSections] = useState<EntrySectionForm[]>(() => [createSection()]);
  const [quickEditEntryId, setQuickEditEntryId] = useState<number | null>(null);
  const [quickEditSections, setQuickEditSections] = useState<EntrySectionForm[]>([]);
  const quickEditSectionsRef = useRef<EntrySectionForm[]>([]);
  const quickEditCellRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const monthWeekClickTimersRef = useRef<Record<string, number>>({});
  const [quickEditActiveSectionId, setQuickEditActiveSectionId] = useState('');
  const [monthWeekNoteModal, setMonthWeekNoteModal] = useState<{
    mode: 'quick' | 'editor';
    sectionId: string;
    rowId: string;
    columnKey: string;
    lineIndex: number;
    value: string;
  } | null>(null);
  const [referenceSearchTerms, setReferenceSearchTerms] = useState<Record<string, string>>({});
  const [referenceServerSearchInput, setReferenceServerSearchInput] = useState('');
  const [debouncedReferenceServerSearch, setDebouncedReferenceServerSearch] = useState('');
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);
  const resizeTextareaToContent = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(element.scrollHeight, 42)}px`;
  };
  useEffect(
    () => () => {
      Object.values(monthWeekClickTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      monthWeekClickTimersRef.current = {};
    },
    [],
  );
  const programCode = useMemo(() => normalizeProgramCode(type), [type]);
  const isPageEditor = editorMode === 'create';
  const resolvedRouteSlug = useMemo(() => {
    const normalized = String(routeSlug || '').trim().toLowerCase();
    if (normalized) return normalized;
    return String(type || 'custom-program')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');
  }, [routeSlug, type]);
  const listPath = `/teacher/learning-resources/${resolvedRouteSlug}`;
  const academicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0);

  const programConfigQuery = useQuery({
    queryKey: TEACHING_RESOURCE_PROGRAM_CONFIG_QUERY_KEY(academicYearId),
    enabled: Boolean(academicYearId),
    queryFn: async () => {
      const response = await teachingResourceProgramService.getPrograms({
        academicYearId,
        roleContext: 'teacher',
        includeInactive: true,
      });
      return toProgramConfigArray(response);
    },
    staleTime: 2 * 60 * 1000,
  });

  const programConfigRows = useMemo(() => toProgramConfigArray(programConfigQuery.data), [programConfigQuery.data]);
  const programMetaByCode = useMemo(() => {
    const map = new Map<string, TeachingResourceProgram>();
    programConfigRows.forEach((program) => {
      map.set(normalizeTeachingResourceProgramCode(program.code), program);
    });
    return map;
  }, [programConfigRows]);

  const rawActiveProgramMeta = useMemo<TeachingResourceProgram | null>(() => {
    return programConfigRows.find((program) => normalizeTeachingResourceProgramCode(program.code) === programCode) || null;
  }, [programCode, programConfigRows]);

  const activeProgramMeta = useMemo<TeachingResourceProgram | null>(() => {
    if (!rawActiveProgramMeta) return null;
    if (!rawActiveProgramMeta.schema) return rawActiveProgramMeta;
    const schemaSections = Array.isArray(rawActiveProgramMeta.schema.sections) ? rawActiveProgramMeta.schema.sections : [];
    return {
      ...rawActiveProgramMeta,
      schema: {
        ...rawActiveProgramMeta.schema,
        sections: normalizeTeacherReferenceSections(schemaSections, programMetaByCode, rawActiveProgramMeta.code),
      },
    };
  }, [programMetaByCode, rawActiveProgramMeta]);
  const activeProgramDisplayMode = useMemo(() => resolveProgramDisplayMode(activeProgramMeta), [activeProgramMeta]);
  const isActiveProgramMonthWeekPromes = useMemo(() => {
    const token = `${programCode} ${activeProgramMeta?.code || ''} ${activeProgramMeta?.label || ''} ${
      activeProgramMeta?.shortLabel || ''
    } ${activeProgramMeta?.schema?.sourceSheet || ''} ${activeProgramMeta?.schema?.documentTitle || ''}`.toLowerCase();
    return token.includes('promes') || token.includes('prosem') || token.includes('program semester');
  }, [
    activeProgramMeta?.code,
    activeProgramMeta?.label,
    activeProgramMeta?.schema?.documentTitle,
    activeProgramMeta?.schema?.sourceSheet,
    activeProgramMeta?.shortLabel,
    programCode,
  ]);
  const isActiveProgramKktp = useMemo(() => {
    const token = `${programCode} ${activeProgramMeta?.code || ''} ${activeProgramMeta?.label || ''} ${
      activeProgramMeta?.shortLabel || ''
    } ${activeProgramMeta?.schema?.sourceSheet || ''} ${activeProgramMeta?.schema?.documentTitle || ''}`.toLowerCase();
    return token.includes('kktp') || token.includes('kriteria ketercapaian');
  }, [
    activeProgramMeta?.code,
    activeProgramMeta?.label,
    activeProgramMeta?.schema?.documentTitle,
    activeProgramMeta?.schema?.sourceSheet,
    activeProgramMeta?.shortLabel,
    programCode,
  ]);
  const isActiveProgramMatriksSebaran = useMemo(() => {
    const token = `${programCode} ${activeProgramMeta?.code || ''} ${activeProgramMeta?.label || ''} ${
      activeProgramMeta?.shortLabel || ''
    } ${activeProgramMeta?.schema?.sourceSheet || ''} ${activeProgramMeta?.schema?.documentTitle || ''}`.toLowerCase();
    return token.includes('matrik') || token.includes('matriks') || token.includes('matrix') || token.includes('sebaran');
  }, [
    activeProgramMeta?.code,
    activeProgramMeta?.label,
    activeProgramMeta?.schema?.documentTitle,
    activeProgramMeta?.schema?.sourceSheet,
    activeProgramMeta?.shortLabel,
    programCode,
  ]);

  const effectiveTitle = useMemo(() => {
    const fromConfig = String(activeProgramMeta?.label || '').trim();
    return fromConfig || title;
  }, [activeProgramMeta?.label, title]);

  const effectiveDescription = useMemo(() => {
    return description;
  }, [description]);

  const activeProgramSchemaSections = useMemo(
    () =>
      Array.isArray(activeProgramMeta?.schema?.sections)
        ? activeProgramMeta.schema.sections.filter(
            (section) => !isDigitalApprovalOnlySection(String(section.key || '').trim(), String(section.label || '').trim()),
          )
        : [],
    [activeProgramMeta?.schema?.sections],
  );
  const usesSheetTemplate = useMemo(
    () => Boolean(String(activeProgramMeta?.schema?.sourceSheet || '').trim()),
    [activeProgramMeta?.schema?.sourceSheet],
  );
  const canAddSection = useMemo(() => {
    if (activeProgramSchemaSections.length === 0) return true;
    return activeProgramSchemaSections.some((section) => section.repeatable);
  }, [activeProgramSchemaSections]);

  const activeProgramSchemaMap = useMemo(() => {
    const map = new Map<string, TeachingResourceProgramSectionSchema>();
    activeProgramSchemaSections.forEach((section) => {
      map.set(String(section.key || '').trim(), section);
    });
    return map;
  }, [activeProgramSchemaSections]);
  const referenceSourceProgramCodes = useMemo(() => {
    const codes = new Set<string>();
    activeProgramSchemaSections.forEach((section) => {
      ensureArray<EntrySectionColumnForm>(section.columns).forEach((column) => {
        const sourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
        if (!sourceProgramCode) return;
        if (
          isDocumentReferencePickerColumn(column) ||
          String(column.sourceType || '').trim().toUpperCase() === 'DOCUMENT_SNAPSHOT' ||
          Boolean(column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity)
        ) {
          codes.add(sourceProgramCode);
        }
      });
    });
    return Array.from(codes).sort();
  }, [activeProgramSchemaSections]);
  const ensureDerivedSections = (sourceSections: EntrySectionForm[]): EntrySectionForm[] =>
    applyDerivedSheetSections(sourceSections, activeProgramSchemaMap);

  const buildPayloadSections = (sourceSections: EntrySectionForm[]) => {
    const derivedSections = ensureDerivedSections(sourceSections);
    return derivedSections
      .map((section) => {
        const normalizedColumns = sanitizeSectionColumns(resolveSectionColumns(section));
        const allowedColumnKeys = new Set(normalizedColumns.map((column) => String(column.key || '').trim()).filter(Boolean));
        const normalizedRows = section.rows
          .map((row) => {
            const values = Object.entries(row.values || {}).reduce<Record<string, string>>((acc, [key, value]) => {
              const normalizedKey = String(key || '').trim();
              if (!normalizedKey) return acc;
              if (allowedColumnKeys.size > 0 && !allowedColumnKeys.has(normalizedKey)) return acc;
              acc[normalizedKey] = getRawCellValueForStorage(normalizedKey, value);
              return acc;
            }, {});
            return Object.values(values).some((value) => value) ? values : null;
          })
          .filter((row): row is Record<string, string> => Boolean(row));
        return {
          schemaKey: String(section.schemaKey || '').trim() || undefined,
          title: String(section.title || '').trim(),
          body: String(section.body || '').trim(),
          columns: normalizedColumns.length > 0 ? normalizedColumns : undefined,
          rows: normalizedRows,
        };
      })
      .filter((section) => section.title || section.body || section.rows.length > 0 || Boolean(section.columns?.length));
  };
  const buildReferenceSelectionPayload = (sourceSections: EntrySectionForm[]) => {
    const referenceSelections: TeachingResourceEntryReferenceSelection[] = [];
    const references = new Set<string>();

    sourceSections.forEach((section, sectionIndex) => {
      section.rows.forEach((row, rowIndex) => {
        Object.entries(row.referenceSelections || {}).forEach(([columnKey, selection]) => {
          if (!selection) return;
          const storedColumnKey = String(selection.columnKey || columnKey).trim();
          const value = String(selection.value || row.values[storedColumnKey] || '').trim();
          if (!isMeaningfulReferenceValue(value)) return;
          const sourceProgramCode = normalizeTeachingResourceProgramCode(selection.sourceProgramCode);
          const sourceEntryId = Number(selection.sourceEntryId || 0);
          if (sourceProgramCode && sourceEntryId > 0) {
            references.add(`${sourceProgramCode}::${sourceEntryId}`);
          }
          referenceSelections.push({
            sectionSchemaKey: String(section.schemaKey || '').trim() || undefined,
            sectionIndex,
            rowIndex,
            columnKey: storedColumnKey,
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

  const meQuery = useQuery({
    queryKey: ['learning-resource-me'],
    enabled: !outletUser?.id,
    queryFn: () => authService.getMe(),
    staleTime: 5 * 60 * 1000,
  });

  const user = useMemo(
    () =>
      (outletUser?.id
        ? {
            id: Number(outletUser.id),
            role: String(outletUser.role || ''),
          }
        : meQuery.data?.data
            ? {
                id: Number(meQuery.data.data.id),
                role: String(meQuery.data.data.role || ''),
              }
            : null),
    [meQuery.data?.data, outletUser?.id, outletUser?.role],
  );
  const currentUserProfile = meQuery.data?.data || null;

  const assignmentsQuery = useQuery({
    queryKey: ['learning-resource-assignments', user?.id || 0, academicYearId],
    enabled: Boolean(user?.id) && Boolean(academicYearId),
    queryFn: async () => {
      const response = await teacherAssignmentService.list({
        academicYearId,
        teacherId: String(user?.role || '').toUpperCase() === 'TEACHER' ? Number(user?.id) : undefined,
        page: 1,
        limit: 500,
      });
      return ensureArray<TeacherAssignment>(response.data?.assignments);
    },
    staleTime: 3 * 60 * 1000,
  });

  const assignments = useMemo<TeacherAssignment[]>(
    () => sortTeacherAssignmentsBySubjectClass(ensureArray<TeacherAssignment>(assignmentsQuery.data)),
    [assignmentsQuery.data],
  );

  const scheduleQuery = useQuery({
    queryKey: ['learning-resource-teaching-load-schedule', user?.id || 0, academicYearId],
    enabled: Boolean(user?.id) && Boolean(academicYearId) && String(user?.role || '').toUpperCase() === 'TEACHER',
    queryFn: async () => {
      const response = await scheduleService.list({
        academicYearId,
        teacherId: Number(user?.id),
      });
      return ensureArray<ScheduleEntry>(response.data?.entries);
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const assignmentContextOptions = useMemo<TeacherAssignmentContextOption[]>(() => {
    const grouped = new Map<
      string,
      Omit<TeacherAssignmentContextOption, 'coveredClasses' | 'assignmentIds'> & {
        coveredClasses: Set<string>;
        assignmentIds: number[];
      }
    >();

    assignments.forEach((assignment) => {
      const subjectId = Number(assignment.subject?.id || 0);
      const classLevel = normalizeClassLevel(assignment.class?.level);
      const className = buildAssignmentAggregateClassName(assignment);
      const programKeahlian = String(assignment.class?.major?.name || '').trim();
      const teacherName = String(assignment.teacher?.name || '').trim();
      const groupKey = `${subjectId}::${className}`;
      const existing = grouped.get(groupKey);

      if (existing) {
        existing.coveredClasses.add(String(assignment.class?.name || '').trim());
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
        coveredClasses: new Set([String(assignment.class?.name || '').trim()]),
        assignmentIds: [Number(assignment.id)],
      });
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        coveredClasses: Array.from(item.coveredClasses).filter(Boolean).sort((a, b) =>
          a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }),
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
  }, [assignments]);
  const selectedContext = useMemo(
    () => assignmentContextOptions.find((item) => item.key === selectedContextKey) || null,
    [assignmentContextOptions, selectedContextKey],
  );
  const teachingLoadByContext = useMemo(() => {
    const map = new Map<string, TeachingLoadContext>();
    const entries = ensureArray<ScheduleEntry>(scheduleQuery.data).filter((entry) => entry.teachingHour !== null);
    assignmentContextOptions.forEach((context) => {
      const assignmentIds = new Set(context.assignmentIds.map((id) => Number(id)).filter((id) => id > 0));
      if (assignmentIds.size === 0) return;
      const weeklyTotalHours = entries.filter((entry) => assignmentIds.has(Number(entry.teacherAssignmentId || 0))).length;
      const classCount = Math.max(1, context.coveredClasses.length);
      map.set(context.key, {
        weeklyTotalHours,
        weeklyClassHours: weeklyTotalHours > 0 ? weeklyTotalHours / classCount : 0,
      });
    });
    return map;
  }, [assignmentContextOptions, scheduleQuery.data]);
  const selectedTeachingLoad = useMemo(
    () => (selectedContext ? teachingLoadByContext.get(selectedContext.key) || null : null),
    [selectedContext, teachingLoadByContext],
  );
  const academicYearName = useMemo(() => String(activeAcademicYear?.name || '').trim(), [activeAcademicYear?.name]);
  const activeSemesterLabel = useMemo(
    () => resolveSemesterLabel(activeAcademicYear?.semester),
    [activeAcademicYear?.semester],
  );
  const applyMonthWeekCalendarColumns = (
    section: Pick<EntrySectionForm, 'schemaKey' | 'title'>,
    columns: EntrySectionColumnForm[],
  ): EntrySectionColumnForm[] => {
    if (!isActiveProgramMonthWeekPromes || !buildMonthWeekColumnLayout(columns)) return columns;
    const semester = resolveMonthWeekSemesterFromSection(section, activeAcademicYear?.semester);
    return expandMonthWeekColumnsByCalendar(columns, activeAcademicYear, semester).filter(
      (column) => !isPromesMonthWeekHiddenColumn(column),
    );
  };
  const applyDerivedTableColumnMetadata = (columns: EntrySectionColumnForm[]): EntrySectionColumnForm[] =>
    columns.map((column) => {
      if (isKktpCriteriaColumnKey(column.key)) {
        return {
          ...column,
          headerGroupKey: column.headerGroupKey || 'kriteria_penetapan_kktp',
          headerGroupLabel: column.headerGroupLabel || 'Kriteria Penetapan KKTP',
        };
      }
      if (isActiveProgramMatriksSebaran && isMatriksSebaranWeekColumnKey(column.key)) {
        return {
          ...column,
          headerGroupKey: column.headerGroupKey || MATRIKS_SEBARAN_WEEK_GROUP_KEY,
          headerGroupLabel: column.headerGroupLabel || MATRIKS_SEBARAN_WEEK_GROUP_LABEL,
        };
      }
      return column;
    });
  const referenceProjectionRequests = useMemo<TeachingResourceReferenceProjectionRequest[]>(() => {
    const requests: TeachingResourceReferenceProjectionRequest[] = [];
    activeProgramSchemaSections.forEach((section) => {
      const sectionKey = String(section.key || '').trim();
      ensureArray<EntrySectionColumnForm>(section.columns).forEach((column) => {
        if (!shouldRenderDocumentReferencePicker(section, column)) return;
        const columnKey = String(column.key || '').trim();
        const sourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
        const candidates = extractReferenceCandidates(column);
        if (!sectionKey || !columnKey || !sourceProgramCode || candidates.length === 0) return;
        requests.push({
          requestKey: `${sectionKey}::${columnKey}`,
          sourceProgramCode,
          candidates,
          filterByContext: Boolean(column.binding?.filterByContext) || undefined,
          matchBySubject: Boolean(column.binding?.matchBySubject) || undefined,
          matchByClassLevel: Boolean(column.binding?.matchByClassLevel) || undefined,
          matchByMajor: Boolean(column.binding?.matchByMajor) || undefined,
          matchByActiveSemester: Boolean(column.binding?.matchByActiveSemester) || undefined,
          context: selectedContext
            ? {
                subjectId: Number(selectedContext.subjectId || 0) || undefined,
                classLevel: String(selectedContext.classLevel || '').trim() || undefined,
                programKeahlian: String(selectedContext.programKeahlian || '').trim() || undefined,
                semester: activeSemesterLabel || undefined,
              }
            : undefined,
        });
      });
    });
    return requests;
  }, [activeProgramSchemaSections, activeSemesterLabel, selectedContext]);
  const referenceProjectionRequestKey = useMemo(
    () => JSON.stringify(referenceProjectionRequests),
    [referenceProjectionRequests],
  );
  const signatureDefaultsQuery = useQuery({
    queryKey: ['teaching-resource-signature-defaults', academicYearId],
    enabled: Boolean(academicYearId),
    queryFn: async () => {
      const response = await teachingResourceProgramService.getSignatureDefaults({ academicYearId });
      return response.data as TeachingResourceSignatureDefaults;
    },
    staleTime: 5 * 60 * 1000,
  });

  const entryQuery = useQuery({
    queryKey: ['teaching-resource-entries', programCode, academicYearId, page, statusFilter, search, viewMode],
    enabled: Boolean(programCode) && Boolean(academicYearId) && Boolean(user?.id),
    queryFn: () =>
      teachingResourceProgramService.getEntries({
        academicYearId,
        page,
        limit: ENTRY_LIMIT,
        programCode,
        status: statusFilter,
        search: search || undefined,
        view: viewMode,
      }),
    staleTime: 10 * 1000,
  });
  const referenceEntriesQuery = useQuery({
    queryKey: [
      'teaching-resource-reference-entries',
      academicYearId,
      user?.id || 0,
      referenceSourceProgramCodes,
      referenceProjectionRequestKey,
      debouncedReferenceServerSearch,
    ],
    enabled:
      Boolean(academicYearId) &&
      Boolean(user?.id) &&
      referenceSourceProgramCodes.length > 0 &&
      (Boolean(isPageEditor) || Boolean(isEditorOpen) || Boolean(quickEditEntryId)),
    queryFn: async () => {
      const response = await teachingResourceProgramService.getReferenceEntries({
        academicYearId,
        programCodes: referenceSourceProgramCodes,
        search: debouncedReferenceServerSearch || undefined,
        limitPerProgram: 250,
        referenceRequests: referenceProjectionRequests,
        includeRows: true,
      });
      const entriesByProgram = new Map<string, TeachingResourceEntry[]>();
      const metaByProgram = new Map<string, ReferenceProgramMeta>();
      const projectedOptionsByRequestKey = new Map<string, ReferenceOption[]>();
      ensureArray<{
        programCode?: string;
        rows?: TeachingResourceEntry[];
        total?: number;
        limit?: number;
        loaded?: number;
        options?: TeachingResourceProjectedReferenceOption[];
      }>(
        response.data?.programs,
      ).forEach((program) => {
        const sourceProgramCode = normalizeTeachingResourceProgramCode(program.programCode);
        if (!sourceProgramCode) return;
        const programRows = ensureArray<TeachingResourceEntry>(program.rows);
        entriesByProgram.set(sourceProgramCode, programRows);
        metaByProgram.set(sourceProgramCode, {
          total: Number(program.total || 0),
          limit: Number(program.limit || response.data?.limitPerProgram || 0),
          loaded: Number(program.loaded || programRows.length || 0),
        });
        ensureArray<TeachingResourceProjectedReferenceOption>(program.options).forEach((option) => {
          const requestKey = String(option.requestKey || '').trim();
          if (!requestKey) return;
          const currentOptions = projectedOptionsByRequestKey.get(requestKey) || [];
          currentOptions.push({
            selectValue: option.selectValue,
            value: option.value,
            label: formatGroupedReferenceOptionLabel(
              option.value,
              option.label || 'Referensi tersimpan',
              option.lineCount,
              option.isAggregate,
            ),
            isAggregate: option.isAggregate,
            lineCount: option.lineCount,
            sourceProgramCode: normalizeTeachingResourceProgramCode(option.sourceProgramCode),
            sourceEntryId: Number(option.sourceEntryId || 0),
            sourceEntryTitle: option.sourceEntryTitle,
            sourceFieldKey: option.sourceFieldKey,
            sourceFieldIdentity: option.sourceFieldIdentity,
            snapshot: option.snapshot || {},
          });
          projectedOptionsByRequestKey.set(requestKey, currentOptions);
        });
      });
      return {
        entriesByProgram,
        metaByProgram,
        projectedOptionsByRequestKey,
      };
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const entryPayload = entryQuery.data?.data;
  const canReview = Boolean(entryPayload?.canReview);
  const rows = ensureArray<TeachingResourceEntry>(entryPayload?.rows);
  const totalPages = Math.max(1, Number(entryPayload?.totalPages || 1));
  const referenceOptionsByColumnKey = useMemo(() => {
    const map = new Map<string, ReferenceOption[]>();
    const referenceEntriesByProgram = referenceEntriesQuery.data?.entriesByProgram || new Map<string, TeachingResourceEntry[]>();
    const projectedOptionsByRequestKey =
      referenceEntriesQuery.data?.projectedOptionsByRequestKey || new Map<string, ReferenceOption[]>();

    const matchesContext = (entry: TeachingResourceEntry, binding?: TeachingResourceFieldBinding): boolean => {
      if (!binding || !selectedContext) return true;
      const shouldMatchSubject = Boolean(binding.filterByContext) || Boolean(binding.matchBySubject);
      const shouldMatchClassLevel = Boolean(binding.filterByContext) || Boolean(binding.matchByClassLevel);
      const shouldMatchMajor = Boolean(binding.filterByContext) || Boolean(binding.matchByMajor);
      const shouldMatchSemester = Boolean(binding.matchByActiveSemester);
      const contextSemester = String(activeSemesterLabel || '').trim().toLowerCase();
      const referenceContext = extractEntryContextValues(entry, {
        tingkat: String(entry.classLevel || '').trim(),
      });
      const entryMajor = String(referenceContext.programKeahlian || '').trim().toLowerCase();
      const entrySemester = String(referenceContext.semester || '').trim().toLowerCase();

      if (shouldMatchSubject && Number(entry.subjectId || 0) !== Number(selectedContext.subjectId || 0)) return false;
      if (
        shouldMatchClassLevel &&
        normalizeClassLevel(referenceContext.tingkat || entry.classLevel || '') !== normalizeClassLevel(selectedContext.classLevel)
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

    const matchesReferenceOptionSemester = (snapshot: Record<string, string> | undefined, targetSemesterLabel: string): boolean => {
      if (!targetSemesterLabel) return true;
      const sourceSemester = resolveSemesterLabel(snapshot?.semester || snapshot?.['semester']);
      return !sourceSemester || sourceSemester.toLowerCase() === targetSemesterLabel;
    };

    const extractOptionsFromEntry = (
      entry: TeachingResourceEntry,
      sourceProgram: TeachingResourceProgram | undefined,
      candidates: string[],
      targetSemesterLabel = '',
    ): ReferenceOption[] => {
      const sections = toEntryReferenceSections(entry);
      const entryContextSnapshot = buildEntryContextSnapshot(entry, {
        tingkat: String(entry.classLevel || '').trim(),
      });
      const schemaMap = new Map<string, TeachingResourceProgramSectionSchema>();
      ensureArray<TeachingResourceProgramSectionSchema>(sourceProgram?.schema?.sections).forEach((section) => {
        schemaMap.set(String(section.key || '').trim(), section);
      });
      const options: ReferenceOption[] = [];
      sections.forEach((section) => {
        const schema = schemaMap.get(String(section.schemaKey || '').trim());
        const columns = section.columns.length > 0 ? section.columns : ensureArray<EntrySectionColumnForm>(schema?.columns);
        section.rows.forEach((row, rowIndex) => {
          const snapshot = buildReferenceSnapshot(columns, row, entryContextSnapshot);
          if (!matchesReferenceOptionSemester(snapshot, targetSemesterLabel)) return;
          const rowLineCount = getReferenceRowLineCount(row);
          columns.forEach((column) => {
            const columnCandidates = extractReferenceCandidates(column);
            if (!columnCandidates.some((candidate) => candidates.includes(candidate))) return;
            const columnKey = String(column.key || '').trim();
            const rawValue = String(row[columnKey] || '').trim();
            if (!isMeaningfulReferenceValue(rawValue)) return;
            const valueLines = splitCellLines(rawValue)
              .map((line) => line.trim())
              .filter(isMeaningfulReferenceValue);
            const isMergedGroup = rowLineCount > 1;
            const lineOptions: Array<{
              value: string;
              selectValue: string;
              snapshot: Record<string, string>;
              label?: string;
              isAggregate?: boolean;
              lineCount?: number;
            }> = [
              {
                value: rawValue,
                selectValue:
                  valueLines.length > 1 || isMergedGroup
                    ? `${entry.id}::${String(section.schemaKey || 'section').trim()}::${rowIndex + 1}::${columnKey}::GROUP`
                    : `${entry.id}::${columnKey}::${rawValue}`,
                snapshot,
                isAggregate: isMergedGroup || valueLines.length > 1,
                lineCount: isMergedGroup || valueLines.length > 1 ? rowLineCount : undefined,
                label: formatGroupedReferenceOptionLabel(rawValue, 'Referensi tersimpan', rowLineCount, isMergedGroup),
              },
            ];
            lineOptions.forEach((lineOption) => {
              const label = formatReferenceOptionLabel(lineOption.label || lineOption.value);
              options.push({
                selectValue: lineOption.selectValue,
                value: lineOption.value,
                label,
                isAggregate: lineOption.isAggregate,
                lineCount: lineOption.lineCount,
                sourceProgramCode: normalizeTeachingResourceProgramCode(entry.programCode),
                sourceEntryId: Number(entry.id),
                sourceEntryTitle: String(entry.title || '').trim() || undefined,
                sourceFieldKey: columnKey || undefined,
                sourceFieldIdentity: String(column.fieldIdentity || '').trim() || undefined,
                snapshot: lineOption.snapshot,
              });
            });
          });
          if (columns.length > 0) return;
          Object.entries(row).forEach(([key, rawValue]) => {
            const normalizedKey = normalizeReferenceToken(key);
            if (!normalizedKey || !candidates.includes(normalizedKey)) return;
            const value = String(rawValue || '').trim();
            if (!isMeaningfulReferenceValue(value)) return;
            options.push({
              selectValue: `${entry.id}::${String(key || '').trim()}::${value}`,
              value,
              label: formatReferenceOptionLabel(value),
              sourceProgramCode: normalizeTeachingResourceProgramCode(entry.programCode),
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
      const sectionColumns = ensureArray<EntrySectionColumnForm>(section.columns);
      const sectionHasMonthWeekLayout = isActiveProgramMonthWeekPromes && Boolean(buildMonthWeekColumnLayout(sectionColumns));
      const targetSemesterLabel = sectionHasMonthWeekLayout
        ? resolveSemesterLabel(resolveMonthWeekSemesterFromSection(section, activeAcademicYear?.semester)).toLowerCase()
        : '';
      ensureArray<EntrySectionColumnForm>(section.columns).forEach((column) => {
        if (!isDocumentReferencePickerColumn(column)) return;
        const requestKey = `${String(section.key || '').trim()}::${String(column.key || '').trim()}`;
        const columnIdentityCandidates = getColumnIdentityCandidates(column);
        const shouldSplitLineOptions =
          columnIdentityCandidates.includes('tujuan_pembelajaran') &&
          ((isActiveProgramMonthWeekPromes && sectionHasMonthWeekLayout) || isActiveProgramKktp);
        const projectedOptions = projectedOptionsByRequestKey.get(requestKey);
        if (projectedOptions) {
          const scopedOptions = projectedOptions.filter((option) =>
            matchesReferenceOptionSemester(option.snapshot || {}, targetSemesterLabel),
          );
          map.set(requestKey, shouldSplitLineOptions ? splitReferenceOptionsIntoLineOptions(scopedOptions) : scopedOptions);
          return;
        }
        const sourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
        if (!sourceProgramCode) return;
        const referenceEntries = referenceEntriesByProgram.get(sourceProgramCode) || [];
        const sourceProgram = programMetaByCode.get(sourceProgramCode);
        const candidates = extractReferenceCandidates(column);
        if (!candidates.length) return;
        const dedupe = new Set<string>();
        const options = referenceEntries
          .filter((entry) => matchesContext(entry, column.binding))
          .flatMap((entry) => extractOptionsFromEntry(entry, sourceProgram, candidates, targetSemesterLabel))
          .filter((option) => {
            const token = `${String(option.selectValue || '').trim().toLowerCase()}`;
            if (!option.value || !token || dedupe.has(token)) return false;
            dedupe.add(token);
            return true;
          });
        map.set(
          `${String(section.key || '').trim()}::${String(column.key || '').trim()}`,
          shouldSplitLineOptions ? splitReferenceOptionsIntoLineOptions(options) : options,
        );
      });
    });

    return map;
  }, [
    activeProgramSchemaSections,
    activeAcademicYear?.semester,
    activeSemesterLabel,
    isActiveProgramKktp,
    programMetaByCode,
    programCode,
    referenceEntriesQuery.data,
    selectedContext,
  ]);

  const normalizeComparableCellValue = (value: unknown): string[] =>
    splitCellLines(value)
      .map((line) => normalizeReferenceToken(line))
      .filter(Boolean);

  const buildComparableRowSnapshot = (
    columns: EntrySectionColumnForm[],
    row: EntrySectionRowForm,
  ): Record<string, string> => {
    const snapshot = buildReferenceSnapshot(columns, row.values || {});
    Object.values(row.referenceSelections || {}).forEach((selection) => {
      const selectionSnapshot = sanitizeReferenceSnapshot(selection.snapshot);
      Object.entries(selectionSnapshot).forEach(([key, value]) => {
        if (!snapshot[key] && isMeaningfulReferenceValue(value)) snapshot[key] = value;
      });
      const selectionValue = String(selection.value || '').trim();
      const selectionKeys = [
        selection.sourceFieldIdentity,
        selection.sourceFieldKey,
        selection.sourceProgramCode ? `${selection.sourceProgramCode}.${selection.sourceFieldIdentity || selection.sourceFieldKey || ''}` : '',
      ];
      selectionKeys.forEach((key) => {
        const normalizedKey = normalizeReferenceToken(key);
        if (normalizedKey && !snapshot[normalizedKey] && isMeaningfulReferenceValue(selectionValue)) {
          snapshot[normalizedKey] = selectionValue;
        }
      });
    });
    return snapshot;
  };

  const scoreRelatedReferenceSnapshot = (
    currentSnapshot: Record<string, string>,
    candidateSnapshot: Record<string, string>,
    targetColumn: EntrySectionColumnForm,
  ): number => {
    const targetCandidates = new Set([
      ...extractBindingCandidates(targetColumn),
      ...extractReferenceCandidates(targetColumn),
      ...getColumnIdentityCandidates(targetColumn),
    ]);
    let score = 0;
    Object.entries(currentSnapshot).forEach(([key, rawValue]) => {
      const normalizedKey = normalizeReferenceToken(key);
      if (!normalizedKey || CONTEXT_REFERENCE_IDENTITIES.has(normalizedKey) || targetCandidates.has(normalizedKey)) return;
      const candidateValue = candidateSnapshot[normalizedKey];
      if (!isMeaningfulReferenceValue(rawValue) || !isMeaningfulReferenceValue(candidateValue)) return;
      const currentLines = normalizeComparableCellValue(rawValue);
      const candidateLines = normalizeComparableCellValue(candidateValue);
      if (currentLines.length === 0 || candidateLines.length === 0) return;
      if (currentLines.join('\n') === candidateLines.join('\n')) {
        score += 20 + Math.min(10, currentLines.length);
        return;
      }
      const candidateSet = new Set(candidateLines);
      const overlapCount = currentLines.filter((line) => candidateSet.has(line)).length;
      if (overlapCount > 0) score += overlapCount;
    });
    return score;
  };

  const resolveRelatedReferenceValue = (
    section: EntrySectionForm,
    row: EntrySectionRowForm,
    targetColumn: EntrySectionColumnForm,
    rowIndex = 0,
  ): string => {
    const sourceProgramCode = normalizeTeachingResourceProgramCode(targetColumn.binding?.sourceProgramCode);
    if (!sourceProgramCode || !referenceEntriesQuery.data) return '';
    const sourceEntries = referenceEntriesQuery.data.entriesByProgram.get(sourceProgramCode) || [];
    if (sourceEntries.length === 0) return '';
    const sectionColumns = resolveSectionColumnsForSnapshot(section);
    const currentSnapshot = buildComparableRowSnapshot(sectionColumns, row);
    const isPromesMonthWeekSection = isActiveProgramMonthWeekPromes && Boolean(buildMonthWeekColumnLayout(sectionColumns));
    const targetSemesterLabel = isPromesMonthWeekSection
      ? resolveSemesterLabel(resolveMonthWeekSemesterFromSection(section, activeAcademicYear?.semester)).toLowerCase()
      : '';
    const sourceProgram = programMetaByCode.get(sourceProgramCode);
    const schemaMap = new Map<string, TeachingResourceProgramSectionSchema>();
    ensureArray<TeachingResourceProgramSectionSchema>(sourceProgram?.schema?.sections).forEach((sourceSection) => {
      schemaMap.set(String(sourceSection.key || '').trim(), sourceSection);
    });

    let bestScore = 0;
    let bestValue = '';
    const orderedFallbackValues: string[] = [];
    sourceEntries.forEach((entry) => {
      const entryContextSnapshot = buildEntryContextSnapshot(entry, {
        tingkat: String(entry.classLevel || '').trim(),
      });
      toEntryReferenceSections(entry).forEach((sourceSection) => {
        const sourceSchema = schemaMap.get(String(sourceSection.schemaKey || '').trim());
        const sourceColumns = sourceSection.columns.length > 0 ? sourceSection.columns : sanitizeSectionColumns(sourceSchema?.columns);
        sourceSection.rows.forEach((sourceRow) => {
          const candidateSnapshot = buildReferenceSnapshot(sourceColumns, sourceRow, entryContextSnapshot);
          const candidateValue = getSnapshotValueForColumn(candidateSnapshot, targetColumn);
          if (!isMeaningfulReferenceValue(candidateValue)) return;
          if (targetSemesterLabel) {
            const sourceSemesterLabel = resolveSemesterLabel(candidateSnapshot.semester).toLowerCase();
            if (sourceSemesterLabel && sourceSemesterLabel !== targetSemesterLabel) return;
          }
          orderedFallbackValues.push(candidateValue);
          const score = scoreRelatedReferenceSnapshot(currentSnapshot, candidateSnapshot, targetColumn);
          if (score <= 0) return;
          if (score > bestScore) {
            bestScore = score;
            bestValue = candidateValue;
          }
        });
      });
    });

    return bestValue || orderedFallbackValues[rowIndex] || '';
  };

  const shouldUseResolvedReferenceValue = (currentValue: string, resolvedValue: string): boolean => {
    if (!isMeaningfulReferenceValue(resolvedValue)) return false;
    const currentLines = splitCellLines(currentValue).filter(isMeaningfulReferenceValue);
    const resolvedLines = splitCellLines(resolvedValue).filter(isMeaningfulReferenceValue);
    if (currentLines.length === 0) return true;
    return resolvedLines.length > currentLines.length;
  };

  const resolveSectionColumnsForSnapshot = (section: EntrySectionForm): EntrySectionColumnForm[] => {
    const customColumns = sanitizeSectionColumns(section.columns);
    if (customColumns.length > 0) return applyMonthWeekCalendarColumns(section, customColumns);
    return applyMonthWeekCalendarColumns(
      section,
      sanitizeSectionColumns(activeProgramSchemaMap.get(String(section.schemaKey || '').trim())?.columns),
    );
  };

  const reconcileRelatedReferenceSnapshots = (sourceSections: EntrySectionForm[]): EntrySectionForm[] => {
    if (!referenceEntriesQuery.data) return sourceSections;
    let changed = false;
    const nextSections = sourceSections.map((section) => {
      const columns = resolveSectionColumnsForSnapshot(section);
      if (columns.length === 0 || section.rows.length === 0) return section;
      const isPromesMonthWeekSection = isActiveProgramMonthWeekPromes && Boolean(buildMonthWeekColumnLayout(columns));
      const nextRows = section.rows.map((row, rowIndex) => {
        let nextValues = row.values;
        Object.entries(row.referenceSelections || {}).forEach(([selectionKey, selection]) => {
          const columnKey = String(selectionKey || '').split('__line_')[0] || '';
          if (!columnKey || isMeaningfulReferenceValue(nextValues[columnKey])) return;
          const selectionValue = String(selection.value || '').trim();
          if (!isMeaningfulReferenceValue(selectionValue)) return;
          nextValues = { ...nextValues, [columnKey]: selectionValue };
          changed = true;
        });

        columns.forEach((column) => {
          const key = String(column.key || '').trim();
          if (!key) return;
          const sourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
          if (!sourceProgramCode) return;
          const resolvedValue = resolveRelatedReferenceValue(section, { ...row, values: nextValues }, column, rowIndex);
          const shouldForceReferenceSync =
            isPromesMonthWeekSection &&
            getColumnIdentityCandidates(column).some((candidate) =>
              ['tujuan_pembelajaran', 'alokasi_jp'].includes(candidate),
            );
          if (
            shouldForceReferenceSync &&
            isMeaningfulReferenceValue(resolvedValue) &&
            String(nextValues[key] || '').trim() !== resolvedValue
          ) {
            nextValues = { ...nextValues, [key]: resolvedValue };
            changed = true;
            return;
          }
          if (!shouldUseResolvedReferenceValue(String(nextValues[key] || ''), resolvedValue)) return;
          nextValues = { ...nextValues, [key]: resolvedValue };
          changed = true;
        });

        return nextValues === row.values ? row : { ...row, values: nextValues };
      });
      return nextRows === section.rows ? section : { ...section, columns, rows: nextRows };
    });
    return changed ? nextSections : sourceSections;
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedReferenceServerSearch(referenceServerSearchInput);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [referenceServerSearchInput]);

  const buildReferenceSearchKey = (
    scope: 'quick' | 'editor',
    sectionId: string,
    rowId: string | undefined,
    columnKey: string,
  ) => `${scope}::${sectionId}::${rowId || 'row'}::${columnKey}`;

  const updateReferenceSearchTerm = (key: string, value: string) => {
    setReferenceSearchTerms((prev) => {
      const next = { ...prev };
      const normalizedValue = value.trimStart();
      if (normalizedValue) {
        next[key] = normalizedValue;
      } else {
        delete next[key];
      }
      return next;
    });
    const serverSearchValue = value.trim();
    setReferenceServerSearchInput(serverSearchValue.length >= 2 ? serverSearchValue : '');
  };

  const resetReferenceSearch = () => {
    setReferenceSearchTerms({});
    setReferenceServerSearchInput('');
    setDebouncedReferenceServerSearch('');
  };

  const getReferenceLimitHelperText = (sourceProgramCode: string, sourceProgramLabel: string): string => {
    const meta = referenceEntriesQuery.data?.metaByProgram.get(sourceProgramCode);
    if (!meta || meta.total <= meta.loaded) return '';
    return `Menampilkan ${meta.loaded} dari ${meta.total} dokumen ${sourceProgramLabel}. Persempit pencarian jika referensi belum terlihat.`;
  };

  const filterReferenceOptions = (options: ReferenceOption[], searchTerm: string): ReferenceOption[] => {
    const terms = searchTerm
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length === 0) return options;

    return options.filter((option) => {
      const haystack = [option.label, option.value, option.sourceEntryTitle, option.sourceFieldKey, option.sourceFieldIdentity]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  };

  const keepSelectedReferenceOptionVisible = (
    options: ReferenceOption[],
    allOptions: ReferenceOption[],
    selectedValue: string,
  ): ReferenceOption[] => {
    if (!selectedValue) return options;
    if (options.some((option) => option.selectValue === selectedValue)) return options;
    const selectedOption = allOptions.find((option) => option.selectValue === selectedValue);
    return selectedOption ? [selectedOption, ...options] : options;
  };

  useEffect(() => {
    if (viewMode === 'review' && !canReview) {
      setViewMode('mine');
    }
  }, [canReview, viewMode]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const assignmentLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    assignmentContextOptions.forEach((context) => {
      map.set(`${Number(context.subjectId)}::${String(context.className || '')}`, context.label);
    });
    assignments.forEach((assignment) => {
      map.set(
        `${Number(assignment.subject.id)}::${String(assignment.class.name)}`,
        formatTeacherAssignmentLabel(assignment),
      );
    });
    return map;
  }, [assignmentContextOptions, assignments]);

  const statusTotals = useMemo(() => {
    const base: Record<TeachingResourceEntryStatus, number> = {
      DRAFT: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    ensureArray<{ status: TeachingResourceEntryStatus; total: number }>(entryPayload?.summary?.byStatus).forEach(
      (item) => {
      if (!item || typeof item.status !== 'string') return;
      const status = item.status as TeachingResourceEntryStatus;
      if (!(status in base)) return;
      base[status] = Number(item.total || 0);
      },
    );
    return base;
  }, [entryPayload?.summary?.byStatus]);

  const normalizeSectionsForEditor = (sourceSections: EntrySectionForm[]): EntrySectionForm[] => {
    const hydratedSections = usesSheetTemplate
      ? hydrateSheetSections({
          sections: sourceSections,
          schemaMap: activeProgramSchemaMap,
          context: selectedContext,
          academicYearName,
          semesterLabel: activeSemesterLabel,
          teachingLoad: selectedTeachingLoad,
        })
      : sourceSections;
    return reconcileRelatedReferenceSnapshots(ensureDerivedSections(hydratedSections));
  };

  const resetForm = () => {
    setEditingEntry(null);
    setEntryTitleHtml('');
    setEntrySummary('');
    setEntryNotes('');
    setEntrySignaturePlaceDate('');
    setEntryTags('');
    setSelectedContextKey('');
    setSections(normalizeSectionsForEditor(buildDefaultSections(activeProgramMeta)));
    resetReferenceSearch();
  };

  const initializeCreate = (openAsModal = true) => {
    const defaultContextKey =
      (usesSheetTemplate && (selectedContextKey || String(assignmentContextOptions[0]?.key || '').trim())) || '';
    const currentContext =
      assignmentContextOptions.find((item) => String(item.key) === String(defaultContextKey || '').trim()) || null;
    const currentTeachingLoad = currentContext ? teachingLoadByContext.get(currentContext.key) || null : null;
    const generatedSections = buildDefaultSections(activeProgramMeta);
    const hydratedSections = usesSheetTemplate
      ? hydrateSheetSections({
          sections: generatedSections,
          schemaMap: activeProgramSchemaMap,
          context: currentContext,
          academicYearName,
          semesterLabel: activeSemesterLabel,
          teachingLoad: currentTeachingLoad,
        })
      : generatedSections;

    setEditingEntry(null);
    setEntrySummary('');
    setEntryNotes('');
    setEntrySignaturePlaceDate(formatStablePlaceDate());
    setEntryTags('');
    setSelectedContextKey(defaultContextKey);
    setEntryTitleHtml(
      createDocumentTitleHtml(
        usesSheetTemplate
          ? buildAutoSheetTitle({
              programLabel: effectiveTitle,
              context: currentContext,
              academicYearName,
              semesterLabel: activeSemesterLabel,
            })
          : '',
      ),
    );
    setSections(normalizeSectionsForEditor(hydratedSections));
    setIsEditorOpen(openAsModal);
  };

  const openCreate = () => {
    initializeCreate(true);
  };

  const openEdit = (entry: TeachingResourceEntry) => {
    const matchedContext =
      assignmentContextOptions.find(
        (item) =>
          Number(item.subjectId) === Number(entry.subjectId || 0) &&
          String(item.className || '').trim().toLowerCase() === String(entry.className || '').trim().toLowerCase(),
      ) || null;
    setEditingEntry(entry);
    setEntryTitleHtml(
      sanitizeDocumentTitleHtml(entry.content?.titleHtml) || createDocumentTitleHtml(String(entry.title || '')),
    );
    setEntrySummary(String(entry.summary || ''));
    setEntryNotes(String((entry.content?.notes as string) || ''));
    setEntrySignaturePlaceDate(
      String(entry.content?.signaturePlaceDate || '').trim() ||
        extractEntrySignatureValues(entry).placeDate ||
        formatStablePlaceDate(entry.createdAt),
    );
    setEntryTags((entry.tags || []).join(', '));
    setSelectedContextKey(matchedContext ? String(matchedContext.key) : '');
    setSections(normalizeSectionsForEditor(parseEntrySections(entry, buildDefaultSections(activeProgramMeta))));
    setIsEditorOpen(true);
  };

  useEffect(() => {
    if (!isEditorOpen) return;
    if (editingEntry) return;
    setSections((prev) => {
      const hasMeaningfulContent = prev.some(
        (section) =>
          section.title.trim() ||
          section.body.trim() ||
          section.rows.some((row) => Object.values(row.values).some((value) => String(value || '').trim())),
      );
      if (hasMeaningfulContent) return normalizeSectionsForEditor(prev);
      return normalizeSectionsForEditor(buildDefaultSections(activeProgramMeta));
    });
  }, [
    activeProgramMeta,
    editingEntry,
    isEditorOpen,
    selectedTeachingLoad?.weeklyClassHours,
    selectedTeachingLoad?.weeklyTotalHours,
  ]);

  useEffect(() => {
    if (!isPageEditor) {
      setPageEditorInitialized(false);
      return;
    }
    if (pageEditorInitialized) return;
    if (programConfigQuery.isLoading) return;
    if (assignmentsQuery.isLoading) return;
    initializeCreate(false);
    setPageEditorInitialized(true);
  }, [
    isPageEditor,
    pageEditorInitialized,
    programConfigQuery.isLoading,
    assignmentsQuery.isLoading,
    activeProgramMeta,
    assignmentContextOptions,
  ]);

  const handleCloseEditor = () => {
    resetForm();
    setIsEditorOpen(false);
    setQuickEditEntryId(null);
    setQuickEditSections([]);
    setQuickEditActiveSectionId('');
    resetReferenceSearch();
    if (isPageEditor) {
      navigate(listPath);
    }
  };

  const invalidateEntries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['teaching-resource-entries'],
    });
    await queryClient.invalidateQueries({
      queryKey: ['teaching-resource-entry-summary'],
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!academicYearId) {
        throw new Error('Tahun ajaran aktif belum ditemukan.');
      }
      const normalizedSections = buildPayloadSections(normalizeSectionsForEditor(sections));
      const referencePayload = buildReferenceSelectionPayload(normalizeSectionsForEditor(sections));
      const normalizedTitleHtml = sanitizeDocumentTitleHtml(entryTitleHtml);
      const normalizedTitle = toDocumentTitlePlainText(normalizedTitleHtml);

      if (!normalizedTitle) {
        throw new Error('Judul dokumen wajib diisi.');
      }
      if (normalizedSections.length === 0) {
        throw new Error('Minimal satu isi bagian dokumen wajib diisi.');
      }

      return teachingResourceProgramService.createEntry({
        academicYearId,
        programCode,
        title: normalizedTitle,
        summary: entrySummary.trim() || undefined,
        subjectId: selectedContext ? Number(selectedContext.subjectId) : undefined,
        classLevel: selectedContext ? selectedContext.classLevel : undefined,
        className: selectedContext ? selectedContext.className : undefined,
        tags: entryTags
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
        content: {
          titleHtml: normalizedTitleHtml || undefined,
          sections: normalizedSections,
          references: referencePayload.references,
          referenceSelections: referencePayload.referenceSelections,
          notes: entryNotes.trim() || undefined,
          signaturePlaceDate: entrySignaturePlaceDate.trim() || undefined,
          schemaVersion: Number(activeProgramMeta?.schema?.version || 1),
          schemaSourceSheet: String(activeProgramMeta?.schema?.sourceSheet || '').trim() || undefined,
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
      toast.success('Dokumen perangkat ajar berhasil disimpan.');
      handleCloseEditor();
      await invalidateEntries();
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Gagal menyimpan dokumen perangkat ajar.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingEntry?.id) {
        throw new Error('Data dokumen tidak valid.');
      }
      const normalizedSections = buildPayloadSections(normalizeSectionsForEditor(sections));
      const referencePayload = buildReferenceSelectionPayload(normalizeSectionsForEditor(sections));
      const normalizedTitleHtml = sanitizeDocumentTitleHtml(entryTitleHtml);
      const normalizedTitle = toDocumentTitlePlainText(normalizedTitleHtml);
      if (!normalizedTitle) {
        throw new Error('Judul dokumen wajib diisi.');
      }
      if (normalizedSections.length === 0) {
        throw new Error('Minimal satu isi bagian dokumen wajib diisi.');
      }

      return teachingResourceProgramService.updateEntry(editingEntry.id, {
        title: normalizedTitle,
        summary: entrySummary.trim(),
        subjectId: selectedContext ? Number(selectedContext.subjectId) : null,
        classLevel: selectedContext ? selectedContext.classLevel : null,
        className: selectedContext ? selectedContext.className : null,
        tags: entryTags
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
        content: {
          titleHtml: normalizedTitleHtml || undefined,
          sections: normalizedSections,
          references: referencePayload.references,
          referenceSelections: referencePayload.referenceSelections,
          notes: entryNotes.trim() || undefined,
          signaturePlaceDate: entrySignaturePlaceDate.trim() || undefined,
          schemaVersion: Number(activeProgramMeta?.schema?.version || 1),
          schemaSourceSheet: String(activeProgramMeta?.schema?.sourceSheet || '').trim() || undefined,
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
      toast.success('Dokumen perangkat ajar berhasil diperbarui.');
      handleCloseEditor();
      await invalidateEntries();
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Gagal memperbarui dokumen perangkat ajar.'));
    },
  });

  const submitMutation = useMutation({
    mutationFn: (entryId: number) => teachingResourceProgramService.submitEntry(entryId),
    onSuccess: async () => {
      toast.success('Dokumen berhasil dikirim untuk review.');
      await invalidateEntries();
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Gagal mengirim dokumen untuk review.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: number) => teachingResourceProgramService.deleteEntry(entryId),
    onSuccess: async () => {
      toast.success('Dokumen berhasil dihapus.');
      await invalidateEntries();
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Gagal menghapus dokumen.'));
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      entryId,
      action,
      reviewNote,
    }: {
      entryId: number;
      action: 'APPROVE' | 'REJECT';
      reviewNote?: string;
    }) => teachingResourceProgramService.reviewEntry(entryId, { action, reviewNote }),
    onSuccess: async (_, variables) => {
      toast.success(variables.action === 'APPROVE' ? 'Dokumen disetujui.' : 'Dokumen dikembalikan untuk revisi.');
      await invalidateEntries();
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Gagal memproses review dokumen.'));
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const quickEditMutation = useMutation({
    mutationFn: async (entry: TeachingResourceEntry) => {
      const sourceSections = quickEditSectionsRef.current.length > 0 ? quickEditSectionsRef.current : quickEditSections;
      const hydratedSourceSections = hydrateEntrySectionsForDisplay(entry, sourceSections);
      const normalizedSections = buildPayloadSections(hydratedSourceSections);
      const referencePayload = buildReferenceSelectionPayload(hydratedSourceSections);
      return teachingResourceProgramService.updateEntry(entry.id, {
        title: String(entry.title || '').trim(),
        summary: String(entry.summary || '').trim() || undefined,
        subjectId: Number(entry.subjectId || 0) || null,
        classLevel: String(entry.classLevel || '').trim() || null,
        className: String(entry.className || '').trim() || null,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        content: {
          ...(entry.content || {}),
          titleHtml:
            sanitizeDocumentTitleHtml(entry.content?.titleHtml) || createDocumentTitleHtml(String(entry.title || '')),
          sections: normalizedSections,
          references:
            referencePayload.references.length > 0
              ? referencePayload.references
              : Array.isArray(entry.content?.references)
                ? entry.content.references
                : undefined,
          referenceSelections:
            referencePayload.referenceSelections.length > 0
              ? referencePayload.referenceSelections
              : Array.isArray(entry.content?.referenceSelections)
                ? entry.content.referenceSelections
                : undefined,
          notes: String(entry.content?.notes || '').trim() || undefined,
          signaturePlaceDate: String(entry.content?.signaturePlaceDate || '').trim() || undefined,
          schemaVersion: Number(activeProgramMeta?.schema?.version || entry.content?.schemaVersion || 1),
          schemaSourceSheet:
            String(activeProgramMeta?.schema?.sourceSheet || entry.content?.schemaSourceSheet || '').trim() || undefined,
          contextScope: entry.content?.contextScope,
        },
      });
    },
    onSuccess: async (response) => {
      const updatedEntry = response.data;
      queryClient.setQueryData(
        ['teaching-resource-entries', programCode, academicYearId, page, statusFilter, search, viewMode],
        (current: typeof entryQuery.data | undefined) => {
          if (!current?.data?.rows || !updatedEntry?.id) return current;
          return {
            ...current,
            data: {
              ...current.data,
              rows: current.data.rows.map((row) => (Number(row.id) === Number(updatedEntry.id) ? updatedEntry : row)),
            },
          };
        },
      );
      toast.success('Perubahan tabel cepat berhasil disimpan.');
      setQuickEditEntryId(null);
      quickEditSectionsRef.current = [];
      setQuickEditSections([]);
      setQuickEditActiveSectionId('');
      await invalidateEntries();
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Gagal menyimpan perubahan tabel cepat.'));
    },
  });

  const resolveSectionSchema = (section: EntrySectionForm): TeachingResourceProgramSectionSchema | undefined =>
    activeProgramSchemaMap.get(String(section.schemaKey || '').trim());

  const resolveSectionColumns = (section: EntrySectionForm): EntrySectionColumnForm[] => {
    const customColumns = sanitizeSectionColumns(section.columns);
    if (customColumns.length > 0) {
      return applyDerivedTableColumnMetadata(applyMonthWeekCalendarColumns(section, customColumns));
    }
    const schema = resolveSectionSchema(section);
    return applyDerivedTableColumnMetadata(applyMonthWeekCalendarColumns(section, sanitizeSectionColumns(schema?.columns)));
  };

  const isKktpPrimaryReferenceColumn = (column?: Partial<EntrySectionColumnForm> | null): boolean =>
    isActiveProgramKktp && getColumnIdentityCandidates(column).includes('tujuan_pembelajaran');

  const getVisualEditableCellLines = (column: EntrySectionColumnForm, value: unknown): string[] => {
    const lines = splitEditableCellLines(value);
    return isKktpPrimaryReferenceColumn(column) ? [lines[0] || ''] : lines;
  };

  const getVisualPrintCellLines = (column: EntrySectionColumnForm | undefined, value: unknown): string[] => {
    const lines = splitCellLines(value);
    return isKktpPrimaryReferenceColumn(column) ? [lines[0] || ''] : lines;
  };

  const getVisibleSectionColumns = (section: EntrySectionForm): EntrySectionColumnForm[] =>
    resolveSectionColumns(section).filter((column) => String(column.key || '').trim().toLowerCase() !== 'tahun_ajaran');

  const isTableSection = (section: EntrySectionForm): boolean =>
    (resolveSectionSchema(section)?.editorType || 'TEXT') === 'TABLE';

  const isContextLikeTableSection = (section: EntrySectionForm): boolean => {
    const sectionSchema = resolveSectionSchema(section);
    const blockType = String(sectionSchema?.blockType || '').trim().toUpperCase();
    const sectionLabel = `${sectionSchema?.label || ''} ${section.title || ''}`.trim().toLowerCase();
    const visibleColumns = getVisibleSectionColumns(section);
    const isSystemOnlyContextTable =
      isTableSection(section) &&
      visibleColumns.length > 0 &&
      section.rows.length <= 1 &&
      visibleColumns.every((column) => isSystemManagedColumn(column));
    return blockType === 'CONTEXT' || sectionLabel.includes('konteks') || isSystemOnlyContextTable;
  };

  const isTeacherEditableTableSection = (section: EntrySectionForm): boolean =>
    isTableSection(section) && !isContextLikeTableSection(section);

  const getMinimumRowCount = (_section: EntrySectionForm): number => 1;

  const canAddRowForSection = (section: EntrySectionForm): boolean => {
    if (!isTableSection(section)) return false;
    return true;
  };

  const isSingleRowSheetForm = (_section: EntrySectionForm): boolean => false;

  const applyReferenceContextSnapshotToSections = (
    sourceSections: EntrySectionForm[],
    snapshot: Record<string, string> | undefined,
  ): EntrySectionForm[] => {
    if (!snapshot) return sourceSections;
    return sourceSections.map((section) => {
      if (!isContextLikeTableSection(section)) return section;
      const columns = resolveSectionColumns(section);
      const rows = section.rows.length > 0 ? section.rows : createSection(resolveSectionSchema(section), 0).rows;
      return {
        ...section,
        columns,
        rows: rows.map((row, rowIndex) => {
          if (rowIndex > 0) return row;
          const values = { ...row.values };
          columns.forEach((column) => {
            const key = String(column.key || '').trim();
            if (!key) return;
            const identity = getColumnIdentityCandidates(column).find((candidate) => CONTEXT_REFERENCE_IDENTITIES.has(candidate));
            if (!identity) return;
            const resolvedValue = String(snapshot[identity] || '').trim();
            if (!resolvedValue) return;
            const currentValue = String(values[key] || '').trim();
            if (!currentValue || isSystemValueColumn(column)) {
              values[key] = resolvedValue;
            }
          });
          return { ...row, values };
        }),
      };
    });
  };

  const getColumnWidthClass = (columnKey: string, multiline = false, dataType = 'TEXT'): string => {
    const key = String(columnKey || '').toLowerCase();
    const normalizedDataType = String(dataType || 'TEXT').toUpperCase();
    if (isActiveProgramMatriksSebaran) {
      if (isMatriksSebaranWeekColumnKey(key)) return 'w-10 min-w-[40px]';
      if (['no', 'nomor'].includes(key)) return 'w-14 min-w-[52px]';
      if (key.includes('tujuan') || key.includes('pembelajaran')) return 'w-[380px] min-w-[340px]';
      if (key.includes('alokasi') || key.includes('jp') || key.includes('jam') || key.includes('waktu')) {
        return 'w-20 min-w-[76px]';
      }
      if (key.includes('semester')) return 'w-24 min-w-[88px]';
    }
    if (normalizedDataType === 'WEEK_GRID') return 'w-[320px] min-w-[300px]';
    if (parseMonthWeekColumnKey(key)) return 'w-8 min-w-[30px]';
    if (['no', 'nomor'].includes(key)) return 'w-14 min-w-[48px]';
    if (key.includes('alokasi') || key.includes('jp')) return 'w-16 min-w-[64px]';
    if (key.includes('tujuan') || key.includes('pembelajaran')) return 'w-[320px] min-w-[260px]';
    if (['MONTH', 'WEEK', 'SEMESTER', 'NUMBER', 'BOOLEAN'].includes(normalizedDataType)) return 'w-28 min-w-[112px]';
    if (['no', 'bulan', 'semester', 'minggu_ke'].includes(key)) return 'w-24 min-w-[96px]';
    if (
      key.includes('jp') ||
      key.includes('jam') ||
      key.includes('minggu_') ||
      key.includes('januari_') ||
      key.includes('februari_') ||
      key.includes('maret_') ||
      key.includes('april_') ||
      key.includes('mei_') ||
      key.includes('juni_') ||
      key.includes('juli_') ||
      key.includes('agustus_') ||
      key.includes('september_') ||
      key.includes('oktober_') ||
      key.includes('nopember_') ||
      key.includes('desember_')
    ) {
      return 'w-24 min-w-[96px]';
    }
    if (multiline) return 'w-[260px] min-w-[220px]';
    return 'w-[200px] min-w-[180px]';
  };

  const getQuickColumnStyle = (
    column: EntrySectionColumnForm,
    allColumns: EntrySectionColumnForm[],
  ): CSSProperties => {
    const key = String(column.key || '').trim().toLowerCase();
    const identityCandidates = getColumnIdentityCandidates(column);
    const isMatriksSebaranTable =
      isActiveProgramMatriksSebaran &&
      allColumns.some(
        (item) => isMatriksSebaranGroupedWeekColumn(item) || isMatriksSebaranWeekColumnKey(item.key),
      );
    if (isMatriksSebaranTable) {
      if (['no', 'nomor', 'number'].includes(key)) return { width: '56px', minWidth: '56px' };
      if (
        identityCandidates.includes('tujuan_pembelajaran') ||
        key.includes('tujuan') ||
        key.includes('pembelajaran')
      ) {
        return { width: '380px', minWidth: '340px' };
      }
      if (
        identityCandidates.includes('alokasi_jp') ||
        key.includes('alokasi') ||
        key.includes('jp') ||
        key.includes('jam') ||
        key.includes('waktu')
      ) {
        return { width: '88px', minWidth: '80px' };
      }
      if (identityCandidates.includes('semester') || key.includes('semester')) return { width: '96px', minWidth: '88px' };
      if (isMatriksSebaranGroupedWeekColumn(column) || isMatriksSebaranWeekColumnKey(key)) {
        return { width: '44px', minWidth: '40px' };
      }
    }
    const columnCount = Math.max(1, allColumns.length);
    if (['no', 'nomor', 'number'].includes(key)) return { width: '6%' };
    if (columnCount <= 1) return { width: '100%' };
    return { width: `${Math.max(10, 94 / (columnCount - 1))}%` };
  };

  const canEditSectionTitle = (section: EntrySectionForm): boolean => {
    const schema = resolveSectionSchema(section);
    if (!schema) return true;
    if ((schema.editorType || 'TEXT') !== 'TABLE') return true;
    return schema.sectionTitleEditable === true;
  };

  const canDeleteSection = (section: EntrySectionForm): boolean => {
    if (sections.length <= 1) return false;
    const schema = resolveSectionSchema(section);
    if (!schema) return true;
    return schema.repeatable;
  };

  const setSectionsWithDerived = (updater: (prev: EntrySectionForm[]) => EntrySectionForm[]) => {
    setSections((prev) => normalizeSectionsForEditor(updater(prev)));
  };

  const setQuickEditSectionsWithDerived = (updater: (prev: EntrySectionForm[]) => EntrySectionForm[]) => {
    setQuickEditSections((prev) => {
      const nextSections = reconcileRelatedReferenceSnapshots(ensureDerivedSections(updater(prev)));
      quickEditSectionsRef.current = nextSections;
      return nextSections;
    });
  };

  const addQuickEditSectionRow = (sectionId: string) => {
    setQuickEditSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        if (!canAddRowForSection(item)) return item;
        const columns = resolveSectionColumns(item);
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
          columns,
          rows: [...item.rows, nextRow],
        };
      }),
    );
  };

  const resolveEntryAssignmentContext = (entry: TeachingResourceEntry): TeacherAssignmentContextOption | null => {
    const scopeClassName =
      String(entry.content?.contextScope?.aggregatedClassName || '').trim() || String(entry.className || '').trim();
    return (
      assignmentContextOptions.find(
        (item) =>
          Number(item.subjectId) === Number(entry.subjectId || 0) &&
          String(item.className || '').trim().toLowerCase() === scopeClassName.toLowerCase(),
      ) || null
    );
  };

  const hydrateEntrySectionsForDisplay = (
    entry: TeachingResourceEntry,
    sourceSections: EntrySectionForm[],
  ): EntrySectionForm[] => {
    if (!usesSheetTemplate) return reconcileRelatedReferenceSnapshots(ensureDerivedSections(sourceSections));
    const entryContext = resolveEntryAssignmentContext(entry);
    return reconcileRelatedReferenceSnapshots(
      ensureDerivedSections(
        hydrateSheetSections({
          sections: sourceSections,
          schemaMap: activeProgramSchemaMap,
          context: entryContext,
          academicYearName,
          semesterLabel: activeSemesterLabel,
          teachingLoad: entryContext ? teachingLoadByContext.get(entryContext.key) || null : null,
        }),
      ),
    );
  };

  const getEntryTableSections = (entry: TeachingResourceEntry): EntrySectionForm[] =>
    hydrateEntrySectionsForDisplay(entry, parseEntrySections(entry, buildDefaultSections(activeProgramMeta))).filter((section) =>
      isTeacherEditableTableSection(section),
    );

  const closeQuickEdit = () => {
    setQuickEditEntryId(null);
    quickEditSectionsRef.current = [];
    setQuickEditSections([]);
    setQuickEditActiveSectionId('');
    resetReferenceSearch();
  };

  useEffect(() => {
    if (isPageEditor || isEditorOpen || entryQuery.isLoading) return;
    const editableEntry =
      rows.find(
        (entry) =>
          Number(entry.teacherId) === Number(user?.id || 0) &&
          entry.status !== 'APPROVED' &&
          getEntryTableSections(entry).length > 0,
      ) || null;

    if (!editableEntry) {
      if (quickEditEntryId) closeQuickEdit();
      return;
    }
    if (quickEditEntryId === editableEntry.id) {
      const currentSections =
        quickEditSectionsRef.current.length > 0
          ? quickEditSectionsRef.current
          : parseEntrySections(editableEntry, buildDefaultSections(activeProgramMeta));
      const hydratedSections = hydrateEntrySectionsForDisplay(editableEntry, currentSections);
      quickEditSectionsRef.current = hydratedSections;
      setQuickEditSections(hydratedSections);
      return;
    }

    const parsedSections = hydrateEntrySectionsForDisplay(
      editableEntry,
      parseEntrySections(editableEntry, buildDefaultSections(activeProgramMeta)),
    );
    const tableSections = parsedSections.filter((section) => isTeacherEditableTableSection(section));
    setQuickEditEntryId(editableEntry.id);
    quickEditSectionsRef.current = parsedSections;
    setQuickEditSections(parsedSections);
    setQuickEditActiveSectionId(tableSections[0]?.id || '');
  }, [
    academicYearName,
    activeProgramMeta,
    activeProgramSchemaMap,
    activeSemesterLabel,
    assignmentContextOptions,
    entryQuery.isLoading,
    isEditorOpen,
    isPageEditor,
    quickEditEntryId,
    rows,
    teachingLoadByContext,
    user?.id,
    usesSheetTemplate,
  ]);

  useEffect(() => {
    if (!quickEditEntryId || !referenceEntriesQuery.data) return;
    setQuickEditSections((prev) => {
      const nextSections = reconcileRelatedReferenceSnapshots(ensureDerivedSections(prev));
      if (nextSections === prev) return prev;
      quickEditSectionsRef.current = nextSections;
      return nextSections;
    });
  }, [quickEditEntryId, referenceEntriesQuery.data]);

  useEffect(() => {
    if ((!isEditorOpen && !isPageEditor) || !referenceEntriesQuery.data) return;
    setSections((prev) => normalizeSectionsForEditor(prev));
  }, [isEditorOpen, isPageEditor, referenceEntriesQuery.data]);

  const updateQuickEditRowCell = (sectionId: string, rowId: string, columnKey: string, value: string) => {
    setQuickEditSectionsWithDerived((prev) =>
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

  const updateQuickEditRowCellLine = (
    sectionId: string,
    rowId: string,
    columnKey: string,
    lineIndex: number,
    value: string,
  ) => {
    setQuickEditSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        return {
          ...item,
          rows: item.rows.map((row) => {
            if (row.id !== rowId) return row;
            const currentLines = splitEditableCellLines(row.values[columnKey]);
            const replacementLines = String(value).replace(/\r\n/g, '\n').split('\n');
            const safeLineIndex = Math.max(0, Number(lineIndex) || 0);
            const nextLines = [...currentLines];
            while (nextLines.length <= safeLineIndex) nextLines.push('');
            nextLines.splice(safeLineIndex, 1, ...replacementLines);
            return {
              ...row,
              values: {
                ...row.values,
                [columnKey]: nextLines.join('\n'),
              },
            };
          }),
        };
      }),
    );
  };

  const buildQuickCellFocusKey = (sectionId: string, rowId: string, columnKey: string, lineIndex: number): string =>
    `${sectionId}::${rowId}::${columnKey}::${lineIndex}`;

  const focusQuickEditCellLine = (sectionId: string, rowId: string, columnKey: string, lineIndex: number) => {
    window.setTimeout(() => {
      const target = quickEditCellRefs.current[buildQuickCellFocusKey(sectionId, rowId, columnKey, lineIndex)];
      if (!target) return;
      target.focus();
      target.setSelectionRange(target.value.length, target.value.length);
    }, 0);
  };

  const handleQuickEditCellEnter = (
    sectionId: string,
    rowId: string,
    columnKey: string,
    lineIndex: number,
    value: string,
  ) => {
    const nextValue = `${value}\n`;
    updateQuickEditRowCellLine(sectionId, rowId, columnKey, lineIndex, nextValue);
    focusQuickEditCellLine(sectionId, rowId, columnKey, lineIndex + 1);
  };

  const toggleQuickEditRowLineMark = (
    sectionId: string,
    rowId: string,
    columnKey: string,
    lineIndex: number,
    currentValue: string,
  ) => {
    updateQuickEditRowCellLine(sectionId, rowId, columnKey, lineIndex, isTruthyMark(currentValue) ? '' : MARK_VALUE);
  };

  const promptQuickEditMonthWeekText = (
    sectionId: string,
    rowId: string,
    columnKey: string,
    lineIndex: number,
    currentValue: string,
  ) => {
    setMonthWeekNoteModal({
      mode: 'quick',
      sectionId,
      rowId,
      columnKey,
      lineIndex,
      value: isTruthyMark(currentValue) ? '' : String(currentValue || '').trim(),
    });
  };

  const buildMonthWeekClickKey = (
    scope: 'quick' | 'editor',
    sectionId: string,
    rowId: string,
    columnKey: string,
    lineIndex: number,
  ) => `${scope}:${sectionId}:${rowId}:${columnKey}:${lineIndex}`;

  const clearMonthWeekClickTimer = (key: string) => {
    const timer = monthWeekClickTimersRef.current[key];
    if (timer) window.clearTimeout(timer);
    delete monthWeekClickTimersRef.current[key];
  };

  const scheduleMonthWeekToggle = (key: string, action: () => void) => {
    clearMonthWeekClickTimer(key);
    monthWeekClickTimersRef.current[key] = window.setTimeout(() => {
      delete monthWeekClickTimersRef.current[key];
      action();
    }, 220);
  };

  const renderQuickMonthWeekCellControl = (
    section: EntrySectionForm,
    row: EntrySectionForm['rows'][number] | undefined,
    columnKey: string,
    value: string,
    readOnly: boolean,
    lineIndex: number,
    rowSpanCount = 1,
  ) => {
    const checked = isTruthyMark(value);
    const note = checked ? '' : String(value || '').trim();
    const clickKey = row?.id ? buildMonthWeekClickKey('quick', section.id, row.id, columnKey, lineIndex) : '';
    return (
      <button
        type="button"
        disabled={readOnly || !row?.id}
        title="Klik untuk ceklis/kosong. Klik dua kali atau klik kanan untuk isi keterangan libur/kegiatan."
        onClick={() => {
          if (!row?.id || !clickKey) return;
          scheduleMonthWeekToggle(clickKey, () =>
            toggleQuickEditRowLineMark(section.id, row.id, columnKey, lineIndex, value),
          );
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (clickKey) clearMonthWeekClickTimer(clickKey);
          if (row?.id) promptQuickEditMonthWeekText(section.id, row.id, columnKey, lineIndex, value);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (clickKey) clearMonthWeekClickTimer(clickKey);
          if (row?.id) promptQuickEditMonthWeekText(section.id, row.id, columnKey, lineIndex, value);
        }}
        style={rowSpanCount > 1 ? { minHeight: `${Math.max(50, rowSpanCount * 48)}px` } : undefined}
        className={`inline-flex min-h-[50px] w-7 items-center justify-center rounded-md border px-0.5 py-1 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          checked
            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
            : note
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
        }`}
      >
        {checked ? (
          MARK_VALUE
        ) : note ? (
          <span className="block whitespace-nowrap overflow-visible text-[9px] leading-none [writing-mode:vertical-rl] [transform:rotate(180deg)]">
            {note}
          </span>
        ) : (
          '-'
        )}
      </button>
    );
  };

  const toggleQuickEditKktpCriteria = (
    sectionId: string,
    rowId: string,
    columnKey: 'kurang_memadai' | 'memadai',
    lineIndex = 0,
  ) => {
    const oppositeKey = columnKey === 'kurang_memadai' ? 'memadai' : 'kurang_memadai';
    setQuickEditSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        return {
          ...item,
          rows: item.rows.map((row) => {
            if (row.id !== rowId) return row;
            const safeLineIndex = Math.max(0, Number(lineIndex) || 0);
            const activeNow = isTruthyMark(splitEditableCellLines(row.values[columnKey])[safeLineIndex] || '');
            return {
              ...row,
              values: {
                ...row.values,
                [columnKey]: setCellLineValue(row.values[columnKey], safeLineIndex, activeNow ? '' : MARK_VALUE),
                [oppositeKey]: activeNow
                  ? String(row.values[oppositeKey] || '')
                  : setCellLineValue(row.values[oppositeKey], safeLineIndex, ''),
              },
            };
          }),
        };
      }),
    );
  };

  const renderQuickEditWeekGridControl = (
    section: EntrySectionForm,
    row: EntrySectionForm['rows'][number] | undefined,
    columnKey: string,
    value: string,
    readOnly: boolean,
  ) => {
    const selectedWeeks = new Set(parseWeekGridValue(value));
    return (
      <div className="grid grid-cols-5 gap-1">
        {WEEK_OPTIONS.map((week) => {
          const active = selectedWeeks.has(week);
          return (
            <button
              key={`quick-${section.id}-${row?.id || 'row'}-${columnKey}-${week}`}
              type="button"
              disabled={readOnly || !row?.id}
              onClick={() =>
                row?.id ? updateQuickEditRowCell(section.id, row.id, columnKey, toggleWeekGridValue(value, week)) : null
              }
              className={`h-7 rounded border text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              M{week}
            </button>
          );
        })}
      </div>
    );
  };

  const applyQuickDocumentReferenceSelection = (
    sectionId: string,
    rowId: string,
    sourceColumn: EntrySectionColumnForm,
    lineIndex: number,
    selectionToken: string,
  ) => {
    setQuickEditSectionsWithDerived((prev) => {
      let selectedSnapshot: Record<string, string> | undefined;
      const nextSections = prev.map((item) => {
        if (item.id !== sectionId) return item;
        return {
          ...item,
          rows: item.rows.map((row) => {
            if (row.id !== rowId) return row;
            const columnKey = String(sourceColumn.key || '').trim();
            const selectionKey = buildReferenceSelectionLineKey(columnKey, lineIndex);
            const referenceOptions =
              referenceOptionsByColumnKey.get(`${String(item.schemaKey || '').trim()}::${columnKey}`) || [];
            const selectedOption = referenceOptions.find((option) => option.selectValue === selectionToken);
            if (selectedOption?.snapshot) selectedSnapshot = selectedOption.snapshot;
            const nextValues = {
              ...row.values,
            };
            const shouldKeepReferenceAsSingleParent = isKktpPrimaryReferenceColumn(sourceColumn);
            const selectedValue = shouldKeepReferenceAsSingleParent
              ? getFirstReferenceValueLine(selectedOption?.value || '')
              : selectedOption?.value || '';
            const shouldReplaceWholeSourceCell =
              !shouldKeepReferenceAsSingleParent &&
              Boolean(selectedOption?.isAggregate || String(selectedOption?.value || '').includes('\n'));
            nextValues[columnKey] =
              selectedOption && shouldReplaceWholeSourceCell
                ? selectedValue
                : setCellLineValue(nextValues[columnKey], lineIndex, selectedValue);
            const nextReferenceSelections = {
              ...(row.referenceSelections || {}),
            };

            if (selectedOption) {
              nextReferenceSelections[selectionKey] = {
                sectionSchemaKey: String(item.schemaKey || '').trim() || undefined,
                columnKey,
                selectionToken: selectedOption.selectValue,
                sourceProgramCode: selectedOption.sourceProgramCode,
                sourceEntryId: selectedOption.sourceEntryId,
                sourceEntryTitle: selectedOption.sourceEntryTitle,
                sourceFieldKey: selectedOption.sourceFieldKey,
                sourceFieldIdentity: selectedOption.sourceFieldIdentity,
                value: shouldKeepReferenceAsSingleParent ? selectedValue : selectedOption.value,
                label: shouldKeepReferenceAsSingleParent
                  ? formatReferenceOptionLabel(selectedOption.value, selectedOption.label)
                  : selectedOption.label,
                snapshot: selectedOption.snapshot,
              };
            } else {
              delete nextReferenceSelections[selectionKey];
            }

            item.columns.forEach((targetColumn) => {
              const targetKey = String(targetColumn.key || '').trim();
              if (!targetKey || targetKey === columnKey) return;
              const targetSourceType = String(targetColumn.sourceType || '').trim().toUpperCase();
              const canReceiveSnapshot =
                targetSourceType === 'DOCUMENT_SNAPSHOT' ||
                (targetSourceType === 'DOCUMENT_REFERENCE' && isSecondaryReferenceColumn(item, targetColumn)) ||
                (Boolean(selectedOption) &&
                  normalizeTeachingResourceProgramCode(targetColumn.binding?.sourceProgramCode) ===
                    normalizeTeachingResourceProgramCode(selectedOption?.sourceProgramCode));
              if (!canReceiveSnapshot) return;
              const allowManualOverride = Boolean(targetColumn.binding?.allowManualOverride);
              if (!selectedOption) {
                if (!allowManualOverride) {
                  nextValues[targetKey] = '';
                }
                return;
              }
              const resolvedValue = getSnapshotValueForColumn(selectedOption.snapshot, targetColumn);
              if (!resolvedValue) return;
              const targetLineValue = splitCellLines(nextValues[targetKey])[lineIndex] ?? '';
              const shouldReplaceWholeTargetCell = Boolean(selectedOption.isAggregate || resolvedValue.includes('\n'));
              if (
                allowManualOverride &&
                String(targetLineValue || '').trim() &&
                targetSourceType !== 'DOCUMENT_REFERENCE' &&
                !shouldReplaceWholeTargetCell
              ) {
                return;
              }
              nextValues[targetKey] =
                shouldReplaceWholeTargetCell
                  ? resolvedValue
                  : setCellLineValue(nextValues[targetKey], lineIndex, resolvedValue);
            });

            return {
              ...row,
              values: nextValues,
              referenceSelections: Object.keys(nextReferenceSelections).length > 0 ? nextReferenceSelections : undefined,
            };
          }),
        };
      });
      return applyReferenceContextSnapshotToSections(nextSections, selectedSnapshot);
    });
  };

  const renderQuickEditCellControl = (
    section: EntrySectionForm,
    row: EntrySectionForm['rows'][number] | undefined,
    column: EntrySectionColumnForm,
    lineIndex = 0,
  ) => {
    const columnKey = String(column.key || '').trim();
    const rawCellValue = String(row?.values?.[columnKey] ?? '');
    const value = splitEditableCellLines(rawCellValue)[lineIndex] ?? '';
    const dataType = getColumnDataType(column);
    const readOnly = isSystemManagedColumn(column);
    const centerAligned = isCenterAlignedTableColumn(column);
    const isMonthWeekReferenceCell =
      isActiveProgramMonthWeekPromes &&
      Boolean(buildMonthWeekColumnLayout(section.columns)) &&
      getColumnIdentityCandidates(column).includes('tujuan_pembelajaran');
    const focusKey =
      row?.id && columnKey ? buildQuickCellFocusKey(section.id, row.id, columnKey, lineIndex) : '';
    const tableCellControlClassName = `block w-full border-0 bg-transparent px-1 py-1 text-xs leading-relaxed text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${
      readOnly ? 'cursor-not-allowed text-slate-500' : ''
    } ${centerAligned ? 'text-center' : ''}`;
    const selectClassName = `h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none ${
      readOnly ? 'cursor-not-allowed bg-slate-50 text-slate-500' : ''
    } ${centerAligned ? 'text-center' : ''}`;

    if (isMonthWeekReferenceCell) {
      return (
        <div
          className={`min-h-[42px] whitespace-pre-wrap rounded-md border px-2 py-2 text-left text-xs leading-relaxed ${
            value
              ? 'border-slate-200 bg-slate-50 text-slate-800'
              : 'border-slate-100 bg-slate-50/60 text-slate-400'
          }`}
        >
          {value || '-'}
        </div>
      );
    }

    if (shouldRenderDocumentReferencePicker(section, column)) {
      const selectionKey = buildReferenceSelectionLineKey(columnKey, lineIndex);
      const referenceSelection =
        row?.referenceSelections?.[selectionKey] || (lineIndex === 0 ? row?.referenceSelections?.[columnKey] : undefined);
      const aggregateReferenceSelection = row?.referenceSelections?.[columnKey];
      const shouldKeepReferenceAsSingleParent = isKktpPrimaryReferenceColumn(column);
      const aggregateReferenceLines = shouldKeepReferenceAsSingleParent
        ? []
        : splitCellLines(aggregateReferenceSelection?.value)
            .map((line) => line.trim())
            .filter(isMeaningfulReferenceValue);
      const aggregateLineValue = aggregateReferenceLines[lineIndex] || value;
      if (lineIndex > 0 && aggregateReferenceLines.length > lineIndex && aggregateLineValue) {
        return (
          <div
            className={`min-h-[42px] whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs leading-relaxed text-slate-800 ${
              centerAligned ? 'text-center' : 'text-left'
            }`}
            title="Baris ini mengikuti pilihan referensi induk pada baris pertama grup."
          >
            {aggregateLineValue}
          </div>
        );
      }
      const referenceOptions =
        referenceOptionsByColumnKey.get(`${String(section.schemaKey || '').trim()}::${columnKey}`) || [];
      const sourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
      const sourceFieldIdentity =
        String(column.binding?.sourceFieldIdentity || column.binding?.sourceDocumentFieldIdentity || '').trim();
      const storedSelectionSourceProgramCode = normalizeTeachingResourceProgramCode(referenceSelection?.sourceProgramCode);
      const storedSelectionMatchesBinding =
        !storedSelectionSourceProgramCode || !sourceProgramCode || storedSelectionSourceProgramCode === sourceProgramCode;
      const storedSelectionToken = storedSelectionMatchesBinding ? String(referenceSelection?.selectionToken || '').trim() : '';
      const referenceSelectValue =
        (isMonthWeekReferenceCell ? '' : storedSelectionToken) ||
        referenceOptions.find((option) => option.value === value)?.selectValue ||
        storedSelectionToken ||
        '';
      const sourceProgramLabel =
        String(programMetaByCode.get(sourceProgramCode)?.label || '').trim() || sourceProgramCode || 'dokumen sumber';
      const hasReferenceBinding = Boolean(sourceProgramCode && sourceFieldIdentity);
      const fallbackReferenceOption =
        referenceSelectValue &&
        !referenceOptions.some((option) => option.selectValue === referenceSelectValue)
          ? {
              selectValue: referenceSelectValue,
              value: shouldKeepReferenceAsSingleParent
                ? getFirstReferenceValueLine(referenceSelection?.value || value)
                : String(referenceSelection?.value || value || '').trim(),
              label: shouldKeepReferenceAsSingleParent
                ? formatReferenceOptionLabel(referenceSelection?.value || value, referenceSelection?.label)
                : formatGroupedReferenceOptionLabel(referenceSelection?.value || value, referenceSelection?.label),
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
      const referenceSearchKey = buildReferenceSearchKey('quick', section.id, row?.id, columnKey);
      const referenceSearchTerm = referenceSearchTerms[referenceSearchKey] || '';
      const effectiveReferenceSearchTerm = isMonthWeekReferenceCell || isActiveProgramKktp ? '' : referenceSearchTerm;
      const filteredReferenceSelectOptions = keepSelectedReferenceOptionVisible(
        filterReferenceOptions(referenceSelectOptions, effectiveReferenceSearchTerm),
        referenceSelectOptions,
        referenceSelectValue,
      );
      const showReferenceSearch =
        !isMonthWeekReferenceCell && !isActiveProgramKktp && (referenceSelectOptions.length > 6 || Boolean(effectiveReferenceSearchTerm));
      const referenceLimitHelperText = getReferenceLimitHelperText(sourceProgramCode, sourceProgramLabel);
      const referenceSearchHelperText =
        referenceEntriesQuery.isFetching && effectiveReferenceSearchTerm.trim().length >= 2
          ? 'Mencari referensi sumber...'
          : '';
      const disableReferenceSelect =
        !row?.id || !hasReferenceBinding || (referenceSelectOptions.length === 0 && !referenceSelectValue);
      const referencePlaceholder = !hasReferenceBinding
        ? 'Referensi belum dikonfigurasi'
        : referenceSelectOptions.length > 0 && filteredReferenceSelectOptions.length === 0
          ? 'Tidak ada hasil'
          : referenceSelectOptions.length > 0
          ? 'Pilih referensi'
          : `Isi ${sourceProgramLabel} dulu`;
      return (
        <div className="space-y-1">
          {showReferenceSearch ? (
            <input
              type="search"
              value={referenceSearchTerm}
              disabled={disableReferenceSelect}
              onChange={(event) => updateReferenceSearchTerm(referenceSearchKey, event.target.value)}
              placeholder={`Cari ${sourceProgramLabel}`}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            />
          ) : null}
          <select
            value={referenceSelectValue}
            disabled={disableReferenceSelect}
            onChange={(event) => {
              applyQuickDocumentReferenceSelection(section.id, row?.id || '', column, lineIndex, event.target.value);
              updateReferenceSearchTerm(referenceSearchKey, '');
            }}
            className={selectClassName}
          >
            <option value="">{referencePlaceholder}</option>
            {filteredReferenceSelectOptions.map((option) => (
              <option key={`quick-${columnKey}-${option.selectValue}`} value={option.selectValue}>
                {option.label}
              </option>
            ))}
          </select>
          {disableReferenceSelect && hasReferenceBinding ? (
            <p className="px-1 text-[10px] leading-4 text-slate-500">Belum ada data sumber yang cocok.</p>
          ) : effectiveReferenceSearchTerm && filteredReferenceSelectOptions.length === 0 ? (
            <p className="px-1 text-[10px] leading-4 text-slate-500">Tidak ada referensi yang cocok dengan pencarian.</p>
          ) : referenceSearchHelperText ? (
            <p className="px-1 text-[10px] leading-4 text-slate-500">{referenceSearchHelperText}</p>
          ) : referenceLimitHelperText ? (
            <p className="px-1 text-[10px] leading-4 text-slate-500">{referenceLimitHelperText}</p>
          ) : null}
        </div>
      );
    }

    if (isSecondaryReferenceColumn(section, column)) {
      return (
        <div
          className={`min-h-[34px] whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs leading-relaxed text-slate-800 ${
            centerAligned ? 'text-center' : ''
          }`}
          title="Nilai mengikuti referensi induk pada grup ini."
        >
          {value || '-'}
        </div>
      );
    }

    if (readOnly && !isWeekColumnKey(columnKey) && dataType !== 'BOOLEAN' && dataType !== 'WEEK_GRID') {
      return (
        <div
          className={`min-h-[34px] whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs leading-relaxed text-slate-700 ${
            centerAligned ? 'text-center' : ''
          }`}
        >
          {value
            ? dataType === 'NUMBER' && splitCellLines(value).length <= 1
              ? formatNumericValue(parseNumber(value))
              : splitCellLines(value).join('\n')
            : '-'}
        </div>
      );
    }

    if (isWeekColumnKey(columnKey)) {
      return renderQuickMonthWeekCellControl(section, row, columnKey, value, readOnly, lineIndex);
    }

    if (isKktpCriteriaColumnKey(columnKey)) {
      const isChecked = isTruthyMark(value);
      return (
        <button
          type="button"
          disabled={readOnly || !row?.id}
          onClick={() =>
            row?.id ? toggleQuickEditKktpCriteria(section.id, row.id, columnKey as 'kurang_memadai' | 'memadai', lineIndex) : null
          }
          className={`inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isChecked
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {isChecked ? MARK_VALUE : '-'}
        </button>
      );
    }

    if (dataType === 'WEEK_GRID') {
      return renderQuickEditWeekGridControl(section, row, columnKey, value, readOnly);
    }

    if (dataType === 'MONTH') {
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateQuickEditRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih Bulan</option>
          {MONTH_OPTIONS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'WEEK') {
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateQuickEditRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih Minggu</option>
          {WEEK_OPTIONS.map((week) => (
            <option key={week} value={week}>
              Minggu {week}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'SEMESTER') {
      const semesterOptions = Array.isArray(column.options) && column.options.length > 0 ? column.options : SEMESTER_OPTIONS;
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateQuickEditRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih Semester</option>
          {semesterOptions.map((semester) => (
            <option key={semester} value={semester}>
              {semester}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'SELECT' && Array.isArray(column.options) && column.options.length > 0) {
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateQuickEditRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih</option>
          {column.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'BOOLEAN') {
      const isChecked = isTruthyMark(value);
      return (
        <button
          type="button"
          disabled={readOnly || !row?.id}
          onClick={() =>
            row?.id ? updateQuickEditRowCell(section.id, row.id, columnKey, isChecked ? '' : MARK_VALUE) : null
          }
          className={`inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isChecked
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {isChecked ? MARK_VALUE : '-'}
        </button>
      );
    }

    if (!['MONTH', 'WEEK', 'SEMESTER', 'SELECT', 'BOOLEAN', 'WEEK_GRID'].includes(dataType)) {
      return (
        <textarea
          ref={(element) => {
            if (focusKey) quickEditCellRefs.current[focusKey] = element;
            resizeTextareaToContent(element);
          }}
          rows={2}
          value={value}
          disabled={readOnly}
          onChange={(event) =>
            updateQuickEditRowCellLine(section.id, row?.id || '', columnKey, lineIndex, event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || readOnly || !row?.id) return;
            event.preventDefault();
            handleQuickEditCellEnter(section.id, row.id, columnKey, lineIndex, value);
          }}
          onInput={(event) => {
            resizeTextareaToContent(event.currentTarget);
          }}
          placeholder={column.placeholder || ''}
          className={`${tableCellControlClassName} min-h-[42px] resize-y overflow-hidden`}
        />
      );
    }

    return (
      <input
        ref={(element) => {
          if (focusKey) quickEditCellRefs.current[focusKey] = element;
        }}
        type="text"
        value={value}
        disabled={readOnly}
        onChange={(event) => updateQuickEditRowCellLine(section.id, row?.id || '', columnKey, lineIndex, event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || readOnly || !row?.id) return;
          event.preventDefault();
          handleQuickEditCellEnter(section.id, row.id, columnKey, lineIndex, value);
        }}
        placeholder={column.placeholder || ''}
        className={tableCellControlClassName}
      />
    );
  };

  const applyDocumentReferenceSelection = (
    sectionId: string,
    rowId: string,
    sourceColumn: EntrySectionColumnForm,
    selectionToken: string,
  ) => {
    setSectionsWithDerived((prev) => {
      let selectedSnapshot: Record<string, string> | undefined;
      const nextSections = prev.map((item) => {
        if (item.id !== sectionId) return item;
        return {
          ...item,
          rows: item.rows.map((row) => {
            if (row.id !== rowId) return row;
            const columnKey = String(sourceColumn.key || '').trim();
            const referenceOptions =
              referenceOptionsByColumnKey.get(`${String(item.schemaKey || '').trim()}::${columnKey}`) || [];
            const selectedOption = referenceOptions.find((option) => option.selectValue === selectionToken);
            if (selectedOption?.snapshot) selectedSnapshot = selectedOption.snapshot;
            const shouldKeepReferenceAsSingleParent = isKktpPrimaryReferenceColumn(sourceColumn);
            const selectedValue = shouldKeepReferenceAsSingleParent
              ? getFirstReferenceValueLine(selectedOption?.value || '')
              : selectedOption?.value || '';
            const nextValues = {
              ...row.values,
              [columnKey]: selectedValue,
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
                value: shouldKeepReferenceAsSingleParent ? selectedValue : selectedOption.value,
                label: shouldKeepReferenceAsSingleParent
                  ? formatReferenceOptionLabel(selectedOption.value, selectedOption.label)
                  : selectedOption.label,
                snapshot: selectedOption.snapshot,
              };
            } else {
              delete nextReferenceSelections[columnKey];
            }

            item.columns.forEach((targetColumn) => {
              const targetKey = String(targetColumn.key || '').trim();
              if (!targetKey || targetKey === columnKey) return;
              const targetSourceType = String(targetColumn.sourceType || '').trim().toUpperCase();
              const canReceiveSnapshot =
                targetSourceType === 'DOCUMENT_SNAPSHOT' ||
                (targetSourceType === 'DOCUMENT_REFERENCE' && isSecondaryReferenceColumn(item, targetColumn)) ||
                (Boolean(selectedOption) &&
                  normalizeTeachingResourceProgramCode(targetColumn.binding?.sourceProgramCode) ===
                    normalizeTeachingResourceProgramCode(selectedOption?.sourceProgramCode));
              if (!canReceiveSnapshot) return;
              const allowManualOverride = Boolean(targetColumn.binding?.allowManualOverride);
              if (!selectedOption) {
                if (!allowManualOverride) {
                  nextValues[targetKey] = '';
                }
                return;
              }
              const resolvedValue = getSnapshotValueForColumn(selectedOption.snapshot, targetColumn);
              if (!resolvedValue) return;
              const shouldReplaceWholeTargetCell = Boolean(selectedOption.isAggregate || resolvedValue.includes('\n'));
              if (
                allowManualOverride &&
                String(nextValues[targetKey] || '').trim() &&
                targetSourceType !== 'DOCUMENT_REFERENCE' &&
                !shouldReplaceWholeTargetCell
              ) {
                return;
              }
              nextValues[targetKey] = resolvedValue;
            });

            return {
              ...row,
              values: nextValues,
              referenceSelections: Object.keys(nextReferenceSelections).length > 0 ? nextReferenceSelections : undefined,
            };
          }),
        };
      });
      return applyReferenceContextSnapshotToSections(nextSections, selectedSnapshot);
    });
  };

  const updateSectionField = (sectionId: string, field: 'title' | 'body', value: string) => {
    setSectionsWithDerived((prev) =>
      prev.map((item) =>
        item.id === sectionId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  };

  const addSectionRow = (sectionId: string) => {
    setSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        if (!canAddRowForSection(item)) return item;
        const columns = resolveSectionColumns(item);
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
          columns,
          rows: [...item.rows, nextRow],
        };
      }),
    );
  };

  const removeSectionRow = (sectionId: string, rowId: string) => {
    setSectionsWithDerived((prev) =>
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

  const updateSectionRowCell = (sectionId: string, rowId: string, columnKey: string, value: string) => {
    setSectionsWithDerived((prev) =>
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

  const toggleSectionRowMark = (sectionId: string, rowId: string, columnKey: string) => {
    setSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        return {
          ...item,
          rows: item.rows.map((row) => {
            if (row.id !== rowId) return row;
            const current = String(row.values[columnKey] || '');
            return {
              ...row,
              values: {
                ...row.values,
                [columnKey]: isTruthyMark(current) ? '' : MARK_VALUE,
              },
            };
          }),
        };
      }),
    );
  };

  const promptSectionMonthWeekText = (sectionId: string, rowId: string, columnKey: string, currentValue: string) => {
    setMonthWeekNoteModal({
      mode: 'editor',
      sectionId,
      rowId,
      columnKey,
      lineIndex: 0,
      value: isTruthyMark(currentValue) ? '' : String(currentValue || '').trim(),
    });
  };

  const saveMonthWeekNoteModal = () => {
    if (!monthWeekNoteModal) return;
    const nextValue = monthWeekNoteModal.value.trim();
    if (monthWeekNoteModal.mode === 'quick') {
      updateQuickEditRowCellLine(
        monthWeekNoteModal.sectionId,
        monthWeekNoteModal.rowId,
        monthWeekNoteModal.columnKey,
        monthWeekNoteModal.lineIndex,
        nextValue,
      );
    } else {
      updateSectionRowCell(
        monthWeekNoteModal.sectionId,
        monthWeekNoteModal.rowId,
        monthWeekNoteModal.columnKey,
        nextValue,
      );
    }
    setMonthWeekNoteModal(null);
  };

  const renderMonthWeekCellControl = (
    section: EntrySectionForm,
    row: EntrySectionForm['rows'][number] | undefined,
    columnKey: string,
    value: string,
    readOnly: boolean,
  ) => {
    const checked = isTruthyMark(value);
    const note = checked ? '' : String(value || '').trim();
    const clickKey = row?.id ? buildMonthWeekClickKey('editor', section.id, row.id, columnKey, 0) : '';
    return (
      <button
        type="button"
        disabled={readOnly || !row?.id}
        title="Klik untuk ceklis/kosong. Klik dua kali atau klik kanan untuk isi keterangan libur/kegiatan."
        onClick={() => {
          if (!row?.id || !clickKey) return;
          scheduleMonthWeekToggle(clickKey, () => toggleSectionRowMark(section.id, row.id, columnKey));
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (clickKey) clearMonthWeekClickTimer(clickKey);
          if (row?.id) promptSectionMonthWeekText(section.id, row.id, columnKey, value);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (clickKey) clearMonthWeekClickTimer(clickKey);
          if (row?.id) promptSectionMonthWeekText(section.id, row.id, columnKey, value);
        }}
        className={`inline-flex min-h-[50px] w-7 items-center justify-center rounded-md border px-0.5 py-1 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          checked
            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
            : note
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
        }`}
      >
        {checked ? (
          MARK_VALUE
        ) : note ? (
          <span className="block max-h-24 overflow-hidden [writing-mode:vertical-rl] [transform:rotate(180deg)]">{note}</span>
        ) : (
          '-'
        )}
      </button>
    );
  };

  const toggleKktpCriteria = (sectionId: string, rowId: string, columnKey: 'kurang_memadai' | 'memadai') => {
    const oppositeKey = columnKey === 'kurang_memadai' ? 'memadai' : 'kurang_memadai';
    setSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        return {
          ...item,
          rows: item.rows.map((row) => {
            if (row.id !== rowId) return row;
            const activeNow = isTruthyMark(String(row.values[columnKey] || ''));
            return {
              ...row,
              values: {
                ...row.values,
                [columnKey]: activeNow ? '' : MARK_VALUE,
                [oppositeKey]: activeNow ? String(row.values[oppositeKey] || '') : '',
              },
            };
          }),
        };
      }),
    );
  };

  const renderWeekGridControl = (
    section: EntrySectionForm,
    row: EntrySectionForm['rows'][number] | undefined,
    columnKey: string,
    value: string,
    readOnly: boolean,
  ) => {
    const selectedWeeks = new Set(parseWeekGridValue(value));
    return (
      <div className="grid grid-cols-5 gap-1">
        {WEEK_OPTIONS.map((week) => {
          const active = selectedWeeks.has(week);
          return (
            <button
              key={`${section.id}-${row?.id || 'row'}-${columnKey}-${week}`}
              type="button"
              disabled={readOnly || !row?.id}
              onClick={() =>
                row?.id ? updateSectionRowCell(section.id, row.id, columnKey, toggleWeekGridValue(value, week)) : null
              }
              className={`h-7 rounded border text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              M{week}
            </button>
          );
        })}
      </div>
    );
  };

  const renderSectionCellControl = (
    section: EntrySectionForm,
    row: EntrySectionForm['rows'][number] | undefined,
    column: EntrySectionColumnForm,
    dense = false,
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
    const sourceProgramCode = normalizeTeachingResourceProgramCode(column.binding?.sourceProgramCode);
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
            value: isKktpPrimaryReferenceColumn(column)
              ? getFirstReferenceValueLine(referenceSelection?.value || value)
              : String(referenceSelection?.value || value || '').trim(),
            label: isKktpPrimaryReferenceColumn(column)
              ? formatReferenceOptionLabel(referenceSelection?.value || value, referenceSelection?.label)
              : formatGroupedReferenceOptionLabel(referenceSelection?.value || value, referenceSelection?.label),
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
    const referenceSearchKey = buildReferenceSearchKey('editor', section.id, row?.id, columnKey);
    const referenceSearchTerm = referenceSearchTerms[referenceSearchKey] || '';
    const filteredReferenceSelectOptions = keepSelectedReferenceOptionVisible(
      filterReferenceOptions(referenceSelectOptions, referenceSearchTerm),
      referenceSelectOptions,
      referenceSelectValue,
    );
    const showReferenceSearch = !isActiveProgramKktp && (referenceSelectOptions.length > 6 || Boolean(referenceSearchTerm));
    const referenceLimitHelperText = getReferenceLimitHelperText(sourceProgramCode, sourceProgramLabel);
    const referenceSearchHelperText =
      referenceEntriesQuery.isFetching && referenceSearchTerm.trim().length >= 2 ? 'Mencari referensi sumber...' : '';
    const disableReferenceSelect =
      !row?.id || !hasReferenceBinding || (referenceSelectOptions.length === 0 && !referenceSelectValue);
    const referencePlaceholder = !hasReferenceBinding
      ? 'Referensi belum dikonfigurasi'
      : referenceSelectOptions.length > 0 && filteredReferenceSelectOptions.length === 0
        ? 'Tidak ada hasil'
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
    const inputClassName = `w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${
      readOnly ? 'bg-gray-50 text-gray-500' : 'bg-white'
    } ${isCenterAlignedTableColumn(column) ? 'text-center' : ''}`;
    const selectClassName = `${inputClassName} ${readOnly ? 'cursor-not-allowed' : ''}`;

    if (shouldRenderDocumentReferencePicker(section, column)) {
      return (
        <div className="space-y-1">
          {showReferenceSearch ? (
            <input
              type="search"
              value={referenceSearchTerm}
              disabled={disableReferenceSelect}
              onChange={(event) => updateReferenceSearchTerm(referenceSearchKey, event.target.value)}
              placeholder={`Cari ${sourceProgramLabel}`}
              className={inputClassName}
            />
          ) : null}
          <select
            value={referenceSelectValue}
            disabled={disableReferenceSelect}
            onChange={(event) => {
              applyDocumentReferenceSelection(section.id, row?.id || '', column, event.target.value);
              updateReferenceSearchTerm(referenceSearchKey, '');
            }}
            className={selectClassName}
          >
            <option value="">{referencePlaceholder}</option>
            {filteredReferenceSelectOptions.map((option) => (
              <option key={`${columnKey}-${option.selectValue}`} value={option.selectValue}>
                {option.label}
              </option>
            ))}
          </select>
          {referenceSearchTerm && filteredReferenceSelectOptions.length === 0 ? (
            <p className="text-[11px] text-gray-500">Tidak ada referensi yang cocok dengan pencarian.</p>
          ) : referenceSearchHelperText ? (
            <p className="text-[11px] text-gray-500">{referenceSearchHelperText}</p>
          ) : referenceHelperText ? (
            <p className="text-[11px] text-gray-500">{referenceHelperText}</p>
          ) : referenceLimitHelperText ? (
            <p className="text-[11px] text-gray-500">{referenceLimitHelperText}</p>
          ) : null}
        </div>
      );
    }

    if (isSecondaryReferenceColumn(section, column)) {
      return (
        <div
          className={`min-h-[34px] whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs leading-relaxed text-gray-700 ${
            isCenterAlignedTableColumn(column) ? 'text-center' : ''
          }`}
          title="Nilai mengikuti referensi induk pada grup ini."
        >
          {value || '-'}
        </div>
      );
    }

    if (readOnly && !isWeekColumnKey(columnKey) && dataType !== 'BOOLEAN' && dataType !== 'WEEK_GRID') {
      return (
        <div
          className={`min-h-[34px] whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs leading-relaxed text-gray-700 ${
            isCenterAlignedTableColumn(column) ? 'text-center' : ''
          }`}
        >
          {value
            ? dataType === 'NUMBER' && splitCellLines(value).length <= 1
              ? formatNumericValue(parseNumber(value))
              : splitCellLines(value).join('\n')
            : '-'}
        </div>
      );
    }

    if (isWeekColumnKey(columnKey)) {
      return renderMonthWeekCellControl(section, row, columnKey, value, readOnly);
    }

    if (isKktpCriteriaColumnKey(columnKey)) {
      const isChecked = isTruthyMark(value);
      return (
        <button
          type="button"
          disabled={readOnly || !row?.id}
          onClick={() =>
            row?.id ? toggleKktpCriteria(section.id, row.id, columnKey as 'kurang_memadai' | 'memadai') : null
          }
          className={`inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isChecked
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {isChecked ? MARK_VALUE : '-'}
        </button>
      );
    }

    if (dataType === 'WEEK_GRID') {
      return renderWeekGridControl(section, row, columnKey, value, readOnly);
    }

    if (dataType === 'MONTH') {
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateSectionRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih Bulan</option>
          {MONTH_OPTIONS.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'WEEK') {
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateSectionRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih Minggu</option>
          {WEEK_OPTIONS.map((week) => (
            <option key={week} value={week}>
              Minggu {week}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'SEMESTER') {
      const semesterOptions = Array.isArray(column.options) && column.options.length > 0 ? column.options : SEMESTER_OPTIONS;
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateSectionRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih Semester</option>
          {semesterOptions.map((semester) => (
            <option key={semester} value={semester}>
              {semester}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'SELECT' && Array.isArray(column.options) && column.options.length > 0) {
      return (
        <select
          value={value}
          disabled={readOnly}
          onChange={(event) => updateSectionRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          className={selectClassName}
        >
          <option value="">Pilih</option>
          {column.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (dataType === 'BOOLEAN') {
      const isChecked = isTruthyMark(value);
      return (
        <button
          type="button"
          disabled={readOnly || !row?.id}
          onClick={() => (row?.id ? updateSectionRowCell(section.id, row.id, columnKey, isChecked ? '' : MARK_VALUE) : null)}
          className={`inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isChecked
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {isChecked ? MARK_VALUE : '-'}
        </button>
      );
    }

    if (column.multiline || dataType === 'TEXTAREA') {
      return (
        <textarea
          ref={resizeTextareaToContent}
          rows={dense ? 2 : 3}
          value={value}
          disabled={readOnly}
          onChange={(event) => updateSectionRowCell(section.id, row?.id || '', columnKey, event.target.value)}
          onInput={(event) => resizeTextareaToContent(event.currentTarget)}
          placeholder={column.placeholder || ''}
          className={`w-full resize-y overflow-hidden rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${
            readOnly ? 'bg-gray-50 text-gray-500' : 'bg-white'
          } ${isCenterAlignedTableColumn(column) ? 'text-center' : ''}`}
        />
      );
    }

    return (
      <input
        type={dataType === 'NUMBER' ? 'number' : 'text'}
        value={value}
        disabled={readOnly}
        onChange={(event) => updateSectionRowCell(section.id, row?.id || '', columnKey, event.target.value)}
        placeholder={column.placeholder || ''}
        className={inputClassName}
      />
    );
  };

  const renderQuickEditMonthWeekTable = (
    section: EntrySectionForm,
    columns: EntrySectionColumnForm[],
    rows: EntrySectionRowForm[],
  ) => {
    const layout = buildMonthWeekColumnLayout(columns);
    if (!layout) return null;
    const orderedColumns = [
      ...layout.leadingColumns,
      ...layout.weekGroups.flatMap((group) => group.columns.map((item) => item.column)),
      ...layout.trailingColumns,
    ];
    const rowLayouts = rows.map((row) => {
      const lineCounts = orderedColumns.map((column) =>
        splitEditableCellLines(row.values[String(column.key || '').trim()]).length,
      );
      return {
        row,
        maxLineCount: Math.max(1, ...lineCounts),
      };
    });
    const totalVisualRowCount = Math.max(
      1,
      rowLayouts.reduce((total, item) => total + item.maxLineCount, 0),
    );
    const globalMonthWeekNotes = orderedColumns.reduce<
      Map<string, { note: string; sourceRow: EntrySectionRowForm; lineIndex: number }>
    >((acc, column) => {
      const columnKey = String(column.key || '').trim();
      if (!parseMonthWeekColumnKey(columnKey)) return acc;
      for (const row of rows) {
        const note = getMergedMonthWeekNote(row.values[columnKey]);
        if (!note) continue;
        acc.set(columnKey, { note: note.note, sourceRow: row, lineIndex: note.lineIndex });
        break;
      }
      return acc;
    }, new Map());

    return (
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-300">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-slate-100">
            <tr>
              {layout.leadingColumns.map((column) => (
                <th
                  key={`quick-month-head-main-${section.id}-${column.key}`}
                  rowSpan={2}
                  className={`border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold uppercase leading-snug text-slate-700 ${getColumnWidthClass(
                    column.key,
                    Boolean(column.multiline),
                    column.dataType,
                  )}`}
                >
                  {column.label}
                </th>
              ))}
              {layout.weekGroups.map((group) => (
                <th
                  key={`quick-month-head-group-${section.id}-${group.monthKey}`}
                  colSpan={group.columns.length}
                  className="border border-slate-300 bg-slate-50 px-1 py-2 text-center text-[11px] font-semibold uppercase leading-snug text-slate-700"
                >
                  {group.monthLabel}
                </th>
              ))}
              {layout.trailingColumns.map((column) => (
                <th
                  key={`quick-month-head-tail-${section.id}-${column.key}`}
                  rowSpan={2}
                  className={`border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold uppercase leading-snug text-slate-700 ${getColumnWidthClass(
                    column.key,
                    Boolean(column.multiline),
                    column.dataType,
                  )}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
            <tr>
              {layout.weekGroups.flatMap((group) =>
                group.columns.map((item) => (
                  <th
                    key={`quick-month-head-week-${section.id}-${group.monthKey}-${item.weekNumber}`}
                    className="w-8 min-w-[30px] border border-slate-300 px-1 py-1 text-center text-[10px] font-semibold text-slate-600"
                  >
                    {item.weekNumber}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rowLayouts.map(({ row, maxLineCount }, rowIndex) => {
              return Array.from({ length: maxLineCount }).map((_, lineIndex) => (
                <tr key={`quick-month-row-${row.id}-${lineIndex}`} className="border-b border-slate-100 last:border-b-0">
                  {orderedColumns.map((column) => {
                    const columnKey = String(column.key || '').trim();
                    const cellLines = splitEditableCellLines(row.values[columnKey]);
                    const isMonthWeekColumn = Boolean(parseMonthWeekColumnKey(columnKey));
                    const globalMonthWeekNote = isMonthWeekColumn ? globalMonthWeekNotes.get(columnKey) : undefined;
                    if (globalMonthWeekNote) {
                      if (rowIndex > 0 || lineIndex > 0) return null;
                      return (
                        <td
                          key={`quick-month-cell-global-note-${columnKey}`}
                          rowSpan={totalVisualRowCount}
                          className={`border border-slate-200 px-1 py-1 align-middle ${
                            isMonthWeekColumn ? 'w-8' : ''
                          } ${getColumnWidthClass(column.key, Boolean(column.multiline), column.dataType)}`}
                        >
                          {renderQuickMonthWeekCellControl(
                            section,
                            globalMonthWeekNote.sourceRow,
                            columnKey,
                            globalMonthWeekNote.note,
                            false,
                            globalMonthWeekNote.lineIndex,
                            totalVisualRowCount,
                          )}
                        </td>
                      );
                    }
                    const mergedMonthWeekNote = isMonthWeekColumn ? getMergedMonthWeekNote(row.values[columnKey]) : null;
                    if (isMonthWeekColumn && mergedMonthWeekNote && lineIndex > 0) return null;
                    if (!isMonthWeekColumn && cellLines.length <= 1 && lineIndex > 0) return null;
                    if (!isMonthWeekColumn && cellLines.length > 1 && lineIndex >= cellLines.length) {
                      return (
                        <td
                          key={`quick-month-cell-empty-${row.id}-${columnKey}-${lineIndex}`}
                          className={`border border-slate-200 px-1 py-1 align-middle ${getColumnWidthClass(
                            column.key,
                            Boolean(column.multiline),
                            column.dataType,
                          )}`}
                        />
                      );
                    }
                    const rowSpan = mergedMonthWeekNote
                      ? maxLineCount
                      : !isMonthWeekColumn && cellLines.length <= 1 && maxLineCount > 1
                        ? maxLineCount
                        : undefined;
                    return (
                      <td
                        key={`quick-month-cell-${row.id}-${columnKey}-${lineIndex}`}
                        rowSpan={rowSpan}
                        className={`border border-slate-200 px-1 py-1 ${
                          isMonthWeekColumn || isMiddleAlignedTableColumn(column) ? 'align-middle' : 'align-top'
                        } ${isCenterAlignedTableColumn(column) ? 'text-center' : ''} ${getColumnWidthClass(
                          column.key,
                          Boolean(column.multiline),
                          column.dataType,
                        )}`}
                      >
                        {mergedMonthWeekNote
                          ? renderQuickMonthWeekCellControl(
                              section,
                              row,
                              columnKey,
                              mergedMonthWeekNote.note,
                              false,
                              mergedMonthWeekNote.lineIndex,
                              maxLineCount,
                            )
                          : renderQuickEditCellControl(section, row, column, lineIndex)}
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSectionMonthWeekTable = (
    section: EntrySectionForm,
    columns: EntrySectionColumnForm[],
    minRowCount: number,
  ) => {
    const layout = buildMonthWeekColumnLayout(columns);
    if (!layout) return null;
    const orderedColumns = [
      ...layout.leadingColumns,
      ...layout.weekGroups.flatMap((group) => group.columns.map((item) => item.column)),
      ...layout.trailingColumns,
    ];

    return (
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-gray-50">
            <tr>
              {layout.leadingColumns.map((column) => (
                <th
                  key={`month-head-main-${section.id}-${column.key}`}
                  rowSpan={2}
                  className={`border border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600 ${getColumnWidthClass(
                    column.key,
                    Boolean(column.multiline),
                    column.dataType,
                  )}`}
                >
                  {column.label}
                </th>
              ))}
              {layout.weekGroups.map((group) => (
                <th
                  key={`month-head-group-${section.id}-${group.monthKey}`}
                  colSpan={group.columns.length}
                  className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-center font-semibold text-gray-600"
                >
                  {group.monthLabel}
                </th>
              ))}
              {layout.trailingColumns.map((column) => (
                <th
                  key={`month-head-tail-${section.id}-${column.key}`}
                  rowSpan={2}
                  className={`border border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600 ${getColumnWidthClass(
                    column.key,
                    Boolean(column.multiline),
                    column.dataType,
                  )}`}
                >
                  {column.label}
                </th>
              ))}
              <th
                rowSpan={2}
                className="sticky right-0 border border-gray-200 bg-gray-50 px-2 py-1.5 text-right font-semibold text-gray-600"
              >
                Aksi
              </th>
            </tr>
            <tr>
              {layout.weekGroups.flatMap((group) =>
                group.columns.map((item) => (
                  <th
                    key={`month-head-week-${section.id}-${group.monthKey}-${item.weekNumber}`}
                    className="w-8 min-w-[30px] border border-gray-200 px-1 py-1 text-center text-[10px] font-semibold text-gray-500"
                  >
                    {item.weekNumber}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, rowIndex) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                {orderedColumns.map((column) => {
                  const columnKey = String(column.key || '').trim();
                  const isMonthWeekColumn = Boolean(parseMonthWeekColumnKey(columnKey));
                  return (
                    <td
                      key={`${row.id}-${column.key}`}
                      className={`border border-gray-200 px-1.5 py-1.5 ${
                        isMonthWeekColumn || isMiddleAlignedTableColumn(column) ? 'align-middle' : 'align-top'
                      } ${isCenterAlignedTableColumn(column) ? 'text-center' : ''} ${getColumnWidthClass(
                        column.key,
                        Boolean(column.multiline),
                        column.dataType,
                      )}`}
                    >
                      {renderSectionCellControl(section, row, column, true)}
                    </td>
                  );
                })}
                <td className="sticky right-0 border border-gray-200 bg-white px-2 py-1.5 text-right align-top">
                  <button
                    type="button"
                    onClick={() => removeSectionRow(section.id, row.id)}
                    disabled={section.rows.length <= minRowCount}
                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hapus
                  </button>
                  <p className="mt-1 text-[10px] text-gray-400">Baris {rowIndex + 1}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const addSectionColumn = (sectionId: string) => {
    setSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        if (!isTableSection(item)) return item;
        const existingColumns = resolveSectionColumns(item);
        const nextIndex = existingColumns.length + 1;
        const nextKey = `kolom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
        const nextColumn: EntrySectionColumnForm = {
          key: nextKey,
          label: `Kolom ${nextIndex}`,
          placeholder: '',
          multiline: false,
        };
        const nextColumns = [...existingColumns, nextColumn];
        const nextRows =
          item.rows.length > 0
            ? item.rows.map((row) => ({
                ...row,
                values: {
                  ...row.values,
                  [nextKey]: '',
                },
              }))
            : [
                {
                  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  values: { [nextKey]: '' },
                },
              ];

        return {
          ...item,
          columns: nextColumns,
          rows: nextRows,
        };
      }),
    );
  };

  const updateSectionColumnLabel = (sectionId: string, columnKey: string, label: string) => {
    setSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        const nextColumns = resolveSectionColumns(item).map((column) =>
          String(column.key || '').trim() === String(columnKey || '').trim()
            ? {
                ...column,
                label: label.trim() || column.label,
              }
            : column,
        );
        return {
          ...item,
          columns: nextColumns,
        };
      }),
    );
  };

  const removeSectionColumn = (sectionId: string, columnKey: string) => {
    setSectionsWithDerived((prev) =>
      prev.map((item) => {
        if (item.id !== sectionId) return item;
        const existingColumns = resolveSectionColumns(item);
        if (existingColumns.length === 0) return item;
        const nextColumns = existingColumns.filter(
          (column) => String(column.key || '').trim() !== String(columnKey || '').trim(),
        );
        const nextRows = item.rows.map((row) => {
          const nextValues = { ...row.values };
          delete nextValues[columnKey];
          return {
            ...row,
            values: nextValues,
          };
        });
        return {
          ...item,
          columns: nextColumns,
          rows: nextRows,
        };
      }),
    );
  };

  const addSection = () => {
    setSectionsWithDerived((prev) => {
      const repeatableSection = activeProgramSchemaSections.find((section) => section.repeatable) || null;
      if (repeatableSection) {
        const repeatableCount = prev.filter(
          (item) => String(item.schemaKey || '').trim() === String(repeatableSection.key || '').trim(),
        ).length;
        return [...prev, createSection(repeatableSection, repeatableCount)];
      }
      if (activeProgramSchemaSections.length > 0) return prev;
      return [...prev, createSection(undefined, prev.length)];
    });
  };

  const onContextChange = (value: string) => {
    setSelectedContextKey(value);
    if (!usesSheetTemplate || Boolean(editingEntry)) return;
    const nextContext = assignmentContextOptions.find((item) => String(item.key) === String(value || '').trim()) || null;
    setEntryTitleHtml(
      createDocumentTitleHtml(
        buildAutoSheetTitle({
          programLabel: effectiveTitle,
          context: nextContext,
          academicYearName,
          semesterLabel: activeSemesterLabel,
        }),
      ),
    );
    setSectionsWithDerived((prev) =>
      hydrateSheetSections({
        sections: prev,
        schemaMap: activeProgramSchemaMap,
        context: nextContext,
        academicYearName,
        semesterLabel: activeSemesterLabel,
        teachingLoad: nextContext ? teachingLoadByContext.get(nextContext.key) || null : null,
      }),
    );
  };

  const renderSectionTableHtml = (section: EntrySectionForm): string => {
    const schemaColumns = applyMonthWeekCalendarColumns(section, resolveSectionColumns(section));
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (rows.length === 0) return '<p style="margin:0;color:#64748b;">-</p>';

    const dynamicKeys = Array.from(
      rows.reduce((acc, row) => {
        Object.keys(row.values || {}).forEach((key) => acc.add(key));
        return acc;
      }, new Set<string>()),
    );

    const headers: Array<{ key: string; label: string; column?: EntrySectionColumnForm }> =
      schemaColumns.length > 0
        ? schemaColumns
            .map((column) => ({
              key: String(column.key || '').trim(),
              label: String(column.label || column.key || '').trim(),
              column,
            }))
            .filter((header) => header.key)
        : dynamicKeys.map((key) => ({ key, label: key, column: undefined }));
    const monthWeekLayout = buildMonthWeekColumnLayout(headers);

    if (monthWeekLayout) {
      const orderedHeaders = [
        ...monthWeekLayout.leadingColumns,
        ...monthWeekLayout.weekGroups.flatMap((group) => group.columns.map((item) => item.column)),
        ...monthWeekLayout.trailingColumns,
      ];
      const getMonthWeekPrintColumnWidth = (header: { key: string; label: string; column?: EntrySectionColumnForm }) => {
        const key = String(header.key || '').trim().toLowerCase();
        if (parseMonthWeekColumnKey(key)) return '5mm';
        if (['no', 'nomor'].includes(key)) return '10mm';
        if (key.includes('alokasi') || key.includes('jp') || key.includes('waktu')) return '12mm';
        if (key.includes('tujuan') || key.includes('pembelajaran')) return '88mm';
        return '18mm';
      };
      const colgroup = `<colgroup>${orderedHeaders
        .map((header) => `<col style="width:${getMonthWeekPrintColumnWidth(header)};" />`)
        .join('')}</colgroup>`;
      const firstHeaderRow = `<tr>${monthWeekLayout.leadingColumns
        .map((header) => {
          const classAttribute = renderPrintClassAttribute(getPrintColumnClassName(header.column));
          return `<th${classAttribute} rowspan="2">${escapeHtml(header.label)}</th>`;
        })
        .join('')}${monthWeekLayout.weekGroups
        .map(
          (group) =>
            `<th class="print-month-group-header" colspan="${group.columns.length}">${escapeHtml(group.monthLabel)}</th>`,
        )
        .join('')}${monthWeekLayout.trailingColumns
        .map((header) => {
          const classAttribute = renderPrintClassAttribute(getPrintColumnClassName(header.column));
          return `<th${classAttribute} rowspan="2">${escapeHtml(header.label)}</th>`;
        })
        .join('')}</tr>`;
      const secondHeaderRow = `<tr>${monthWeekLayout.weekGroups
        .flatMap((group) =>
          group.columns.map(
            (item) => `<th class="print-week-number-header">${escapeHtml(String(item.weekNumber))}</th>`,
          ),
        )
        .join('')}</tr>`;
      const rowLayouts = rows.map((row) => {
        const lineGroups = orderedHeaders.map((header) =>
          parseMonthWeekColumnKey(header.key)
            ? splitEditableCellLines(row.values?.[header.key])
            : splitCellLines(row.values?.[header.key]),
        );
        return {
          row,
          lineGroups,
          maxLineCount: Math.max(1, ...lineGroups.map((lines) => lines.length)),
        };
      });
      const totalVisualRowCount = Math.max(
        1,
        rowLayouts.reduce((total, item) => total + item.maxLineCount, 0),
      );
      const globalMonthWeekNotes = orderedHeaders.reduce<
        Map<string, { note: string; lineIndex: number }>
      >((acc, header) => {
        if (!parseMonthWeekColumnKey(header.key)) return acc;
        for (const row of rows) {
          const note = getMergedMonthWeekNote(row.values?.[header.key]);
          if (!note) continue;
          acc.set(header.key, note);
          break;
        }
        return acc;
      }, new Map());
      const tbody = rows
        .map((row, rowIndex) => {
          const rowLayout = rowLayouts[rowIndex];
          const lineGroups = rowLayout?.lineGroups || orderedHeaders.map(() => ['']);
          const maxLineCount = rowLayout?.maxLineCount || 1;
          return Array.from({ length: maxLineCount })
            .map((_, lineIndex) => {
              const cells = orderedHeaders
                .map((header, headerIndex) => {
                  const lines = lineGroups[headerIndex] || [''];
                  const isMonthWeekColumn = Boolean(parseMonthWeekColumnKey(header.key));
                  const globalMonthWeekNote = isMonthWeekColumn ? globalMonthWeekNotes.get(header.key) : undefined;
                  if (globalMonthWeekNote) {
                    if (rowIndex > 0 || lineIndex > 0) return '';
                    const className = [
                      getPrintColumnClassName(header.column),
                      'print-month-week-cell',
                      'is-active',
                      'has-text',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return `<td${renderPrintClassAttribute(className)} rowspan="${totalVisualRowCount}" style="vertical-align: middle;">${formatMonthWeekPrintCellHtml(globalMonthWeekNote.note)}</td>`;
                  }
                  const mergedMonthWeekNote = isMonthWeekColumn ? getMergedMonthWeekNote(row.values?.[header.key]) : null;
                  if (mergedMonthWeekNote && lineIndex > 0) return '';
                  if (!isMonthWeekColumn && lines.length <= 1 && lineIndex > 0) return '';
                  const lineValue = isMonthWeekColumn
                    ? lines[lineIndex] ?? ''
                    : lines[Math.min(lineIndex, lines.length - 1)];
                  const printableValue = mergedMonthWeekNote ? mergedMonthWeekNote.note : lineValue;
                  const className = [
                    getPrintColumnClassName(header.column),
                    isMonthWeekColumn ? 'print-month-week-cell' : '',
                    isMonthWeekColumn && isMeaningfulReferenceValue(printableValue) ? 'is-active' : '',
                    isMonthWeekColumn && isMeaningfulReferenceValue(printableValue) && !isTruthyMark(String(printableValue || '')) ? 'has-text' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const classAttribute = renderPrintClassAttribute(className);
                  const rowSpanAttribute =
                    mergedMonthWeekNote || (!isMonthWeekColumn && lines.length <= 1 && maxLineCount > 1)
                      ? ` rowspan="${maxLineCount}"`
                      : '';
                  const valignAttribute = rowSpanAttribute ? ' style="vertical-align: middle;"' : '';
                  const content =
                    lines.length > 1 && lineIndex >= lines.length
                      ? ''
                      : isMonthWeekColumn
                        ? formatMonthWeekPrintCellHtml(printableValue)
                        : lines.length > 1 && !String(printableValue || '').trim()
                          ? ''
                          : formatCellPrintHtml(printableValue, header.column);
                  return `<td${classAttribute}${rowSpanAttribute}${valignAttribute}>${content}</td>`;
                })
                .join('');
              return `<tr>${cells}</tr>`;
            })
            .join('');
        })
        .join('');

      return `<div class="table-wrap month-week-table-wrap"><table class="print-month-week-table">${colgroup}<thead>${firstHeaderRow}${secondHeaderRow}</thead><tbody>${tbody}</tbody></table></div>`;
    }

    const headerGroupLayout = buildHeaderGroupLayout(headers);
    const hasMatriksSebaranPrintLayout = headers.some((header) =>
      isMatriksSebaranGroupedWeekColumn(header.column),
    );
    const getGenericPrintColumnClassName = (header: {
      key: string;
      label: string;
      column?: EntrySectionColumnForm;
    }): string => {
      const classes = getPrintColumnClassName(header.column)
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (hasMatriksSebaranPrintLayout) {
        const key = String(header.key || '').trim().toLowerCase();
        const identityCandidates = getColumnIdentityCandidates(header.column);
        if (['no', 'nomor', 'number'].includes(key)) classes.push('print-matrix-no-column');
        if (
          identityCandidates.includes('tujuan_pembelajaran') ||
          key.includes('tujuan') ||
          key.includes('pembelajaran')
        ) {
          classes.push('print-matrix-tp-column');
        }
        if (
          identityCandidates.includes('alokasi_jp') ||
          key.includes('alokasi') ||
          key.includes('jp') ||
          key.includes('jam') ||
          key.includes('waktu')
        ) {
          classes.push('print-matrix-jp-column');
        }
        if (identityCandidates.includes('semester') || key.includes('semester')) {
          classes.push('print-matrix-semester-column');
        }
        if (isMatriksSebaranGroupedWeekColumn(header.column)) classes.push('print-matrix-week-column');
      }
      return Array.from(new Set(classes)).join(' ');
    };
    const getGenericPrintColumnWidth = (header: {
      key: string;
      label: string;
      column?: EntrySectionColumnForm;
    }): string => {
      if (!hasMatriksSebaranPrintLayout) return '';
      const key = String(header.key || '').trim().toLowerCase();
      const identityCandidates = getColumnIdentityCandidates(header.column);
      if (isMatriksSebaranGroupedWeekColumn(header.column)) return '5mm';
      if (['no', 'nomor', 'number'].includes(key)) return '9mm';
      if (
        identityCandidates.includes('tujuan_pembelajaran') ||
        key.includes('tujuan') ||
        key.includes('pembelajaran')
      ) {
        return '96mm';
      }
      if (
        identityCandidates.includes('alokasi_jp') ||
        key.includes('alokasi') ||
        key.includes('jp') ||
        key.includes('jam') ||
        key.includes('waktu')
      ) {
        return '16mm';
      }
      if (identityCandidates.includes('semester') || key.includes('semester')) return '16mm';
      return '18mm';
    };
    const genericColgroup = hasMatriksSebaranPrintLayout
      ? `<colgroup>${headers
          .map((header) => `<col style="width:${getGenericPrintColumnWidth(header)};" />`)
          .join('')}</colgroup>`
      : '';
    const thead = headerGroupLayout
      ? `<tr>${headerGroupLayout
          .map((group) => {
            if (group.grouped) {
              return `<th colspan="${group.columns.length}">${escapeHtml(group.label)}</th>`;
            }
            const header = group.columns[0];
            const classAttribute = header ? renderPrintClassAttribute(getGenericPrintColumnClassName(header)) : '';
            return `<th${classAttribute} rowspan="2">${escapeHtml(group.label)}</th>`;
          })
          .join('')}</tr><tr>${headerGroupLayout
          .flatMap((group) =>
            group.grouped
              ? group.columns.map((header) => {
                  const classAttribute = renderPrintClassAttribute(getGenericPrintColumnClassName(header));
                  return `<th${classAttribute}>${escapeHtml(header.label)}</th>`;
                })
              : [],
          )
          .join('')}</tr>`
      : `<tr>${headers
          .map((header) => {
            const classAttribute = renderPrintClassAttribute(getGenericPrintColumnClassName(header));
            return `<th${classAttribute}>${escapeHtml(header.label)}</th>`;
          })
          .join('')}</tr>`;
    const tbody = rows
      .map((row) => {
        const lineGroups = headers.map((header) => getVisualPrintCellLines(header.column, row.values?.[header.key]));
        const maxLineCount = Math.max(1, ...lineGroups.map((lines) => lines.length));
        return Array.from({ length: maxLineCount })
          .map((_, lineIndex) => {
            const cells = headers
              .map((header, headerIndex) => {
                const lines = lineGroups[headerIndex] || [''];
                const shouldRenderPerVisualLine = isKktpCriteriaColumnKey(header.key) && maxLineCount > 1;
                if (lines.length <= 1 && lineIndex > 0 && !shouldRenderPerVisualLine) return '';
                const classAttribute = renderPrintClassAttribute(getGenericPrintColumnClassName(header));
                const rowSpanAttribute =
                  !shouldRenderPerVisualLine && lines.length <= 1 && maxLineCount > 1 ? ` rowspan="${maxLineCount}"` : '';
                const valignAttribute = rowSpanAttribute ? ' style="vertical-align: middle;"' : '';
                const lineValue = shouldRenderPerVisualLine ? (lines[lineIndex] ?? '') : lines[Math.min(lineIndex, lines.length - 1)];
                const content =
                  lines.length > 1 && lineIndex >= lines.length
                    ? ''
                    : lines.length > 1 && !String(lineValue || '').trim()
                      ? ''
                      : formatCellPrintHtml(lineValue, header.column);
                return `<td${classAttribute}${rowSpanAttribute}${valignAttribute}>${content}</td>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');
      })
      .join('');

    const tableClassAttribute = hasMatriksSebaranPrintLayout ? ' class="print-matrix-sebaran-table"' : '';
    return `<div class="table-wrap"><table${tableClassAttribute}>${genericColgroup}<thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
  };

  const renderSectionPrintHtml = (section: EntrySectionForm): string => {
    const title = escapeHtml(section.title || 'Bagian');
    if (isTableSection(section)) {
      const hasMonthWeekLayout = Boolean(buildMonthWeekColumnLayout(resolveSectionColumns(section)));
      return `<section>${hasMonthWeekLayout ? '' : `<h3>${title}</h3>`}${renderSectionTableHtml(section)}</section>`;
    }
    return `<section><h3>${title}</h3><div class="text-block">${formatMultilineHtml(section.body || '-')}</div></section>`;
  };

  const isPrintContextFieldSystem = (fieldIdentity: string): boolean =>
    activeProgramSchemaSections.some((section) => {
      const key = String(section.key || '').toLowerCase();
      const label = String(section.label || '').toLowerCase();
      if (!key.includes('konteks') && !label.includes('konteks') && String(section.blockType || '').toUpperCase() !== 'CONTEXT') {
        return false;
      }
      return ensureArray<EntrySectionColumnForm>(section.columns).some((column) => {
        const identity = getColumnIdentityCandidates(column).find((candidate) => CONTEXT_REFERENCE_IDENTITIES.has(candidate));
        return identity === fieldIdentity && isSystemValueColumn(column);
      });
    });

  const loadReferenceContextOverride = async (
    entry: TeachingResourceEntry,
    depth = 0,
  ): Promise<Partial<EntryContextValues> | null> => {
    const pointers = extractEntryReferencePointers(entry);
    if (pointers.length === 0 || depth > 1) return null;
    const programCodes = Array.from(new Set(pointers.map((pointer) => pointer.programCode))).sort();
    try {
      const response = await teachingResourceProgramService.getReferenceEntries({
        academicYearId,
        programCodes,
        includeRows: true,
        limitPerProgram: 250,
      });
      const referencedRows = ensureArray<{
        programCode?: string;
        rows?: TeachingResourceEntry[];
      }>(response.data?.programs).flatMap((program) => ensureArray<TeachingResourceEntry>(program.rows));
      const rowsByPointer = new Map(
        referencedRows.map((row) => [`${normalizeTeachingResourceProgramCode(row.programCode)}::${Number(row.id || 0)}`, row]),
      );
      for (const pointer of pointers) {
        const referencedEntry = rowsByPointer.get(`${pointer.programCode}::${pointer.entryId}`);
        if (!referencedEntry) continue;
        const contextValues = extractEntryContextValues(referencedEntry, {
          tingkat: String(referencedEntry.classLevel || '').trim(),
        });
        if (contextValues.mataPelajaran && !isGenericSubjectContextValue(contextValues.mataPelajaran)) {
          return contextValues;
        }
      }
      if (depth >= 1) return null;
      for (const pointer of pointers) {
        const referencedEntry = rowsByPointer.get(`${pointer.programCode}::${pointer.entryId}`);
        if (!referencedEntry) continue;
        const nestedContext = await loadReferenceContextOverride(referencedEntry, depth + 1);
        if (nestedContext?.mataPelajaran && !isGenericSubjectContextValue(nestedContext.mataPelajaran)) {
          return nestedContext;
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const buildPrintHtml = (
    entry: TeachingResourceEntry,
    contextOverride?: Partial<EntryContextValues> | null,
    printableSectionId?: string,
  ): string => {
    const defaultSections = buildDefaultSections(activeProgramMeta);
    const displaySections = hydrateEntrySectionsForDisplay(entry, parseEntrySections(entry, defaultSections));
    const printableSections = displaySections.filter((section) => {
      if (printableSectionId && section.id !== printableSectionId) return false;
      const sectionSchema = resolveSectionSchema(section);
      const blockType = String(sectionSchema?.blockType || '').trim().toUpperCase();
      return (
        blockType !== 'CONTEXT' &&
        blockType !== 'SIGNATURE' &&
        !isContextLikeTableSection(section)
      );
    });
    const contextLabelRaw = resolveEntryContextLabel(entry, assignmentLabelMap);
    const contextValues = extractEntryContextValues(entry, {
      mataPelajaran: String(contextLabelRaw.split(' - ')[0] || '').trim(),
      tingkat: String(entry.classLevel || '').trim(),
      semester: activeSemesterLabel,
      tahunAjaran: academicYearName,
    });
    const resolvedContextValues = {
      ...contextValues,
      mataPelajaran:
        contextOverride?.mataPelajaran &&
        (isPrintContextFieldSystem('mata_pelajaran') || isGenericSubjectContextValue(contextValues.mataPelajaran))
          ? String(contextOverride.mataPelajaran || '').trim()
          : contextValues.mataPelajaran,
    };
    const signatureValues = extractEntrySignatureValues(entry, {
      curriculumTitle: String(signatureDefaultsQuery.data?.teacher?.roleTitle || 'Guru Mata Pelajaran').trim(),
      curriculumName: String(entry.teacher?.name || currentUserProfile?.name || '-').trim(),
      principalTitle: String(signatureDefaultsQuery.data?.principal?.roleTitle || 'Kepala Sekolah').trim(),
      principalName: String(signatureDefaultsQuery.data?.principal?.name || '-').trim(),
    });
    const printDateLine =
      String(entry.content?.signaturePlaceDate || '').trim() ||
      signatureValues.placeDate ||
      formatStablePlaceDate(entry.createdAt);
    const programPrintRules = activeProgramMeta?.schema?.printRules;
    const printTitleHtml =
      sanitizeDocumentTitleHtml(entry.content?.titleHtml) || createDocumentTitleHtml(entry.title || effectiveTitle);
    const compactTable = Boolean(programPrintRules?.compactTable);
    const visibleContextRows = [
      ['Mata Pelajaran', resolvedContextValues.mataPelajaran],
      ['Tingkat', resolvedContextValues.tingkat],
      ['Program Keahlian', resolvedContextValues.programKeahlian],
    ].filter(([, value]) => String(value || '').trim());

    return `
      <!doctype html>
      <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(entry.title || effectiveTitle)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: A4 landscape; margin: 1cm; }
          html, body { margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #0f172a; }
          .header { text-align: center; margin-bottom: 20px; }
          .header .title-wrap { margin-bottom: 4px; }
          .header .title-wrap p { margin: 0; }
          .header .title-wrap .ql-align-center { text-align: center; }
          .header .title-wrap .ql-align-right { text-align: right; }
          .header .title-wrap .ql-align-justify { text-align: justify; }
          .header .title-wrap p,
          .header .title-wrap div { font-size: 15px; font-weight: 400; line-height: 1.35; }
          .header .title-wrap .ql-size-small { font-size: 13px; }
          .header .title-wrap .ql-size-large { font-size: 17px; }
          .header .title-wrap .ql-size-huge { font-size: 20px; }
          .doc-context { width: 100%; max-width: 520px; margin-bottom: 12px; font-size: 13px; border-collapse: collapse; }
          .doc-context td { border: none; padding: 2px 0; }
          .doc-context td:first-child { width: 150px; }
          section { margin-bottom: 14px; break-inside: auto; page-break-inside: auto; }
          section h3 { margin: 0 0 8px; font-size: 14px; }
          .text-block {
            border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;
            font-size: 12px; line-height: 1.6; white-space: normal;
          }
          .table-wrap { overflow: visible; border: none; border-radius: 0; }
          table { width: 100%; border-collapse: collapse; font-size: ${compactTable ? '10px' : '11px'}; page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          th, td { border: 0.5pt solid #111; padding: ${compactTable ? '5px 6px' : '6px 8px'}; vertical-align: top; text-align: left; }
          th { background: #f8fafc; font-weight: 700; text-align: center; vertical-align: middle; }
          .print-no-column {
            width: 12mm;
            min-width: 12mm;
            white-space: nowrap;
            text-align: center;
            vertical-align: middle;
          }
          .print-compact-column {
            text-align: center;
            white-space: normal;
            overflow-wrap: anywhere;
          }
          .print-center-column {
            text-align: center;
            vertical-align: middle;
          }
          .print-middle-column {
            vertical-align: middle;
          }
          .print-week-grid-column {
            min-width: 156px;
          }
          .print-matrix-sebaran-table {
            table-layout: fixed;
            font-size: 9.5px;
          }
          .print-matrix-sebaran-table th,
          .print-matrix-sebaran-table td {
            border-width: 0.35pt;
            padding: 3px 4px;
          }
          .print-matrix-no-column {
            width: 9mm;
            min-width: 9mm;
            text-align: center;
            vertical-align: middle;
            white-space: nowrap;
          }
          .print-matrix-tp-column {
            text-align: left;
            white-space: normal;
            overflow-wrap: break-word;
            word-break: normal;
          }
          .print-matrix-jp-column,
          .print-matrix-semester-column {
            text-align: center;
            vertical-align: middle;
            white-space: normal;
            overflow-wrap: anywhere;
          }
          .print-matrix-week-column {
            width: 5mm;
            min-width: 5mm;
            max-width: 5mm;
            padding-left: 0;
            padding-right: 0;
            text-align: center;
            vertical-align: middle;
            white-space: nowrap;
          }
          .print-month-week-table {
            table-layout: fixed;
            width: 100%;
            font-size: 8.5px;
          }
          .print-month-week-table th,
          .print-month-week-table td {
            padding: 2px 3px;
            overflow-wrap: anywhere;
            word-break: normal;
          }
          .print-month-group-header,
          .print-week-number-header {
            text-align: center;
            vertical-align: middle;
            white-space: nowrap;
          }
          .print-month-week-column {
            width: 5mm;
            min-width: 5mm;
            max-width: 5mm;
            padding-left: 0;
            padding-right: 0;
            text-align: center;
          }
          .print-month-week-cell {
            height: 18px;
            min-width: 5mm;
            max-width: 5mm;
            padding: 0;
          }
          .print-month-week-cell.is-active {
            background: #0ea5e9;
          }
          .print-month-week-cell.has-text {
            background: #fef08a;
            color: #0f172a;
            line-height: 1.1;
            padding: 0;
            text-align: center;
            vertical-align: middle;
          }
          .month-week-cell-text {
            display: inline-block;
            max-height: none;
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            overflow: visible;
            white-space: nowrap;
            text-align: center;
            text-orientation: mixed;
            font-size: 6.5px;
            font-weight: 600;
            line-height: 1;
          }
          .week-grid-print {
            display: grid;
            grid-template-columns: repeat(5, minmax(20px, 1fr));
            gap: 3px;
            max-width: 168px;
          }
          .week-grid-cell {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            background: #f8fafc;
            color: #94a3b8;
            font-size: 8px;
            font-weight: 600;
            line-height: 1.1;
            padding: 2px 0;
            text-align: center;
          }
          .week-grid-cell.is-active {
            border-color: #10b981;
            background: #dcfce7;
            color: #047857;
            font-weight: 800;
          }
          .week-grid-summary {
            margin-top: 4px;
            color: #334155;
            font-size: 9px;
            line-height: 1.35;
          }
          .signature-wrap {
            margin-top: 22px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 80px;
            max-width: 760px;
            margin-left: auto;
            margin-right: auto;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .signature-box {
            text-align: center;
            font-size: 13px;
          }
          .signature-box.is-right {
            text-align: center;
          }
          .signature-spacer {
            height: 72px;
          }
          .signature-name {
            display: inline-block;
            width: auto;
            min-width: 0;
            border-bottom: 1px solid #0f172a;
            padding: 0 2px 2px;
            font-weight: 700;
            margin-bottom: 2px;
          }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${
            programPrintRules?.showDocumentTitle === false
              ? ''
              : `<div class="title-wrap">${printTitleHtml}</div>`
          }
        </div>
        <table class="doc-context">
          ${visibleContextRows
            .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>: ${escapeHtml(value)}</td></tr>`)
            .join('')}
        </table>
        ${printableSections.map(renderSectionPrintHtml).join('')}
        <div class="signature-wrap">
          <div class="signature-box">
            <div>${escapeHtml(signatureValues.principalOpening || 'Mengetahui,')}</div>
            <div>${escapeHtml(signatureValues.principalTitle)}</div>
            <div class="signature-spacer"></div>
            <div class="signature-name">${escapeHtml(signatureValues.principalName || '-')}</div>
          </div>
          <div class="signature-box is-right">
            <div>${escapeHtml(printDateLine)}</div>
            <div>${escapeHtml(signatureValues.curriculumTitle)}</div>
            <div class="signature-spacer"></div>
            <div class="signature-name">${escapeHtml(signatureValues.curriculumName || '-')}</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintEntry = async (entry: TeachingResourceEntry, printableSectionId?: string) => {
    try {
      const contextOverride = await loadReferenceContextOverride(entry);
      const html = buildPrintHtml(entry, contextOverride, printableSectionId);
      const iframe = printIframeRef.current;
      if (!iframe?.contentWindow) {
        toast.error('Frame print tidak tersedia. Coba muat ulang halaman.');
        return;
      }
      const printDoc = iframe.contentWindow.document;
      printDoc.open();
      printDoc.write(html);
      printDoc.close();
      const cleanup = () => {
        try {
          iframe.contentWindow?.removeEventListener('afterprint', cleanup);
        } catch {
          // no-op
        }
      };
      try {
        iframe.contentWindow.addEventListener('afterprint', cleanup);
      } catch {
        // no-op
      }
      window.setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        window.setTimeout(cleanup, 1200);
      }, 350);
    } catch (error) {
      toast.error(toErrorMessage(error, 'Gagal menyiapkan dokumen print.'));
    }
  };

  return (
    <div className="space-y-4">
      {!isPageEditor ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{effectiveTitle}</h2>
              <p className="text-sm text-gray-500">{effectiveDescription}</p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              disabled={programConfigQuery.isLoading || assignmentsQuery.isLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={14} />
              Tambah Dokumen
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)_minmax(240px,1fr)]">
            <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Cari Dokumen</label>
            <div className="flex items-center gap-2">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setPage(1);
                    setSearch(searchInput.trim());
                  }
                }}
                placeholder="Judul, ringkasan, atau kelas..."
                className="h-[42px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
                className="h-[42px] shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Terapkan
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as EntryFilterStatus);
              }}
              className="h-[42px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Menunggu Review</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REJECTED">Perlu Revisi</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Mode Tampilan</label>
            <select
              value={viewMode}
              onChange={(event) => {
                setPage(1);
                setViewMode(event.target.value as EntryViewMode);
              }}
              disabled={!canReview}
              className="h-[42px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
            >
              <option value="mine">Dokumen Saya</option>
              <option value="review">Mode Review</option>
            </select>
          </div>
        </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as TeachingResourceEntryStatus[]).map((statusKey) => (
              <div key={statusKey} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">{STATUS_META[statusKey].label}</p>
                <p className="text-xl font-semibold text-gray-900">{statusTotals[statusKey]}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isPageEditor ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {entryQuery.isLoading ? (
            <div className="py-16 text-center text-sm text-gray-500">Memuat dokumen {effectiveTitle.toLowerCase()}...</div>
          ) : entryQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Gagal memuat dokumen. Silakan coba lagi beberapa saat lagi.
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-600" />
              <p className="text-sm text-gray-500">
                Belum ada dokumen {effectiveTitle.toLowerCase()} untuk filter yang dipilih.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">Dokumen</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Mapel & Tingkat</th>
                    <th className="px-3 py-2">Cakupan</th>
                    <th className="px-3 py-2">Diperbarui</th>
                    <th className="px-3 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const statusMeta = STATUS_META[entry.status] || STATUS_META.DRAFT;
                    const displayEntryTitle =
                      toDocumentTitlePlainText(sanitizeDocumentTitleHtml(entry.content?.titleHtml)) ||
                      String(entry.title || '').trim();
                    const isOwner = Number(entry.teacherId) === Number(user?.id || 0);
                    const contextLabel = resolveEntryContextLabel(entry, assignmentLabelMap);
                    const coveredClasses = extractCoveredClasses(entry);
                    const showReviewActions = canReview && viewMode === 'review' && !isOwner;
                    const canSubmit = isOwner && (entry.status === 'DRAFT' || entry.status === 'REJECTED');
                    const canEdit = isOwner && entry.status !== 'APPROVED';
                    const canDelete = isOwner && entry.status !== 'APPROVED';
                    const isQuickEditing = quickEditEntryId === entry.id;
                    const quickSections = isQuickEditing
                      ? quickEditSections.filter((section) => isTeacherEditableTableSection(section))
                      : [];
                    const activeQuickSection =
                      quickSections.find((section) => section.id === quickEditActiveSectionId) || quickSections[0] || null;
                    const shouldUseQuickSectionTabs = activeProgramDisplayMode === 'TABS' && quickSections.length > 1;
                    const displayedQuickSections =
                      shouldUseQuickSectionTabs && activeQuickSection ? [activeQuickSection] : quickSections;

                    return (
                      <Fragment key={entry.id}>
                        <tr key={entry.id} className="border-b border-gray-100 align-top last:border-b-0">
                          <td className="px-3 py-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900">{displayEntryTitle}</div>
                              {entry.summary ? <p className="mt-1 text-sm text-gray-600">{entry.summary}</p> : null}
                              <div className="mt-2 text-xs text-gray-500">Guru: {entry.teacher?.name || '-'}</div>
                              {entry.reviewNote ? (
                                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                                  Catatan review: {entry.reviewNote}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusMeta.pillClass}`}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-700">{contextLabel || '-'}</td>
                          <td className="px-3 py-3 text-sm text-gray-700">
                            {coveredClasses.length > 0 ? `${coveredClasses.length} rombel (${coveredClasses.join(', ')})` : '-'}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-700">{formatDateTime(entry.updatedAt)}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-nowrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePrintEntry(entry, shouldUseQuickSectionTabs ? activeQuickSection?.id : undefined)
                                  }
                                  title="Print"
                                  aria-label="Print"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                >
                                  <Printer size={14} />
                                </button>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => openEdit(entry)}
                                    title="Edit Lengkap"
                                    aria-label="Edit Lengkap"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                ) : null}
                                {canDelete ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const confirmed = window.confirm('Hapus dokumen ini? Tindakan ini tidak bisa dibatalkan.');
                                      if (!confirmed) return;
                                      deleteMutation.mutate(entry.id);
                                    }}
                                    title="Hapus"
                                    aria-label="Hapus"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : null}
                              {canSubmit ? (
                                <button
                                  type="button"
                                  onClick={() => submitMutation.mutate(entry.id)}
                                  disabled={submitMutation.isPending}
                                  title="Kirim Review"
                                  aria-label="Kirim Review"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                  <Send size={14} />
                                </button>
                              ) : null}
                              {showReviewActions ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      reviewMutation.mutate({
                                        entryId: entry.id,
                                        action: 'APPROVE',
                                      })
                                    }
                                    disabled={reviewMutation.isPending}
                                    title="Setujui"
                                    aria-label="Setujui"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const note = window.prompt('Catatan revisi (opsional):', '') || '';
                                      reviewMutation.mutate({
                                        entryId: entry.id,
                                        action: 'REJECT',
                                        reviewNote: note.trim() || undefined,
                                      });
                                    }}
                                    disabled={reviewMutation.isPending}
                                    title="Revisi"
                                    aria-label="Revisi"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {isQuickEditing && activeQuickSection ? (
                          <tr className="border-b border-gray-100 bg-slate-50/60">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
                                  {shouldUseQuickSectionTabs ? (
                                    <UnderlineTabBar
                                      items={quickSections.map((section) => ({
                                        id: section.id,
                                        label: section.title || 'Bagian tabel',
                                        icon: CalendarDays,
                                      }))}
                                      activeId={activeQuickSection.id}
                                      onChange={setQuickEditActiveSectionId}
                                      className="min-w-0 flex-1"
                                      innerClassName="gap-2"
                                      textSizeClassName="text-xs"
                                      ariaLabel="Tab tabel perangkat ajar"
                                    />
                                  ) : (
                                    <div className="min-h-10 flex-1" />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => quickEditMutation.mutate(entry)}
                                    disabled={quickEditMutation.isPending}
                                    className="mb-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                  >
                                    <Save size={12} />
                                    {quickEditMutation.isPending ? 'Menyimpan...' : 'Simpan Tabel'}
                                  </button>
                                </div>

                                <div className="space-y-4">
                                  {displayedQuickSections.map((quickSection) => {
                                    const sectionColumns = getVisibleSectionColumns(quickSection);
                                    const sectionRows = quickSection.rows;
                                    const headerGroupLayout = buildHeaderGroupLayout(sectionColumns);
                                    const hasMatriksSebaranWeekGrid =
                                      isActiveProgramMatriksSebaran &&
                                      sectionColumns.some(
                                        (column) =>
                                          isMatriksSebaranGroupedWeekColumn(column) ||
                                          isMatriksSebaranWeekColumnKey(column.key),
                                      );
                                    return (
                                      <div key={`quick-section-table-${quickSection.id}`}>
                                        {!shouldUseQuickSectionTabs && displayedQuickSections.length > 1 ? (
                                          <div className="mb-2 text-sm font-semibold text-slate-900">
                                            {quickSection.title || 'Tabel'}
                                          </div>
                                        ) : null}
                                        {buildMonthWeekColumnLayout(sectionColumns) ? (
                                          renderQuickEditMonthWeekTable(quickSection, sectionColumns, sectionRows)
                                        ) : (
                                          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-300">
                                            <table
                                              className={`table-fixed border-collapse text-xs ${
                                                hasMatriksSebaranWeekGrid ? 'w-full min-w-[1440px]' : 'w-full'
                                              }`}
                                            >
                                              <thead className="bg-slate-100">
                                                {headerGroupLayout ? (
                                                  <>
                                                    <tr>
                                                      {headerGroupLayout.map((group) =>
                                                        group.grouped ? (
                                                          <th
                                                            key={`quick-head-group-${quickSection.id}-${group.key}`}
                                                            colSpan={group.columns.length}
                                                            className="border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold uppercase leading-snug text-slate-700"
                                                          >
                                                            {group.label}
                                                          </th>
                                                        ) : (
                                                          <th
                                                            key={`quick-head-standalone-${quickSection.id}-${group.key}`}
                                                            rowSpan={2}
                                                            style={getQuickColumnStyle(group.columns[0], sectionColumns)}
                                                            className="border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold uppercase leading-snug text-slate-700"
                                                          >
                                                            {group.label}
                                                          </th>
                                                        ),
                                                      )}
                                                    </tr>
                                                    <tr>
                                                      {headerGroupLayout.flatMap((group) =>
                                                        group.grouped
                                                          ? group.columns.map((column) => (
                                                              <th
                                                                key={`quick-head-group-child-${quickSection.id}-${group.key}-${column.key}`}
                                                                style={getQuickColumnStyle(column, sectionColumns)}
                                                                className="border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold uppercase leading-snug text-slate-700"
                                                              >
                                                                {column.label}
                                                              </th>
                                                            ))
                                                          : [],
                                                      )}
                                                    </tr>
                                                  </>
                                                ) : (
                                                  <tr>
                                                    {sectionColumns.map((column) => (
                                                      <th
                                                        key={`quick-head-${quickSection.id}-${column.key}`}
                                                        style={getQuickColumnStyle(column, sectionColumns)}
                                                        className="border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold uppercase leading-snug text-slate-700"
                                                      >
                                                        {column.label}
                                                      </th>
                                                    ))}
                                                  </tr>
                                                )}
                                              </thead>
                                              <tbody>
                                                {sectionRows.map((row) => {
                                                  const lineCounts = sectionColumns.map((column) =>
                                                    getVisualEditableCellLines(column, row.values[String(column.key || '').trim()]).length,
                                                  );
                                                  const maxLineCount = Math.max(1, ...lineCounts);
                                                  return Array.from({ length: maxLineCount }).map((_, lineIndex) => (
                                                    <tr
                                                      key={`quick-row-${row.id}-${lineIndex}`}
                                                      className="border-b border-slate-100 last:border-b-0"
                                                    >
                                                      {sectionColumns.map((column) => {
                                                        const columnKey = String(column.key || '').trim();
                                                        const cellLines = getVisualEditableCellLines(column, row.values[columnKey]);
                                                        const shouldRenderPerVisualLine =
                                                          isKktpCriteriaColumnKey(columnKey) && maxLineCount > 1;
                                                        if (cellLines.length <= 1 && lineIndex > 0 && !shouldRenderPerVisualLine) {
                                                          return null;
                                                        }
                                                        if (
                                                          cellLines.length > 1 &&
                                                          lineIndex >= cellLines.length &&
                                                          !shouldRenderPerVisualLine
                                                        ) {
                                                          return (
                                                            <td
                                                              key={`quick-cell-${row.id}-${column.key}-${lineIndex}`}
                                                              style={getQuickColumnStyle(column, sectionColumns)}
                                                              className={`border border-slate-300 bg-white p-1 align-top ${
                                                                isCenterAlignedTableColumn(column) ? 'text-center' : ''
                                                              }`}
                                                            />
                                                          );
                                                        }
                                                        return (
                                                          <td
                                                            key={`quick-cell-${row.id}-${column.key}-${lineIndex}`}
                                                            rowSpan={
                                                              !shouldRenderPerVisualLine && cellLines.length <= 1
                                                                ? maxLineCount
                                                                : undefined
                                                            }
                                                            style={getQuickColumnStyle(column, sectionColumns)}
                                                            className={`border border-slate-300 bg-white p-1 ${
                                                              !shouldRenderPerVisualLine && cellLines.length <= 1 && maxLineCount > 1
                                                                ? 'align-middle'
                                                                : 'align-top'
                                                            } ${isCenterAlignedTableColumn(column) ? 'text-center' : ''}`}
                                                          >
                                                            {renderQuickEditCellControl(quickSection, row, column, lineIndex)}
                                                          </td>
                                                        );
                                                      })}
                                                    </tr>
                                                  ));
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                        <div className="mt-3 flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => addQuickEditSectionRow(quickSection.id)}
                                            className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                          >
                                            + Tambah Baris
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
            <span className="text-gray-500">
              Halaman {Math.min(page, totalPages)} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPageEditor || isEditorOpen ? (
        <div className={isPageEditor ? 'space-y-4' : 'fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/25 px-4 py-6 backdrop-blur-[2px]'}>
          <div
            className={
              isPageEditor
                ? 'w-full rounded-xl border border-gray-200 bg-white shadow-sm'
                : 'max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white shadow-xl'
            }
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingEntry ? `Edit Dokumen ${effectiveTitle}` : `Konfigurasi Dokumen ${effectiveTitle}`}
                </h3>
                <p className="text-sm text-gray-500">
                  {editingEntry
                    ? 'Rapikan isi dokumen dan sesuaikan per kolom atau baris yang dibutuhkan.'
                    : 'Atur konteks, judul, lalu sesuaikan kebutuhan baris dan kolom sebelum dokumen dibuat.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseEditor}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className={`space-y-4 px-5 py-4 ${isPageEditor ? '' : ''}`}>
              <div className={`grid grid-cols-1 gap-3 ${usesSheetTemplate ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Mapel & Tingkat {usesSheetTemplate ? '' : '(opsional)'}
                  </label>
                  <select
                    value={selectedContextKey}
                    onChange={(event) => onContextChange(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Tanpa konteks mapel/tingkat</option>
                    {assignmentContextOptions.map((context) => (
                      <option key={context.key} value={context.key}>
                        {context.label}
                      </option>
                    ))}
                  </select>
                  {selectedContext ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Berlaku untuk seluruh rombel terkait ({selectedContext.coveredClasses.length} rombel):
                      <span className="font-medium text-gray-700"> {selectedContext.coveredClasses.join(', ')}</span>
                      {selectedTeachingLoad?.weeklyClassHours ? (
                        <span className="ml-1">
                          - Alokasi sistem {formatNumericValue(selectedTeachingLoad.weeklyClassHours)} JP/minggu per rombel
                          {selectedTeachingLoad.weeklyTotalHours !== selectedTeachingLoad.weeklyClassHours
                            ? ` (${formatNumericValue(selectedTeachingLoad.weeklyTotalHours)} JP total)`
                            : ''}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {!usesSheetTemplate ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Tags (pisahkan dengan koma)</label>
                    <input
                      value={entryTags}
                      onChange={(event) => setEntryTags(event.target.value)}
                      placeholder="contoh: capaian, semester genap, tingkat xii"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Judul Dokumen</label>
                <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-blue-500">
                  <ReactQuill
                    theme="snow"
                    value={entryTitleHtml}
                    onChange={(value) => setEntryTitleHtml(sanitizeDocumentTitleHtml(value))}
                    modules={DOCUMENT_TITLE_QUILL_MODULES}
                    formats={DOCUMENT_TITLE_QUILL_FORMATS}
                    placeholder={activeProgramMeta?.schema?.titleHint || 'Masukkan judul dokumen...'}
                    className="question-editor-quill teaching-resource-title-quill bg-white"
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Judul ini ikut menjadi heading utama saat dicetak. Anda bisa atur ukuran, rata kiri, tengah, kanan,
                  bold, italic, dan underline.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Ringkasan</label>
                <textarea
                  ref={resizeTextareaToContent}
                  rows={2}
                  value={entrySummary}
                  onChange={(event) => setEntrySummary(event.target.value)}
                  onInput={(event) => resizeTextareaToContent(event.currentTarget)}
                  placeholder={activeProgramMeta?.schema?.summaryHint || 'Ringkasan singkat dokumen...'}
                  className="w-full resize-y overflow-hidden rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Tempat, Tanggal Tanda Tangan</label>
                <input
                  value={entrySignaturePlaceDate}
                  onChange={(event) => setEntrySignaturePlaceDate(event.target.value)}
                  placeholder="Contoh: Bekasi, 29 April 2026"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Tanggal ini disimpan pada dokumen, sehingga hasil print tidak berubah mengikuti tanggal hari ini.
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">Isi Dokumen</h4>
                  {canAddSection ? (
                    <button
                      type="button"
                      onClick={addSection}
                      className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      + Tambah Bagian
                    </button>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {sections.map((section, index) => (
                    <div key={section.id} className="rounded-md border border-gray-200 bg-white p-3">
                      {(() => {
                        const sectionSchema = resolveSectionSchema(section);
                        const tableMode = isTableSection(section);
                        const sectionColumns = resolveSectionColumns(section);
                        const visibleSectionColumns = getVisibleSectionColumns(section);
                        const monthWeekColumnLayout = buildMonthWeekColumnLayout(visibleSectionColumns);
                        const headerGroupLayout = buildHeaderGroupLayout(visibleSectionColumns);
                        const minRowCount = getMinimumRowCount(section);
                        return (
                          <>
                            {(usesSheetTemplate && tableMode) || canDeleteSection(section) ? (
                              <div className="mb-2 flex items-center justify-end gap-2">
                                {usesSheetTemplate && tableMode ? (
                                  <button
                                    type="button"
                                    onClick={() => addSectionColumn(section.id)}
                                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                                  >
                                    + Kolom
                                  </button>
                                ) : null}
                                {canDeleteSection(section) ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSectionsWithDerived((prev) => prev.filter((item) => item.id !== section.id))
                                    }
                                    className="text-xs font-medium text-rose-600 hover:text-rose-700"
                                  >
                                    Hapus
                                  </button>
                                ) : null}
                              </div>
                            ) : null}

                            {usesSheetTemplate &&
                            tableMode &&
                            visibleSectionColumns.length > 0 &&
                            !monthWeekColumnLayout ? (
                              <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                                <p className="mb-1 text-[11px] font-medium text-gray-500">
                                  Struktur kolom (editable seperti lembar kerja)
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {visibleSectionColumns.map((column) => (
                                    <div
                                      key={`${section.id}-column-${column.key}`}
                                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-1"
                                    >
                                      <input
                                        value={String(column.label || '')}
                                        onChange={(event) =>
                                          updateSectionColumnLabel(section.id, column.key, event.target.value)
                                        }
                                        className="h-7 min-w-[110px] rounded border border-gray-200 px-2 text-[11px] text-gray-700 focus:border-blue-500 focus:outline-none"
                                      />
                                      {visibleSectionColumns.length > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() => removeSectionColumn(section.id, column.key)}
                                          className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-100"
                                        >
                                          Hapus
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {!tableMode && canEditSectionTitle(section) ? (
                              <input
                                value={section.title}
                                onChange={(event) => updateSectionField(section.id, 'title', event.target.value)}
                                placeholder={sectionSchema?.titlePlaceholder || 'Judul bagian'}
                                className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            ) : !tableMode ? (
                              <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                                {section.title || sectionSchema?.label || `Bagian ${index + 1}`}
                              </div>
                            ) : null}

                            {tableMode ? (
                              isSingleRowSheetForm(section) ? (
                                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                    {sectionColumns.map((column) => {
                                      const row = section.rows[0];
                                      const columnKey = String(column.key || '').trim();
                                      if (columnKey.toLowerCase() === 'tahun_ajaran') return null;
                                      return (
                                        <label key={`${section.id}-${column.key}`} className="space-y-1">
                                          <span className="block text-[11px] font-semibold text-gray-500">
                                            {column.label}
                                          </span>
                                          {renderSectionCellControl(section, row, column, true)}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {monthWeekColumnLayout ? (
                                    renderSectionMonthWeekTable(section, visibleSectionColumns, minRowCount)
                                  ) : (
                                    <div className="overflow-x-auto rounded-md border border-gray-200">
                                      <table className="min-w-max text-xs">
                                        <thead className="bg-gray-50">
                                          {headerGroupLayout ? (
                                            <>
                                              <tr>
                                                {headerGroupLayout.map((group) =>
                                                  group.grouped ? (
                                                    <th
                                                      key={`group-${group.key}`}
                                                      colSpan={group.columns.length}
                                                      className="whitespace-nowrap border-b border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600"
                                                    >
                                                      {group.label}
                                                    </th>
                                                  ) : (
                                                    <th
                                                      key={`standalone-${group.key}`}
                                                      rowSpan={2}
                                                      className={`whitespace-nowrap border-b border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600 ${getColumnWidthClass(group.columns[0]?.key, Boolean(group.columns[0]?.multiline), group.columns[0]?.dataType)}`}
                                                    >
                                                      {group.label}
                                                    </th>
                                                  ),
                                                )}
                                                <th
                                                  rowSpan={2}
                                                  className="sticky right-0 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-right font-semibold text-gray-600"
                                                >
                                                  Aksi
                                                </th>
                                              </tr>
                                              <tr>
                                                {headerGroupLayout.flatMap((group) =>
                                                  group.grouped
                                                    ? group.columns.map((column) => (
                                                        <th
                                                          key={`group-child-${group.key}-${column.key}`}
                                                          className={`whitespace-nowrap border-b border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600 ${getColumnWidthClass(column.key, Boolean(column.multiline), column.dataType)}`}
                                                        >
                                                          {column.label}
                                                        </th>
                                                      ))
                                                    : [],
                                                )}
                                              </tr>
                                            </>
                                          ) : (
                                            <tr>
                                              {visibleSectionColumns.map((column) => (
                                                <th
                                                  key={column.key}
                                                  className={`whitespace-nowrap border-b border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600 ${getColumnWidthClass(column.key, Boolean(column.multiline), column.dataType)}`}
                                                >
                                                  {column.label}
                                                </th>
                                              ))}
                                              <th className="sticky right-0 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-right font-semibold text-gray-600">
                                                Aksi
                                              </th>
                                            </tr>
                                          )}
                                        </thead>
                                        <tbody>
                                          {section.rows.map((row, rowIndex) => (
                                            <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                                              {visibleSectionColumns.map((column) => (
                                                <td
                                                  key={`${row.id}-${column.key}`}
                                                  className={`px-2 py-1.5 align-top ${isCenterAlignedTableColumn(column) ? 'text-center' : ''} ${getColumnWidthClass(column.key, Boolean(column.multiline), column.dataType)}`}
                                                >
                                                  {renderSectionCellControl(section, row, column, true)}
                                                </td>
                                              ))}
                                              <td className="sticky right-0 bg-white px-2 py-1.5 text-right align-top">
                                                <button
                                                  type="button"
                                                  onClick={() => removeSectionRow(section.id, row.id)}
                                                  disabled={section.rows.length <= minRowCount}
                                                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  Hapus
                                                </button>
                                                <p className="mt-1 text-[10px] text-gray-400">Baris {rowIndex + 1}</p>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                  {canAddRowForSection(section) ? (
                                    <button
                                      type="button"
                                      onClick={() => addSectionRow(section.id)}
                                      className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                    >
                                      + Tambah Baris
                                    </button>
                                  ) : null}
                                </div>
                              )
                            ) : (
                              <textarea
                                ref={resizeTextareaToContent}
                                rows={4}
                                value={section.body}
                                onChange={(event) => updateSectionField(section.id, 'body', event.target.value)}
                                onInput={(event) => resizeTextareaToContent(event.currentTarget)}
                                placeholder={sectionSchema?.bodyPlaceholder || 'Isi bagian dokumen...'}
                                className="w-full resize-y overflow-hidden rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              {!usesSheetTemplate ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Catatan Tambahan</label>
                  <textarea
                    ref={resizeTextareaToContent}
                    rows={2}
                    value={entryNotes}
                    onChange={(event) => setEntryNotes(event.target.value)}
                    onInput={(event) => resizeTextareaToContent(event.currentTarget)}
                    placeholder="Catatan tambahan (opsional)..."
                    className="w-full resize-y overflow-hidden rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={handleCloseEditor}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editingEntry) {
                    updateMutation.mutate();
                  } else {
                    createMutation.mutate();
                  }
                }}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Save size={14} />
                {isSaving ? 'Menyimpan...' : editingEntry ? 'Simpan Perubahan' : 'Simpan & Buat Dokumen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {monthWeekNoteModal ? (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-950/20 px-4 py-24 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Keterangan Minggu</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Isi jika minggu ini libur atau ada kegiatan khusus. Kosongkan untuk menghapus keterangan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMonthWeekNoteModal(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup keterangan minggu"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Teks Keterangan
              </label>
              <textarea
                autoFocus
                rows={4}
                value={monthWeekNoteModal.value}
                onChange={(event) =>
                  setMonthWeekNoteModal((current) =>
                    current
                      ? {
                          ...current,
                          value: event.target.value,
                        }
                      : current,
                  )
                }
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    saveMonthWeekNoteModal();
                  }
                }}
                placeholder="Contoh: Libur nasional, Masa Pengenalan Lingkungan Sekolah..."
                className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-800 focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                Saat dicetak, teks ini akan otomatis dibuat vertikal seperti contoh Promes.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setMonthWeekNoteModal(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={saveMonthWeekNoteModal}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Save size={14} />
                Simpan Keterangan
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <iframe ref={printIframeRef} title="teaching-resource-print-frame" className="hidden" />
    </div>
  );
};

export default LearningResourceGenerator;
