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
import {
  buildTeacherAssignmentOptionLabel,
  filterRegularTeacherAssignments,
} from '../teacherAssignments/utils';
import {
  teachingResourceProgramApi,
  TeachingResourceEntryItem,
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
  rows: Array<{
    id: string;
    values: Record<string, string>;
  }>;
};

type StatusFilter = 'ALL' | TeachingResourceEntryStatus;

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
  { key: 'ALL', label: 'Semua' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SUBMITTED', label: 'Submit' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Revisi' },
];

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

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

function buildAutoSheetTitle(params: {
  programLabel: string;
  assignment: TeacherAssignment | null;
  academicYearName: string;
  semesterLabel: string;
}): string {
  const parts = [
    String(params.programLabel || '').trim(),
    String(params.assignment?.subject?.name || '').trim(),
    String(params.assignment?.class?.name || '').trim(),
    String(params.academicYearName || '').trim(),
    String(params.semesterLabel || '').trim(),
  ].filter(Boolean);
  return parts.join(' - ');
}

function hydrateSheetSections(params: {
  sections: EntrySectionDraft[];
  schemaMap: Map<string, TeachingResourceProgramSectionSchema>;
  assignment: TeacherAssignment | null;
  academicYearName: string;
  semesterLabel: string;
}): EntrySectionDraft[] {
  const mapel = String(params.assignment?.subject?.name || '').trim();
  const tingkat = normalizeClassLevel(params.assignment?.class?.level);
  const programKeahlian = String(params.assignment?.class?.major?.name || '').trim();
  const tahunAjaran = String(params.academicYearName || '').trim();
  const semester = String(params.semesterLabel || '').trim();
  const guruMapel = String(params.assignment?.teacher?.name || '').trim();
  const tempatTanggal = `Bekasi, ${formatLongDate(new Date())}`;

  const setIfBlank = (target: Record<string, string>, key: string, value: string) => {
    if (!key || !value) return;
    if (!String(target[key] || '').trim()) {
      target[key] = value;
    }
  };

  return params.sections.map((section) => {
    const schema = params.schemaMap.get(String(section.schemaKey || '').trim());
    if (!schema || (schema.editorType || 'TEXT') !== 'TABLE') return section;
    const columns = Array.isArray(schema.columns) ? schema.columns : [];
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
              return {
                id: `row-${entry.id}-${index + 1}-${rowIndex + 1}`,
                values,
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

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
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
  const assignmentOptions = useMemo(
    () =>
      relevantAssignments.map((assignment) => ({
        value: String(assignment.id),
        label: buildTeacherAssignmentOptionLabel(assignment),
      })),
    [relevantAssignments],
  );

  const effectiveSelectedAssignmentId = useMemo(() => {
    if (!relevantAssignments.length) return null;
    if (selectedAssignmentId && relevantAssignments.some((item) => item.id === selectedAssignmentId)) {
      return selectedAssignmentId;
    }
    return relevantAssignments[0]?.id || null;
  }, [relevantAssignments, selectedAssignmentId]);

  const selectedAssignment =
    relevantAssignments.find((item) => item.id === effectiveSelectedAssignmentId) || null;
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

  const rows = ensureArray<TeachingResourceEntryItem>(entriesQuery.data?.rows);
  const total = Number(entriesQuery.data?.total || 0);
  const totalPages = Math.max(1, Number(entriesQuery.data?.totalPages || 1));
  const currentPage = Math.min(page, totalPages);

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
    const defaultAssignmentId = usesSheetTemplate
      ? effectiveSelectedAssignmentId || relevantAssignments[0]?.id || null
      : effectiveSelectedAssignmentId;
    const assignment =
      relevantAssignments.find((item) => item.id === defaultAssignmentId) || null;
    const generatedSections = buildDefaultSections(activeProgramSchemaSections);
    const hydratedSections = usesSheetTemplate
      ? hydrateSheetSections({
          sections: generatedSections,
          schemaMap: activeProgramSchemaMap,
          assignment,
          academicYearName,
          semesterLabel: activeSemesterLabel,
        })
      : generatedSections;

    setEditingEntry(null);
    setEntryTitle(
      usesSheetTemplate
        ? buildAutoSheetTitle({
            programLabel: effectiveTitle,
            assignment,
            academicYearName,
            semesterLabel: activeSemesterLabel,
          })
        : '',
    );
    setEntrySummary('');
    setEntryNotes('');
    setEntryTags('');
    setSelectedAssignmentId(defaultAssignmentId);
    setSections(hydratedSections);
    setIsEditorOpen(true);
  };

  const openEditEditor = (entry: TeachingResourceEntryItem) => {
    const matchedAssignment =
      relevantAssignments.find(
        (item) =>
          Number(item.subject.id) === Number(entry.subjectId || 0) &&
          String(item.class.name || '').trim().toLowerCase() ===
            String(entry.className || '').trim().toLowerCase(),
      ) || null;

    setEditingEntry(entry);
    setEntryTitle(String(entry.title || ''));
    setEntrySummary(String(entry.summary || ''));
    setEntryNotes(String(entry.content?.notes || ''));
    setEntryTags((entry.tags || []).join(', '));
    setSections(normalizeSectionsFromEntry(entry, buildDefaultSections(activeProgramSchemaSections)));
    if (matchedAssignment) {
      setSelectedAssignmentId(matchedAssignment.id);
    }
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

      const normalizedSections = sections
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

      if (!normalizedSections.length) {
        throw new Error('Minimal 1 bagian isi dokumen wajib diisi.');
      }

      return teachingResourceProgramApi.createEntry({
        academicYearId: Number(activeYearQuery.data.id),
        programCode: normalizedProgramCode,
        title: entryTitle.trim(),
        summary: entrySummary.trim() || undefined,
        subjectId: selectedAssignment ? Number(selectedAssignment.subject.id) : undefined,
        classLevel: selectedAssignment ? normalizeClassLevel(selectedAssignment.class.level) : undefined,
        className: selectedAssignment ? selectedAssignment.class.name : undefined,
        tags: entryTags
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
        content: {
          sections: normalizedSections,
          notes: entryNotes.trim() || undefined,
          schemaVersion: Number(activeProgram?.schema?.version || 1),
          schemaSourceSheet: String(activeProgram?.schema?.sourceSheet || '').trim() || undefined,
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

      const normalizedSections = sections
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

      if (!normalizedSections.length) {
        throw new Error('Minimal 1 bagian isi dokumen wajib diisi.');
      }

      return teachingResourceProgramApi.updateEntry(Number(editingEntry.id), {
        title: entryTitle.trim(),
        summary: entrySummary.trim() || '',
        subjectId: selectedAssignment ? Number(selectedAssignment.subject.id) : null,
        classLevel: selectedAssignment ? normalizeClassLevel(selectedAssignment.class.level) : null,
        className: selectedAssignment ? selectedAssignment.class.name : null,
        tags: entryTags
          .split(',')
          .map((token) => token.trim())
          .filter(Boolean),
        content: {
          sections: normalizedSections,
          notes: entryNotes.trim() || undefined,
          schemaVersion: Number(activeProgram?.schema?.version || 1),
          schemaSourceSheet: String(activeProgram?.schema?.sourceSheet || '').trim() || undefined,
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
        return [...prev, createSection(repeatableSection, repeatableCount)];
      }
      if (activeProgramSchemaSections.length > 0) return prev;
      return [...prev, createSection(undefined, prev.length)];
    });
  };

  const updateSection = (id: string, field: 'title' | 'body', value: string) => {
    setSections((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const addSectionRow = (sectionId: string) => {
    setSections((prev) =>
      prev.map((item) => {
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
      }),
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

  const onSelectAssignment = (assignmentId: number | null) => {
    setSelectedAssignmentId(assignmentId);
    if (!isEditorOpen || Boolean(editingEntry) || !usesSheetTemplate) return;
    const nextAssignment = relevantAssignments.find((item) => item.id === assignmentId) || null;
    setEntryTitle(
      buildAutoSheetTitle({
        programLabel: effectiveTitle,
        assignment: nextAssignment,
        academicYearName,
        semesterLabel: activeSemesterLabel,
      }),
    );
    setSections((prev) =>
      hydrateSheetSections({
        sections: prev,
        schemaMap: activeProgramSchemaMap,
        assignment: nextAssignment,
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Konteks Kelas & Mata Pelajaran</Text>
            {relevantAssignments.length > 0 ? (
              <MobileSelectField
                value={effectiveSelectedAssignmentId ? String(effectiveSelectedAssignmentId) : ''}
                options={assignmentOptions}
                onChange={(next) => onSelectAssignment(next ? Number(next) : null)}
                placeholder="Pilih kelas & mata pelajaran"
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
                const assignmentLabel = [entry.className, entry.classLevel, entry.subjectId ? `Mapel#${entry.subjectId}` : '']
                  .filter(Boolean)
                  .join(' • ');
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
                    {assignmentLabel ? <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>{assignmentLabel}</Text> : null}

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
                        <Text style={{ color: canSubmit ? '#166534' : '#94a3b8', fontWeight: '700' }}>Kirim</Text>
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
                <Text style={{ color: '#334155', fontWeight: '600' }}>Prev</Text>
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
                <Text style={{ color: '#334155', fontWeight: '600' }}>Next</Text>
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
                          {(resolveSectionSchema(section)?.columns || []).map((column) => (
                            <View key={`${section.id}-single-${column.key}`} style={{ marginTop: 8 }}>
                              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>{column.label}</Text>
                              <TextInput
                                value={String(section.rows[0]?.values?.[column.key] || '')}
                                onChangeText={(value) =>
                                  updateSectionRow(
                                    section.id,
                                    String(section.rows[0]?.id || ''),
                                    column.key,
                                    value,
                                  )
                                }
                                placeholder={column.placeholder || ''}
                                placeholderTextColor="#94a3b8"
                                multiline={Boolean(column.multiline)}
                                textAlignVertical={column.multiline ? 'top' : 'center'}
                                style={[INPUT_BASE_STYLE, column.multiline ? { minHeight: 74 } : null]}
                              />
                            </View>
                          ))}
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
                              {(resolveSectionSchema(section)?.columns || []).map((column) => (
                                <View key={`${row.id}-${column.key}`} style={{ marginTop: 8 }}>
                                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>{column.label}</Text>
                                  <TextInput
                                    value={String(row.values[column.key] || '')}
                                    onChangeText={(value) => updateSectionRow(section.id, row.id, column.key, value)}
                                    placeholder={column.placeholder || ''}
                                    placeholderTextColor="#94a3b8"
                                    multiline={Boolean(column.multiline)}
                                    textAlignVertical={column.multiline ? 'top' : 'center'}
                                    style={[INPUT_BASE_STYLE, column.multiline ? { minHeight: 74 } : null]}
                                  />
                                </View>
                              ))}
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
