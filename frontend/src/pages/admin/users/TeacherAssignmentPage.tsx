import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { userService } from '../../../services/user.service';
import { subjectService, type Subject } from '../../../services/subject.service';
import { classService, type Class } from '../../../services/class.service';
import api from '../../../services/api';
import {
  Loader2,
  ChevronDown,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

const assignmentSchema = z.object({
  academicYearId: z.number(),
  teacherId: z.number(),
  subjectId: z.number(),
  classIds: z.array(z.number()).min(1, 'Pilih minimal satu kelas'),
});

type AssignmentForm = z.infer<typeof assignmentSchema>;

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

export const TeacherAssignmentPage = () => {
  const { data: activeYearData } = useQuery({
    queryKey: ['academic-year', 'active'],
    queryFn: async () => {
      try {
        const res = await api.get('/academic-years/active');
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const { data: teachersData } = useQuery({
    queryKey: ['users', 'teachers'],
    queryFn: async () => userService.getAll({ role: 'TEACHER' }),
  });

  const { data: subjectsData } = useQuery({
    queryKey: ['subjects', { page: 1, limit: 1000 }],
    queryFn: async () => subjectService.list({ page: 1, limit: 1000 }),
  });

  const { data: classesData } = useQuery({
    queryKey: ['classes', { page: 1, limit: 1000 }],
    queryFn: async () => classService.list({ page: 1, limit: 1000 }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<AssignmentForm>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      academicYearId: activeYearData?.data?.id ?? undefined,
    },
  });

  // Helper extract arrays from possible API response shapes
  const teachers: import('../../../types/auth').User[] = (teachersData?.data || []) as import('../../../types/auth').User[];
  const subjects: Subject[] = subjectsData?.data?.subjects || subjectsData?.subjects || [];
  const classes: Class[] = classesData?.data?.classes || classesData?.classes || [];
  const activeYear = activeYearData?.data || null;

  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const teacherDropdownRef = useRef<HTMLDivElement | null>(null);
  const subjectDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (teacherDropdownRef.current && !teacherDropdownRef.current.contains(event.target as Node)) {
        setIsTeacherDropdownOpen(false);
      }
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
        setIsSubjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedClasses = classes.filter((c) => selectedClassIds.includes(c.id));

  const sortedTeachers = [...teachers].sort((a, b) =>
    a.name.localeCompare(b.name, 'id'),
  );

  const filteredTeachers = sortedTeachers.filter((t) => {
    if (!teacherSearch) return true;
    const term = teacherSearch.toLowerCase();
    return (
      t.name.toLowerCase().includes(term) ||
      t.username.toLowerCase().includes(term)
    );
  });

  const filteredSubjects = subjects.filter((s) => {
    if (!subjectSearch) return true;
    const term = subjectSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term)
    );
  });

  type TeacherAssignmentItem = {
    id: number;
    teacher: { id: number; name: string; username: string };
    subject: { id: number; name: string; code: string };
    class: {
      id: number;
      name: string;
      level: string;
      major: { id: number; name: string; code: string } | null;
    };
    academicYear: { id: number; name: string };
    kkm: number;
  };

  const {
    data: assignmentListData,
    isLoading: loadingAssignments,
    refetch: refetchAssignments,
  } = useQuery({
    queryKey: ['teacher-assignments', debouncedSearch],
    queryFn: async () => {
      const res = await api.get('/teacher-assignments', {
        params: {
          page: 1,
          limit: 1000,
          search: debouncedSearch || undefined,
        },
      });
      return res.data;
    },
  });

  const assignmentList: TeacherAssignmentItem[] =
    assignmentListData?.data?.assignments || [];

  const assignmentPagination =
    assignmentListData?.data?.pagination || {
      page: 1,
      limit: assignmentList.length,
      total: assignmentList.length,
      totalPages: 1,
    };

  type GroupedTeacherAssignment = {
    teacher: TeacherAssignmentItem['teacher'];
    subject: TeacherAssignmentItem['subject'];
    academicYear: TeacherAssignmentItem['academicYear'];
    kkm: number;
    classes: TeacherAssignmentItem['class'][];
  };

  const groupedAssignments: GroupedTeacherAssignment[] = (() => {
    const map = new Map<string, GroupedTeacherAssignment>();

    for (const item of assignmentList) {
      const key = `${item.teacher.id}-${item.subject.id}-${item.academicYear.id}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          teacher: item.teacher,
          subject: item.subject,
          academicYear: item.academicYear,
          kkm: item.kkm,
          classes: [item.class],
        });
      } else if (!existing.classes.some((cls) => cls.id === item.class.id)) {
        existing.classes.push(item.class);
      }
    }

    const groups = Array.from(map.values());

    for (const group of groups) {
      group.classes.sort((a, b) => {
        const levelOrder: Record<string, number> = { X: 1, XI: 2, XII: 3 };
        const levelA = levelOrder[a.level] ?? 99;
        const levelB = levelOrder[b.level] ?? 99;
        if (levelA !== levelB) {
          return levelA - levelB;
        }
        return a.name.localeCompare(b.name, 'id');
      });
    }

    return groups;
  })();

  const sortedGroupedAssignments = [...groupedAssignments].sort((a, b) =>
    a.teacher.name.trim().localeCompare(b.teacher.name.trim(), 'id', {
      sensitivity: 'base',
    }),
  );

  const totalGroups = sortedGroupedAssignments.length;
  const totalPages = Math.max(1, Math.ceil((totalGroups || 1) / limit));
  const currentPage = Math.min(page, totalPages);
  const paginatedAssignments = sortedGroupedAssignments.slice(
    (currentPage - 1) * limit,
    currentPage * limit,
  );

  const handleEditAssignmentGroup = (group: GroupedTeacherAssignment) => {
    const classIds = group.classes.map((cls) => cls.id);
    setShowForm(true);
    reset({
      academicYearId: group.academicYear.id,
      teacherId: group.teacher.id,
      subjectId: group.subject.id,
      classIds,
    });
    setSelectedTeacherId(group.teacher.id);
    setSelectedSubjectId(group.subject.id);
    setSelectedClassIds(classIds);
  };

  const handleDeleteAssignmentGroup = async (group: GroupedTeacherAssignment) => {
    if (!confirm('Hapus penugasan guru ini?')) return;
    try {
      const idsToDelete = assignmentList
        .filter(
          (a) =>
            a.teacher.id === group.teacher.id &&
            a.subject.id === group.subject.id &&
            a.academicYear.id === group.academicYear.id,
        )
        .map((a) => a.id);

      if (idsToDelete.length === 0) return;

      await Promise.all(
        idsToDelete.map((id) => api.delete(`/teacher-assignments/${id}`)),
      );
      toast.success('Penugasan guru berhasil dihapus');
      await refetchAssignments();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const onSubmit = async (values: AssignmentForm) => {
    try {
      setIsSubmitting(true);
      await api.post('/teacher-assignments', values);
      toast.success('Penugasan guru berhasil disimpan');
      reset();
      setSelectedTeacherId(null);
      setSelectedSubjectId(null);
      setSelectedClassIds([]);
      await refetchAssignments();
      setShowForm(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getKkmForClass = (subject: Subject, classItem: Class): number | null => {
    const level = classItem.level as 'X' | 'XI' | 'XII';
    const fromArray = subject.kkms?.find((k) => k.classLevel === level)?.kkm;
    if (typeof fromArray === 'number') {
      return fromArray;
    }
    if (level === 'X' && typeof subject.kkmX === 'number') return subject.kkmX;
    if (level === 'XI' && typeof subject.kkmXI === 'number') return subject.kkmXI;
    if (level === 'XII' && typeof subject.kkmXII === 'number') return subject.kkmXII;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kelola Assignment Guru</h1>
          <p className="text-gray-500">Penugasan guru ke kelas dan mata pelajaran.</p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              reset({
                academicYearId: activeYear?.id ?? undefined,
                teacherId: undefined as unknown as number,
                subjectId: undefined as unknown as number,
                classIds: [],
              });
              setSelectedTeacherId(null);
              setSelectedSubjectId(null);
              setSelectedClassIds([]);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            Tambah Assignment Guru
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
        {showForm ? (
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-3">
              Tambah Assignment Guru
            </h2>
            <form
              className="space-y-4"
              onSubmit={handleSubmit(onSubmit)}
              onReset={() => {
                reset();
                setSelectedTeacherId(null);
                setSelectedSubjectId(null);
                setSelectedClassIds([]);
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="academicYearId" className="block text-sm font-medium text-gray-700 mb-1">
                    Tahun Ajaran
                  </label>
                  <select
                    id="academicYearId"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    {...register('academicYearId', { valueAsNumber: true })}
                    defaultValue={activeYear?.id ?? ''}
                  >
                    {activeYear ? (
                      <option value={activeYear.id}>{activeYear.name}</option>
                    ) : (
                      <option value="">Pilih tahun ajaran</option>
                    )}
                  </select>
                  {errors.academicYearId && (
                    <p className="mt-1 text-xs text-red-600">{errors.academicYearId.message}</p>
                  )}
                </div>

                <div className="relative" ref={teacherDropdownRef}>
                  <label htmlFor="teacherId" className="block text-sm font-medium text-gray-700 mb-1">
                    Pilih Guru
                  </label>
                  <input
                    id="teacherId"
                    type="hidden"
                    autoComplete="off"
                    {...register('teacherId', { valueAsNumber: true })}
                  />
                  <div
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-pointer flex justify-between items-center text-sm"
                    onClick={() => setIsTeacherDropdownOpen((open) => !open)}
                  >
                    <span className={selectedTeacherId ? 'text-gray-900' : 'text-gray-500'}>
                      {selectedTeacherId
                        ? teachers.find((t) => t.id === selectedTeacherId)?.name || 'Pilih Guru'
                        : 'Pilih Guru'}
                    </span>
                    <ChevronDown size={16} className="text-gray-500" />
                  </div>
                  {isTeacherDropdownOpen && (
                    <div className="relative">
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
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
                        {filteredTeachers.map((t) => {
                          const isSelected = selectedTeacherId === t.id;
                          return (
                            <div
                              key={t.id}
                              className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm ${
                                isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTeacherId(t.id);
                                setValue('teacherId', t.id, { shouldValidate: true });
                                setIsTeacherDropdownOpen(false);
                                setTeacherSearch(''); // Reset search
                              }}
                            >
                              {t.name}
                            </div>
                          );
                        })}
                        {filteredTeachers.length === 0 && (
                          <div className="px-3 py-2 text-gray-500 text-sm text-center">
                            Guru tidak ditemukan
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {errors.teacherId && (
                    <p className="mt-1 text-xs text-red-600">{errors.teacherId.message}</p>
                  )}
                </div>

                <div className="relative" ref={subjectDropdownRef}>
                  <label htmlFor="subjectId" className="block text-sm font-medium text-gray-700 mb-1">
                    Pilih Mata Pelajaran
                  </label>
                  <input
                    id="subjectId"
                    type="hidden"
                    autoComplete="off"
                    {...register('subjectId', { valueAsNumber: true })}
                  />
                  <div
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-pointer flex justify-between items-center text-sm"
                    onClick={() => setIsSubjectDropdownOpen((open) => !open)}
                  >
                    <span className={selectedSubjectId ? 'text-gray-900' : 'text-gray-500'}>
                      {selectedSubjectId
                        ? (() => {
                            const subj = subjects.find((s) => s.id === selectedSubjectId);
                            return subj ? `${subj.code} - ${subj.name}` : 'Pilih Mata Pelajaran';
                          })()
                        : 'Pilih Mata Pelajaran'}
                    </span>
                    <ChevronDown size={16} className="text-gray-500" />
                  </div>
                  {isSubjectDropdownOpen && (
                    <div className="relative">
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                          <input
                            type="text"
                            id="subjectSearch"
                            name="subjectSearch"
                            aria-label="Cari mata pelajaran"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="Cari mapel..."
                            value={subjectSearch}
                            onChange={(e) => setSubjectSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        </div>
                        {filteredSubjects.map((s) => {
                          const isSelected = selectedSubjectId === s.id;
                          return (
                            <div
                              key={s.id}
                              className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm ${
                                isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSubjectId(s.id);
                                setValue('subjectId', s.id, { shouldValidate: true });
                                setIsSubjectDropdownOpen(false);
                                setSubjectSearch(''); // Reset search
                              }}
                            >
                              {s.code} - {s.name}
                            </div>
                          );
                        })}
                        {filteredSubjects.length === 0 && (
                          <div className="px-3 py-2 text-gray-500 text-sm text-center">
                            Mata pelajaran tidak ditemukan
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {errors.subjectId && (
                    <p className="mt-1 text-xs text-red-600">{errors.subjectId.message}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    KKM akan mengikuti data pada menu Mata Pelajaran sesuai tingkat kelas.
                  </p>
                </div>

                <div className="md:col-span-3">
                  <label htmlFor="classIds" className="block text-sm font-medium text-gray-700 mb-1">
                    Pilih Kelas
                  </label>
                  <input
                    id="classIds"
                    type="hidden"
                    autoComplete="off"
                    {...register('classIds')}
                  />
                  <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {classes?.length === 0 ? (
                      <p className="text-xs text-gray-500">Belum ada data kelas.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {classes.map((c) => {
                          const checked = selectedClassIds.includes(c.id);
                          return (
                            <label key={c.id} className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={checked}
                                onChange={(e) => {
                                  const current = selectedClassIds || [];
                                  const next = e.target.checked
                                    ? [...current, c.id]
                                    : current.filter((id: number) => id !== c.id);
                                  setSelectedClassIds(next);
                                  setValue('classIds', next, { shouldValidate: true });
                                }}
                              />
                              <span>{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {errors.classIds && (
                    <p className="mt-1 text-xs text-red-600">{errors.classIds.message as string}</p>
                  )}
                </div>
              </div>

              {selectedSubject && selectedClasses.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="text-sm font-medium text-gray-700 mb-2">KKM Otomatis per Kelas</div>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {selectedClasses.map((c) => {
                        const kkm = getKkmForClass(selectedSubject, c);
                        return (
                          <li key={c.id} className="flex justify-between">
                            <span>{c.name}</span>
                            <span className="font-semibold">{kkm ?? '-'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  Simpan Penugasan
                </button>
                <button
                  type="reset"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="search-teacher-assignment"
                  name="search-teacher-assignment"
                  placeholder="Cari guru, mapel, kelas, atau tahun ajaran..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="limit-teacher-assignment" className="text-sm text-gray-600">
                  Tampilkan:
                </label>
                <select
                  id="limit-teacher-assignment"
                  name="limit-teacher-assignment"
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

            {loadingAssignments ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <>
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="text-sm text-gray-600">
                    Total:{' '}
                    <span className="font-medium">
                      {assignmentPagination.total}
                    </span>{' '}
                    penugasan
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-medium">
                      <tr>
                        <th className="px-6 py-4 w-40 whitespace-nowrap">TAHUN AJARAN</th>
                        <th className="px-6 py-4 w-56">NAMA GURU</th>
                        <th className="px-6 py-4 w-64">MATA PELAJARAN</th>
                        <th className="px-6 py-4 w-96">KELAS</th>
                        <th className="px-6 py-4 text-center w-24">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginatedAssignments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-8 text-center text-gray-500"
                          >
                            {search
                              ? 'Tidak ada penugasan yang cocok dengan pencarian'
                              : 'Belum ada data penugasan guru'}
                          </td>
                        </tr>
                      ) : (
                        paginatedAssignments.map((item, index) => (
                          <tr
                            key={`${item.teacher.id}-${item.subject.id}-${item.academicYear.id}-${index}`}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-4 text-gray-700 w-40 whitespace-nowrap">
                              {item.academicYear.name}
                            </td>
                            <td className="px-6 py-4 text-gray-900 w-56">
                              <div className="font-medium whitespace-nowrap">
                                {item.teacher.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {item.teacher.username}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-700 w-64">
                              <div className="font-medium">
                                {item.subject.code} - {item.subject.name}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-700 w-96">
                              {item.classes.map((cls) => cls.name).join(', ')}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditAssignmentGroup(item)}
                                  className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAssignmentGroup(item)}
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
                      {totalGroups === 0
                        ? 0
                        : (currentPage - 1) * limit + 1}
                    </span>{' '}
                    sampai{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * limit, totalGroups)}
                    </span>{' '}
                    dari{' '}
                    <span className="font-medium">
                      {totalGroups}
                    </span>{' '}
                    data
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="p-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
