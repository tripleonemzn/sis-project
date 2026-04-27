import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { userService } from '../../../services/user.service';
import { subjectService, type Subject } from '../../../services/subject.service';
import { classService, type Class } from '../../../services/class.service';
import api from '../../../services/api';
import { academicYearService } from '../../../services/academicYear.service';
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

type TeacherAssignmentPageScope = 'DEFAULT' | 'CURRICULUM';

type TeacherAssignmentPageProps = {
  scope?: TeacherAssignmentPageScope;
};

export const TeacherAssignmentPage = ({ scope = 'DEFAULT' }: TeacherAssignmentPageProps) => {
  const { data: activeYearData } = useQuery({
    queryKey: ['academic-year', 'active'],
    queryFn: async () => {
      try {
        return await academicYearService.getActiveSafe();
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

  const isCurriculumScope = scope === 'CURRICULUM';

  const {
    data: assignmentListData,
    isLoading: loadingAssignments,
    refetch: refetchAssignments,
  } = useQuery({
    queryKey: ['teacher-assignments', debouncedSearch, isCurriculumScope ? 'CURRICULUM' : 'DEFAULT'],
    queryFn: async () => {
      const res = await api.get('/teacher-assignments', {
        params: {
          page: 1,
          limit: 1000,
          search: debouncedSearch || undefined,
          scope: isCurriculumScope ? 'CURRICULUM' : undefined,
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



  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kelola Assignment Guru</h1>
          <p className="text-gray-500">Penugasan guru ke kelas dan mata pelajaran.</p>
        </div>
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
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
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
      </div>

      {showForm && (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => {
                setShowForm(false);
                reset();
                setSelectedTeacherId(null);
                setSelectedSubjectId(null);
                setSelectedClassIds([]);
            }}
        >
            <div 
                className="bg-white rounded-xl shadow-lg w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">
                        {selectedTeacherId ? 'Edit Assignment Guru' : 'Tambah Assignment Guru'}
                    </h2>
                    <button 
                        onClick={() => {
                            setShowForm(false);
                            reset();
                            setSelectedTeacherId(null);
                            setSelectedSubjectId(null);
                            setSelectedClassIds([]);
                        }}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <ChevronLeft size={20} className="rotate-180" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <input type="hidden" {...register('academicYearId', { valueAsNumber: true })} />

                        <div className="relative" ref={teacherDropdownRef}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Guru</label>
                            <div
                                className="app-searchable-select-trigger"
                                onClick={() => setIsTeacherDropdownOpen(!isTeacherDropdownOpen)}
                            >
                                <span className={selectedTeacherId ? 'text-gray-900' : 'text-gray-500'}>
                                    {teachers.find(t => t.id === selectedTeacherId)?.name || 'Pilih Guru'}
                                </span>
                                <ChevronDown size={16} className="text-gray-400" />
                            </div>
                            {isTeacherDropdownOpen && (
                                <div className="app-searchable-select-panel absolute z-10 max-h-60 overflow-y-auto">
                                    <div className="app-searchable-select-search-wrap">
                                        <input
                                            type="text"
                                            className="app-searchable-select-search"
                                            placeholder="Cari guru..."
                                            value={teacherSearch}
                                            onChange={(e) => setTeacherSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    {filteredTeachers.map((teacher) => (
                                        <div
                                            key={teacher.id}
                                            className="app-searchable-select-option text-sm"
                                            onClick={() => {
                                                setValue('teacherId', teacher.id);
                                                setSelectedTeacherId(teacher.id);
                                                setIsTeacherDropdownOpen(false);
                                            }}
                                        >
                                            <div className="font-medium text-gray-900">{teacher.name}</div>
                                            <div className="app-searchable-select-meta">{teacher.username}</div>
                                        </div>
                                    ))}
                                    {filteredTeachers.length === 0 && (
                                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                            Tidak ada guru ditemukan
                                        </div>
                                    )}
                                </div>
                            )}
                            {errors.teacherId && <p className="text-red-500 text-xs mt-1">{errors.teacherId.message}</p>}
                        </div>

                        <div className="relative" ref={subjectDropdownRef}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mata Pelajaran</label>
                            <div
                                className="app-searchable-select-trigger"
                                onClick={() => setIsSubjectDropdownOpen(!isSubjectDropdownOpen)}
                            >
                                <span className={selectedSubjectId ? 'text-gray-900' : 'text-gray-500'}>
                                    {subjects.find(s => s.id === selectedSubjectId)?.name || 'Pilih Mata Pelajaran'}
                                </span>
                                <ChevronDown size={16} className="text-gray-400" />
                            </div>
                            {isSubjectDropdownOpen && (
                                <div className="app-searchable-select-panel absolute z-10 max-h-60 overflow-y-auto">
                                    <div className="app-searchable-select-search-wrap">
                                        <input
                                            type="text"
                                            className="app-searchable-select-search"
                                            placeholder="Cari mapel..."
                                            value={subjectSearch}
                                            onChange={(e) => setSubjectSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    {filteredSubjects.map((subject) => (
                                        <div
                                            key={subject.id}
                                            className="app-searchable-select-option text-sm"
                                            onClick={() => {
                                                setValue('subjectId', subject.id);
                                                setSelectedSubjectId(subject.id);
                                                setIsSubjectDropdownOpen(false);
                                            }}
                                        >
                                            <div className="font-medium text-gray-900">{subject.name}</div>
                                            <div className="app-searchable-select-meta">{subject.code}</div>
                                        </div>
                                    ))}
                                    {filteredSubjects.length === 0 && (
                                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                            Tidak ada mapel ditemukan
                                        </div>
                                    )}
                                </div>
                            )}
                            {errors.subjectId && <p className="text-red-500 text-xs mt-1">{errors.subjectId.message}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Kelas</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                                {classes.map((cls) => (
                                    <label
                                        key={cls.id}
                                        className={`
                                            flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-sm
                                            ${selectedClassIds.includes(cls.id)
                                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}
                                        `}
                                    >
                                        <input
                                            type="checkbox"
                                            value={cls.id}
                                            checked={selectedClassIds.includes(cls.id)}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                const newIds = checked
                                                    ? [...selectedClassIds, cls.id]
                                                    : selectedClassIds.filter((id) => id !== cls.id);
                                                setSelectedClassIds(newIds);
                                                setValue('classIds', newIds);
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>{cls.name}</span>
                                    </label>
                                ))}
                            </div>
                            {errors.classIds && <p className="text-red-500 text-xs mt-1">{errors.classIds.message}</p>}
                        </div>

                        <div className="flex gap-2 pt-4 justify-end border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    reset();
                                    setSelectedTeacherId(null);
                                    setSelectedSubjectId(null);
                                    setSelectedClassIds([]);
                                }}
                                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                                Simpan
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
