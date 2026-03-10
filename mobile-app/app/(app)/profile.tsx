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
import { MOBILE_PROFILE_QUERY_KEY, useProfileQuery } from '../../src/features/profile/useProfileQuery';
import { profileApi } from '../../src/features/profile/profileApi';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifyError, notifySuccess } from '../../src/lib/ui/feedback';
import { ENV } from '../../src/config/env';
import { openWebModuleRoute } from '../../src/lib/navigation/webModuleRoute';

type EditableProfileForm = {
  name: string;
  gender: '' | 'MALE' | 'FEMALE';
  birthPlace: string;
  birthDate: string;
  email: string;
  phone: string;
  address: string;
  nip: string;
  nik: string;
  nuptk: string;
  motherName: string;
  religion: string;
  childNumber: string;
  siblingsCount: string;
  fatherName: string;
  fatherOccupation: string;
  fatherIncome: string;
  motherOccupation: string;
  motherIncome: string;
  guardianName: string;
  guardianOccupation: string;
  guardianPhone: string;
  rt: string;
  rw: string;
  dusun: string;
  village: string;
  subdistrict: string;
  postalCode: string;
  ptkType: string;
  employeeStatus: string;
  appointmentDecree: string;
  appointmentDate: string;
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
  birthPlace: '',
  birthDate: '',
  email: '',
  phone: '',
  address: '',
  nip: '',
  nik: '',
  nuptk: '',
  motherName: '',
  religion: '',
  childNumber: '',
  siblingsCount: '',
  fatherName: '',
  fatherOccupation: '',
  fatherIncome: '',
  motherOccupation: '',
  motherIncome: '',
  guardianName: '',
  guardianOccupation: '',
  guardianPhone: '',
  rt: '',
  rw: '',
  dusun: '',
  village: '',
  subdistrict: '',
  postalCode: '',
  ptkType: '',
  employeeStatus: '',
  appointmentDecree: '',
  appointmentDate: '',
  institution: '',
};

const RELIGION_OPTIONS = ['ISLAM', 'KRISTEN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU'];

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

function buildForm(profile: AuthUser | null): EditableProfileForm {
  if (!profile) return emptyForm;
  return {
    name: toText(profile?.name),
    gender: (profile?.gender as EditableProfileForm['gender']) || '',
    birthPlace: toText(profile?.birthPlace),
    birthDate: toDateInput(profile?.birthDate),
    email: toText(profile?.email),
    phone: toText(profile?.phone),
    address: toText(profile?.address),
    nip: toText(profile?.nip),
    nik: toText(profile?.nik),
    nuptk: toText(profile?.nuptk),
    motherName: toText(profile?.motherName),
    religion: toText(profile?.religion),
    childNumber: toText(profile?.childNumber),
    siblingsCount: toText(profile?.siblingsCount),
    fatherName: toText(profile?.fatherName),
    fatherOccupation: toText(profile?.fatherOccupation),
    fatherIncome: toText(profile?.fatherIncome),
    motherOccupation: toText(profile?.motherOccupation),
    motherIncome: toText(profile?.motherIncome),
    guardianName: toText(profile?.guardianName),
    guardianOccupation: toText(profile?.guardianOccupation),
    guardianPhone: toText(profile?.guardianPhone),
    rt: toText(profile?.rt),
    rw: toText(profile?.rw),
    dusun: toText(profile?.dusun),
    village: toText(profile?.village),
    subdistrict: toText(profile?.subdistrict),
    postalCode: toText(profile?.postalCode),
    ptkType: toText(profile?.ptkType),
    employeeStatus: toText(profile?.employeeStatus),
    appointmentDecree: toText(profile?.appointmentDecree),
    appointmentDate: toDateInput(profile?.appointmentDate),
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
  const isTeacher = profile?.role === 'TEACHER';
  const isPrincipal = profile?.role === 'PRINCIPAL';
  const isStaff = profile?.role === 'STAFF';
  const isParent = profile?.role === 'PARENT';
  const isExaminer = profile?.role === 'EXAMINER';
  const profilePhotoUrl = resolveMediaUrl(profile?.photo);
  const canUploadPhoto = ['ADMIN', 'TEACHER', 'STAFF', 'EXAMINER', 'STUDENT', 'PARENT'].includes(profile?.role || '');
  const canUploadDocuments = ['ADMIN', 'TEACHER', 'STAFF', 'EXAMINER'].includes(profile?.role || '');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const showNip = isTeacher || isPrincipal || isStaff;
  const showNik = isTeacher || isPrincipal || isStudent;
  const showNuptk = isTeacher || isPrincipal || isStaff;
  const showAddressDetails = isTeacher || isPrincipal || isStudent;
  const showEmployment = isTeacher || isPrincipal || isStaff || isExaminer;

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
      return profileApi.updateSelf(profile.id, {
        name: form.name.trim(),
        gender: (form.gender || null) as 'MALE' | 'FEMALE' | null,
        birthPlace: toNullable(form.birthPlace),
        birthDate: toNullable(form.birthDate),
        email: toNullable(form.email),
        phone: toNullable(form.phone),
        address: toNullable(form.address),
        nip: toNullable(form.nip),
        nik: toNullable(form.nik),
        nuptk: toNullable(form.nuptk),
        motherName: toNullable(form.motherName),
        religion: toNullable(form.religion),
        childNumber: toNullableNumber(form.childNumber),
        siblingsCount: toNullableNumber(form.siblingsCount),
        fatherName: toNullable(form.fatherName),
        fatherOccupation: toNullable(form.fatherOccupation),
        fatherIncome: toNullable(form.fatherIncome),
        motherOccupation: toNullable(form.motherOccupation),
        motherIncome: toNullable(form.motherIncome),
        guardianName: toNullable(form.guardianName),
        guardianOccupation: toNullable(form.guardianOccupation),
        guardianPhone: toNullable(form.guardianPhone),
        rt: toNullable(form.rt),
        rw: toNullable(form.rw),
        dusun: toNullable(form.dusun),
        village: toNullable(form.village),
        subdistrict: toNullable(form.subdistrict),
        postalCode: toNullable(form.postalCode),
        ptkType: toNullable(form.ptkType),
        employeeStatus: toNullable(form.employeeStatus),
        appointmentDecree: toNullable(form.appointmentDecree),
        appointmentDate: toNullable(form.appointmentDate),
        institution: toNullable(form.institution),
      });
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

      setDocumentUploading(true);
      const uploaded = await profileApi.uploadProfileDocument({
        uri: asset.uri,
        name,
        type: mime,
      });

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
            category: 'Dokumen Pendukung',
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
            <FormField
              label="Nama Lengkap"
              value={form.name}
              onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
              placeholder="Masukkan nama lengkap"
            />

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

            {isStudent ? (
              <>
                <ChoiceChips
                  label="Agama"
                  value={form.religion}
                  options={RELIGION_OPTIONS.map((item) => ({ label: item, value: item }))}
                  onSelect={(value) => setForm((prev) => ({ ...prev, religion: value }))}
                />
                <FormField
                  label="Anak Ke-"
                  value={form.childNumber}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, childNumber: value }))}
                  keyboardType="numeric"
                />
                <FormField
                  label="Jumlah Saudara"
                  value={form.siblingsCount}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, siblingsCount: value }))}
                  keyboardType="numeric"
                />
              </>
            ) : null}

            {(isTeacher || isPrincipal) ? (
              <FormField
                label="Nama Ibu Kandung"
                value={form.motherName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherName: value }))}
                placeholder="Masukkan nama ibu kandung"
              />
            ) : null}
          </View>

          {isStudent ? (
            <View style={cardStyle}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Orang Tua & Wali</Text>
              <FormField
                label="Nama Ayah"
                value={form.fatherName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, fatherName: value }))}
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
              <FormField
                label="Nama Ibu"
                value={form.motherName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, motherName: value }))}
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
              <FormField
                label="Nama Wali (Opsional)"
                value={form.guardianName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, guardianName: value }))}
              />
              <FormField
                label="Pekerjaan Wali (Opsional)"
                value={form.guardianOccupation}
                onChangeText={(value) => setForm((prev) => ({ ...prev, guardianOccupation: value }))}
              />
              <FormField
                label="No. HP Wali (Opsional)"
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
                  label="Nama Dusun"
                  value={form.dusun}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, dusun: value }))}
                />
                <FormField
                  label="Desa / Kelurahan"
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
              </>
            ) : null}
          </View>

          {showEmployment ? (
            <View style={cardStyle}>
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 10 }}>Data Kepegawaian</Text>
              <FormField
                label="Jenis PTK"
                value={form.ptkType}
                onChangeText={(value) => setForm((prev) => ({ ...prev, ptkType: value }))}
                placeholder="Contoh: Guru Mapel, Staff Administrasi"
              />
              <FormField
                label="Status Kepegawaian"
                value={form.employeeStatus}
                onChangeText={(value) => setForm((prev) => ({ ...prev, employeeStatus: value }))}
                placeholder="Contoh: PNS, GTY, GTT"
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
                label="Lembaga / Instansi"
                value={form.institution}
                onChangeText={(value) => setForm((prev) => ({ ...prev, institution: value }))}
              />
            </View>
          ) : null}

          <View style={cardStyle}>
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Media & Dokumen</Text>
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
                      {doc.category || 'Dokumen Pendukung'}
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
