import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { getApiErrorMessage } from '../../src/lib/api/errorMessage';
import { authService } from '../../src/features/auth/authService';
import { BRAND_COLORS } from '../../src/config/brand';
import { getNisnGuidanceText, getNisnValidationMessage, normalizeNisnInput } from '../../src/lib/nisn';

type RegisterMode = 'candidate' | 'parent' | 'bkk';

const REGISTER_MODE_CONFIG: Record<
  RegisterMode,
  {
    title: string;
    subtitle: string;
    submitLabel: string;
    accentColor: string;
    accentSoftColor: string;
    icon: keyof typeof Feather.glyphMap;
    highlights: string[];
  }
> = {
  candidate: {
    title: 'Daftar Calon Siswa',
    subtitle: 'Buat akun calon siswa baru lalu lanjutkan proses PPDB dan tes dari aplikasi.',
    submitLabel: 'Buat Akun Calon Siswa',
    accentColor: '#2563eb',
    accentSoftColor: '#dbeafe',
    icon: 'book-open',
    highlights: [
      'Akun dipakai untuk form PPDB dan tahap tes seleksi.',
      'Isi data dasar dulu, detail lain bisa dilengkapi setelah login.',
      'Hasil seleksi dan surat keputusan tampil dari akun ini.',
    ],
  },
  parent: {
    title: 'Daftar Orang Tua',
    subtitle: 'Buat satu akun untuk memantau dan menghubungkan data lebih dari satu anak.',
    submitLabel: 'Buat Akun Orang Tua',
    accentColor: '#0f766e',
    accentSoftColor: '#ccfbf1',
    icon: 'users',
    highlights: [
      'Satu akun bisa dipakai untuk lebih dari satu anak.',
      'Relasi anak dapat dihubungkan sendiri setelah login.',
      'Akses orang tua dibuat terpisah dari jalur PPDB dan BKK.',
    ],
  },
  bkk: {
    title: 'Daftar BKK',
    subtitle: 'Buat akun pelamar untuk melihat lowongan BKK dan mengikuti proses seleksi.',
    submitLabel: 'Buat Akun Pelamar',
    accentColor: '#c2410c',
    accentSoftColor: '#ffedd5',
    icon: 'briefcase',
    highlights: [
      'Profil pelamar dan lamaran kerja dikelola dari akun yang sama.',
      'Lowongan BKK bisa dipantau tanpa bercampur dengan modul sekolah.',
      'Tahapan review dan hasil lamaran lebih mudah diikuti.',
    ],
  },
};

const optionalEmailSchema = z.string().email('Format email tidak valid').or(z.literal(''));

const candidateSchema = z
  .object({
    name: z.string().min(1, 'Nama wajib diisi'),
    nisn: z
      .string()
      .transform((value) => normalizeNisnInput(value))
      .pipe(
        z.string().superRefine((value, ctx) => {
          const message = getNisnValidationMessage(value);
          if (message) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message,
            });
          }
        }),
      ),
    phone: z.string().min(8, 'Nomor HP minimal 8 digit'),
    email: optionalEmailSchema,
    password: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

const accountSchema = z
  .object({
    name: z.string().min(1, 'Nama wajib diisi'),
    username: z.string().min(3, 'Username minimal 3 karakter'),
    phone: z.string().min(8, 'Nomor HP minimal 8 digit'),
    email: optionalEmailSchema,
    password: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

type CandidateForm = z.infer<typeof candidateSchema>;
type AccountForm = z.infer<typeof accountSchema>;

function resolveMode(raw: string | string[] | undefined): RegisterMode | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'candidate' || value === 'parent' || value === 'bkk') {
    return value;
  }
  return null;
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 24, fontWeight: '700', marginBottom: 6 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted }}>{subtitle}</Text>
    </View>
  );
}

function RegisterModeCard({
  mode,
  onPress,
}: {
  mode: RegisterMode;
  onPress: () => void;
}) {
  const config = REGISTER_MODE_CONFIG[mode];

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: BRAND_COLORS.white,
        borderWidth: 1,
        borderColor: '#d7e3f4',
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
        elevation: 3,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: config.accentSoftColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={config.icon} size={20} color={config.accentColor} />
        </View>
        <Feather name="arrow-right" size={18} color="#94a3b8" />
      </View>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 17, marginTop: 14, marginBottom: 6 }}>
        {config.title}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20 }}>{config.subtitle}</Text>
    </Pressable>
  );
}

function FormField({
  label,
  icon,
  error,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  secureTextEntry = false,
  showSecureToggle = false,
  isSecureVisible = false,
  onToggleSecure,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  error?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  secureTextEntry?: boolean;
  showSecureToggle?: boolean;
  isSecureVisible?: boolean;
  onToggleSecure?: () => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: '600', marginBottom: 6, color: BRAND_COLORS.textDark }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1.2,
          borderColor: error ? '#dc2626' : '#cbd5e1',
          borderRadius: 12,
          paddingHorizontal: 12,
          backgroundColor: '#f8fafc',
        }}
      >
        <Feather name={icon} size={18} color="#64748b" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          placeholder={placeholder}
          placeholderTextColor={BRAND_COLORS.textMuted}
          style={{
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 10,
            color: BRAND_COLORS.textDark,
          }}
        />
        {showSecureToggle && onToggleSecure ? (
          <Pressable
            onPress={onToggleSecure}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isSecureVisible ? 'Sembunyikan password' : 'Tampilkan password'}
          >
            <Feather name={isSecureVisible ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={{ color: '#dc2626', marginTop: 4, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

function BottomAuthLinks({
  onBackToLogin,
}: {
  onBackToLogin: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 }}>
      <Text style={{ color: BRAND_COLORS.textMuted }}>Sudah punya akun? </Text>
      <Pressable onPress={onBackToLogin}>
        <Text style={{ color: BRAND_COLORS.pink, fontWeight: '700' }}>Masuk</Text>
      </Pressable>
    </View>
  );
}

function FeatureCards({
  items,
}: {
  items: string[];
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      {items.map((item) => (
        <View
          key={item}
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 14,
            backgroundColor: '#ffffff',
            paddingHorizontal: 12,
            paddingVertical: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function RegisterHub({ onChooseMode, onBackToLogin }: { onChooseMode: (mode: RegisterMode) => void; onBackToLogin: () => void }) {
  return (
    <>
      <SectionHeading
        title="Pilih Jalur Daftar"
        subtitle="Masuk dari login page lalu pilih jenis akun yang paling sesuai dengan kebutuhan Anda."
      />

      <FeatureCards
        items={[
          'Pilih jalur sesuai kebutuhan agar form yang muncul tetap ringkas dan relevan.',
          'Desain pendaftaran dipisah untuk calon siswa, orang tua, dan pelamar BKK.',
          'Setelah akun aktif, pengguna langsung diarahkan ke layanan yang tepat.',
        ]}
      />

      <RegisterModeCard mode="candidate" onPress={() => onChooseMode('candidate')} />
      <RegisterModeCard mode="parent" onPress={() => onChooseMode('parent')} />
      <RegisterModeCard mode="bkk" onPress={() => onChooseMode('bkk')} />

      <BottomAuthLinks onBackToLogin={onBackToLogin} />
    </>
  );
}

function CandidateRegisterForm({
  onBack,
  onBackToLogin,
}: {
  onBack: () => void;
  onBackToLogin: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CandidateForm>({
    defaultValues: {
      name: '',
      nisn: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: CandidateForm) => {
    const parsed = candidateSchema.safeParse(values);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      if (issues.name?.[0]) setError('name', { message: issues.name[0] });
      if (issues.nisn?.[0]) setError('nisn', { message: issues.nisn[0] });
      if (issues.phone?.[0]) setError('phone', { message: issues.phone[0] });
      if (issues.email?.[0]) setError('email', { message: issues.email[0] });
      if (issues.password?.[0]) setError('password', { message: issues.password[0] });
      if (issues.confirmPassword?.[0]) setError('confirmPassword', { message: issues.confirmPassword[0] });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await authService.registerCalonSiswa({
        name: parsed.data.name.trim(),
        nisn: parsed.data.nisn.trim(),
        phone: parsed.data.phone.trim(),
        email: normalizeOptionalText(parsed.data.email),
        password: parsed.data.password,
        confirmPassword: parsed.data.confirmPassword,
      });
      Alert.alert(
        'Registrasi Berhasil',
        response.message || 'Akun calon siswa berhasil dibuat. Silakan login untuk melanjutkan proses.',
        [{ text: 'Tutup', onPress: onBackToLogin }],
      );
    } catch (error: unknown) {
      Alert.alert('Registrasi Gagal', getApiErrorMessage(error, 'Registrasi calon siswa gagal.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <Feather name="arrow-left" size={16} color="#2563eb" />
        <Text style={{ color: '#2563eb', fontWeight: '700', marginLeft: 8 }}>Pilih jalur lain</Text>
      </Pressable>

      <SectionHeading
        title={REGISTER_MODE_CONFIG.candidate.title}
        subtitle={REGISTER_MODE_CONFIG.candidate.subtitle}
      />

      <FeatureCards items={REGISTER_MODE_CONFIG.candidate.highlights} />

      <View
        style={{
          borderWidth: 1,
          borderColor: '#bfdbfe',
          borderRadius: 14,
          backgroundColor: '#eff6ff',
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Gunakan NISN resmi</Text>
        <Text style={{ color: '#1e40af', lineHeight: 20 }}>{getNisnGuidanceText()}</Text>
        <Text style={{ color: '#1d4ed8', marginTop: 4, fontSize: 12 }}>
          Pola dummy seperti 0000000000 atau 1234567890 akan ditolak.
        </Text>
      </View>

      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Nama Lengkap"
            icon="user"
            error={errors.name?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Masukkan nama lengkap"
            autoCapitalize="words"
          />
        )}
      />

      <Controller
        control={control}
        name="nisn"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="NISN"
            icon="credit-card"
            error={errors.nisn?.message}
            value={value}
            onChangeText={(nextValue) => onChange(normalizeNisnInput(nextValue))}
            placeholder="10 digit NISN"
            autoCapitalize="none"
            keyboardType="number-pad"
          />
        )}
      />

      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Nomor HP"
            icon="phone"
            error={errors.phone?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Masukkan nomor HP aktif"
            autoCapitalize="none"
            keyboardType="phone-pad"
          />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Email"
            icon="mail"
            error={errors.email?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Email aktif (opsional)"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Password"
            icon="lock"
            error={errors.password?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Minimal 6 karakter"
            autoCapitalize="none"
            secureTextEntry={!showPassword}
            showSecureToggle
            isSecureVisible={showPassword}
            onToggleSecure={() => setShowPassword((prev) => !prev)}
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Konfirmasi Password"
            icon="shield"
            error={errors.confirmPassword?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Ulangi password"
            autoCapitalize="none"
            secureTextEntry={!showConfirmPassword}
            showSecureToggle
            isSecureVisible={showConfirmPassword}
            onToggleSecure={() => setShowConfirmPassword((prev) => !prev)}
          />
        )}
      />

      <Pressable
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
        style={{
          backgroundColor: isSubmitting ? '#93c5fd' : REGISTER_MODE_CONFIG.candidate.accentColor,
          paddingVertical: 12,
          borderRadius: 999,
          alignItems: 'center',
          marginTop: 4,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {isSubmitting ? 'Memproses...' : REGISTER_MODE_CONFIG.candidate.submitLabel}
        </Text>
      </Pressable>

      <BottomAuthLinks onBackToLogin={onBackToLogin} />
    </>
  );
}

function AccountRegisterForm({
  mode,
  onBack,
  onBackToLogin,
}: {
  mode: 'parent' | 'bkk';
  onBack: () => void;
  onBackToLogin: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AccountForm>({
    defaultValues: {
      name: '',
      username: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });
  const config = REGISTER_MODE_CONFIG[mode];

  const onSubmit = async (values: AccountForm) => {
    const parsed = accountSchema.safeParse(values);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      if (issues.name?.[0]) setError('name', { message: issues.name[0] });
      if (issues.username?.[0]) setError('username', { message: issues.username[0] });
      if (issues.phone?.[0]) setError('phone', { message: issues.phone[0] });
      if (issues.email?.[0]) setError('email', { message: issues.email[0] });
      if (issues.password?.[0]) setError('password', { message: issues.password[0] });
      if (issues.confirmPassword?.[0]) setError('confirmPassword', { message: issues.confirmPassword[0] });
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: parsed.data.name.trim(),
        username: parsed.data.username.trim(),
        phone: parsed.data.phone.trim(),
        email: normalizeOptionalText(parsed.data.email),
        password: parsed.data.password,
        confirmPassword: parsed.data.confirmPassword,
      };

      const response =
        mode === 'parent'
          ? await authService.registerParent(payload)
          : await authService.registerBkk(payload);

      Alert.alert(
        'Registrasi Berhasil',
        response.message || 'Akun berhasil dibuat. Silakan login untuk melanjutkan.',
        [{ text: 'Tutup', onPress: onBackToLogin }],
      );
    } catch (error: unknown) {
      Alert.alert('Registrasi Gagal', getApiErrorMessage(error, 'Registrasi akun gagal.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <Feather name="arrow-left" size={16} color={config.accentColor} />
        <Text style={{ color: config.accentColor, fontWeight: '700', marginLeft: 8 }}>Pilih jalur lain</Text>
      </Pressable>

      <SectionHeading title={config.title} subtitle={config.subtitle} />

      <FeatureCards items={config.highlights} />

      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Nama Lengkap"
            icon="user"
            error={errors.name?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Masukkan nama lengkap"
            autoCapitalize="words"
          />
        )}
      />

      <Controller
        control={control}
        name="username"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Username"
            icon="at-sign"
            error={errors.username?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Masukkan username"
            autoCapitalize="none"
          />
        )}
      />

      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Nomor HP"
            icon="phone"
            error={errors.phone?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Masukkan nomor HP aktif"
            autoCapitalize="none"
            keyboardType="phone-pad"
          />
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Email"
            icon="mail"
            error={errors.email?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Email aktif (opsional)"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Password"
            icon="lock"
            error={errors.password?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Minimal 6 karakter"
            autoCapitalize="none"
            secureTextEntry={!showPassword}
            showSecureToggle
            isSecureVisible={showPassword}
            onToggleSecure={() => setShowPassword((prev) => !prev)}
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Konfirmasi Password"
            icon="shield"
            error={errors.confirmPassword?.message}
            value={value}
            onChangeText={onChange}
            placeholder="Ulangi password"
            autoCapitalize="none"
            secureTextEntry={!showConfirmPassword}
            showSecureToggle
            isSecureVisible={showConfirmPassword}
            onToggleSecure={() => setShowConfirmPassword((prev) => !prev)}
          />
        )}
      />

      <Pressable
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
        style={{
          backgroundColor: isSubmitting ? '#fdba74' : config.accentColor,
          paddingVertical: 12,
          borderRadius: 999,
          alignItems: 'center',
          marginTop: 4,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{isSubmitting ? 'Memproses...' : config.submitLabel}</Text>
      </Pressable>

      <BottomAuthLinks onBackToLogin={onBackToLogin} />
    </>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string | string[] }>();
  const { isAuthenticated, isLoading } = useAuth();
  const mode = resolveMode(params.type);

  if (isLoading) return <AppLoadingScreen message="Memuat registrasi..." />;
  if (isAuthenticated) return <Redirect href="/home" />;

  const openMode = (nextMode: RegisterMode) => {
    router.push(`/register?type=${nextMode}`);
  };

  const backToHub = () => {
    router.replace('/register');
  };

  const backToLogin = () => {
    router.replace('/login');
  };

  return (
    <AuthScaffold>
      {mode === 'candidate' ? (
        <CandidateRegisterForm onBack={backToHub} onBackToLogin={backToLogin} />
      ) : mode === 'parent' || mode === 'bkk' ? (
        <AccountRegisterForm mode={mode} onBack={backToHub} onBackToLogin={backToLogin} />
      ) : (
        <RegisterHub onChooseMode={openMode} onBackToLogin={backToLogin} />
      )}
    </AuthScaffold>
  );
}
