import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { authService } from '../../../src/features/auth/authService';
import { MOBILE_PROFILE_QUERY_KEY } from '../../../src/features/profile/useProfileQuery';
import { publicBkkApi } from '../../../src/features/publicBkk/bkkApi';
import type { PublicBkkApplicantProfile } from '../../../src/features/publicBkk/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type ProfileFormState = {
  name: string;
  headline: string;
  phone: string;
  email: string;
  address: string;
  educationLevel: string;
  graduationYear: string;
  schoolName: string;
  major: string;
  skills: string;
  experienceSummary: string;
  cvUrl: string;
  portfolioUrl: string;
  linkedinUrl: string;
};

const emptyForm: ProfileFormState = {
  name: '',
  headline: '',
  phone: '',
  email: '',
  address: '',
  educationLevel: '',
  graduationYear: '',
  schoolName: '',
  major: '',
  skills: '',
  experienceSummary: '',
  cvUrl: '',
  portfolioUrl: '',
  linkedinUrl: '',
};

function buildForm(profile: PublicBkkApplicantProfile | undefined): ProfileFormState {
  if (!profile) return emptyForm;
  return {
    name: profile.name || '',
    headline: profile.headline || '',
    phone: profile.phone || '',
    email: profile.email || '',
    address: profile.address || '',
    educationLevel: profile.educationLevel || '',
    graduationYear: profile.graduationYear ? String(profile.graduationYear) : '',
    schoolName: profile.schoolName || '',
    major: profile.major || '',
    skills: profile.skills || '',
    experienceSummary: profile.experienceSummary || '',
    cvUrl: profile.cvUrl || '',
    portfolioUrl: profile.portfolioUrl || '',
    linkedinUrl: profile.linkedinUrl || '',
  };
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: BRAND_COLORS.white,
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 15, fontWeight: '700', marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
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
          minHeight: multiline ? 96 : undefined,
        }}
      />
    </View>
  );
}

function getApplicantVerificationContent(status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (normalized === 'REJECTED') {
    return {
      title: 'Akun pelamar ditolak sementara',
      description:
        'Periksa kembali data profil pelamar Anda, lalu hubungi admin atau tim BKK jika perlu perbaikan sebelum melamar lagi.',
    };
  }

  return {
    title: 'Akun pelamar masih menunggu verifikasi',
    description:
      'Lengkapi profil pelamar Anda terlebih dahulu. Fitur melamar lowongan dan mengikuti Tes BKK akan aktif setelah admin memverifikasi akun ini.',
  };
}

export default function PublicBkkProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isLoading, isAuthenticated, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const [formDraft, setFormDraft] = useState<ProfileFormState | null>(null);

  const profileQuery = useQuery({
    queryKey: ['mobile-public-bkk-profile'],
    enabled: isAuthenticated && user?.role === 'UMUM',
    queryFn: async () => publicBkkApi.getApplicantProfile(),
    staleTime: 60_000,
  });

  const baselineForm = useMemo(() => buildForm(profileQuery.data), [profileQuery.data]);
  const form = formDraft ?? baselineForm;
  const setForm = (updater: (prev: ProfileFormState) => ProfileFormState) => {
    setFormDraft((prev) => updater(prev ?? baselineForm));
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      publicBkkApi.saveApplicantProfile({
        name: form.name.trim(),
        headline: form.headline.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        educationLevel: form.educationLevel.trim() || undefined,
        graduationYear: form.graduationYear.trim() || undefined,
        schoolName: form.schoolName.trim() || undefined,
        major: form.major.trim() || undefined,
        skills: form.skills.trim() || undefined,
        experienceSummary: form.experienceSummary.trim() || undefined,
        cvUrl: form.cvUrl.trim() || undefined,
        portfolioUrl: form.portfolioUrl.trim() || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
      }),
    onSuccess: async () => {
      setFormDraft(null);
      notifySuccess('Profil pelamar berhasil disimpan.');
      try {
        await authService.me({ force: true });
      } catch {
        // Ignore cache refresh failures; local query invalidation below will refetch when possible.
      }
      void queryClient.invalidateQueries({ queryKey: ['mobile-public-bkk-profile'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-public-bkk-applications'] });
      void queryClient.invalidateQueries({ queryKey: MOBILE_PROFILE_QUERY_KEY });
    },
    onError: (error: unknown) => notifyApiError(error, 'Gagal menyimpan profil pelamar.'),
  });

  if (isLoading) return <AppLoadingScreen message="Memuat profil pelamar..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'UMUM') return <Redirect href="/home" />;

  const verificationStatus = profileQuery.data?.verificationStatus;
  const normalizedVerificationStatus = String(verificationStatus || 'PENDING').toUpperCase();
  const verificationContent = getApplicantVerificationContent(verificationStatus);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{ ...pageContentPadding, paddingHorizontal: 16, paddingBottom: 24 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: BRAND_COLORS.white,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>
          Lengkapi Profil Karier BKK
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Data di sini dipakai saat Anda melamar lowongan melalui aplikasi. Semakin lengkap profilnya, semakin mudah
        tim BKK menilai kecocokan lamaran Anda.
      </Text>

      {profileQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat profil pelamar..." />
      ) : profileQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat profil pelamar." onRetry={() => void profileQuery.refetch()} />
      ) : (
        <>
          <InfoCard title="Profil Pelamar">
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Lengkapi profil karier agar data lamaran, verifikasi akun, dan proses BKK Anda tetap rapi dan mudah
              dipantau.
            </Text>
          </InfoCard>

          <InfoCard title="Status Profil">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 24 }}>
              {profileQuery.data?.completeness.isReady ? 'Siap' : 'Belum'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {profileQuery.data?.completeness.isReady
                ? 'Profil Anda siap dipakai untuk melamar.'
                : `Masih perlu dilengkapi: ${profileQuery.data?.completeness.missingFields.join(', ') || 'data utama'}.`}
            </Text>
          </InfoCard>

          <InfoCard title="Status Verifikasi">
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 24 }}>
              {normalizedVerificationStatus}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
              {normalizedVerificationStatus === 'VERIFIED'
                ? 'Akun pelamar sudah aktif untuk melamar lowongan dan mengikuti Tes BKK.'
                : 'Akun pelamar masih menunggu verifikasi admin. Lengkapi profil agar proses verifikasi lebih cepat.'}
            </Text>
          </InfoCard>

          <InfoCard title="Aksi Cepat">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Pressable
                onPress={() => router.push('/public/vacancies' as never)}
                style={{
                  backgroundColor: '#ea580c',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Lihat Lowongan</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/public/applications' as never)}
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Lamaran Saya</Text>
              </Pressable>
            </View>
          </InfoCard>

          {normalizedVerificationStatus !== 'VERIFIED' ? (
            <InfoCard title={verificationContent.title}>
              <Text style={{ color: BRAND_COLORS.textMuted }}>{verificationContent.description}</Text>
            </InfoCard>
          ) : null}

          <InfoCard title="Data Utama">
            <Field label="Nama Pelamar" value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <Field
              label="Headline / Posisi yang Diminati"
              value={form.headline}
              onChangeText={(value) => setForm((prev) => ({ ...prev, headline: value }))}
              placeholder="Contoh: Fresh graduate TKJ siap magang atau kerja entry-level"
            />
            <Field label="Nomor Telepon" value={form.phone} onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
            <Field label="Email Aktif" value={form.email} onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))} />
            <Field
              label="Alamat Domisili"
              value={form.address}
              onChangeText={(value) => setForm((prev) => ({ ...prev, address: value }))}
              multiline
            />
          </InfoCard>

          <InfoCard title="Pendidikan & Kompetensi">
            <Field
              label="Jenjang Pendidikan"
              value={form.educationLevel}
              onChangeText={(value) => setForm((prev) => ({ ...prev, educationLevel: value }))}
            />
            <Field
              label="Tahun Lulus"
              value={form.graduationYear}
              onChangeText={(value) => setForm((prev) => ({ ...prev, graduationYear: value }))}
              placeholder="Contoh: 2025"
            />
            <Field
              label="Asal Sekolah / Kampus"
              value={form.schoolName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, schoolName: value }))}
            />
            <Field label="Jurusan / Kompetensi" value={form.major} onChangeText={(value) => setForm((prev) => ({ ...prev, major: value }))} />
            <Field
              label="Skill / Keahlian"
              value={form.skills}
              onChangeText={(value) => setForm((prev) => ({ ...prev, skills: value }))}
              multiline
              placeholder="Tulis ringkas keahlian yang paling relevan."
            />
            <Field
              label="Pengalaman Singkat"
              value={form.experienceSummary}
              onChangeText={(value) => setForm((prev) => ({ ...prev, experienceSummary: value }))}
              multiline
              placeholder="PKL, proyek, organisasi, freelance, dan pengalaman relevan lainnya."
            />
          </InfoCard>

          <InfoCard title="Tautan Dokumen">
            <Field label="URL CV" value={form.cvUrl} onChangeText={(value) => setForm((prev) => ({ ...prev, cvUrl: value }))} placeholder="https://..." />
            <Field
              label="URL Portofolio"
              value={form.portfolioUrl}
              onChangeText={(value) => setForm((prev) => ({ ...prev, portfolioUrl: value }))}
              placeholder="https://..."
            />
            <Field
              label="URL LinkedIn"
              value={form.linkedinUrl}
              onChangeText={(value) => setForm((prev) => ({ ...prev, linkedinUrl: value }))}
              placeholder="https://..."
            />
          </InfoCard>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => router.push('/public/vacancies' as never)}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Kembali ke Lowongan</Text>
            </Pressable>
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{
                backgroundColor: BRAND_COLORS.blue,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                opacity: saveMutation.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Profil Pelamar'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}
