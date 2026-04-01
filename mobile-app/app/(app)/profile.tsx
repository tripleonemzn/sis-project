import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Image,
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
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import type { AuthUser } from '../../src/features/auth/types';
import {
  MOBILE_CANDIDATE_DOCUMENT_OPTIONS,
  getMobileCandidateDocumentCategoryLabel,
} from '../../src/features/candidateAdmission/types';
import { MOBILE_PROFILE_QUERY_KEY, useProfileQuery } from '../../src/features/profile/useProfileQuery';
import { profileApi } from '../../src/features/profile/profileApi';
import type { UpdateSelfProfilePayload } from '../../src/features/profile/profileApi';
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
  dusun: string;
  province: string;
  provinceCode: string;
  cityRegency: string;
  cityRegencyCode: string;
  village: string;
  subdistrict: string;
  subdistrictCode: string;
  villageCode: string;
  postalCode: string;
  ptkType: string;
  employeeStatus: string;
  employeeActiveStatus: string;
  salarySource: string;
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
};
type ProfileDocument = NonNullable<AuthUser['documents']>[number] & { originalname?: string | null };

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
  dusun: '',
  province: '',
  provinceCode: '',
  cityRegency: '',
  cityRegencyCode: '',
  village: '',
  subdistrict: '',
  subdistrictCode: '',
  villageCode: '',
  postalCode: '',
  ptkType: '',
  employeeStatus: '',
  employeeActiveStatus: '',
  salarySource: '',
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
  'D1',
  'D2',
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
const EMPLOYEE_ACTIVE_STATUS_OPTIONS = ['Aktif', 'Cuti', 'Tugas Belajar', 'Tugas Tambahan', 'Nonaktif Sementara'];
const SALARY_SOURCE_OPTIONS = [
  'APBN',
  'APBD Provinsi',
  'APBD Kabupaten/Kota',
  'Yayasan',
  'BOS',
  'Mandiri / Honor Sekolah',
  'Perusahaan / Mitra',
  'Lainnya',
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
    dusun: toText(profile?.dusun),
    province: toText(profile?.province),
    provinceCode: toText(profile?.provinceCode),
    cityRegency: toText(profile?.cityRegency),
    cityRegencyCode: toText(profile?.cityRegencyCode),
    village: toText(profile?.village),
    subdistrict: toText(profile?.subdistrict),
    subdistrictCode: toText(profile?.subdistrictCode),
    villageCode: toText(profile?.villageCode),
    postalCode: toText(profile?.postalCode),
    ptkType: toText(profile?.ptkType),
    employeeStatus: toText(profile?.employeeStatus),
    employeeActiveStatus: toText(profile?.employeeActiveStatus),
    salarySource: toText(profile?.salarySource),
    appointmentDecree: toText(profile?.appointmentDecree),
    appointmentDate: toDateInput(profile?.appointmentDate),
    assignmentDecree: toText(profile?.assignmentDecree),
    assignmentDate: toDateInput(profile?.assignmentDate),
    institution: toText(profile?.institution),
  };
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
}: FormFieldProps) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={numberOfLines}
        autoCapitalize={autoCapitalize}
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
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <View key={option.value} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => onSelect(option.value)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? '#1d4ed8' : '#cbd5e1',
                  backgroundColor: active ? '#eff6ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: active ? '#1d4ed8' : '#334155', fontWeight: '600', fontSize: 12 }}>
                  {option.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const profileQuery = useProfileQuery(isAuthenticated);
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 120 });
  const [form, setForm] = useState<EditableProfileForm>(emptyForm);

  const profile = profileQuery.data?.profile ?? null;
  const baseline = useMemo(() => (profile ? buildForm(profile) : emptyForm), [profile]);

  const isStudent = profile?.role === 'STUDENT';
  const isParent = profile?.role === 'PARENT';
  const isExaminer = profile?.role === 'EXAMINER';
  const isTutor = profile?.role === 'EXTRACURRICULAR_TUTOR';
  const isCandidate = profile?.role === 'CALON_SISWA';
  const isEmployee = Boolean(
    profile?.role && ['TEACHER', 'PRINCIPAL', 'STAFF', 'EXAMINER', 'EXTRACURRICULAR_TUTOR'].includes(profile.role),
  );
  const profilePhotoUrl = resolveMediaUrl(profile?.photo);
  const canUploadPhoto = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'STAFF', 'EXAMINER', 'EXTRACURRICULAR_TUTOR', 'STUDENT', 'PARENT', 'CALON_SISWA'].includes(profile?.role || '');
  const canUploadDocuments = ['ADMIN', 'TEACHER', 'PRINCIPAL', 'STAFF', 'EXAMINER', 'EXTRACURRICULAR_TUTOR', 'CALON_SISWA'].includes(profile?.role || '');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [candidateDocumentCategory, setCandidateDocumentCategory] = useState<string>(
    MOBILE_CANDIDATE_DOCUMENT_OPTIONS[0]?.value || 'PPDB_AKTA_KELAHIRAN',
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
      : 'Contoh: Guru Mapel, Staff Administrasi';
  const institutionLabel = isExaminer ? 'Instansi / Perusahaan' : 'Lembaga Pengangkat';
  const institutionPlaceholder = isExaminer
    ? 'Nama perusahaan atau lembaga asal'
    : 'Contoh: Yayasan / Pemerintah Daerah';
  const assignmentDecreeLabel = isExaminer ? 'Surat Tugas / SK Penugasan' : 'SK Penugasan';
  const assignmentDateLabel = isExaminer ? 'Mulai Penugasan (YYYY-MM-DD)' : 'TMT Penugasan (YYYY-MM-DD)';

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;
      void queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
    }, [isAuthenticated, queryClient]),
  );

  useEffect(() => {
    if (!profile) return;
    setForm(buildForm(profile));
  }, [profile]);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);

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
        highestEducation: toNullable(form.highestEducation),
        studyProgram: toNullable(form.studyProgram),
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
        dusun: toNullable(form.dusun),
        province: toNullable(form.province),
        provinceCode: toNullable(form.provinceCode),
        cityRegency: toNullable(form.cityRegency),
        cityRegencyCode: toNullable(form.cityRegencyCode),
        village: toNullable(form.village),
        subdistrict: toNullable(form.subdistrict),
        subdistrictCode: toNullable(form.subdistrictCode),
        villageCode: toNullable(form.villageCode),
        postalCode: toNullable(form.postalCode),
        ptkType: toNullable(form.ptkType),
        employeeStatus: toNullable(form.employeeStatus),
        employeeActiveStatus: toNullable(form.employeeActiveStatus),
        salarySource: toNullable(form.salarySource),
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
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Profil Saya</Text>
      <Text style={{ color: '#64748b', marginBottom: 18 }}>
        Form mobile ini mengikuti struktur data profil pada web.
      </Text>

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
          </View>

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
                onChangeText={(value) => setForm((prev) => ({ ...prev, nik: value }))}
                placeholder="Nomor Induk Kependudukan"
                keyboardType="numeric"
              />
            ) : null}

            {showNuptk ? (
              <FormField
                label="NUPTK"
                value={form.nuptk}
                onChangeText={(value) => setForm((prev) => ({ ...prev, nuptk: value }))}
                placeholder="Nomor Unik Pendidik dan Tenaga Kependidikan"
              />
            ) : null}

            {(isEmployee || isStudent) ? (
              <FormField
                label="Nomor KK"
                value={form.familyCardNumber}
                onChangeText={(value) => setForm((prev) => ({ ...prev, familyCardNumber: value }))}
                placeholder="Nomor kartu keluarga"
                keyboardType="numeric"
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
              <>
                <FormField
                  label="Nama Ibu Kandung"
                  value={form.motherName}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, motherName: value }))}
                  placeholder="Masukkan nama ibu kandung"
                />
                <FormField
                  label="NIK Ibu Kandung"
                  value={form.motherNik}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, motherNik: value }))}
                  placeholder="Diisi sesuai data identitas keluarga"
                  keyboardType="numeric"
                />
              </>
            ) : null}
          </View>

          {isStudent ? (
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
                onChangeText={(value) => setForm((prev) => ({ ...prev, fatherNik: value }))}
                keyboardType="numeric"
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
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherNik: value }))}
                keyboardType="numeric"
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
                  label="Nama Dusun"
                  value={form.dusun}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, dusun: value }))}
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
                  onChangeText={(value) => setForm((prev) => ({ ...prev, postalCode: value }))}
                  keyboardType="numeric"
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
                      Opsional untuk sinkronisasi data induk. Isi sesuai referensi wilayah resmi bila sudah tersedia.
                    </Text>
                    <FormField
                      label="Kode Provinsi"
                      value={form.provinceCode}
                      onChangeText={(value) => setForm((prev) => ({ ...prev, provinceCode: value }))}
                    />
                    <FormField
                      label="Kode Kabupaten / Kota"
                      value={form.cityRegencyCode}
                      onChangeText={(value) => setForm((prev) => ({ ...prev, cityRegencyCode: value }))}
                    />
                    <FormField
                      label="Kode Kecamatan"
                      value={form.subdistrictCode}
                      onChangeText={(value) => setForm((prev) => ({ ...prev, subdistrictCode: value }))}
                    />
                    <FormField
                      label="Kode Desa / Kelurahan"
                      value={form.villageCode}
                      onChangeText={(value) => setForm((prev) => ({ ...prev, villageCode: value }))}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
          </View>

          {showEmployment ? (
            <View style={cardStyle}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Kepegawaian</Text>
              <FormField
                label={employmentRoleLabel}
                value={form.ptkType}
                onChangeText={(value) => setForm((prev) => ({ ...prev, ptkType: value }))}
                placeholder={employmentRolePlaceholder}
              />
              <FormField
                label="Status Kepegawaian"
                value={form.employeeStatus}
                onChangeText={(value) => setForm((prev) => ({ ...prev, employeeStatus: value }))}
                placeholder="Contoh: PNS, GTY, GTT"
              />
              <ChoiceChips
                label="Status Keaktifan"
                value={form.employeeActiveStatus}
                options={EMPLOYEE_ACTIVE_STATUS_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, employeeActiveStatus: value }))}
              />
              <ChoiceChips
                label="Sumber Gaji"
                value={form.salarySource}
                options={SALARY_SOURCE_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, salarySource: value }))}
              />
              <ChoiceChips
                label="Pendidikan Terakhir"
                value={form.highestEducation}
                options={EDUCATION_LEVEL_OPTIONS.map((item) => ({ label: item, value: item }))}
                onSelect={(value) => setForm((prev) => ({ ...prev, highestEducation: value }))}
              />
              <FormField
                label="Program Studi / Jurusan"
                value={form.studyProgram}
                onChangeText={(value) => setForm((prev) => ({ ...prev, studyProgram: value }))}
                placeholder="Contoh: Pendidikan Matematika / Akuntansi"
              />
              <FormField
                label="SK Pengangkatan"
                value={form.appointmentDecree}
                onChangeText={(value) => setForm((prev) => ({ ...prev, appointmentDecree: value }))}
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
              <FormField
                label={assignmentDecreeLabel}
                value={form.assignmentDecree}
                onChangeText={(value) => setForm((prev) => ({ ...prev, assignmentDecree: value }))}
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

          <View style={cardStyle}>
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Upload File</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
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
                <Text style={{ color: '#334155', fontSize: 12, marginBottom: 6 }}>Foto Profil (JPG/PNG max 500KB)</Text>
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
              </View>
            </View>

            <View style={{ marginTop: 4 }}>
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
                Dokumen Pendukung (PDF/JPG/PNG max 2MB)
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
                      {isCandidate
                        ? getMobileCandidateDocumentCategoryLabel(doc.category)
                        : doc.category || 'Dokumen Pendukung'}
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
            </View>

            {(photoUploading || documentUploading) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <ActivityIndicator color="#1d4ed8" size="small" />
                <Text style={{ color: '#64748b', marginLeft: 8, fontSize: 12 }}>Menyinkronkan perubahan...</Text>
              </View>
            ) : null}
          </View>

          <Pressable
            disabled={!isDirty || saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
            style={{
              marginBottom: 12,
              backgroundColor: !isDirty || saveMutation.isPending ? '#93c5fd' : '#1d4ed8',
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/diagnostics')}
            style={{
              marginBottom: 12,
              borderWidth: 1,
              borderColor: '#1d4ed8',
              backgroundColor: '#eff6ff',
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Diagnostics</Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
              Untuk cek sinkronisasi push, update, dan status perangkat.
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
