import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { getApiErrorMessage } from '../../src/lib/api/errorMessage';
import { authService } from '../../src/features/auth/authService';
import { BRAND_COLORS } from '../../src/config/brand';

const logoSource = require('../../src/assets/logo_sis_kgb2.png');

const registerSchema = z
  .object({
    name: z.string().min(1, 'Nama wajib diisi'),
    username: z.string().min(3, 'Username minimal 3 karakter'),
    password: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterForm>({
    defaultValues: {
      name: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: RegisterForm) => {
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      if (issues.name?.[0]) setError('name', { message: issues.name[0] });
      if (issues.username?.[0]) setError('username', { message: issues.username[0] });
      if (issues.password?.[0]) setError('password', { message: issues.password[0] });
      if (issues.confirmPassword?.[0]) {
        setError('confirmPassword', { message: issues.confirmPassword[0] });
      }
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await authService.registerUmum(parsed.data);
      Alert.alert(
        'Registrasi Berhasil',
        response.message || 'Akun berhasil dibuat. Silakan tunggu verifikasi admin.',
        [{ text: 'Tutup', onPress: () => router.replace('/login') }],
      );
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error, 'Registrasi gagal. Periksa data Anda.');
      Alert.alert('Registrasi Gagal', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <AppLoadingScreen message="Memuat registrasi..." />;
  if (isAuthenticated) return <Redirect href="/home" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BRAND_COLORS.blue }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 58, paddingBottom: 92 }}>
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                marginBottom: 12,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 7 },
                shadowOpacity: 0.24,
                shadowRadius: 12,
                elevation: 12,
              }}
            >
              <Image source={logoSource} style={{ width: 74, height: 74 }} resizeMode="contain" />
            </View>
            <Text style={{ color: '#e0ecff', fontWeight: '700', fontSize: 21, marginBottom: 6 }}>
              Sistem Integrasi Sekolah
            </Text>
            <Text style={{ color: '#dbeafe', fontSize: 14, textAlign: 'center' }}>
              SMKS Karya Guna Bhakti 2
            </Text>
          </View>
        </View>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 222,
            bottom: 0,
            backgroundColor: BRAND_COLORS.white,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: -52,
              left: -20,
              width: 140,
              height: 110,
              borderRadius: 100,
              backgroundColor: '#ebf3ff',
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: -62,
              left: 92,
              width: 170,
              height: 120,
              borderRadius: 100,
              backgroundColor: '#f1f7ff',
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: -46,
              right: -20,
              width: 150,
              height: 100,
              borderRadius: 100,
              backgroundColor: '#ecf4ff',
            }}
          />

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 38, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontSize: 24, fontWeight: '700', marginBottom: 6 }}>
              Buat Akun
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 20 }}>
              Registrasi akun baru lalu tunggu verifikasi admin.
            </Text>

            <Text style={{ fontWeight: '600', marginBottom: 6, color: BRAND_COLORS.textDark }}>Nama</Text>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1.2,
                    borderColor: errors.name ? '#dc2626' : '#cbd5e1',
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
                    placeholder="Masukkan nama lengkap"
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
            {errors.name?.message ? (
              <Text style={{ color: '#dc2626', marginBottom: 8, fontSize: 12 }}>{errors.name.message}</Text>
            ) : (
              <View style={{ marginBottom: 8 }} />
            )}

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
              <Text style={{ color: '#dc2626', marginBottom: 8, fontSize: 12 }}>
                {errors.username.message}
              </Text>
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
                    secureTextEntry
                    placeholder="Masukkan password"
                    placeholderTextColor={BRAND_COLORS.textMuted}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      color: BRAND_COLORS.textDark,
                    }}
                  />
                  <Feather name="eye" size={18} color="#94a3b8" />
                </View>
              )}
            />
            {errors.password?.message ? (
              <Text style={{ color: '#dc2626', marginBottom: 8, fontSize: 12 }}>
                {errors.password.message}
              </Text>
            ) : (
              <View style={{ marginBottom: 8 }} />
            )}

            <Text style={{ fontWeight: '600', marginBottom: 6, color: BRAND_COLORS.textDark }}>
              Konfirmasi Password
            </Text>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, value } }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1.2,
                    borderColor: errors.confirmPassword ? '#dc2626' : '#cbd5e1',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    backgroundColor: '#f8fafc',
                    marginBottom: 4,
                  }}
                >
                  <Feather name="shield" size={18} color="#64748b" />
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry
                    placeholder="Masukkan ulang password"
                    placeholderTextColor={BRAND_COLORS.textMuted}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      color: BRAND_COLORS.textDark,
                    }}
                  />
                  <Feather name="eye" size={18} color="#94a3b8" />
                </View>
              )}
            />
            {errors.confirmPassword?.message ? (
              <Text style={{ color: '#dc2626', marginBottom: 12, fontSize: 12 }}>
                {errors.confirmPassword.message}
              </Text>
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
                {isSubmitting ? 'Memproses...' : 'Daftar'}
              </Text>
            </Pressable>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 14 }}>
              <Text style={{ color: BRAND_COLORS.textMuted }}>Sudah punya akun? </Text>
              <Pressable onPress={() => router.replace('/login')}>
                <Text style={{ color: BRAND_COLORS.pink, fontWeight: '700' }}>Masuk</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}
