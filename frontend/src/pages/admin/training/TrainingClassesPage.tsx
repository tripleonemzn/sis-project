import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trainingClassService, type TrainingClass } from '../../../services/trainingClass.service';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import { userService } from '../../../services/user.service';
import type { User } from '../../../types/auth';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Search, ChevronLeft, ChevronRight, Plus, Trash2, Edit, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  name: z.string().min(1, 'Nama kelas training wajib diisi'),
  academicYearId: z
    .number()
    .int()
    .refine((v) => v > 0, { message: 'Tahun ajaran wajib dipilih' }),
  description: z.string().optional().nullable(),
  instructorId: z.number().int().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  maxCapacity: z
    .number()
    .int()
    .positive('Kapasitas maksimal harus lebih dari 0')
    .optional()
    .nullable(),
});

type FormValues = z.infer<typeof schema>;

const getTrainingStatus = (startDate?: string | null, endDate?: string | null) => {
  const now = new Date();
  const start = startDate ? new Date(startDate) : undefined;
  const end = endDate ? new Date(endDate) : undefined;

  const isActive =
    (!start || now >= start) &&
    (!end || now <= end);

  return isActive ? 'Aktif' : 'Arsip';
};

export const TrainingClassesPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | ''>('');
  const [isParticipantDropdownOpen, setIsParticipantDropdownOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['training-classes', page, limit, debouncedSearch],
    queryFn: () => trainingClassService.list({ page, limit, search: debouncedSearch }),
  });

  const { data: academicYearsData } = useQuery({
    queryKey: ['academic-years-options'],
    queryFn: () => academicYearService.list({ limit: 100, isActive: true }),
    enabled: showForm,
  });

  const { data: teachersData } = useQuery({
    queryKey: ['teachers-options'],
    queryFn: () => userService.getAll({ role: 'TEACHER' }),
    enabled: showForm,
  });

  const { data: studentsData } = useQuery({
    queryKey: ['students-options'],
    queryFn: () => userService.getAll({ role: 'STUDENT' }),
    enabled: selectedClassId !== null,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      academicYearId: 0,
      description: '',
      instructorId: null,
      startDate: '',
      endDate: '',
      maxCapacity: undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: trainingClassService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-classes'] });
      toast.success('Kelas training berhasil dibuat');
      setShowForm(false);
      reset();
    },
    onError: () => {
      toast.error('Gagal membuat kelas training');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormValues> }) =>
      trainingClassService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-classes'] });
      toast.success('Kelas training berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: () => {
      toast.error('Gagal memperbarui kelas training');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => trainingClassService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-classes'] });
      toast.success('Kelas training dihapus');
    },
    onError: () => {
      toast.error('Gagal menghapus kelas training');
    },
  });

  const addParticipantMutation = useMutation({
    mutationFn: ({
      trainingClassId,
      studentId,
    }: {
      trainingClassId: number;
      studentId: number;
    }) => trainingClassService.addParticipant(trainingClassId, studentId),
    onSuccess: () => {
      if (selectedClassId) {
        queryClient.invalidateQueries({ queryKey: ['training-class-detail', selectedClassId] });
      }
      queryClient.invalidateQueries({ queryKey: ['training-classes'] });
      toast.success('Peserta berhasil ditambahkan ke kelas training');
      setSelectedStudentId('');
    },
    onError: () => {
      toast.error('Gagal menambahkan peserta ke kelas training');
    },
  });

  const removeParticipantMutation = useMutation({
    mutationFn: ({
      trainingClassId,
      enrollmentId,
    }: {
      trainingClassId: number;
      enrollmentId: number;
    }) => trainingClassService.removeParticipant(trainingClassId, enrollmentId),
    onSuccess: () => {
      if (selectedClassId) {
        queryClient.invalidateQueries({ queryKey: ['training-class-detail', selectedClassId] });
      }
      queryClient.invalidateQueries({ queryKey: ['training-classes'] });
      toast.success('Peserta berhasil dihapus dari kelas training');
    },
    onError: () => {
      toast.error('Gagal menghapus peserta dari kelas training');
    },
  });

  const { data: selectedClassDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['training-class-detail', selectedClassId],
    queryFn: () => trainingClassService.getById(selectedClassId as number),
    enabled: selectedClassId !== null,
  });

  const onSubmit = (values: FormValues) => {
    const startDateValue = values.startDate || undefined;
    const endDateValue = values.endDate || undefined;

    const payload = {
      name: values.name,
      academicYearId: values.academicYearId,
      description: values.description,
      instructorId: values.instructorId || null,
      startDate: startDateValue,
      endDate: endDateValue,
      maxCapacity:
        typeof values.maxCapacity === 'number' && !Number.isNaN(values.maxCapacity)
          ? values.maxCapacity
          : undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (item: TrainingClass) => {
    setEditingId(item.id);
    setValue('name', item.name);
    setValue('academicYearId', item.academicYearId);
    setValue('description', item.description ?? '');
    setValue('instructorId', item.instructorId ?? null);
    setValue('startDate', item.startDate ? item.startDate.slice(0, 10) : '');
    setValue('endDate', item.endDate ? item.endDate.slice(0, 10) : '');
    setValue('maxCapacity', item.maxCapacity ?? undefined);
    setShowForm(true);
  };

  const handleOpenParticipants = (item: TrainingClass) => {
    setSelectedClassId(item.id);
    setSelectedStudentId('');
    setParticipantSearch('');
    setIsParticipantDropdownOpen(false);
  };

  const handleCloseParticipants = () => {
    setSelectedClassId(null);
    setSelectedStudentId('');
    setParticipantSearch('');
    setIsParticipantDropdownOpen(false);
  };

  const list: TrainingClass[] = data?.data?.trainingClasses || [];
  const pagination = data?.data?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };
  const academicYears: AcademicYear[] =
    academicYearsData?.data?.academicYears || academicYearsData?.academicYears || [];

  const teachers: User[] = Array.isArray(teachersData)
    ? (teachersData as unknown as User[])
    : (teachersData?.data as User[]) || [];

  const students: User[] = Array.isArray(studentsData)
    ? (studentsData as unknown as User[])
    : (studentsData?.data as User[]) || [];

  const detail = selectedClassDetail?.data as
    | (TrainingClass & {
        enrollments?: {
          id: number;
          student: User & { studentClass?: { id: number; name: string } | null };
          createdAt: string;
        }[];
      })
    | undefined;

  const enrollments =
    detail?.enrollments && Array.isArray(detail.enrollments) ? detail.enrollments : [];

  const enrolledStudentIds = new Set(enrollments.map((e) => e.student.id));

  const availableStudents = students.filter((s) => !enrolledStudentIds.has(s.id));

  const sortedAvailableStudents = [...availableStudents].sort((a, b) => {
    const classA = (a as User & { studentClass?: { name?: string } }).studentClass?.name || '';
    const classB = (b as User & { studentClass?: { name?: string } }).studentClass?.name || '';

    if (classA && classB) {
      const cmpClass = classA.localeCompare(classB, 'id');
      if (cmpClass !== 0) return cmpClass;
    } else if (classA && !classB) {
      return -1;
    } else if (!classA && classB) {
      return 1;
    }

    const cmpName = a.name.localeCompare(b.name, 'id');
    if (cmpName !== 0) return cmpName;

    const nisnA = (a as User & { nisn?: string | null }).nisn || '';
    const nisnB = (b as User & { nisn?: string | null }).nisn || '';
    return nisnA.localeCompare(nisnB, 'id');
  });

  const participantDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        participantDropdownRef.current &&
        !participantDropdownRef.current.contains(event.target as Node)
      ) {
        setIsParticipantDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredAvailableStudents = sortedAvailableStudents.filter((student) => {
    if (!participantSearch) {
      return true;
    }
    const term = participantSearch.toLowerCase();
    return (
      student.name.toLowerCase().includes(term) ||
      (student.nisn || '').toLowerCase().includes(term) ||
      student.username.toLowerCase().includes(term)
    );
  });

  const selectedStudent =
    selectedStudentId === ''
      ? null
      : students.find((s) => s.id === Number(selectedStudentId)) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Kelas Training</h1>
          <p className="text-gray-500">Kelola kelas training/latihan dan peserta</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              reset();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            Tambah Kelas Training
          </button>
        )}
      </div>

            {showForm ? (
        <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3 mb-4">
            {editingId ? 'Edit Kelas Training' : 'Tambah Kelas Training Baru'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Kelas Training
                </label>
                <input
                  id="name"
                  {...register('name')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: Kelas TOEFL"
                  autoComplete="off"
                />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="academicYearId"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Tahun Ajaran
                </label>
                <select
                  id="academicYearId"
                  {...register('academicYearId', {
                    setValueAs: (v) => Number(v),
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={0}>Pilih Tahun Ajaran</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
                {errors.academicYearId && (
                  <p className="text-red-500 text-xs mt-1">{errors.academicYearId.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="instructorId"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Instruktur (Guru)
                </label>
                <select
                  id="instructorId"
                  {...register('instructorId', {
                    setValueAs: (v) => (v === '' ? null : Number(v)),
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Pilih Instruktur</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.username})
                    </option>
                  ))}
                </select>
                {errors.instructorId && (
                  <p className="text-red-500 text-xs mt-1">{errors.instructorId.message}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Tanggal Mulai
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    {...register('startDate')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {errors.startDate && (
                    <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="endDate"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Tanggal Selesai
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    {...register('endDate')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {errors.endDate && (
                    <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="maxCapacity"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Kapasitas Maksimal (Opsional)
                </label>
                <input
                  id="maxCapacity"
                  type="number"
                  min={1}
                  {...register('maxCapacity', {
                    setValueAs: (v) => {
                      if (v === '' || v === null || typeof v === 'undefined') {
                        return null;
                      }
                      const num = Number(v);
                      return Number.isNaN(num) ? null : num;
                    },
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: 30"
                />
                {errors.maxCapacity && (
                  <p className="text-red-500 text-xs mt-1">{errors.maxCapacity.message}</p>
                )}
              </div>
            </div>
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Deskripsi (Opsional)
              </label>
              <textarea
                id="description"
                rows={3}
                {...register('description')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Keterangan singkat kelas training"
              />
              {errors.description && (
                <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  reset();
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                {editingId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
            <div className="relative w-full sm:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                id="search-training-class"
                name="search-training-class"
                placeholder="Cari kelas training..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="limit-training-class" className="text-sm text-gray-600">Tampilkan:</label>
              <select
                id="limit-training-class"
                name="limit-training-class"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="w-24 sm:w-28 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={35}>35</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="text-sm text-gray-600">
                  Total: <span className="font-medium">{list.length}</span> kelas training
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-6 py-4">NAMA KELAS</th>
                      <th className="px-6 py-4">TAHUN AJARAN</th>
                      <th className="px-6 py-4">INSTRUKTUR</th>
                      <th className="px-6 py-4">PERIODE</th>
                      <th className="px-6 py-4">KAPASITAS/PESERTA</th>
                      <th className="px-6 py-4">KONTEN (M/T/U)</th>
                      <th className="px-6 py-4">STATUS</th>
                      <th className="px-6 py-4 text-center">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {list.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                          {search ? 'Tidak ada data yang cocok dengan pencarian' : 'Belum ada kelas training'}
                        </td>
                      </tr>
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {item.academicYear?.name || '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {item.instructor ? `${item.instructor.name} (${item.instructor.username})` : '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {item.startDate ? item.startDate.slice(0, 10) : '-'}{' '}
                            {item.endDate ? `s.d ${item.endDate.slice(0, 10)}` : ''}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {item._count?.enrollments ?? 0}
                            {typeof item.maxCapacity === 'number'
                              ? ` / ${item.maxCapacity}`
                              : ' peserta'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {(item._count?.materials ?? 0)}/{(item._count?.assignments ?? 0)}/
                            {(item._count?.exams ?? 0)}
                          </td>
                          <td className="px-6 py-4">
                            {(() => {
                              const status = getTrainingStatus(item.startDate, item.endDate);
                              const isActive = status === 'Aktif';
                              return (
                                <span
                                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                                    isActive
                                      ? 'bg-green-50 text-green-700 border border-green-100'
                                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                                  }`}
                                >
                                  {status}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleOpenParticipants(item)}
                                className="px-3 py-1.5 text-xs rounded-lg border border-blue-100 text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1.5"
                              >
                                <Plus size={14} />
                                <span>Peserta</span>
                              </button>
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Hapus kelas training ini?')) {
                                    deleteMutation.mutate(item.id);
                                  }
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Hapus"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="text-sm text-gray-500">
                  Menampilkan{' '}
                  <span className="font-medium">
                    {pagination.total === 0 ? 0 : (page - 1) * limit + 1}
                  </span>{' '}
                  sampai{' '}
                  <span className="font-medium">
                    {Math.min(page * limit, pagination.total)}
                  </span>{' '}
                  dari <span className="font-medium">{pagination.total}</span> data
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {selectedClassId !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Kelola Peserta Kelas Training
                </h2>
                <p className="text-sm text-gray-500">
                  Tambah atau hapus peserta dan lihat ringkasan progres konten.
                </p>
              </div>
              <button
                onClick={handleCloseParticipants}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 text-sm transition-colors"
                aria-label="Tutup"
              >
                X
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingDetail || !detail ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Kelas Training
                      </p>
                      <p className="text-sm font-semibold text-gray-900">{detail.name}</p>
                      <p className="text-xs text-gray-500">
                        Tahun Ajaran: {detail.academicYear?.name || '-'}
                      </p>
                      {detail.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {detail.description}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Instruktur & Periode
                      </p>
                      <p className="text-sm text-gray-800">
                        {detail.instructor
                          ? `${detail.instructor.name} (${detail.instructor.username})`
                          : '-'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {detail.startDate ? detail.startDate.slice(0, 10) : '-'}{' '}
                        {detail.endDate ? `s.d ${detail.endDate.slice(0, 10)}` : ''}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Ringkasan Progres
                      </p>
                      <p className="text-xs text-gray-600">
                        Peserta:{' '}
                        <span className="font-semibold">
                          {detail._count?.enrollments ?? enrollments.length}
                          {typeof detail.maxCapacity === 'number'
                            ? ` / ${detail.maxCapacity}`
                            : ''}
                        </span>
                      </p>
                      <p className="text-xs text-gray-600">
                        Materi:{' '}
                        <span className="font-semibold">{detail._count?.materials ?? 0}</span> ·
                        Tugas:{' '}
                        <span className="font-semibold">{detail._count?.assignments ?? 0}</span> ·
                        Ujian:{' '}
                        <span className="font-semibold">{detail._count?.exams ?? 0}</span>
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between mb-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-800">Tambah Peserta</p>
                        <p className="text-xs text-gray-500">
                          Pilih siswa dari seluruh kelas untuk ditambahkan sebagai peserta.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <div className="w-full sm:w-80 md:w-96" ref={participantDropdownRef}>
                          <div
                            className={`w-full px-3 py-2 border rounded-lg text-sm flex justify-between items-center ${
                              addParticipantMutation.isPending || availableStudents.length === 0
                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-white border-gray-300 cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent'
                            }`}
                            onClick={() => {
                              if (
                                addParticipantMutation.isPending ||
                                availableStudents.length === 0
                              ) {
                                return;
                              }
                              setIsParticipantDropdownOpen((open) => !open);
                              setParticipantSearch('');
                            }}
                          >
                            <span className={!selectedStudent ? 'text-gray-500' : 'text-gray-900'}>
                              {availableStudents.length === 0
                                ? 'Semua siswa sudah terdaftar'
                                : selectedStudent
                                  ? selectedStudent.nisn
                                    ? `${selectedStudent.nisn} - ${selectedStudent.name}`
                                    : `${selectedStudent.name} (${selectedStudent.username})`
                                  : 'Pilih siswa'}
                            </span>
                            <ChevronDown size={16} className="text-gray-500" />
                          </div>
                          {isParticipantDropdownOpen &&
                            !(addParticipantMutation.isPending || availableStudents.length === 0) && (
                              <div className="relative">
                                <div className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                                  <div className="p-2 bg-white border-b border-gray-100">
                                    <input
                                      type="text"
                                      id="participantSearch"
                                      name="participantSearch"
                                      aria-label="Cari siswa"
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                      placeholder="Cari siswa..."
                                      value={participantSearch}
                                      onChange={(e) => setParticipantSearch(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      autoFocus
                                    />
                                  </div>
                                  <div className="max-h-60 overflow-y-auto">
                                    <div
                                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-gray-500 italic text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedStudentId('');
                                        setIsParticipantDropdownOpen(false);
                                        setParticipantSearch('');
                                      }}
                                    >
                                      Kosongkan pilihan
                                    </div>
                                    {filteredAvailableStudents.map((student) => (
                                      <div
                                        key={student.id}
                                        className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm ${
                                          selectedStudentId === student.id
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'text-gray-700'
                                        }`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedStudentId(student.id);
                                          setIsParticipantDropdownOpen(false);
                                          setParticipantSearch('');
                                        }}
                                      >
                                        {student.nisn
                                          ? `${student.nisn} - ${student.name}`
                                          : `${student.name} (${student.username})`}
                                      </div>
                                    ))}
                                    {filteredAvailableStudents.length === 0 && (
                                      <div className="px-3 py-2 text-gray-500 text-sm text-center">
                                        Siswa tidak ditemukan
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                        </div>
                        <button
                          type="button"
                          disabled={
                            !selectedStudentId ||
                            addParticipantMutation.isPending ||
                            (typeof detail.maxCapacity === 'number' &&
                              (detail._count?.enrollments ?? enrollments.length) >=
                                detail.maxCapacity)
                          }
                          onClick={() => {
                            if (selectedClassId && selectedStudentId) {
                              addParticipantMutation.mutate({
                                trainingClassId: selectedClassId,
                                studentId: selectedStudentId as number,
                              });
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2 justify-center"
                        >
                          {addParticipantMutation.isPending && (
                            <Loader2 size={16} className="animate-spin" />
                          )}
                          Tambah
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 border border-gray-100 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600 font-medium">
                          <tr>
                            <th className="px-4 py-3">Nama</th>
                            <th className="px-4 py-3">Username</th>
                            <th className="px-4 py-3">Kelas Induk</th>
                            <th className="px-4 py-3">Tanggal Enroll</th>
                            <th className="px-4 py-3 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {enrollments.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-6 text-center text-gray-500 text-sm"
                              >
                                Belum ada peserta terdaftar di kelas training ini.
                              </td>
                            </tr>
                          ) : (
                            enrollments.map((enrollment) => (
                              <tr key={enrollment.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-gray-900 font-medium">
                                  {enrollment.student.name}
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {enrollment.student.username}
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {enrollment.student.studentClass?.name || '-'}
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {enrollment.createdAt
                                    ? enrollment.createdAt.slice(0, 10)
                                    : '-'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (
                                        selectedClassId &&
                                        confirm('Hapus peserta ini dari kelas training?')
                                      ) {
                                        removeParticipantMutation.mutate({
                                          trainingClassId: selectedClassId,
                                          enrollmentId: enrollment.id,
                                        });
                                      }
                                    }}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-100 text-red-600 hover:bg-red-50 transition-colors"
                                    title="Hapus peserta"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
