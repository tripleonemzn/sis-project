import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../../services/user.service';
import { uploadService } from '../../../services/upload.service';
import { majorService, type Major } from '../../../services/major.service';
import type { User, UserDocumentInput, UserWrite } from '../../../types/auth';
import { Plus, Edit, Trash2, X, Search, Loader2, FileText, Upload, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const userFormSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter'),
  name: z.string().min(1, 'Nama wajib diisi'),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PRINCIPAL', 'STAFF', 'PARENT', 'EXAMINER', 'EXTRACURRICULAR_TUTOR']),
  password: z.string().optional(),
  nip: z.string().optional().nullable(),
  nis: z.string().optional().nullable(),
  nisn: z.string().optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE']).optional().nullable(),
  additionalDuties: z.array(z.string()).optional(),
  birthPlace: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  photo: z.string().optional().nullable(),
  nik: z.string().optional().nullable(),
  nuptk: z.string().optional().nullable(),
  motherName: z.string().optional().nullable(),
  rt: z.string().optional().nullable(),
  rw: z.string().optional().nullable(),
  dusun: z.string().optional().nullable(),
  village: z.string().optional().nullable(),
  subdistrict: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  ptkType: z.string().optional().nullable(),
  employeeStatus: z.string().optional().nullable(),
  appointmentDecree: z.string().optional().nullable(),
  appointmentDate: z.string().optional().nullable(),
  institution: z.string().optional().nullable(),
  childNisns: z.array(z.string()).optional(),
  examinerMajorId: z.string().optional().nullable(),
  staffPosition: z.string().optional(),
  documents: z
    .array(
      z.object({
        name: z.string(),
        fileUrl: z.string(),
        type: z.string().optional(),
      })
    )
    .optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

type FixedRole = 'ADMIN' | 'PRINCIPAL' | 'STAFF' | 'PARENT' | 'EXAMINER' | 'EXTRACURRICULAR_TUTOR';

type UserListProps = {
  fixedRole: FixedRole;
  title: string;
  description: string;
};

const tabs = [
  { id: 'account', label: 'Data Akun' },
  { id: 'personal', label: 'Data Pribadi' },
  { id: 'contact', label: 'Data Kontak' },
  { id: 'employment', label: 'Data Jabatan' },
  { id: 'documents', label: 'Upload File' },
] as const;

const STAFF_POSITION_CODES = ['STAFF_KEUANGAN', 'STAFF_ADMINISTRASI', 'KEPALA_TU'] as const;

const getStaffPositionLabel = (code?: string) => {
  if (!code) return '';
  if (code === 'STAFF_KEUANGAN' || code === 'BENDAHARA') return 'Bendahara';
  if (code === 'STAFF_ADMINISTRASI') return 'Staff Administrasi';
  if (code === 'KEPALA_TU') return 'Kepala Tata Usaha';
  return code;
};

const mapStaffPositionToDuty = (code?: string) => {
  if (code === 'STAFF_KEUANGAN') return 'BENDAHARA';
  return undefined;
};

const resolveStaffPositionCodeFromUser = (user: User) => {
  if (user.ptkType && STAFF_POSITION_CODES.includes(user.ptkType as (typeof STAFF_POSITION_CODES)[number])) {
    return user.ptkType as (typeof STAFF_POSITION_CODES)[number];
  }
  if (user.additionalDuties && user.additionalDuties.includes('BENDAHARA')) {
    return 'STAFF_KEUANGAN';
  }
  return undefined;
};

const stripEmptyStrings = <T extends Record<string, unknown>>(obj: T) => {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() === '') {
      out[k] = undefined;
    } else {
      out[k] = v;
    }
  }
  return out as T;
};

export const UserList = ({ fixedRole, title, description }: UserListProps) => {
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<typeof tabs[number]['id']>('account');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isChildDropdownOpen, setIsChildDropdownOpen] = useState(false);
  const [childSearch, setChildSearch] = useState('');
  const location = useLocation();
  const childDropdownRef = useRef<HTMLDivElement | null>(null);
  
  const queryClient = useQueryClient();

  const { data: usersData, isLoading } = useQuery<{ data: User[] }>({
    queryKey: ['users'],
    queryFn: async () => userService.getAll(),
  });

  const { data: studentsForParent } = useQuery<{ data: User[] }>({
    queryKey: ['students-for-parent'],
    queryFn: async () => userService.getAll({ role: 'STUDENT' }),
    enabled: fixedRole === 'PARENT',
  });

  const { data: majorsData } = useQuery({
    queryKey: ['majors-list'],
    queryFn: async () => majorService.list({ page: 1, limit: 100 }),
    enabled: fixedRole === 'EXAMINER',
  });
  
  const users = (usersData?.data || []).filter((user: User) => user.role === fixedRole);

  const normalizedSearch = searchTerm.toLowerCase();

  const filteredUsers = users.filter((user: User) => {
    if (!normalizedSearch) {
      return true;
    }

    const baseMatch =
      user.name.toLowerCase().includes(normalizedSearch) ||
      user.username.toLowerCase().includes(normalizedSearch);

    if (baseMatch) {
      return true;
    }

    if (fixedRole === 'PARENT' && user.children && user.children.length > 0) {
      return user.children.some((child) => {
        const nisn = child.nisn || '';
        return (
          child.name.toLowerCase().includes(normalizedSearch) ||
          nisn.toLowerCase().includes(normalizedSearch) ||
          child.username.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    return false;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => a.name.localeCompare(b.name));

  const total = sortedUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, total);
  const pageItems = sortedUsers.slice(startIndex, endIndex);

  const { register, handleSubmit, reset, setValue, control, watch, formState: { errors } } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      role: fixedRole,
      documents: [],
      additionalDuties: [],
      childNisns: [],
      examinerMajorId: '',
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'documents',
  });

  const selectedChildNisns = watch('childNisns') || [];

  const selectedChildren =
    fixedRole === 'PARENT' && studentsForParent?.data
      ? studentsForParent.data.filter((student) => {
          const nisn = student.nisn || '';
          return nisn && selectedChildNisns.includes(nisn);
        })
      : [];

  useEffect(() => {
    setShowForm(false);
    setEditingUser(null);
    reset();
    setActiveTab('account');
  }, [location.pathname, reset]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (childDropdownRef.current && !childDropdownRef.current.contains(event.target as Node)) {
        setIsChildDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const createMutation = useMutation({
    mutationFn: (data: UserFormValues) => {
      const { staffPosition, documents, childNisns, examinerMajorId, ...rest } = data;
      const mappedDuty = fixedRole === 'STAFF' ? mapStaffPositionToDuty(staffPosition) : undefined;
      const finalDuties = mappedDuty ? [mappedDuty] : (data.additionalDuties || []);

      const restSanitized = stripEmptyStrings(rest as Record<string, unknown>);
      const basePayload: Partial<UserWrite> = {
        ...restSanitized,
        examinerMajorId: examinerMajorId ? Number(examinerMajorId) : undefined,
      };

      if (fixedRole === 'STAFF') {
        basePayload.ptkType = staffPosition || null;
      }

      if (fixedRole === 'PARENT') {
        const normalizedChildNisns = (childNisns || [])
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

        if (normalizedChildNisns.length > 0) {
          basePayload.childNisns = normalizedChildNisns;
        }
      }

      const finalPayload: Partial<UserWrite> = {
        ...basePayload,
        additionalDuties: finalDuties,
        documents: documents?.map<UserDocumentInput>((d) => ({
          title: d.name,
          category: d.type || 'General',
          fileUrl: d.fileUrl,
          name: d.name,
          type: d.type,
        })),
      };

      return userService.create(finalPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User berhasil dibuat');
      handleCloseForm();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal membuat user');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserFormValues }) => {
       const { staffPosition, documents, password, childNisns, examinerMajorId, ...rest } = data;

       const mappedDuty = fixedRole === 'STAFF' ? mapStaffPositionToDuty(staffPosition) : undefined;
       const finalDuties = mappedDuty ? [mappedDuty] : (data.additionalDuties || []);
       
       const restSanitized = stripEmptyStrings(rest as Record<string, unknown>);
       const updateBase = password ? { ...restSanitized, password } : restSanitized;
       const basePayload: Partial<UserWrite> = {
         ...updateBase,
         examinerMajorId: examinerMajorId ? Number(examinerMajorId) : undefined,
       };

       if (fixedRole === 'STAFF') {
         basePayload.ptkType = staffPosition || null;
       }

       if (fixedRole === 'PARENT') {
         const normalizedChildNisns = (childNisns || [])
           .map((value) => value.trim())
           .filter((value) => value.length > 0);

         basePayload.childNisns = normalizedChildNisns;
       }

       const finalPayload: Partial<UserWrite> = {
        ...basePayload,
        additionalDuties: finalDuties,
        documents: documents?.map<UserDocumentInput>((d) => ({
          title: d.name,
          category: d.type || 'General',
          fileUrl: d.fileUrl,
          name: d.name,
          type: d.type,
        })),
      };

       return userService.update(id, finalPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User berhasil diupdate');
      handleCloseForm();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal mengupdate user');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: userService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User berhasil dihapus');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal menghapus user');
    }
  });

  const handleOpenForm = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setValue('username', user.username);
      setValue('name', user.name);
      setValue('role', user.role);
      setValue('password', '');
      setValue('nip', user.nip || '');
      setValue('nis', user.nis || '');
      setValue('nisn', user.nisn || '');
      setValue('gender', user.gender || null);
      setValue('additionalDuties', user.additionalDuties || []);
      setValue('birthPlace', user.birthPlace || '');
      setValue('birthDate', user.birthDate ? String(user.birthDate).slice(0, 10) : '');
      setValue('email', user.email || '');
      setValue('phone', user.phone || '');
      setValue('address', user.address || '');
      setValue('photo', user.photo || '');
      setValue('examinerMajorId', user.examinerMajorId ? String(user.examinerMajorId) : '');

      if (user.role === 'STAFF') {
        const staffCodeFromPtk =
          user.ptkType && STAFF_POSITION_CODES.includes(user.ptkType as (typeof STAFF_POSITION_CODES)[number])
            ? (user.ptkType as (typeof STAFF_POSITION_CODES)[number])
            : undefined;

        const staffCodeFromDuty =
          user.additionalDuties && user.additionalDuties.includes('BENDAHARA')
            ? 'STAFF_KEUANGAN'
            : undefined;

        setValue('staffPosition', staffCodeFromPtk || staffCodeFromDuty || '');
      } else {
        setValue('staffPosition', '');
      }

      if (user.role === 'PARENT') {
        const childNisnsFromUser = (user.children || [])
          .map((child) => child.nisn || '')
          .filter((value) => value.length > 0);
        setValue('childNisns', childNisnsFromUser);
      } else {
        setValue('childNisns', []);
      }

      setValue('documents', user.documents?.map(d => ({
        name: d.name || d.title || '',
        fileUrl: d.fileUrl,
        type: d.type || d.category || 'General'
      })) || []);

      setPhotoPreview(user.photo || null);
    } else {
      setEditingUser(null);
      reset({
        username: '',
        name: '',
        role: fixedRole,
        password: '',
        nip: '',
        nis: '',
        nisn: '',
        gender: null,
        additionalDuties: [],
        birthPlace: '',
        birthDate: '',
        email: '',
        phone: '',
        address: '',
        photo: '',
        childNisns: [],
        examinerMajorId: '',
        staffPosition: '',
        documents: [],
      });
      setPhotoPreview(null);
    }
    setShowForm(true);
    setActiveTab('account');
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingUser(null);
    reset();
    setPhotoPreview(null);
  };

  const onSubmit = (data: UserFormValues) => {
    // Require password on create
    if (!editingUser && !data.password) {
      toast.error('Password wajib diisi untuk user baru');
      return;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus user ini?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validasi ukuran file (max 2MB)
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > 2 * 1024 * 1024) {
        toast.error(`Ukuran file ${files[i].name} melebihi 2MB`);
        e.target.value = '';
        return;
      }
    }

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await uploadService.uploadTeacherDocument(file); // Reusing teacher doc upload for now
        append({
          name: file.name,
          fileUrl: result.url,
          type: 'document'
        });
      }
      toast.success('Dokumen berhasil diunggah');
    } catch {
      toast.error('Gagal mengunggah dokumen');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/x-png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Format foto harus JPG atau PNG');
      e.target.value = '';
      return;
    }

    if (file.size > 500 * 1024) {
      toast.error('Ukuran foto maksimal 500KB');
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
      e.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-500">{description}</p>
        </div>
        {!showForm && (
          <button
            onClick={() => handleOpenForm()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Tambah User
          </button>
        )}
      </div>

      {!showForm ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  id="search-user"
                  name="search"
                  placeholder="Cari user berdasarkan nama, username..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-600 placeholder:text-gray-400 transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="rowsPerPage" className="text-sm text-gray-600">Tampilkan:</label>
                <select
                  id="rowsPerPage"
                  name="rowsPerPage"
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="w-24 sm:w-28 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={35}>35</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-100 text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-6 py-3">USERNAME</th>
                  <th className="px-6 py-3">NAMA</th>
                  <th className="px-6 py-3">ROLE</th>
                  <th className="px-6 py-3 text-center w-24">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                          <Search size={20} className="text-gray-400" />
                        </div>
                        <p>Tidak ada data user ditemukan</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageItems.map((user: User) => (
                    <tr key={user.id} className="group hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 text-gray-500">{user.username}</td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{user.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border
                            ${user.role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                              user.role === 'TEACHER' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                              user.role === 'STUDENT' ? 'bg-green-50 text-green-700 border-green-100' :
                              user.role === 'PRINCIPAL' ? 'bg-red-50 text-red-700 border-red-100' :
                              'bg-gray-50 text-gray-700 border-gray-200'
                            }`}
                          >
                            {user.role}
                          </span>
                          {user.role === 'STAFF' &&
                            (() => {
                              const staffCode = resolveStaffPositionCodeFromUser(user);
                              if (!staffCode) return null;
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-yellow-50 text-yellow-800 border border-yellow-100">
                                  {getStaffPositionLabel(staffCode)}
                                </span>
                              );
                            })()}
                          {user.role === 'PARENT' && user.children && user.children.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {user.children.map((child) => (
                                <span
                                  key={child.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100"
                                >
                                  {child.nisn ? `${child.nisn} - ${child.name}` : child.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenForm(user)}
                            className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-white border-t border-gray-100">
            <p className="text-sm text-gray-600">
              Menampilkan {total === 0 ? 0 : startIndex + 1}–{endIndex} dari {total} data
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                aria-label="Sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-700">
                Halaman {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                aria-label="Berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
          <div className="flex flex-col h-full">
            {/* Tabs Header */}
            <div className="border-b border-gray-100 overflow-x-auto">
              <div className="flex min-w-max px-4">
                {tabs.map((tab) => {
                  // Skip 'employment' tab for roles other than STAFF and PRINCIPAL
                  if (tab.id === 'employment' && !['STAFF', 'PRINCIPAL'].includes(fixedRole)) return null;
                  
                  return (
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
                  );
                })}
              </div>
            </div>

            <div className="p-6 bg-gray-50/60">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Data Akun Tab */}
                {activeTab === 'account' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="user-username" className="block text-sm font-medium text-gray-700 mb-1">
                        Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="user-username"
                        {...register('username')}
                        autoComplete="username"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="username untuk login"
                      />
                      {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="user-name" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Lengkap <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="user-name"
                        {...register('name')}
                        autoComplete="name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Nama lengkap user"
                      />
                      {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="user-password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      <input
                        id="user-password"
                        type="password"
                        {...register('password')}
                        autoComplete="new-password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Password untuk login'}
                      />
                      {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                    </div>
                    {fixedRole === 'EXAMINER' && (
                      <div>
                        <label htmlFor="examinerMajorId" className="block text-sm font-medium text-gray-700 mb-1">
                          Kompetensi Keahlian
                        </label>
                        <select
                          id="examinerMajorId"
                          {...register('examinerMajorId')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Pilih Kompetensi Keahlian</option>
                          {majorsData?.data?.majors.map((major: Major) => (
                            <option key={major.id} value={String(major.id)}>
                              {major.code} - {major.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {fixedRole === 'PARENT' && (
                      <div className="md:col-span-2" ref={childDropdownRef}>
                        <p className="block text-sm font-medium text-gray-700 mb-1">
                          Anak (NISN - Nama Siswa)
                        </p>
                        <div
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-pointer bg-white flex justify-between items-center"
                          onClick={() => {
                            setIsChildDropdownOpen((open) => !open);
                            setChildSearch('');
                          }}
                        >
                          <span className={selectedChildNisns.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
                            {selectedChildNisns.length === 0
                              ? 'Pilih Anak (Opsional)'
                              : selectedChildren.length === 1
                                ? (() => {
                                    const student = selectedChildren[0];
                                    return student.nisn ? `${student.nisn} - ${student.name}` : student.name;
                                  })()
                                : `${selectedChildren.length} anak dipilih`}
                          </span>
                          <ChevronDown size={16} className="text-gray-500" />
                        </div>
                        {selectedChildren.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedChildren.map((student) => (
                              <span
                                key={student.id}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100"
                              >
                                {student.nisn ? `${student.nisn} - ${student.name}` : student.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {isChildDropdownOpen && (
                          <div className="relative">
                            <div className="absolute z-50 top-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                                <input
                                  type="text"
                                  id="childSearch"
                                  name="childSearch"
                                  aria-label="Cari siswa"
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                  placeholder="Cari siswa..."
                                  value={childSearch}
                                  onChange={(e) => setChildSearch(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              </div>
                              <div
                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-gray-500 italic text-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setValue('childNisns', []);
                                  setIsChildDropdownOpen(false);
                                  setChildSearch('');
                                }}
                              >
                                Tidak ada anak terkait
                              </div>
                              {studentsForParent?.data
                                .filter((student) => {
                                  if (!student.nisn) return false;
                                  const term = childSearch.toLowerCase();
                                  return (
                                    student.name.toLowerCase().includes(term) ||
                                    (student.nisn || '').toLowerCase().includes(term) ||
                                    student.username.toLowerCase().includes(term)
                                  );
                                })
                                .map((student) => {
                                  const nisn = student.nisn || '';
                                  const isSelected = nisn && selectedChildNisns.includes(nisn);

                                  return (
                                    <div
                                      key={student.id}
                                      className={`px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm ${
                                        isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const current = selectedChildNisns || [];
                                        if (isSelected) {
                                          setValue(
                                            'childNisns',
                                            current.filter((value) => value !== nisn),
                                            { shouldDirty: true }
                                          );
                                        } else if (nisn) {
                                          setValue('childNisns', [...current, nisn], { shouldDirty: true });
                                        }
                                      }}
                                    >
                                      {student.nisn ? `${student.nisn} - ${student.name}` : student.name}{' '}
                                      <span className="text-gray-400 text-xs">({student.username})</span>
                                    </div>
                                  );
                                })}
                              {studentsForParent &&
                                studentsForParent.data.filter((student) => {
                                  if (!student.nisn) return false;
                                  const term = childSearch.toLowerCase();
                                  return (
                                    student.name.toLowerCase().includes(term) ||
                                    (student.nisn || '').toLowerCase().includes(term) ||
                                    student.username.toLowerCase().includes(term)
                                  );
                                }).length === 0 && (
                                  <div className="px-3 py-2 text-gray-500 text-sm text-center">
                                    Siswa tidak ditemukan
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          Jika diisi, akun orang tua akan otomatis terhubung ke satu atau lebih siswa tersebut.
                        </p>
                      </div>
                    )}
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
                          <label className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer">
                             <input
                                id="photo"
                                type="file"
                                accept="image/jpeg,image/jpg,image/png"
                                onChange={handlePhotoUpload}
                                disabled={isUploadingPhoto}
                                autoComplete="off"
                                className="hidden"
                              />
                             <span className="inline-block px-4 py-2 bg-blue-50 text-blue-700 rounded-lg border-0 hover:bg-blue-100 transition-colors">
                                Choose file
                             </span>
                             <span className="ml-2 text-gray-600">
                               {isUploadingPhoto ? 'Uploading...' : 'No file chosen'}
                             </span>
                          </label>
                          <p className="text-xs text-gray-400 mt-1">Format: JPG/PNG, maks 500KB</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Data Pribadi Tab */}
                {activeTab === 'personal' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(fixedRole === 'STAFF' || fixedRole === 'PRINCIPAL') && (
                      <div>
                        <label htmlFor="nip" className="block text-sm font-medium text-gray-700 mb-1">NIP</label>
                        <input
                          id="nip"
                          {...register('nip')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Nomor Induk Pegawai"
                        />
                      </div>
                    )}
                    {fixedRole === 'PRINCIPAL' && (
                      <>
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
                      </>
                    )}
                    <div>
                      <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">Jenis Kelamin</label>
                      <select
                        id="gender"
                        {...register('gender')}
                        autoComplete="sex"
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
                        autoComplete="address-level2"
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
                    {fixedRole === 'PRINCIPAL' && (
                      <div className="md:col-span-2">
                        <label htmlFor="motherName" className="block text-sm font-medium text-gray-700 mb-1">Nama Ibu Kandung</label>
                        <input
                          id="motherName"
                          {...register('motherName')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}
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
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">No. HP</label>
                      <input
                        id="phone"
                        {...register('phone')}
                        autoComplete="tel"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">Alamat Lengkap</label>
                      <textarea
                        id="address"
                        {...register('address')}
                        autoComplete="street-address"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                      />
                    </div>
                    {fixedRole === 'PRINCIPAL' && (
                      <>
                        <div className="grid grid-cols-2 gap-4 md:col-span-2">
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
                            autoComplete="postal-code"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Data Jabatan Tab (Staff & Principal Only) */}
                {activeTab === 'employment' && (
                  <div className="grid grid-cols-1 gap-4">
                    {fixedRole === 'STAFF' && (
                      <div>
                        <label htmlFor="staffPosition" className="block text-sm font-medium text-gray-700 mb-1">Posisi / Jabatan Staff</label>
                        <select
                          id="staffPosition"
                          {...register('staffPosition')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">-- Pilih Jabatan --</option>
                          <option value="STAFF_KEUANGAN">Bendahara (Staff Keuangan)</option>
                          <option value="STAFF_ADMINISTRASI">Staff Administrasi</option>
                          <option value="KEPALA_TU">Kepala Tata Usaha</option>
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          Pilih posisi atau jabatan untuk staff ini.
                        </p>
                        <div className="mt-3">
                          {(() => {
                            const pos = watch('staffPosition');
                            if (pos === 'STAFF_KEUANGAN') {
                              return <div className="p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm">Peran: Bendahara. Fokus pada transaksi SPP, pembayaran, dan rekap keuangan.</div>;
                            }
                            if (pos === 'STAFF_ADMINISTRASI') {
                              return <div className="p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">Peran: Administrasi. Fokus pada surat-menyurat, arsip, dan layanan administrasi.</div>;
                            }
                            if (pos === 'KEPALA_TU') {
                              return <div className="p-3 rounded-lg bg-green-50 text-green-800 text-sm">Peran: Kepala TU. Koordinasi administrasi dan supervisi unit TU.</div>;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    )}
                    {fixedRole === 'PRINCIPAL' && (
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
                      </div>
                    )}
                  </div>
                )}

                {/* Upload File Tab */}
                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">Upload Dokumen</h3>
                      <p className="text-xs text-blue-700 mb-4">
                        Upload dokumen pendukung seperti KTP, KK, Ijazah, atau SK Pengangkatan.
                      </p>
                      
                      <div className="flex items-center gap-4">
                         <input
                           type="file"
                           id="file-upload"
                           multiple
                           onChange={handleFileUpload}
                           className="hidden"
                           disabled={isUploading}
                         />
                         <label
                           htmlFor="file-upload"
                           className={`flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                         >
                           {isUploading ? (
                             <Loader2 size={18} className="animate-spin" />
                           ) : (
                             <Upload size={18} />
                           )}
                           {isUploading ? 'Mengunggah...' : 'Pilih File'}
                         </label>
                         <span className="text-xs text-gray-500">
                           Bisa upload banyak file sekaligus.
                         </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {fields.map((field, index) => (
                        <div key={field.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                              <FileText size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{field.name}</p>
                              <a 
                                href={field.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Lihat File
                              </a>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ))}
                      {fields.length === 0 && (
                        <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
                          Belum ada dokumen yang diunggah
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 mt-6">
                  <button
                    type="button"
                    onClick={handleCloseForm}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={16} className="animate-spin" />}
                    {editingUser ? 'Simpan Perubahan' : 'Buat User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
