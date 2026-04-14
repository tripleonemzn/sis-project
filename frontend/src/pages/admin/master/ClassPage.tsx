import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classService } from '../../../services/class.service';
import { majorService, type Major } from '../../../services/major.service';
import { academicYearService, type AcademicYear } from '../../../services/academicYear.service';
import { userService } from '../../../services/user.service';
import type { Class } from '../../../services/class.service';
import type { User } from '../../../types/auth';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2, Edit, Search, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const schema = z.object({
  level: z.string().min(1, 'Tingkat kelas wajib diisi'),
  majorId: z.number().int().min(1, 'Jurusan wajib dipilih'),
  academicYearId: z.number().int().min(1, 'Tahun ajaran wajib dipilih'),
  baseName: z.string().min(1, 'Nama dasar kelas wajib diisi'),
  rombelCount: z
    .number()
    .int()
    .min(1, 'Jumlah rombel minimal 1')
    .max(50, 'Jumlah rombel maksimal 50'),
  teacherId: z.number().int().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

export const ClassPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterAcademicYearId, setFilterAcademicYearId] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterMajorId, setFilterMajorId] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Classes
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['classes', page, limit, debouncedSearch],
    queryFn: () => classService.list({ page, limit, search: debouncedSearch }),
  });

  // Fetch Options for Form
  const { data: majorsData } = useQuery({ 
    queryKey: ['majors-options'], 
    queryFn: () => majorService.list({ limit: 100 }),
  });
  
  const { data: academicYearsData } = useQuery({ 
    queryKey: ['academic-years-options'], 
    queryFn: () => academicYearService.list({ limit: 100, isActive: true }),
  });

  const { data: teachersData } = useQuery({ 
    queryKey: ['teachers-options'], 
    queryFn: () => userService.getAll({ role: 'TEACHER' }),
    enabled: showForm 
  });

  // Helper to extract array from API response structure which might vary
  const majors = useMemo<Major[]>(
    () => majorsData?.data?.majors || majorsData?.majors || [],
    [majorsData],
  );
  const academicYears = useMemo<AcademicYear[]>(
    () => academicYearsData?.data?.academicYears || academicYearsData?.academicYears || [],
    [academicYearsData],
  );
  const teachers = useMemo<User[]>(
    () => (Array.isArray(teachersData) ? teachersData : (teachersData?.data || [])),
    [teachersData],
  );

  const { register, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      level: '',
      majorId: 0,
      academicYearId: 0,
      baseName: '',
      rombelCount: 1,
      teacherId: null,
    },
  });

  // Auto-select active academic year when opening form
  useEffect(() => {
    if (showForm && !editingId && academicYears.length > 0) {
      const currentValue = getValues('academicYearId');
      if (currentValue === 0) {
        const activeYear = academicYears.find((ay: AcademicYear) => ay.isActive);
        if (activeYear) {
          setValue('academicYearId', activeYear.id);
        } else {
          setValue('academicYearId', academicYears[0].id);
        }
      }
    }
  }, [showForm, editingId, academicYears, setValue, getValues]);

  const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTeacherDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const createMutation = useMutation({
    mutationFn: classService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Kelas berhasil dibuat');
      setSearch('');
      setDebouncedSearch('');
      setPage(1);
      setShowForm(false);
      reset();
      setSelectedTeacherId(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat kelas');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FormValues> & { name?: string } }) => 
      classService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Kelas berhasil diperbarui');
      setSearch('');
      setDebouncedSearch('');
      setPage(1);
      setShowForm(false);
      setEditingId(null);
      reset();
      setSelectedTeacherId(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui kelas');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => classService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Kelas dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus kelas');
    }
  });

  const onSubmit = (values: FormValues) => {
    const payload = {
      level: values.level,
      majorId: values.majorId,
      academicYearId: values.academicYearId,
      teacherId: values.teacherId || null,
    };

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          ...payload,
          name: `${values.level} ${values.baseName}`.trim(),
        },
      });
      return;
    }

    const tasks: Promise<unknown>[] = [];
    for (let i = 1; i <= values.rombelCount; i += 1) {
      const name = `${values.level} ${values.baseName} ${i}`.trim();
      tasks.push(
        classService.create({
          ...payload,
          name,
        }),
      );
    }

    Promise.all(tasks)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        toast.success('Kelas berhasil dibuat');
        setSearch('');
        setDebouncedSearch('');
        setPage(1);
        setShowForm(false);
        reset();
      })
      .catch((error: unknown) => {
        toast.error(getErrorMessage(error) || 'Gagal membuat kelas');
      });
  };

  const handleEdit = (item: Class) => {
    setEditingId(item.id);
    setValue('level', item.level);
    setValue('majorId', item.majorId);
    setValue('academicYearId', item.academicYearId);
    setValue('teacherId', item.teacherId || null);
    setSelectedTeacherId(item.teacherId || null);
    setValue('baseName', item.name.replace(item.level, '').trim());
    setValue('rombelCount', 1);
    setShowForm(true);
  };

  const list: Class[] = data?.data?.classes || [];
  const pagination = data?.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  const filteredList = list.filter((item) => {
    const matchesAcademicYear = !filterAcademicYearId || item.academicYearId === Number(filterAcademicYearId);
    const matchesLevel = !filterLevel || item.level === filterLevel;
    const matchesMajor = !filterMajorId || item.majorId === Number(filterMajorId);
    return matchesAcademicYear && matchesLevel && matchesMajor;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Kelas</h1>
          <p className="text-gray-500">Kelola daftar kelas dan wali kelas</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              reset();
              setSelectedTeacherId(null);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            Tambah Kelas
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-white rounded-xl shadow-md border-0 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3 mb-4">
            {editingId ? 'Edit Kelas' : 'Tambah Kelas Baru'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="academicYearId" className="block text-sm font-medium text-gray-700 mb-1">Tahun Ajaran</label>
                <select
                  id="academicYearId"
                  {...register('academicYearId', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={0} disabled>Pilih Tahun Ajaran</option>
                  {academicYears.map((ay: AcademicYear) => (
                    <option key={ay.id} value={ay.id}>{ay.name}</option>
                  ))}
                </select>
                {errors.academicYearId && <p className="text-red-500 text-xs mt-1">{errors.academicYearId.message}</p>}
              </div>

              <div>
                <label htmlFor="majorId" className="block text-sm font-medium text-gray-700 mb-1">Jurusan</label>
                <select
                  id="majorId"
                  {...register('majorId', { valueAsNumber: true })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={0} disabled>Pilih Jurusan</option>
                  {majors.map((m: Major) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </select>
                {errors.majorId && <p className="text-red-500 text-xs mt-1">{errors.majorId.message}</p>}
              </div>

              <div>
                <label htmlFor="level" className="block text-sm font-medium text-gray-700 mb-1">Tingkat</label>
                <select
                  id="level"
                  {...register('level')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Pilih Tingkat</option>
                  <option value="X">X</option>
                  <option value="XI">XI</option>
                  <option value="XII">XII</option>
                </select>
                {errors.level && <p className="text-red-500 text-xs mt-1">{errors.level.message}</p>}
              </div>

              <div>
                <label htmlFor="baseName" className="block text-sm font-medium text-gray-700 mb-1">Nama Dasar Kelas</label>
                <input
                  id="baseName"
                  {...register('baseName')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contoh: TKJ"
                  autoComplete="off"
                />
                {errors.baseName && <p className="text-red-500 text-xs mt-1">{errors.baseName.message}</p>}
              </div>

              {!editingId && (
                <div>
                  <label htmlFor="rombelCount" className="block text-sm font-medium text-gray-700 mb-1">Jumlah Rombel</label>
                  <input
                    id="rombelCount"
                    type="number"
                    min={1}
                    max={50}
                    {...register('rombelCount', { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Contoh: 4 (akan dibuat X TKJ 1-4)"
                    autoComplete="off"
                  />
                  {errors.rombelCount && <p className="text-red-500 text-xs mt-1">{errors.rombelCount.message}</p>}
                </div>
              )}

              <div className="md:col-span-2 relative" ref={dropdownRef}>
                <p className="block text-sm font-medium text-gray-700 mb-1">Wali Kelas</p>
                <div
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-pointer bg-white flex justify-between items-center"
                  onClick={() => setIsTeacherDropdownOpen(!isTeacherDropdownOpen)}
                >
                  <span className={!selectedTeacherId ? "text-gray-500" : "text-gray-900"}>
                    {selectedTeacherId 
                      ? teachers.find((t: User) => t.id === selectedTeacherId)?.name || 'Pilih Wali Kelas' 
                      : 'Pilih Wali Kelas (Opsional)'}
                  </span>
                  <ChevronDown size={16} className="text-gray-500" />
                </div>
                
                {isTeacherDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                      <input 
                        type="text" 
                        id="teacherSearch"
                        name="teacherSearch"
                        aria-label="Cari guru"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500" 
                        placeholder="Cari guru..."
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    </div>
                    <div 
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-gray-500 italic text-sm"
                      onClick={() => {
                        setValue('teacherId', null);
                        setSelectedTeacherId(null);
                        setIsTeacherDropdownOpen(false);
                        setTeacherSearch('');
                      }}
                    >
                      Tidak ada wali kelas
                    </div>
                    {teachers
                      .filter((t: User) => t.name.toLowerCase().includes(teacherSearch.toLowerCase()))
                      .map((t: User) => (
                        <div
                          key={t.id}
                          className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm ${selectedTeacherId === t.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}
                          onClick={() => {
                            setValue('teacherId', t.id);
                            setSelectedTeacherId(t.id);
                            setIsTeacherDropdownOpen(false);
                            setTeacherSearch('');
                          }}
                        >
                          {t.name} <span className="text-gray-400 text-xs">({t.username})</span>
                        </div>
                      ))}
                    {teachers.filter((t: User) => t.name.toLowerCase().includes(teacherSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-gray-500 text-sm text-center">Guru tidak ditemukan</div>
                    )}
                  </div>
                )}
                <input
                  type="hidden"
                  id="teacherId"
                  {...register('teacherId')}
                />
                {errors.teacherId && <p className="text-red-500 text-xs mt-1">{errors.teacherId.message}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  reset();
                  setSelectedTeacherId(null);
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
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                {editingId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between bg-gray-50/50">
            <div className="flex flex-col md:flex-row gap-3 w-full lg:w-auto">
              <div className="relative w-full md:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="search-class"
                  name="search-class"
                  aria-label="Cari kelas"
                  placeholder="Cari nama kelas..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="filter-academic-year"
                  name="filter-academic-year"
                  aria-label="Filter Tahun Ajaran"
                  className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                  value={filterAcademicYearId}
                  onChange={(e) => {
                    setFilterAcademicYearId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Semua Tahun Ajaran</option>
                  {academicYears.map((ay: AcademicYear) => (
                    <option key={ay.id} value={ay.id}>{ay.name}</option>
                  ))}
                </select>
                <select
                  id="filter-level"
                  name="filter-level"
                  aria-label="Filter Tingkat"
                  className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                  value={filterLevel}
                  onChange={(e) => {
                    setFilterLevel(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Semua Tingkat</option>
                  <option value="X">X</option>
                  <option value="XI">XI</option>
                  <option value="XII">XII</option>
                </select>
                <select
                  id="filter-major"
                  name="filter-major"
                  aria-label="Filter Jurusan"
                  className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
                  value={filterMajorId}
                  onChange={(e) => {
                    setFilterMajorId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Semua Kompetensi Keahlian</option>
                  {majors.map((m: Major) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="limit-class" className="text-sm text-gray-600 whitespace-nowrap">Tampilkan:</label>
              <select
                id="limit-class"
                name="limit-class"
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
          ) : isError ? (
            <div className="flex justify-center items-center h-40 text-red-500">
              Gagal memuat data kelas: {getErrorMessage(error)}
            </div>
          ) : (
            <>
              <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="text-sm text-gray-600">
                  Menampilkan <span className="font-medium">{(page - 1) * limit + 1}</span> sampai <span className="font-medium">{Math.min(page * limit, pagination.total)}</span> dari <span className="font-medium">{pagination.total}</span> data
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-6 py-4">KELAS</th>
                      <th className="px-6 py-4">JURUSAN</th>
                      <th className="px-6 py-4">TAHUN AJARAN</th>
                      <th className="px-6 py-4">WALI KELAS</th>
                      <th className="px-6 py-4 text-center">SISWA</th>
                      <th className="px-6 py-4 text-center w-24">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                          {search ? 'Tidak ada data yang cocok dengan pencarian' : 'Belum ada data kelas'}
                        </td>
                      </tr>
                    ) : (
                      filteredList.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {item.major ? `${item.major.name} (${item.major.code})` : '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {item.academicYear ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${item.academicYear.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                              {item.academicYear.name}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {item.teacher ? item.teacher.name : <span className="text-gray-400 italic">Belum ditentukan</span>}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {item._count?.students || 0}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Hapus kelas ini?')) {
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
              
              {/* Pagination */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end bg-gray-50/50">
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
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
    </div>
  );
};
