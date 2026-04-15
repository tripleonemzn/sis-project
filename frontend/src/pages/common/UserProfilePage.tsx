import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../services/user.service';
import { authService } from '../../services/auth.service';
import { uploadService } from '../../services/upload.service';
import { ProfileEducationEditor } from '../../components/profile/ProfileEducationEditor';
import { SupportingDocumentsEditor } from '../../components/profile/SupportingDocumentsEditor';
import {
  CANDIDATE_DOCUMENT_OPTIONS,
  getCandidateDocumentCategoryLabel,
} from '../public/candidateShared';
import type { User, UserWrite } from '../../types/auth';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import Cropper, { type Point, type Area } from 'react-easy-crop';
import {
  buildEducationHistoryState,
  createEmptyEducationHistory,
  resolveEducationSummaryFromHistories,
  resolveProfileEducationTrackForRole,
  sanitizeEducationHistories,
  type ProfileEducationDocument,
  type ProfileEducationHistory,
  type ProfileEducationLevel,
} from '../../features/profileEducation/profileEducation';
import {
  SUPPORTING_DOCUMENT_CATEGORY,
  type SupportingDocumentRecord,
} from '../../features/profileDocuments/supportingDocuments';

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

const normalizeDigitsInput = (value?: string | null) => String(value || '').replace(/\s+/g, '').trim();

const optionalExactDigitsField = (label: string, length: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === 'string' ? normalizeDigitsInput(value) : value))
    .refine((value) => value == null || value === '' || new RegExp(`^\\d{${length}}$`).test(value), {
      message: `${label} harus ${length} digit angka`,
    });

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
  citizenship: z.string().optional().nullable(),
  maritalStatus: z.string().optional().nullable(),
  additionalDuties: z.array(z.string()).optional(),
  birthPlace: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  photo: z.string().optional().nullable(),
  nik: optionalExactDigitsField('NIK', 16),
  familyCardNumber: optionalExactDigitsField('Nomor KK', 16),
  nuptk: optionalExactDigitsField('NUPTK', 16),
  highestEducation: z.string().optional().nullable(),
  studyProgram: z.string().optional().nullable(),
  motherName: z.string().optional().nullable(),
  motherNik: optionalExactDigitsField('NIK Ibu', 16),
  rt: z.string().optional().nullable(),
  rw: z.string().optional().nullable(),
  dusun: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  provinceCode: optionalExactDigitsField('Kode Provinsi', 2),
  cityRegency: z.string().optional().nullable(),
  cityRegencyCode: optionalExactDigitsField('Kode Kabupaten / Kota', 4),
  village: z.string().optional().nullable(),
  subdistrict: z.string().optional().nullable(),
  subdistrictCode: optionalExactDigitsField('Kode Kecamatan', 7),
  villageCode: optionalExactDigitsField('Kode Desa / Kelurahan', 10),
  postalCode: optionalExactDigitsField('Kode Pos', 5),
  ptkType: z.string().optional().nullable(),
  employeeStatus: z.string().optional().nullable(),
  appointmentDecree: z.string().optional().nullable(),
  appointmentDate: z.string().optional().nullable(),
  assignmentDecree: z.string().optional().nullable(),
  assignmentDate: z.string().optional().nullable(),
  institution: z.string().optional().nullable(),
  employeeActiveStatus: z.string().optional().nullable(),
  salarySource: z.string().optional().nullable(),
  examinerMajorId: z.number().optional().nullable(),
  childNisns: z.array(z.string()).optional(),
  staffPosition: z.string().optional(),
  
  // Student Specific Fields
  religion: z.string().optional().nullable(),
  childNumber: z.string().optional().nullable(),
  distanceToSchool: z.string().optional().nullable(),
  familyStatus: z.string().optional().nullable(),
  livingWith: z.string().optional().nullable(),
  transportationMode: z.string().optional().nullable(),
  travelTimeToSchool: z.string().optional().nullable(),
  kipNumber: z.string().optional().nullable(),
  pkhNumber: z.string().optional().nullable(),
  kksNumber: z.string().optional().nullable(),
  siblingsCount: z.string().optional().nullable(),
  
  fatherName: z.string().optional().nullable(),
  fatherNik: optionalExactDigitsField('NIK Ayah', 16),
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
  'D3',
  'D4 / S1',
  'S2',
  'S3',
] as const;

const FAMILY_STATUS_OPTIONS = [
  'Anak Kandung',
  'Anak Tiri',
  'Anak Angkat',
] as const;

const LIVING_WITH_OPTIONS = [
  'Orang Tua',
  'Wali',
  'Saudara',
  'Asrama',
  'Panti Asuhan',
  'Pesantren',
  'Kost',
  'Lainnya',
] as const;

const TRANSPORTATION_MODE_OPTIONS = [
  'Jalan Kaki',
  'Sepeda',
  'Sepeda Motor',
  'Mobil Pribadi',
  'Angkutan Umum',
  'Antar Jemput',
  'Ojek / Ojol',
  'Perahu Penyeberangan',
  'Lainnya',
] as const;

const CITIZENSHIP_OPTIONS = ['WNI', 'WNA'] as const;

const MARITAL_STATUS_OPTIONS = [
  'Belum Menikah',
  'Menikah',
  'Cerai Hidup',
  'Cerai Mati',
] as const;

const RELIGION_OPTIONS = [
  { value: 'ISLAM', label: 'Islam' },
  { value: 'KRISTEN', label: 'Kristen' },
  { value: 'KATOLIK', label: 'Katolik' },
  { value: 'HINDU', label: 'Hindu' },
  { value: 'BUDDHA', label: 'Buddha' },
  { value: 'KONGHUCU', label: 'Konghucu' },
] as const;

const MANUAL_OPTION_VALUE = '__MANUAL__' as const;

const STAFF_POSITION_OPTIONS = [
  { value: 'STAFF_KEUANGAN', label: 'Bendahara (Staff Keuangan)' },
  { value: 'STAFF_ADMINISTRASI', label: 'Staff Administrasi' },
  { value: 'KEPALA_TU', label: 'Kepala Tata Usaha' },
] as const;

const EMPLOYEE_STATUS_OPTIONS = [
  'PNS',
  'PPPK',
  'GTY / PTY',
  'GTT / PTT',
  'Honor Sekolah',
  'Honor Daerah',
  'Kontrak Yayasan',
  'Mitra Industri / Profesional',
] as const;

const EMPLOYEE_ROLE_OPTIONS_BY_ROLE: Record<
  Exclude<UserFormRole, 'ADMIN' | 'STUDENT' | 'PARENT' | 'CALON_SISWA' | 'UMUM' | 'STAFF'>,
  readonly { value: string; label: string }[]
> = {
  TEACHER: [
    { value: 'Guru Mata Pelajaran', label: 'Guru Mata Pelajaran' },
    { value: 'Guru BK', label: 'Guru BK' },
    { value: 'Guru Produktif / Kejuruan', label: 'Guru Produktif / Kejuruan' },
    { value: 'Wali Kelas', label: 'Wali Kelas' },
    { value: 'Wakil Kepala Sekolah', label: 'Wakil Kepala Sekolah' },
    { value: 'Kepala Program Keahlian', label: 'Kepala Program Keahlian' },
    { value: 'Koordinator Laboratorium', label: 'Koordinator Laboratorium' },
  ],
  PRINCIPAL: [
    { value: 'Kepala Sekolah', label: 'Kepala Sekolah' },
    { value: 'Pelaksana Tugas Kepala Sekolah', label: 'Pelaksana Tugas Kepala Sekolah' },
  ],
  EXTRACURRICULAR_TUTOR: [
    { value: 'Pembina Ekstrakurikuler', label: 'Pembina Ekstrakurikuler' },
    { value: 'Pelatih Ekstrakurikuler', label: 'Pelatih Ekstrakurikuler' },
    { value: 'Koordinator Ekstrakurikuler', label: 'Koordinator Ekstrakurikuler' },
    { value: 'Mentor Kegiatan', label: 'Mentor Kegiatan' },
  ],
  EXAMINER: [
    { value: 'Penguji Industri', label: 'Penguji Industri' },
    { value: 'Asesor Kompetensi', label: 'Asesor Kompetensi' },
    { value: 'Penguji Eksternal', label: 'Penguji Eksternal' },
    { value: 'Mitra Industri', label: 'Mitra Industri' },
  ],
} as const;

type ProfileVariant = 'employee' | 'student' | 'candidate' | 'parent' | 'admin';

const normalizeStructuredFieldValue = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === MANUAL_OPTION_VALUE) {
    return '';
  }
  return trimmed;
};

const getStructuredSelectValue = (
  value: string | null | undefined,
  options: readonly string[] | readonly { value: string; label: string }[]
) => {
  const normalized = normalizeStructuredFieldValue(value);
  if (!normalized) {
    return '';
  }

  const knownValues = options.map((option) => (typeof option === 'string' ? option : option.value));
  return knownValues.includes(normalized) ? normalized : MANUAL_OPTION_VALUE;
};

const getEmployeeRoleOptions = (role: UserFormRole) => {
  if (role === 'STAFF') {
    return STAFF_POSITION_OPTIONS;
  }
  return EMPLOYEE_ROLE_OPTIONS_BY_ROLE[role as keyof typeof EMPLOYEE_ROLE_OPTIONS_BY_ROLE] || [];
};

const getStaffPositionLabel = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  return STAFF_POSITION_OPTIONS.find((option) => option.value === normalized)?.label || normalized;
};

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
  { id: 'education', label: 'Riwayat Pendidikan' },
  { id: 'documents', label: 'Dokumen Pendukung' },
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
    return ['account', 'personal', 'contact', 'employment', 'education', 'documents'] as TabId[];
  }
  if (variant === 'student') {
    return ['account', 'personal', 'contact', 'parents', 'education', 'documents'] as TabId[];
  }
  if (variant === 'candidate') {
    return ['account', 'personal', 'contact', 'education', 'documents'] as TabId[];
  }
  if (variant === 'parent') {
    return ['account', 'personal', 'contact', 'education'] as TabId[];
  }
  return ['account', 'personal', 'contact', 'education', 'documents'] as TabId[];
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
      education: 'Riwayat Pendidikan',
      documents: 'Dokumen Pendukung',
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
      education: 'Riwayat Pendidikan',
      documents: 'Dokumen Pendukung',
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
      education: 'Riwayat Pendidikan',
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
      education: 'Riwayat Pendidikan',
      documents: 'Dokumen Pendukung',
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
  const [isManualPtkType, setIsManualPtkType] = useState(false);
  const [isManualEmployeeStatus, setIsManualEmployeeStatus] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [educationHistories, setEducationHistories] = useState<ProfileEducationHistory[]>([]);
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
  const refreshSelfProfile = async () => {
    authService.clearMeCache();
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const { data: userResponse, isLoading: isUserLoading } = useQuery<{ data: User }>({
    queryKey: ['me'],
    queryFn: authService.getMe,
  });

  const user = userResponse?.data;
  const fixedRole = resolveUserFormRole(user?.role);
  const profileVariant = getProfileVariant(fixedRole);
  const profileCopy = useMemo(() => getProfileCopy(fixedRole), [fixedRole]);
  const visibleTabs = useMemo(() => getVisibleTabs(fixedRole), [fixedRole]);
  const educationTrack = useMemo(() => resolveProfileEducationTrackForRole(fixedRole), [fixedRole]);
  const includeCertificationHistory = educationTrack === 'NON_STUDENT';
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
    'STUDENT',
    'CALON_SISWA',
  ].includes(fixedRole);
  const verificationMeta = getVerificationStatusMeta(user?.verificationStatus);
  const educationSummary = useMemo(
    () =>
      resolveEducationSummaryFromHistories(educationHistories, educationTrack, {
        includeCertification: includeCertificationHistory,
      }),
    [educationHistories, educationTrack, includeCertificationHistory],
  );
  const isEmployeeProfile = profileVariant === 'employee';
  const isStudentProfile = profileVariant === 'student';
  const isCandidateProfile = profileVariant === 'candidate';
  const isParentProfile = profileVariant === 'parent';
  const usesStructuredSupportingDocuments =
    isEmployeeProfile || fixedRole === 'ADMIN' || fixedRole === 'STUDENT';

  const { data: studentsForParent } = useQuery<{ data: User[] }>({
    queryKey: ['students-for-parent'],
    queryFn: async () => userService.getAll({ role: 'STUDENT' }),
    enabled: fixedRole === 'PARENT',
  });

  const { register, handleSubmit, setValue, reset, watch, getValues, formState: { errors } } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      documents: [],
      additionalDuties: [],
      childNisns: [],
    }
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
  const watchedCitizenship = watch('citizenship');
  const watchedMaritalStatus = watch('maritalStatus');
  const watchedBirthPlace = watch('birthPlace');
  const watchedBirthDate = watch('birthDate');
  const watchedMotherName = watch('motherName');
  const watchedMotherNik = watch('motherNik');
  const watchedPtkType = watch('ptkType');
  const watchedEmployeeStatus = watch('employeeStatus');
  const watchedInstitution = watch('institution');
  const watchedStaffPosition = watch('staffPosition');
  const watchedReligion = watch('religion');
  const watchedDistanceToSchool = watch('distanceToSchool');
  const watchedFamilyStatus = watch('familyStatus');
  const watchedLivingWith = watch('livingWith');
  const watchedTransportationMode = watch('transportationMode');
  const watchedTravelTimeToSchool = watch('travelTimeToSchool');
  const watchedProvince = watch('province');
  const watchedCityRegency = watch('cityRegency');
  const watchedDocuments = (watch('documents') || []) as SupportingDocumentRecord[];
  const employeeRoleOptions = useMemo(() => getEmployeeRoleOptions(fixedRole), [fixedRole]);
  const ptkTypeSelectValue = useMemo(() => {
    if (fixedRole !== 'STAFF' && isManualPtkType) {
      return MANUAL_OPTION_VALUE;
    }
    if (fixedRole === 'STAFF') {
      return getStructuredSelectValue(watchedStaffPosition || watchedPtkType, STAFF_POSITION_OPTIONS);
    }
    return getStructuredSelectValue(watchedPtkType, employeeRoleOptions);
  }, [employeeRoleOptions, fixedRole, isManualPtkType, watchedPtkType, watchedStaffPosition]);
  const employeeStatusSelectValue = useMemo(
    () =>
      isManualEmployeeStatus
        ? MANUAL_OPTION_VALUE
        : getStructuredSelectValue(watchedEmployeeStatus, EMPLOYEE_STATUS_OPTIONS),
    [isManualEmployeeStatus, watchedEmployeeStatus]
  );
  const normalizedEmployeeRoleValue = useMemo(() => {
    if (fixedRole === 'STAFF') {
      return normalizeStructuredFieldValue(watchedStaffPosition) || normalizeStructuredFieldValue(watchedPtkType);
    }
    return normalizeStructuredFieldValue(watchedPtkType);
  }, [fixedRole, watchedPtkType, watchedStaffPosition]);
  const normalizedEmployeeStatusValue = useMemo(
    () => normalizeStructuredFieldValue(watchedEmployeeStatus),
    [watchedEmployeeStatus]
  );

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
        { label: 'Nomor KK', value: watchedFamilyCardNumber },
        { label: 'Jenis kelamin', value: watchedGender },
        { label: 'Kewarganegaraan', value: watchedCitizenship },
        { label: 'Status perkawinan', value: watchedMaritalStatus },
        { label: 'Tempat lahir', value: watchedBirthPlace },
        { label: 'Tanggal lahir', value: watchedBirthDate },
        { label: 'Agama', value: watchedReligion },
        { label: 'Nama ibu kandung', value: watchedMotherName },
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
        { label: 'Jenis PTK / peran', value: normalizedEmployeeRoleValue },
        { label: 'Status kepegawaian', value: normalizedEmployeeStatusValue },
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
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
        { label: 'Status dalam keluarga', value: watchedFamilyStatus },
        { label: 'Jenis tinggal', value: watchedLivingWith },
        { label: 'Alat transportasi', value: watchedTransportationMode },
        { label: 'Jarak ke sekolah', value: watchedDistanceToSchool },
        { label: 'Waktu tempuh ke sekolah', value: watchedTravelTimeToSchool },
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
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
        { label: 'Dokumen PPDB', value: watchedDocuments.length > 0 ? watchedDocuments.length : null },
      ];
    } else if (isParentProfile) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: watchedName },
        { label: 'Kontak aktif', value: watchedPhone || watchedEmail },
        { label: 'Alamat', value: watchedAddress },
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
      ];
    } else {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: watchedName },
        { label: 'Kontak aktif', value: watchedPhone || watchedEmail },
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
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
    watchedCitizenship,
    watchedCityRegency,
    watchedDistanceToSchool,
    watchedDocuments.length,
    watchedEmail,
    educationSummary.highestEducation,
    watchedFamilyStatus,
    watchedFamilyCardNumber,
    watchedGender,
    watchedLivingWith,
    watchedMotherName,
    watchedMotherNik,
    watchedMaritalStatus,
    watchedName,
    watchedNik,
    watchedNis,
    watchedNisn,
    watchedPhone,
    watchedProvince,
    watchedReligion,
    normalizedEmployeeRoleValue,
    normalizedEmployeeStatusValue,
    watchedTransportationMode,
    watchedTravelTimeToSchool,
  ]);

  const summaryLines = useMemo(() => {
    if (isEmployeeProfile) {
      if (fixedRole === 'TEACHER') {
        return [
          `Tugas tambahan: ${user?.additionalDuties?.length ? user.additionalDuties.join(', ') : 'Belum ada'}`,
          `Kelas tugas: ${user?.teacherClasses?.length || 0} kelas`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${watchedDocuments.length} file`,
        ];
      }

      if (fixedRole === 'EXTRACURRICULAR_TUTOR') {
        return [
          `Ekstrakurikuler aktif: ${user?.ekskulTutorAssignments?.length || 0}`,
          `Penugasan utama: ${normalizedEmployeeRoleValue || 'Tutor / pembina'}`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${watchedDocuments.length} file`,
        ];
      }

      if (fixedRole === 'EXAMINER') {
        return [
          `Jurusan damping: ${user?.examinerMajor?.name || '-'}`,
          `Instansi: ${watchedInstitution || 'Belum diisi'}`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${watchedDocuments.length} file`,
        ];
      }

      if (fixedRole === 'STAFF') {
        return [
          `Divisi: ${getStaffPositionLabel(watchedStaffPosition) || normalizedEmployeeRoleValue || 'Belum dipilih'}`,
          `Status kepegawaian: ${normalizedEmployeeStatusValue || 'Belum diisi'}`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${watchedDocuments.length} file`,
        ];
      }

      return [
        `Peran aktif: ${ROLE_LABELS[fixedRole]}`,
        `Status kepegawaian: ${normalizedEmployeeStatusValue || 'Belum diisi'}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Dokumen pendukung: ${watchedDocuments.length} file`,
      ];
    }

    if (isStudentProfile) {
      return [
        `Kelas aktif: ${user?.studentClass?.name || '-'}`,
        `Status siswa: ${user?.studentStatus || 'ACTIVE'}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Email / HP: ${watchedEmail || watchedPhone || 'Belum diisi'}`,
      ];
    }

    if (isCandidateProfile) {
      return [
        `NISN: ${watchedNisn || '-'}`,
        `Status akun: ${verificationMeta.label}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Dokumen PPDB: ${watchedDocuments.length} file`,
      ];
    }

    if (isParentProfile) {
      return [
        `Anak terhubung: ${selectedChildren.length}`,
        `Kontak aktif: ${watchedEmail || watchedPhone || 'Belum diisi'}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Alamat: ${watchedAddress ? 'Sudah diisi' : 'Belum diisi'}`,
      ];
    }

    return [
      `Role aktif: ${ROLE_LABELS[fixedRole]}`,
      `Kontak aktif: ${watchedEmail || watchedPhone || 'Belum diisi'}`,
      `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
      `Alamat: ${watchedAddress ? 'Sudah diisi' : 'Belum diisi'}`,
    ];
  }, [
    fixedRole,
    educationSummary.completedLevels,
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
    watchedInstitution,
    watchedNisn,
    watchedPhone,
    normalizedEmployeeRoleValue,
    normalizedEmployeeStatusValue,
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
        citizenship: user.citizenship || '',
        maritalStatus: user.maritalStatus || '',
        additionalDuties: formDuties,
        birthPlace: user.birthPlace || '',
        birthDate: user.birthDate ? String(user.birthDate).slice(0, 10) : '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        photo: user.photo || '',
        examinerMajorId: user.examinerMajor?.id || user.examinerMajorId || null,
        institution: user.institution || '',
        employeeActiveStatus: user.employeeActiveStatus || '',
        salarySource: user.salarySource || '',
        
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
        distanceToSchool: user.distanceToSchool || '',
        familyStatus: user.familyStatus || '',
        livingWith: user.livingWith || '',
        transportationMode: user.transportationMode || '',
        travelTimeToSchool: user.travelTimeToSchool || '',
        kipNumber: user.kipNumber || '',
        pkhNumber: user.pkhNumber || '',
        kksNumber: user.kksNumber || '',
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
        provinceCode: user.provinceCode || '',
        cityRegency: user.cityRegency || '',
        cityRegencyCode: user.cityRegencyCode || '',
        village: user.village || '',
        subdistrict: user.subdistrict || '',
        subdistrictCode: user.subdistrictCode || '',
        villageCode: user.villageCode || '',
        postalCode: user.postalCode || '',

        // Employment details
        ptkType: user.ptkType || '',
        employeeStatus: user.employeeStatus || '',
        appointmentDecree: user.appointmentDecree || '',
        appointmentDate: user.appointmentDate ? String(user.appointmentDate).slice(0, 10) : '',
        assignmentDecree: user.assignmentDecree || '',
        assignmentDate: user.assignmentDate ? String(user.assignmentDate).slice(0, 10) : '',
        
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
      setEducationHistories(
        buildEducationHistoryState({
          track: educationTrack,
          histories: (user.educationHistories || []) as ProfileEducationHistory[],
          legacyHighestEducation: user.highestEducation,
          legacyInstitutionName: '',
          legacyStudyProgram: user.studyProgram,
          includeCertification: includeCertificationHistory,
        }),
      );
      setPhotoPreview(user.photo || null);
      setIsManualPtkType(
        fixedRole !== 'STAFF' && getStructuredSelectValue(user.ptkType || '', employeeRoleOptions) === MANUAL_OPTION_VALUE
      );
      setIsManualEmployeeStatus(
        getStructuredSelectValue(user.employeeStatus || '', EMPLOYEE_STATUS_OPTIONS) === MANUAL_OPTION_VALUE
      );
      
      isInitializedRef.current = true;
      lastUserIdRef.current = user.id;
    }
  }, [educationTrack, employeeRoleOptions, fixedRole, includeCertificationHistory, reset, user]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs]);



  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UserFormValues }) => {
       const {
         staffPosition,
         documents,
         password,
         childNisns,
         additionalDuties,
         highestEducation,
         studyProgram,
         ...rest
       } = data;
       void highestEducation;
       void studyProgram;

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
         basePayload.ptkType =
           normalizeStructuredFieldValue(staffPosition) || normalizeStructuredFieldValue(data.ptkType) || null;
       } else if (isEmployeeProfile) {
         basePayload.ptkType = normalizeStructuredFieldValue(data.ptkType) || null;
       }

       if (isEmployeeProfile) {
         basePayload.employeeStatus = normalizeStructuredFieldValue(data.employeeStatus) || null;
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
        educationHistories: sanitizeEducationHistories(educationHistories, educationTrack, {
          includeCertification: includeCertificationHistory,
        }),
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
    onSuccess: async () => {
      await refreshSelfProfile();
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
        fixedRole === 'CALON_SISWA' ? candidateDocumentCategory : SUPPORTING_DOCUMENT_CATEGORY;
      const newDocs: SupportingDocumentRecord[] = [];
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
      const currentDocs = (getValues('documents') || []) as SupportingDocumentRecord[];
      const updatedDocs = [...currentDocs, ...newDocs] as SupportingDocumentRecord[];
      setValue('documents', updatedDocs, { shouldDirty: true, shouldValidate: true });
      
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
            await refreshSelfProfile();
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

  const handleEducationHistorySave = async (history: ProfileEducationHistory) => {
    const nextHistories = sanitizeEducationHistories(
      educationHistories.map((entry) => (entry.level === history.level ? history : entry)),
      educationTrack,
      { includeCertification: includeCertificationHistory },
    );
    if (!user?.id) {
      setEducationHistories(nextHistories);
      return;
    }
    await userService.update(user.id, {
      educationHistories: nextHistories,
    });
    setEducationHistories(nextHistories);
    await refreshSelfProfile();
    toast.success('Riwayat pendidikan berhasil disimpan');
  };

  const handleEducationHistoryRemove = async (level: ProfileEducationLevel) => {
    const nextHistories = sanitizeEducationHistories(
      educationHistories.map((entry) => (entry.level === level ? createEmptyEducationHistory(level) : entry)),
      educationTrack,
      { includeCertification: includeCertificationHistory },
    );
    if (!user?.id) {
      setEducationHistories(nextHistories);
      return;
    }
    await userService.update(user.id, {
      educationHistories: nextHistories,
    });
    setEducationHistories(nextHistories);
    await refreshSelfProfile();
    toast.success('Riwayat pendidikan berhasil diperbarui');
  };

  const handleEducationDocumentUpload = async (file: File): Promise<ProfileEducationDocument> => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/x-png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Dokumen pendidikan hanya boleh berformat PDF, JPG, JPEG, atau PNG.');
      throw new Error('Tipe file dokumen pendidikan tidak didukung');
    }
    if (file.size > 500 * 1024) {
      toast.error(`Ukuran file ${file.name} melebihi 500KB.`);
      throw new Error('Ukuran dokumen pendidikan melebihi batas');
    }
    try {
      const uploaded = await uploadService.uploadProfileEducationDocument(file);
      const document: ProfileEducationDocument = {
        kind: 'IJAZAH',
        label: file.name,
        fileUrl: uploaded.url,
        originalName: uploaded.originalname,
        mimeType: uploaded.mimetype,
        size: uploaded.size,
        uploadedAt: new Date().toISOString(),
      };
      toast.success(`${file.name} berhasil diunggah. Klik Simpan Riwayat Pendidikan untuk menyimpan ke profil.`);
      return document;
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error) || 'Gagal mengunggah dokumen pendidikan');
      throw error;
    }
  };

  const handleSupportingDocumentUpload = async (file: File) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/x-png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Dokumen pendukung hanya boleh berformat PDF, JPG, JPEG, atau PNG.');
      throw new Error('Tipe file dokumen pendukung tidak didukung');
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(`Ukuran file ${file.name} melebihi 2MB.`);
      throw new Error('Ukuran dokumen pendukung melebihi batas');
    }

    try {
      const uploaded = await uploadService.uploadTeacherDocument(file);
      return {
        title: file.name,
        fileUrl: uploaded.url,
        category: SUPPORTING_DOCUMENT_CATEGORY,
      } satisfies SupportingDocumentRecord;
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Gagal mengunggah dokumen pendukung');
      throw error;
    }
  };

  const persistSupportingDocuments = async (nextDocuments: SupportingDocumentRecord[]) => {
    const previousDocuments = ((getValues('documents') || []) as SupportingDocumentRecord[]).map((document) => ({
      title: document.title,
      fileUrl: document.fileUrl,
      category: document.category,
    }));

    setValue('documents', nextDocuments, { shouldDirty: true, shouldValidate: true });

    if (!user?.id) {
      return;
    }

    try {
      await userService.update(user.id, {
        documents: nextDocuments.map((document) => ({
          title: document.title,
          fileUrl: document.fileUrl,
          category: document.category,
        })),
      });
      await refreshSelfProfile();
      toast.success('Dokumen pendukung berhasil disimpan');
    } catch (error) {
      setValue('documents', previousDocuments, { shouldDirty: false, shouldValidate: false });
      toast.error(getErrorMessage(error) || 'Gagal menyimpan dokumen pendukung');
      throw error;
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
             await refreshSelfProfile();
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
                      inputMode="numeric"
                      maxLength={16}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-slate-500">Isi 16 digit angka tanpa spasi.</p>
                    {errors.fatherNik && <p className="mt-1 text-xs text-red-600">{errors.fatherNik.message}</p>}
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
                      inputMode="numeric"
                      maxLength={16}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-slate-500">Isi 16 digit angka tanpa spasi.</p>
                    {errors.motherNik && <p className="mt-1 text-xs text-red-600">{errors.motherNik.message}</p>}
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
                          inputMode="numeric"
                          maxLength={16}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Nomor Induk Kependudukan"
                        />
                        <p className="mt-1 text-xs text-slate-500">Isi 16 digit angka tanpa spasi.</p>
                        {errors.nik && <p className="mt-1 text-xs text-red-600">{errors.nik.message}</p>}
                      </div>
                      {isEmployeeProfile && (
                        <div>
                          <label htmlFor="nuptk" className="block text-sm font-medium text-gray-700 mb-1">NUPTK</label>
                          <input
                            id="nuptk"
                            {...register('nuptk')}
                            autoComplete="off"
                            inputMode="numeric"
                            maxLength={16}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Nomor Unik Pendidik dan Tenaga Kependidikan"
                          />
                          <p className="mt-1 text-xs text-slate-500">Isi 16 digit angka tanpa spasi.</p>
                          {errors.nuptk && <p className="mt-1 text-xs text-red-600">{errors.nuptk.message}</p>}
                        </div>
                      )}
                      {(isEmployeeProfile || isStudentProfile) && (
                        <div>
                          <label htmlFor="familyCardNumber" className="block text-sm font-medium text-gray-700 mb-1">
                            Nomor KK
                          </label>
                          <input
                            id="familyCardNumber"
                            {...register('familyCardNumber')}
                            autoComplete="off"
                            inputMode="numeric"
                            maxLength={16}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Nomor kartu keluarga"
                          />
                          <p className="mt-1 text-xs text-slate-500">Isi 16 digit angka tanpa spasi.</p>
                          {errors.familyCardNumber && <p className="mt-1 text-xs text-red-600">{errors.familyCardNumber.message}</p>}
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
                  {isEmployeeProfile && (
                    <>
                      <div>
                        <label htmlFor="citizenship" className="block text-sm font-medium text-gray-700 mb-1">
                          Kewarganegaraan
                        </label>
                        <select
                          id="citizenship"
                          {...register('citizenship')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Pilih kewarganegaraan</option>
                          {CITIZENSHIP_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="maritalStatus" className="block text-sm font-medium text-gray-700 mb-1">
                          Status Perkawinan
                        </label>
                        <select
                          id="maritalStatus"
                          {...register('maritalStatus')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Pilih status perkawinan</option>
                          {MARITAL_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  <div>
                    <label htmlFor="birthPlace" className="block text-sm font-medium text-gray-700 mb-1">Tempat Lahir</label>
                    <input
                      id="birthPlace"
                      {...register('birthPlace')}
                      autoComplete="address-level2"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Contoh: Bekasi"
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
                  {(isEmployeeProfile || isStudentProfile || isCandidateProfile) && (
                    <>
                      <div>
                        <label htmlFor="religion" className="block text-sm font-medium text-gray-700 mb-1">Agama</label>
                        <select
                          id="religion"
                          {...register('religion')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Pilih Agama</option>
                          {RELIGION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {isStudentProfile && (
                        <>
                          <div>
                            <label htmlFor="familyStatus" className="block text-sm font-medium text-gray-700 mb-1">Status Dalam Keluarga</label>
                            <select
                              id="familyStatus"
                              {...register('familyStatus')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Pilih status</option>
                              {FAMILY_STATUS_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="childNumber" className="block text-sm font-medium text-gray-700 mb-1">Anak Ke-</label>
                            <input
                              id="childNumber"
                              {...register('childNumber')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label htmlFor="livingWith" className="block text-sm font-medium text-gray-700 mb-1">Jenis Tinggal</label>
                            <select
                              id="livingWith"
                              {...register('livingWith')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Pilih jenis tinggal</option>
                              {LIVING_WITH_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="siblingsCount" className="block text-sm font-medium text-gray-700 mb-1">Jumlah Saudara</label>
                            <input
                              id="siblingsCount"
                              {...register('siblingsCount')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label htmlFor="transportationMode" className="block text-sm font-medium text-gray-700 mb-1">Alat Transportasi</label>
                            <select
                              id="transportationMode"
                              {...register('transportationMode')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Pilih alat transportasi</option>
                              {TRANSPORTATION_MODE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="distanceToSchool" className="block text-sm font-medium text-gray-700 mb-1">
                              Jarak ke Sekolah
                            </label>
                            <input
                              id="distanceToSchool"
                              {...register('distanceToSchool')}
                              autoComplete="off"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Contoh: 3 km"
                            />
                          </div>
                          <div>
                            <label htmlFor="travelTimeToSchool" className="block text-sm font-medium text-gray-700 mb-1">
                              Waktu Tempuh ke Sekolah
                            </label>
                            <input
                              id="travelTimeToSchool"
                              {...register('travelTimeToSchool')}
                              autoComplete="off"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Contoh: 25 menit"
                            />
                          </div>
                          <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                            <p className="text-sm font-semibold text-blue-900">Bantuan Pendidikan</p>
                            <p className="mt-1 text-xs text-blue-700">
                              Isi hanya jika siswa memang memiliki identitas bantuan resmi yang aktif.
                            </p>
                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                              <div>
                                <label htmlFor="kipNumber" className="block text-sm font-medium text-gray-700 mb-1">Nomor KIP</label>
                                <input
                                  id="kipNumber"
                                  {...register('kipNumber')}
                                  autoComplete="off"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              </div>
                              <div>
                                <label htmlFor="pkhNumber" className="block text-sm font-medium text-gray-700 mb-1">Nomor PKH</label>
                                <input
                                  id="pkhNumber"
                                  {...register('pkhNumber')}
                                  autoComplete="off"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              </div>
                              <div>
                                <label htmlFor="kksNumber" className="block text-sm font-medium text-gray-700 mb-1">Nomor KKS</label>
                                <input
                                  id="kksNumber"
                                  {...register('kksNumber')}
                                  autoComplete="off"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              </div>
                            </div>
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
                        placeholder="Masukkan nama ibu kandung"
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
                      placeholder="Contoh: nama@email.com"
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
                      placeholder="Contoh: 0812xxxxxxxx"
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
                      placeholder="Contoh: Jl. Mawar No. 10, RT 01/RW 05"
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
                            placeholder="Contoh: 001"
                          />
                        </div>
                        <div>
                          <label htmlFor="rw" className="block text-sm font-medium text-gray-700 mb-1">RW</label>
                          <input
                            id="rw"
                            {...register('rw')}
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Contoh: 005"
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
                        <label htmlFor="village" className="block text-sm font-medium text-gray-700 mb-1">Desa/Kelurahan</label>
                        <input
                          id="village"
                          {...register('village')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Contoh: Jatibening"
                        />
                      </div>
                      <div>
                        <label htmlFor="subdistrict" className="block text-sm font-medium text-gray-700 mb-1">Kecamatan</label>
                        <input
                          id="subdistrict"
                          {...register('subdistrict')}
                          autoComplete="off"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Contoh: Pondokgede"
                        />
                      </div>
                      <div>
                        <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 mb-1">Kode Pos</label>
                        <input
                          id="postalCode"
                          {...register('postalCode')}
                          autoComplete="postal-code"
                          inputMode="numeric"
                          maxLength={5}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Contoh: 17412"
                        />
                        <p className="mt-1 text-xs text-slate-500">Isi 5 digit angka.</p>
                        {errors.postalCode && <p className="mt-1 text-xs text-red-600">{errors.postalCode.message}</p>}
                      </div>
                      {(isEmployeeProfile || isStudentProfile) && (
                        <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                          <p className="text-sm font-semibold text-blue-900">Kode Wilayah Administratif</p>
                          <p className="mt-1 text-xs text-blue-700">
                            Opsional untuk sinkronisasi data induk. Gunakan kode wilayah resmi: provinsi 2 digit, kabupaten/kota 4 digit, kecamatan 7 digit, desa/kelurahan 10 digit.
                          </p>
                          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <label htmlFor="provinceCode" className="block text-sm font-medium text-gray-700 mb-1">Kode Provinsi</label>
                              <input
                                id="provinceCode"
                                {...register('provinceCode')}
                                autoComplete="off"
                                inputMode="numeric"
                                maxLength={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Contoh: 32"
                              />
                              <p className="mt-1 text-xs text-slate-500">Isi 2 digit angka.</p>
                              {errors.provinceCode && <p className="mt-1 text-xs text-red-600">{errors.provinceCode.message}</p>}
                            </div>
                            <div>
                              <label htmlFor="cityRegencyCode" className="block text-sm font-medium text-gray-700 mb-1">Kode Kabupaten / Kota</label>
                              <input
                                id="cityRegencyCode"
                                {...register('cityRegencyCode')}
                                autoComplete="off"
                                inputMode="numeric"
                                maxLength={4}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Contoh: 3275"
                              />
                              <p className="mt-1 text-xs text-slate-500">Isi 4 digit angka.</p>
                              {errors.cityRegencyCode && <p className="mt-1 text-xs text-red-600">{errors.cityRegencyCode.message}</p>}
                            </div>
                            <div>
                              <label htmlFor="subdistrictCode" className="block text-sm font-medium text-gray-700 mb-1">Kode Kecamatan</label>
                              <input
                                id="subdistrictCode"
                                {...register('subdistrictCode')}
                                autoComplete="off"
                                inputMode="numeric"
                                maxLength={7}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Contoh: 3275040"
                              />
                              <p className="mt-1 text-xs text-slate-500">Isi 7 digit angka.</p>
                              {errors.subdistrictCode && <p className="mt-1 text-xs text-red-600">{errors.subdistrictCode.message}</p>}
                            </div>
                            <div>
                              <label htmlFor="villageCode" className="block text-sm font-medium text-gray-700 mb-1">Kode Desa / Kelurahan</label>
                              <input
                                id="villageCode"
                                {...register('villageCode')}
                                autoComplete="off"
                                inputMode="numeric"
                                maxLength={10}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Contoh: 3275040001"
                              />
                              <p className="mt-1 text-xs text-slate-500">Isi 10 digit angka.</p>
                              {errors.villageCode && <p className="mt-1 text-xs text-red-600">{errors.villageCode.message}</p>}
                            </div>
                          </div>
                        </div>
                      )}
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
                        {STAFF_POSITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {fixedRole !== 'STAFF' && (
                    <div>
                      <label htmlFor="ptkTypeSelect" className="block text-sm font-medium text-gray-700 mb-1">
                        {fixedRole === 'EXAMINER' ? 'Peran Penguji / Asesor' : 'Jenis PTK / Peran'}
                      </label>
                      <select
                        id="ptkTypeSelect"
                        value={ptkTypeSelectValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setIsManualPtkType(nextValue === MANUAL_OPTION_VALUE);
                          setValue('ptkType', nextValue === MANUAL_OPTION_VALUE ? '' : nextValue, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Pilih peran</option>
                        {employeeRoleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        <option value={MANUAL_OPTION_VALUE}>Isi manual</option>
                      </select>
                      {ptkTypeSelectValue === MANUAL_OPTION_VALUE && (
                        <input
                          id="ptkType"
                          {...register('ptkType')}
                          autoComplete="off"
                          className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder={
                            fixedRole === 'EXTRACURRICULAR_TUTOR'
                              ? 'Contoh: Pembina Ekstrakurikuler'
                              : fixedRole === 'EXAMINER'
                                ? 'Contoh: Penguji Industri / Asesor'
                                : 'Contoh: Guru Mapel, Guru BK, Wakil Kepala Sekolah'
                          }
                        />
                      )}
                    </div>
                  )}
                  <div>
                    <label htmlFor="employeeStatusSelect" className="block text-sm font-medium text-gray-700 mb-1">Status Kepegawaian</label>
                    <select
                      id="employeeStatusSelect"
                      value={employeeStatusSelectValue}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setIsManualEmployeeStatus(nextValue === MANUAL_OPTION_VALUE);
                        setValue('employeeStatus', nextValue === MANUAL_OPTION_VALUE ? '' : nextValue, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Pilih status kepegawaian</option>
                      {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                      <option value={MANUAL_OPTION_VALUE}>Isi manual</option>
                    </select>
                    {employeeStatusSelectValue === MANUAL_OPTION_VALUE && (
                      <input
                        id="employeeStatus"
                        {...register('employeeStatus')}
                        autoComplete="off"
                        className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Contoh: PNS, GTY / PTY, GTT / PTT"
                      />
                    )}
                  </div>
                  <div>
                    <label htmlFor="appointmentDecree" className="block text-sm font-medium text-gray-700 mb-1">SK Pengangkatan</label>
                      <input
                        id="appointmentDecree"
                        {...register('appointmentDecree')}
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Contoh: SK/2026/001"
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
                  <div>
                    <label htmlFor="assignmentDecree" className="block text-sm font-medium text-gray-700 mb-1">
                      {fixedRole === 'EXAMINER' ? 'Surat Tugas / SK Penugasan' : 'SK Penugasan'}
                    </label>
                    <input
                      id="assignmentDecree"
                      {...register('assignmentDecree')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={
                        fixedRole === 'EXAMINER'
                          ? 'Contoh: Surat tugas penguji industri'
                          : 'Contoh: SK penugasan tambahan'
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="assignmentDate" className="block text-sm font-medium text-gray-700 mb-1">
                      {fixedRole === 'EXAMINER' ? 'Mulai Penugasan' : 'TMT Penugasan'}
                    </label>
                    <input
                      id="assignmentDate"
                      type="date"
                      {...register('assignmentDate')}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                            {getStaffPositionLabel(watchedStaffPosition) || normalizeStructuredFieldValue(watchedPtkType) || 'Pilih jabatan staff yang paling sesuai dengan workspace Anda.'}
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

              {activeTab === 'education' && (
                <ProfileEducationEditor
                  track={educationTrack}
                  histories={educationHistories}
                  includeCertification={includeCertificationHistory}
                  onSaveHistory={handleEducationHistorySave}
                  onRemoveHistory={handleEducationHistoryRemove}
                  onUploadDocument={handleEducationDocumentUpload}
                />
              )}

              {/* Upload File Tab */}
              {activeTab === 'documents' && (
                usesStructuredSupportingDocuments ? (
                  <SupportingDocumentsEditor
                    documents={watchedDocuments}
                    canUpload={canUploadDocuments}
                    onUploadDocument={handleSupportingDocumentUpload}
                    onSaveDocuments={persistSupportingDocuments}
                  />
                ) : (
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
                              onClick={(e) => e.stopPropagation()}
                            />
                          </span>
                          <p className="pl-1">{canUploadDocuments ? 'atau klik area ini untuk upload' : 'upload dokumen tidak tersedia untuk role ini'}</p>
                        </div>
                        <p className="text-xs text-gray-500">PDF, PNG, JPG maksimal 2MB</p>
                      </div>
                    </div>

                    {!canUploadDocuments && (
                      <p className="text-sm text-gray-500">
                        Upload dokumen profil saat ini tersedia untuk admin, guru, kepala sekolah, staff, tutor, examiner, dan calon siswa.
                      </p>
                    )}

                    <div className="grid grid-cols-1 gap-4">
                      {watchedDocuments.map((document, index) => (
                        <div key={`${document.fileUrl}-${index}`} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                              <Save size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{document.title}</p>
                              <p className="truncate text-xs text-gray-500">
                                {fixedRole === 'CALON_SISWA'
                                  ? getCandidateDocumentCategoryLabel(document.category)
                                  : document.category}
                              </p>
                              <a
                                href={document.fileUrl}
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
                              const currentDocs = (getValues('documents') || []) as SupportingDocumentRecord[];
                              const updatedDocs = currentDocs.filter((_, docIndex) => docIndex !== index);
                              setValue('documents', updatedDocs, { shouldDirty: true, shouldValidate: true });

                              if (user?.id) {
                                try {
                                  await userService.update(user.id, {
                                    documents: updatedDocs.map((doc) => ({
                                      title: doc.title,
                                      fileUrl: doc.fileUrl,
                                      category: doc.category,
                                    })),
                                  });
                                  await refreshSelfProfile();
                                  toast.success('Dokumen berhasil dihapus');
                                } catch (error) {
                                  console.error(error);
                                  toast.error('Gagal menghapus dokumen dari server');
                                }
                              }
                            }}
                            className="rounded-full p-2 text-red-500 transition-colors hover:bg-red-50"
                            title="Hapus Dokumen"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      ))}
                      {watchedDocuments.length === 0 && (
                        <p className="py-4 text-center text-sm text-gray-500">Belum ada dokumen yang diunggah</p>
                      )}
                    </div>
                  </div>
                )
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
