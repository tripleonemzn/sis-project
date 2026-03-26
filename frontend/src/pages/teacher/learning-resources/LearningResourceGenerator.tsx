import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Printer, RefreshCw, Save, Send, X } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { authService } from '../../../services/auth.service';
import {
  type TeachingResourceColumnDataType,
  type TeachingResourceColumnValueSource,
  type TeachingResourceEntry,
  type TeachingResourceEntryStatus,
  type TeachingResourceProgram,
  type TeachingResourceProgramSectionSchema,
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
  rows: Array<{
    id: string;
    values: Record<string, string>;
  }>;
};

type EntrySectionColumnForm = {
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
      semanticKey?: unknown;
      bindingKey?: unknown;
      valueSource?: unknown;
      required?: unknown;
      readOnly?: unknown;
      options?: unknown;
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
      semanticKey: String(column.semanticKey || '').trim() || undefined,
      bindingKey: String(column.bindingKey || '').trim() || undefined,
      valueSource: String(column.valueSource || '').trim().toUpperCase() as TeachingResourceColumnValueSource,
      required: Boolean(column.required),
      readOnly: Boolean(column.readOnly),
      options: Array.isArray(column.options)
        ? column.options.map((option) => String(option || '').trim()).filter(Boolean)
        : undefined,
    });
    return acc;
  }, []);
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

const parseEntrySections = (
  entry: TeachingResourceEntry,
  defaultSections: EntrySectionForm[],
): EntrySectionForm[] => {
  const rawSections = Array.isArray(entry.content?.sections)
    ? entry.content.sections
    : entry.content?.sections && typeof entry.content.sections === 'object'
      ? Object.values(entry.content.sections as Record<string, unknown>)
      : [];
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
    const parsedRows = Array.isArray(item.rows)
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
            if (Object.keys(values).length === 0) return null;
            return {
              id: `row-${entry.id}-${index + 1}-${rowIndex + 1}`,
              values,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
      : [];
    const parsed: EntrySectionForm = {
      id: `section-${entry.id}-${index + 1}`,
      schemaKey,
      title: String(item.title || '').trim(),
      body: String(item.body || '').trim(),
      columns: parsedColumns.length > 0 ? parsedColumns : ensureArray<EntrySectionColumnForm>(fallbackSection?.columns),
      rows: parsedRows,
    };
    if (isDigitalApprovalOnlySection(parsed.schemaKey, parsed.title)) return;
    if (isLegacySheetHintSection(parsed.schemaKey, parsed.title, parsed.body)) return;
    if (parsed.title.length === 0 && parsed.body.length === 0 && parsed.rows.length === 0 && parsed.columns.length === 0) return;
    normalized.push(parsed);
  });
  return normalized.length > 0 ? normalized : defaultSections;
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
  const curriculumTitle = String(firstRow.pihak_1_jabatan || defaults?.curriculumTitle || 'Wakasek Kurikulum').trim();
  const curriculumName = String(firstRow.pihak_1_nama || defaults?.curriculumName || '-').trim();
  const principalTitle = String(firstRow.pihak_2_jabatan || defaults?.principalTitle || 'Kepala Sekolah').trim();
  const principalName = String(firstRow.pihak_2_nama || defaults?.principalName || '-').trim();
  return {
    placeDate: String(firstRow.tempat_tanggal || '').trim(),
    curriculumTitle,
    curriculumName,
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

const formatMultilineHtml = (value: unknown): string => {
  const safe = escapeHtml(value);
  return safe.replace(/\n/g, '<br />');
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

const isWeekColumnKey = (columnKey: string): boolean => {
  const key = String(columnKey || '').trim().toLowerCase();
  return WEEK_COLUMN_PREFIXES.some((prefix) => key.startsWith(prefix));
};

const isTruthyMark = (value: string): boolean => {
  const token = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'ya', 'yes', 'v', 'x', '✓'].includes(token);
};

const MARK_VALUE = '✓';

const isKktpCriteriaColumnKey = (columnKey: string): boolean => {
  const key = String(columnKey || '').trim().toLowerCase();
  return key === 'kurang_memadai' || key === 'memadai';
};

const formatNumericValue = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
};

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
        if (isWeekColumnKey(columnKey) || isKktpCriteriaColumnKey(columnKey)) {
          values[columnKey] = isTruthyMark(values[columnKey] || '') ? MARK_VALUE : '';
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
        if (isTruthyMark(row.values.kurang_memadai || '')) totalKurangMemadai += 1;
        if (isTruthyMark(row.values.memadai || '')) totalMemadai += 1;
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
  [column.bindingKey, column.semanticKey, column.key].forEach((item) => {
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
}): EntrySectionForm[] => {
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
  const [entryTitle, setEntryTitle] = useState('');
  const [entrySummary, setEntrySummary] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entryTags, setEntryTags] = useState('');
  const [sections, setSections] = useState<EntrySectionForm[]>(() => [createSection()]);
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

  const activeProgramMeta = useMemo<TeachingResourceProgram | null>(() => {
    const programs = toProgramConfigArray(programConfigQuery.data);
    return programs.find((program) => normalizeTeachingResourceProgramCode(program.code) === programCode) || null;
  }, [programCode, programConfigQuery.data]);

  const effectiveTitle = useMemo(() => {
    const fromConfig = String(activeProgramMeta?.label || '').trim();
    return fromConfig || title;
  }, [activeProgramMeta?.label, title]);

  const effectiveDescription = useMemo(() => {
    const fromConfig = String(activeProgramMeta?.description || '').trim();
    return fromConfig || description;
  }, [activeProgramMeta?.description, description]);

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

  const ensureDerivedSections = (sourceSections: EntrySectionForm[]): EntrySectionForm[] =>
    applyDerivedSheetSections(sourceSections, activeProgramSchemaMap);

  const buildPayloadSections = (sourceSections: EntrySectionForm[]) => {
    const derivedSections = ensureDerivedSections(sourceSections);
    return derivedSections
      .map((section) => {
        const normalizedColumns = sanitizeSectionColumns(section.columns);
        const normalizedRows = section.rows
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
          schemaKey: String(section.schemaKey || '').trim() || undefined,
          title: String(section.title || '').trim(),
          body: String(section.body || '').trim(),
          columns: normalizedColumns.length > 0 ? normalizedColumns : undefined,
          rows: normalizedRows,
        };
      })
      .filter((section) => section.title || section.body || section.rows.length > 0 || Boolean(section.columns?.length));
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
  const academicYearName = useMemo(() => String(activeAcademicYear?.name || '').trim(), [activeAcademicYear?.name]);
  const activeSemesterLabel = useMemo(
    () => resolveSemesterLabel(activeAcademicYear?.semester),
    [activeAcademicYear?.semester],
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

  const entryPayload = entryQuery.data?.data;
  const canReview = Boolean(entryPayload?.canReview);
  const rows = ensureArray<TeachingResourceEntry>(entryPayload?.rows);
  const totalPages = Math.max(1, Number(entryPayload?.totalPages || 1));

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

  const resetForm = () => {
    setEditingEntry(null);
    setEntryTitle('');
    setEntrySummary('');
    setEntryNotes('');
    setEntryTags('');
    setSelectedContextKey('');
    setSections(ensureDerivedSections(buildDefaultSections(activeProgramMeta)));
  };

  const initializeCreate = (openAsModal = true) => {
    const defaultContextKey =
      (usesSheetTemplate && (selectedContextKey || String(assignmentContextOptions[0]?.key || '').trim())) || '';
    const currentContext =
      assignmentContextOptions.find((item) => String(item.key) === String(defaultContextKey || '').trim()) || null;
    const generatedSections = buildDefaultSections(activeProgramMeta);
    const hydratedSections = usesSheetTemplate
      ? hydrateSheetSections({
          sections: generatedSections,
          schemaMap: activeProgramSchemaMap,
          context: currentContext,
          academicYearName,
          semesterLabel: activeSemesterLabel,
        })
      : generatedSections;

    setEditingEntry(null);
    setEntrySummary('');
    setEntryNotes('');
    setEntryTags('');
    setSelectedContextKey(defaultContextKey);
    setEntryTitle(
      usesSheetTemplate
        ? buildAutoSheetTitle({
            programLabel: effectiveTitle,
            context: currentContext,
            academicYearName,
            semesterLabel: activeSemesterLabel,
          })
        : '',
    );
    setSections(ensureDerivedSections(hydratedSections));
    setIsEditorOpen(openAsModal);
  };

  const openEdit = (entry: TeachingResourceEntry) => {
    const matchedContext =
      assignmentContextOptions.find(
        (item) =>
          Number(item.subjectId) === Number(entry.subjectId || 0) &&
          String(item.className || '').trim().toLowerCase() === String(entry.className || '').trim().toLowerCase(),
      ) || null;
    setEditingEntry(entry);
    setEntryTitle(String(entry.title || ''));
    setEntrySummary(String(entry.summary || ''));
    setEntryNotes(String((entry.content?.notes as string) || ''));
    setEntryTags((entry.tags || []).join(', '));
    setSelectedContextKey(matchedContext ? String(matchedContext.key) : '');
    setSections(ensureDerivedSections(parseEntrySections(entry, buildDefaultSections(activeProgramMeta))));
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
      if (hasMeaningfulContent) return ensureDerivedSections(prev);
      return ensureDerivedSections(buildDefaultSections(activeProgramMeta));
    });
  }, [activeProgramMeta, editingEntry, isEditorOpen]);

  useEffect(() => {
    if (!isPageEditor) {
      setPageEditorInitialized(false);
      return;
    }
    if (pageEditorInitialized) return;
    if (programConfigQuery.isLoading) return;
    initializeCreate(false);
    setPageEditorInitialized(true);
  }, [isPageEditor, pageEditorInitialized, programConfigQuery.isLoading, activeProgramMeta, assignmentContextOptions]);

  const handleCloseEditor = () => {
    resetForm();
    setIsEditorOpen(false);
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
      const normalizedSections = buildPayloadSections(sections);

      if (!entryTitle.trim()) {
        throw new Error('Judul dokumen wajib diisi.');
      }
      if (normalizedSections.length === 0) {
        throw new Error('Minimal satu isi bagian dokumen wajib diisi.');
      }

      return teachingResourceProgramService.createEntry({
        academicYearId,
        programCode,
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
          notes: entryNotes.trim() || undefined,
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
      const normalizedSections = buildPayloadSections(sections);
      if (!entryTitle.trim()) {
        throw new Error('Judul dokumen wajib diisi.');
      }
      if (normalizedSections.length === 0) {
        throw new Error('Minimal satu isi bagian dokumen wajib diisi.');
      }

      return teachingResourceProgramService.updateEntry(editingEntry.id, {
        title: entryTitle.trim(),
        summary: entrySummary.trim(),
        subjectId: selectedContext ? Number(selectedContext.subjectId) : null,
        classLevel: selectedContext ? selectedContext.classLevel : null,
        className: selectedContext ? selectedContext.className : null,
        tags: entryTags
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
        content: {
          sections: normalizedSections,
          notes: entryNotes.trim() || undefined,
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

  const resolveSectionSchema = (section: EntrySectionForm): TeachingResourceProgramSectionSchema | undefined =>
    activeProgramSchemaMap.get(String(section.schemaKey || '').trim());

  const resolveSectionColumns = (section: EntrySectionForm): EntrySectionColumnForm[] => {
    const customColumns = sanitizeSectionColumns(section.columns);
    if (customColumns.length > 0) return customColumns;
    const schema = resolveSectionSchema(section);
    return sanitizeSectionColumns(schema?.columns);
  };

  const getVisibleSectionColumns = (section: EntrySectionForm): EntrySectionColumnForm[] =>
    resolveSectionColumns(section).filter((column) => String(column.key || '').trim().toLowerCase() !== 'tahun_ajaran');

  const isTableSection = (section: EntrySectionForm): boolean =>
    (resolveSectionSchema(section)?.editorType || 'TEXT') === 'TABLE';

  const getMinimumRowCount = (_section: EntrySectionForm): number => 1;

  const canAddRowForSection = (section: EntrySectionForm): boolean => {
    if (!isTableSection(section)) return false;
    return true;
  };

  const isSingleRowSheetForm = (_section: EntrySectionForm): boolean => false;

  const getColumnWidthClass = (columnKey: string, multiline = false): string => {
    const key = String(columnKey || '').toLowerCase();
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
    setSections((prev) => ensureDerivedSections(updater(prev)));
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
    setEntryTitle(
      buildAutoSheetTitle({
        programLabel: effectiveTitle,
        context: nextContext,
        academicYearName,
        semesterLabel: activeSemesterLabel,
      }),
    );
    setSectionsWithDerived((prev) =>
      hydrateSheetSections({
        sections: prev,
        schemaMap: activeProgramSchemaMap,
        context: nextContext,
        academicYearName,
        semesterLabel: activeSemesterLabel,
      }),
    );
  };

  const renderSectionTableHtml = (section: EntrySectionForm): string => {
    const schemaColumns = resolveSectionColumns(section);
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (rows.length === 0) return '<p style="margin:0;color:#64748b;">-</p>';

    const dynamicKeys = Array.from(
      rows.reduce((acc, row) => {
        Object.keys(row.values || {}).forEach((key) => acc.add(key));
        return acc;
      }, new Set<string>()),
    );

    const headers =
      schemaColumns.length > 0
        ? schemaColumns
            .map((column) => ({
              key: String(column.key || '').trim(),
              label: String(column.label || column.key || '').trim(),
            }))
            .filter((header) => header.key)
        : dynamicKeys.map((key) => ({ key, label: key }));

    const thead = `<tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join('')}</tr>`;
    const tbody = rows
      .map((row) => {
        const cells = headers
          .map((header) => `<td>${formatMultilineHtml(String(row.values?.[header.key] || '-'))}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    return `<div class="table-wrap"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
  };

  const renderSectionPrintHtml = (section: EntrySectionForm): string => {
    const title = escapeHtml(section.title || 'Bagian');
    if (isTableSection(section)) {
      return `<section><h3>${title}</h3>${renderSectionTableHtml(section)}</section>`;
    }
    return `<section><h3>${title}</h3><div class="text-block">${formatMultilineHtml(section.body || '-')}</div></section>`;
  };

  const buildPrintHtml = (entry: TeachingResourceEntry): string => {
    const defaultSections = buildDefaultSections(activeProgramMeta);
    const printableSections = parseEntrySections(entry, defaultSections);
    const coveredClasses = extractCoveredClasses(entry);
    const contextLabelRaw = resolveEntryContextLabel(entry, assignmentLabelMap);
    const contextValues = extractEntryContextValues(entry, {
      mataPelajaran: String(contextLabelRaw.split(' - ')[0] || '').trim(),
      tingkat: String(entry.classLevel || '').trim(),
      semester: activeSemesterLabel,
      tahunAjaran: academicYearName,
    });
    const signatureValues = extractEntrySignatureValues(entry, {
      curriculumTitle: String(signatureDefaultsQuery.data?.curriculum?.roleTitle || 'Wakasek Kurikulum').trim(),
      curriculumName: String(signatureDefaultsQuery.data?.curriculum?.name || '-').trim(),
      principalTitle: String(signatureDefaultsQuery.data?.principal?.roleTitle || 'Kepala Sekolah').trim(),
      principalName: String(signatureDefaultsQuery.data?.principal?.name || '-').trim(),
    });
    const printDateLine = signatureValues.placeDate || `Bekasi, ${formatLongDate(new Date())}`;

    return `
      <!doctype html>
      <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(entry.title || effectiveTitle)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 24px; font-family: Arial, sans-serif; color: #0f172a; }
          .header { text-align: center; margin-bottom: 14px; }
          .header .school { font-size: 24px; font-weight: 800; letter-spacing: .4px; }
          .header .year { font-size: 18px; font-weight: 700; margin-top: 2px; }
          .doc-context { width: 100%; max-width: 560px; margin-bottom: 12px; font-size: 13px; border-collapse: collapse; }
          .doc-context td { border: none; padding: 2px 0; }
          .doc-context td:first-child { width: 185px; }
          section { margin-bottom: 14px; page-break-inside: avoid; }
          section h3 { margin: 0 0 8px; font-size: 14px; }
          .text-block {
            border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;
            font-size: 12px; line-height: 1.6; white-space: normal;
          }
          .table-wrap { overflow: hidden; border: 1px solid #cbd5e1; border-radius: 6px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; text-align: left; }
          th { background: #f8fafc; font-weight: 700; }
          .signature-meta {
            margin-top: 18px; font-size: 12px; color: #334155;
          }
          .signature-wrap {
            margin-top: 14px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 64px;
          }
          .signature-box {
            text-align: center;
            font-size: 13px;
          }
          .signature-spacer {
            height: 64px;
          }
          .signature-name {
            display: inline-block;
            min-width: 240px;
            border-bottom: 1px solid #0f172a;
            padding-bottom: 2px;
            font-weight: 700;
            margin-bottom: 2px;
          }
          @media print {
            body { margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="school">SMKS KARYA GUNA BHAKTI 2</div>
          <div class="year">TAHUN AJARAN ${escapeHtml(contextValues.tahunAjaran || academicYearName || '-')}</div>
        </div>
        <table class="doc-context">
          <tr><td>Mata Pelajaran</td><td>: ${escapeHtml(contextValues.mataPelajaran || '-')}</td></tr>
          <tr><td>Tingkat</td><td>: ${escapeHtml(contextValues.tingkat || '-')}</td></tr>
          <tr><td>Program Keahlian</td><td>: ${escapeHtml(contextValues.programKeahlian || '-')}</td></tr>
          <tr><td>Semester</td><td>: ${escapeHtml(contextValues.semester || '-')}</td></tr>
          <tr><td>Cakupan Rombel</td><td>: ${
            coveredClasses.length > 0
              ? escapeHtml(`${coveredClasses.length} rombel (${coveredClasses.join(', ')})`)
              : '-'
          }</td></tr>
        </table>
        <div class="signature-meta">
          <div><b>Dokumen:</b> ${escapeHtml(entry.title || effectiveTitle)}</div>
          <div><b>Status Persetujuan Digital:</b> ${
            entry.status === 'APPROVED' ? 'Disetujui' : entry.status === 'REJECTED' ? 'Perlu Revisi' : 'Belum final'
          }</div>
          <div><b>Reviewer:</b> ${escapeHtml(entry.reviewer?.name || '-')}</div>
          ${entry.reviewNote ? `<div><b>Catatan Review:</b> ${formatMultilineHtml(entry.reviewNote)}</div>` : ''}
        </div>
        ${printableSections.map(renderSectionPrintHtml).join('')}
        <div class="signature-wrap">
          <div class="signature-box">
            <div>${escapeHtml(signatureValues.curriculumTitle)}</div>
            <div class="signature-spacer"></div>
            <div class="signature-name">${escapeHtml(signatureValues.curriculumName || '-')}</div>
          </div>
          <div class="signature-box">
            <div>${escapeHtml(printDateLine)}</div>
            <div>${escapeHtml(signatureValues.principalTitle)}</div>
            <div class="signature-spacer"></div>
            <div class="signature-name">${escapeHtml(signatureValues.principalName || '-')}</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintEntry = (entry: TeachingResourceEntry) => {
    try {
      const html = buildPrintHtml(entry);
      const printWindow = window.open('', '_blank', 'width=1100,height=800');
      if (!printWindow) {
        toast.error('Popup print diblokir browser. Izinkan popup untuk mencetak dokumen.');
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 150);
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                entryQuery.refetch();
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={14} />
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => navigate(`${listPath}/new`)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus size={14} />
              Tambah Dokumen
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  setSearch(searchInput.trim());
                }}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
            >
              <option value="mine">Dokumen Saya</option>
              <option value="review">Mode Review</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Tahun ajaran aktif: <span className="font-semibold">{activeAcademicYear?.name || '-'}</span>
            </div>
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
            Gagal memuat dokumen. Silakan muat ulang.
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-600" />
            <p className="text-sm text-gray-500">
              Belum ada dokumen {effectiveTitle.toLowerCase()} untuk filter yang dipilih.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((entry) => {
              const statusMeta = STATUS_META[entry.status] || STATUS_META.DRAFT;
              const isOwner = Number(entry.teacherId) === Number(user?.id || 0);
              const contextLabel = resolveEntryContextLabel(entry, assignmentLabelMap);
              const coveredClasses = extractCoveredClasses(entry);
              const showReviewActions = canReview && viewMode === 'review' && !isOwner;
              const canSubmit = isOwner && (entry.status === 'DRAFT' || entry.status === 'REJECTED');
              const canEdit = isOwner && entry.status !== 'APPROVED';
              const canDelete = isOwner && entry.status !== 'APPROVED';

              return (
                <div key={entry.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">{entry.title}</h3>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.pillClass}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      {entry.summary ? <p className="mt-1 text-sm text-gray-600">{entry.summary}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>Mapel & Tingkat: {contextLabel}</span>
                        {coveredClasses.length > 0 ? (
                          <span>
                            Cakupan: {coveredClasses.length} rombel ({coveredClasses.join(', ')})
                          </span>
                        ) : null}
                        <span>Guru: {entry.teacher?.name || '-'}</span>
                        <span>Diperbarui: {formatDateTime(entry.updatedAt)}</span>
                      </div>
                      {entry.reviewNote ? (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                          Catatan review: {entry.reviewNote}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePrintEntry(entry)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Printer size={12} />
                        Print
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(entry)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Edit
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
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                          Hapus
                        </button>
                      ) : null}
                      {canSubmit ? (
                        <button
                          type="button"
                          onClick={() => submitMutation.mutate(entry.id)}
                          disabled={submitMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <Send size={12} />
                          Kirim Review
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
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            Setujui
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
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            Revisi
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
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
        <div className={isPageEditor ? 'space-y-4' : 'fixed inset-0 z-[1400] flex items-center justify-center bg-black/40 px-4 py-6'}>
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
                  {editingEntry ? `Edit Dokumen ${effectiveTitle}` : `Tambah Dokumen ${effectiveTitle}`}
                </h3>
                <p className="text-sm text-gray-500">{effectiveTitle}</p>
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
                <input
                  value={entryTitle}
                  onChange={(event) => setEntryTitle(event.target.value)}
                  placeholder={activeProgramMeta?.schema?.titleHint || 'Masukkan judul dokumen...'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Ringkasan</label>
                <textarea
                  rows={2}
                  value={entrySummary}
                  onChange={(event) => setEntrySummary(event.target.value)}
                  placeholder={activeProgramMeta?.schema?.summaryHint || 'Ringkasan singkat dokumen...'}
                  className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
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
                        const minRowCount = getMinimumRowCount(section);
                        return (
                          <>
                            <div className="mb-2 flex items-center justify-between">
                              <div>
                                <p className="text-xs font-medium text-gray-500">
                                  {usesSheetTemplate
                                    ? sectionSchema?.label || section.title || `Bagian ${index + 1}`
                                    : `Bagian ${index + 1}`}
                                </p>
                                {sectionSchema?.description ? (
                                  <p className="mt-0.5 text-[11px] text-gray-400">{sectionSchema.description}</p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
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
                            </div>

                            {usesSheetTemplate && tableMode && visibleSectionColumns.length > 0 ? (
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

                            {canEditSectionTitle(section) ? (
                              <input
                                value={section.title}
                                onChange={(event) => updateSectionField(section.id, 'title', event.target.value)}
                                placeholder={sectionSchema?.titlePlaceholder || 'Judul bagian'}
                                className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            ) : (
                              <div className="mb-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                                {section.title || sectionSchema?.label || `Bagian ${index + 1}`}
                              </div>
                            )}

                            {tableMode ? (
                              isSingleRowSheetForm(section) ? (
                                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                    {sectionColumns.map((column) => {
                                      const row = section.rows[0];
                                      const columnKey = String(column.key || '').trim();
                                      if (columnKey.toLowerCase() === 'tahun_ajaran') return null;
                                      const value = String(row?.values?.[column.key] || '');
                                      const isWeekColumn = isWeekColumnKey(columnKey);
                                      const isKktpCriteriaColumn = isKktpCriteriaColumnKey(columnKey);
                                      const isChecked = isTruthyMark(value);
                                      return (
                                        <label key={`${section.id}-${column.key}`} className="space-y-1">
                                          <span className="block text-[11px] font-semibold text-gray-500">
                                            {column.label}
                                          </span>
                                          {isWeekColumn ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                row?.id ? toggleSectionRowMark(section.id, row.id, columnKey) : null
                                              }
                                              className={`inline-flex h-9 w-full items-center justify-center rounded-md border text-xs font-semibold transition ${
                                                isChecked
                                                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                                  : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                                              }`}
                                            >
                                              {isChecked ? MARK_VALUE : '-'}
                                            </button>
                                          ) : isKktpCriteriaColumn ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                row?.id
                                                  ? toggleKktpCriteria(
                                                      section.id,
                                                      row.id,
                                                      columnKey as 'kurang_memadai' | 'memadai',
                                                    )
                                                  : null
                                              }
                                              className={`inline-flex h-9 w-full items-center justify-center rounded-md border text-xs font-semibold transition ${
                                                isChecked
                                                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                                                  : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                                              }`}
                                            >
                                              {isChecked ? MARK_VALUE : '-'}
                                            </button>
                                          ) : column.multiline ? (
                                            <textarea
                                              rows={2}
                                              value={value}
                                              onChange={(event) =>
                                                updateSectionRowCell(
                                                  section.id,
                                                  row?.id || '',
                                                  column.key,
                                                  event.target.value,
                                                )
                                              }
                                              placeholder={column.placeholder || ''}
                                              className="w-full resize-y rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                                            />
                                          ) : (
                                            <input
                                              value={value}
                                              onChange={(event) =>
                                                updateSectionRowCell(
                                                  section.id,
                                                  row?.id || '',
                                                  column.key,
                                                  event.target.value,
                                                )
                                              }
                                              placeholder={column.placeholder || ''}
                                              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                                            />
                                          )}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="overflow-x-auto rounded-md border border-gray-200">
                                    <table className="min-w-max text-xs">
                                      <thead className="bg-gray-50">
                                          <tr>
                                          {visibleSectionColumns.map((column) => (
                                            <th
                                              key={column.key}
                                              className={`whitespace-nowrap border-b border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600 ${getColumnWidthClass(column.key, Boolean(column.multiline))}`}
                                            >
                                              {column.label}
                                            </th>
                                          ))}
                                          <th className="sticky right-0 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-right font-semibold text-gray-600">
                                            Aksi
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {section.rows.map((row, rowIndex) => (
                                          <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                                            {visibleSectionColumns.map((column) => (
                                              (() => {
                                                const columnKey = String(column.key || '').trim();
                                                const value = String(row.values[column.key] || '');
                                                const isWeekColumn = isWeekColumnKey(columnKey);
                                                const isKktpCriteriaColumn = isKktpCriteriaColumnKey(columnKey);
                                                const isChecked = isTruthyMark(value);
                                                return (
                                                  <td
                                                    key={`${row.id}-${column.key}`}
                                                    className={`px-2 py-1.5 align-top ${getColumnWidthClass(column.key, Boolean(column.multiline))}`}
                                                  >
                                                    {isWeekColumn ? (
                                                      <button
                                                        type="button"
                                                        onClick={() => toggleSectionRowMark(section.id, row.id, columnKey)}
                                                        className={`inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition ${
                                                          isChecked
                                                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                                                        }`}
                                                      >
                                                        {isChecked ? MARK_VALUE : '-'}
                                                      </button>
                                                    ) : isKktpCriteriaColumn ? (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          toggleKktpCriteria(
                                                            section.id,
                                                            row.id,
                                                            columnKey as 'kurang_memadai' | 'memadai',
                                                          )
                                                        }
                                                        className={`inline-flex h-8 w-full items-center justify-center rounded-md border text-xs font-semibold transition ${
                                                          isChecked
                                                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                                                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                                                        }`}
                                                      >
                                                        {isChecked ? MARK_VALUE : '-'}
                                                      </button>
                                                    ) : column.multiline ? (
                                                      <textarea
                                                        rows={2}
                                                        value={value}
                                                        onChange={(event) =>
                                                          updateSectionRowCell(
                                                            section.id,
                                                            row.id,
                                                            column.key,
                                                            event.target.value,
                                                          )
                                                        }
                                                        placeholder={column.placeholder || ''}
                                                        className="w-full resize-y rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                                                      />
                                                    ) : (
                                                      <input
                                                        value={value}
                                                        onChange={(event) =>
                                                          updateSectionRowCell(
                                                            section.id,
                                                            row.id,
                                                            column.key,
                                                            event.target.value,
                                                          )
                                                        }
                                                        placeholder={column.placeholder || ''}
                                                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                                                      />
                                                    )}
                                                  </td>
                                                );
                                              })()
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
                                rows={4}
                                value={section.body}
                                onChange={(event) => updateSectionField(section.id, 'body', event.target.value)}
                                placeholder={sectionSchema?.bodyPlaceholder || 'Isi bagian dokumen...'}
                                className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                    rows={2}
                    value={entryNotes}
                    onChange={(event) => setEntryNotes(event.target.value)}
                    placeholder="Catatan tambahan (opsional)..."
                    className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                {isSaving ? 'Menyimpan...' : 'Simpan Dokumen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LearningResourceGenerator;
