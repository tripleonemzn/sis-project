import { useCallback, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ENV } from '../../../src/config/env';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileMenuTab } from '../../../src/components/MobileMenuTab';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import {
  buildTeacherAssignmentOptionLabel,
  filterRegularTeacherAssignments,
} from '../../../src/features/teacherAssignments/utils';
import { teacherMaterialsApi } from '../../../src/features/teacherMaterials/teacherMaterialsApi';
import { TeacherAssignmentItem, TeacherMaterial } from '../../../src/features/teacherMaterials/types';
import { useTeacherMaterialsQuery } from '../../../src/features/teacherMaterials/useTeacherMaterialsQuery';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../../src/lib/ui/feedback';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';

type TabKey = 'materials' | 'assignments';
type CopySource = {
  type: 'material' | 'assignment';
  id: number;
  title: string;
  classId: number | null;
  classLevel: string | null;
  subjectId: number;
};
type DeleteTarget = {
  type: 'material' | 'assignment';
  id: number;
  title: string;
  submissionCount?: number;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function publishStyle(isPublished: boolean) {
  return isPublished
    ? { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Published' }
    : { bg: '#f1f5f9', border: '#cbd5e1', text: '#334155', label: 'Draft' };
}

function toIsoDateTime(date: string, time: string) {
  const normalizedDate = date.trim();
  const normalizedTime = time.trim() || '23:59';
  return `${normalizedDate}T${normalizedTime}:00.000Z`;
}

function toDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '23:59';
  return date.toISOString().slice(11, 16);
}

export default function TeacherMaterialsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const materialsQuery = useTeacherMaterialsQuery({ enabled: isAuthenticated, user });
  const [activeTab, setActiveTab] = useState<TabKey>('materials');
  const [search, setSearch] = useState('');
  const [filterAssignmentId, setFilterAssignmentId] = useState<number | null>(null);
  const [materialAssignmentId, setMaterialAssignmentId] = useState<number | null>(null);
  const [assignmentAssignmentId, setAssignmentAssignmentId] = useState<number | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<TeacherMaterial | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignmentItem | null>(null);
  const [copySource, setCopySource] = useState<CopySource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [selectedCopyClassIds, setSelectedCopyClassIds] = useState<number[]>([]);

  const [materialTitle, setMaterialTitle] = useState('');
  const [materialDescription, setMaterialDescription] = useState('');
  const [materialYoutube, setMaterialYoutube] = useState('');
  const [materialPublished, setMaterialPublished] = useState(false);
  const [materialFile, setMaterialFile] = useState<{ uri: string; name?: string; mimeType?: string } | null>(null);

  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentDueDate, setAssignmentDueDate] = useState('');
  const [assignmentDueTime, setAssignmentDueTime] = useState('23:59');
  const [assignmentAllowResubmit, setAssignmentAllowResubmit] = useState(false);
  const [assignmentMaxScore, setAssignmentMaxScore] = useState('100');
  const [assignmentPublished, setAssignmentPublished] = useState(false);
  const [assignmentFile, setAssignmentFile] = useState<{ uri: string; name?: string; mimeType?: string } | null>(null);

  const assignmentOptions = useMemo(
    () => filterRegularTeacherAssignments(teacherAssignmentsQuery.data?.assignments || []),
    [teacherAssignmentsQuery.data?.assignments],
  );
  const assignmentSelectOptions = useMemo(
    () =>
      assignmentOptions.map((item) => ({
        value: String(item.id),
        label: buildTeacherAssignmentOptionLabel(item),
      })),
    [assignmentOptions],
  );
  const filterSelectOptions = useMemo(
    () => [{ value: '', label: 'Semua kelas & mapel' }, ...assignmentSelectOptions],
    [assignmentSelectOptions],
  );

  const getPublicFileUrl = useCallback((fileUrl?: string | null) => {
    if (!fileUrl) return null;
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
    const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
    return fileUrl.startsWith('/') ? `${webBaseUrl}${fileUrl}` : `${webBaseUrl}/${fileUrl}`;
  }, []);

  const openAttachment = useCallback(
    (fileUrl?: string | null) => {
      const targetUrl = getPublicFileUrl(fileUrl);
      if (!targetUrl) {
        notifyInfo('File lampiran belum tersedia.', { title: 'Info Lampiran' });
        return;
      }
      openWebModuleRoute(router, {
        moduleKey: 'teacher-materials',
        webPath: targetUrl,
        label: 'Lampiran Materi & Tugas',
      });
    },
    [getPublicFileUrl, router],
  );

  const materialAssignmentSelectionId = useMemo(() => {
    if (assignmentOptions.length === 0) return null;
    if (materialAssignmentId && assignmentOptions.some((item) => item.id === materialAssignmentId)) {
      return materialAssignmentId;
    }
    return assignmentOptions[0].id;
  }, [assignmentOptions, materialAssignmentId]);
  const assignmentAssignmentSelectionId = useMemo(() => {
    if (assignmentOptions.length === 0) return null;
    if (assignmentAssignmentId && assignmentOptions.some((item) => item.id === assignmentAssignmentId)) {
      return assignmentAssignmentId;
    }
    return assignmentOptions[0].id;
  }, [assignmentAssignmentId, assignmentOptions]);

  const selectedMaterialAssignment =
    assignmentOptions.find((item) => item.id === materialAssignmentSelectionId) || null;
  const selectedAssignmentAssignment =
    assignmentOptions.find((item) => item.id === assignmentAssignmentSelectionId) || null;
  const selectedFilterAssignment = assignmentOptions.find((item) => item.id === filterAssignmentId) || null;

  const resolveAssignmentOption = useCallback(
    (classId: number | null | undefined, subjectId: number | null | undefined) => {
      if (!classId || !subjectId) return null;
      return assignmentOptions.find((item) => item.class.id === classId && item.subject.id === subjectId) || null;
    },
    [assignmentOptions],
  );

  const resetMaterialForm = useCallback(() => {
    setEditingMaterial(null);
    setMaterialTitle('');
    setMaterialDescription('');
    setMaterialYoutube('');
    setMaterialPublished(false);
    setMaterialFile(null);
  }, []);

  const resetAssignmentForm = useCallback(() => {
    setEditingAssignment(null);
    setAssignmentTitle('');
    setAssignmentDescription('');
    setAssignmentDueDate('');
    setAssignmentDueTime('23:59');
    setAssignmentAllowResubmit(false);
    setAssignmentMaxScore('100');
    setAssignmentPublished(false);
    setAssignmentFile(null);
  }, []);

  const openEditMaterial = useCallback(
    (item: TeacherMaterial) => {
      setActiveTab('materials');
      setEditingMaterial(item);
      setMaterialTitle(item.title);
      setMaterialDescription(item.description || '');
      setMaterialYoutube(item.youtubeUrl || '');
      setMaterialPublished(item.isPublished);
      setMaterialFile(null);
      const option = resolveAssignmentOption(item.class?.id, item.subject.id);
      if (option) setMaterialAssignmentId(option.id);
    },
    [resolveAssignmentOption],
  );

  const openEditAssignment = useCallback(
    (item: TeacherAssignmentItem) => {
      setActiveTab('assignments');
      setEditingAssignment(item);
      setAssignmentTitle(item.title);
      setAssignmentDescription(item.description || '');
      setAssignmentDueDate(toDateInput(item.dueDate));
      setAssignmentDueTime(toTimeInput(item.dueDate));
      setAssignmentAllowResubmit(item.allowResubmit);
      setAssignmentMaxScore(String(item.maxScore || 100));
      setAssignmentPublished(item.isPublished);
      setAssignmentFile(null);
      const option = resolveAssignmentOption(item.class?.id, item.subject.id);
      if (option) setAssignmentAssignmentId(option.id);
    },
    [resolveAssignmentOption],
  );

  const openCopyModal = useCallback((source: CopySource) => {
    setCopySource(source);
    setSelectedCopyClassIds([]);
  }, []);

  const copyTargetOptions = useMemo(() => {
    if (!copySource) return [];
    const filtered = assignmentOptions.filter((item) => {
      if (item.subject.id !== copySource.subjectId) return false;
      if (copySource.classLevel && item.class.level !== copySource.classLevel) return false;
      if (copySource.classId && item.class.id === copySource.classId) return false;
      return true;
    });
    const seenClassIds = new Set<number>();
    return filtered.filter((item) => {
      if (seenClassIds.has(item.class.id)) return false;
      seenClassIds.add(item.class.id);
      return true;
    });
  }, [assignmentOptions, copySource]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = materialsQuery.data?.materials || [];
    if (selectedFilterAssignment) {
      rows = rows.filter(
        (item) =>
          item.class?.id === selectedFilterAssignment.class.id &&
          item.subject.id === selectedFilterAssignment.subject.id,
      );
    }
    if (!q) return rows;
    return rows.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subject.name.toLowerCase().includes(q) ||
        (item.class?.name || '').toLowerCase().includes(q),
    );
  }, [materialsQuery.data?.materials, search, selectedFilterAssignment]);

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = materialsQuery.data?.assignments || [];
    if (selectedFilterAssignment) {
      rows = rows.filter(
        (item) =>
          item.class?.id === selectedFilterAssignment.class.id &&
          item.subject.id === selectedFilterAssignment.subject.id,
      );
    }
    if (!q) return rows;
    return rows.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subject.name.toLowerCase().includes(q) ||
        (item.class?.name || '').toLowerCase().includes(q),
    );
  }, [materialsQuery.data?.assignments, search, selectedFilterAssignment]);

  const createMaterialMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMaterialAssignment) throw new Error('Pilih assignment mapel terlebih dahulu.');
      if (!materialTitle.trim()) throw new Error('Judul materi wajib diisi.');

      return teacherMaterialsApi.createMaterial({
        title: materialTitle.trim(),
        description: materialDescription.trim() || undefined,
        classId: selectedMaterialAssignment.class.id,
        subjectId: selectedMaterialAssignment.subject.id,
        academicYearId: selectedMaterialAssignment.academicYear.id,
        youtubeUrl: materialYoutube.trim() || undefined,
        isPublished: materialPublished,
        file: materialFile,
      });
    },
    onSuccess: async () => {
      resetMaterialForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
      notifySuccess('Materi berhasil dibuat.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal membuat materi.');
    },
  });

  const updateMaterialMutation = useMutation({
    mutationFn: async () => {
      if (!editingMaterial) throw new Error('Data materi edit tidak ditemukan.');
      if (!selectedMaterialAssignment) throw new Error('Pilih assignment mapel terlebih dahulu.');
      if (!materialTitle.trim()) throw new Error('Judul materi wajib diisi.');

      return teacherMaterialsApi.updateMaterial({
        id: editingMaterial.id,
        title: materialTitle.trim(),
        description: materialDescription.trim(),
        classId: selectedMaterialAssignment.class.id,
        subjectId: selectedMaterialAssignment.subject.id,
        youtubeUrl: materialYoutube.trim(),
        isPublished: materialPublished,
        file: materialFile,
      });
    },
    onSuccess: async () => {
      resetMaterialForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
      notifySuccess('Materi berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memperbarui materi.');
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignmentAssignment) throw new Error('Pilih assignment mapel terlebih dahulu.');
      if (!assignmentTitle.trim()) throw new Error('Judul tugas wajib diisi.');
      if (!assignmentDueDate.trim()) throw new Error('Tanggal deadline wajib diisi (YYYY-MM-DD).');

      const maxScore = Number(assignmentMaxScore);
      if (Number.isNaN(maxScore) || maxScore < 1 || maxScore > 100) {
        throw new Error('Nilai maksimum harus antara 1 sampai 100.');
      }

      return teacherMaterialsApi.createAssignment({
        title: assignmentTitle.trim(),
        description: assignmentDescription.trim() || undefined,
        classId: selectedAssignmentAssignment.class.id,
        subjectId: selectedAssignmentAssignment.subject.id,
        academicYearId: selectedAssignmentAssignment.academicYear.id,
        dueDateIso: toIsoDateTime(assignmentDueDate, assignmentDueTime),
        allowResubmit: assignmentAllowResubmit,
        maxScore,
        isPublished: assignmentPublished,
        file: assignmentFile,
      });
    },
    onSuccess: async () => {
      resetAssignmentForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
      notifySuccess('Tugas berhasil dibuat.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal membuat tugas.');
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (!editingAssignment) throw new Error('Data tugas edit tidak ditemukan.');
      if (!selectedAssignmentAssignment) throw new Error('Pilih assignment mapel terlebih dahulu.');
      if (!assignmentTitle.trim()) throw new Error('Judul tugas wajib diisi.');
      if (!assignmentDueDate.trim()) throw new Error('Tanggal deadline wajib diisi (YYYY-MM-DD).');

      const maxScore = Number(assignmentMaxScore);
      if (Number.isNaN(maxScore) || maxScore < 1 || maxScore > 100) {
        throw new Error('Nilai maksimum harus antara 1 sampai 100.');
      }

      return teacherMaterialsApi.updateAssignment({
        id: editingAssignment.id,
        title: assignmentTitle.trim(),
        description: assignmentDescription.trim(),
        classId: selectedAssignmentAssignment.class.id,
        subjectId: selectedAssignmentAssignment.subject.id,
        dueDateIso: toIsoDateTime(assignmentDueDate, assignmentDueTime),
        allowResubmit: assignmentAllowResubmit,
        maxScore,
        isPublished: assignmentPublished,
        file: assignmentFile,
      });
    },
    onSuccess: async () => {
      resetAssignmentForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
      notifySuccess('Tugas berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memperbarui tugas.');
    },
  });

  const toggleMaterialPublishMutation = useMutation({
    mutationFn: async (item: TeacherMaterial) =>
      teacherMaterialsApi.updateMaterialPublish(item.id, !item.isPublished),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
    },
  });

  const toggleAssignmentPublishMutation = useMutation({
    mutationFn: async (item: TeacherAssignmentItem) =>
      teacherMaterialsApi.updateAssignmentPublish(item.id, !item.isPublished),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (id: number) => teacherMaterialsApi.deleteMaterial(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
      setDeleteTarget(null);
      notifySuccess('Materi berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus materi.');
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => teacherMaterialsApi.deleteAssignment(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
      setDeleteTarget(null);
      notifySuccess('Tugas berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus tugas.');
    },
  });

  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!copySource) throw new Error('Sumber data salin tidak ditemukan.');
      if (selectedCopyClassIds.length === 0) throw new Error('Pilih minimal 1 kelas tujuan.');

      if (copySource.type === 'material') {
        await teacherMaterialsApi.copyMaterial(copySource.id, selectedCopyClassIds);
      } else {
        await teacherMaterialsApi.copyAssignment(copySource.id, selectedCopyClassIds);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-materials', user?.id] });
      setCopySource(null);
      setSelectedCopyClassIds([]);
      notifySuccess('Data berhasil disalin ke kelas tujuan.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyalin data.');
    },
  });

  const isDeleting = deleteMaterialMutation.isPending || deleteAssignmentMutation.isPending;

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'material') {
      deleteMaterialMutation.mutate(deleteTarget.id);
      return;
    }
    deleteAssignmentMutation.mutate(deleteTarget.id);
  }, [deleteAssignmentMutation, deleteMaterialMutation, deleteTarget]);

  const pickMaterialFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || result.assets.length === 0) return;
    const file = result.assets[0];
    setMaterialFile({ uri: file.uri, name: file.name, mimeType: file.mimeType || undefined });
  };

  const pickAssignmentFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || result.assets.length === 0) return;
    const file = result.assets[0];
    setAssignmentFile({ uri: file.uri, name: file.name, mimeType: file.mimeType || undefined });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat materi & tugas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Materi & Tugas</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pageContentPadding}
        refreshControl={
          <RefreshControl
            refreshing={
              teacherAssignmentsQuery.isFetching || (materialsQuery.isFetching && !materialsQuery.isLoading)
            }
            onRefresh={async () => {
              await Promise.all([teacherAssignmentsQuery.refetch(), materialsQuery.refetch()]);
            }}
          />
        }
      >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Materi & Tugas</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Kelola materi dan tugas siswa langsung dari mobile.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <MobileMenuTab
          active={activeTab === 'materials'}
          label="Materi"
          onPress={() => setActiveTab('materials')}
          iconName="book-open"
          minWidth={110}
        />
        <MobileMenuTab
          active={activeTab === 'assignments'}
          label="Tugas"
          onPress={() => setActiveTab('assignments')}
          iconName="clipboard"
          minWidth={110}
        />
      </View>

      <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
        {activeTab === 'materials'
          ? 'Cari materi berdasarkan judul, mapel, atau kelas'
          : 'Cari tugas berdasarkan judul, mapel, atau kelas'}
      </Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={activeTab === 'materials' ? 'Cari materi...' : 'Cari tugas...'}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: '#fff',
          color: '#0f172a',
          marginBottom: 10,
        }}
      />

      <MobileSelectField
        label="Filter Kelas & Mapel"
        value={filterAssignmentId ? String(filterAssignmentId) : ''}
        options={filterSelectOptions}
        onChange={(next) => setFilterAssignmentId(next ? Number(next) : null)}
        placeholder="Semua kelas & mapel"
      />

      {teacherAssignmentsQuery.isLoading || materialsQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat data..." />
      ) : null}
      {teacherAssignmentsQuery.isError || materialsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data materi/tugas."
          onRetry={() => {
            teacherAssignmentsQuery.refetch();
            materialsQuery.refetch();
          }}
        />
      ) : null}

      {!teacherAssignmentsQuery.isLoading && !materialsQuery.isLoading && !teacherAssignmentsQuery.isError && !materialsQuery.isError ? (
        <>
          {assignmentOptions.length > 0 ? (
            activeTab === 'materials' ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbeafe',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
                  {editingMaterial ? 'Edit Materi' : 'Buat Materi Baru'}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                  Isi data materi pada kolom yang tersedia agar siswa mudah memahami konten.
                </Text>
                {editingMaterial ? (
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                    Sedang mengubah: {editingMaterial.title}
                  </Text>
                ) : null}

                <MobileSelectField
                  label="Kelas & Mapel"
                  value={materialAssignmentSelectionId ? String(materialAssignmentSelectionId) : ''}
                  options={assignmentSelectOptions}
                  onChange={(next) => setMaterialAssignmentId(next ? Number(next) : null)}
                  placeholder="Pilih kelas & mapel"
                />

                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Judul Materi</Text>
                <TextInput
                  value={materialTitle}
                  onChangeText={setMaterialTitle}
                  placeholder="Judul materi"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    marginBottom: 8,
                  }}
                />
                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Deskripsi Materi</Text>
                <TextInput
                  value={materialDescription}
                  onChangeText={setMaterialDescription}
                  placeholder="Jelaskan ringkas isi materi untuk siswa"
                  placeholderTextColor="#94a3b8"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    minHeight: 70,
                    textAlignVertical: 'top',
                    backgroundColor: '#fff',
                    marginBottom: 8,
                  }}
                />
                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Link Video (Opsional)</Text>
                <TextInput
                  value={materialYoutube}
                  onChangeText={setMaterialYoutube}
                  placeholder="Link YouTube (opsional)"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    marginBottom: 8,
                  }}
                />

                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={pickMaterialFile}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#eff6ff',
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Pilih File</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => setMaterialPublished((prev) => !prev)}
                      style={{
                        borderWidth: 1,
                        borderColor: materialPublished ? '#86efac' : '#cbd5e1',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: materialPublished ? '#dcfce7' : '#fff',
                      }}
                    >
                      <Text style={{ color: materialPublished ? '#166534' : '#334155', fontWeight: '700' }}>
                        {materialPublished ? 'Published' : 'Draft'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {materialFile ? (
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }} numberOfLines={2}>
                    File: {materialFile.name || materialFile.uri}
                  </Text>
                ) : editingMaterial?.fileName ? (
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }} numberOfLines={2}>
                    File saat ini: {editingMaterial.fileName}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                  {editingMaterial ? (
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <Pressable
                        onPress={resetMaterialForm}
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 9,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: '#fff',
                        }}
                      >
                        <Text style={{ color: '#334155', fontWeight: '700' }}>Batal Edit</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => {
                        if (editingMaterial) {
                          updateMaterialMutation.mutate();
                          return;
                        }
                        createMaterialMutation.mutate();
                      }}
                      disabled={createMaterialMutation.isPending || updateMaterialMutation.isPending}
                      style={{
                        backgroundColor:
                          createMaterialMutation.isPending || updateMaterialMutation.isPending
                            ? '#93c5fd'
                            : '#1d4ed8',
                        borderRadius: 9,
                        paddingVertical: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {createMaterialMutation.isPending || updateMaterialMutation.isPending
                          ? 'Menyimpan...'
                          : editingMaterial
                            ? 'Update Materi'
                            : 'Simpan Materi'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbeafe',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
                  {editingAssignment ? 'Edit Tugas' : 'Buat Tugas Baru'}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                  Lengkapi detail tugas agar instruksi siswa jelas dan deadline tidak terlewat.
                </Text>
                {editingAssignment ? (
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                    Sedang mengubah: {editingAssignment.title}
                  </Text>
                ) : null}

                <MobileSelectField
                  label="Kelas & Mapel"
                  value={assignmentAssignmentSelectionId ? String(assignmentAssignmentSelectionId) : ''}
                  options={assignmentSelectOptions}
                  onChange={(next) => setAssignmentAssignmentId(next ? Number(next) : null)}
                  placeholder="Pilih kelas & mapel"
                />

                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Judul Tugas</Text>
                <TextInput
                  value={assignmentTitle}
                  onChangeText={setAssignmentTitle}
                  placeholder="Judul tugas"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    marginBottom: 8,
                  }}
                />
                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Deskripsi Tugas</Text>
                <TextInput
                  value={assignmentDescription}
                  onChangeText={setAssignmentDescription}
                  placeholder="Tuliskan instruksi pengerjaan tugas"
                  placeholderTextColor="#94a3b8"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    minHeight: 70,
                    textAlignVertical: 'top',
                    backgroundColor: '#fff',
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Deadline Pengumpulan</Text>
                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <TextInput
                      value={assignmentDueDate}
                      onChangeText={setAssignmentDueDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: '#fff',
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <TextInput
                      value={assignmentDueTime}
                      onChangeText={setAssignmentDueTime}
                      placeholder="23:59"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: '#fff',
                      }}
                    />
                  </View>
                </View>

                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Pengaturan Penilaian</Text>
                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <TextInput
                      value={assignmentMaxScore}
                      onChangeText={setAssignmentMaxScore}
                      placeholder="Nilai Maks (1-100)"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: '#fff',
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => setAssignmentAllowResubmit((prev) => !prev)}
                      style={{
                        borderWidth: 1,
                        borderColor: assignmentAllowResubmit ? '#93c5fd' : '#cbd5e1',
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: 'center',
                        backgroundColor: assignmentAllowResubmit ? '#dbeafe' : '#fff',
                      }}
                    >
                      <Text style={{ color: assignmentAllowResubmit ? '#1d4ed8' : '#334155', fontWeight: '700' }}>
                        {assignmentAllowResubmit ? 'Resubmit ON' : 'Resubmit OFF'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={pickAssignmentFile}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#eff6ff',
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Pilih File</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => setAssignmentPublished((prev) => !prev)}
                      style={{
                        borderWidth: 1,
                        borderColor: assignmentPublished ? '#86efac' : '#cbd5e1',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: assignmentPublished ? '#dcfce7' : '#fff',
                      }}
                    >
                      <Text style={{ color: assignmentPublished ? '#166534' : '#334155', fontWeight: '700' }}>
                        {assignmentPublished ? 'Published' : 'Draft'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {assignmentFile ? (
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }} numberOfLines={2}>
                    File: {assignmentFile.name || assignmentFile.uri}
                  </Text>
                ) : editingAssignment?.fileName ? (
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }} numberOfLines={2}>
                    File saat ini: {editingAssignment.fileName}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                  {editingAssignment ? (
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <Pressable
                        onPress={resetAssignmentForm}
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 9,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: '#fff',
                        }}
                      >
                        <Text style={{ color: '#334155', fontWeight: '700' }}>Batal Edit</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => {
                        if (editingAssignment) {
                          updateAssignmentMutation.mutate();
                          return;
                        }
                        createAssignmentMutation.mutate();
                      }}
                      disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}
                      style={{
                        backgroundColor:
                          createAssignmentMutation.isPending || updateAssignmentMutation.isPending
                            ? '#93c5fd'
                            : '#1d4ed8',
                        borderRadius: 9,
                        paddingVertical: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {createAssignmentMutation.isPending || updateAssignmentMutation.isPending
                          ? 'Menyimpan...'
                          : editingAssignment
                            ? 'Update Tugas'
                            : 'Simpan Tugas'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 10,
                padding: 14,
                backgroundColor: '#fff',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
                Assignment mapel belum tersedia
              </Text>
              <Text style={{ color: '#64748b' }}>
                Anda perlu memiliki assignment kelas-mapel untuk membuat materi/tugas.
              </Text>
            </View>
          )}

          {activeTab === 'materials' ? (
            filteredMaterials.length > 0 ? (
              <View>
                {filteredMaterials.map((item) => {
                  const style = publishStyle(item.isPublished);
                  return (
                    <View
                      key={item.id}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>{item.title}</Text>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: style.text,
                            backgroundColor: style.bg,
                            borderWidth: 1,
                            borderColor: style.border,
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          {style.label}
                        </Text>
                      </View>
                      <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                        {(item.class?.name || '-') + ' • ' + item.subject.name}
                      </Text>
                      <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>
                        {item.description || 'Tanpa deskripsi'}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
                        Dibuat: {formatDateTime(item.createdAt)}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                        <View style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                          <Pressable
                            onPress={() => toggleMaterialPublishMutation.mutate(item)}
                            style={{
                              borderWidth: 1,
                              borderColor: '#bfdbfe',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#eff6ff',
                            }}
                          >
                            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                              {item.isPublished ? 'Draft' : 'Publish'}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                          <Pressable
                            onPress={() => openEditMaterial(item)}
                            style={{
                              borderWidth: 1,
                              borderColor: '#cbd5e1',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#fff',
                            }}
                          >
                            <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                          </Pressable>
                        </View>
                        <View style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                          <Pressable
                            onPress={() =>
                              openCopyModal({
                                type: 'material',
                                id: item.id,
                                title: item.title,
                                classId: item.class?.id || null,
                                classLevel: item.class?.level || null,
                                subjectId: item.subject.id,
                              })
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: '#bfdbfe',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#eff6ff',
                            }}
                          >
                            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Salin</Text>
                          </Pressable>
                        </View>
                        <View style={{ width: '33.333%', paddingHorizontal: 4 }}>
                          <Pressable
                            onPress={() => void openAttachment(item.fileUrl)}
                            disabled={!item.fileUrl}
                            style={{
                              borderWidth: 1,
                              borderColor: item.fileUrl ? '#cbd5e1' : '#e2e8f0',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: item.fileUrl ? '#fff' : '#f8fafc',
                            }}
                          >
                            <Text
                              style={{
                                color: item.fileUrl ? '#334155' : '#94a3b8',
                                fontWeight: '700',
                                fontSize: 12,
                              }}
                            >
                              Lampiran
                            </Text>
                          </Pressable>
                        </View>
                        <View style={{ width: '33.333%', paddingHorizontal: 4 }}>
                          <Pressable
                            onPress={() =>
                              setDeleteTarget({
                                type: 'material',
                                id: item.id,
                                title: item.title,
                              })
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: '#fecaca',
                              borderRadius: 8,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#fef2f2',
                            }}
                          >
                            <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Belum ada materi</Text>
                <Text style={{ color: '#64748b' }}>Materi yang Anda buat akan muncul di sini.</Text>
              </View>
            )
          ) : filteredAssignments.length > 0 ? (
            <View>
              {filteredAssignments.map((item) => {
                const style = publishStyle(item.isPublished);
                return (
                  <View
                    key={item.id}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>{item.title}</Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: style.text,
                          backgroundColor: style.bg,
                          borderWidth: 1,
                          borderColor: style.border,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                        }}
                      >
                        {style.label}
                      </Text>
                    </View>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                      {(item.class?.name || '-') + ' • ' + item.subject.name}
                    </Text>
                    <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>
                      Deadline: {formatDateTime(item.dueDate)} • Max: {item.maxScore} • Submit: {item._count?.submissions ?? 0}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                      <View style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() => toggleAssignmentPublishMutation.mutate(item)}
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#eff6ff',
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                            {item.isPublished ? 'Draft' : 'Publish'}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() => openEditAssignment(item)}
                          style={{
                            borderWidth: 1,
                            borderColor: '#cbd5e1',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Edit</Text>
                        </Pressable>
                      </View>
                      <View style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() =>
                            openCopyModal({
                              type: 'assignment',
                              id: item.id,
                              title: item.title,
                              classId: item.class?.id || null,
                              classLevel: item.class?.level || null,
                              subjectId: item.subject.id,
                            })
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#eff6ff',
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Salin</Text>
                        </Pressable>
                      </View>
                      <View style={{ width: '33.333%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: '/teacher/assignment-submissions',
                              params: {
                                assignmentId: String(item.id),
                                title: item.title,
                              },
                            })
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#eff6ff',
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Submisi</Text>
                        </Pressable>
                      </View>
                      <View style={{ width: '33.333%', paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() => void openAttachment(item.fileUrl)}
                          disabled={!item.fileUrl}
                          style={{
                            borderWidth: 1,
                            borderColor: item.fileUrl ? '#cbd5e1' : '#e2e8f0',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: item.fileUrl ? '#fff' : '#f8fafc',
                          }}
                        >
                          <Text
                            style={{
                              color: item.fileUrl ? '#334155' : '#94a3b8',
                              fontWeight: '700',
                              fontSize: 12,
                            }}
                          >
                            Lampiran
                          </Text>
                        </Pressable>
                      </View>
                      <View style={{ width: '33.333%', paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() =>
                            setDeleteTarget({
                              type: 'assignment',
                              id: item.id,
                              title: item.title,
                              submissionCount: item._count?.submissions ?? 0,
                            })
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: '#fecaca',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                            backgroundColor: '#fef2f2',
                          }}
                        >
                          <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 10,
                padding: 16,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Belum ada tugas</Text>
              <Text style={{ color: '#64748b' }}>Tugas yang Anda buat akan muncul di sini.</Text>
            </View>
          )}
        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: '#1d4ed8',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
      </Pressable>
      </ScrollView>

      <Modal
        visible={!!copySource}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (copyMutation.isPending) return;
          setCopySource(null);
          setSelectedCopyClassIds([]);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#dbeafe',
              padding: 14,
              maxHeight: '80%',
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
              Salin ke Kelas Lain
            </Text>
            <Text style={{ color: '#334155', fontSize: 13, marginBottom: 10 }}>
              {copySource
                ? `${copySource.type === 'material' ? 'Materi' : 'Tugas'}: ${copySource.title}`
                : ''}
            </Text>

            <ScrollView style={{ maxHeight: 280 }}>
              {copyTargetOptions.length > 0 ? (
                copyTargetOptions.map((item) => {
                  const selected = selectedCopyClassIds.includes(item.class.id);
                  return (
                    <Pressable
                      key={`copy-target-${item.class.id}`}
                      onPress={() =>
                        setSelectedCopyClassIds((prev) =>
                          selected ? prev.filter((id) => id !== item.class.id) : [...prev, item.class.id],
                        )
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                        backgroundColor: selected ? '#eff6ff' : '#fff',
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 13 }}>
                        {item.class.name}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>{item.subject.name}</Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                  Tidak ada kelas setingkat lain untuk mapel ini.
                </Text>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => {
                    if (copyMutation.isPending) return;
                    setCopySource(null);
                    setSelectedCopyClassIds([]);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 9,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => copyMutation.mutate()}
                  disabled={copyMutation.isPending || selectedCopyClassIds.length === 0}
                  style={{
                    borderWidth: 1,
                    borderColor: '#1d4ed8',
                    borderRadius: 9,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor:
                      copyMutation.isPending || selectedCopyClassIds.length === 0 ? '#93c5fd' : '#1d4ed8',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {copyMutation.isPending ? 'Menyalin...' : 'Salin'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (isDeleting) return;
          setDeleteTarget(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            justifyContent: 'center',
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#fecaca',
              padding: 14,
            }}
          >
            <View
              style={{
                alignSelf: 'flex-start',
                borderWidth: 1,
                borderColor: '#fecaca',
                backgroundColor: '#fff1f2',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: '#9f1239', fontWeight: '700', fontSize: 12 }}>Konfirmasi Hapus</Text>
            </View>

            <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 18, marginBottom: 6 }}>
              {deleteTarget?.type === 'material' ? 'Hapus Materi' : 'Hapus Tugas'}
            </Text>
            <Text style={{ color: '#475569', fontSize: 13, marginBottom: 8 }}>
              Yakin ingin menghapus <Text style={{ fontWeight: '700' }}>{deleteTarget?.title}</Text>?
            </Text>
            {deleteTarget?.type === 'assignment' && (deleteTarget.submissionCount || 0) > 0 ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#fed7aa',
                  backgroundColor: '#fff7ed',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: '#9a3412', fontSize: 12 }}>
                  Tugas ini sudah memiliki {deleteTarget.submissionCount} submisi. Jika backend menolak, data tetap aman
                  dan tidak akan terhapus.
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 4 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    opacity: isDeleting ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={confirmDelete}
                  disabled={isDeleting}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dc2626',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: isDeleting ? '#fca5a5' : '#dc2626',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{isDeleting ? 'Menghapus...' : 'Hapus'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
