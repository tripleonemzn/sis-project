import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../../services/user.service';
import { uploadService } from '../../../services/upload.service';
import { majorService, type Major } from '../../../services/major.service';
import type { User } from '../../../types/auth';
import { Search, Loader2, ChevronLeft, ChevronRight, Plus, Edit, Trash2, X, FileText } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';

const teacherSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter'),
  name: z.string().min(1, 'Nama wajib diisi'),
  password: z
    .string()
    .min(6, 'Password minimal 6 karakter')
    .or(z.literal(''))
    .optional(),
  photo: z.string().optional(),
  nik: z.string().optional(),
  nuptk: z.string().optional(),
  nip: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional().nullable(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  motherName: z.string().optional(),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  rt: z.string().optional(),
  rw: z.string().optional(),
  dusun: z.string().optional(),
  village: z.string().optional(),
  subdistrict: z.string().optional(),
  postalCode: z.string().optional(),
  ptkType: z.string().optional(),
  employeeStatus: z.string().optional(),
  appointmentDecree: z.string().optional(),
  appointmentDate: z.string().optional(),
  institution: z.string().optional(),
  additionalDuties: z.array(z.string()).optional(),
  managedMajorIds: z.array(z.number()).optional(),
  documents: z
    .array(
      z.object({
        title: z.string(),
        fileUrl: z.string(),
        category: z.string(),
      })
    )
    .optional(),
});

type TeacherFormValues = z.infer<typeof teacherSchema>;

const tabs = [
  { id: 'account', label: 'Data Akun' },
  { id: 'personal', label: 'Data Pribadi' },
  { id: 'contact', label: 'Data Kontak' },
  { id: 'employment', label: 'Data Kepegawaian' },
  { id: 'documents', label: 'Upload File' },
] as const;

export const TeacherManagementPage = () => {
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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery<{ data: User[] }>({
    queryKey: ['teachers', debouncedSearch],
    queryFn: async () => userService.getAll({ role: 'TEACHER' }),
  });

  const allTeachers = data?.data || [];

  const filtered = allTeachers.filter((teacher) => {
    if (!debouncedSearch) return true;
    const term = debouncedSearch.toLowerCase();
    return (
      teacher.name.toLowerCase().includes(term) ||
      teacher.username.toLowerCase().includes(term) ||
      (teacher.nip || '').toLowerCase().includes(term)
    );
  });

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, total);
  const pageItems = sorted.slice(startIndex, endIndex);

  const { data: majorsData } = useQuery({
    queryKey: ['majors'],
    queryFn: async () => majorService.list(),
  });

  const majors = majorsData?.data?.majors || [];

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherSchema),
    defaultValues: {
      username: '',
      name: '',
      password: '',
      photo: '',
      documents: [],
      additionalDuties: [],
      managedMajorIds: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'documents',
  });

  type TeacherCreatePayload = Parameters<typeof userService.create>[0];

  type TeacherUpdatePayload = Parameters<typeof userService.update>[1];

  const createMutation = useMutation({
    mutationFn: async (values: TeacherFormValues) => {
      const passwordToSend = values.password && values.password.length > 0 ? values.password : 'smkskgb2';
      const { documents, additionalDuties, ...rest } = values;

      // Process additional duties and managed major
      const processedDuties: string[] = [];
      const managedMajorIds: number[] = [];

      if (additionalDuties) {
        additionalDuties.forEach(duty => {
          if (duty.startsWith('KAPROG:')) {
            if (!processedDuties.includes('KAPROG')) {
              processedDuties.push('KAPROG');
            }
            managedMajorIds.push(Number(duty.split(':')[1]));
          } else {
            processedDuties.push(duty);
          }
        });
      }

      const payload: TeacherCreatePayload = {
        ...rest,
        role: 'TEACHER' as const,
        password: passwordToSend,
        birthDate: values.birthDate || undefined,
        appointmentDate: values.appointmentDate || undefined,
        additionalDuties: processedDuties,
        managedMajorIds: managedMajorIds,
        documents: documents?.map((d) => ({
          title: d.title,
          fileUrl: d.fileUrl,
          category: d.category,
        })),
      };
      return userService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      toast.success('Guru berhasil ditambahkan');
      setShowForm(false);
      setEditingId(null);
      reset();
      setActiveTab('account');
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } } | undefined)?.response?.data?.message || 'Gagal menambahkan guru';
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: TeacherFormValues }) => {
      const { documents, additionalDuties, ...rest } = values;

      // Process additional duties and managed major
      const processedDuties: string[] = [];
      const managedMajorIds: number[] = [];

      if (additionalDuties) {
        additionalDuties.forEach(duty => {
          if (duty.startsWith('KAPROG:')) {
            if (!processedDuties.includes('KAPROG')) {
              processedDuties.push('KAPROG');
            }
            managedMajorIds.push(Number(duty.split(':')[1]));
          } else {
            processedDuties.push(duty);
          }
        });
      }

      const payload: TeacherUpdatePayload = {
        ...rest,
        additionalDuties: processedDuties,
        managedMajorIds: managedMajorIds,
        documents: documents?.map((d) => ({
          title: d.title,
          fileUrl: d.fileUrl,
          category: d.category,
        })),
      };
      if (!payload.password) delete payload.password;
      
      // Handle dates specifically
      payload.birthDate = values.birthDate || null;
      payload.appointmentDate = values.appointmentDate || null;
      
      return userService.update(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      toast.success('Data guru berhasil diperbarui');
      setShowForm(false);
      setEditingId(null);
      reset();
      setActiveTab('account');
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } } | undefined)?.response?.data?.message || 'Gagal memperbarui guru';
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => userService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      toast.success('Guru berhasil dihapus');
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } } | undefined)?.response?.data?.message || 'Gagal menghapus guru';
      toast.error(message);
    },
  });

  const onSubmit = (values: TeacherFormValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (teacher: User) => {
    setEditingId(teacher.id);
    
    // Transform additional duties for form
    // Convert 'KAPROG' to 'KAPROG:ID' if managedMajors exists
    const formDuties = (teacher.additionalDuties || []).filter(d => d !== 'KAPROG');
    
    if (teacher.managedMajors && teacher.managedMajors.length > 0) {
      teacher.managedMajors.forEach(major => {
        formDuties.push(`KAPROG:${major.id}`);
      });
    } else if (teacher.managedMajorId) {
      formDuties.push(`KAPROG:${teacher.managedMajorId}`);
    }

    // Reset form with all values
    reset({
      username: teacher.username,
      name: teacher.name,
      password: '',
      photo: teacher.photo || '',
      nik: teacher.nik || '',
      nuptk: teacher.nuptk || '',
      nip: teacher.nip || '',
      gender: teacher.gender || null,
      birthPlace: teacher.birthPlace || '',
      birthDate: teacher.birthDate ? new Date(teacher.birthDate).toISOString().split('T')[0] : '',
      motherName: teacher.motherName || '',
      email: teacher.email || '',
      phone: teacher.phone || '',
      address: teacher.address || '',
      rt: teacher.rt || '',
      rw: teacher.rw || '',
      dusun: teacher.dusun || '',
      village: teacher.village || '',
      subdistrict: teacher.subdistrict || '',
      postalCode: teacher.postalCode || '',
      ptkType: teacher.ptkType || '',
      employeeStatus: teacher.employeeStatus || '',
      appointmentDecree: teacher.appointmentDecree || '',
      appointmentDate: teacher.appointmentDate ? new Date(teacher.appointmentDate).toISOString().split('T')[0] : '',
      institution: teacher.institution || '',
      additionalDuties: formDuties,
      managedMajorIds: teacher.managedMajors?.map(m => m.id) || (teacher.managedMajorId ? [teacher.managedMajorId] : []),
      documents: teacher.documents?.map(d => ({
        title: d.title || d.name || '',
        fileUrl: d.fileUrl,
        category: d.category || 'Dokumen'
      })) || [],
    });
    setPhotoPreview(teacher.photo || null);
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
      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await uploadService.uploadTeacherDocument(file);
        append({
          title: file.name,
          fileUrl: result.url,
          category: 'Dokumen'
        });
      }
      toast.success('Dokumen berhasil diunggah');
    } catch {
      toast.error('Gagal mengunggah dokumen');
    } finally {
      setIsUploading(false);
      // Clear input
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
          <h1 className="text-2xl font-bold text-gray-900">Kelola Guru</h1>
          <p className="text-gray-500">Daftar akun guru yang terdaftar di sistem.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              reset({
                username: '',
                name: '',
                password: '',
                documents: []
              });
              setActiveTab('account');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            Tambah Guru
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
        {showForm && (
          <div className="flex flex-col h-full">
            {/* Tabs Header */}
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
                {/* Data Akun Tab */}
                {activeTab === 'account' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="teacher-username" className="block text-sm font-medium text-gray-700 mb-1">
                        Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="teacher-username"
                        {...register('username')}
                        autoComplete="username"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="username untuk login"
                      />
                      {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="teacher-name" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Lengkap <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="teacher-name"
                        {...register('name')}
                        autoComplete="name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Nama lengkap guru"
                      />
                      {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="teacher-password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      <input
                        id="teacher-password"
                        type="password"
                        {...register('password')}
                        autoComplete="new-password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={editingId ? 'Kosongkan jika tidak diubah' : 'Password untuk login'}
                      />
                      {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <label htmlFor="photo" className="block text-sm font-medium text-gray-700 mb-1">Foto Profil</label>
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
                            className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                          <p className="text-xs text-gray-400 mt-1">Format: JPG/PNG, maks 500KB</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Data Pribadi Tab */}
                {activeTab === 'personal' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="nik" className="block text-sm font-medium text-gray-700 mb-1">NIK</label>
                      <input
                        id="nik"
                        {...register('nik')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Nomor Induk Kependudukan"
                      />
                    </div>
                    <div>
                      <label htmlFor="nuptk" className="block text-sm font-medium text-gray-700 mb-1">NUPTK</label>
                      <input
                        id="nuptk"
                        {...register('nuptk')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="nip" className="block text-sm font-medium text-gray-700 mb-1">NIP</label>
                      <input
                        id="nip"
                        {...register('nip')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">Jenis Kelamin</label>
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
                      <label htmlFor="birthPlace" className="block text-sm font-medium text-gray-700 mb-1">Tempat Lahir</label>
                      <input
                        id="birthPlace"
                        {...register('birthPlace')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">Tanggal Lahir</label>
                      <input
                        id="birthDate"
                        type="date"
                        {...register('birthDate')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="motherName" className="block text-sm font-medium text-gray-700 mb-1">Nama Ibu Kandung</label>
                      <input
                        id="motherName"
                        {...register('motherName')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}

                {/* Data Kontak Tab */}
                {activeTab === 'contact' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
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
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">No. HP/WA</label>
                      <input
                        id="phone"
                        {...register('phone')}
                        autoComplete="tel"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Alamat Jalan</label>
                      <textarea
                        id="address"
                        {...register('address')}
                        rows={2}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="rt" className="block text-sm font-medium text-gray-700 mb-1">RT</label>
                        <input
                          id="rt"
                          {...register('rt')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label htmlFor="rw" className="block text-sm font-medium text-gray-700 mb-1">RW</label>
                        <input
                          id="rw"
                          {...register('rw')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="dusun" className="block text-sm font-medium text-gray-700 mb-1">Nama Dusun</label>
                      <input
                        id="dusun"
                        {...register('dusun')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="village" className="block text-sm font-medium text-gray-700 mb-1">Desa/Kelurahan</label>
                      <input
                        id="village"
                        {...register('village')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="subdistrict" className="block text-sm font-medium text-gray-700 mb-1">Kecamatan</label>
                      <input
                        id="subdistrict"
                        {...register('subdistrict')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 mb-1">Kode Pos</label>
                      <input
                        id="postalCode"
                        {...register('postalCode')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}

                {/* Data Kepegawaian Tab */}
                {activeTab === 'employment' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="ptkType" className="block text-sm font-medium text-gray-700 mb-1">Jenis PTK</label>
                      <input
                        id="ptkType"
                        {...register('ptkType')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Contoh: Guru Mapel, Guru Kelas"
                      />
                    </div>
                    <div>
                      <label htmlFor="employeeStatus" className="block text-sm font-medium text-gray-700 mb-1">Status Kepegawaian</label>
                      <input
                        id="employeeStatus"
                        {...register('employeeStatus')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Contoh: PNS, GTY, GTT"
                      />
                    </div>
                    <div>
                      <label htmlFor="appointmentDecree" className="block text-sm font-medium text-gray-700 mb-1">SK Pengangkatan</label>
                      <input
                        id="appointmentDecree"
                        {...register('appointmentDecree')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="appointmentDate" className="block text-sm font-medium text-gray-700 mb-1">TMT Pengangkatan</label>
                      <input
                        id="appointmentDate"
                        type="date"
                        {...register('appointmentDate')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-1">Lembaga Pengangkat</label>
                      <input
                        id="institution"
                        {...register('institution')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <p className="block text-sm font-medium text-gray-700 mb-1">Tugas Tambahan</p>
                      <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        {[
                          { value: 'WAKASEK_KURIKULUM', label: 'Wakasek Kurikulum' },
                          { value: 'SEKRETARIS_KURIKULUM', label: 'Sekretaris Kurikulum' },
                          { value: 'WAKASEK_KESISWAAN', label: 'Wakasek Kesiswaan' },
                          { value: 'SEKRETARIS_KESISWAAN', label: 'Sekretaris Kesiswaan' },
                          { value: 'WAKASEK_SARPRAS', label: 'Wakasek Sarpras' },
                          { value: 'SEKRETARIS_SARPRAS', label: 'Sekretaris Sarpras' },
                          { value: 'WAKASEK_HUMAS', label: 'Wakasek Humas' },
                          { value: 'SEKRETARIS_HUMAS', label: 'Sekretaris Humas' },
                          { value: 'PEMBINA_OSIS', label: 'Pembina OSIS' },
                          { value: 'KEPALA_LAB', label: 'Kepala Lab' },
                          { value: 'KEPALA_PERPUSTAKAAN', label: 'Kepala Perpustakaan' },
                          { value: 'BP_BK', label: 'BP/BK' },
                          { value: 'IT_CENTER', label: 'IT-Center' },
                          // Dynamic KAPROG options
                          ...majors.map((major: Major) => ({
                            value: `KAPROG:${major.id}`,
                            label: `Kepala Kompetensi ${major.name}`
                          }))
                        ].map((duty) => {
                          const id = `duty-${duty.value}`;
                          return (
                            <label key={duty.value} htmlFor={id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                id={id}
                                type="checkbox"
                                value={duty.value}
                                {...register('additionalDuties')}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                              />
                              <span className="text-sm text-gray-700">{duty.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload File Tab */}
                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="teacher-documents" className="block text-sm font-medium text-gray-700 mb-1">
                        Upload Dokumen
                      </label>
                      <input
                        id="teacher-documents"
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Bisa pilih lebih dari satu file (SK, sertifikat, dll)
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
                                <span className="text-xs text-gray-500">{field.category}</span>
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
                  id="search-teacher"
                  name="search-teacher"
                  placeholder="Cari nama, username, atau NIP guru..."
                  autoComplete="off"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="limit-teacher" className="text-sm text-gray-600">Tampilkan:</label>
                <select
                  id="limit-teacher"
                  name="limit-teacher"
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
                    Total: <span className="font-medium">{total}</span> guru
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-medium">
                      <tr>
                        <th className="px-6 py-4">USERNAME</th>
                        <th className="px-6 py-4">NAMA GURU</th>
                        <th className="px-6 py-4">NUPTK</th>
                        <th className="px-6 py-4 w-1/3">TUGAS TAMBAHAN</th>
                        <th className="px-6 py-4 text-center w-24">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pageItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                            {search ? 'Tidak ada guru yang cocok dengan pencarian' : 'Belum ada data guru'}
                          </td>
                        </tr>
                      ) : (
                        pageItems.map((teacher) => (
                          <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-gray-600">{teacher.username}</td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{teacher.name}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-600">{teacher.nuptk || '-'}</td>
                            <td className="px-6 py-4 text-gray-600">
                              {(teacher.additionalDuties && teacher.additionalDuties.length > 0) || (teacher.teacherClasses && teacher.teacherClasses.length > 0) ? (
                                <div className="flex flex-wrap gap-1">
                                  {teacher.additionalDuties?.map((duty) => {
                                     // Skip WALI_KELAS as it is shown via teacherClasses
                                     if (duty === 'WALI_KELAS') return null;
                                     
                                     let label = duty.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                                    // Custom formatting for specific acronyms
                                    if (duty === 'PEMBINA_OSIS') label = 'Pembina OSIS';
                                    if (duty === 'BP_BK') label = 'BP/BK';
                                    if (duty === 'KAPROG' && teacher.managedMajor) {
                                      label = `Kepala Kompetensi ${teacher.managedMajor.name}`;
                                    } else if (duty === 'KAPROG') {
                                      label = 'Kepala Kompetensi';
                                    } else if (duty.startsWith('WAKASEK')) {
                                      label = label.replace('Wakasek ', 'Wakasek '); // Ensure Title Case
                                    }
                                    
                                    return (
                                      <span
                                        key={duty}
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700"
                                      >
                                        {label}
                                      </span>
                                    );
                                  })}
                                  
                                  {teacher.teacherClasses?.map((cls) => (
                                    <span
                                      key={`wali-${cls.id}`}
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700"
                                    >
                                      Wali Kelas {cls.name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">Tidak ada</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEdit(teacher)}
                                  className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Hapus guru ini?')) {
                                      deleteMutation.mutate(teacher.id);
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
