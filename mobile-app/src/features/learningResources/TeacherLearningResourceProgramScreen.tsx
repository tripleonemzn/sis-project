import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../lib/ui/feedback';
import { academicYearApi } from '../academicYear/academicYearApi';
import { useAuth } from '../auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../teacherAssignments/useTeacherAssignmentsQuery';
import {
  teachingResourceProgramApi,
  TeachingResourceEntryItem,
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
  title: string;
  body: string;
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
  fontSize: 13,
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
  { code: 'PROTA', route: '/teacher/learning-prota', label: 'Prota' },
  { code: 'PROMES', route: '/teacher/learning-promes', label: 'Promes' },
  { code: 'MODUL_AJAR', route: '/teacher/learning-modules', label: 'Modul' },
  { code: 'KKTP', route: '/teacher/learning-kktp', label: 'KKTP' },
  { code: 'MATRIKS_SEBARAN', route: '/teacher/learning-matriks-sebaran', label: 'Matriks' },
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

function createSection(): EntrySectionDraft {
  return {
    id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    body: '',
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

function normalizeSectionsFromEntry(entry: TeachingResourceEntryItem): EntrySectionDraft[] {
  const rawSections = Array.isArray(entry.content?.sections) ? entry.content.sections : [];
  const parsed = rawSections
    .map((item, index) => ({
      id: `section-${entry.id}-${index + 1}`,
      title: String(item?.title || '').trim(),
      body: String(item?.body || '').trim(),
    }))
    .filter((item) => item.title || item.body);
  return parsed.length > 0 ? parsed : [createSection()];
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
  const [sections, setSections] = useState<EntrySectionDraft[]>([createSection()]);

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

  const assignments = useMemo(() => assignmentsQuery.data?.assignments ?? [], [assignmentsQuery.data?.assignments]);
  const relevantAssignments = useMemo(() => {
    if (!activeYearQuery.data?.id) return assignments;
    return assignments.filter((item) => Number(item.academicYear.id) === Number(activeYearQuery.data?.id));
  }, [assignments, activeYearQuery.data?.id]);

  useEffect(() => {
    if (!relevantAssignments.length) {
      setSelectedAssignmentId(null);
      return;
    }
    if (selectedAssignmentId && relevantAssignments.some((item) => item.id === selectedAssignmentId)) return;
    setSelectedAssignmentId(relevantAssignments[0].id);
  }, [relevantAssignments, selectedAssignmentId]);

  const selectedAssignment = relevantAssignments.find((item) => item.id === selectedAssignmentId) || null;

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
    const programs = programsQuery.data?.programs || [];
    return (
      programs.find((item) => normalizeProgramCode(item.code) === normalizedProgramCode) || null
    );
  }, [normalizedProgramCode, programsQuery.data?.programs]);

  const effectiveTitle = useMemo(() => {
    const value = String(activeProgram?.label || '').trim();
    return value || fallbackTitle;
  }, [activeProgram?.label, fallbackTitle]);

  const effectiveDescription = useMemo(() => {
    const value = String(activeProgram?.description || '').trim();
    return value || fallbackDescription;
  }, [activeProgram?.description, fallbackDescription]);

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

  const rows = entriesQuery.data?.rows || [];
  const total = Number(entriesQuery.data?.total || 0);
  const totalPages = Math.max(1, Number(entriesQuery.data?.totalPages || 1));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingEntry(null);
    setEntryTitle('');
    setEntrySummary('');
    setEntryNotes('');
    setEntryTags('');
    setSections([createSection()]);
  };

  const openCreateEditor = () => {
    setEditingEntry(null);
    setEntryTitle('');
    setEntrySummary('');
    setEntryNotes('');
    setEntryTags('');
    setSections([createSection()]);
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
    setSections(normalizeSectionsFromEntry(entry));
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
        .map((item) => ({
          title: String(item.title || '').trim(),
          body: String(item.body || '').trim(),
        }))
        .filter((item) => item.title || item.body);

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
        .map((item) => ({
          title: String(item.title || '').trim(),
          body: String(item.body || '').trim(),
        }))
        .filter((item) => item.title || item.body);

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

  const addSection = () => {
    setSections((prev) => [...prev, createSection()]);
  };

  const updateSection = (id: string, field: 'title' | 'body', value: string) => {
    setSections((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
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
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{effectiveTitle}</Text>
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
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{effectiveTitle}</Text>
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {PROGRAM_NAVIGATION.map((item) => {
              const active = normalizeProgramCode(item.code) === normalizedProgramCode;
              return (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    if (active) return;
                    router.replace(item.route as never);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                    backgroundColor: active ? '#e9f1ff' : '#fff',
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    marginRight: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {relevantAssignments.map((assignment) => {
                  const selected = assignment.id === selectedAssignmentId;
                  return (
                    <Pressable
                      key={assignment.id}
                      onPress={() => setSelectedAssignmentId(assignment.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 10,
                        marginRight: 8,
                        marginBottom: 8,
                        minWidth: '48%',
                      }}
                    >
                      <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {assignment.class.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {assignment.subject.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                  <Text style={{ color: active ? BRAND_COLORS.navy : '#64748b', fontWeight: '600', fontSize: 11 }}>
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
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>{entry.title}</Text>
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
                        <Text style={{ color: statusMeta.pillText, fontWeight: '700', fontSize: 11 }}>{statusMeta.label}</Text>
                      </View>
                    </View>

                    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>Update: {formatDateTime(entry.updatedAt)}</Text>
                    {assignmentLabel ? <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{assignmentLabel}</Text> : null}

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
              Halaman {page}/{totalPages} • Total {total} dokumen
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <Pressable
                onPress={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: page <= 1 ? '#f8fafc' : '#fff',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  marginRight: 8,
                  opacity: page <= 1 ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '600' }}>Prev</Text>
              </Pressable>
              <Pressable
                onPress={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: page >= totalPages ? '#f8fafc' : '#fff',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  opacity: page >= totalPages ? 0.6 : 1,
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>
                {editingEntry ? 'Edit Dokumen' : 'Dokumen Baru'}
              </Text>
              <Pressable onPress={closeEditor} hitSlop={8}>
                <Feather name="x" size={18} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14 }}>
              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Judul Dokumen</Text>
              <TextInput
                value={entryTitle}
                onChangeText={setEntryTitle}
                placeholder="Contoh: ATP Semester Genap XII"
                placeholderTextColor="#94a3b8"
                style={INPUT_BASE_STYLE}
              />

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 10 }}>Ringkasan</Text>
              <TextInput
                value={entrySummary}
                onChangeText={setEntrySummary}
                placeholder="Ringkasan dokumen"
                placeholderTextColor="#94a3b8"
                style={INPUT_BASE_STYLE}
              />

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 10 }}>Tag (pisahkan koma)</Text>
              <TextInput
                value={entryTags}
                onChangeText={setEntryTags}
                placeholder="cp, semester genap, fase f"
                placeholderTextColor="#94a3b8"
                style={INPUT_BASE_STYLE}
              />

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 10 }}>Catatan</Text>
              <TextInput
                value={entryNotes}
                onChangeText={setEntryNotes}
                placeholder="Catatan tambahan untuk reviewer"
                placeholderTextColor="#94a3b8"
                multiline
                textAlignVertical="top"
                style={[INPUT_BASE_STYLE, { minHeight: 72 }]}
              />

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
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Bagian {index + 1}</Text>
                      <Pressable onPress={() => removeSection(section.id)} hitSlop={8}>
                        <Feather name="trash-2" size={15} color="#b91c1c" />
                      </Pressable>
                    </View>

                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 8 }}>Judul Bagian</Text>
                    <TextInput
                      value={section.title}
                      onChangeText={(value) => updateSection(section.id, 'title', value)}
                      placeholder="Judul bagian"
                      placeholderTextColor="#94a3b8"
                      style={INPUT_BASE_STYLE}
                    />

                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 8 }}>Isi</Text>
                    <TextInput
                      value={section.body}
                      onChangeText={(value) => updateSection(section.id, 'body', value)}
                      placeholder="Isi konten bagian"
                      placeholderTextColor="#94a3b8"
                      multiline
                      textAlignVertical="top"
                      style={[INPUT_BASE_STYLE, { minHeight: 92 }]}
                    />
                  </View>
                ))}

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
