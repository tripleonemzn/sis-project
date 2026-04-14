import { useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { adminApi } from '../admin/adminApi';
import type { ExamProgramItem } from '../exams/examApi';
import {
  homeroomBookApi,
  type HomeroomBookEntry,
  type HomeroomBookEntryType,
  type HomeroomBookStatus,
} from './homeroomBookApi';

type PanelMode = 'homeroom' | 'student_affairs' | 'principal';

type Props = {
  mode: PanelMode;
  academicYearId?: number | null;
  classId?: number | null;
  examPrograms?: ExamProgramItem[];
};

type FormState = {
  studentId: string;
  entryType: HomeroomBookEntryType;
  title: string;
  summary: string;
  notes: string;
  incidentDate: string;
  relatedSemester: '' | 'ODD' | 'EVEN';
  relatedProgramCode: string;
  visibilityToPrincipal: boolean;
  visibilityToStudentAffairs: boolean;
};

const DEFAULT_FORM_STATE = (): FormState => ({
  studentId: '',
  entryType: 'EXAM_FINANCE_EXCEPTION',
  title: '',
  summary: '',
  notes: '',
  incidentDate: new Date().toISOString().slice(0, 10),
  relatedSemester: '',
  relatedProgramCode: '',
  visibilityToPrincipal: true,
  visibilityToStudentAffairs: true,
});

const MAX_ATTACHMENT_BYTES = 500 * 1024;
const MAX_ATTACHMENT_COUNT = 5;

const entryTypeOptions = [
  { value: '', label: 'Semua Jenis' },
  { value: 'EXAM_FINANCE_EXCEPTION', label: 'Pengecualian Ujian Finance' },
  { value: 'STUDENT_CASE_REPORT', label: 'Laporan Kasus Siswa' },
];

const statusOptions = [
  { value: '', label: 'Semua Status' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'RESOLVED', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

function getPanelTitle(mode: PanelMode) {
  if (mode === 'principal') return 'Monitoring Buku Wali Kelas';
  if (mode === 'student_affairs') return 'Monitoring Buku Wali Kelas';
  return 'Buku Wali Kelas';
}

function getPanelDescription(mode: PanelMode) {
  if (mode === 'principal') {
    return 'Pantau pengecualian ujian finance dan laporan kasus siswa dari wali kelas.';
  }
  if (mode === 'student_affairs') {
    return 'Baca entri Buku Wali Kelas secara read only untuk koordinasi kesiswaan.';
  }
  return 'Kelola pengecualian ujian finance dan laporan kasus siswa lengkap dengan lampiran perjanjian atau bukti pendukung.';
}

function getStatusStyle(status: HomeroomBookStatus) {
  if (status === 'ACTIVE') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (status === 'RESOLVED') return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' };
  return { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' };
}

function getEntryTypeLabel(type: HomeroomBookEntryType) {
  return type === 'EXAM_FINANCE_EXCEPTION' ? 'Pengecualian Ujian Finance' : 'Laporan Kasus Siswa';
}

function validateAttachment(asset: DocumentPicker.DocumentPickerAsset) {
  const mimeType = String(asset.mimeType || '').toLowerCase();
  if (!['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
    return `Format ${asset.name} tidak didukung.`;
  }
  if (Number(asset.size || 0) > MAX_ATTACHMENT_BYTES) {
    return `${asset.name} melebihi 500KB.`;
  }
  return null;
}

function buildFormState(entry?: HomeroomBookEntry | null): FormState {
  if (!entry) return DEFAULT_FORM_STATE();
  return {
    studentId: String(entry.student.id),
    entryType: entry.entryType,
    title: entry.title,
    summary: entry.summary,
    notes: entry.notes || '',
    incidentDate: String(entry.incidentDate || '').slice(0, 10),
    relatedSemester: entry.relatedSemester || '',
    relatedProgramCode: entry.relatedProgramCode || '',
    visibilityToPrincipal: entry.visibilityToPrincipal,
    visibilityToStudentAffairs: entry.visibilityToStudentAffairs,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function HomeroomBookMobilePanel({ mode, academicYearId, classId, examPrograms = [] }: Props) {
  const editable = mode === 'homeroom';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<'' | HomeroomBookEntryType>('');
  const [statusFilter, setStatusFilter] = useState<'' | HomeroomBookStatus>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [formVisible, setFormVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HomeroomBookEntry | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM_STATE);
  const [attachments, setAttachments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);

  const canLoad = !!academicYearId && (!editable || !!classId);

  const classesQuery = useQuery({
    queryKey: ['mobile-homeroom-book-classes', mode, academicYearId],
    enabled: !editable && !!academicYearId,
    queryFn: async () => {
      const response = await adminApi.listClasses({ academicYearId: Number(academicYearId), page: 1, limit: 300 });
      return response.items;
    },
  });

  const studentsQuery = useQuery({
    queryKey: ['mobile-homeroom-book-students', classId],
    enabled: editable && !!classId,
    queryFn: async () => homeroomBookApi.listStudentsByClass(Number(classId)),
  });

  const listQuery = useQuery({
    queryKey: [
      'mobile-homeroom-book-list',
      mode,
      academicYearId,
      editable ? classId : classFilter,
      entryTypeFilter,
      statusFilter,
      search,
    ],
    enabled: canLoad,
    queryFn: async () =>
      homeroomBookApi.list({
        academicYearId: Number(academicYearId),
        classId: editable ? Number(classId) : classFilter !== 'ALL' ? Number(classFilter) : undefined,
        entryType: entryTypeFilter || undefined,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page: 1,
        limit: 100,
      }),
  });

  const availablePrograms = useMemo(
    () => examPrograms.filter((item) => item.isActive).sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'id-ID')),
    [examPrograms],
  );

  const classOptions = useMemo(
    () =>
      [{ value: 'ALL', label: 'Semua Kelas' }].concat(
        (classesQuery.data || []).map((item) => ({
          value: String(item.id),
          label: item.major?.code ? `${item.name} • ${item.major.code}` : item.name,
        })),
      ),
    [classesQuery.data],
  );

  const studentOptions = useMemo(
    () =>
      (studentsQuery.data || []).map((item) => ({
        value: String(item.id),
        label: `${item.name}${item.nis ? ` • ${item.nis}` : item.nisn ? ` • ${item.nisn}` : ''}`,
      })),
    [studentsQuery.data],
  );

  const entries = listQuery.data?.entries || [];
  const summary = useMemo(() => {
    let active = 0;
    let exception = 0;
    let cases = 0;
    for (const entry of entries) {
      if (entry.status === 'ACTIVE') active += 1;
      if (entry.entryType === 'EXAM_FINANCE_EXCEPTION') exception += 1;
      if (entry.entryType === 'STUDENT_CASE_REPORT') cases += 1;
    }
    return { total: entries.length, active, exception, cases };
  }, [entries]);

  const resetForm = () => {
    setEditingEntry(null);
    setForm(DEFAULT_FORM_STATE());
    setAttachments([]);
    setFormVisible(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!academicYearId) throw new Error('Tahun ajaran aktif belum tersedia.');
      if (editable && !classId) throw new Error('Kelas wali belum tersedia.');
      const studentId = Number(form.studentId);
      if (!Number.isFinite(studentId) || studentId <= 0) throw new Error('Pilih siswa terlebih dahulu.');
      if (!form.title.trim()) throw new Error('Judul wajib diisi.');
      if (!form.summary.trim()) throw new Error('Ringkasan wajib diisi.');
      if (!form.incidentDate) throw new Error('Tanggal kejadian wajib diisi.');
      if (attachments.length > MAX_ATTACHMENT_COUNT) throw new Error(`Lampiran maksimal ${MAX_ATTACHMENT_COUNT} file.`);

      for (const asset of attachments) {
        const error = validateAttachment(asset);
        if (error) throw new Error(error);
      }

      const isExamException = form.entryType === 'EXAM_FINANCE_EXCEPTION';
      if (isExamException) {
        if (!form.relatedSemester) throw new Error('Semester ujian wajib dipilih.');
        if (!form.relatedProgramCode.trim()) throw new Error('Program ujian wajib dipilih.');
        if (!editingEntry && attachments.length === 0) throw new Error('Lampiran perjanjian wajib diunggah.');
      }

      const uploadedAttachments = [];
      for (const asset of attachments) {
        uploadedAttachments.push(
          await homeroomBookApi.uploadAttachment({
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType || undefined,
          }),
        );
      }

      const payload = {
        studentId,
        classId: Number(classId),
        academicYearId: Number(academicYearId),
        entryType: form.entryType,
        title: form.title.trim(),
        summary: form.summary.trim(),
        notes: form.notes.trim() || null,
        incidentDate: `${form.incidentDate}T00:00:00.000Z`,
        relatedSemester: isExamException ? form.relatedSemester || null : null,
        relatedProgramCode: isExamException ? form.relatedProgramCode.trim() : null,
        visibilityToPrincipal: form.visibilityToPrincipal,
        visibilityToStudentAffairs: form.visibilityToStudentAffairs,
        ...(uploadedAttachments.length > 0 ? { attachments: uploadedAttachments } : {}),
      };

      if (editingEntry) {
        return homeroomBookApi.update(editingEntry.id, payload);
      }
      return homeroomBookApi.create(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-book-list'] });
      Alert.alert('Berhasil', editingEntry ? 'Buku Wali Kelas diperbarui.' : 'Buku Wali Kelas dibuat.');
      resetForm();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan Buku Wali Kelas.';
      Alert.alert('Simpan Gagal', message);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: { id: number; status: HomeroomBookStatus }) =>
      homeroomBookApi.updateStatus(payload.id, { status: payload.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-book-list'] });
    },
    onError: () => {
      Alert.alert('Gagal', 'Status Buku Wali Kelas tidak berhasil diperbarui.');
    },
  });

  const pickAttachments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ['application/pdf', 'image/png', 'image/jpeg'],
    });
    if (result.canceled || result.assets.length === 0) return;
    const nextAttachments = result.assets.slice(0, MAX_ATTACHMENT_COUNT);
    for (const asset of nextAttachments) {
      const error = validateAttachment(asset);
      if (error) {
        Alert.alert('Lampiran Tidak Valid', error);
        return;
      }
    }
    setAttachments(nextAttachments);
  };

  const openEdit = (entry: HomeroomBookEntry) => {
    setEditingEntry(entry);
    setForm(buildFormState(entry));
    setAttachments([]);
    setFormVisible(true);
  };

  const openAttachment = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Gagal', 'Lampiran tidak dapat dibuka pada perangkat ini.');
      return;
    }
    await Linking.openURL(url);
  };

  return (
    <View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>{getPanelTitle(mode)}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{getPanelDescription(mode)}</Text>

      {!canLoad ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderStyle: 'dashed',
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum Siap</Text>
          <Text style={{ color: BRAND_COLORS.textMuted }}>
            {editable
              ? 'Kelas wali aktif belum ditemukan pada tahun ajaran berjalan.'
              : 'Tahun ajaran aktif belum tersedia untuk memuat Buku Wali Kelas.'}
          </Text>
        </View>
      ) : null}

      {canLoad ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 12 }}>
            <View style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
              <MobileSummaryCard title="Total Entri" value={String(summary.total)} iconName="book-open" accentColor="#2563eb" />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
              <MobileSummaryCard title="Status Aktif" value={String(summary.active)} iconName="check-circle" accentColor="#16a34a" />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
              <MobileSummaryCard title="Exception Ujian" value={String(summary.exception)} iconName="shield" accentColor="#d97706" />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 5, marginBottom: 10 }}>
              <MobileSummaryCard title="Kasus Siswa" value={String(summary.cases)} iconName="alert-circle" accentColor="#7c3aed" />
            </View>
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
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cari siswa, judul, ringkasan"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: BRAND_COLORS.textDark,
                marginBottom: 10,
              }}
            />

            {!editable ? (
              <MobileSelectField
                label="Kelas"
                value={classFilter}
                options={classOptions}
                onChange={setClassFilter}
                placeholder="Pilih kelas"
              />
            ) : null}

            <MobileSelectField
              label="Jenis Entri"
              value={entryTypeFilter}
              options={entryTypeOptions}
              onChange={(value) => setEntryTypeFilter((value || '') as '' | HomeroomBookEntryType)}
              placeholder="Semua jenis"
            />

            <MobileSelectField
              label="Status"
              value={statusFilter}
              options={statusOptions}
              onChange={(value) => setStatusFilter((value || '') as '' | HomeroomBookStatus)}
              placeholder="Semua status"
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => listQuery.refetch()}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Muat Ulang</Text>
              </Pressable>
              {editable ? (
                <Pressable
                  onPress={() => {
                    setEditingEntry(null);
                    setForm(DEFAULT_FORM_STATE());
                    setAttachments([]);
                    setFormVisible((prev) => !prev);
                  }}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#2563eb',
                    backgroundColor: '#eff6ff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>{formVisible ? 'Tutup Form' : 'Tambah Entri'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {editable && formVisible ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15, marginBottom: 10 }}>
                {editingEntry ? 'Perbarui Buku Wali Kelas' : 'Tambah Buku Wali Kelas'}
              </Text>

              <MobileSelectField
                label="Jenis Entri"
                value={form.entryType}
                options={entryTypeOptions.slice(1)}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    entryType: value as HomeroomBookEntryType,
                    relatedSemester: value === 'EXAM_FINANCE_EXCEPTION' ? prev.relatedSemester : '',
                    relatedProgramCode: value === 'EXAM_FINANCE_EXCEPTION' ? prev.relatedProgramCode : '',
                  }))
                }
                placeholder="Pilih jenis entri"
              />

              <MobileSelectField
                label="Siswa"
                value={form.studentId}
                options={studentOptions}
                onChange={(value) => setForm((prev) => ({ ...prev, studentId: value }))}
                placeholder="Pilih siswa"
              />

              <TextInput
                value={form.title}
                onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
                placeholder="Judul"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 10,
                }}
              />

              <TextInput
                value={form.summary}
                onChangeText={(value) => setForm((prev) => ({ ...prev, summary: value }))}
                placeholder="Ringkasan"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 10,
                  minHeight: 88,
                  textAlignVertical: 'top',
                }}
              />

              <TextInput
                value={form.incidentDate}
                onChangeText={(value) => setForm((prev) => ({ ...prev, incidentDate: value }))}
                placeholder="Tanggal kejadian (YYYY-MM-DD)"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 10,
                }}
              />

              {form.entryType === 'EXAM_FINANCE_EXCEPTION' ? (
                <>
                  <MobileSelectField
                    label="Semester Ujian"
                    value={form.relatedSemester}
                    options={[
                      { value: 'ODD', label: 'Ganjil' },
                      { value: 'EVEN', label: 'Genap' },
                    ]}
                    onChange={(value) => setForm((prev) => ({ ...prev, relatedSemester: value as 'ODD' | 'EVEN' }))}
                    placeholder="Pilih semester"
                  />

                  <MobileSelectField
                    label="Program Ujian"
                    value={form.relatedProgramCode}
                    options={availablePrograms.map((program) => ({
                      value: program.code,
                      label: `${program.shortLabel || program.label} (${program.code})`,
                    }))}
                    onChange={(value) => setForm((prev) => ({ ...prev, relatedProgramCode: value }))}
                    placeholder="Pilih program ujian"
                    helperText={availablePrograms.length === 0 ? 'Program ujian aktif belum tersedia.' : undefined}
                  />
                </>
              ) : null}

              <TextInput
                value={form.notes}
                onChangeText={(value) => setForm((prev) => ({ ...prev, notes: value }))}
                placeholder="Catatan tambahan"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={4}
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 10,
                  minHeight: 100,
                  textAlignVertical: 'top',
                }}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={() => setForm((prev) => ({ ...prev, visibilityToPrincipal: !prev.visibilityToPrincipal }))}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: form.visibilityToPrincipal ? '#2563eb' : '#d6e2f7',
                    backgroundColor: form.visibilityToPrincipal ? '#eff6ff' : '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: form.visibilityToPrincipal ? '#1d4ed8' : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                    Principal
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setForm((prev) => ({ ...prev, visibilityToStudentAffairs: !prev.visibilityToStudentAffairs }))
                  }
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: form.visibilityToStudentAffairs ? '#d97706' : '#d6e2f7',
                    backgroundColor: form.visibilityToStudentAffairs ? '#fff7ed' : '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: form.visibilityToStudentAffairs ? '#b45309' : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                    Wakasek Kesiswaan
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={pickAttachments}
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  {attachments.length > 0 ? `Lampiran Dipilih (${attachments.length})` : 'Pilih Lampiran'}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                  PDF/JPG/JPEG/PNG, maksimal 500KB per file
                </Text>
              </Pressable>

              {editingEntry?.attachments.length ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Lampiran saat ini: {editingEntry.attachments.map((item) => item.originalName).join(', ')}
                </Text>
              ) : null}
              {attachments.map((asset) => (
                <Text key={`${asset.uri}-${asset.name}`} style={{ color: '#475569', fontSize: 12, marginBottom: 4 }}>
                  • {asset.name}
                </Text>
              ))}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Pressable
                  onPress={resetForm}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#d6e2f7',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Batal</Text>
                </Pressable>
                <Pressable
                  onPress={() => saveMutation.mutate()}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#2563eb',
                    backgroundColor: '#2563eb',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: saveMutation.isPending ? 0.6 : 1,
                  }}
                  disabled={saveMutation.isPending}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {listQuery.isLoading ? <QueryStateView type="loading" message="Memuat Buku Wali Kelas..." /> : null}
          {listQuery.isError ? <QueryStateView type="error" message="Gagal memuat Buku Wali Kelas." onRetry={() => listQuery.refetch()} /> : null}

          {!listQuery.isLoading && !listQuery.isError ? (
            entries.length > 0 ? (
              entries.map((entry) => {
                const statusStyle = getStatusStyle(entry.status);
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
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>{entry.title}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3 }}>
                          {entry.student.name} • {entry.class.name}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                          {formatDate(entry.incidentDate)} • {getEntryTypeLabel(entry.entryType)}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          backgroundColor: statusStyle.bg,
                          borderWidth: 1,
                          borderColor: statusStyle.border,
                          alignSelf: 'flex-start',
                        }}
                      >
                        <Text style={{ color: statusStyle.text, fontWeight: '700', fontSize: 11 }}>{entry.status}</Text>
                      </View>
                    </View>

                    <Text style={{ color: '#334155', marginTop: 10 }}>{entry.summary}</Text>
                    {entry.notes ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>{entry.notes}</Text> : null}

                    {entry.entryType === 'EXAM_FINANCE_EXCEPTION' ? (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ color: '#475569', fontSize: 12 }}>
                          Semester: {entry.relatedSemester === 'ODD' ? 'Ganjil' : entry.relatedSemester === 'EVEN' ? 'Genap' : '-'}
                        </Text>
                        <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>Program: {entry.relatedProgramCode || '-'}</Text>
                        {entry.allowsExamAccess ? (
                          <Text style={{ color: '#166534', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                            Akses ujian aktif dari pengecualian wali kelas
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {entry.visibilityToPrincipal ? (
                        <View style={{ borderRadius: 999, backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>Principal</Text>
                        </View>
                      ) : null}
                      {entry.visibilityToStudentAffairs ? (
                        <View style={{ borderRadius: 999, backgroundColor: '#fff7ed', paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ color: '#b45309', fontSize: 11, fontWeight: '700' }}>Wakasek Kesiswaan</Text>
                        </View>
                      ) : null}
                    </View>

                    {entry.attachments.length > 0 ? (
                      <View style={{ marginTop: 10 }}>
                        {entry.attachments.map((attachment) => (
                          <Pressable key={attachment.id} onPress={() => openAttachment(attachment.fileUrl)} style={{ marginBottom: 6 }}>
                            <Text style={{ color: '#2563eb', fontWeight: '700' }}>Buka: {attachment.originalName}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    {editable ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        <Pressable
                          onPress={() => openEdit(entry)}
                          style={{
                            borderWidth: 1,
                            borderColor: '#d6e2f7',
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 9,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Feather name="edit-2" size={14} color={BRAND_COLORS.textDark} />
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginLeft: 6 }}>Edit</Text>
                        </Pressable>

                        {entry.status !== 'ACTIVE' ? (
                          <Pressable
                            onPress={() =>
                              statusMutation.mutate({
                                id: entry.id,
                                status: 'ACTIVE',
                              })
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: '#86efac',
                              backgroundColor: '#dcfce7',
                              borderRadius: 10,
                              paddingHorizontal: 12,
                              paddingVertical: 9,
                            }}
                          >
                            <Text style={{ color: '#166534', fontWeight: '700' }}>Aktifkan</Text>
                          </Pressable>
                        ) : (
                          <>
                            <Pressable
                              onPress={() =>
                                statusMutation.mutate({
                                  id: entry.id,
                                  status: 'RESOLVED',
                                })
                              }
                              style={{
                                borderWidth: 1,
                                borderColor: '#93c5fd',
                                backgroundColor: '#dbeafe',
                                borderRadius: 10,
                                paddingHorizontal: 12,
                                paddingVertical: 9,
                              }}
                            >
                              <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Selesai</Text>
                            </Pressable>
                            <Pressable
                              onPress={() =>
                                statusMutation.mutate({
                                  id: entry.id,
                                  status: 'CANCELLED',
                                })
                              }
                              style={{
                                borderWidth: 1,
                                borderColor: '#fca5a5',
                                backgroundColor: '#fee2e2',
                                borderRadius: 10,
                                paddingHorizontal: 12,
                                paddingVertical: 9,
                              }}
                            >
                              <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Batalkan</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum Ada Entri</Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Belum ada Buku Wali Kelas yang cocok dengan filter saat ini.
                </Text>
              </View>
            )
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export default HomeroomBookMobilePanel;
