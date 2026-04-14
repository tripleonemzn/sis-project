import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../../services/user.service';
import { authService } from '../../../services/auth.service';
import { classService, type Class } from '../../../services/class.service';
import { uploadService } from '../../../services/upload.service';
import type { User, UserDocumentInput } from '../../../types/auth';
import { Search, Loader2, ChevronLeft, ChevronRight, Plus, Edit, Trash2, X, FileText, ChevronDown } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';

const studentSchema = z.object({
  nisn: z.string().min(1, 'NISN wajib diisi'),
  name: z.string().min(1, 'Nama wajib diisi'),
  password: z
    .string()
    .min(6, 'Password minimal 6 karakter')
    .or(z.literal(''))
    .optional(),
  photo: z.string().optional(),
  nis: z.string().optional(),
  classId: z.number().optional().nullable(),
  studentStatus: z.enum(['ACTIVE', 'GRADUATED', 'MOVED', 'DROPPED_OUT']).optional(),

  nik: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional().nullable(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  religion: z.string().optional(),
  childNumber: z.string().optional(),
  siblingsCount: z.string().optional(),

  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  rt: z.string().optional(),
  rw: z.string().optional(),
  dusun: z.string().optional(),
  village: z.string().optional(),
  subdistrict: z.string().optional(),
  postalCode: z.string().optional(),

  fatherName: z.string().optional(),
  fatherOccupation: z.string().optional(),
  fatherIncome: z.string().optional(),
  motherName: z.string().optional(),
  motherOccupation: z.string().optional(),
  motherIncome: z.string().optional(),
  guardianName: z.string().optional(),
  guardianOccupation: z.string().optional(),
  guardianPhone: z.string().optional(),

  documents: z
    .array(
      z.object({
        title: z.string(),
        fileUrl: z.string(),
        category: z.string().optional(),
      })
    )
    .optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

const tabs = [
  { id: 'account', label: 'Data Akun' },
  { id: 'personal', label: 'Data Pribadi' },
  { id: 'contact', label: 'Data Kontak' },
  { id: 'parents', label: 'Data Orang Tua' },
  { id: 'documents', label: 'Upload File' },
] as const;

export const StudentManagementPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<typeof tabs[number]['id']>('account');
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const classDropdownRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 1000 * 60 * 5,
  });
  const isAdmin = authData?.data?.role === 'ADMIN';

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const { data, isLoading } = useQuery<{ data: User[] }>({
    queryKey: ['students', debouncedSearch],
    queryFn: async () => userService.getAll({ role: 'STUDENT' }),
  });

  const allStudents = data?.data || [];

  const filtered = allStudents.filter((student) => {
    if (!debouncedSearch) return true;
    const term = debouncedSearch.toLowerCase();
    return (
      student.name.toLowerCase().includes(term) ||
      student.username.toLowerCase().includes(term) ||
      (student.nisn || '').toLowerCase().includes(term) ||
      (student.nis || '').toLowerCase().includes(term) ||
      (student.studentClass?.name || '').toLowerCase().includes(term)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const classA = a.studentClass?.name || '';
    const classB = b.studentClass?.name || '';

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

    const nisnA = a.nisn || '';
    const nisnB = b.nisn || '';
    return nisnA.localeCompare(nisnB, 'id');
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, total);
  const pageItems = sorted.slice(startIndex, endIndex);

  const { data: classesData } = useQuery({
    queryKey: ['classes-options-students'],
    queryFn: () => classService.list({ limit: 200 }),
    enabled: showForm,
  });

  const classes: Class[] =
    classesData?.data?.classes || classesData?.classes || [];

  const filteredClasses = classes.filter((cls) => {
    if (!classSearch) return true;
    const term = classSearch.toLowerCase();
    return cls.name.toLowerCase().includes(term);
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    watch,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      name: '',
      password: '',
      nisn: '',
      nis: '',
      studentStatus: 'ACTIVE',
      documents: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'documents',
  });

  type StudentCreatePayload = Parameters<typeof userService.create>[0];
  type StudentUpdatePayload = Parameters<typeof userService.update>[1];

  const createMutation = useMutation({
    mutationFn: async (values: StudentFormValues) => {
      if (!values.nisn || values.nisn.trim().length === 0) {
        throw new Error('NISN wajib diisi untuk siswa baru');
      }

      const passwordToSend =
        values.password && values.password.length > 0 ? values.password : 'smkskgb2';

      const payload: StudentCreatePayload = {
        username: values.nisn,
        name: values.name,
        role: 'STUDENT',
        nisn: values.nisn || undefined,
        nis: values.nis || undefined,
        studentStatus: values.studentStatus,
        password: passwordToSend,
        photo: values.photo || undefined,
        classId:
          typeof values.classId === 'number' && !Number.isNaN(values.classId)
            ? values.classId
            : undefined,
        nik: values.nik || undefined,
        religion: values.religion || undefined,
        childNumber:
          values.childNumber && values.childNumber.trim().length > 0
            ? Number(values.childNumber)
            : undefined,
        siblingsCount:
          values.siblingsCount && values.siblingsCount.trim().length > 0
            ? Number(values.siblingsCount)
            : undefined,
        gender: values.gender || undefined,
        birthPlace: values.birthPlace || undefined,
        birthDate: values.birthDate || undefined,
        fatherName: values.fatherName || undefined,
        fatherOccupation: values.fatherOccupation || undefined,
        fatherIncome: values.fatherIncome || undefined,
        motherName: values.motherName || undefined,
        motherOccupation: values.motherOccupation || undefined,
        motherIncome: values.motherIncome || undefined,
        guardianName: values.guardianName || undefined,
        guardianOccupation: values.guardianOccupation || undefined,
        guardianPhone: values.guardianPhone || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        address: values.address || undefined,
        rt: values.rt || undefined,
        rw: values.rw || undefined,
        dusun: values.dusun || undefined,
        village: values.village || undefined,
        subdistrict: values.subdistrict || undefined,
        postalCode: values.postalCode || undefined,
        documents: values.documents?.map<UserDocumentInput>((d) => ({
          title: d.title,
          fileUrl: d.fileUrl,
          category: d.category || 'Dokumen',
        })),
      };
      return userService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Siswa berhasil ditambahkan');
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: (error: unknown) => {
      const message =
        typeof error === 'object' &&
        error !== null &&
        (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message || 'Gagal menambahkan siswa');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: StudentFormValues }) => {
      const payload: StudentUpdatePayload = {
        username: values.nisn,
        name: values.name,
        nisn: values.nisn || undefined,
        nis: values.nis || undefined,
        studentStatus: values.studentStatus,
        photo: values.photo || undefined,
        classId:
          typeof values.classId === 'number' && !Number.isNaN(values.classId)
            ? values.classId
            : null,
        nik: values.nik || undefined,
        religion: values.religion || undefined,
        childNumber:
          values.childNumber && values.childNumber.trim().length > 0
            ? Number(values.childNumber)
            : undefined,
        siblingsCount:
          values.siblingsCount && values.siblingsCount.trim().length > 0
            ? Number(values.siblingsCount)
            : undefined,
        gender: values.gender || undefined,
        birthPlace: values.birthPlace || undefined,
        birthDate: values.birthDate || undefined,
        fatherName: values.fatherName || undefined,
        fatherOccupation: values.fatherOccupation || undefined,
        fatherIncome: values.fatherIncome || undefined,
        motherName: values.motherName || undefined,
        motherOccupation: values.motherOccupation || undefined,
        motherIncome: values.motherIncome || undefined,
        guardianName: values.guardianName || undefined,
        guardianOccupation: values.guardianOccupation || undefined,
        guardianPhone: values.guardianPhone || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        address: values.address || undefined,
        rt: values.rt || undefined,
        rw: values.rw || undefined,
        dusun: values.dusun || undefined,
        village: values.village || undefined,
        subdistrict: values.subdistrict || undefined,
        postalCode: values.postalCode || undefined,
        documents: values.documents?.map<UserDocumentInput>((d) => ({
          title: d.title,
          fileUrl: d.fileUrl,
          category: d.category || 'Dokumen',
        })),
      };
      if (values.password) {
        payload.password = values.password;
      }
      return userService.update(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Data siswa berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset();
    },
    onError: (error: unknown) => {
      const message =
        typeof error === 'object' &&
        error !== null &&
        (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message || 'Gagal memperbarui siswa');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => userService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Siswa berhasil dihapus');
    },
    onError: (error: unknown) => {
      const message =
        typeof error === 'object' &&
        error !== null &&
        (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message || 'Gagal menghapus siswa');
    },
  });

  const onSubmit = (values: StudentFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (student: User) => {
    setEditingId(student.id);
    reset({
      nisn: student.nisn || student.username || '',
      name: student.name,
      password: '',
      photo: student.photo || '',
      nis: student.nis || '',
      classId: student.classId ?? null,
      studentStatus: student.studentStatus || 'ACTIVE',
      nik: student.nik || '',
      gender: student.gender || null,
      birthPlace: student.birthPlace || '',
      birthDate: student.birthDate ? student.birthDate.split('T')[0] : '',
      religion: student.religion || '',
      childNumber: student.childNumber ? String(student.childNumber) : '',
      siblingsCount: student.siblingsCount ? String(student.siblingsCount) : '',
      email: student.email || '',
      phone: student.phone || '',
      address: student.address || '',
      rt: student.rt || '',
      rw: student.rw || '',
      dusun: student.dusun || '',
      village: student.village || '',
      subdistrict: student.subdistrict || '',
      postalCode: student.postalCode || '',
      fatherName: student.fatherName || '',
      fatherOccupation: student.fatherOccupation || '',
      fatherIncome: student.fatherIncome || '',
      motherName: student.motherName || '',
      motherOccupation: student.motherOccupation || '',
      motherIncome: student.motherIncome || '',
      guardianName: student.guardianName || '',
      guardianOccupation: student.guardianOccupation || '',
      guardianPhone: student.guardianPhone || '',
      documents:
        student.documents?.map((d) => ({
          title: d.title,
          fileUrl: d.fileUrl,
          category: d.category,
        })) || [],
    });
    setPhotoPreview(student.photo || null);
    setShowForm(true);
    setActiveTab('account');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validasi ukuran file (max 2MB)
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > 2 * 1024 * 1024) {
        toast.error(`Ukuran file ${files[i].name} melebihi 2MB`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        e.target.value = '';
        return;
      }
    }

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const result = await uploadService.uploadTeacherDocument(file);
        append({
          title: file.name,
          fileUrl: result.url,
          category: 'Dokumen',
        });
      }
      toast.success('Dokumen berhasil diunggah');
    } catch {
      toast.error('Gagal mengunggah dokumen');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      e.target.value = '';
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/x-png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Format foto harus JPG atau PNG');
      if (photoInputRef.current) photoInputRef.current.value = '';
      e.target.value = '';
      return;
    }

    if (file.size > 500 * 1024) {
      toast.error('Ukuran foto maksimal 500KB');
      if (photoInputRef.current) photoInputRef.current.value = '';
      e.target.value = '';
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const result = await uploadService.uploadTeacherPhoto(file);
      if (result.url) {
        setPhotoPreview(result.url);
        setValue('photo', result.url, { shouldDirty: true });
      }
      toast.success('Foto profil berhasil diunggah');
    } catch {
      toast.error('Gagal mengunggah foto profil');
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Kelola Siswa</h1>
          <p className="text-gray-500">Daftar akun siswa yang terdaftar di sistem.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              reset({
                nisn: '',
                name: '',
                password: '',
                photo: '',
                nis: '',
                classId: null,
                studentStatus: 'ACTIVE',
                nik: '',
                gender: null,
                birthPlace: '',
                birthDate: '',
                religion: '',
                childNumber: '',
                siblingsCount: '',
                email: '',
                phone: '',
                address: '',
                rt: '',
                rw: '',
                dusun: '',
                village: '',
                subdistrict: '',
                postalCode: '',
                fatherName: '',
                fatherOccupation: '',
                fatherIncome: '',
                motherName: '',
                motherOccupation: '',
                motherIncome: '',
                guardianName: '',
                guardianOccupation: '',
                guardianPhone: '',
                documents: [],
              });
              setPhotoPreview(null);
              setActiveTab('account');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            Tambah Siswa
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-visible">
        {showForm && (
          <div className="flex flex-col h-full">
            <div className="border-b border-gray-100 overflow-x-auto">
              <div className="flex min-w-max px-4">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 bg-gray-50/60">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {activeTab === 'account' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="nisn" className="block text-sm font-medium text-gray-700 mb-1">
                        Username (NISN) <span className="text-red-500">*</span>
                      </label>
                      {isAdmin ? (
                        <>
                          <input
                            id="nisn"
                            {...register('nisn')}
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Username (Gunakan NISN)"
                          />
                          {errors.nisn && <p className="mt-1 text-xs text-red-600">{errors.nisn.message}</p>}
                        </>
                      ) : (
                        <>
                          <div className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-600 font-medium">
                            {watch('nisn') || '-'}
                          </div>
                          <input type="hidden" {...register('nisn')} />
                        </>
                      )}
                    </div>
                    <div>
                      <label htmlFor="student-name" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Lengkap <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="student-name"
                        {...register('name')}
                        autoComplete="name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Nama lengkap siswa"
                      />
                      {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="student-password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      {isAdmin ? (
                        <>
                          <input
                            id="student-password"
                            type="password"
                            {...register('password')}
                            autoComplete="new-password"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder={editingId ? 'Kosongkan jika tidak diubah' : 'Kosongkan untuk password default smkskgb2'}
                          />
                          {errors.password && (
                            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                          )}
                        </>
                      ) : (
                        <div className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500 italic text-sm">
                          Hanya Admin yang dapat mengubah password
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <label htmlFor="photo" className="block text-sm font-medium text-gray-700 mb-1">
                        Foto Profil
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
                          {photoPreview ? (
                            <img src={photoPreview} alt="Foto Profil" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-gray-400 text-center px-1">Tidak ada foto</span>
                          )}
                        </div>
                        <div>
                          <input type="hidden" {...register('photo')} />
                          <input
                            ref={photoInputRef}
                            id="photo"
                            type="file"
                            accept="image/jpeg,image/jpg,image/png"
                            onChange={handlePhotoUpload}
                            disabled={isUploadingPhoto}
                            autoComplete="off"
                            className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                          <p className="text-xs text-gray-400 mt-1">Format: JPG/PNG, maks 500KB</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="nis" className="block text-sm font-medium text-gray-700 mb-1">
                        NIS
                      </label>
                      <input
                        id="nis"
                        {...register('nis')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="relative" ref={classDropdownRef}>
                      <label htmlFor="classId" className="block text-sm font-medium text-gray-700 mb-1">
                        Kelas
                      </label>
                      <div
                        id="classId"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-pointer bg-white flex justify-between items-center"
                        onClick={() => setIsClassDropdownOpen((open) => !open)}
                      >
                        <span className="text-gray-900">
                          {(() => {
                            const currentId = typeof watch('classId') === 'number' ? watch('classId') : null;
                            if (!currentId) return 'Pilih Kelas';
                            const currentClass = classes.find((cls) => cls.id === currentId);
                            return currentClass ? currentClass.name : 'Pilih Kelas';
                          })()}
                        </span>
                        <ChevronDown size={16} className="text-gray-500" />
                      </div>
                      {isClassDropdownOpen && (
                        <div className="relative">
                          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                              <input
                                type="text"
                                id="classSearch"
                                name="classSearch"
                                aria-label="Cari kelas"
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                placeholder="Cari kelas..."
                                value={classSearch}
                                onChange={(e) => setClassSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            </div>
                            <div
                              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-gray-500 italic text-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setValue('classId', null, { shouldDirty: true, shouldValidate: true });
                                setIsClassDropdownOpen(false);
                                setClassSearch('');
                              }}
                            >
                              Tidak ada kelas
                            </div>
                            {filteredClasses.map((cls) => {
                              const currentId = typeof watch('classId') === 'number' ? watch('classId') : null;
                              const isSelected = currentId === cls.id;
                              return (
                                <div
                                  key={cls.id}
                                  className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm ${
                                    isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setValue('classId', cls.id, { shouldDirty: true, shouldValidate: true });
                                    setIsClassDropdownOpen(false);
                                    setClassSearch('');
                                  }}
                                >
                                  {cls.name}
                                </div>
                              );
                            })}
                            {filteredClasses.length === 0 && (
                              <div className="px-3 py-2 text-gray-500 text-sm text-center">
                                Kelas tidak ditemukan
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor="studentStatus" className="block text-sm font-medium text-gray-700 mb-1">
                        Status Siswa
                      </label>
                      <select
                        id="studentStatus"
                        {...register('studentStatus')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="GRADUATED">GRADUATED</option>
                        <option value="MOVED">MOVED</option>
                        <option value="DROPPED_OUT">DROPPED_OUT</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeTab === 'personal' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="nik" className="block text-sm font-medium text-gray-700 mb-1">
                        NIK
                      </label>
                      <input
                        id="nik"
                        {...register('nik')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                        Jenis Kelamin
                      </label>
                      <select
                        id="gender"
                        {...register('gender')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Pilih Jenis Kelamin</option>
                        <option value="MALE">Laki-laki</option>
                        <option value="FEMALE">Perempuan</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="birthPlace" className="block text-sm font-medium text-gray-700 mb-1">
                        Tempat Lahir
                      </label>
                      <input
                        id="birthPlace"
                        {...register('birthPlace')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">
                        Tanggal Lahir
                      </label>
                      <input
                        id="birthDate"
                        type="date"
                        {...register('birthDate')}
                        autoComplete="bday"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="religion" className="block text-sm font-medium text-gray-700 mb-1">
                        Agama
                      </label>
                      <input
                        id="religion"
                        {...register('religion')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="childNumber" className="block text-sm font-medium text-gray-700 mb-1">
                        Anak Ke
                      </label>
                      <input
                        id="childNumber"
                        {...register('childNumber')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="siblingsCount" className="block text-sm font-medium text-gray-700 mb-1">
                        Jumlah Saudara
                      </label>
                      <input
                        id="siblingsCount"
                        {...register('siblingsCount')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'contact' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        {...register('email')}
                        autoComplete="email"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                        No. HP/WA
                      </label>
                      <input
                        id="phone"
                        {...register('phone')}
                        autoComplete="tel"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                        Alamat Jalan
                      </label>
                      <textarea
                        id="address"
                        {...register('address')}
                        rows={2}
                        autoComplete="street-address"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="rt" className="block text-sm font-medium text-gray-700 mb-1">
                          RT
                        </label>
                        <input
                          id="rt"
                          {...register('rt')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label htmlFor="rw" className="block text-sm font-medium text-gray-700 mb-1">
                          RW
                        </label>
                        <input
                          id="rw"
                          {...register('rw')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="dusun" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Dusun
                      </label>
                      <input
                        id="dusun"
                        {...register('dusun')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="village" className="block text-sm font-medium text-gray-700 mb-1">
                        Desa/Kelurahan
                      </label>
                      <input
                        id="village"
                        {...register('village')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="subdistrict" className="block text-sm font-medium text-gray-700 mb-1">
                        Kecamatan
                      </label>
                      <input
                        id="subdistrict"
                        {...register('subdistrict')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 mb-1">
                        Kode Pos
                      </label>
                      <input
                        id="postalCode"
                        {...register('postalCode')}
                        autoComplete="postal-code"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'parents' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <h3 className="text-sm font-semibold text-gray-800 mb-2">Data Ayah</h3>
                    </div>
                    <div>
                      <label htmlFor="fatherName" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Ayah
                      </label>
                      <input
                        id="fatherName"
                        {...register('fatherName')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="fatherOccupation" className="block text-sm font-medium text-gray-700 mb-1">
                        Pekerjaan Ayah
                      </label>
                      <input
                        id="fatherOccupation"
                        {...register('fatherOccupation')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="fatherIncome" className="block text-sm font-medium text-gray-700 mb-1">
                        Penghasilan Ayah
                      </label>
                      <input
                        id="fatherIncome"
                        {...register('fatherIncome')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="md:col-span-2 pt-2">
                      <h3 className="text-sm font-semibold text-gray-800 mb-2">Data Ibu</h3>
                    </div>
                    <div>
                      <label htmlFor="motherName" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Ibu
                      </label>
                      <input
                        id="motherName"
                        {...register('motherName')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="motherOccupation" className="block text-sm font-medium text-gray-700 mb-1">
                        Pekerjaan Ibu
                      </label>
                      <input
                        id="motherOccupation"
                        {...register('motherOccupation')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="motherIncome" className="block text-sm font-medium text-gray-700 mb-1">
                        Penghasilan Ibu
                      </label>
                      <input
                        id="motherIncome"
                        {...register('motherIncome')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="md:col-span-2 pt-2">
                      <h3 className="text-sm font-semibold text-gray-800 mb-2">Data Wali (Jika Ada)</h3>
                    </div>
                    <div>
                      <label htmlFor="guardianName" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Wali
                      </label>
                      <input
                        id="guardianName"
                        {...register('guardianName')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="guardianOccupation" className="block text-sm font-medium text-gray-700 mb-1">
                        Pekerjaan Wali
                      </label>
                      <input
                        id="guardianOccupation"
                        {...register('guardianOccupation')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="guardianPhone" className="block text-sm font-medium text-gray-700 mb-1">
                        No. HP Wali
                      </label>
                      <input
                        id="guardianPhone"
                        {...register('guardianPhone')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="student-documents" className="block text-sm font-medium text-gray-700 mb-1">
                        Upload Dokumen
                      </label>
                      <input
                        ref={fileInputRef}
                        id="student-documents"
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Bisa pilih lebih dari satu file (sertifikat, dokumen pendukung, dll)
                      </p>
                    </div>

                    {fields.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-700">Dokumen Terupload:</h3>
                        {fields.map((field, index) => (
                          <div
                            key={field.id}
                            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                          >

                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-blue-500" />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-700">{field.title}</span>
                                <a
                                  href={field.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  Lihat Dokumen
                                </a>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      reset();
                      setActiveTab('account');
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
                    {editingId ? 'Simpan Perubahan' : 'Simpan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {!showForm && (
          <>
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  id="search-student"
                  name="search-student"
                  placeholder="Cari nama, username, NISN atau NIS..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="limit-student" className="text-sm text-gray-600">Tampilkan:</label>
                <select
                  id="limit-student"
                  name="limit-student"
                  className="w-24 sm:w-28 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
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
                    Total: <span className="font-medium">{total}</span> siswa
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-medium">
                      <tr>
                        <th className="px-6 py-4">NISN</th>
                        <th className="px-6 py-4">NIS</th>
                        <th className="px-6 py-4 w-1/4">NAMA LENGKAP</th>
                        <th className="px-6 py-4">KELAS</th>
                        <th className="px-6 py-4">KOMPETENSI KEAHLIAN</th>
                        <th className="px-6 py-4">STATUS</th>
                        <th className="px-6 py-4 text-center w-24">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pageItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                            {search ? 'Tidak ada siswa yang cocok dengan pencarian' : 'Belum ada data siswa'}
                          </td>
                        </tr>
                      ) : (
                        pageItems.map((student) => (
                          <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-gray-600">{student.nisn || '-'}</td>
                            <td className="px-6 py-4 text-gray-600">{student.nis || '-'}</td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{student.name}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {student.studentClass?.name || '-'}
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {student.studentClass?.major?.name || '-'}
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {student.studentStatus ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">
                                  {student.studentStatus}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEdit(student)}
                                  className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Hapus siswa ini?')) {
                                      deleteMutation.mutate(student.id);
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
                    Menampilkan <span className="font-medium">{total === 0 ? 0 : startIndex + 1}</span> sampai{' '}
                    <span className="font-medium">{endIndex}</span> dari <span className="font-medium">{total}</span> data
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
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || total === 0}
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
