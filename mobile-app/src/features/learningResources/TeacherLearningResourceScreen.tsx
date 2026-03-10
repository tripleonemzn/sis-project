import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
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
import { learningResourcesApi } from './learningResourcesApi';
import { CpTpAnalysisItem, LearningResourceSection } from './types';

type SectionConfig = {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  isWebPlaceholder?: boolean;
};

const SECTION_CONFIG: Record<LearningResourceSection, SectionConfig> = {
  CP: {
    title: 'Perangkat Ajar CP',
    subtitle: 'Kelola analisis CP untuk konteks kelas dan mata pelajaran yang Anda ampu.',
    icon: 'book-open',
  },
  ATP: {
    title: 'Perangkat Ajar ATP',
    subtitle: 'Kelola alur tujuan pembelajaran berdasarkan konteks pengajaran aktif.',
    icon: 'map',
    isWebPlaceholder: true,
  },
  PROTA: {
    title: 'Program Tahunan',
    subtitle: 'Kelola perencanaan tahunan sesuai kelas, mata pelajaran, dan fase.',
    icon: 'calendar',
    isWebPlaceholder: true,
  },
  PROMES: {
    title: 'Program Semester',
    subtitle: 'Kelola perencanaan semester untuk distribusi capaian pembelajaran.',
    icon: 'clock',
    isWebPlaceholder: true,
  },
  MODULES: {
    title: 'Modul Ajar',
    subtitle: 'Kelola modul ajar dan bahan ajar untuk kebutuhan pembelajaran.',
    icon: 'file-text',
    isWebPlaceholder: true,
  },
  KKTP: {
    title: 'KKTP',
    subtitle: 'Kelola kriteria ketercapaian tujuan pembelajaran pada konteks mengajar Anda.',
    icon: 'check-square',
    isWebPlaceholder: true,
  },
};

const SECTION_LINKS: Array<{
  section: LearningResourceSection;
  route: string;
  label: string;
}> = [
  { section: 'CP', route: '/teacher/learning-cp', label: 'CP' },
  { section: 'ATP', route: '/teacher/learning-atp', label: 'ATP' },
  { section: 'PROTA', route: '/teacher/learning-prota', label: 'Prota' },
  { section: 'PROMES', route: '/teacher/learning-promes', label: 'Promes' },
  { section: 'MODULES', route: '/teacher/learning-modules', label: 'Modul' },
  { section: 'KKTP', route: '/teacher/learning-kktp', label: 'KKTP' },
];

type CpAnalysisItemDraft = {
  id: string;
  competency: string;
  material: string;
  tp: string;
  profiles: string[];
};

type CpAnalysisRowDraft = {
  id: string;
  element: string;
  cpText: string;
  items: CpAnalysisItemDraft[];
};

const PROFILE_DIMENSIONS = [
  'Beriman & Berakhlak Mulia',
  'Berkebinekaan Global',
  'Gotong Royong',
  'Mandiri',
  'Bernalar Kritis',
  'Kreatif',
];

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

function getDefaultTitimangsa() {
  return new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function toSectionLevel(level?: string | null) {
  if (!level) return '';
  const normalized = String(level).trim().toUpperCase();
  if (normalized === '10') return 'X';
  if (normalized === '11') return 'XI';
  if (normalized === '12') return 'XII';
  return normalized;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function capitalize(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function normalizeCpRows(rawContent: CpTpAnalysisItem[] | null | undefined): CpAnalysisRowDraft[] {
  if (!Array.isArray(rawContent)) return [];
  return rawContent.map((row, rowIndex) => {
    const itemsRaw = Array.isArray(row?.items) ? row.items : [];
    return {
      id: row?.id || createId(`row-${rowIndex + 1}`),
      element: typeof row?.element === 'string' ? row.element : '',
      cpText: typeof row?.cpText === 'string' ? row.cpText : '',
      items: itemsRaw.map((item, itemIndex) => ({
        id: item?.id || createId(`item-${rowIndex + 1}-${itemIndex + 1}`),
        competency: typeof item?.competency === 'string' ? item.competency : '',
        material: typeof item?.material === 'string' ? item.material : '',
        tp: typeof item?.tp === 'string' ? item.tp : '',
        profiles: Array.isArray(item?.profiles)
          ? item.profiles.map((profile) => String(profile)).filter((profile) => profile.trim().length > 0)
          : [],
      })),
    };
  });
}

function toPayloadRows(rows: CpAnalysisRowDraft[]): CpTpAnalysisItem[] {
  return rows.map((row) => ({
    id: row.id,
    element: row.element.trim(),
    cpText: row.cpText.trim(),
    items: row.items.map((item) => ({
      id: item.id,
      competency: item.competency.trim(),
      material: item.material.trim(),
      tp: item.tp.trim(),
      profiles: item.profiles,
    })),
  }));
}

function SectionChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

export function TeacherLearningResourceScreen({ section }: { section: LearningResourceSection }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const config = SECTION_CONFIG[section];
  const isCpSection = section === 'CP';

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [cpRows, setCpRows] = useState<CpAnalysisRowDraft[]>([]);
  const [cpElement, setCpElement] = useState('');
  const [cpText, setCpText] = useState('');
  const [cpItems, setCpItems] = useState<CpAnalysisItemDraft[]>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [principalName, setPrincipalName] = useState('');
  const [titimangsa, setTitimangsa] = useState(getDefaultTitimangsa());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-learning-active-year'],
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
    () => assignmentsQuery.data?.assignments ?? [],
    [assignmentsQuery.data?.assignments],
  );
  const relevantAssignments = useMemo(() => {
    if (!activeYearQuery.data?.id) return assignments;
    return assignments.filter((item) => Number(item.academicYear.id) === Number(activeYearQuery.data?.id));
  }, [assignments, activeYearQuery.data?.id]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!relevantAssignments.length) {
      setSelectedAssignmentId(null);
      return;
    }
    if (selectedAssignmentId && relevantAssignments.some((item) => item.id === selectedAssignmentId)) return;
    setSelectedAssignmentId(relevantAssignments[0].id);
  }, [relevantAssignments, selectedAssignmentId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedAssignment = relevantAssignments.find((item) => item.id === selectedAssignmentId) || null;

  const cpStatusQueryKey = useMemo(
    () => [
      'mobile-learning-cp-status',
      user?.id,
      selectedAssignment?.subject.id,
      selectedAssignment?.class.level,
      activeYearQuery.data?.id,
    ],
    [user?.id, selectedAssignment?.subject.id, selectedAssignment?.class.level, activeYearQuery.data?.id],
  );

  const cpStatusQuery = useQuery({
    queryKey: cpStatusQueryKey,
    enabled:
      isAuthenticated &&
      user?.role === 'TEACHER' &&
      isCpSection &&
      !!selectedAssignment &&
      !!activeYearQuery.data?.id,
    queryFn: async () =>
      learningResourcesApi.getCpTpAnalysis({
        teacherId: Number(user!.id),
        subjectId: Number(selectedAssignment!.subject.id),
        level: toSectionLevel(selectedAssignment!.class.level),
        academicYearId: Number(activeYearQuery.data!.id),
      }),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isCpSection) return;
    if (cpStatusQuery.isFetching) return;
    const record = cpStatusQuery.data;
    if (!record) {
      setCpRows([]);
      setPrincipalName('');
      setTitimangsa(getDefaultTitimangsa());
      setLastSavedAt(null);
      setCpElement('');
      setCpText('');
      setCpItems([]);
      setEditingRowId(null);
      return;
    }
    setCpRows(normalizeCpRows(record.content));
    setPrincipalName(record.principalName || '');
    setTitimangsa(record.titimangsa || getDefaultTitimangsa());
    setLastSavedAt(record.updatedAt || null);
    setCpElement('');
    setCpText('');
    setCpItems([]);
    setEditingRowId(null);
  }, [isCpSection, cpStatusQuery.data, cpStatusQuery.isFetching]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const cpSummary = useMemo(
    () => ({
      hasData: cpRows.length > 0,
      rows: cpRows.length,
      updatedAt: lastSavedAt || cpStatusQuery.data?.updatedAt || null,
      principalName: principalName || cpStatusQuery.data?.principalName || null,
    }),
    [cpRows.length, cpStatusQuery.data?.principalName, cpStatusQuery.data?.updatedAt, lastSavedAt, principalName],
  );

  type SaveCpMutationInput = {
    rows: CpAnalysisRowDraft[];
    principalName: string;
    titimangsa: string;
    successMessage?: string;
    silent?: boolean;
  };

  const saveCpMutation = useMutation({
    mutationFn: async (variables: SaveCpMutationInput) => {
      if (!selectedAssignment || !activeYearQuery.data?.id || !user?.id) {
        throw new Error('Konteks assignment belum siap.');
      }
      return learningResourcesApi.saveCpTpAnalysis({
        teacherId: Number(user.id),
        subjectId: Number(selectedAssignment.subject.id),
        level: toSectionLevel(selectedAssignment.class.level),
        academicYearId: Number(activeYearQuery.data.id),
        content: toPayloadRows(variables.rows),
        principalName: variables.principalName.trim() || undefined,
        titimangsa: variables.titimangsa.trim() || undefined,
      });
    },
    onSuccess: (savedRecord, variables) => {
      queryClient.setQueryData(cpStatusQueryKey, savedRecord || null);
      queryClient.invalidateQueries({ queryKey: ['mobile-learning-cp-status'] });
      setLastSavedAt(savedRecord?.updatedAt || new Date().toISOString());
      if (!variables.silent && variables.successMessage) {
        notifySuccess(variables.successMessage);
      }
    },
    onError: (error, variables) => {
      if (!variables.silent) {
        notifyApiError(error, 'Gagal menyimpan dokumen CP.');
      }
    },
  });

  const resetEditor = () => {
    setCpElement('');
    setCpText('');
    setCpItems([]);
    setEditingRowId(null);
  };

  const persistCpRows = async (
    rows: CpAnalysisRowDraft[],
    options?: {
      successMessage?: string;
      principalNameOverride?: string;
      titimangsaOverride?: string;
      silent?: boolean;
    },
  ) => {
    if (!selectedAssignment || !activeYearQuery.data?.id || !user?.id) {
      if (!options?.silent) {
        notifyInfo('Pilih assignment mapel aktif sebelum menyimpan.');
      }
      return false;
    }
    try {
      await saveCpMutation.mutateAsync({
        rows,
        principalName: options?.principalNameOverride ?? principalName,
        titimangsa: options?.titimangsaOverride ?? titimangsa,
        successMessage: options?.successMessage,
        silent: options?.silent,
      });
      setCpRows(rows);
      return true;
    } catch {
      return false;
    }
  };

  const analyzeCpText = () => {
    if (!cpText.trim()) {
      notifyInfo('Isi teks CP terlebih dahulu.');
      return;
    }
    const segments = cpText
      .split(/[.;\n]+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 10);
    const source = segments.length ? segments : [cpText.trim()];
    const nextItems = source.map((sentence, index) => {
      const cleaned = sentence.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const words = cleaned.split(' ').filter(Boolean);
      const competency = words[0] || 'Memahami';
      const material = words.slice(1, 6).join(' ') || 'Materi esensial';
      return {
        id: createId('cp-item'),
        competency,
        material,
        tp: `${cpRows.length + 1}.${index + 1} ${capitalize(competency)} ${material}`.trim(),
        profiles: ['Bernalar Kritis', 'Mandiri'],
      };
    });
    setCpItems(nextItems);
  };

  const addCpItem = () => {
    setCpItems((prev) => [
      ...prev,
      {
        id: createId('cp-item'),
        competency: '',
        material: '',
        tp: '',
        profiles: [],
      },
    ]);
  };

  const updateCpItem = (itemId: string, field: 'competency' | 'material' | 'tp', value: string) => {
    setCpItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
  };

  const toggleCpItemProfile = (itemId: string, profile: string) => {
    setCpItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const exists = item.profiles.includes(profile);
        return {
          ...item,
          profiles: exists ? item.profiles.filter((value) => value !== profile) : [...item.profiles, profile],
        };
      }),
    );
  };

  const removeCpItem = (itemId: string) => {
    setCpItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const saveCpRow = async () => {
    if (!selectedAssignment) {
      notifyInfo('Pilih assignment mapel terlebih dahulu.');
      return;
    }
    if (!cpElement.trim()) {
      notifyInfo('Elemen CP wajib diisi.');
      return;
    }
    if (!cpText.trim()) {
      notifyInfo('Teks CP wajib diisi.');
      return;
    }
    const sanitizedItems = cpItems
      .map((item) => ({
        ...item,
        competency: item.competency.trim(),
        material: item.material.trim(),
        tp: item.tp.trim(),
      }))
      .filter((item) => item.competency || item.material || item.tp);
    if (!sanitizedItems.length) {
      notifyInfo('Minimal isi 1 item analisis tujuan pembelajaran.');
      return;
    }

    const nextRow: CpAnalysisRowDraft = {
      id: editingRowId || createId('cp-row'),
      element: cpElement.trim(),
      cpText: cpText.trim(),
      items: sanitizedItems.map((item) => ({
        ...item,
        profiles: item.profiles.filter((profile) => profile.trim().length > 0),
      })),
    };
    const nextRows = editingRowId ? cpRows.map((row) => (row.id === editingRowId ? nextRow : row)) : [...cpRows, nextRow];
    const success = await persistCpRows(nextRows, {
      successMessage: editingRowId ? 'Baris analisis CP berhasil diperbarui.' : 'Baris analisis CP berhasil ditambahkan.',
    });
    if (!success) return;
    resetEditor();
  };

  const editCpRow = (row: CpAnalysisRowDraft) => {
    setCpElement(row.element);
    setCpText(row.cpText);
    setCpItems(
      row.items.map((item) => ({
        id: item.id || createId('cp-item'),
        competency: item.competency || '',
        material: item.material || '',
        tp: item.tp || '',
        profiles: item.profiles || [],
      })),
    );
    setEditingRowId(row.id);
  };

  const deleteCpRow = (row: CpAnalysisRowDraft) => {
    Alert.alert('Hapus Baris Analisis', `Hapus baris "${row.element}" dari dokumen CP?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const nextRows = cpRows.filter((item) => item.id !== row.id);
            const success = await persistCpRows(nextRows, {
              successMessage: 'Baris analisis CP berhasil dihapus.',
            });
            if (!success) return;
            if (editingRowId === row.id) {
              resetEditor();
            }
          })();
        },
      },
    ]);
  };

  const saveDocumentMetadata = async () => {
    const success = await persistCpRows(cpRows, {
      principalNameOverride: principalName,
      titimangsaOverride: titimangsa,
      successMessage: 'Metadata dokumen CP berhasil disimpan.',
    });
    if (!success) return;
    if (!principalName.trim()) {
      notifyInfo('Nama kepala sekolah kosong, dokumen tersimpan tanpa penandatangan.');
    }
  };

  if (isLoading) return <AppLoadingScreen message="Memuat perangkat ajar..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{config.title}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || assignmentsQuery.isFetching || (isCpSection && cpStatusQuery.isFetching)}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void assignmentsQuery.refetch();
            if (isCpSection) {
              void cpStatusQuery.refetch();
            }
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
          <Feather name={config.icon} size={18} color="#e2e8f0" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{config.title}</Text>
          <Text style={{ color: '#dbeafe', marginTop: 2 }}>{config.subtitle}</Text>
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SECTION_LINKS.map((item) => (
            <SectionChip
              key={item.section}
              active={item.section === section}
              label={item.label}
              onPress={() => {
                if (item.section === section) return;
                router.replace(item.route as never);
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title="Assignment Aktif"
            value={String(relevantAssignments.length)}
            subtitle={activeYearQuery.data?.name || 'Tahun ajaran'}
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title={isCpSection ? 'Status CP' : 'Status Modul'}
            value={isCpSection ? (cpSummary.hasData ? 'Tersimpan' : 'Belum Ada') : 'Sama Web'}
            subtitle={isCpSection ? `Baris analisis ${cpSummary.rows}` : 'Web saat ini masih tahap pengembangan'}
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <SummaryCard
            title="Update Terakhir"
            value={isCpSection ? (cpSummary.updatedAt ? 'Ada Data' : '-') : 'Coming Soon'}
            subtitle={isCpSection ? formatDateTime(cpSummary.updatedAt) : 'Rilis bersamaan dengan modul web'}
          />
        </View>
      </View>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat assignment guru..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat assignment guru."
          onRetry={() => {
            void assignmentsQuery.refetch();
          }}
        />
      ) : null}

      {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
        relevantAssignments.length > 0 ? (
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Kelas dan Mata Pelajaran</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {relevantAssignments.map((assignment) => {
                const selected = assignment.id === selectedAssignmentId;
                return (
                  <View key={assignment.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setSelectedAssignmentId(assignment.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {assignment.class.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {assignment.subject.name}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Belum ada assignment aktif
            </Text>
            <Text style={{ color: '#64748b' }}>
              Assignment untuk tahun ajaran aktif belum tersedia. Silakan cek kembali setelah sinkronisasi data.
            </Text>
          </View>
        )
      ) : null}

      {selectedAssignment ? (
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
          <Text style={{ color: '#64748b', fontSize: 12 }}>Konteks Aktif</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>
            {selectedAssignment.subject.name} - {selectedAssignment.class.name}
          </Text>
          <Text style={{ color: '#64748b', marginTop: 2 }}>
            Level {selectedAssignment.class.level} • Semester {selectedAssignment.academicYear.semester || '-'}
          </Text>
          {isCpSection ? (
            <Text style={{ color: '#64748b', marginTop: 2 }}>
              Status analisis: {cpSummary.hasData ? 'Tersimpan' : 'Belum tersimpan'}
              {cpSummary.principalName ? ` • Penandatangan: ${cpSummary.principalName}` : ''}
            </Text>
          ) : (
            <Text style={{ color: '#64748b', marginTop: 2 }}>
              Pada versi web modul ini masih placeholder/coming soon. Mobile mengikuti status parity yang sama.
            </Text>
          )}
        </View>
      ) : null}

      {isCpSection && cpStatusQuery.isLoading ? <QueryStateView type="loading" message="Memuat dokumen CP..." /> : null}
      {isCpSection && cpStatusQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat dokumen CP."
          onRetry={() => {
            void cpStatusQuery.refetch();
          }}
        />
      ) : null}

      {isCpSection ? (
        <>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
              {editingRowId ? 'Edit Baris Analisis CP' : 'Tambah Baris Analisis CP'}
            </Text>
            <Text style={{ color: '#64748b', marginTop: 4, marginBottom: 10 }}>
              Isi elemen + teks CP, generate analisis otomatis, lalu simpan ke dokumen.
            </Text>

            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Elemen CP</Text>
            <TextInput
              value={cpElement}
              onChangeText={setCpElement}
              placeholder="Contoh: Numerasi, Literasi, Projek"
              placeholderTextColor="#94a3b8"
              style={INPUT_BASE_STYLE}
            />

            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 10 }}>Teks CP</Text>
            <TextInput
              value={cpText}
              onChangeText={setCpText}
              placeholder="Paste atau tulis capaian pembelajaran..."
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              style={[
                INPUT_BASE_STYLE,
                {
                  minHeight: 94,
                },
              ]}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={analyzeCpText}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#c7d8f6',
                  backgroundColor: '#eef4ff',
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Analisis Otomatis</Text>
              </Pressable>
              <Pressable
                onPress={addCpItem}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#c7d8f6',
                  backgroundColor: '#fff',
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>Tambah Item Manual</Text>
              </Pressable>
            </View>

            {cpItems.length ? (
              <View style={{ marginTop: 10 }}>
                {cpItems.map((item, index) => (
                  <View
                    key={item.id}
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
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Item {index + 1}</Text>
                      <Pressable onPress={() => removeCpItem(item.id)} hitSlop={8}>
                        <Feather name="trash-2" size={15} color="#b91c1c" />
                      </Pressable>
                    </View>

                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 3, marginTop: 8 }}>Kompetensi</Text>
                    <TextInput
                      value={item.competency}
                      onChangeText={(value) => updateCpItem(item.id, 'competency', value)}
                      placeholder="Contoh: Menganalisis"
                      placeholderTextColor="#94a3b8"
                      style={INPUT_BASE_STYLE}
                    />

                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 3, marginTop: 8 }}>Materi/Konten</Text>
                    <TextInput
                      value={item.material}
                      onChangeText={(value) => updateCpItem(item.id, 'material', value)}
                      placeholder="Materi inti dari CP"
                      placeholderTextColor="#94a3b8"
                      style={INPUT_BASE_STYLE}
                    />

                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 3, marginTop: 8 }}>Tujuan Pembelajaran</Text>
                    <TextInput
                      value={item.tp}
                      onChangeText={(value) => updateCpItem(item.id, 'tp', value)}
                      placeholder="Rumusan TP"
                      placeholderTextColor="#94a3b8"
                      multiline
                      textAlignVertical="top"
                      style={[
                        INPUT_BASE_STYLE,
                        {
                          minHeight: 72,
                        },
                      ]}
                    />

                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 8 }}>Profil Lulusan</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {PROFILE_DIMENSIONS.map((profile) => {
                        const selected = item.profiles.includes(profile);
                        return (
                          <Pressable
                            key={`${item.id}-${profile}`}
                            onPress={() => toggleCpItemProfile(item.id, profile)}
                            style={{
                              borderWidth: 1,
                              borderColor: selected ? BRAND_COLORS.blue : '#cbd5e1',
                              backgroundColor: selected ? '#e9f1ff' : '#fff',
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 6,
                            }}
                          >
                            <Text style={{ color: selected ? BRAND_COLORS.navy : '#475569', fontSize: 11, fontWeight: '600' }}>
                              {profile}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <Pressable
                onPress={resetEditor}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  backgroundColor: '#fff',
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#475569', fontWeight: '700' }}>Reset Draft</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void saveCpRow();
                }}
                disabled={saveCpMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor: saveCpMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {saveCpMutation.isPending
                    ? 'Menyimpan...'
                    : editingRowId
                      ? 'Perbarui ke Dokumen'
                      : 'Simpan ke Dokumen'}
                </Text>
              </Pressable>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Metadata Dokumen CP</Text>
            <Text style={{ color: '#64748b', marginTop: 4, marginBottom: 10 }}>
              Digunakan untuk informasi penandatangan dokumen hasil analisis.
            </Text>

            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Nama Kepala Sekolah</Text>
            <TextInput
              value={principalName}
              onChangeText={setPrincipalName}
              placeholder="Contoh: Budi Santoso, S.Pd"
              placeholderTextColor="#94a3b8"
              style={INPUT_BASE_STYLE}
            />

            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4, marginTop: 10 }}>Titimangsa</Text>
            <TextInput
              value={titimangsa}
              onChangeText={setTitimangsa}
              placeholder="Contoh: 21 Februari 2026"
              placeholderTextColor="#94a3b8"
              style={INPUT_BASE_STYLE}
            />

            <Pressable
              onPress={() => {
                void saveDocumentMetadata();
              }}
              disabled={saveCpMutation.isPending}
              style={{
                marginTop: 10,
                borderRadius: 10,
                backgroundColor: saveCpMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveCpMutation.isPending ? 'Menyimpan...' : 'Simpan Metadata Dokumen'}
              </Text>
            </Pressable>

            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
              Terakhir tersimpan: {cpSummary.updatedAt ? formatDateTime(cpSummary.updatedAt) : '-'}
            </Text>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Dokumen Analisis CP ({cpRows.length})
            </Text>

            {!cpRows.length ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Belum ada baris analisis.</Text>
                <Text style={{ color: '#64748b', marginTop: 4 }}>
                  Tambahkan elemen + teks CP, lalu simpan untuk membentuk dokumen.
                </Text>
              </View>
            ) : (
              cpRows.map((row, index) => (
                <View
                  key={row.id}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                    backgroundColor: '#f8fbff',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Baris {index + 1}</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable onPress={() => editCpRow(row)}>
                        <Text style={{ color: BRAND_COLORS.blue, fontWeight: '700' }}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteCpRow(row)}>
                        <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={{ color: '#334155', marginTop: 6 }}>
                    <Text style={{ fontWeight: '700' }}>Elemen:</Text> {row.element || '-'}
                  </Text>
                  <Text style={{ color: '#475569', marginTop: 4 }} numberOfLines={4}>
                    {row.cpText || '-'}
                  </Text>
                  <Text style={{ color: '#64748b', marginTop: 6, fontSize: 12 }}>Item Analisis: {row.items.length}</Text>
                  {row.items.slice(0, 3).map((item) => (
                    <View key={item.id} style={{ marginTop: 4 }}>
                      <Text style={{ color: '#0f172a', fontSize: 12, fontWeight: '600' }}>
                        • {item.tp || `${item.competency} ${item.material}`.trim() || 'TP belum diisi'}
                      </Text>
                    </View>
                  ))}
                  {row.items.length > 3 ? (
                    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>+{row.items.length - 3} item lainnya</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </>
      ) : (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderStyle: 'dashed',
            borderRadius: 12,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
            Status parity: {config.isWebPlaceholder ? 'Sama dengan web (placeholder)' : 'Siap'}
          </Text>
          <Text style={{ color: '#64748b', marginTop: 4 }}>
            Di web, modul {SECTION_LINKS.find((item) => item.section === section)?.label} belum final/masih coming soon.
            Mobile mengikuti status saat ini tanpa fallback ke web bridge.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
