import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  Eye,
  FileText,
  Pencil,
  Plus,
  RefreshCcw,
  Shield,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { classService } from '../../services/class.service';
import type { ExamProgram } from '../../services/exam.service';
import {
  homeroomBookService,
  type HomeroomBookAttachmentPayload,
  type HomeroomBookEntry,
  type HomeroomBookEntryType,
  type HomeroomBookStatus,
  type HomeroomBookWritePayload,
} from '../../services/homeroomBook.service';
import { uploadService } from '../../services/upload.service';
import { userService } from '../../services/user.service';

type HomeroomBookPanelMode = 'homeroom' | 'student_affairs' | 'principal';

type HomeroomBookPanelProps = {
  mode: HomeroomBookPanelMode;
  academicYearId?: number | null;
  classId?: number | null;
  examPrograms?: ExamProgram[];
};

type HomeroomBookFormState = {
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
  files: File[];
};

const MAX_ATTACHMENT_BYTES = 500 * 1024;
const MAX_ATTACHMENT_COUNT = 5;
const ALLOWED_ATTACHMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const DEFAULT_FORM_STATE = (): HomeroomBookFormState => ({
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
  files: [],
});

const ENTRY_TYPE_OPTIONS: Array<{ value: HomeroomBookEntryType; label: string; description: string }> = [
  {
    value: 'EXAM_FINANCE_EXCEPTION',
    label: 'Pengecualian Ujian Finance',
    description: 'Dipakai jika siswa tetap diikutkan ujian meski ada kendala tunggakan keuangan.',
  },
  {
    value: 'STUDENT_CASE_REPORT',
    label: 'Laporan Kasus Siswa',
    description: 'Dipakai untuk pelaporan kejadian atau tindak lanjut siswa ke pimpinan.',
  },
];

const STATUS_OPTIONS: Array<{ value: '' | HomeroomBookStatus; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'RESOLVED', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

const ENTRY_TYPE_FILTER_OPTIONS: Array<{ value: '' | HomeroomBookEntryType; label: string }> = [
  { value: '', label: 'Semua Jenis' },
  { value: 'EXAM_FINANCE_EXCEPTION', label: 'Pengecualian Ujian Finance' },
  { value: 'STUDENT_CASE_REPORT', label: 'Laporan Kasus Siswa' },
];

function getEntryTypeLabel(value: HomeroomBookEntryType) {
  return ENTRY_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function getStatusLabel(value: HomeroomBookStatus) {
  if (value === 'ACTIVE') return 'Aktif';
  if (value === 'RESOLVED') return 'Selesai';
  return 'Dibatalkan';
}

function getStatusClasses(value: HomeroomBookStatus) {
  if (value === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
  if (value === 'RESOLVED') return 'bg-blue-100 text-blue-700';
  return 'bg-rose-100 text-rose-700';
}

function validateAttachmentFile(file: File): string | null {
  const normalizedType = String(file.type || '').toLowerCase();
  if (!ALLOWED_ATTACHMENT_TYPES.has(normalizedType)) {
    return `Format ${file.name} tidak didukung. Gunakan PDF, JPG, JPEG, atau PNG.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `Ukuran ${file.name} melebihi 500KB.`;
  }
  return null;
}

function buildFormState(entry?: HomeroomBookEntry | null): HomeroomBookFormState {
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
    files: [],
  };
}

function getPanelTitle(mode: HomeroomBookPanelMode) {
  if (mode === 'principal') return 'Monitoring Buku Wali Kelas';
  if (mode === 'student_affairs') return 'Monitoring Buku Wali Kelas';
  return 'Buku Wali Kelas';
}

function getPanelDescription(mode: HomeroomBookPanelMode) {
  if (mode === 'principal') {
    return 'Kepala Sekolah dapat memonitor pengecualian ujian finance dan laporan kasus siswa yang diajukan wali kelas.';
  }
  if (mode === 'student_affairs') {
    return 'Wakasek Kesiswaan dapat membaca entri Buku Wali Kelas sebagai bahan monitoring dan koordinasi tindak lanjut.';
  }
  return 'Kelola pengecualian ujian finance dan laporan kasus siswa dengan bukti lampiran yang terdokumentasi.';
}

export function HomeroomBookPanel({
  mode,
  academicYearId,
  classId,
  examPrograms = [],
}: HomeroomBookPanelProps) {
  const editable = mode === 'homeroom';
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<'' | HomeroomBookEntryType>('');
  const [statusFilter, setStatusFilter] = useState<'' | HomeroomBookStatus>('');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HomeroomBookEntry | null>(null);
  const [formState, setFormState] = useState<HomeroomBookFormState>(DEFAULT_FORM_STATE);

  const availablePrograms = useMemo(
    () =>
      examPrograms
        .filter((program) => program.isActive)
        .sort((a, b) => {
          const orderCompare = Number(a.order || 0) - Number(b.order || 0);
          if (orderCompare !== 0) return orderCompare;
          return String(a.label || '').localeCompare(String(b.label || ''), 'id-ID');
        }),
    [examPrograms],
  );

  const classesQuery = useQuery({
    queryKey: ['homeroom-book-web-classes', academicYearId, mode],
    queryFn: async () => {
      if (!academicYearId || editable) return [];
      const response = await classService.list({ academicYearId, limit: 500 });
      const classes = Array.isArray(response?.data?.classes) ? response.data.classes : [];
      return classes.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'id-ID'));
    },
    enabled: !editable && !!academicYearId,
    staleTime: 5 * 60 * 1000,
  });

  const studentsQuery = useQuery({
    queryKey: ['homeroom-book-web-students', classId],
    queryFn: async () => {
      if (!classId || !editable) return [];
      const response = await userService.getUsers({ role: 'STUDENT', class_id: classId, limit: 500 });
      const students = Array.isArray(response?.data) ? response.data : [];
      return students.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id-ID'));
    },
    enabled: editable && !!classId,
    staleTime: 5 * 60 * 1000,
  });

  const entriesQuery = useQuery({
    queryKey: [
      'homeroom-book-web-list',
      mode,
      academicYearId,
      editable ? classId : classFilter,
      entryTypeFilter,
      statusFilter,
      search,
      page,
      limit,
    ],
    queryFn: async () => {
      if (!academicYearId) {
        return {
          entries: [],
          meta: { page: 1, limit, total: 0, totalPages: 0 },
        };
      }

      return homeroomBookService.list({
        academicYearId,
        classId: editable ? classId || undefined : classFilter !== 'ALL' ? Number(classFilter) : undefined,
        entryType: entryTypeFilter || undefined,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit,
      });
    },
    enabled: !!academicYearId && (!editable || !!classId),
    placeholderData: keepPreviousData,
  });

  const resetForm = () => {
    setEditingEntry(null);
    setFormState(DEFAULT_FORM_STATE());
    setFormOpen(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!academicYearId) {
        throw new Error('Tahun ajaran aktif belum tersedia.');
      }
      if (!classId && editable) {
        throw new Error('Kelas wali belum tersedia.');
      }
      const studentId = Number(formState.studentId);
      if (!Number.isFinite(studentId) || studentId <= 0) {
        throw new Error('Pilih siswa terlebih dahulu.');
      }
      if (!formState.title.trim()) {
        throw new Error('Judul wajib diisi.');
      }
      if (!formState.summary.trim()) {
        throw new Error('Ringkasan wajib diisi.');
      }
      if (!formState.incidentDate) {
        throw new Error('Tanggal kejadian wajib diisi.');
      }
      if (formState.files.length > MAX_ATTACHMENT_COUNT) {
        throw new Error(`Lampiran maksimal ${MAX_ATTACHMENT_COUNT} file.`);
      }

      for (const file of formState.files) {
        const error = validateAttachmentFile(file);
        if (error) throw new Error(error);
      }

      const requiresExamFields = formState.entryType === 'EXAM_FINANCE_EXCEPTION';
      if (requiresExamFields) {
        if (!formState.relatedSemester) {
          throw new Error('Semester ujian wajib dipilih.');
        }
        if (!formState.relatedProgramCode.trim()) {
          throw new Error('Program ujian wajib dipilih.');
        }
        if (!editingEntry && formState.files.length === 0) {
          throw new Error('Lampiran perjanjian wajib diunggah.');
        }
      }

      const uploadedAttachments: HomeroomBookAttachmentPayload[] = [];
      for (const file of formState.files) {
        const uploaded = await uploadService.uploadHomeroomBookFile(file);
        uploadedAttachments.push({
          fileUrl: uploaded.url,
          fileName: uploaded.filename,
          originalName: uploaded.originalname,
          mimeType: uploaded.mimetype,
          fileSize: uploaded.size,
        });
      }

      const payload: HomeroomBookWritePayload = {
        studentId,
        classId: Number(classId),
        academicYearId,
        entryType: formState.entryType,
        title: formState.title.trim(),
        summary: formState.summary.trim(),
        notes: formState.notes.trim() || null,
        incidentDate: `${formState.incidentDate}T00:00:00.000Z`,
        relatedSemester: requiresExamFields ? formState.relatedSemester || null : null,
        relatedProgramCode: requiresExamFields ? formState.relatedProgramCode.trim() : null,
        visibilityToPrincipal: formState.visibilityToPrincipal,
        visibilityToStudentAffairs: formState.visibilityToStudentAffairs,
        ...(uploadedAttachments.length > 0 ? { attachments: uploadedAttachments } : {}),
      };

      if (editingEntry) {
        return homeroomBookService.update(editingEntry.id, payload);
      }
      return homeroomBookService.create(payload);
    },
    onSuccess: () => {
      toast.success(editingEntry ? 'Buku Wali Kelas berhasil diperbarui.' : 'Buku Wali Kelas berhasil dibuat.');
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['homeroom-book-web-list'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan Buku Wali Kelas.');
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: { id: number; status: HomeroomBookStatus; message: string }) => {
      await homeroomBookService.updateStatus(payload.id, { status: payload.status });
      return payload;
    },
    onSuccess: (payload) => {
      toast.success(payload.message);
      void queryClient.invalidateQueries({ queryKey: ['homeroom-book-web-list'] });
    },
    onError: () => {
      toast.error('Gagal memperbarui status Buku Wali Kelas.');
    },
  });

  const entries = entriesQuery.data?.entries || [];
  const meta = entriesQuery.data?.meta || { page: 1, limit, total: 0, totalPages: 0 };

  const studentOptions = useMemo(() => {
    const students = Array.isArray(studentsQuery.data) ? studentsQuery.data : [];
    return students.map((student) => ({
      id: student.id,
      label: `${student.name}${student.nis ? ` - ${student.nis}` : student.nisn ? ` - ${student.nisn}` : ''}`,
    }));
  }, [studentsQuery.data]);

  const openCreateForm = () => {
    setEditingEntry(null);
    setFormState(DEFAULT_FORM_STATE());
    setFormOpen(true);
  };

  const openEditForm = (entry: HomeroomBookEntry) => {
    setEditingEntry(entry);
    setFormState(buildFormState(entry));
    setFormOpen(true);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []).slice(0, MAX_ATTACHMENT_COUNT);
    if (nextFiles.length === 0) {
      setFormState((prev) => ({ ...prev, files: [] }));
      return;
    }
    for (const file of nextFiles) {
      const error = validateAttachmentFile(file);
      if (error) {
        toast.error(error);
        event.target.value = '';
        return;
      }
    }
    setFormState((prev) => ({ ...prev, files: nextFiles }));
  };

  const canRenderList = !!academicYearId && (!editable || !!classId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{getPanelTitle(mode)}</h3>
          <p className="text-sm text-gray-500">{getPanelDescription(mode)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => entriesQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Muat Ulang
          </button>
          {editable ? (
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Tambah Entri
            </button>
          ) : null}
        </div>
      </div>

      {!canRenderList ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {editable
            ? 'Kelas wali aktif belum ditemukan. Buku Wali Kelas akan tersedia setelah kelas wali pada tahun ajaran aktif terdeteksi.'
            : 'Tahun ajaran aktif belum tersedia, sehingga monitoring Buku Wali Kelas belum dapat dimuat.'}
        </div>
      ) : null}

      {editable && formOpen ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-base font-semibold text-gray-900">
                {editingEntry ? 'Perbarui Entri Buku Wali Kelas' : 'Tambah Entri Buku Wali Kelas'}
              </h4>
              <p className="text-sm text-gray-500">
                Gunakan jenis entri yang sesuai agar data dapat dipantau oleh pihak terkait.
              </p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <XCircle className="h-4 w-4" />
              Tutup
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="space-y-2 text-sm text-gray-700">
              <span className="font-medium">Jenis Entri</span>
              <select
                value={formState.entryType}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    entryType: event.target.value as HomeroomBookEntryType,
                    relatedSemester:
                      event.target.value === 'EXAM_FINANCE_EXCEPTION' ? prev.relatedSemester : '',
                    relatedProgramCode:
                      event.target.value === 'EXAM_FINANCE_EXCEPTION' ? prev.relatedProgramCode : '',
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {ENTRY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                {ENTRY_TYPE_OPTIONS.find((option) => option.value === formState.entryType)?.description}
              </p>
            </label>

            <label className="space-y-2 text-sm text-gray-700">
              <span className="font-medium">Siswa</span>
              <select
                value={formState.studentId}
                onChange={(event) => setFormState((prev) => ({ ...prev, studentId: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Pilih siswa</option>
                {studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-gray-700 lg:col-span-2">
              <span className="font-medium">Judul</span>
              <input
                type="text"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Contoh: Pengecualian ujian karena perjanjian pelunasan"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <label className="space-y-2 text-sm text-gray-700 lg:col-span-2">
              <span className="font-medium">Ringkasan</span>
              <textarea
                value={formState.summary}
                onChange={(event) => setFormState((prev) => ({ ...prev, summary: event.target.value }))}
                rows={3}
                placeholder="Ringkas alasan, situasi, atau keputusan wali kelas."
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <label className="space-y-2 text-sm text-gray-700">
              <span className="font-medium">Tanggal Kejadian</span>
              <input
                type="date"
                value={formState.incidentDate}
                onChange={(event) => setFormState((prev) => ({ ...prev, incidentDate: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            {formState.entryType === 'EXAM_FINANCE_EXCEPTION' ? (
              <>
                <label className="space-y-2 text-sm text-gray-700">
                  <span className="font-medium">Semester Ujian</span>
                  <select
                    value={formState.relatedSemester}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, relatedSemester: event.target.value as '' | 'ODD' | 'EVEN' }))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Pilih semester</option>
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm text-gray-700 lg:col-span-2">
                  <span className="font-medium">Program Ujian</span>
                  <select
                    value={formState.relatedProgramCode}
                    onChange={(event) => setFormState((prev) => ({ ...prev, relatedProgramCode: event.target.value }))}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Pilih program ujian</option>
                    {availablePrograms.map((program) => (
                      <option key={program.code} value={program.code}>
                        {program.shortLabel || program.label} ({program.code})
                      </option>
                    ))}
                  </select>
                  {availablePrograms.length === 0 ? (
                    <p className="text-xs text-amber-700">Program ujian aktif belum tersedia untuk dipilih.</p>
                  ) : null}
                </label>
              </>
            ) : null}

            <label className="space-y-2 text-sm text-gray-700 lg:col-span-2">
              <span className="font-medium">Catatan Tambahan</span>
              <textarea
                value={formState.notes}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
                placeholder="Tuliskan detail perjanjian, tindak lanjut, atau kronologi tambahan."
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
              <div>
                <p className="text-sm font-medium text-gray-900">Visibilitas Monitoring</p>
                <p className="text-xs text-gray-500">
                  Atur role yang dapat memantau entri ini secara read only.
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formState.visibilityToPrincipal}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, visibilityToPrincipal: event.target.checked }))
                  }
                />
                <span>Tampilkan ke Principal</span>
              </label>
              <label className="flex items-center gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formState.visibilityToStudentAffairs}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, visibilityToStudentAffairs: event.target.checked }))
                  }
                />
                <span>Tampilkan ke Wakasek Kesiswaan</span>
              </label>
            </div>

            <label className="space-y-2 text-sm text-gray-700 lg:col-span-2">
              <span className="font-medium">Lampiran</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                onChange={handleFileChange}
                className="block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700"
              />
              <p className="text-xs text-gray-500">
                Maksimal {MAX_ATTACHMENT_COUNT} file. Ukuran tiap file maksimal 500KB dengan format PDF, JPG, JPEG, atau PNG.
              </p>
              {editingEntry?.attachments.length ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Lampiran saat ini: {editingEntry.attachments.map((attachment) => attachment.originalName).join(', ')}
                  {formState.files.length > 0 ? ' | File baru akan menggantikan lampiran saat ini.' : ''}
                </div>
              ) : null}
              {formState.files.length > 0 ? (
                <ul className="space-y-1 text-xs text-gray-600">
                  {formState.files.map((file) => (
                    <li key={`${file.name}-${file.size}`}>{file.name}</li>
                  ))}
                </ul>
              ) : null}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveMutation.isPending ? 'Menyimpan...' : editingEntry ? 'Simpan Perubahan' : 'Simpan Entri'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-2 xl:max-w-3xl xl:grid-cols-4">
              <input
                type="text"
                placeholder="Cari siswa, judul, ringkasan"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              {!editable ? (
                <select
                  value={classFilter}
                  onChange={(event) => {
                    setClassFilter(event.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">Semua Kelas</option>
                  {(classesQuery.data || []).map((cls: { id: number; name: string }) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <select
                value={entryTypeFilter}
                onChange={(event) => {
                  setEntryTypeFilter(event.target.value as '' | HomeroomBookEntryType);
                  setPage(1);
                }}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {ENTRY_TYPE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value || 'ALL'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as '' | HomeroomBookStatus);
                  setPage(1);
                }}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'ALL'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Tampilkan</span>
              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {entriesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              Memuat Buku Wali Kelas...
            </div>
          ) : entriesQuery.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <AlertTriangle className="h-10 w-10 text-rose-300" />
              <div>
                <p className="text-sm font-medium text-gray-900">Gagal memuat Buku Wali Kelas.</p>
                <p className="text-sm text-gray-500">Silakan muat ulang untuk mencoba lagi.</p>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <BookOpenText className="h-10 w-10 text-gray-300" />
              <div>
                <p className="text-sm font-medium text-gray-900">Belum ada entri yang cocok.</p>
                <p className="text-sm text-gray-500">
                  {editable
                    ? 'Mulai dokumentasikan pengecualian ujian atau laporan kasus siswa dari tab ini.'
                    : 'Belum ada entri Buku Wali Kelas yang tampil pada filter saat ini.'}
                </p>
              </div>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Siswa</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Jenis</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Ringkasan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Monitoring</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Lampiran</th>
                  {editable ? (
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Aksi</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <div className="font-medium text-gray-900">
                        {format(new Date(entry.incidentDate), 'dd MMM yyyy', { locale: idLocale })}
                      </div>
                      <div className="text-xs text-gray-500">
                        Diperbarui {format(new Date(entry.updatedAt), 'dd/MM/yyyy', { locale: idLocale })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <div className="font-medium text-gray-900">{entry.student.name}</div>
                      <div className="text-xs text-gray-500">
                        {entry.student.nis || '-'} / {entry.student.nisn || '-'}
                      </div>
                      <div className="text-xs text-gray-500">{entry.class.name}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {getEntryTypeLabel(entry.entryType)}
                      </span>
                      {entry.entryType === 'EXAM_FINANCE_EXCEPTION' ? (
                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                          <div>Semester: {entry.relatedSemester === 'ODD' ? 'Ganjil' : entry.relatedSemester === 'EVEN' ? 'Genap' : '-'}</div>
                          <div>Program: {entry.relatedProgramCode || '-'}</div>
                          {entry.allowsExamAccess ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Akses ujian aktif
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <div className="space-y-2">
                        <p className="font-medium text-gray-900">{entry.title}</p>
                        <p>{entry.summary}</p>
                        {entry.notes ? <p className="text-xs text-gray-500">{entry.notes}</p> : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <div className="space-y-2">
                        {entry.visibilityToPrincipal ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                            <Shield className="h-3.5 w-3.5" />
                            Principal
                          </span>
                        ) : null}
                        {entry.visibilityToStudentAffairs ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                            <Eye className="h-3.5 w-3.5" />
                            Wakasek Kesiswaan
                          </span>
                        ) : null}
                        {!entry.visibilityToPrincipal && !entry.visibilityToStudentAffairs ? (
                          <span className="text-xs text-gray-400">Hanya wali kelas</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(entry.status)}`}>
                        {getStatusLabel(entry.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-sm text-gray-600">
                      {entry.attachments.length === 0 ? (
                        <span className="text-gray-300">-</span>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-xs text-gray-500">{entry.attachments.length} file</span>
                          <div className="flex flex-col items-center gap-1">
                            {entry.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {attachment.originalName}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    {editable ? (
                      <td className="px-4 py-4 text-center text-sm text-gray-600">
                        <div className="flex flex-col items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(entry)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>

                          {entry.status !== 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (!window.confirm('Aktifkan kembali entri ini?')) return;
                                statusMutation.mutate({
                                  id: entry.id,
                                  status: 'ACTIVE',
                                  message: 'Status Buku Wali Kelas diaktifkan kembali.',
                                });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Aktifkan
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!window.confirm('Tandai entri ini sebagai selesai?')) return;
                                  statusMutation.mutate({
                                    id: entry.id,
                                    status: 'RESOLVED',
                                    message: 'Status Buku Wali Kelas ditandai selesai.',
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Selesai
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!window.confirm('Batalkan entri ini?')) return;
                                  statusMutation.mutate({
                                    id: entry.id,
                                    status: 'CANCELLED',
                                    message: 'Status Buku Wali Kelas dibatalkan.',
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Batalkan
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-600">
          <p>
            Menampilkan <span className="font-medium text-gray-900">{meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}</span>
            {' '}sampai <span className="font-medium text-gray-900">{Math.min(meta.page * meta.limit, meta.total)}</span>
            {' '}dari <span className="font-medium text-gray-900">{meta.total}</span> entri
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(meta.totalPages || 1, prev + 1))}
              disabled={page >= (meta.totalPages || 1)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeroomBookPanel;
