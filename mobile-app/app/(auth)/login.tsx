import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { getApiErrorMessage } from '../../src/lib/api/errorMessage';
import { BRAND_COLORS } from '../../src/config/brand';

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, restoreError, rehydrate } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginForm) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      if (issues.username?.[0]) setError('username', { message: issues.username[0] });
      if (issues.password?.[0]) setError('password', { message: issues.password[0] });
      return;
    }

    try {
      setIsSubmitting(true);
      await login(parsed.data);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Masuk berhasil', ToastAndroid.SHORT);
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Masuk gagal. Periksa akun Anda.');
      Alert.alert('Masuk Gagal', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <AppLoadingScreen message="Memulihkan sesi..." />;
  if (isAuthenticated) return <Redirect href="/home" />;

  return (
    <AuthScaffold>
      <Text
        style={{
          color: BRAND_COLORS.textDark,
          fontSize: 24,
          fontWeight: '700',
          marginBottom: 6,
          textAlign: 'center',
        }}
      >
        Silahkan masuk untuk melanjutkan
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 20, textAlign: 'center' }}>
        Masuk menggunakan akun Anda!
      </Text>

      {restoreError ? (
        <View
          style={{
            backgroundColor: '#fee2e2',
            borderColor: '#fca5a5',
            borderWidth: 1,
            borderRadius: 10,
            padding: 10,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#991b1b', fontSize: 12, marginBottom: 10 }}>{restoreError}</Text>
          <Pressable
            onPress={() => rehydrate()}
            style={{
              backgroundColor: '#b91c1c',
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Coba Pulihkan Sesi</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={{ fontWeight: '600', marginBottom: 6, color: BRAND_COLORS.textDark }}>Username</Text>
      <Controller
        control={control}
        name="username"
        render={({ field: { onChange, value } }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1.2,
              borderColor: errors.username ? '#dc2626' : '#cbd5e1',
              borderRadius: 12,
              paddingHorizontal: 12,
              backgroundColor: '#f8fafc',
              marginBottom: 4,
            }}
          >
            <Feather name="user" size={18} color="#64748b" />
            <TextInput
              value={value}
              onChangeText={onChange}
              autoCapitalize="none"
              placeholder="Masukkan username"
              placeholderTextColor={BRAND_COLORS.textMuted}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 10,
                color: BRAND_COLORS.textDark,
              }}
            />
          </View>
        )}
      />
      {errors.username?.message ? (
        <Text style={{ color: '#dc2626', marginBottom: 8, fontSize: 12 }}>{errors.username.message}</Text>
      ) : (
        <View style={{ marginBottom: 8 }} />
      )}

      <Text style={{ fontWeight: '600', marginBottom: 6, color: BRAND_COLORS.textDark }}>Password</Text>
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1.2,
              borderColor: errors.password ? '#dc2626' : '#cbd5e1',
              borderRadius: 12,
              paddingHorizontal: 12,
              backgroundColor: '#f8fafc',
              marginBottom: 4,
            }}
          >
            <Feather name="lock" size={18} color="#64748b" />
            <TextInput
              value={value}
              onChangeText={onChange}
              secureTextEntry={!showPassword}
              placeholder="Masukkan password"
              placeholderTextColor={BRAND_COLORS.textMuted}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 10,
                color: BRAND_COLORS.textDark,
              }}
            />
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94a3b8" />
            </Pressable>
          </View>
        )}
      />
      {errors.password?.message ? (
        <Text style={{ color: '#dc2626', marginBottom: 12, fontSize: 12 }}>{errors.password.message}</Text>
      ) : (
        <View style={{ marginBottom: 12 }} />
      )}

      <Pressable
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
        style={{
          backgroundColor: isSubmitting ? '#93c5fd' : BRAND_COLORS.blue,
          paddingVertical: 12,
          borderRadius: 999,
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {isSubmitting ? 'Memproses...' : 'Masuk'}
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 14 }}>
        <Text style={{ color: BRAND_COLORS.textMuted }}>Belum punya akun? </Text>
        <Pressable onPress={() => router.replace('/register')}>
          <Text style={{ color: BRAND_COLORS.pink, fontWeight: '700' }}>Daftar</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}
