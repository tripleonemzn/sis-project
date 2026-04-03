import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { MobileMenuTab } from '../../src/components/MobileMenuTab';
import { MobileSelectField } from '../../src/components/MobileSelectField';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import type { AuthUser } from '../../src/features/auth/types';
import {
  MOBILE_CANDIDATE_DOCUMENT_OPTIONS,
  getMobileCandidateDocumentCategoryLabel,
} from '../../src/features/candidateAdmission/types';
import { MOBILE_PROFILE_QUERY_KEY, useProfileQuery } from '../../src/features/profile/useProfileQuery';
import { ProfileEducationEditor } from '../../src/features/profile/ProfileEducationEditor';
import { SupportingDocumentsEditor } from '../../src/features/profile/SupportingDocumentsEditor';
import { profileApi } from '../../src/features/profile/profileApi';
import type { UpdateSelfProfilePayload } from '../../src/features/profile/profileApi';
import {
  buildEducationHistoryState,
  createEmptyEducationHistory,
  resolveEducationSummaryFromHistories,
  resolveProfileEducationTrackForRole,
  sanitizeEducationHistories,
  type ProfileEducationDocument,
  type ProfileEducationHistory,
  type ProfileEducationLevel,
} from '../../src/features/profile/profileEducation';
import {
  SUPPORTING_DOCUMENT_CATEGORY,
  type SupportingDocumentRecord,
} from '../../src/features/profile/supportingDocuments';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifyError, notifySuccess } from '../../src/lib/ui/feedback';
import { ENV } from '../../src/config/env';
import { openWebModuleRoute } from '../../src/lib/navigation/webModuleRoute';

type EditableProfileForm = {
  name: string;
  gender: '' | 'MALE' | 'FEMALE';
  citizenship: string;
  maritalStatus: string;
  birthPlace: string;
  birthDate: string;
  email: string;
  phone: string;
  address: string;
  nip: string;
  nik: string;
  familyCardNumber: string;
  nuptk: string;
  highestEducation: string;
  studyProgram: string;
  motherName: string;
  motherNik: string;
  religion: string;
  childNumber: string;
  distanceToSchool: string;
  familyStatus: string;
  livingWith: string;
  transportationMode: string;
  travelTimeToSchool: string;
  kipNumber: string;
  pkhNumber: string;
  kksNumber: string;
  siblingsCount: string;
  fatherName: string;
  fatherNik: string;
  fatherEducation: string;
  fatherOccupation: string;
  fatherIncome: string;
  motherEducation: string;
  motherOccupation: string;
  motherIncome: string;
  guardianName: string;
  guardianEducation: string;
  guardianOccupation: string;
  guardianPhone: string;
  rt: string;
  rw: string;
  province: string;
  provinceCode: string;
  cityRegency: string;
  cityRegencyCode: string;
  village: string;
  subdistrict: string;
  subdistrictCode: string;
  villageCode: string;
  postalCode: string;
  staffPosition: string;
  ptkType: string;
  employeeStatus: string;
  appointmentDecree: string;
  appointmentDate: string;
  assignmentDecree: string;
  assignmentDate: string;
  institution: string;
};

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  helperText?: string;
  maxLength?: number;
};
type ProfileDocument = NonNullable<AuthUser['documents']>[number] & { originalname?: string | null };
type ProfileInsightId = 'structure' | 'readiness' | 'summary';

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#e2e8f0',
  padding: 14,
  marginBottom: 12,
} as const;

const emptyForm: EditableProfileForm = {
  name: '',
  gender: '',
  citizenship: '',
  maritalStatus: '',
  birthPlace: '',
  birthDate: '',
  email: '',
  phone: '',
  address: '',
  nip: '',
  nik: '',
  familyCardNumber: '',
  nuptk: '',
  highestEducation: '',
  studyProgram: '',
  motherName: '',
  motherNik: '',
  religion: '',
  childNumber: '',
  distanceToSchool: '',
  familyStatus: '',
  livingWith: '',
  transportationMode: '',
  travelTimeToSchool: '',
  kipNumber: '',
  pkhNumber: '',
  kksNumber: '',
  siblingsCount: '',
  fatherName: '',
  fatherNik: '',
  fatherEducation: '',
  fatherOccupation: '',
  fatherIncome: '',
  motherEducation: '',
  motherOccupation: '',
  motherIncome: '',
  guardianName: '',
  guardianEducation: '',
  guardianOccupation: '',
  guardianPhone: '',
  rt: '',
  rw: '',
  province: '',
  provinceCode: '',
  cityRegency: '',
  cityRegencyCode: '',
  village: '',
  subdistrict: '',
  subdistrictCode: '',
  villageCode: '',
  postalCode: '',
  staffPosition: '',
  ptkType: '',
  employeeStatus: '',
  appointmentDecree: '',
  appointmentDate: '',
  assignmentDecree: '',
  assignmentDate: '',
  institution: '',
};

const RELIGION_OPTIONS = ['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU'];
const CITIZENSHIP_OPTIONS = ['WNI', 'WNA'];
const MARITAL_STATUS_OPTIONS = ['Belum Menikah', 'Menikah', 'Cerai Hidup', 'Cerai Mati'];
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
];
const FAMILY_STATUS_OPTIONS = ['Anak Kandung', 'Anak Tiri', 'Anak Angkat'];
const LIVING_WITH_OPTIONS = ['Orang Tua', 'Wali', 'Saudara', 'Asrama', 'Panti Asuhan', 'Pesantren', 'Kost', 'Lainnya'];
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
];
const MANUAL_OPTION_VALUE = '__MANUAL__';
const STAFF_POSITION_OPTIONS = [
  { label: 'Bendahara (Staff Keuangan)', value: 'STAFF_KEUANGAN' },
  { label: 'Staff Administrasi', value: 'STAFF_ADMINISTRASI' },
  { label: 'Kepala Tata Usaha', value: 'KEPALA_TU' },
];
const EMPLOYEE_STATUS_OPTIONS = [
  'PNS',
  'PPPK',
  'GTY / PTY',
  'GTT / PTT',
  'Honor Sekolah',
  'Honor Daerah',
  'Kontrak Yayasan',
  'Mitra Industri / Profesional',
];
const EMPLOYEE_ROLE_OPTIONS_BY_ROLE = {
  TEACHER: [
    { label: 'Guru Mata Pelajaran', value: 'Guru Mata Pelajaran' },
    { label: 'Guru BK', value: 'Guru BK' },
    { label: 'Guru Produktif / Kejuruan', value: 'Guru Produktif / Kejuruan' },
    { label: 'Wali Kelas', value: 'Wali Kelas' },
    { label: 'Wakil Kepala Sekolah', value: 'Wakil Kepala Sekolah' },
    { label: 'Kepala Program Keahlian', value: 'Kepala Program Keahlian' },
    { label: 'Koordinator Laboratorium', value: 'Koordinator Laboratorium' },
  ],
  PRINCIPAL: [
    { label: 'Kepala Sekolah', value: 'Kepala Sekolah' },
    { label: 'Pelaksana Tugas Kepala Sekolah', value: 'Pelaksana Tugas Kepala Sekolah' },
  ],
  EXTRACURRICULAR_TUTOR: [
    { label: 'Pembina Ekstrakurikuler', value: 'Pembina Ekstrakurikuler' },
    { label: 'Pelatih Ekstrakurikuler', value: 'Pelatih Ekstrakurikuler' },
    { label: 'Koordinator Ekstrakurikuler', value: 'Koordinator Ekstrakurikuler' },
    { label: 'Mentor Kegiatan', value: 'Mentor Kegiatan' },
  ],
  EXAMINER: [
    { label: 'Penguji Industri', value: 'Penguji Industri' },
    { label: 'Asesor Kompetensi', value: 'Asesor Kompetensi' },
    { label: 'Penguji Eksternal', value: 'Penguji Eksternal' },
    { label: 'Mitra Industri', value: 'Mitra Industri' },
  ],
} as const;

const ROLE_LABELS: Record<string, string> = {
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

type ProfileVariant = 'employee' | 'student' | 'candidate' | 'parent' | 'admin';
type ProfileTabId = 'account' | 'personal' | 'contact' | 'employment' | 'parents' | 'education' | 'documents';

const PROFILE_TABS: Array<{ id: ProfileTabId; label: string }> = [
  { id: 'account', label: 'Data Akun' },
  { id: 'personal', label: 'Data Pribadi' },
  { id: 'contact', label: 'Data Kontak' },
  { id: 'employment', label: 'Data Kepegawaian' },
  { id: 'parents', label: 'Data Orang Tua' },
  { id: 'education', label: 'Riwayat Pendidikan' },
  { id: 'documents', label: 'Dokumen Pendukung' },
];

function toText(value?: string | number | null) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function toNullable(value: string) {
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeNumericText(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

function normalizeDigitsInput(value?: string | null) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function normalizeStructuredFieldValue(value?: string | null) {
  const cleaned = String(value || '').trim();
  if (!cleaned || cleaned === MANUAL_OPTION_VALUE) {
    return '';
  }
  return cleaned;
}

function getStructuredChoiceValue(
  value: string | null | undefined,
  options: readonly string[] | readonly { value: string; label: string }[],
) {
  const normalized = normalizeStructuredFieldValue(value);
  if (!normalized) {
    return '';
  }
  const knownValues = options.map((option) => (typeof option === 'string' ? option : option.value));
  return knownValues.includes(normalized) ? normalized : MANUAL_OPTION_VALUE;
}

function getStaffPositionLabel(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  return STAFF_POSITION_OPTIONS.find((option) => option.value === normalized)?.label || normalized;
}

function validateExactDigits(value: string, label: string, length: number) {
  const cleaned = normalizeDigitsInput(value);
  if (!cleaned) {
    return null;
  }
  return new RegExp(`^\\d{${length}}$`).test(cleaned) ? null : `${label} harus ${length} digit angka`;
}

function getProfileVariant(role?: string | null): ProfileVariant {
  const normalized = String(role || '').toUpperCase();
  if (['TEACHER', 'PRINCIPAL', 'STAFF', 'EXAMINER', 'EXTRACURRICULAR_TUTOR'].includes(normalized)) {
    return 'employee';
  }
  if (normalized === 'STUDENT') {
    return 'student';
  }
  if (normalized === 'CALON_SISWA') {
    return 'candidate';
  }
  if (normalized === 'PARENT') {
    return 'parent';
  }
  return 'admin';
}

function getVisibleTabs(role?: string | null): ProfileTabId[] {
  const variant = getProfileVariant(role);
  if (variant === 'employee') {
    return ['account', 'personal', 'contact', 'employment', 'education', 'documents'];
  }
  if (variant === 'student') {
    return ['account', 'personal', 'contact', 'parents', 'education'];
  }
  if (variant === 'candidate') {
    return ['account', 'personal', 'contact', 'education', 'documents'];
  }
  if (variant === 'parent') {
    return ['account', 'personal', 'contact', 'education'];
  }
  return ['account', 'personal', 'contact', 'education', 'documents'];
}

function getTabLabel(role: string | null | undefined, tabId: ProfileTabId) {
  const variant = getProfileVariant(role);
  if (variant === 'employee') {
    const labels: Record<ProfileTabId, string> = {
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
    const labels: Record<ProfileTabId, string> = {
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
    const labels: Record<ProfileTabId, string> = {
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
    const labels: Record<ProfileTabId, string> = {
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
  return PROFILE_TABS.find((tab) => tab.id === tabId)?.label || tabId;
}

function getProfileCopy(role?: string | null) {
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
}

function getVerificationStatusMeta(status?: AuthUser['verificationStatus'] | null) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (normalized === 'VERIFIED') {
    return {
      label: 'Terverifikasi',
      borderColor: '#bbf7d0',
      backgroundColor: '#f0fdf4',
      textColor: '#15803d',
    };
  }
  if (normalized === 'REJECTED') {
    return {
      label: 'Perlu Review',
      borderColor: '#fecdd3',
      backgroundColor: '#fff1f2',
      textColor: '#be123c',
    };
  }
  return {
    label: 'Menunggu Verifikasi',
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    textColor: '#b45309',
  };
}

function toNullableNumber(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function resolveMediaUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  if (path.startsWith('/')) return `${webBaseUrl}${path}`;
  return `${webBaseUrl}/${path}`;
}

function getCandidateAcceptedFormats(category: string) {
  return (
    MOBILE_CANDIDATE_DOCUMENT_OPTIONS.find((item) => item.value === category)?.acceptedFormats.map((item) =>
      item.toLowerCase(),
    ) || ['pdf', 'jpg', 'jpeg', 'png']
  );
}

function getFileExtension(name?: string | null) {
  const segments = String(name || '').toLowerCase().split('.');
  return segments.length > 1 ? segments[segments.length - 1] : '';
}

function buildForm(profile: AuthUser | null): EditableProfileForm {
  if (!profile) return emptyForm;
  const staffCodeFromPtk = STAFF_POSITION_OPTIONS.some((option) => option.value === toText(profile?.ptkType))
    ? toText(profile?.ptkType)
    : '';
  const staffCodeFromDuty = (profile?.additionalDuties || []).includes('BENDAHARA') ? 'STAFF_KEUANGAN' : '';
  return {
    name: toText(profile?.name),
    gender: (profile?.gender as EditableProfileForm['gender']) || '',
    citizenship: toText(profile?.citizenship),
    maritalStatus: toText(profile?.maritalStatus),
    birthPlace: toText(profile?.birthPlace),
    birthDate: toDateInput(profile?.birthDate),
    email: toText(profile?.email),
    phone: toText(profile?.phone),
    address: toText(profile?.address),
    nip: toText(profile?.nip),
    nik: toText(profile?.nik),
    familyCardNumber: toText(profile?.familyCardNumber),
    nuptk: toText(profile?.nuptk),
    highestEducation: toText(profile?.highestEducation),
    studyProgram: toText(profile?.studyProgram),
    motherName: toText(profile?.motherName),
    motherNik: toText(profile?.motherNik),
    religion: toText(profile?.religion),
    childNumber: toText(profile?.childNumber),
    distanceToSchool: toText(profile?.distanceToSchool),
    familyStatus: toText(profile?.familyStatus),
    livingWith: toText(profile?.livingWith),
    transportationMode: toText(profile?.transportationMode),
    travelTimeToSchool: toText(profile?.travelTimeToSchool),
    kipNumber: toText(profile?.kipNumber),
    pkhNumber: toText(profile?.pkhNumber),
    kksNumber: toText(profile?.kksNumber),
    siblingsCount: toText(profile?.siblingsCount),
    fatherName: toText(profile?.fatherName),
    fatherNik: toText(profile?.fatherNik),
    fatherEducation: toText(profile?.fatherEducation),
    fatherOccupation: toText(profile?.fatherOccupation),
    fatherIncome: toText(profile?.fatherIncome),
    motherEducation: toText(profile?.motherEducation),
    motherOccupation: toText(profile?.motherOccupation),
    motherIncome: toText(profile?.motherIncome),
    guardianName: toText(profile?.guardianName),
    guardianEducation: toText(profile?.guardianEducation),
    guardianOccupation: toText(profile?.guardianOccupation),
    guardianPhone: toText(profile?.guardianPhone),
    rt: toText(profile?.rt),
    rw: toText(profile?.rw),
    province: toText(profile?.province),
    provinceCode: toText(profile?.provinceCode),
    cityRegency: toText(profile?.cityRegency),
    cityRegencyCode: toText(profile?.cityRegencyCode),
    village: toText(profile?.village),
    subdistrict: toText(profile?.subdistrict),
    subdistrictCode: toText(profile?.subdistrictCode),
    villageCode: toText(profile?.villageCode),
    postalCode: toText(profile?.postalCode),
    staffPosition: staffCodeFromPtk || staffCodeFromDuty,
    ptkType: toText(profile?.ptkType),
    employeeStatus: toText(profile?.employeeStatus),
    appointmentDecree: toText(profile?.appointmentDecree),
    appointmentDate: toDateInput(profile?.appointmentDate),
    assignmentDecree: toText(profile?.assignmentDecree),
    assignmentDate: toDateInput(profile?.assignmentDate),
    institution: toText(profile?.institution),
  };
}

function getProfileValidationMessage(
  form: EditableProfileForm,
  options: { showNik: boolean; showNuptk: boolean; showMotherNik: boolean },
) {
  const checks = [
    options.showNik ? validateExactDigits(form.nik, 'NIK', 16) : null,
    options.showNuptk ? validateExactDigits(form.nuptk, 'NUPTK', 16) : null,
    validateExactDigits(form.familyCardNumber, 'Nomor KK', 16),
    options.showMotherNik ? validateExactDigits(form.motherNik, 'NIK Ibu', 16) : null,
    validateExactDigits(form.fatherNik, 'NIK Ayah', 16),
    validateExactDigits(form.postalCode, 'Kode Pos', 5),
    validateExactDigits(form.provinceCode, 'Kode Provinsi', 2),
    validateExactDigits(form.cityRegencyCode, 'Kode Kabupaten / Kota', 4),
    validateExactDigits(form.subdistrictCode, 'Kode Kecamatan', 7),
    validateExactDigits(form.villageCode, 'Kode Desa / Kelurahan', 10),
  ];

  return checks.find((message) => Boolean(message)) || null;
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: '#0f172a' }}>{value && value.trim() ? value : '-'}</Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  autoCapitalize = 'sentences',
  helperText,
  maxLength,
}: FormFieldProps) {
  const resolvedPlaceholder = placeholder || `Masukkan ${label.toLowerCase()}`;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={resolvedPlaceholder}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={numberOfLines}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 9,
          color: '#0f172a',
          backgroundColor: '#fff',
          minHeight: multiline ? 88 : undefined,
        }}
      />
      {helperText ? <Text style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>{helperText}</Text> : null}
    </View>
  );
}

function ChoiceChips({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onSelect: (next: string) => void;
}) {
  return (
    <MobileSelectField
      label={label}
      value={value}
      options={options}
      onChange={onSelect}
      placeholder={`Pilih ${label.toLowerCase()}`}
    />
  );
}

function ProfileInsightCard({
  iconName,
  title,
  subtitle,
  accentColor,
  onPress,
}: {
  iconName: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: '#dbeafe',
        backgroundColor: '#fff',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 11,
        minHeight: 108,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: `${accentColor}18`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
        }}
      >
        <Feather name={iconName} size={17} color={accentColor} />
      </View>
      <Text style={{ color: '#0f172a', fontSize: 11, fontWeight: '700', lineHeight: 15 }} numberOfLines={2}>
        {title}
      </Text>
      <Text style={{ color: '#475569', fontSize: 11, lineHeight: 15, marginTop: 4 }} numberOfLines={3}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const profileQuery = useProfileQuery(isAuthenticated);
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 120 });
  const [activeTab, setActiveTab] = useState<ProfileTabId>('account');
  const [activeProfileInsight, setActiveProfileInsight] = useState<ProfileInsightId | null>(null);
  const [form, setForm] = useState<EditableProfileForm>(emptyForm);
  const [educationHistories, setEducationHistories] = useState<ProfileEducationHistory[]>([]);

  const profile = profileQuery.data?.profile ?? null;
  const baseline = useMemo(() => (profile ? buildForm(profile) : emptyForm), [profile]);

  const isStudent = profile?.role === 'STUDENT';
  const isParent = profile?.role === 'PARENT';
  const isExaminer = profile?.role === 'EXAMINER';
  const isTutor = profile?.role === 'EXTRACURRICULAR_TUTOR';
  const isStaff = profile?.role === 'STAFF';
  const isCandidate = profile?.role === 'CALON_SISWA';
  const isEmployee = Boolean(
    profile?.role && ['TEACHER', 'PRINCIPAL', 'STAFF', 'EXAMINER', 'EXTRACURRICULAR_TUTOR'].includes(profile.role),
  );
  const profilePhotoUrl = resolveMediaUrl(profile?.photo);
  const canUploadPhoto = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'STAFF', 'EXAMINER', 'EXTRACURRICULAR_TUTOR', 'STUDENT', 'PARENT', 'CALON_SISWA'].includes(profile?.role || '');
  const canUploadDocuments = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'STAFF', 'EXAMINER', 'EXTRACURRICULAR_TUTOR', 'CALON_SISWA'].includes(profile?.role || '');
  const usesStructuredSupportingDocuments = isEmployee || profile?.role === 'ADMIN';
  const [photoUploading, setPhotoUploading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [candidateDocumentCategory, setCandidateDocumentCategory] = useState<string>(
    MOBILE_CANDIDATE_DOCUMENT_OPTIONS[0]?.value || 'PPDB_AKTA_KELAHIRAN',
  );
  const profileCopy = useMemo(() => getProfileCopy(profile?.role), [profile?.role]);
  const verificationMeta = useMemo(() => getVerificationStatusMeta(profile?.verificationStatus), [profile?.verificationStatus]);
  const visibleTabs = useMemo(() => getVisibleTabs(profile?.role), [profile?.role]);
  const educationTrack = useMemo(() => resolveProfileEducationTrackForRole(profile?.role), [profile?.role]);
  const baselineEducationHistories = useMemo(
    () =>
      buildEducationHistoryState({
        track: educationTrack,
        histories: (profile?.educationHistories || []) as ProfileEducationHistory[],
        legacyHighestEducation: profile?.highestEducation,
        legacyInstitutionName: '',
        legacyStudyProgram: profile?.studyProgram,
      }),
    [educationTrack, profile?.educationHistories, profile?.highestEducation, profile?.studyProgram],
  );
  const educationSummary = useMemo(
    () => resolveEducationSummaryFromHistories(educationHistories, educationTrack),
    [educationHistories, educationTrack],
  );
  const supportingDocuments = useMemo<SupportingDocumentRecord[]>(
    () =>
      (profile?.documents || []).map((doc) => ({
        title: doc.title || 'Dokumen',
        fileUrl: doc.fileUrl,
        category: doc.category || SUPPORTING_DOCUMENT_CATEGORY,
      })),
    [profile?.documents],
  );
  const showNip = isEmployee;
  const showNik = isEmployee || isStudent;
  const showNuptk = isEmployee;
  const showAddressDetails = isEmployee || isStudent || isParent;
  const showEmployment = isEmployee;
  const employmentRoleLabel = isExaminer ? 'Peran Penguji / Asesor' : 'Jenis PTK / Peran';
  const employmentRolePlaceholder = isTutor
    ? 'Contoh: Pembina Ekstrakurikuler'
    : isExaminer
      ? 'Contoh: Penguji Industri / Asesor'
      : 'Contoh: Guru Mapel, Guru BK, Wakil Kepala Sekolah';
  const institutionLabel = isExaminer ? 'Instansi / Perusahaan' : 'Lembaga Pengangkat';
  const institutionPlaceholder = isExaminer
    ? 'Nama perusahaan atau lembaga asal'
    : 'Contoh: Yayasan / Pemerintah Daerah';
  const assignmentDecreeLabel = isExaminer ? 'Surat Tugas / SK Penugasan' : 'SK Penugasan';
  const assignmentDateLabel = isExaminer ? 'Mulai Penugasan (YYYY-MM-DD)' : 'TMT Penugasan (YYYY-MM-DD)';
  const employeeRoleOptions = useMemo(() => {
    if (!profile?.role || isStaff) {
      return [];
    }
    return EMPLOYEE_ROLE_OPTIONS_BY_ROLE[profile.role as keyof typeof EMPLOYEE_ROLE_OPTIONS_BY_ROLE] || [];
  }, [isStaff, profile?.role]);
  const ptkTypeChoiceValue = useMemo(() => {
    if (isStaff) {
      return getStructuredChoiceValue(form.staffPosition || form.ptkType, STAFF_POSITION_OPTIONS);
    }
    return getStructuredChoiceValue(form.ptkType, employeeRoleOptions);
  }, [employeeRoleOptions, form.ptkType, form.staffPosition, isStaff]);
  const employeeStatusChoiceValue = useMemo(
    () => getStructuredChoiceValue(form.employeeStatus, EMPLOYEE_STATUS_OPTIONS),
    [form.employeeStatus],
  );
  const completeness = useMemo(() => {
    if (!profile) {
      return { total: 0, completed: 0, missing: [] as string[], percent: 0 };
    }

    let fieldsToCheck: Array<{ label: string; value: unknown }> = [];

    if (isEmployee) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: form.name || profile.name },
        { label: 'NIK', value: form.nik },
        { label: 'Nomor KK', value: form.familyCardNumber },
        { label: 'Jenis kelamin', value: form.gender },
        { label: 'Kewarganegaraan', value: form.citizenship },
        { label: 'Status perkawinan', value: form.maritalStatus },
        { label: 'Tempat lahir', value: form.birthPlace },
        { label: 'Tanggal lahir', value: form.birthDate },
        { label: 'Agama', value: form.religion },
        { label: 'Nama ibu kandung', value: form.motherName },
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
        { label: 'Jenis PTK / peran', value: isStaff ? form.staffPosition || form.ptkType : form.ptkType },
        { label: 'Status kepegawaian', value: form.employeeStatus },
        { label: 'Kontak aktif', value: form.phone || form.email },
        { label: 'Provinsi', value: form.province },
        { label: 'Kabupaten / Kota', value: form.cityRegency },
        { label: 'Alamat', value: form.address },
      ];
    } else if (isStudent) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: profile.name },
        { label: 'NIS', value: profile.nis },
        { label: 'NISN', value: profile.nisn },
        { label: 'Nomor KK', value: form.familyCardNumber },
        { label: 'Jenis kelamin', value: form.gender },
        { label: 'Tempat lahir', value: form.birthPlace },
        { label: 'Tanggal lahir', value: form.birthDate },
        { label: 'Nama ibu kandung', value: form.motherName },
        { label: 'NIK ibu kandung', value: form.motherNik },
        { label: 'Agama', value: form.religion },
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
        { label: 'Status dalam keluarga', value: form.familyStatus },
        { label: 'Jenis tinggal', value: form.livingWith },
        { label: 'Alat transportasi', value: form.transportationMode },
        { label: 'Jarak ke sekolah', value: form.distanceToSchool },
        { label: 'Waktu tempuh ke sekolah', value: form.travelTimeToSchool },
        { label: 'Kelas aktif', value: profile.studentClass?.name },
        { label: 'Provinsi', value: form.province },
        { label: 'Kabupaten / Kota', value: form.cityRegency },
        { label: 'Alamat', value: form.address },
      ];
    } else if (isCandidate) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: form.name || profile.name },
        { label: 'NISN', value: profile.nisn },
        { label: 'Tempat lahir', value: form.birthPlace },
        { label: 'Tanggal lahir', value: form.birthDate },
        { label: 'Agama', value: form.religion },
        { label: 'Kontak aktif', value: form.phone || form.email },
        { label: 'Alamat', value: form.address },
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
        { label: 'Dokumen PPDB', value: (profile.documents || []).length > 0 ? 'Ada' : '' },
      ];
    } else if (isParent) {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: form.name || profile.name },
        { label: 'Kontak aktif', value: form.phone || form.email },
        { label: 'Provinsi', value: form.province },
        { label: 'Kabupaten / Kota', value: form.cityRegency },
        { label: 'Alamat', value: form.address },
        { label: 'Riwayat pendidikan', value: educationSummary.highestEducation },
        { label: 'Anak terhubung', value: (profile.children || []).length > 0 ? 'Ada' : '' },
      ];
    } else {
      fieldsToCheck = [
        { label: 'Nama lengkap', value: form.name || profile.name },
        { label: 'Kontak aktif', value: form.phone || form.email },
        { label: 'Alamat', value: form.address },
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
  }, [educationSummary.highestEducation, form, isCandidate, isEmployee, isParent, isStaff, isStudent, profile]);

  const summaryLines = useMemo(() => {
    if (!profile) {
      return [] as string[];
    }
    if (isEmployee) {
      if (profile.role === 'TEACHER') {
        return [
          `Tugas tambahan: ${profile.additionalDuties?.length ? profile.additionalDuties.join(', ') : 'Belum ada'}`,
          `Kelas tugas: ${profile.teacherClasses?.length || 0} kelas`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${supportingDocuments.length} file`,
        ];
      }

      if (profile.role === 'EXTRACURRICULAR_TUTOR') {
        return [
          `Ekstrakurikuler aktif: ${profile.ekskulTutorAssignments?.length || 0}`,
          `Penugasan utama: ${normalizeStructuredFieldValue(form.ptkType) || 'Tutor / pembina'}`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${supportingDocuments.length} file`,
        ];
      }

      if (profile.role === 'EXAMINER') {
        return [
          `Jurusan damping: ${profile.examinerMajor?.name || '-'}`,
          `Instansi: ${form.institution || 'Belum diisi'}`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${supportingDocuments.length} file`,
        ];
      }

      if (profile.role === 'STAFF') {
        return [
          `Divisi: ${getStaffPositionLabel(form.staffPosition) || normalizeStructuredFieldValue(form.ptkType) || 'Belum dipilih'}`,
          `Status kepegawaian: ${normalizeStructuredFieldValue(form.employeeStatus) || 'Belum diisi'}`,
          `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
          `Dokumen pendukung: ${supportingDocuments.length} file`,
        ];
      }

      return [
        `Peran aktif: ${ROLE_LABELS[profile.role] || profile.role}`,
        `Status kepegawaian: ${normalizeStructuredFieldValue(form.employeeStatus) || 'Belum diisi'}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Dokumen pendukung: ${supportingDocuments.length} file`,
      ];
    }

    if (isStudent) {
      return [
        `Kelas aktif: ${profile.studentClass?.name || '-'}`,
        `Status siswa: ${profile.studentStatus || 'ACTIVE'}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Email / HP: ${form.email || form.phone || 'Belum diisi'}`,
      ];
    }

    if (isCandidate) {
      return [
        `NISN: ${profile.nisn || '-'}`,
        `Status akun: ${verificationMeta.label}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Dokumen PPDB: ${(profile.documents || []).length} file`,
      ];
    }

    if (isParent) {
      return [
        `Anak terhubung: ${(profile.children || []).length}`,
        `Kontak aktif: ${form.email || form.phone || 'Belum diisi'}`,
        `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
        `Alamat: ${form.address ? 'Sudah diisi' : 'Belum diisi'}`,
      ];
    }

    return [
      `Role aktif: ${ROLE_LABELS[profile.role] || profile.role}`,
      `Kontak aktif: ${form.email || form.phone || 'Belum diisi'}`,
      `Riwayat pendidikan: ${educationSummary.completedLevels} jenjang`,
      `Alamat: ${form.address ? 'Sudah diisi' : 'Belum diisi'}`,
    ];
  }, [educationSummary.completedLevels, form.address, form.email, form.employeeStatus, form.institution, form.phone, form.ptkType, form.staffPosition, isCandidate, isEmployee, isParent, isStudent, profile, supportingDocuments.length, verificationMeta.label]);
  const employeeProfileInsights = useMemo<
    Array<{
      id: ProfileInsightId;
      iconName: React.ComponentProps<typeof Feather>['name'];
      title: string;
      subtitle: string;
      accentColor: string;
    }>
  >(() => {
    if (!profile || !isEmployee) {
      return [];
    }
    return [
      {
        id: 'structure' as const,
        iconName: 'layers',
        title: 'Struktur Profil',
        subtitle: ROLE_LABELS[profile.role] || profile.role,
        accentColor: '#2563eb',
      },
      {
        id: 'readiness' as const,
        iconName: 'pie-chart',
        title: profileCopy.readinessTitle,
        subtitle: `${completeness.percent}% data inti sudah terisi`,
        accentColor: '#0f766e',
      },
      {
        id: 'summary' as const,
        iconName: 'briefcase',
        title: profileCopy.summaryTitle,
        subtitle: summaryLines[0] || verificationMeta.label,
        accentColor: '#7c3aed',
      },
    ];
  }, [completeness.percent, isEmployee, profile, profileCopy.readinessTitle, profileCopy.summaryTitle, summaryLines, verificationMeta.label]);
  const activeInsightMeta = employeeProfileInsights.find((item) => item.id === activeProfileInsight) || null;

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;
      void queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
    }, [isAuthenticated, queryClient]),
  );

  useEffect(() => {
    if (!profile) return;
    setForm(buildForm(profile));
    setEducationHistories(baselineEducationHistories);
  }, [baselineEducationHistories, profile]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [activeTab, visibleTabs]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(form) !== JSON.stringify(baseline) ||
      JSON.stringify(educationHistories) !== JSON.stringify(baselineEducationHistories),
    [baseline, baselineEducationHistories, educationHistories, form],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Data profil belum siap.');
      const payload: UpdateSelfProfilePayload = {
        gender: (form.gender || null) as 'MALE' | 'FEMALE' | null,
        citizenship: toNullable(form.citizenship),
        maritalStatus: toNullable(form.maritalStatus),
        birthPlace: toNullable(form.birthPlace),
        birthDate: toNullable(form.birthDate),
        email: toNullable(form.email),
        phone: toNullable(form.phone),
        address: toNullable(form.address),
        nip: toNullable(form.nip),
        nik: toNullable(form.nik),
        familyCardNumber: toNullable(form.familyCardNumber),
        nuptk: toNullable(form.nuptk),
        educationHistories: sanitizeEducationHistories(educationHistories, educationTrack),
        motherName: toNullable(form.motherName),
        motherNik: toNullable(form.motherNik),
        religion: toNullable(form.religion),
        childNumber: toNullableNumber(form.childNumber),
        distanceToSchool: toNullable(form.distanceToSchool),
        familyStatus: toNullable(form.familyStatus),
        livingWith: toNullable(form.livingWith),
        transportationMode: toNullable(form.transportationMode),
        travelTimeToSchool: toNullable(form.travelTimeToSchool),
        kipNumber: toNullable(form.kipNumber),
        pkhNumber: toNullable(form.pkhNumber),
        kksNumber: toNullable(form.kksNumber),
        siblingsCount: toNullableNumber(form.siblingsCount),
        fatherName: toNullable(form.fatherName),
        fatherNik: toNullable(form.fatherNik),
        fatherEducation: toNullable(form.fatherEducation),
        fatherOccupation: toNullable(form.fatherOccupation),
        fatherIncome: toNullable(form.fatherIncome),
        motherEducation: toNullable(form.motherEducation),
        motherOccupation: toNullable(form.motherOccupation),
        motherIncome: toNullable(form.motherIncome),
        guardianName: toNullable(form.guardianName),
        guardianEducation: toNullable(form.guardianEducation),
        guardianOccupation: toNullable(form.guardianOccupation),
        guardianPhone: toNullable(form.guardianPhone),
        rt: toNullable(form.rt),
        rw: toNullable(form.rw),
        province: toNullable(form.province),
        provinceCode: toNullable(form.provinceCode),
        cityRegency: toNullable(form.cityRegency),
        cityRegencyCode: toNullable(form.cityRegencyCode),
        village: toNullable(form.village),
        subdistrict: toNullable(form.subdistrict),
        subdistrictCode: toNullable(form.subdistrictCode),
        villageCode: toNullable(form.villageCode),
        postalCode: toNullable(form.postalCode),
        ptkType: isStaff
          ? normalizeStructuredFieldValue(form.staffPosition) || normalizeStructuredFieldValue(form.ptkType) || null
          : normalizeStructuredFieldValue(form.ptkType) || null,
        employeeStatus: normalizeStructuredFieldValue(form.employeeStatus) || null,
        appointmentDecree: toNullable(form.appointmentDecree),
        appointmentDate: toNullable(form.appointmentDate),
        assignmentDecree: toNullable(form.assignmentDecree),
        assignmentDate: toNullable(form.assignmentDate),
        institution: toNullable(form.institution),
      };

      if (!isStudent) {
        payload.name = form.name.trim();
      }

      return profileApi.updateSelf(profile.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
      await profileQuery.refetch();
      notifySuccess('Profil berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan perubahan profil.');
    },
  });

  const handleSave = () => {
    const validationMessage = getProfileValidationMessage(form, {
      showNik,
      showNuptk,
      showMotherNik: isStudent,
    });

    if (validationMessage) {
      notifyError(validationMessage);
      return;
    }

    saveMutation.mutate();
  };

  const handleUploadPhoto = async () => {
    if (!profile?.id || !canUploadPhoto || photoUploading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/jpg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || 'application/octet-stream';
      const name = asset.name || `photo-${Date.now()}.jpg`;

      if (!mime.startsWith('image/')) {
        notifyError('Format foto harus JPG/PNG.');
        return;
      }
      if ((asset.size || 0) > 500 * 1024) {
        notifyError('Ukuran foto maksimal 500KB.');
        return;
      }

      setPhotoUploading(true);
      const uploaded = await profileApi.uploadProfilePhoto({
        uri: asset.uri,
        name,
        type: mime,
      });
      await profileApi.updateSelf(profile.id, { photo: uploaded.url });
      await queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
      await profileQuery.refetch();
      notifySuccess('Foto profil berhasil diperbarui.');
    } catch (error) {
      notifyApiError(error, 'Gagal mengunggah foto profil.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!profile?.id || !canUploadDocuments || documentUploading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || 'application/octet-stream';
      const name = asset.name || `document-${Date.now()}`;
      if ((asset.size || 0) > 2 * 1024 * 1024) {
        notifyError('Ukuran dokumen maksimal 2MB.');
        return;
      }
      if (isCandidate) {
        const acceptedFormats = getCandidateAcceptedFormats(candidateDocumentCategory);
        const extension = getFileExtension(name);
        if (!acceptedFormats.includes(extension)) {
          notifyError(
            `Format dokumen tidak sesuai. Gunakan ${acceptedFormats
              .map((item) => item.toUpperCase())
              .join(', ')} untuk kategori ini.`,
          );
          return;
        }
      }

      setDocumentUploading(true);
      const uploaded = await profileApi.uploadProfileDocument({
        uri: asset.uri,
        name,
        type: mime,
      });
      const uploadCategory = isCandidate ? candidateDocumentCategory : 'Dokumen Pendukung';

      const existingDocs = (profile.documents || []).map((doc: ProfileDocument) => ({
        title: doc.title || doc.originalname || 'Dokumen',
        fileUrl: doc.fileUrl,
        category: doc.category || 'Dokumen Pendukung',
      }));

      await profileApi.updateSelf(profile.id, {
        documents: [
          ...existingDocs,
          {
            title: name,
            fileUrl: uploaded.url,
            category: uploadCategory,
          },
        ],
      });

      await queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
      await profileQuery.refetch();
      notifySuccess('Dokumen berhasil diunggah.');
    } catch (error) {
      notifyApiError(error, 'Gagal mengunggah dokumen.');
    } finally {
      setDocumentUploading(false);
    }
  };

  const handleDeleteDocument = async (index: number) => {
    if (!profile?.id) return;
    try {
      const nextDocs = (profile.documents || [])
        .filter((_, idx: number) => idx !== index)
        .map((doc: ProfileDocument) => ({
          title: doc.title || doc.originalname || 'Dokumen',
          fileUrl: doc.fileUrl,
          category: doc.category || 'Dokumen Pendukung',
        }));

      await profileApi.updateSelf(profile.id, { documents: nextDocs });
      await queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
      await profileQuery.refetch();
      notifySuccess('Dokumen berhasil dihapus.');
    } catch (error) {
      notifyApiError(error, 'Gagal menghapus dokumen.');
    }
  };

  const handleSupportingDocumentPick = async (): Promise<SupportingDocumentRecord | null> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return null;

      const asset = result.assets[0];
      const mime = String(asset.mimeType || '').toLowerCase();
      const name = asset.name || `supporting-document-${Date.now()}`;
      if (!['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(mime)) {
        notifyError('Dokumen pendukung hanya boleh berformat PDF, JPG, JPEG, atau PNG.');
        throw new Error('Tipe file dokumen pendukung tidak didukung');
      }
      if ((asset.size || 0) > 2 * 1024 * 1024) {
        notifyError('Ukuran dokumen pendukung maksimal 2MB.');
        throw new Error('Ukuran dokumen pendukung melebihi batas');
      }

      const uploaded = await profileApi.uploadProfileDocument({
        uri: asset.uri,
        name,
        type: mime || 'application/octet-stream',
      });

      return {
        title: uploaded.originalname || name,
        fileUrl: uploaded.url,
        category: SUPPORTING_DOCUMENT_CATEGORY,
      } satisfies SupportingDocumentRecord;
    } catch (error) {
      notifyApiError(error, 'Gagal mengunggah dokumen pendukung.');
      throw error;
    }
  };

  const persistSupportingDocuments = async (nextDocuments: SupportingDocumentRecord[]) => {
    if (!profile?.id) return;
    await profileApi.updateSelf(profile.id, {
      documents: nextDocuments.map((document) => ({
        title: document.title,
        fileUrl: document.fileUrl,
        category: document.category,
      })),
    });
    await queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
    await profileQuery.refetch();
    notifySuccess('Dokumen pendukung berhasil disimpan.');
  };

  const handleSupportingDocumentView = (document: SupportingDocumentRecord) => {
    const url = resolveMediaUrl(document.fileUrl);
    if (!url) {
      notifyError('File dokumen belum tersedia.');
      return;
    }
    openWebModuleRoute(router, {
      moduleKey: 'profile',
      webPath: url,
      label: document.title || 'Dokumen Pendukung',
    });
  };

  const handleEducationHistorySave = (history: ProfileEducationHistory) => {
    setEducationHistories((prev) =>
      sanitizeEducationHistories(
        prev.map((entry) => (entry.level === history.level ? history : entry)),
        educationTrack,
      ),
    );
  };

  const handleEducationHistoryRemove = (level: ProfileEducationLevel) => {
    setEducationHistories((prev) =>
      sanitizeEducationHistories(
        prev.map((entry) => (entry.level === level ? createEmptyEducationHistory(level) : entry)),
        educationTrack,
      ),
    );
  };

  const handleEducationDocumentPick = async (): Promise<ProfileEducationDocument | null> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return null;

      const asset = result.assets[0];
      const mime = String(asset.mimeType || '').toLowerCase();
      const name = asset.name || `education-${Date.now()}`;
      if (!['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(mime)) {
        notifyError('Dokumen pendidikan hanya boleh berformat PDF, JPG, JPEG, atau PNG.');
        throw new Error('Tipe file dokumen pendidikan tidak didukung');
      }
      if ((asset.size || 0) > 500 * 1024) {
        notifyError('Ukuran dokumen pendidikan maksimal 500KB.');
        throw new Error('Ukuran dokumen pendidikan melebihi batas');
      }
      const uploaded = await profileApi.uploadEducationHistoryDocument({
        uri: asset.uri,
        name,
        type: mime || 'application/octet-stream',
      });
      const document: ProfileEducationDocument = {
        kind: 'IJAZAH',
        label: name,
        fileUrl: uploaded.url,
        originalName: uploaded.originalname,
        mimeType: uploaded.mimetype,
        size: uploaded.size ?? null,
        uploadedAt: new Date().toISOString(),
      };
      notifySuccess('Dokumen riwayat pendidikan berhasil diunggah. Simpan riwayat pendidikan untuk merekam perubahan.');
      return document;
    } catch (error) {
      notifyApiError(error, 'Gagal mengunggah dokumen riwayat pendidikan.');
      throw error;
    }
  };

  const handleEducationDocumentView = (document: ProfileEducationDocument) => {
    const url = resolveMediaUrl(document.fileUrl);
    if (!url) {
      notifyError('File dokumen belum tersedia.');
      return;
    }
    openWebModuleRoute(router, {
      moduleKey: 'profile',
      webPath: url,
      label: document?.originalName || document?.label || 'Dokumen Riwayat Pendidikan',
    });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat profil..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={profileQuery.isFetching && !profileQuery.isLoading}
          onRefresh={() => {
            void profileQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>{profileCopy.title}</Text>
      <Text style={{ color: '#64748b', marginBottom: 14 }}>{profileCopy.subtitle}</Text>

      {profile ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 18 }}>
          <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                backgroundColor: '#fff',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700' }}>
                {ROLE_LABELS[profile.role] || profile.role}
              </Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: verificationMeta.borderColor,
                backgroundColor: verificationMeta.backgroundColor,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: verificationMeta.textColor, fontSize: 12, fontWeight: '700' }}>
                {verificationMeta.label}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {profileQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data profil..." /> : null}

      {profileQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat profil akun."
          onRetry={() => profileQuery.refetch()}
        />
      ) : null}

      {profileQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={profileQuery.data.cachedAt} /> : null}

      {profile ? (
        <>
          {isEmployee ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginBottom: 10 }}>
              {employeeProfileInsights.map((card) => (
                <View key={card.id} style={{ width: '33.3333%', paddingHorizontal: 5, marginBottom: 10 }}>
                  <ProfileInsightCard
                    iconName={card.iconName}
                    title={card.title}
                    subtitle={card.subtitle}
                    accentColor={card.accentColor}
                    onPress={() => setActiveProfileInsight(card.id)}
                  />
                </View>
              ))}
            </View>
          ) : (
            <>
              <View
                style={{
                  ...cardStyle,
                  backgroundColor: '#f8fbff',
                  borderColor: '#dbeafe',
                }}
              >
                <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>STRUKTUR PROFIL</Text>
                <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '700', marginTop: 8 }}>
                  {ROLE_LABELS[profile.role] || profile.role}
                </Text>
                <Text style={{ color: '#475569', fontSize: 13, lineHeight: 20, marginTop: 10 }}>
                  {profileCopy.readinessHelper}
                </Text>
                <View style={{ marginTop: 14 }}>
                  {summaryLines.map((line) => (
                    <View
                      key={line}
                      style={{
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        backgroundColor: '#fff',
                        borderRadius: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: '#475569', fontSize: 13 }}>{line}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={cardStyle}>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
                  {profileCopy.readinessTitle.toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ color: '#0f172a', fontSize: 28, fontWeight: '700' }}>{completeness.percent}%</Text>
                    <Text style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                      {completeness.completed} dari {completeness.total} data prioritas sudah terisi
                    </Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 14,
                      backgroundColor: '#f1f5f9',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ color: '#334155', fontSize: 13, fontWeight: '700' }}>
                      {completeness.missing.length === 0 ? 'Siap' : `${completeness.missing.length} belum`}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: '#e2e8f0',
                    overflow: 'hidden',
                    marginTop: 14,
                  }}
                >
                  <View
                    style={{
                      width: `${completeness.percent}%`,
                      height: '100%',
                      borderRadius: 999,
                      backgroundColor: '#2563eb',
                    }}
                  />
                </View>
                <Text style={{ color: '#475569', fontSize: 13, lineHeight: 20, marginTop: 12 }}>
                  {completeness.missing.length === 0
                    ? 'Data prioritas yang tersedia di sistem sudah terisi rapi.'
                    : `Masih perlu dilengkapi: ${completeness.missing.slice(0, 3).join(', ')}${completeness.missing.length > 3 ? ', dan lainnya.' : '.'}`}
                </Text>
              </View>

              <View style={cardStyle}>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
                  {profileCopy.summaryTitle.toUpperCase()}
                </Text>
                <View
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    backgroundColor: '#f8fafc',
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>USERNAME</Text>
                  <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '700', marginTop: 4 }}>{profile.username}</Text>
                </View>
                <View
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    backgroundColor: '#f8fafc',
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>STATUS AKUN</Text>
                  <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '700', marginTop: 4 }}>{verificationMeta.label}</Text>
                </View>
              </View>
            </>
          )}

          {isCandidate ? (
            <Pressable
              onPress={() => router.push('/candidate/application')}
              style={{
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Formulir PPDB</Text>
            </Pressable>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            style={{ marginBottom: 8 }}
          >
            {visibleTabs.map((tabId) => {
              const active = activeTab === tabId;
              return (
                <View key={tabId} style={{ marginRight: 8 }}>
                  <MobileMenuTab
                    active={active}
                    label={getTabLabel(profile.role, tabId)}
                    onPress={() => setActiveTab(tabId)}
                    minWidth={96}
                  />
                </View>
              );
            })}
          </ScrollView>

          <Modal
            visible={Boolean(activeProfileInsight && activeInsightMeta)}
            transparent
            animationType="fade"
            onRequestClose={() => setActiveProfileInsight(null)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
                justifyContent: 'center',
                paddingHorizontal: 18,
              }}
            >
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: '#dbeafe',
                  maxHeight: '78%',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingTop: 14,
                    paddingBottom: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: '#e2e8f0',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                    {activeInsightMeta ? (
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 12,
                          backgroundColor: `${activeInsightMeta.accentColor}18`,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                        }}
                      >
                        <Feather name={activeInsightMeta.iconName} size={18} color={activeInsightMeta.accentColor} />
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '700' }}>
                        {activeInsightMeta?.title || 'Detail Profil'}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        Ketuk area luar untuk menutup popup ini.
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setActiveProfileInsight(null)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <Feather name="x" size={18} color="#475569" />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={{ padding: 16 }}>
                  {activeProfileInsight === 'structure' ? (
                    <>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#dbeafe',
                          backgroundColor: '#f8fbff',
                          borderRadius: 14,
                          padding: 14,
                        }}
                      >
                        <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '700', letterSpacing: 1.3 }}>
                          STRUKTUR PROFIL
                        </Text>
                        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '700', marginTop: 8 }}>
                          {ROLE_LABELS[profile.role] || profile.role}
                        </Text>
                        <Text style={{ color: '#475569', fontSize: 13, lineHeight: 20, marginTop: 10 }}>
                          {profileCopy.readinessHelper}
                        </Text>
                      </View>

                      <View style={{ marginTop: 14 }}>
                        {summaryLines.map((line) => (
                          <View
                            key={line}
                            style={{
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                              backgroundColor: '#fff',
                              borderRadius: 14,
                              paddingHorizontal: 12,
                              paddingVertical: 11,
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: '#475569', fontSize: 13, lineHeight: 19 }}>{line}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : null}

                  {activeProfileInsight === 'readiness' ? (
                    <>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={{ color: '#0f172a', fontSize: 28, fontWeight: '700' }}>{completeness.percent}%</Text>
                          <Text style={{ color: '#64748b', fontSize: 13, marginTop: 4, lineHeight: 19 }}>
                            {completeness.completed} dari {completeness.total} data prioritas sudah terisi
                          </Text>
                        </View>
                        <View
                          style={{
                            borderRadius: 14,
                            backgroundColor: '#f1f5f9',
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                          }}
                        >
                          <Text style={{ color: '#334155', fontSize: 13, fontWeight: '700' }}>
                            {completeness.missing.length === 0 ? 'Siap' : `${completeness.missing.length} belum`}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={{
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: '#e2e8f0',
                          overflow: 'hidden',
                          marginTop: 14,
                        }}
                      >
                        <View
                          style={{
                            width: `${completeness.percent}%`,
                            height: '100%',
                            borderRadius: 999,
                            backgroundColor: '#2563eb',
                          }}
                        />
                      </View>

                      <Text style={{ color: '#475569', fontSize: 13, lineHeight: 20, marginTop: 12 }}>
                        {completeness.missing.length === 0
                          ? 'Data prioritas yang tersedia di sistem sudah terisi rapi.'
                          : `Masih perlu dilengkapi: ${completeness.missing.join(', ')}.`}
                      </Text>
                    </>
                  ) : null}

                  {activeProfileInsight === 'summary' ? (
                    <>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          backgroundColor: '#f8fafc',
                          borderRadius: 14,
                          padding: 12,
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>USERNAME</Text>
                        <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '700', marginTop: 4 }}>{profile.username}</Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          backgroundColor: '#f8fafc',
                          borderRadius: 14,
                          padding: 12,
                          marginBottom: 14,
                        }}
                      >
                        <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>STATUS AKUN</Text>
                        <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '700', marginTop: 4 }}>{verificationMeta.label}</Text>
                      </View>
                      {summaryLines.map((line) => (
                        <View
                          key={line}
                          style={{
                            borderWidth: 1,
                            borderColor: '#ede9fe',
                            backgroundColor: '#faf5ff',
                            borderRadius: 14,
                            paddingHorizontal: 12,
                            paddingVertical: 11,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: '#5b21b6', fontSize: 13, lineHeight: 19 }}>{line}</Text>
                        </View>
                      ))}
                    </>
                  ) : null}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {activeTab === 'account' ? (
            <View style={cardStyle}>
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Akun</Text>
            <ProfileRow label="Username" value={profile.username} />
            <ProfileRow label="Role" value={profile.role} />
            {isStudent ? (
              <ProfileRow label="Nama Lengkap" value={profile.name || '-'} />
            ) : (
              <FormField
                label="Nama Lengkap"
                value={form.name}
                onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
                placeholder="Masukkan nama lengkap"
              />
            )}

            {isStudent ? (
              <View style={{ marginTop: 2 }}>
                <ProfileRow label="NIS" value={profile.nis} />
                <ProfileRow label="NISN" value={profile.nisn} />
                <ProfileRow label="Kelas" value={profile.studentClass?.name || '-'} />
                <ProfileRow label="Status Siswa" value={profile.studentStatus || 'ACTIVE'} />
              </View>
            ) : null}

            {isParent ? (
              <View style={{ marginTop: 2 }}>
                <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Anak Terhubung</Text>
                {(profile.children || []).length > 0 ? (
                  (profile.children || []).map((child) => (
                    <Text key={child.id} style={{ color: '#0f172a', fontSize: 13, marginBottom: 3 }}>
                      {(child.nisn ? `${child.nisn} - ` : '') + child.name}
                    </Text>
                  ))
                ) : (
                  <Text style={{ color: '#64748b' }}>Tidak ada data anak.</Text>
                )}
              </View>
            ) : null}

            <View
              style={{
                marginTop: 4,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                backgroundColor: '#f8fafc',
                borderRadius: 14,
                padding: 12,
              }}
            >
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  overflow: 'hidden',
                  backgroundColor: '#f1f5f9',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}
              >
                {profilePhotoUrl ? (
                  <Image
                    source={{ uri: profilePhotoUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ color: '#64748b', fontSize: 11 }}>No Photo</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#334155', fontSize: 12, marginBottom: 6 }}>
                  Foto Profil (JPG/PNG max 500KB)
                </Text>
                <Pressable
                  onPress={() => {
                    void handleUploadPhoto();
                  }}
                  disabled={!canUploadPhoto || photoUploading}
                  style={{
                    borderWidth: 1,
                    borderColor: '#1d4ed8',
                    backgroundColor: !canUploadPhoto || photoUploading ? '#bfdbfe' : '#eff6ff',
                    borderRadius: 10,
                    paddingVertical: 9,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                    {photoUploading ? 'Mengunggah Foto...' : 'Upload Foto'}
                  </Text>
                </Pressable>
                {!canUploadPhoto ? (
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 6 }}>
                    Upload foto tidak tersedia untuk role ini.
                  </Text>
                ) : null}
              </View>
            </View>
            </View>
          ) : null}

          {activeTab === 'personal' ? (
            <View style={cardStyle}>
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Pribadi</Text>
            {showNip ? (
              <FormField
                label="NIP"
                value={form.nip}
                onChangeText={(value) => setForm((prev) => ({ ...prev, nip: value }))}
                placeholder="Nomor Induk Pegawai"
              />
            ) : null}

            {showNik ? (
              <FormField
                label="NIK"
                value={form.nik}
                onChangeText={(value) => setForm((prev) => ({ ...prev, nik: normalizeNumericText(value, 16) }))}
                placeholder="Nomor Induk Kependudukan"
                keyboardType="numeric"
                helperText="Isi 16 digit angka tanpa spasi."
                maxLength={16}
              />
            ) : null}

            {showNuptk ? (
              <FormField
                label="NUPTK"
                value={form.nuptk}
                onChangeText={(value) => setForm((prev) => ({ ...prev, nuptk: normalizeNumericText(value, 16) }))}
                placeholder="Nomor Unik Pendidik dan Tenaga Kependidikan"
                keyboardType="numeric"
                helperText="Isi 16 digit angka tanpa spasi."
                maxLength={16}
              />
            ) : null}

            {(isEmployee || isStudent) ? (
              <FormField
                label="Nomor KK"
                value={form.familyCardNumber}
                onChangeText={(value) =>
                  setForm((prev) => ({ ...prev, familyCardNumber: normalizeNumericText(value, 16) }))
                }
                placeholder="Nomor kartu keluarga"
                keyboardType="numeric"
                helperText="Isi 16 digit angka tanpa spasi."
                maxLength={16}
              />
            ) : null}

            <ChoiceChips
              label="Jenis Kelamin"
              value={form.gender}
              options={[
                { label: 'Laki-laki', value: 'MALE' },
                { label: 'Perempuan', value: 'FEMALE' },
              ]}
              onSelect={(value) =>
                setForm((prev) => ({
                  ...prev,
                  gender: value as EditableProfileForm['gender'],
                }))
              }
            />

            {isEmployee ? (
              <ChoiceChips
                label="Kewarganegaraan"
                value={form.citizenship}
                options={CITIZENSHIP_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, citizenship: value }))}
              />
            ) : null}

            {isEmployee ? (
              <ChoiceChips
                label="Status Perkawinan"
                value={form.maritalStatus}
                options={MARITAL_STATUS_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, maritalStatus: value }))}
              />
            ) : null}

            <FormField
              label="Tempat Lahir"
              value={form.birthPlace}
              onChangeText={(value) => setForm((prev) => ({ ...prev, birthPlace: value }))}
              placeholder="Masukkan tempat lahir"
            />
            <FormField
              label="Tanggal Lahir (YYYY-MM-DD)"
              value={form.birthDate}
              onChangeText={(value) => setForm((prev) => ({ ...prev, birthDate: value }))}
              placeholder="Contoh: 2008-05-17"
              autoCapitalize="none"
            />

            {(isEmployee || isStudent || isCandidate) ? (
              <>
                <ChoiceChips
                  label="Agama"
                  value={form.religion}
                  options={RELIGION_OPTIONS.map((item) => ({ label: item, value: item }))}
                  onSelect={(value) => setForm((prev) => ({ ...prev, religion: value }))}
                />
              </>
            ) : null}

            {isStudent ? (
              <>
                <ChoiceChips
                  label="Status Dalam Keluarga"
                  value={form.familyStatus}
                  options={FAMILY_STATUS_OPTIONS.map((item) => ({ label: item, value: item }))}
                  onSelect={(value) => setForm((prev) => ({ ...prev, familyStatus: value }))}
                />
                <FormField
                  label="Anak Ke-"
                  value={form.childNumber}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, childNumber: value }))}
                  keyboardType="numeric"
                />
                <ChoiceChips
                  label="Jenis Tinggal"
                  value={form.livingWith}
                  options={LIVING_WITH_OPTIONS.map((item) => ({ label: item, value: item }))}
                  onSelect={(value) => setForm((prev) => ({ ...prev, livingWith: value }))}
                />
                <FormField
                  label="Jumlah Saudara"
                  value={form.siblingsCount}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, siblingsCount: value }))}
                  keyboardType="numeric"
                />
                <ChoiceChips
                  label="Alat Transportasi"
                  value={form.transportationMode}
                  options={TRANSPORTATION_MODE_OPTIONS.map((item) => ({ label: item, value: item }))}
                  onSelect={(value) => setForm((prev) => ({ ...prev, transportationMode: value }))}
                />
                <FormField
                  label="Jarak ke Sekolah"
                  value={form.distanceToSchool}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, distanceToSchool: value }))}
                  placeholder="Contoh: 3 km"
                />
                <FormField
                  label="Waktu Tempuh ke Sekolah"
                  value={form.travelTimeToSchool}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, travelTimeToSchool: value }))}
                  placeholder="Contoh: 25 menit"
                />
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    backgroundColor: '#eff6ff',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Bantuan Pendidikan</Text>
                  <Text style={{ color: '#1d4ed8', fontSize: 12, marginBottom: 10 }}>
                    Isi hanya jika siswa memang memiliki identitas bantuan resmi yang aktif.
                  </Text>
                  <FormField
                    label="Nomor KIP"
                    value={form.kipNumber}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, kipNumber: value }))}
                  />
                  <FormField
                    label="Nomor PKH"
                    value={form.pkhNumber}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, pkhNumber: value }))}
                  />
                  <FormField
                    label="Nomor KKS"
                    value={form.kksNumber}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, kksNumber: value }))}
                  />
                </View>
              </>
            ) : null}

            {isEmployee ? (
              <FormField
                label="Nama Ibu Kandung"
                value={form.motherName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherName: value }))}
                placeholder="Masukkan nama ibu kandung"
              />
            ) : null}
            </View>
          ) : null}

          {isStudent && activeTab === 'parents' ? (
            <View style={cardStyle}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Keluarga</Text>
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 13, marginBottom: 8 }}>Data Ayah</Text>
              <FormField
                label="Nama Ayah"
                value={form.fatherName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, fatherName: value }))}
              />
              <FormField
                label="NIK Ayah"
                value={form.fatherNik}
                onChangeText={(value) => setForm((prev) => ({ ...prev, fatherNik: normalizeNumericText(value, 16) }))}
                keyboardType="numeric"
                helperText="Isi 16 digit angka tanpa spasi."
                maxLength={16}
              />
              <ChoiceChips
                label="Pendidikan Ayah"
                value={form.fatherEducation}
                options={EDUCATION_LEVEL_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, fatherEducation: value }))}
              />
              <FormField
                label="Pekerjaan Ayah"
                value={form.fatherOccupation}
                onChangeText={(value) => setForm((prev) => ({ ...prev, fatherOccupation: value }))}
              />
              <FormField
                label="Penghasilan Ayah"
                value={form.fatherIncome}
                onChangeText={(value) => setForm((prev) => ({ ...prev, fatherIncome: value }))}
              />
              <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 }} />
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 13, marginBottom: 8 }}>Data Ibu</Text>
              <FormField
                label="Nama Ibu"
                value={form.motherName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherName: value }))}
              />
              <FormField
                label="NIK Ibu"
                value={form.motherNik}
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherNik: normalizeNumericText(value, 16) }))}
                keyboardType="numeric"
                helperText="Isi 16 digit angka tanpa spasi."
                maxLength={16}
              />
              <ChoiceChips
                label="Pendidikan Ibu"
                value={form.motherEducation}
                options={EDUCATION_LEVEL_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, motherEducation: value }))}
              />
              <FormField
                label="Pekerjaan Ibu"
                value={form.motherOccupation}
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherOccupation: value }))}
              />
              <FormField
                label="Penghasilan Ibu"
                value={form.motherIncome}
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherIncome: value }))}
              />
              <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 }} />
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 13, marginBottom: 8 }}>
                Data Wali (Opsional)
              </Text>
              <FormField
                label="Nama Wali"
                value={form.guardianName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, guardianName: value }))}
              />
              <ChoiceChips
                label="Pendidikan Wali"
                value={form.guardianEducation}
                options={EDUCATION_LEVEL_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, guardianEducation: value }))}
              />
              <FormField
                label="Pekerjaan Wali"
                value={form.guardianOccupation}
                onChangeText={(value) => setForm((prev) => ({ ...prev, guardianOccupation: value }))}
              />
              <FormField
                label="No. HP Wali"
                value={form.guardianPhone}
                onChangeText={(value) => setForm((prev) => ({ ...prev, guardianPhone: value }))}
                keyboardType="phone-pad"
              />
            </View>
          ) : null}

          {activeTab === 'contact' ? (
            <View style={cardStyle}>
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Kontak</Text>
            <FormField
              label="Email"
              value={form.email}
              onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="nama@email.com"
            />
            <FormField
              label="No. HP / WA"
              value={form.phone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))}
              keyboardType="phone-pad"
            />
            <FormField
              label="Alamat Jalan"
              value={form.address}
              onChangeText={(value) => setForm((prev) => ({ ...prev, address: value }))}
              multiline
              numberOfLines={3}
            />

            {showAddressDetails ? (
              <>
                <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <FormField
                      label="RT"
                      value={form.rt}
                      onChangeText={(value) => setForm((prev) => ({ ...prev, rt: value }))}
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <FormField
                      label="RW"
                      value={form.rw}
                      onChangeText={(value) => setForm((prev) => ({ ...prev, rw: value }))}
                    />
                  </View>
                </View>

                <FormField
                  label="Provinsi"
                  value={form.province}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, province: value }))}
                />
                <FormField
                  label="Kabupaten / Kota"
                  value={form.cityRegency}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, cityRegency: value }))}
                />
                <FormField
                  label="Desa/Kelurahan"
                  value={form.village}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, village: value }))}
                />
                <FormField
                  label="Kecamatan"
                  value={form.subdistrict}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, subdistrict: value }))}
                />
                <FormField
                  label="Kode Pos"
                  value={form.postalCode}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, postalCode: normalizeNumericText(value, 5) }))}
                  keyboardType="numeric"
                  helperText="Isi 5 digit angka."
                  maxLength={5}
                />

                {(isEmployee || isStudent) ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>
                      Kode Wilayah Administratif
                    </Text>
                    <Text style={{ color: '#1d4ed8', fontSize: 12, marginBottom: 10 }}>
                      Opsional untuk sinkronisasi data induk. Gunakan kode wilayah resmi: provinsi 2 digit, kabupaten/kota 4 digit, kecamatan 7 digit, desa/kelurahan 10 digit.
                    </Text>
                    <FormField
                      label="Kode Provinsi"
                      value={form.provinceCode}
                      onChangeText={(value) => setForm((prev) => ({ ...prev, provinceCode: normalizeNumericText(value, 2) }))}
                      keyboardType="numeric"
                      helperText="Isi 2 digit angka."
                      maxLength={2}
                    />
                    <FormField
                      label="Kode Kabupaten / Kota"
                      value={form.cityRegencyCode}
                      onChangeText={(value) =>
                        setForm((prev) => ({ ...prev, cityRegencyCode: normalizeNumericText(value, 4) }))
                      }
                      keyboardType="numeric"
                      helperText="Isi 4 digit angka."
                      maxLength={4}
                    />
                    <FormField
                      label="Kode Kecamatan"
                      value={form.subdistrictCode}
                      onChangeText={(value) =>
                        setForm((prev) => ({ ...prev, subdistrictCode: normalizeNumericText(value, 7) }))
                      }
                      keyboardType="numeric"
                      helperText="Isi 7 digit angka."
                      maxLength={7}
                    />
                    <FormField
                      label="Kode Desa / Kelurahan"
                      value={form.villageCode}
                      onChangeText={(value) =>
                        setForm((prev) => ({ ...prev, villageCode: normalizeNumericText(value, 10) }))
                      }
                      keyboardType="numeric"
                      helperText="Isi 10 digit angka."
                      maxLength={10}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            </View>
          ) : null}

          {showEmployment && activeTab === 'employment' ? (
            <View style={cardStyle}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Kepegawaian</Text>
              {isStaff ? (
                <ChoiceChips
                  label="Posisi / Jabatan Staff"
                  value={ptkTypeChoiceValue}
                  options={[...STAFF_POSITION_OPTIONS, { label: 'Isi Manual', value: MANUAL_OPTION_VALUE }]}
                  onSelect={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      staffPosition: value,
                      ptkType: value === MANUAL_OPTION_VALUE ? MANUAL_OPTION_VALUE : value,
                    }))
                  }
                />
              ) : (
                <ChoiceChips
                  label={employmentRoleLabel}
                  value={ptkTypeChoiceValue}
                  options={[...employeeRoleOptions, { label: 'Isi Manual', value: MANUAL_OPTION_VALUE }]}
                  onSelect={(value) => setForm((prev) => ({ ...prev, ptkType: value }))}
                />
              )}
              {ptkTypeChoiceValue === MANUAL_OPTION_VALUE ? (
                <FormField
                  label={isStaff ? 'Posisi / Jabatan Staff (Manual)' : employmentRoleLabel}
                  value={form.ptkType === MANUAL_OPTION_VALUE ? '' : form.ptkType}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, ptkType: value }))}
                  placeholder={isStaff ? 'Contoh: Operator Sekolah' : employmentRolePlaceholder}
                />
              ) : null}
              <ChoiceChips
                label="Status Kepegawaian"
                value={employeeStatusChoiceValue}
                options={[
                  ...EMPLOYEE_STATUS_OPTIONS.map((item) => ({ label: item, value: item })),
                  { label: 'Isi Manual', value: MANUAL_OPTION_VALUE },
                ]}
                onSelect={(value) => setForm((prev) => ({ ...prev, employeeStatus: value }))}
              />
              {employeeStatusChoiceValue === MANUAL_OPTION_VALUE ? (
                <FormField
                  label="Status Kepegawaian (Manual)"
                  value={form.employeeStatus === MANUAL_OPTION_VALUE ? '' : form.employeeStatus}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, employeeStatus: value }))}
                  placeholder="Contoh: PNS, GTY / PTY, GTT / PTT"
                />
              ) : null}
              <FormField
                label="SK Pengangkatan"
                value={form.appointmentDecree}
                onChangeText={(value) => setForm((prev) => ({ ...prev, appointmentDecree: value }))}
                placeholder="Contoh: SK/2026/001"
              />
              <FormField
                label="TMT Pengangkatan (YYYY-MM-DD)"
                value={form.appointmentDate}
                onChangeText={(value) => setForm((prev) => ({ ...prev, appointmentDate: value }))}
                placeholder="Contoh: 2020-07-01"
                autoCapitalize="none"
              />
              <FormField
                label={institutionLabel}
                value={form.institution}
                onChangeText={(value) => setForm((prev) => ({ ...prev, institution: value }))}
                placeholder={institutionPlaceholder}
              />
              {isStaff ? (
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: -2, marginBottom: 10 }}>
                  Divisi kerja aktif: {getStaffPositionLabel(form.staffPosition) || normalizeStructuredFieldValue(form.ptkType) || '-'}
                </Text>
              ) : null}
              <FormField
                label={assignmentDecreeLabel}
                value={form.assignmentDecree}
                onChangeText={(value) => setForm((prev) => ({ ...prev, assignmentDecree: value }))}
                placeholder={
                  isExaminer ? 'Contoh: Surat tugas penguji industri' : 'Contoh: SK penugasan tambahan'
                }
              />
              <FormField
                label={assignmentDateLabel}
                value={form.assignmentDate}
                onChangeText={(value) => setForm((prev) => ({ ...prev, assignmentDate: value }))}
                placeholder="Contoh: 2024-07-01"
                autoCapitalize="none"
              />
            </View>
          ) : null}

          {activeTab === 'education' ? (
            <View style={cardStyle}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Riwayat Pendidikan</Text>
              <ProfileEducationEditor
                track={educationTrack}
                histories={educationHistories}
                onSaveHistory={handleEducationHistorySave}
                onRemoveHistory={handleEducationHistoryRemove}
                onPickDocument={handleEducationDocumentPick}
                onViewDocument={handleEducationDocumentView}
              />
            </View>
          ) : null}

          {activeTab === 'documents' ? (
            <View style={cardStyle}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
                {isCandidate ? 'Dokumen PPDB' : 'Dokumen Pendukung'}
              </Text>
              <View style={{ marginTop: 4 }}>
                {usesStructuredSupportingDocuments ? (
                  <SupportingDocumentsEditor
                    documents={supportingDocuments}
                    canUpload={canUploadDocuments}
                    onPickDocument={handleSupportingDocumentPick}
                    onSaveDocuments={persistSupportingDocuments}
                    onViewDocument={handleSupportingDocumentView}
                  />
                ) : (
                  <>
                    {isCandidate ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>
                          Kategori Dokumen PPDB
                        </Text>
                        <Text style={{ color: '#1d4ed8', fontSize: 12, marginBottom: 10 }}>
                          Pilih kategori sebelum upload supaya checklist PPDB mengenali dokumen dengan benar.
                        </Text>
                        {MOBILE_CANDIDATE_DOCUMENT_OPTIONS.map((option) => {
                          const active = candidateDocumentCategory === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              onPress={() => setCandidateDocumentCategory(option.value)}
                              style={{
                                borderWidth: 1,
                                borderColor: active ? '#1d4ed8' : '#bfdbfe',
                                backgroundColor: '#fff',
                                borderRadius: 10,
                                padding: 10,
                                marginBottom: 8,
                              }}
                            >
                              <Text style={{ color: active ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 13 }}>
                                {option.label}
                              </Text>
                              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                                {option.description}
                              </Text>
                              <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                                Format: {option.acceptedFormats.join(', ')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    <Text style={{ color: '#334155', fontSize: 12, marginBottom: 8 }}>
                      Dokumen PPDB (PDF/JPG/PNG max 2MB)
                    </Text>
                    <Pressable
                      onPress={() => {
                        void handleUploadDocument();
                      }}
                      disabled={!canUploadDocuments || documentUploading}
                      style={{
                        borderWidth: 1,
                        borderColor: '#1d4ed8',
                        backgroundColor: !canUploadDocuments || documentUploading ? '#bfdbfe' : '#eff6ff',
                        borderRadius: 10,
                        paddingVertical: 9,
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                        {documentUploading ? 'Mengunggah Dokumen...' : 'Upload Dokumen'}
                      </Text>
                    </Pressable>

                    {!canUploadDocuments ? (
                      <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                        Role ini tidak memiliki akses upload dokumen sesuai policy backend.
                      </Text>
                    ) : null}

                    {(profile.documents || []).length > 0 ? (
                      (profile.documents || []).map((doc, index: number) => (
                        <View
                          key={`${doc.fileUrl}-${index}`}
                          style={{
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 8,
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 13 }}>{doc.title || 'Dokumen'}</Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                            {getMobileCandidateDocumentCategoryLabel(doc.category)}
                          </Text>
                          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                            <View style={{ flex: 1, paddingHorizontal: 4 }}>
                              <Pressable
                                onPress={() => {
                                  const url = resolveMediaUrl(doc.fileUrl);
                                  if (!url) return;
                                  openWebModuleRoute(router, {
                                    moduleKey: 'profile',
                                    webPath: url,
                                    label: doc.title || 'Dokumen Profil',
                                  });
                                }}
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#1d4ed8',
                                  borderRadius: 8,
                                  paddingVertical: 8,
                                  alignItems: 'center',
                                  backgroundColor: '#eff6ff',
                                }}
                              >
                                <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Lihat</Text>
                              </Pressable>
                            </View>
                            <View style={{ flex: 1, paddingHorizontal: 4 }}>
                              <Pressable
                                onPress={() => {
                                  void handleDeleteDocument(index);
                                }}
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#fecaca',
                                  borderRadius: 8,
                                  paddingVertical: 8,
                                  alignItems: 'center',
                                  backgroundColor: '#fef2f2',
                                }}
                              >
                                <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Belum ada dokumen.</Text>
                    )}
                  </>
                )}
              </View>

            {(photoUploading || documentUploading) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <ActivityIndicator color="#1d4ed8" size="small" />
                <Text style={{ color: '#64748b', marginLeft: 8, fontSize: 12 }}>Menyinkronkan perubahan...</Text>
              </View>
            ) : null}
            </View>
          ) : null}

          <Pressable
            disabled={!isDirty || saveMutation.isPending}
            onPress={handleSave}
            style={{
              marginBottom: 12,
              backgroundColor: !isDirty || saveMutation.isPending ? '#93c5fd' : '#1d4ed8',
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {saveMutation.isPending ? 'Menyimpan...' : profileCopy.saveLabel}
            </Text>
          </Pressable>

        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          backgroundColor: '#1d4ed8',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
