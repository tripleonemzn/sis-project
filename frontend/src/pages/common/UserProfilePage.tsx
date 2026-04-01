import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { uploadService } from '../../services/upload.service';
import {
  CANDIDATE_DOCUMENT_OPTIONS,
  getCandidateDocumentCategoryLabel,
} from '../public/candidateShared';
import type { User, UserWrite } from '../../types/auth';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import Cropper, { type Point, type Area } from 'react-easy-crop';

// Helper function to create image from url
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

// Helper to get cropped blob
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  canvas.width = safeArea;
  canvas.height = safeArea;

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-safeArea / 2, -safeArea / 2);

  ctx.drawImage(
    image,
    safeArea / 2 - image.width * 0.5,
    safeArea / 2 - image.height * 0.5
  );

  const data = ctx.getImageData(0, 0, safeArea, safeArea);

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.putImageData(
    data,
    0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x,
    0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg');
  });
}

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
  role: z.enum([
    'ADMIN',
    'TEACHER',
    'STUDENT',
    'PRINCIPAL',
    'STAFF',
    'PARENT',
    'CALON_SISWA',
    'UMUM',
    'EXAMINER',
    'EXTRACURRICULAR_TUTOR',
  ]),
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
  familyCardNumber: z.string().optional().nullable(),
  nuptk: z.string().optional().nullable(),
  highestEducation: z.string().optional().nullable(),
  studyProgram: z.string().optional().nullable(),
  motherName: z.string().optional().nullable(),
  motherNik: z.string().optional().nullable(),
  rt: z.string().optional().nullable(),
  rw: z.string().optional().nullable(),
  dusun: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  cityRegency: z.string().optional().nullable(),
  village: z.string().optional().nullable(),
  subdistrict: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  ptkType: z.string().optional().nullable(),
  employeeStatus: z.string().optional().nullable(),
  appointmentDecree: z.string().optional().nullable(),
  appointmentDate: z.string().optional().nullable(),
  institution: z.string().optional().nullable(),
  examinerMajorId: z.number().optional().nullable(),
  childNisns: z.array(z.string()).optional(),
  staffPosition: z.string().optional(),
  
  // Student Specific Fields
  religion: z.string().optional().nullable(),
  childNumber: z.string().optional().nullable(),
  siblingsCount: z.string().optional().nullable(),
  
  fatherName: z.string().optional().nullable(),
  fatherNik: z.string().optional().nullable(),
  fatherEducation: z.string().optional().nullable(),
  fatherOccupation: z.string().optional().nullable(),
  fatherIncome: z.string().optional().nullable(),
  
  motherEducation: z.string().optional().nullable(),
  motherOccupation: z.string().optional().nullable(),
  motherIncome: z.string().optional().nullable(),
  
  guardianName: z.string().optional().nullable(),
  guardianEducation: z.string().optional().nullable(),
  guardianOccupation: z.string().optional().nullable(),
  guardianPhone: z.string().optional().nullable(),

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

type UserFormValues = z.infer<typeof userFormSchema>;
type UserFormRole = UserFormValues['role'];

const USER_FORM_ROLES: UserFormRole[] = [
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'PRINCIPAL',
  'STAFF',
  'PARENT',
  'CALON_SISWA',
  'UMUM',
  'EXAMINER',
  'EXTRACURRICULAR_TUTOR',
];

const ROLE_LABELS: Record<UserFormRole, string> = {
  ADMIN: 'Administrator',
  TEACHER: 'Guru',
  STUDENT: 'Siswa',
  PRINCIPAL: 'Kepala Sekolah',
  STAFF: 'Staff',
  PARENT: 'Orang Tua / Wali',
  CALON_SISWA: 'Calon Siswa',
  UMUM: 'Pelamar BKK',
  EXAMINER: 'Penguji Eksternal',
  EXTRACURRICULAR_TUTOR: 'Tutor / Pembina',
};

const EMPLOYEE_PROFILE_ROLES: UserFormRole[] = [
  'TEACHER',
  'PRINCIPAL',
  'STAFF',
  'EXTRACURRICULAR_TUTOR',
  'EXAMINER',
];

const EDUCATION_LEVEL_OPTIONS = [
  'Tidak Sekolah',
  'PAUD',
  'TK / Sederajat',
  'SD / Sederajat',
  'SMP / Sederajat',
  'SMA / SMK / Sederajat',
  'D1',
  'D2',
  'D3',
  'D4 / S1',
  'S2',
  'S3',
] as const;

type ProfileVariant = 'employee' | 'student' | 'candidate' | 'parent' | 'admin';

function resolveUserFormRole(role?: User['role'] | null): UserFormRole {
  const normalized = String(role || '').toUpperCase();
  if (USER_FORM_ROLES.includes(normalized as UserFormRole)) {
    return normalized as UserFormRole;
  }
  return 'STUDENT';
}

const tabs = [
  { id: 'account', label: 'Data Akun' },
  { id: 'personal', label: 'Data Pribadi' },
  { id: 'contact', label: 'Data Kontak' },
  { id: 'employment', label: 'Data Kepegawaian' },
  { id: 'parents', label: 'Data Orang Tua' },
  { id: 'documents', label: 'Upload File' },
] as const;

type TabId = (typeof tabs)[number]['id'];

const getProfileVariant = (role: UserFormRole): ProfileVariant => {
  if (EMPLOYEE_PROFILE_ROLES.includes(role)) return 'employee';
  if (role === 'STUDENT') return 'student';
  if (role === 'CALON_SISWA') return 'candidate';
  if (role === 'PARENT') return 'parent';
  return 'admin';
};

const getVisibleTabs = (role: UserFormRole) => {
  const variant = getProfileVariant(role);

  if (variant === 'employee') {
    return ['account', 'personal', 'contact', 'employment', 'documents'] as TabId[];
  }
  if (variant === 'student') {
    return ['account', 'personal', 'contact', 'parents'] as TabId[];
  }
  if (variant === 'candidate') {
    return ['account', 'personal', 'contact', 'documents'] as TabId[];
  }
  if (variant === 'parent') {
    return ['account', 'personal', 'contact'] as TabId[];
  }
  return ['account', 'personal', 'contact', 'documents'] as TabId[];
};

const getTabLabel = (role: UserFormRole, tabId: TabId) => {
  const variant = getProfileVariant(role);

  if (variant === 'employee') {
    const labels: Record<TabId, string> = {
      account: 'Akun & Foto',
      personal: 'Identitas PTK',
      contact: 'Kontak & Alamat',
      employment: 'Data PTK',
      parents: 'Data Orang Tua',
      documents: 'Dokumen',
    };
    return labels[tabId];
  }

  if (variant === 'student') {
    const labels: Record<TabId, string> = {
      account: 'Akun Siswa',
      personal: 'Identitas Siswa',
      contact: 'Kontak & Alamat',
      employment: 'Data Kepegawaian',
      parents: 'Data Keluarga',
      documents: 'Upload File',
    };
    return labels[tabId];
  }

  if (variant === 'candidate') {
    const labels: Record<TabId, string> = {
      account: 'Akun & Foto',
      personal: 'Biodata Inti',
      contact: 'Kontak Dasar',
      employment: 'Data Kepegawaian',
      parents: 'Data Orang Tua',
      documents: 'Dokumen PPDB',
    };
    return labels[tabId];
  }

  if (variant === 'parent') {
    const labels: Record<TabId, string> = {
      account: 'Akun Keluarga',
      personal: 'Identitas Wali',
      contact: 'Kontak Keluarga',
      employment: 'Data Kepegawaian',
      parents: 'Data Orang Tua',
      documents: 'Upload File',
    };
    return labels[tabId];
  }

  return tabs.find((tab) => tab.id === tabId)?.label || tabId;
};

const getProfileCopy = (role: UserFormRole) => {
  const variant = getProfileVariant(role);

  if (variant === 'employee') {
    return {
      title: 'Profil PTK & Tenaga Internal',
      subtitle:
        'Guru, kepala sekolah, staff, tutor, dan penguji eksternal memakai struktur profil yang sama agar data inti, alamat, dan penugasan tetap konsisten di seluruh workspace.',
      saveLabel: 'Simpan Profil PTK',
      readinessTitle: 'Prioritas Data Inti',
      readinessHelper: 'Fokus pada identitas, alamat, dan data penugasan yang saat ini sudah dipakai lintas modul sekolah.',
      summaryTitle: 'Ringkasan Peran',
    };
  }

  if (variant === 'student') {
    return {
      title: 'Profil Siswa',
      subtitle:
        'Lengkapi biodata siswa, kontak aktif, alamat, dan keluarga inti agar administrasi sekolah serta kebutuhan data siswa tetap rapi.',
      saveLabel: 'Simpan Profil Siswa',
      readinessTitle: 'Prioritas Data Siswa',
      readinessHelper: 'Data inti siswa difokuskan pada identitas, alamat, dan keluarga yang dipakai operasional sekolah.',
      summaryTitle: 'Ringkasan Akademik',
    };
  }

  if (variant === 'candidate') {
    return {
      title: 'Profil Calon Siswa',
      subtitle:
        'Halaman ini dibuat ringkas untuk akun, biodata dasar, foto, dan dokumen PPDB. Formulir pendaftaran detail tetap dikelola dari menu Formulir PPDB.',
      saveLabel: 'Simpan Profil Calon Siswa',
      readinessTitle: 'Kesiapan Profil PPDB',
      readinessHelper: 'Pastikan biodata dasar dan dokumen pendukung lengkap sebelum formulir PPDB dikirim untuk review.',
      summaryTitle: 'Ringkasan Pendaftaran',
    };
  }

  if (variant === 'parent') {
    return {
      title: 'Profil Orang Tua / Wali',
      subtitle:
        'Kelola identitas akun keluarga, kontak aktif, dan alamat yang dipakai saat menghubungkan serta memantau data anak.',
      saveLabel: 'Simpan Profil Wali',
      readinessTitle: 'Kesiapan Profil Wali',
      readinessHelper: 'Kontak aktif dan alamat yang rapi membantu komunikasi sekolah dengan keluarga.',
      summaryTitle: 'Ringkasan Keluarga',
    };
  }

  return {
    title: 'Profil Saya',
    subtitle: 'Kelola informasi akun dan profil utama Anda.',
    saveLabel: 'Simpan Perubahan',
    readinessTitle: 'Kelengkapan Profil',
    readinessHelper: 'Lengkapi data inti agar akun lebih mudah dipakai di seluruh modul.',
    summaryTitle: 'Ringkasan Akun',
  };
};

const getVerificationStatusMeta = (status?: User['verificationStatus'] | null) => {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (normalized === 'VERIFIED') {
    return {
      label: 'Terverifikasi',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }
  if (normalized === 'REJECTED') {
    return {
      label: 'Perlu Review',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  return {
    label: 'Menunggu Verifikasi',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  };
};

const STAFF_POSITION_CODES = ['STAFF_KEUANGAN', 'STAFF_ADMINISTRASI', 'KEPALA_TU'] as const;

const mapStaffPositionToDuty = (code?: string) => {
  if (code === 'STAFF_KEUANGAN') return 'BENDAHARA';
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

const getCandidateAcceptedFormats = (category: string) => {
  return (
    CANDIDATE_DOCUMENT_OPTIONS.find((item) => item.value === category)?.acceptedFormats.map((item) =>
      item.toLowerCase(),
    ) || ['pdf', 'jpg', 'jpeg', 'png']
  );
};

const getFileExtension = (name: string) => {
  const segments = String(name || '').toLowerCase().split('.');
  return segments.length > 1 ? segments[segments.length - 1] : '';
};

export const UserProfilePage = () => {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]['id']>('account');
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [candidateDocumentCategory, setCandidateDocumentCategory] = useState<string>(
    CANDIDATE_DOCUMENT_OPTIONS[0]?.value || 'PPDB_AKTA_KELAHIRAN',
  );
  
  // Crop state
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const childDropdownRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const queryClient = useQueryClient();

  const { data: userResponse, isLoading: isUserLoading } = useQuery<{ data: User }>({
    queryKey: ['me'],
    queryFn: authService.getMe,
  });

  const user = userResponse?.data;
  const fixedRole = resolveUserFormRole(user?.role);
  const profileVariant = getProfileVariant(fixedRole);
  const profileCopy = useMemo(() => getProfileCopy(fixedRole), [fixedRole]);
  const visibleTabs = useMemo(() => getVisibleTabs(fixedRole), [fixedRole]);
  const canUploadPhoto = [
    'ADMIN',
    'TEACHER',
    'PRINCIPAL',
    'STAFF',
    'EXAMINER',
    'EXTRACURRICULAR_TUTOR',
    'STUDENT',
    'PARENT',
    'CALON_SISWA',
  ].includes(fixedRole);
  const canUploadDocuments = [
    'ADMIN',
    'TEACHER',
    'PRINCIPAL',
    'STAFF',
    'EXAMINER',
    'EXTRACURRICULAR_TUTOR',
    'CALON_SISWA',
  ].includes(fixedRole);
  const verificationMeta = getVerificationStatusMeta(user?.verificationStatus);
  const isEmployeeProfile = profileVariant === 'employee';
  const isStudentProfile = profileVariant === 'student';
  const isCandidateProfile = profileVariant === 'candidate';
  const isParentProfile = profileVariant === 'parent';

  const { data: studentsForParent } = useQuery<{ data: User[] }>({
    queryKey: ['students-for-parent'],
    queryFn: async () => userService.getAll({ role: 'STUDENT' }),
    enabled: fixedRole === 'PARENT',
  });

  const { register, handleSubmit, setValue, reset, control, watch, getValues, formState: { errors } } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      documents: [],
      additionalDuties: [],
      childNisns: [],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'documents',
  });

  const selectedChildNisns = watch('childNisns') || [];
  const watchedName = watch('name');
  const watchedEmail = watch('email');
  const watchedPhone = watch('phone');
  const watchedAddress = watch('address');
  const watchedNis = watch('nis');
  const watchedNisn = watch('nisn');
  const watchedNik = watch('nik');
  const watchedFamilyCardNumber = watch('familyCardNumber');
  const watchedGender = watch('gender');
  const watchedBirthPlace = watch('birthPlace');
  const watchedBirthDate = watch('birthDate');
  const watchedMotherName = watch('motherName');
  const watchedMotherNik = watch('motherNik');
  const watchedHighestEducation = watch('highestEducation');
  const watchedPtkType = watch('ptkType');
  const watchedEmployeeStatus = watch('employeeStatus');
  const watchedInstitution = watch('institution');
  const watchedStaffPosition = watch('staffPosition');
  const watchedReligion = watch('religion');
  const watchedProvince = watch('province');
  const watchedCityRegency = watch('cityRegency');
  const watchedDocuments = watch('documents') || [];

  const selectedChildren =
    fixedRole === 'PARENT' && studentsForParent?.data
      ? studentsForParent.data.filter((student) => {
          const nisn = student.nisn || '';
          return nisn && selectedChildNisns.includes(nisn);
        })
      : [];

  const completeness = useMemo(() => {
    let fieldsToCheck: Array<{ label: string; value: unknown }> = [];

    if (isEmployeeProfile) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: watchedName },
        { label: 'NIK', value: watchedNik },
        { label: 'Jenis kelamin', value: watchedGender },
        { label: 'Tempat lahir', value: watchedBirthPlace },
        { label: 'Tanggal lahir', value: watchedBirthDate },
        { label: 'Nama ibu kandung', value: watchedMotherName },
        { label: 'NIK ibu kandung', value: watchedMotherNik },
        { label: 'Pendidikan terakhir', value: watchedHighestEducation },
        { label: 'Jenis PTK / peran', value: watchedPtkType },
        { label: 'Status kepegawaian', value: watchedEmployeeStatus },
        { label: 'Kontak aktif', value: watchedPhone || watchedEmail },
        { label: 'Provinsi', value: watchedProvince },
        { label: 'Kabupaten / Kota', value: watchedCityRegency },
        { label: 'Alamat', value: watchedAddress },
      ];
    } else if (isStudentProfile) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: watchedName },
        { label: 'NIS', value: watchedNis },
        { label: 'NISN', value: watchedNisn },
        { label: 'Nomor KK', value: watchedFamilyCardNumber },
        { label: 'Jenis kelamin', value: watchedGender },
        { label: 'Tempat lahir', value: watchedBirthPlace },
        { label: 'Tanggal lahir', value: watchedBirthDate },
        { label: 'Nama ibu kandung', value: watchedMotherName },
        { label: 'NIK ibu kandung', value: watchedMotherNik },
        { label: 'Agama', value: watchedReligion },
        { label: 'Kelas aktif', value: user?.studentClass?.name },
        { label: 'Provinsi', value: watchedProvince },
        { label: 'Kabupaten / Kota', value: watchedCityRegency },
        { label: 'Alamat', value: watchedAddress },
      ];
    } else if (isCandidateProfile) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: watchedName },
        { label: 'NISN', value: watchedNisn },
        { label: 'Tempat lahir', value: watchedBirthPlace },
        { label: 'Tanggal lahir', value: watchedBirthDate },
        { label: 'Kontak aktif', value: watchedPhone || watchedEmail },
        { label: 'Alamat', value: watchedAddress },
        { label: 'Dokumen PPDB', value: watchedDocuments.length > 0 ? watchedDocuments.length : null },
      ];
    } else if (isParentProfile) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: watchedName },
        { label: 'Kontak aktif', value: watchedPhone || watchedEmail },
        { label: 'Alamat', value: watchedAddress },
      ];
    } else {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: watchedName },
        { label: 'Kontak aktif', value: watchedPhone || watchedEmail },
      ];
    }

    const missing = fieldsToCheck
      .filter((item) => String(item.value || '').trim().length === 0)
      .map((item) => item.label);
    const total = fieldsToCheck.length;
    const completed = total - missing.length;

    return {
      total,
      completed,
      missing,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [
    isCandidateProfile,
    isEmployeeProfile,
    isParentProfile,
    isStudentProfile,
    user?.studentClass?.name,
    watchedAddress,
    watchedBirthDate,
    watchedBirthPlace,
    watchedCityRegency,
    watchedDocuments.length,
    watchedEmail,
    watchedEmployeeStatus,
    watchedHighestEducation,
    watchedFamilyCardNumber,
    watchedGender,
    watchedMotherNik,
    watchedMotherName,
    watchedName,
    watchedNik,
    watchedNis,
    watchedNisn,
    watchedPhone,
    watchedPtkType,
    watchedProvince,
    watchedReligion,
  ]);

  const summaryLines = useMemo(() => {
    if (isEmployeeProfile) {
      if (fixedRole === 'TEACHER') {
        return [
          `Tugas tambahan: ${user?.additionalDuties?.length ? user.additionalDuties.join(', ') : 'Belum ada'}`,
          `Kelas tugas: ${user?.teacherClasses?.length || 0} kelas`,
          `Dokumen: ${watchedDocuments.length} file`,
        ];
      }

      if (fixedRole === 'EXTRACURRICULAR_TUTOR') {
        return [
          `Ekstrakurikuler aktif: ${user?.ekskulTutorAssignments?.length || 0}`,
          `Penugasan utama: ${watchedPtkType || 'Tutor / pembina'}`,
          `Dokumen: ${watchedDocuments.length} file`,
        ];
      }

      if (fixedRole === 'EXAMINER') {
        return [
          `Jurusan damping: ${user?.examinerMajor?.name || '-'}`,
          `Instansi: ${watchedInstitution || 'Belum diisi'}`,
          `Dokumen: ${watchedDocuments.length} file`,
        ];
      }

      if (fixedRole === 'STAFF') {
        return [
          `Divisi: ${watchedStaffPosition || watchedPtkType || 'Belum dipilih'}`,
          `Status kepegawaian: ${watchedEmployeeStatus || 'Belum diisi'}`,
          `Dokumen: ${watchedDocuments.length} file`,
        ];
      }

      return [
        `Peran aktif: ${ROLE_LABELS[fixedRole]}`,
        `Status kepegawaian: ${watchedEmployeeStatus || 'Belum diisi'}`,
        `Dokumen: ${watchedDocuments.length} file`,
      ];
    }

    if (isStudentProfile) {
      return [
        `Kelas aktif: ${user?.studentClass?.name || '-'}`,
        `Status siswa: ${user?.studentStatus || 'ACTIVE'}`,
        `Email / HP: ${watchedEmail || watchedPhone || 'Belum diisi'}`,
      ];
    }

    if (isCandidateProfile) {
      return [
        `NISN: ${watchedNisn || '-'}`,
        `Status akun: ${verificationMeta.label}`,
        `Dokumen PPDB: ${watchedDocuments.length} file`,
      ];
    }

    if (isParentProfile) {
      return [
        `Anak terhubung: ${selectedChildren.length}`,
        `Kontak aktif: ${watchedEmail || watchedPhone || 'Belum diisi'}`,
        `Alamat: ${watchedAddress ? 'Sudah diisi' : 'Belum diisi'}`,
      ];
    }

    return [
      `Role aktif: ${ROLE_LABELS[fixedRole]}`,
      `Kontak aktif: ${watchedEmail || watchedPhone || 'Belum diisi'}`,
      `Alamat: ${watchedAddress ? 'Sudah diisi' : 'Belum diisi'}`,
    ];
  }, [
    fixedRole,
    isCandidateProfile,
    isEmployeeProfile,
    isParentProfile,
    isStudentProfile,
    selectedChildren.length,
    user?.additionalDuties,
    user?.ekskulTutorAssignments?.length,
    user?.examinerMajor?.name,
    user?.studentClass?.name,
    user?.studentStatus,
    user?.teacherClasses?.length,
    verificationMeta.label,
    watchedAddress,
    watchedDocuments.length,
    watchedEmail,
    watchedEmployeeStatus,
    watchedInstitution,
    watchedNisn,
    watchedPhone,
    watchedPtkType,
    watchedStaffPosition,
  ]);

  // Gunakan ref untuk melacak apakah form sudah diinisialisasi dengan data user saat ini
  const isInitializedRef = useRef(false);
  const lastUserIdRef = useRef<number | null>(null);

  // Inisialisasi form saat data user tersedia
  useEffect(() => {
    if (user && (!isInitializedRef.current || user.id !== lastUserIdRef.current)) {
      // Transform additional duties for form
      // Convert 'KAPROG' to 'KAPROG:ID' if managedMajors exists
      const formDuties = (user.additionalDuties || []).filter(d => d !== 'KAPROG');
      
      // Handle managedMajors (array) or managedMajor (single object) or managedMajorId
      const managedMajors = user.managedMajors || [];
      if (managedMajors.length > 0) {
        managedMajors.forEach((major) => {
          formDuties.push(`KAPROG:${major.id}`);
        });
      } else if (user.managedMajorId) {
        formDuties.push(`KAPROG:${user.managedMajorId}`);
      } else if (user.managedMajor?.id) {
         formDuties.push(`KAPROG:${user.managedMajor.id}`);
      }

      const formattedData: UserFormValues = {
        username: user.username,
        name: user.name,
        role: resolveUserFormRole(user.role),
        password: '',
        nip: user.nip || '',
        nis: user.nis || '',
        nisn: user.nisn || '',
        gender: user.gender || null,
        additionalDuties: formDuties,
        birthPlace: user.birthPlace || '',
        birthDate: user.birthDate ? String(user.birthDate).slice(0, 10) : '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        photo: user.photo || '',
        examinerMajorId: user.examinerMajor?.id || user.examinerMajorId || null,
        institution: user.institution || '',
        
        // Additional fields for Principal
        nik: user.nik || '',
        familyCardNumber: user.familyCardNumber || '',
        nuptk: user.nuptk || '',
        highestEducation: user.highestEducation || '',
        studyProgram: user.studyProgram || '',
        motherName: user.motherName || '',
        motherNik: user.motherNik || '',
        
        // Student Specific
        religion: user.religion || '',
        childNumber: user.childNumber ? String(user.childNumber) : '',
        siblingsCount: user.siblingsCount ? String(user.siblingsCount) : '',
        
        fatherName: user.fatherName || '',
        fatherNik: user.fatherNik || '',
        fatherEducation: user.fatherEducation || '',
        fatherOccupation: user.fatherOccupation || '',
        fatherIncome: user.fatherIncome || '',
        
        motherEducation: user.motherEducation || '',
        motherOccupation: user.motherOccupation || '',
        motherIncome: user.motherIncome || '',
        
        guardianName: user.guardianName || '',
        guardianEducation: user.guardianEducation || '',
        guardianOccupation: user.guardianOccupation || '',
        guardianPhone: user.guardianPhone || '',
        
        // Address details
        rt: user.rt || '',
        rw: user.rw || '',
        dusun: user.dusun || '',
        province: user.province || '',
        cityRegency: user.cityRegency || '',
        village: user.village || '',
        subdistrict: user.subdistrict || '',
        postalCode: user.postalCode || '',

        // Employment details
        ptkType: user.ptkType || '',
        employeeStatus: user.employeeStatus || '',
        appointmentDecree: user.appointmentDecree || '',
        appointmentDate: user.appointmentDate ? String(user.appointmentDate).slice(0, 10) : '',
        
        // Staff Position logic
        staffPosition: '',
        
        // Child NISNs logic
        childNisns: [],
        
        // Documents
        documents: user.documents?.map(d => ({
          title: d.title || d.name || 'Dokumen',
          fileUrl: d.fileUrl,
          category: d.category || 'Umum'
        })) || []
      };

      if (user.role === 'STAFF') {
        const staffCodeFromPtk =
          user.ptkType && STAFF_POSITION_CODES.includes(user.ptkType as (typeof STAFF_POSITION_CODES)[number])
            ? (user.ptkType as (typeof STAFF_POSITION_CODES)[number])
            : undefined;

        const staffCodeFromDuty =
          user.additionalDuties && user.additionalDuties.includes('BENDAHARA')
            ? 'STAFF_KEUANGAN'
            : undefined;

        formattedData.staffPosition = staffCodeFromPtk || staffCodeFromDuty || '';
      }

      if (user.role === 'PARENT') {
        const childNisnsFromUser = (user.children || [])
          .map((child) => child.nisn || '')
          .filter((value) => value.length > 0);
        formattedData.childNisns = childNisnsFromUser;
      }

      // Gunakan reset untuk mengisi seluruh form sekaligus, menghindari masalah sinkronisasi field array
      // dan mencegah overwrite parsial yang bisa menghilangkan data saat refetch
      reset(formattedData);
      setPhotoPreview(user.photo || null);
      
      isInitializedRef.current = true;
      lastUserIdRef.current = user.id;
    }
  }, [user, reset]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs]);



  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserFormValues }) => {
       const { staffPosition, documents, password, childNisns, additionalDuties, ...rest } = data;

       // Process additional duties and managed major
       const processedDuties: string[] = [];
       const managedMajorIds: number[] = [];

       if (fixedRole === 'TEACHER' && additionalDuties) {
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
       } else if (fixedRole === 'STAFF') {
          const mappedDuty = mapStaffPositionToDuty(staffPosition);
          if (mappedDuty) processedDuties.push(mappedDuty);
       } else {
          if (additionalDuties) processedDuties.push(...additionalDuties);
       }
       
       const restSanitized = stripEmptyStrings(rest as Record<string, unknown>);
       const updateBase = password ? { ...restSanitized, password } : restSanitized;
       const basePayload: Partial<UserWrite> = {
         ...updateBase,
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

       if (fixedRole === 'STUDENT') {
         if (typeof data.childNumber === 'string' && data.childNumber.trim().length > 0) {
           basePayload.childNumber = Number(data.childNumber);
         }
         if (typeof data.siblingsCount === 'string' && data.siblingsCount.trim().length > 0) {
           basePayload.siblingsCount = Number(data.siblingsCount);
         }
       }

      const finalPayload: Partial<UserWrite> = {
        ...basePayload,
        documents: documents?.map((d) => ({
          title: d.title,
          fileUrl: d.fileUrl,
          category: d.category,
        })),
      };

      if (fixedRole === 'STUDENT') {
        delete finalPayload.name;
        delete finalPayload.nis;
        delete finalPayload.nisn;
      }

      // Only include additionalDuties if NOT a teacher (to prevent overwriting with empty/partial data)
      if (fixedRole !== 'TEACHER') {
        finalPayload.additionalDuties = processedDuties;
        finalPayload.managedMajorIds = managedMajorIds;
      }

       return userService.update(id, finalPayload);
    },
    onSuccess: () => {
      authService.clearMeCache();
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Profil berhasil diperbarui');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || 'Gagal memperbarui profil');
    }
  });

  const onSubmit = (data: UserFormValues) => {
    if (user) {
      updateMutation.mutate({ id: user.id, data });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUploadDocuments) {
      toast.error('Role ini belum memiliki izin upload dokumen.');
      return;
    }

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
      if (fixedRole === 'CALON_SISWA') {
        const acceptedFormats = getCandidateAcceptedFormats(candidateDocumentCategory);
        const extension = getFileExtension(files[i].name);
        if (!acceptedFormats.includes(extension)) {
          toast.error(
            `Format ${files[i].name} tidak sesuai untuk kategori ini. Gunakan ${acceptedFormats
              .map((item) => item.toUpperCase())
              .join(', ')}.`,
          );
          if (fileInputRef.current) fileInputRef.current.value = '';
          e.target.value = '';
          return;
        }
      }
    }

    setIsUploading(true);
    try {
      const uploadCategory =
        fixedRole === 'CALON_SISWA' ? candidateDocumentCategory : 'Dokumen Pendukung';
      const newDocs: Array<{ title: string; fileUrl: string; category: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await uploadService.uploadTeacherDocument(file);
        newDocs.push({
          title: file.name,
          fileUrl: result.url,
          category: uploadCategory,
        });
      }
      
      // Update form state
      const currentDocs = (getValues('documents') || []) as { title: string; fileUrl: string; category: string }[];
      const updatedDocs = [...currentDocs, ...newDocs] as { title: string; fileUrl: string; category: string }[];
      append(newDocs);
      
      // Auto-save to backend
      if (user?.id) {
          try {
            await userService.update(user.id, { 
                documents: updatedDocs.map((d) => ({
                    title: d.title,
                    fileUrl: d.fileUrl,
                    category: d.category
                }))
            });
            queryClient.invalidateQueries({ queryKey: ['me'] });
          } catch (error) {
            console.error('Auto-save failed:', error);
            // Non-blocking error
          }
      }

      toast.success('Dokumen berhasil diunggah dan disimpan');
    } catch {
      toast.error('Gagal mengunggah dokumen');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      e.target.value = '';
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUploadPhoto) {
      toast.error('Role ini belum memiliki izin upload foto.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/x-png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Format foto harus JPG atau PNG');
      if (photoInputRef.current) photoInputRef.current.value = '';
      e.target.value = '';
      return;
    }

    if (file.size > 500 * 1024) { // 500KB limit
      toast.error('Ukuran foto maksimal 500KB');
      if (photoInputRef.current) photoInputRef.current.value = '';
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCropImageSrc(reader.result?.toString() || null);
      setIsCropping(true);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    });
    reader.readAsDataURL(file);
    
    // Reset input
    if (photoInputRef.current) photoInputRef.current.value = '';
    e.target.value = '';
  };

  const onCropComplete = (_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSaveCrop = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      setIsUploadingPhoto(true);
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (croppedBlob) {
        const file = new File([croppedBlob], "profile_photo.jpg", { type: "image/jpeg" });
        const result = await uploadService.uploadTeacherPhoto(file);
        if (result.url) {
          setPhotoPreview(result.url);
          setValue('photo', result.url, { shouldDirty: true });
          
          // Auto-save photo to user profile
          if (user?.id) {
             await userService.update(user.id, { photo: result.url });
             // Invalidate queries to refresh data
             queryClient.invalidateQueries({ queryKey: ['me'] });
          }
          
          toast.success('Foto profil berhasil diperbarui');
        }
      }
    } catch (error: unknown) {
      console.error(error);
      const msg = getErrorMessage(error) || 'Gagal memproses foto';
      toast.error(msg);
    } finally {
      setIsUploadingPhoto(false);
      setIsCropping(false);
      setCropImageSrc(null);
    }
  };

  const handleCancelCrop = () => {
    setIsCropping(false);
    setCropImageSrc(null);
  };

  if (isUserLoading || !user) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{profileCopy.title}</h1>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {ROLE_LABELS[fixedRole]}
            </span>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${verificationMeta.className}`}>
              {verificationMeta.label}
            </span>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-500">{profileCopy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isCandidateProfile ? (
            <Link
              to="/candidate/application"
              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
            >
              Buka Formulir PPDB
            </Link>
          ) : null}
          <button
            onClick={handleSubmit(onSubmit)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            disabled={updateMutation.isPending}
          >
              {updateMutation.isPending ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              {profileCopy.saveLabel}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Struktur Profil</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">{ROLE_LABELS[fixedRole]}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{profileCopy.readinessHelper}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {summaryLines.map((line) => (
              <div key={line} className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
                {line}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{profileCopy.readinessTitle}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold text-slate-900">{completeness.percent}%</p>
              <p className="mt-1 text-sm text-slate-500">
                {completeness.completed} dari {completeness.total} data prioritas sudah terisi
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              {completeness.missing.length === 0 ? 'Siap' : `${completeness.missing.length} belum`}
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${completeness.percent}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {completeness.missing.length === 0
              ? 'Data prioritas yang tersedia di sistem sudah terisi rapi.'
              : `Masih perlu dilengkapi: ${completeness.missing.slice(0, 3).join(', ')}${completeness.missing.length > 3 ? ', dan lainnya.' : '.'}`}
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{profileCopy.summaryTitle}</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Username</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{user.username}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Kontak Utama</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{watchedEmail || watchedPhone || '-'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Foto Profil</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {photoPreview ? 'Sudah diunggah' : canUploadPhoto ? 'Belum diunggah' : 'Tidak tersedia'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border-0 overflow-hidden">
        {isCropping && cropImageSrc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={handleCancelCrop}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-lg text-gray-900">Sesuaikan Foto Profil</h3>
                <button 
                  onClick={handleCancelCrop}
                  className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="relative w-full h-64 sm:h-80 bg-gray-900">
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                  classes={{
                    containerClassName: "bg-gray-900"
                  }}
                />
              </div>
              <div className="p-6 flex flex-col gap-6 bg-white">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700">Zoom</span>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={handleCancelCrop} 
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={handleSaveCrop} 
                    disabled={isUploadingPhoto} 
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploadingPhoto ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      'Simpan Foto'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col h-full">
          {/* Tabs Header */}
          <div className="border-b border-gray-100 overflow-x-auto">
            <div className="flex min-w-max px-4">
              {tabs.map((tab) => {
                if (!visibleTabs.includes(tab.id)) return null;

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
                    {getTabLabel(fixedRole, tab.id)}
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
                      Username
                    </label>
                    <input
                      id="user-username"
                      {...register('username')}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">Username tidak dapat diubah</p>
                  </div>
                  <div>
                    <label htmlFor="user-name" className="block text-sm font-medium text-gray-700 mb-1">
                      Nama Lengkap <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="user-name"
                      {...register('name')}
                      autoComplete="name"
                      disabled={isStudentProfile}
                      className={
                        isStudentProfile
                          ? 'w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed'
                          : 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }
                      placeholder={
                        isEmployeeProfile
                          ? 'Nama lengkap sesuai identitas PTK'
                          : isCandidateProfile
                            ? 'Nama lengkap calon siswa'
                            : 'Nama lengkap pengguna'
                      }
                    />
                    {isStudentProfile && (
                      <p className="text-xs text-gray-500 mt-1">Nama siswa diatur oleh Administrator</p>
                    )}
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
                      placeholder="Kosongkan jika tidak diubah"
                    />
                    {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                  </div>

                  {isStudentProfile && (
          <>
            <div>
              <label htmlFor="nis" className="block text-sm font-medium text-gray-700 mb-1">
                NIS
              </label>
              <input
                id="nis"
                {...register('nis')}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label htmlFor="nisn" className="block text-sm font-medium text-gray-700 mb-1">
                NISN
              </label>
              <input
                id="nisn"
                {...register('nisn')}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kelas
              </label>
              <input
                value={user?.studentClass?.name || '-'}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status Siswa
              </label>
              <input
                value={user?.studentStatus || 'ACTIVE'}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
          </>
        )}

                  {isCandidateProfile && (
                    <div>
                      <label htmlFor="candidate-nisn" className="block text-sm font-medium text-gray-700 mb-1">
                        NISN
                      </label>
                      <input
                        id="candidate-nisn"
                        {...register('nisn')}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-gray-500">NISN menjadi identitas login resmi calon siswa.</p>
                    </div>
                  )}

                  {fixedRole === 'EXAMINER' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Jurusan (Kompetensi Keahlian)
                      </label>
                      <input
                        disabled
                        value={
                          user?.examinerMajor
                            ? `${user.examinerMajor.name}${user.examinerMajor.code ? ` (${user.examinerMajor.code})` : ''}`
                            : '-'
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Jurusan diatur oleh Administrator
                      </p>
                    </div>
                  )}

                  {fixedRole === 'PARENT' && (
                    <div className="md:col-span-2" ref={childDropdownRef}>
                      <p className="block text-sm font-medium text-gray-700 mb-1">
                        Anak (NISN - Nama Siswa)
                      </p>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500">
                        <span className={selectedChildNisns.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
                          {selectedChildNisns.length === 0
                            ? 'Tidak ada anak terkait'
                            : selectedChildren.length === 1
                              ? (() => {
                                  const student = selectedChildren[0];
                                  return student.nisn ? `${student.nisn} - ${student.name}` : student.name;
                                })()
                              : `${selectedChildren.length} anak terhubung`}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Data anak diatur oleh Administrator
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Foto Profil</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
                        {photoPreview ? (
                          <img src={photoPreview} alt="Foto Profil" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-gray-400 text-center px-1">Tidak ada foto</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                           <input
                              type="hidden"
                              {...register('photo')}
                           />
                           <input
                              ref={photoInputRef}
                              id="photo"
                              type="file"
                              accept="image/jpeg,image/jpg,image/png"
                              onChange={handlePhotoUpload}
                              disabled={isUploadingPhoto}
                              autoComplete="off"
                              className="hidden"
                            />
                           <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              disabled={isUploadingPhoto || !canUploadPhoto}
                              className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg border-0 hover:bg-blue-100 transition-colors text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                           >
                              Pilih foto
                           </button>
                           <span className="text-sm text-gray-600">
                             {isUploadingPhoto ? 'Mengunggah...' : canUploadPhoto ? 'Gunakan foto formal / rapi' : 'Upload tidak tersedia'}
                           </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Format: JPG/PNG, maks 500KB</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Orang Tua Tab */}
              {activeTab === 'parents' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="fatherName" className="block text-sm font-medium text-gray-700 mb-1">Nama Ayah</label>
                    <input
                      id="fatherName"
                      {...register('fatherName')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="fatherOccupation" className="block text-sm font-medium text-gray-700 mb-1">Pekerjaan Ayah</label>
                    <input
                      id="fatherOccupation"
                      {...register('fatherOccupation')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="fatherEducation" className="block text-sm font-medium text-gray-700 mb-1">Pendidikan Ayah</label>
                    <select
                      id="fatherEducation"
                      {...register('fatherEducation')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Pilih pendidikan terakhir</option>
                      {EDUCATION_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fatherNik" className="block text-sm font-medium text-gray-700 mb-1">NIK Ayah</label>
                    <input
                      id="fatherNik"
                      {...register('fatherNik')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="fatherIncome" className="block text-sm font-medium text-gray-700 mb-1">Penghasilan Ayah</label>
                    <input
                      id="fatherIncome"
                      {...register('fatherIncome')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="md:col-span-2 pt-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Data Ibu</h3>
                  </div>

                  <div>
                    <label htmlFor="motherName" className="block text-sm font-medium text-gray-700 mb-1">Nama Ibu</label>
                    <input
                      id="motherName"
                      {...register('motherName')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="motherOccupation" className="block text-sm font-medium text-gray-700 mb-1">Pekerjaan Ibu</label>
                    <input
                      id="motherOccupation"
                      {...register('motherOccupation')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="motherEducation" className="block text-sm font-medium text-gray-700 mb-1">Pendidikan Ibu</label>
                    <select
                      id="motherEducation"
                      {...register('motherEducation')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Pilih pendidikan terakhir</option>
                      {EDUCATION_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="studentMotherNik" className="block text-sm font-medium text-gray-700 mb-1">NIK Ibu</label>
                    <input
                      id="studentMotherNik"
                      {...register('motherNik')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="motherIncome" className="block text-sm font-medium text-gray-700 mb-1">Penghasilan Ibu</label>
                    <input
                      id="motherIncome"
                      {...register('motherIncome')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="md:col-span-2 pt-4 pb-2">
                    <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">Data Wali (Opsional)</h3>
                  </div>

                  <div>
                    <label htmlFor="guardianName" className="block text-sm font-medium text-gray-700 mb-1">Nama Wali</label>
                    <input
                      id="guardianName"
                      {...register('guardianName')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="guardianOccupation" className="block text-sm font-medium text-gray-700 mb-1">Pekerjaan Wali</label>
                    <input
                      id="guardianOccupation"
                      {...register('guardianOccupation')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="guardianEducation" className="block text-sm font-medium text-gray-700 mb-1">Pendidikan Wali</label>
                    <select
                      id="guardianEducation"
                      {...register('guardianEducation')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Pilih pendidikan terakhir</option>
                      {EDUCATION_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="guardianPhone" className="block text-sm font-medium text-gray-700 mb-1">No. HP Wali</label>
                    <input
                      id="guardianPhone"
                      {...register('guardianPhone')}
                      autoComplete="tel"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Data Pribadi Tab */}
              {activeTab === 'personal' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fixedRole === 'EXAMINER' && (
                    <div className="md:col-span-2">
                      <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Perusahaan/Instansi
                      </label>
                      <input
                        id="institution"
                        {...register('institution')}
                        autoComplete="organization"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Masukkan nama perusahaan atau instansi"
                      />
                    </div>
                  )}
                  {isEmployeeProfile && (
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
                  {(isEmployeeProfile || isStudentProfile) && (
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
                      {isEmployeeProfile && (
                        <div>
                          <label htmlFor="nuptk" className="block text-sm font-medium text-gray-700 mb-1">NUPTK</label>
                          <input
                            id="nuptk"
                            {...register('nuptk')}
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      )}
                      {isStudentProfile && (
                        <div>
                          <label htmlFor="familyCardNumber" className="block text-sm font-medium text-gray-700 mb-1">
                            Nomor KK
                          </label>
                          <input
                            id="familyCardNumber"
                            {...register('familyCardNumber')}
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Nomor kartu keluarga"
                          />
                        </div>
                      )}
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
                  {(isStudentProfile || isCandidateProfile) && (
                    <>
                      <div>
                        <label htmlFor="religion" className="block text-sm font-medium text-gray-700 mb-1">Agama</label>
                        <select
                          id="religion"
                          {...register('religion')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Pilih Agama</option>
                          <option value="ISLAM">Islam</option>
                          <option value="KRISTEN">Kristen</option>
                          <option value="KATOLIK">Katolik</option>
                          <option value="HINDU">Hindu</option>
                          <option value="BUDDHA">Buddha</option>
                          <option value="KONGHUCU">Konghucu</option>
                        </select>
                      </div>
                      {isStudentProfile && (
                        <>
                          <div>
                            <label htmlFor="childNumber" className="block text-sm font-medium text-gray-700 mb-1">Anak Ke-</label>
                            <input
                              id="childNumber"
                              {...register('childNumber')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label htmlFor="siblingsCount" className="block text-sm font-medium text-gray-700 mb-1">Jumlah Saudara</label>
                            <input
                              id="siblingsCount"
                              {...register('siblingsCount')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {isEmployeeProfile && (
                    <div className="md:col-span-2">
                      <label htmlFor="motherName" className="block text-sm font-medium text-gray-700 mb-1">Nama Ibu Kandung</label>
                      <input
                        id="motherName"
                        {...register('motherName')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <div className="mt-4">
                        <label htmlFor="motherNik" className="block text-sm font-medium text-gray-700 mb-1">
                          NIK Ibu Kandung
                        </label>
                        <input
                          id="motherNik"
                          {...register('motherNik')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Diisi sesuai data identitas keluarga"
                        />
                      </div>
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
                      autoComplete="street-address"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                    />
                  </div>
                  {(isEmployeeProfile || isStudentProfile || isParentProfile) && (
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
                        <label htmlFor="province" className="block text-sm font-medium text-gray-700 mb-1">Provinsi</label>
                        <input
                          id="province"
                          {...register('province')}
                          autoComplete="address-level1"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Contoh: Jawa Barat"
                        />
                      </div>
                      <div>
                        <label htmlFor="cityRegency" className="block text-sm font-medium text-gray-700 mb-1">
                          Kabupaten / Kota
                        </label>
                        <input
                          id="cityRegency"
                          {...register('cityRegency')}
                          autoComplete="address-level2"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Contoh: Kota Bekasi"
                        />
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

              {/* Data Kepegawaian Tab */}
              {activeTab === 'employment' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fixedRole === 'STAFF' && (
                    <div className="md:col-span-2">
                      <label htmlFor="staffPosition" className="block text-sm font-medium text-gray-700 mb-1">Posisi / Jabatan Staff</label>
                      <select
                        id="staffPosition"
                        {...register('staffPosition')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Pilih Jabatan</option>
                        <option value="STAFF_KEUANGAN">Bendahara (Staff Keuangan)</option>
                        <option value="STAFF_ADMINISTRASI">Staff Administrasi</option>
                        <option value="KEPALA_TU">Kepala Tata Usaha</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label htmlFor="ptkType" className="block text-sm font-medium text-gray-700 mb-1">
                      {fixedRole === 'EXAMINER' ? 'Peran Penguji / Asesor' : 'Jenis PTK / Peran'}
                    </label>
                    <input
                      id="ptkType"
                      {...register('ptkType')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={
                        fixedRole === 'EXTRACURRICULAR_TUTOR'
                          ? 'Contoh: Pembina Ekstrakurikuler'
                          : fixedRole === 'EXAMINER'
                            ? 'Contoh: Penguji Industri / Asesor'
                            : 'Contoh: Guru Mapel, Staff Administrasi'
                      }
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
                    <label htmlFor="highestEducation" className="block text-sm font-medium text-gray-700 mb-1">Pendidikan Terakhir</label>
                    <select
                      id="highestEducation"
                      {...register('highestEducation')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Pilih pendidikan terakhir</option>
                      {EDUCATION_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="studyProgram" className="block text-sm font-medium text-gray-700 mb-1">Program Studi / Jurusan</label>
                    <input
                      id="studyProgram"
                      {...register('studyProgram')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Contoh: Pendidikan Matematika / Akuntansi"
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
                    <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-1">
                      {fixedRole === 'EXAMINER' ? 'Instansi / Perusahaan' : 'Lembaga Pengangkat'}
                    </label>
                    <input
                      id="institution"
                      {...register('institution')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={
                        fixedRole === 'EXAMINER'
                          ? 'Nama perusahaan atau lembaga asal'
                          : 'Contoh: Yayasan / Pemerintah Daerah'
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <p className="block text-sm font-medium text-gray-700 mb-1">Penugasan Aktif</p>
                    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      {fixedRole === 'TEACHER' && (
                        <>
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                            <p className="text-sm font-medium text-gray-900">Tugas tambahan</p>
                            <p className="mt-1 text-sm text-gray-600">
                              {user?.additionalDuties?.length ? user.additionalDuties.join(', ') : 'Belum ada tugas tambahan yang ditetapkan.'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                            <p className="text-sm font-medium text-gray-900">Kelas yang diampu</p>
                            <p className="mt-1 text-sm text-gray-600">
                              {user?.teacherClasses?.length
                                ? user.teacherClasses.map((item) => item.name).join(', ')
                                : 'Belum ada kelas yang terhubung.'}
                            </p>
                          </div>
                        </>
                      )}

                      {fixedRole === 'PRINCIPAL' && (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                          <p className="text-sm font-medium text-gray-900">Fokus penugasan</p>
                          <p className="mt-1 text-sm text-gray-600">
                            Profil kepala sekolah memakai struktur yang sama dengan PTK agar identitas dan data penugasan tetap konsisten di seluruh modul.
                          </p>
                        </div>
                      )}

                      {fixedRole === 'STAFF' && (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                          <p className="text-sm font-medium text-gray-900">Divisi kerja</p>
                          <p className="mt-1 text-sm text-gray-600">
                            {watchedStaffPosition || watchedPtkType || 'Pilih jabatan staff yang paling sesuai dengan workspace Anda.'}
                          </p>
                        </div>
                      )}

                      {fixedRole === 'EXTRACURRICULAR_TUTOR' && (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                          <p className="text-sm font-medium text-gray-900">Ekstrakurikuler aktif</p>
                          <p className="mt-1 text-sm text-gray-600">
                            {user?.ekskulTutorAssignments?.length
                              ? user.ekskulTutorAssignments.map((item) => item.ekskul?.name || 'Ekskul').join(', ')
                              : 'Belum ada ekstrakurikuler aktif yang ditautkan.'}
                          </p>
                        </div>
                      )}

                      {fixedRole === 'EXAMINER' && (
                        <>
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                            <p className="text-sm font-medium text-gray-900">Jurusan damping</p>
                            <p className="mt-1 text-sm text-gray-600">
                              {user?.examinerMajor?.name || 'Belum diatur oleh administrator.'}
                            </p>
                          </div>
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                            <p className="text-sm font-medium text-gray-900">Instansi</p>
                            <p className="mt-1 text-sm text-gray-600">
                              {watchedInstitution || 'Lengkapi nama instansi atau perusahaan asal penguji.'}
                            </p>
                          </div>
                        </>
                      )}

                      <p className="text-xs text-gray-500">
                        Penugasan struktural dan relasi kerja utama tetap mengikuti konfigurasi dari admin atau workspace terkait.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload File Tab */}
              {activeTab === 'documents' && (
                <div className="space-y-4">
                  {fixedRole === 'CALON_SISWA' && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                      <p className="text-sm font-semibold text-blue-900">Kategori Dokumen PPDB</p>
                      <p className="mt-1 text-xs text-blue-700">
                        Pilih kategori sebelum upload supaya checklist PPDB mengenali dokumen dengan benar.
                      </p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {CANDIDATE_DOCUMENT_OPTIONS.map((option) => {
                          const active = candidateDocumentCategory === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setCandidateDocumentCategory(option.value)}
                              className={`rounded-xl border px-3 py-3 text-left transition ${
                                active
                                  ? 'border-blue-300 bg-white text-blue-900 shadow-sm'
                                  : 'border-blue-100 bg-white/80 text-slate-700 hover:border-blue-200'
                              }`}
                            >
                              <p className="text-sm font-semibold">{option.label}</p>
                              <p className="mt-1 text-xs text-slate-500">{option.description}</p>
                              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                Format: {option.acceptedFormats.join(', ')}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex justify-center rounded-lg border-2 border-dashed px-6 pt-5 pb-6 transition-colors ${
                      canUploadDocuments
                        ? 'cursor-pointer border-gray-300 hover:bg-gray-50'
                        : 'cursor-not-allowed border-gray-200 bg-gray-50'
                    }`}
                    onClick={() => {
                      if (canUploadDocuments) fileInputRef.current?.click();
                    }}
                  >
                    <div className="space-y-1 text-center">
                      <div className="mx-auto h-12 w-12 text-gray-400">
                        {isUploading ? <Loader2 className="animate-spin w-12 h-12" /> : <Save className="w-12 h-12" />}
                      </div>
                      <div className="flex text-sm text-gray-600 justify-center">
                        <span className="relative cursor-pointer rounded-md font-medium text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-500">
                          <span>Pilih dokumen</span>
                          <input 
                            ref={fileInputRef}
                            id="file-upload" 
                            name="file-upload" 
                            type="file" 
                            className="sr-only" 
                            multiple 
                            onChange={handleFileUpload} 
                            disabled={isUploading || !canUploadDocuments} 
                            onClick={(e) => e.stopPropagation()} // Prevent double trigger if input is clicked directly
                          />
                        </span>
                        <p className="pl-1">{canUploadDocuments ? 'atau klik area ini untuk upload' : 'upload dokumen tidak tersedia untuk role ini'}</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        PDF, PNG, JPG maksimal 2MB
                      </p>
                    </div>
                  </div>

                  {!canUploadDocuments && (
                    <p className="text-sm text-gray-500">
                      Upload dokumen profil saat ini tersedia untuk admin, guru, kepala sekolah, staff, tutor, examiner, dan calon siswa.
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Save size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{field.title}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {fixedRole === 'CALON_SISWA'
                                ? getCandidateDocumentCategoryLabel(field.category)
                                : field.category}
                            </p>
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
                          onClick={async () => {
                            const currentDocs = (getValues('documents') || []) as { title: string; fileUrl: string; category: string }[];
                            const updatedDocs = currentDocs.filter((_doc: { title: string; fileUrl: string; category: string }, i: number) => i !== index);
                            
                            // Remove from UI
                            remove(index);
                            
                            // Auto-save to backend
                            if (user?.id) {
                                try {
                                    await userService.update(user.id, { 
                                        documents: updatedDocs.map((d) => ({
                                            title: d.title,
                                            fileUrl: d.fileUrl,
                                            category: d.category
                                        }))
                                    });
                                    queryClient.invalidateQueries({ queryKey: ['me'] });
                                    toast.success('Dokumen berhasil dihapus');
                                } catch (error) {
                                    console.error(error);
                                    toast.error('Gagal menghapus dokumen dari server');
                                }
                            }
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          title="Hapus Dokumen"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                    {fields.length === 0 && (
                      <p className="text-center text-sm text-gray-500 py-4">Belum ada dokumen yang diunggah</p>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
