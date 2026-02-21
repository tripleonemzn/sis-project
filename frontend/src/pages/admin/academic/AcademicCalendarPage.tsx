import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import {
  academicEventService,
  type AcademicEvent,
  type AcademicEventType,
  type AcademicEventSemester,
  type AcademicEventListResponse,
} from '../../../services/academicEvent.service';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, X, Edit, Trash2, Filter, CalendarRange } from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const EVENT_TYPES: {
  value: AcademicEventType | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Semua Jenis' },
  { value: 'LIBUR_NASIONAL', label: 'Libur Nasional' },
  { value: 'LIBUR_SEKOLAH', label: 'Libur Sekolah' },
  { value: 'UJIAN_PTS', label: 'SBTS' },
  { value: 'UJIAN_PAS', label: 'SAS' },
  { value: 'UJIAN_PAT', label: 'SAT' },
  { value: 'MPLS', label: 'MPLS' },
  { value: 'RAPOR', label: 'Rapor' },
  { value: 'KEGIATAN_SEKOLAH', label: 'Kegiatan Sekolah' },
  { value: 'LAINNYA', label: 'Lainnya' },
];

type SemesterFilter = 'ALL' | AcademicEventSemester;

const SEMESTER_OPTIONS: {
  value: SemesterFilter;
  label: string;
}[] = [
  { value: 'ALL', label: 'Satu Tahun Penuh' },
  { value: 'ODD', label: 'Semester Ganjil' },
  { value: 'EVEN', label: 'Semester Genap' },
];

const schema = z.object({
  academicYearId: z.number(),
  title: z.string().min(1, 'Judul wajib diisi'),
  type: z.enum([
    'LIBUR_NASIONAL',
    'LIBUR_SEKOLAH',
    'UJIAN_PTS',
    'UJIAN_PAS',
    'UJIAN_PAT',
    'MPLS',
    'RAPOR',
    'KEGIATAN_SEKOLAH',
    'LAINNYA',
  ]),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi'),
  endDate: z.string().min(1, 'Tanggal berakhir wajib diisi'),
  semester: z.enum(['ODD', 'EVEN']).optional().nullable(),
  isHoliday: z.boolean().optional(),
  description: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

export const AcademicCalendarPage = () => {
  const queryClient = useQueryClient();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | ''>('');
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<AcademicEventType | 'ALL'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const {
    data: academicYearData,
  } = useQuery({
    queryKey: ['academic-years', 'all'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears: AcademicYear[] = useMemo(
    () =>
      academicYearData?.data?.academicYears || academicYearData?.academicYears || [],
    [academicYearData],
  );

  const effectiveAcademicYearId = useMemo<number | ''>(() => {
    if (!academicYears.length) {
      return '';
    }
    if (selectedAcademicYearId) {
      const exists = academicYears.some((ay) => ay.id === selectedAcademicYearId);
      if (exists) {
        return selectedAcademicYearId;
      }
    }
    const active = academicYears.find((ay) => ay.isActive);
    if (active) {
      return active.id;
    }
    return academicYears[0]?.id ?? '';
  }, [academicYears, selectedAcademicYearId]);

  const {
    data: eventsResponse,
    isLoading: isLoadingEvents,
    isFetching: isFetchingEvents,
  } = useQuery<{ data: AcademicEventListResponse }>({
    queryKey: ['academic-events', effectiveAcademicYearId, semesterFilter, typeFilter],
    queryFn: () =>
      academicEventService.list({
        academicYearId: effectiveAcademicYearId as number,
        semester: semesterFilter,
        type: typeFilter,
      }),
    enabled: !!effectiveAcademicYearId,
  });

  const events: AcademicEvent[] = eventsResponse?.data?.events || [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      academicYearId: typeof effectiveAcademicYearId === 'number' ? effectiveAcademicYearId : 0,
      title: '',
      type: 'LIBUR_NASIONAL',
      startDate: '',
      endDate: '',
      semester: null,
      isHoliday: false,
      description: '',
    },
  });

  useEffect(() => {
    if (typeof effectiveAcademicYearId === 'number') {
      setValue('academicYearId', effectiveAcademicYearId);
    }
  }, [effectiveAcademicYearId, setValue]);

  const createMutation = useMutation({
    mutationFn: academicEventService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-events'] });
      toast.success('Event kalender akademik berhasil dibuat');
      setShowForm(false);
      setEditingId(null);
      reset({
        academicYearId:
          typeof effectiveAcademicYearId === 'number' ? effectiveAcademicYearId : 0,
        title: '',
        type: 'LIBUR_NASIONAL',
        startDate: '',
        endDate: '',
        semester: null,
        isHoliday: false,
        description: '',
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<FormValues>;
    }) => academicEventService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-events'] });
      toast.success('Event kalender akademik berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset({
        academicYearId:
          typeof effectiveAcademicYearId === 'number' ? effectiveAcademicYearId : 0,
        title: '',
        type: 'LIBUR_NASIONAL',
        startDate: '',
        endDate: '',
        semester: null,
        isHoliday: false,
        description: '',
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => academicEventService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-events'] });
      toast.success('Event kalender akademik dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  const onSubmit = (values: FormValues) => {
    const start = new Date(values.startDate);
    const end = new Date(values.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      toast.error('Tanggal mulai dan berakhir harus valid');
      return;
    }

    if (start > end) {
      toast.error('Tanggal mulai harus sebelum atau sama dengan tanggal berakhir');
      return;
    }

    const payload: FormValues = {
      ...values,
      semester: values.semester ?? null,
      description: values.description?.trim() === '' ? null : values.description,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (item: AcademicEvent) => {
    setEditingId(item.id);
    setShowForm(true);
    setValue('academicYearId', item.academicYearId);
    setValue('title', item.title);
    setValue('type', item.type);
    setValue('startDate', item.startDate.slice(0, 10));
    setValue('endDate', item.endDate.slice(0, 10));
    setValue('semester', item.semester ?? null);
    setValue('isHoliday', item.isHoliday);
    setValue('description', item.description ?? '');
  };

  const handleDelete = (item: AcademicEvent) => {
    if (!confirm(`Hapus event "${item.title}"?`)) return;
    deleteMutation.mutate(item.id);
  };

  const loading = isLoadingEvents || isFetchingEvents;

  const selectedYear = useMemo(
    () => academicYears.find((ay) => ay.id === effectiveAcademicYearId),
    [academicYears, effectiveAcademicYearId],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kalender Akademik</h1>
          <p className="text-gray-500">
            Kelola event penting tahun ajaran: libur, ujian, rapor, dan kegiatan sekolah.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => {
              if (!effectiveAcademicYearId) {
                toast.error('Pilih tahun ajaran terlebih dahulu');
                return;
              }
              if (showForm && editingId) {
                setEditingId(null);
                reset({
                  academicYearId:
                    typeof effectiveAcademicYearId === 'number'
                      ? effectiveAcademicYearId
                      : 0,
                  title: '',
                  type: 'LIBUR_NASIONAL',
                  startDate: '',
                  endDate: '',
                  semester: null,
                  isHoliday: false,
                  description: '',
                });
              }
              setShowForm((prev) => !prev);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!effectiveAcademicYearId}
          >
            {showForm ? (
              <>
                <X className="w-4 h-4" />
                <span>Tutup Form</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Tambah Event</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="calendar-academic-year"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tahun Ajaran
            </label>
            <select
              id="calendar-academic-year"
              name="calendar-academic-year"
              value={effectiveAcademicYearId}
              onChange={(e) =>
                setSelectedAcademicYearId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Pilih Tahun Ajaran</option>
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="calendar-semester"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Periode
            </label>
            <select
              id="calendar-semester"
              name="calendar-semester"
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value as SemesterFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {SEMESTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="calendar-type"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Jenis Event
            </label>
            <select
              id="calendar-type"
              name="calendar-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AcademicEventType | 'ALL')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {EVENT_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Filter className="w-4 h-4 text-gray-400" />
              {selectedYear ? (
                <span>
                  Menampilkan event untuk{' '}
                  <span className="font-semibold text-gray-700">{selectedYear.name}</span>
                </span>
              ) : (
                <span>Pilih tahun ajaran untuk melihat event.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowForm(false);
            setEditingId(null);
            reset({
              academicYearId:
                typeof effectiveAcademicYearId === 'number' ? effectiveAcademicYearId : 0,
              title: '',
              type: 'LIBUR_NASIONAL',
              startDate: '',
              endDate: '',
              semester: null,
              isHoliday: false,
              description: '',
            });
          }}
        >
          <div
            className="bg-white rounded shadow-md w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">
                {editingId ? 'Edit Event Kalender Akademik' : 'Tambah Event Kalender Akademik'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  reset({
                    academicYearId:
                      typeof effectiveAcademicYearId === 'number' ? effectiveAcademicYearId : 0,
                    title: '',
                    type: 'LIBUR_NASIONAL',
                    startDate: '',
                    endDate: '',
                    semester: null,
                    isHoliday: false,
                    description: '',
                  });
                }}
                className="p-2 text-gray-500 hover:text-gray-700"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label
                      htmlFor="academicYearId"
                      className="block text-sm text-gray-700 mb-1"
                    >
                      Tahun Ajaran
                    </label>
                    <select
                      id="academicYearId"
                      {...register('academicYearId', { valueAsNumber: true })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Pilih Tahun Ajaran</option>
                      {academicYears.map((ay) => (
                        <option key={ay.id} value={ay.id}>
                          {ay.name}
                        </option>
                      ))}
                    </select>
                    {errors.academicYearId && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.academicYearId.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="type" className="block text-sm text-gray-700 mb-1">
                      Jenis Event
                    </label>
                    <select
                      id="type"
                      {...register('type')}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {EVENT_TYPES.filter((t) => t.value !== 'ALL').map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {errors.type && (
                      <p className="text-red-500 text-xs mt-1">{errors.type.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="semester" className="block text-sm text-gray-700 mb-1">
                      Semester (opsional)
                    </label>
                    <select
                      id="semester"
                      {...register('semester')}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Semua</option>
                      <option value="ODD">Ganjil</option>
                      <option value="EVEN">Genap</option>
                    </select>
                    {errors.semester && (
                      <p className="text-red-500 text-xs mt-1">{errors.semester.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="startDate" className="block text-sm text-gray-700 mb-1">
                      Tanggal Mulai
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      {...register('startDate')}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {errors.startDate && (
                      <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm text-gray-700 mb-1">
                      Tanggal Berakhir
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      {...register('endDate')}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {errors.endDate && (
                      <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="title" className="block text-sm text-gray-700 mb-1">
                    Judul Event
                  </label>
                  <input
                    id="title"
                    {...register('title')}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Contoh: Libur Idul Fitri 1447 H"
                  />
                  {errors.title && (
                    <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="isHoliday"
                    type="checkbox"
                    {...register('isHoliday')}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="isHoliday" className="text-sm text-gray-700">
                    Tandai sebagai hari libur sekolah
                  </label>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm text-gray-700 mb-1">
                    Deskripsi (opsional)
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    {...register('description')}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Catatan tambahan, misalnya sumber aturan atau detail pelaksanaan."
                  />
                  {errors.description && (
                    <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      reset({
                        academicYearId:
                          typeof effectiveAcademicYearId === 'number'
                            ? effectiveAcademicYearId
                            : 0,
                        title: '',
                        type: 'LIBUR_NASIONAL',
                        startDate: '',
                        endDate: '',
                        semester: null,
                        isHoliday: false,
                        description: '',
                      });
                    }}
                    className="inline-flex items-center justify-center px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="inline-flex items-center justify-center px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    {editingId ? 'Simpan Perubahan' : 'Simpan Event'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {effectiveAcademicYearId && (!events || events.length === 0) && (
        <div className="bg-white rounded-xl shadow-md border-0 p-12 flex flex-col items-center justify-center text-center">
          <CalendarRange className="w-12 h-12 text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium mb-1">
            Belum ada event kalender akademik untuk filter ini.
          </p>
          <p className="text-gray-500 text-sm">
            Tambahkan event libur, ujian, atau kegiatan sekolah menggunakan tombol di atas.
          </p>
        </div>
      )}

      {!loading && events && events.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Daftar Event Kalender Akademik
              </h2>
              <p className="text-xs text-gray-500">
                Tersusun berdasarkan tanggal mulai, termasuk libur, ujian, dan kegiatan sekolah.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              Total event:{' '}
              <span className="font-semibold text-gray-700">{events.length}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Tanggal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Semester
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Jenis
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Judul
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Libur
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Deskripsi
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {events.map((item) => {
                  const start = new Date(item.startDate);
                  const end = new Date(item.endDate);
                  const sameDay = start.toDateString() === end.toDateString();

                  const formatDate = (d: Date) =>
                    d.toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    });

                  const dateLabel = sameDay
                    ? formatDate(start)
                    : `${formatDate(start)} - ${formatDate(end)}`;

                  const semesterLabel =
                    item.semester === 'ODD'
                      ? 'Ganjil'
                      : item.semester === 'EVEN'
                      ? 'Genap'
                      : 'Semua';

                  const typeLabel =
                    EVENT_TYPES.find((t) => t.value === item.type)?.label || item.type;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {dateLabel}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{semesterLabel}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{typeLabel}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {item.title}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {item.isHoliday ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold">
                            Ya
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                            Tidak
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">
                        {item.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={deleteMutation.isPending}
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
