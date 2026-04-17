import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { kesiswaanApi } from '../../../src/features/kesiswaan/kesiswaanApi';
import { KesiswaanBehavior, KesiswaanBehaviorType } from '../../../src/features/kesiswaan/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../../src/lib/ui/feedback';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type TypeFilter = 'ALL' | KesiswaanBehaviorType;

type BehaviorFormState = {
  studentId: number | null;
  date: string;
  type: KesiswaanBehaviorType;
  category: string;
  description: string;
  point: string;
};

function todayIsoDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultForm(): BehaviorFormState {
  return {
    studentId: null,
    date: todayIsoDate(),
    type: 'POSITIVE',
    category: '',
    description: '',
    point: '0',
  };
}

function isHomeroomTeacher(duties?: string[], classesCount?: number) {
  if ((classesCount || 0) > 0) return true;
  const normalized = (duties || []).map((item) => item.trim().toUpperCase());
  return normalized.includes('WALI_KELAS');
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function typeStyle(type: KesiswaanBehaviorType) {
  if (type === 'POSITIVE') return { text: '#15803d', border: '#86efac', bg: '#dcfce7', label: 'Positif' };
  return { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2', label: 'Negatif' };
}

export default function TeacherHomeroomBehaviorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [editingBehaviorId, setEditingBehaviorId] = useState<number | null>(null);
  const [form, setForm] = useState<BehaviorFormState>(createDefaultForm());
  const [showForm, setShowForm] = useState(false);
  const [summaryDetailVisible, setSummaryDetailVisible] = useState(false);

  const isAllowed = user?.role === 'TEACHER' && isHomeroomTeacher(user?.additionalDuties, user?.teacherClasses?.length);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-homeroom-behavior-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const classesQuery = useQuery({
    queryKey: ['mobile-homeroom-behavior-classes', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!user?.id && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const result = await adminApi.listClasses({
        page: 1,
        limit: 300,
        academicYearId: activeYearQuery.data?.id,
        teacherId: user?.id,
      });
      return result.items;
    },
  });

  const classItems = useMemo(() => classesQuery.data || [], [classesQuery.data]);
  const classSelectOptions = useMemo(
    () =>
      classItems.map((classItem) => ({
        value: String(classItem.id),
        label: classItem.major?.code ? `${classItem.name} • ${classItem.major.code}` : classItem.name,
      })),
    [classItems],
  );
  const activeClassId = useMemo(() => {
    if (selectedClassId && classItems.some((item) => item.id === selectedClassId)) return selectedClassId;
    return classItems[0]?.id ?? null;
  }, [classItems, selectedClassId]);
  const selectedClass = classItems.find((item) => item.id === activeClassId) || null;

  const classDetailQuery = useQuery({
    queryKey: ['mobile-homeroom-behavior-class-detail', activeClassId],
    enabled: isAuthenticated && !!isAllowed && !!activeClassId,
    queryFn: async () => adminApi.getClassById(Number(activeClassId)),
  });

  const students = useMemo(() => classDetailQuery.data?.students || [], [classDetailQuery.data?.students]);
  const studentSelectOptions = useMemo(
    () =>
      students.map((student) => ({
        value: String(student.id),
        label: student.nis ? `${student.name} • NIS ${student.nis}` : student.name,
      })),
    [students],
  );
  const behaviorTypeOptions = useMemo(
    () => [
      { value: 'POSITIVE', label: 'Positif' },
      { value: 'NEGATIVE', label: 'Negatif' },
    ],
    [],
  );
  const typeFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Jenis' },
      { value: 'POSITIVE', label: 'Positif' },
      { value: 'NEGATIVE', label: 'Negatif' },
    ],
    [],
  );
  const activeStudentId = useMemo(() => {
    if (form.studentId && students.some((student) => student.id === form.studentId)) return form.studentId;
    return students[0]?.id ?? null;
  }, [form.studentId, students]);

  const behaviorsQuery = useQuery({
    queryKey: [
      'mobile-homeroom-behaviors',
      activeClassId,
      activeYearQuery.data?.id,
      typeFilter,
      search,
    ],
    enabled: isAuthenticated && !!isAllowed && !!activeClassId && !!activeYearQuery.data?.id,
    queryFn: async () =>
      kesiswaanApi.getBehaviors({
        classId: Number(activeClassId),
        academicYearId: Number(activeYearQuery.data?.id),
        type: typeFilter === 'ALL' ? undefined : typeFilter,
        search: search.trim() || undefined,
        page: 1,
        limit: 250,
      }),
  });

  const behaviors = useMemo(() => behaviorsQuery.data?.behaviors || [], [behaviorsQuery.data?.behaviors]);

  const resetForm = () => {
    setEditingBehaviorId(null);
    setForm({
      ...createDefaultForm(),
      studentId: students[0]?.id ?? null,
    });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!activeClassId || !activeYearQuery.data?.id || !activeStudentId) {
        throw new Error('Data kelas, tahun ajaran, atau siswa belum lengkap.');
      }

      const point = Math.abs(Math.trunc(Number(form.point || 0)));
      if (!Number.isFinite(point)) {
        throw new Error('Poin perilaku tidak valid.');
      }

      return kesiswaanApi.createBehavior({
        studentId: activeStudentId,
        classId: Number(activeClassId),
        academicYearId: Number(activeYearQuery.data.id),
        date: form.date,
        type: form.type,
        category: form.category.trim() || undefined,
        description: form.description.trim(),
        point,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-behaviors'] });
      notifySuccess('Catatan perilaku berhasil ditambahkan.');
      resetForm();
      setShowForm(false);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menambahkan catatan perilaku.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingBehaviorId) throw new Error('Data catatan tidak ditemukan.');

      const point = Math.abs(Math.trunc(Number(form.point || 0)));
      if (!Number.isFinite(point)) {
        throw new Error('Poin perilaku tidak valid.');
      }

      return kesiswaanApi.updateBehavior(editingBehaviorId, {
        date: form.date,
        type: form.type,
        category: form.category.trim() || undefined,
        description: form.description.trim(),
        point,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-behaviors'] });
      notifySuccess('Catatan perilaku berhasil diperbarui.');
      resetForm();
      setShowForm(false);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memperbarui catatan perilaku.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (behaviorId: number) => kesiswaanApi.deleteBehavior(behaviorId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-behaviors'] });
      notifySuccess('Catatan perilaku berhasil dihapus.');
      if (editingBehaviorId) {
        resetForm();
      }
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus catatan perilaku.');
    },
  });

  const summary = useMemo(() => {
    const result = {
      total: behaviors.length,
      positive: 0,
      negative: 0,
      positivePoints: 0,
      negativePoints: 0,
    };
    for (const item of behaviors) {
      const point = Math.abs(Number(item.point || 0));
      if (item.type === 'POSITIVE') {
        result.positive += 1;
        result.positivePoints += point;
      } else {
        result.negative += 1;
        result.negativePoints += point;
      }
    }
    return result;
  }, [behaviors]);

  const handleSubmit = () => {
    if (!activeStudentId) {
      notifyInfo('Pilih siswa terlebih dahulu.', { title: 'Validasi' });
      return;
    }
    if (!form.date || Number.isNaN(new Date(form.date).getTime())) {
      notifyInfo('Tanggal tidak valid. Gunakan format YYYY-MM-DD.', { title: 'Validasi' });
      return;
    }
    if (!form.description.trim()) {
      notifyInfo('Deskripsi perilaku wajib diisi.', { title: 'Validasi' });
      return;
    }

    if (editingBehaviorId) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const startEdit = (item: KesiswaanBehavior) => {
    setEditingBehaviorId(item.id);
    setForm({
      studentId: item.studentId,
      date: item.date.split('T')[0] || todayIsoDate(),
      type: item.type,
      category: item.category || '',
      description: item.description || '',
      point: String(Math.abs(Number(item.point || 0))),
    });
    setShowForm(true);
  };

  const handleDelete = (item: KesiswaanBehavior) => {
    Alert.alert('Hapus Catatan', `Hapus catatan perilaku untuk ${item.student?.name || 'siswa ini'}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(item.id),
      },
    ]);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isMutating = isSaving || deleteMutation.isPending;

  if (isLoading) return <AppLoadingScreen message="Memuat catatan perilaku..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>Catatan Perilaku</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Catatan Perilaku
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Modul ini tersedia untuk wali kelas yang memiliki kelas aktif.
        </Text>
        <QueryStateView type="error" message="Anda tidak memiliki hak akses untuk modul ini." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            classesQuery.isFetching ||
            classDetailQuery.isFetching ||
            behaviorsQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            void classDetailQuery.refetch();
            void behaviorsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Catatan Perilaku
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola catatan perilaku positif dan negatif siswa kelas wali.
      </Text>

      {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat kelas wali..." /> : null}
      {classesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat kelas wali." onRetry={() => classesQuery.refetch()} />
      ) : null}

      {!classesQuery.isLoading && !classesQuery.isError ? (
        classItems.length > 0 ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <MobileSelectField
              label="Kelas Wali"
              value={activeClassId ? String(activeClassId) : ''}
              options={classSelectOptions}
              onChange={(next) => setSelectedClassId(next ? Number(next) : null)}
              placeholder="Pilih kelas wali"
            />
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
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Tidak ada kelas wali
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Anda belum terdaftar sebagai wali kelas di tahun ajaran aktif.
            </Text>
          </View>
        )
      ) : null}

      {selectedClass ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(16), lineHeight: scaleLineHeight(22) }}>
            {selectedClass.name}
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {selectedClass.major?.name || '-'} • Wali: {selectedClass.teacher?.name || '-'}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <MobileSummaryCard
            title="Total Catatan"
            value={`${summary.total}`}
            subtitle="Sesuai filter saat ini"
            iconName="file-text"
            accentColor="#2563eb"
            onPress={() => setSummaryDetailVisible(true)}
          />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <MobileSummaryCard
            title="Positif / Negatif"
            value={`${summary.positive} / ${summary.negative}`}
            subtitle={`Poin +${summary.positivePoints} / -${summary.negativePoints}`}
            iconName="activity"
            accentColor="#16a34a"
            onPress={() => setSummaryDetailVisible(true)}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Pressable
          onPress={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
              return;
            }
            setShowForm(true);
          }}
          style={{
            flex: 1,
            borderRadius: 10,
            backgroundColor: showForm ? '#ef4444' : BRAND_COLORS.blue,
            paddingVertical: 11,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>{showForm ? 'Tutup Form' : 'Tambah Catatan'}</Text>
        </Pressable>
      </View>

      {showForm ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            backgroundColor: '#fff',
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 10 }}>
            {editingBehaviorId ? 'Edit Catatan Perilaku' : 'Tambah Catatan Perilaku'}
          </Text>

          {students.length > 0 ? (
            <MobileSelectField
              label="Siswa"
              value={activeStudentId ? String(activeStudentId) : ''}
              options={studentSelectOptions}
              onChange={(next) =>
                setForm((prev) => ({
                  ...prev,
                  studentId: next ? Number(next) : null,
                }))
              }
              placeholder="Pilih siswa"
              disabled={!!editingBehaviorId}
              helperText={editingBehaviorId ? 'Siswa tidak dapat diubah saat mengedit catatan.' : undefined}
            />
          ) : (
            <View
              style={{
                width: '100%',
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 10,
                backgroundColor: '#fff',
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada siswa pada kelas ini.</Text>
            </View>
          )}

          <Text style={{ color: '#334155', fontWeight: '600', marginBottom: 6 }}>Tanggal (YYYY-MM-DD)</Text>
          <TextInput
            value={form.date}
            onChangeText={(value) => setForm((prev) => ({ ...prev, date: value }))}
            placeholder="2026-02-19"
            placeholderTextColor="#94a3b8"
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 9,
              color: BRAND_COLORS.textDark,
              backgroundColor: '#f8fbff',
              marginBottom: 10,
            }}
          />

          <MobileSelectField
            label="Jenis Perilaku"
            value={form.type}
            options={behaviorTypeOptions}
            onChange={(next) =>
              setForm((prev) => ({
                ...prev,
                type: (next as KesiswaanBehaviorType) || 'POSITIVE',
              }))
            }
            placeholder="Pilih jenis perilaku"
          />

          <Text style={{ color: '#334155', fontWeight: '600', marginBottom: 6 }}>Kategori</Text>
          <TextInput
            value={form.category}
            onChangeText={(value) => setForm((prev) => ({ ...prev, category: value }))}
            placeholder="Contoh: Disiplin, Kejujuran, Tata Tertib"
            placeholderTextColor="#94a3b8"
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 9,
              color: BRAND_COLORS.textDark,
              backgroundColor: '#f8fbff',
              marginBottom: 10,
            }}
          />

          <Text style={{ color: '#334155', fontWeight: '600', marginBottom: 6 }}>Deskripsi</Text>
          <TextInput
            value={form.description}
            onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))}
            placeholder="Uraikan detail perilaku siswa"
            placeholderTextColor="#94a3b8"
            multiline
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 9,
              color: BRAND_COLORS.textDark,
              backgroundColor: '#f8fbff',
              minHeight: 90,
              textAlignVertical: 'top',
              marginBottom: 10,
            }}
          />

          <Text style={{ color: '#334155', fontWeight: '600', marginBottom: 6 }}>Poin</Text>
          <TextInput
            value={form.point}
            onChangeText={(value) => setForm((prev) => ({ ...prev, point: value }))}
            placeholder="0"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 9,
              color: BRAND_COLORS.textDark,
              backgroundColor: '#f8fbff',
              marginBottom: 10,
            }}
          />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={handleSubmit}
              disabled={isSaving}
              style={{
                flex: 1,
                borderRadius: 8,
                backgroundColor: BRAND_COLORS.blue,
                alignItems: 'center',
                paddingVertical: 11,
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {isSaving ? 'Menyimpan...' : editingBehaviorId ? 'Simpan Perubahan' : 'Tambah Catatan'}
              </Text>
            </Pressable>
            {editingBehaviorId ? (
              <Pressable
                onPress={() => {
                  resetForm();
                  setShowForm(false);
                }}
                style={{
                  flex: 1,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '700' }}>Batal Edit</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama siswa / NIS / NISN"
          placeholderTextColor="#8ea0bf"
          style={{
            flex: 1,
            paddingVertical: 11,
            paddingHorizontal: 9,
            color: BRAND_COLORS.textDark,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <MobileSelectField
          label="Filter Jenis Perilaku"
          value={typeFilter}
          options={typeFilterOptions}
          onChange={(next) => setTypeFilter((next as TypeFilter) || 'ALL')}
          placeholder="Pilih jenis perilaku"
        />
      </View>

      {classDetailQuery.isLoading ? <QueryStateView type="loading" message="Memuat data siswa kelas..." /> : null}
      {classDetailQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data siswa kelas." onRetry={() => classDetailQuery.refetch()} />
      ) : null}
      {behaviorsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil riwayat perilaku siswa..." /> : null}
      {behaviorsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat riwayat perilaku." onRetry={() => behaviorsQuery.refetch()} />
      ) : null}

      {!behaviorsQuery.isLoading && !behaviorsQuery.isError ? (
        behaviors.length > 0 ? (
          behaviors.map((item) => {
            const style = typeStyle(item.type);
            const points = Math.abs(Number(item.point || 0));
            return (
              <View
                key={item.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  backgroundColor: '#fff',
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(15), lineHeight: scaleLineHeight(22) }}>
                      {item.student?.name || '-'}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 2 }}>
                      NIS: {item.student?.nis || '-'} • NISN: {item.student?.nisn || '-'}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 2 }}>Tanggal: {formatDate(item.date)}</Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: style.border,
                      backgroundColor: style.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: style.text, fontWeight: '700', fontSize: scaleFont(11) }}>{style.label}</Text>
                  </View>
                </View>

                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Kategori: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.category || '-'}</Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Deskripsi: <Text style={{ color: BRAND_COLORS.textDark }}>{item.description || '-'}</Text>
                </Text>
                <Text style={{ color: style.text, fontWeight: '700', marginBottom: 8 }}>
                  Poin: {item.type === 'POSITIVE' ? '+' : '-'}
                  {points}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => startEdit(item)}
                    disabled={isMutating}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#93c5fd',
                      backgroundColor: '#eff6ff',
                      alignItems: 'center',
                      paddingVertical: 9,
                      opacity: isMutating ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(item)}
                    disabled={isMutating}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#fca5a5',
                      backgroundColor: '#fff1f2',
                      alignItems: 'center',
                      paddingVertical: 9,
                      opacity: isMutating ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Hapus</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
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
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data perilaku siswa pada kelas ini.</Text>
          </View>
        )
      ) : null}

      <MobileDetailModal
        visible={summaryDetailVisible}
        title="Ringkasan Catatan Perilaku"
        subtitle="Detail ringkas catatan perilaku pada kelas dan filter yang sedang aktif."
        iconName="clipboard"
        accentColor="#2563eb"
        onClose={() => setSummaryDetailVisible(false)}
      >
        <View style={{ gap: 10 }}>
          {[
            {
              label: 'Total Catatan',
              value: `${summary.total}`,
              note: 'Jumlah catatan sesuai hasil pencarian dan filter aktif',
            },
            {
              label: 'Perilaku Positif',
              value: `${summary.positive}`,
              note: `Akumulasi poin +${summary.positivePoints}`,
            },
            {
              label: 'Perilaku Negatif',
              value: `${summary.negative}`,
              note: `Akumulasi poin -${summary.negativePoints}`,
            },
          ].map((item) => (
            <View
              key={item.label}
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 11,
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginBottom: 4 }}>{item.label}</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(18) }}>{item.value}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 3 }}>{item.note}</Text>
            </View>
          ))}
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 11,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginBottom: 4 }}>Konteks Aktif</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
              Kelas: {selectedClass?.name || 'Belum dipilih'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginTop: 2 }}>
              Jenis: {typeFilter === 'ALL' ? 'Semua Jenis' : typeFilter === 'POSITIVE' ? 'Positif' : 'Negatif'}
            </Text>
          </View>
        </View>
      </MobileDetailModal>

    </ScrollView>
  );
}
