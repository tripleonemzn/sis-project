import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Apple, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck, User, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import api from '../../services/api';

const schema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

const forgotPasswordRequestSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  email: z.string().email('Masukkan email akun yang valid'),
});

const forgotPasswordResetSchema = z
  .object({
    password: z.string().min(6, 'Password minimal 6 karakter'),
    confirmPassword: z.string().min(6, 'Konfirmasi password minimal 6 karakter'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;
type ForgotPasswordRequestValues = z.infer<typeof forgotPasswordRequestSchema>;
type ForgotPasswordResetValues = z.infer<typeof forgotPasswordResetSchema>;
type SisWindowWithSlideshow = Window & {
  __SIS_SLIDESHOW_SETTINGS__?: {
    slideIntervalMs?: number;
  };
};

type MobileDownloadItem = {
  key: 'android' | 'ios';
  label: string;
  href: string;
  disabled: boolean;
  icon: ReactNode;
};

const AndroidIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M7.4 9.25A1.4 1.4 0 0 0 6 10.65v5.7a1.4 1.4 0 0 0 2.8 0v-5.7a1.4 1.4 0 0 0-1.4-1.4Zm9.2 0a1.4 1.4 0 0 0-1.4 1.4v5.7a1.4 1.4 0 1 0 2.8 0v-5.7a1.4 1.4 0 0 0-1.4-1.4ZM9.08 9.25h5.84c1.08 0 1.95.87 1.95 1.95v5.44A1.86 1.86 0 0 1 15 18.5v1.7a1.25 1.25 0 0 1-2.5 0v-1.56h-1v1.56a1.25 1.25 0 0 1-2.5 0v-1.7a1.86 1.86 0 0 1-1.87-1.86V11.2c0-1.08.87-1.95 1.95-1.95Z"
      fill="currentColor"
    />
    <path
      d="M9.44 6.63 8.3 4.72m6.26 1.91 1.14-1.91M8.6 7.88a5 5 0 0 1 6.8 0"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <circle cx="10.2" cy="7.65" r=".5" fill="currentColor" />
    <circle cx="13.8" cy="7.65" r=".5" fill="currentColor" />
  </svg>
);

const formatPhotoDescription = (raw?: string) => {
  if (!raw) return '';
  const separator = '->';
  if (raw.includes(separator)) {
    const parts = raw.split(separator);
    return parts.slice(1).join(separator).trim();
  }
  return raw.trim();
};

const normalizeGalleryImageUrl = (rawUrl: string, assetBase: string) => {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;

  const normalized = value.startsWith('/') ? value : `/${value}`;
  if (normalized.startsWith('/api/')) return normalized;

  // Legacy source compatibility: always route gallery photos through backend static handler.
  if (normalized.startsWith('/foto_kegiatan/')) return `/api${normalized}`;
  if (normalized.includes('/foto_kegiatan/')) {
    return `/api${normalized.slice(normalized.indexOf('/foto_kegiatan/'))}`;
  }

  const base = assetBase.endsWith('/') ? assetBase.slice(0, -1) : assetBase;
  return `${base}${normalized}`;
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [brokenSources, setBrokenSources] = useState<Set<string>>(new Set());
  const [gallery, setGallery] = useState<{ url: string; description: string }[]>([]);
  const [isRecoveryTokenValidating, setIsRecoveryTokenValidating] = useState(false);
  const [recoveryRequestSubmitted, setRecoveryRequestSubmitted] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState('');
  const [recoveryExpiresAt, setRecoveryExpiresAt] = useState('');
  const [recoveryContactHint, setRecoveryContactHint] = useState('');
  const [recoveryChannel, setRecoveryChannel] = useState<'EMAIL' | 'CONTACT'>('EMAIL');
  const assetBase = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const port = window.location.port;
    const host = window.location.hostname;
    if (port === '5173' || port === '4173') return `http://${host}:3000`;
    return '/api';
  }, []);
  const normalizedGalleryItems = useMemo(
    () =>
      gallery
        .map((item) => ({
          src: normalizeGalleryImageUrl(item.url, assetBase),
          description: formatPhotoDescription(item.description || ''),
        }))
        .filter((item) => item.src.length > 0),
    [gallery, assetBase],
  );
  const activeDisplayItems = useMemo(() => {
    const seen = new Set<string>();
    return normalizedGalleryItems.filter((item) => {
      if (!item.src || brokenSources.has(item.src) || seen.has(item.src)) return false;
      seen.add(item.src);
      return true;
    });
  }, [normalizedGalleryItems, brokenSources]);
  const activeDisplaySources = useMemo(
    () => activeDisplayItems.map((item) => item.src),
    [activeDisplayItems],
  );
  const publicRegisterOptions = useMemo(
    () => [
      {
        title: 'Calon Siswa',
        description: 'PPDB dan tes seleksi',
        to: '/register/candidate',
        accent: 'bg-sky-100 text-sky-700',
      },
      {
        title: 'Orang Tua',
        description: 'Satu akun keluarga',
        to: '/register/parent',
        accent: 'bg-emerald-100 text-emerald-700',
      },
      {
        title: 'BKK / Pelamar',
        description: 'Lowongan dan lamaran',
        to: '/register/bkk',
        accent: 'bg-amber-100 text-amber-700',
      },
    ],
    [],
  );
  const mobileDownloadItems = useMemo<MobileDownloadItem[]>(
    () => [
      {
        key: 'android',
        label: 'Download Android App',
        href:
          import.meta.env.VITE_ANDROID_APP_DOWNLOAD_URL?.trim() ||
          'https://expo.dev/artifacts/eas/kfjvxLowu5X6ejdFmN8Ypd.apk',
        disabled: false,
        icon: <AndroidIcon className="h-[1.15rem] w-[1.15rem]" />,
      },
      {
        key: 'ios',
        label: 'Download iOS App',
        href: import.meta.env.VITE_IOS_APP_DOWNLOAD_URL?.trim() || '',
        disabled: !import.meta.env.VITE_IOS_APP_DOWNLOAD_URL?.trim(),
        icon: <Apple className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.1} />,
      },
    ],
    [],
  );

  // Fallback visual saat semua sumber gambar gagal
  const slides = useMemo(
    () => [
      'linear-gradient(140deg, rgba(96,165,250,.9) 0%, rgba(56,189,248,.8) 42%, rgba(45,212,191,.9) 100%)',
      'linear-gradient(128deg, rgba(99,102,241,.9) 0%, rgba(59,130,246,.8) 48%, rgba(56,189,248,.9) 100%)',
      'linear-gradient(132deg, rgba(45,212,191,.9) 0%, rgba(56,189,248,.8) 52%, rgba(59,130,246,.9) 100%)',
    ],
    []
  );
  const slideCount = activeDisplaySources.length > 0 ? activeDisplaySources.length : slides.length;
  const displayedIndex = slideCount > 0 ? activeIndex % slideCount : 0;
  const currentSlideDescription = activeDisplayItems[displayedIndex]?.description?.trim() || '';

  // Fetch gallery items from backend
  useEffect(() => {
    api
      .get<{ data: { url: string; description: string }[] }>('/public/foto-kegiatan')
      .then((res) => setGallery(res.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (slideCount <= 1) return;

    const defaultMs = 3500;
    const intervalMs = (() => {
      const raw = (window as SisWindowWithSlideshow)?.__SIS_SLIDESHOW_SETTINGS__?.slideIntervalMs;
      if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
      return defaultMs;
    })();

    const intervalId = window.setInterval(() => {
      setActiveIndex((prev) => (prev >= slideCount - 1 ? 0 : prev + 1));
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [slideCount]);

  // Preload images agar tidak delay saat transisi
  useEffect(() => {
    if (activeDisplaySources.length > 0) {
      activeDisplaySources.forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    }
  }, [activeDisplaySources]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const {
    register: registerRecoveryRequest,
    handleSubmit: handleRecoveryRequestSubmit,
    reset: resetRecoveryRequestForm,
    formState: {
      errors: recoveryRequestErrors,
      isSubmitting: isRecoveryRequestSubmitting,
    },
  } = useForm<ForgotPasswordRequestValues>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: {
      username: '',
      email: '',
    },
  });
  const {
    register: registerRecoveryReset,
    handleSubmit: handleRecoveryResetSubmit,
    reset: resetRecoveryResetForm,
    formState: {
      errors: recoveryResetErrors,
      isSubmitting: isRecoveryResetSubmitting,
    },
  } = useForm<ForgotPasswordResetValues>({
    resolver: zodResolver(forgotPasswordResetSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const recoveryExpiryLabel = useMemo(() => {
    if (!recoveryExpiresAt) return '';
    const parsed = new Date(recoveryExpiresAt);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [recoveryExpiresAt]);
  const recoveryTokenFromUrl = searchParams.get('resetToken')?.trim() || '';

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await authService.login(values.username, values.password);
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      
      // Update React Query Cache immediately to prevent redirect loop
      const apiResponse = { 
        data: user, 
        success: true, 
        message: 'Login success', 
        statusCode: 200 
      };
      
      queryClient.setQueryData(['me'], apiResponse);
      queryClient.setQueryData(['auth-me'], apiResponse);

      toast.success('Berhasil masuk');

      switch (user.role) {
        case 'ADMIN':
          navigate('/admin', { replace: true });
          break;
        case 'TEACHER':
          navigate('/teacher', { replace: true });
          break;
        case 'EXAMINER':
          navigate('/examiner', { replace: true });
          break;
        case 'STUDENT':
          navigate('/student', { replace: true });
          break;
        case 'PRINCIPAL':
          navigate('/principal', { replace: true });
          break;
        case 'STAFF':
          navigate('/staff', { replace: true });
          break;
        case 'PARENT':
          navigate('/parent', { replace: true });
          break;
        case 'EXTRACURRICULAR_TUTOR':
          navigate('/tutor', { replace: true });
          break;
        default:
          navigate('/', { replace: true });
      }
    } catch (e: unknown) {
      let msg = 'Gagal masuk. Periksa kembali username/password.';
      if (isAxiosError(e)) {
        msg = e.response?.data?.message ?? e.message ?? msg;
      } else if (e instanceof Error) {
        msg = e.message || msg;
      } else if (typeof e === 'string') {
        msg = e;
      }
      toast.error(msg);
    }
  };

  const clearRecoverySearchParam = () => {
    if (!recoveryTokenFromUrl) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('resetToken');
    setSearchParams(nextParams, { replace: true });
  };

  const openRecoveryModal = () => {
    setIsRecoveryOpen(true);
  };

  const closeRecoveryModal = () => {
    setIsRecoveryOpen(false);
    setIsRecoveryTokenValidating(false);
    setRecoveryRequestSubmitted(false);
    setRecoveryToken('');
    setRecoveryExpiresAt('');
    setRecoveryContactHint('');
    setRecoveryChannel('EMAIL');
    clearRecoverySearchParam();
    resetRecoveryRequestForm({
      username: '',
      email: '',
    });
    resetRecoveryResetForm({
      password: '',
      confirmPassword: '',
    });
  };

  useEffect(() => {
    let active = true;

    if (!recoveryTokenFromUrl) {
      return () => {
        active = false;
      };
    }

    setIsRecoveryOpen(true);
    setIsRecoveryTokenValidating(true);
    setRecoveryRequestSubmitted(false);
    setRecoveryToken('');
    setRecoveryExpiresAt('');
    setRecoveryContactHint('');
    setRecoveryChannel('EMAIL');
    authService
      .validateForgotPasswordToken(recoveryTokenFromUrl)
      .then((response) => {
        if (!active) return;
        setRecoveryToken(recoveryTokenFromUrl);
        setRecoveryExpiresAt(response.data.expiresAt);
        setRecoveryContactHint(response.data.contactHint || '');
        setRecoveryChannel(response.data.channel || 'EMAIL');
        resetRecoveryResetForm({
          password: '',
          confirmPassword: '',
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        let message = 'Link reset password tidak dapat digunakan.';
        if (isAxiosError(error)) {
          message = error.response?.data?.message ?? error.message ?? message;
        } else if (error instanceof Error) {
          message = error.message || message;
        }
        clearRecoverySearchParam();
        toast.error(message);
      })
      .finally(() => {
        if (!active) return;
        setIsRecoveryTokenValidating(false);
      });

    return () => {
      active = false;
    };
  }, [recoveryTokenFromUrl, resetRecoveryResetForm]);

  const handleRequestRecoveryLink = async (values: ForgotPasswordRequestValues) => {
    try {
      const response = await authService.requestForgotPassword({
        username: values.username.trim(),
        email: values.email.trim(),
      });

      setRecoveryRequestSubmitted(true);
      setRecoveryToken('');
      setRecoveryExpiresAt('');
      setRecoveryContactHint(response.data.contactHint || values.email.trim());
      setRecoveryChannel(response.data.channel || 'EMAIL');
      resetRecoveryResetForm({
        password: '',
        confirmPassword: '',
      });
      toast.success(response.message || 'Link reset password sudah dikirim');
    } catch (error: unknown) {
      let message = 'Permintaan link reset password gagal diproses.';
      if (isAxiosError(error)) {
        message = error.response?.data?.message ?? error.message ?? message;
      } else if (error instanceof Error) {
        message = error.message || message;
      }
      toast.error(message);
    }
  };

  const handleResetRecoveredPassword = async (values: ForgotPasswordResetValues) => {
    try {
      const response = await authService.resetForgotPassword({
        token: recoveryToken,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      toast.success(response.message || 'Password berhasil diperbarui');
      closeRecoveryModal();
    } catch (error: unknown) {
      let message = 'Reset password gagal diproses.';
      if (isAxiosError(error)) {
        message = error.response?.data?.message ?? error.message ?? message;
      } else if (error instanceof Error) {
        message = error.message || message;
      }
      toast.error(message);
    }
  };

  return (
    <div className="auth-font-ui relative min-h-screen w-full overflow-hidden lg:h-screen">
      {/* Blue glass background dengan aksen hidup dari palet logo KGB2 */}
      <div className="absolute inset-0 bg-[#173a88]" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 14% 18%, rgba(116, 195, 192, 0.24) 0%, transparent 42%), radial-gradient(circle at 86% 16%, rgba(243, 191, 36, 0.16) 0%, transparent 34%), radial-gradient(circle at 50% 86%, rgba(93, 176, 255, 0.2) 0%, transparent 44%), linear-gradient(132deg, #173a88 0%, #2b5fad 46%, #1e8da4 100%)',
        }}
      />
      <div className="auth-grid-fade absolute inset-0 opacity-18" />
      <div className="auth-float-soft absolute -top-24 -left-16 h-80 w-80 rounded-full bg-[#74c3c0]/20 blur-3xl" />
      <div className="auth-float-soft-alt absolute top-10 right-[-3rem] h-96 w-96 rounded-full bg-[#f3bf24]/16 blur-3xl" />
      <div className="auth-float-soft absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[#68b7ff]/18 blur-3xl [animation-delay:-4s]" />
      <div className="pointer-events-none select-none absolute inset-0">
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute -left-8 top-[8%] w-24 rotate-[-10deg] object-contain opacity-[0.14] sm:w-28 md:w-36 lg:w-40"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-[9%] left-[5%] w-40 rotate-[8deg] object-contain opacity-[0.12] sm:w-48 md:w-64 lg:w-72"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 w-[min(48vw,620px)] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.1]"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute -right-8 top-[10%] w-48 rotate-[12deg] object-contain opacity-[0.12] sm:w-56 md:w-72 lg:w-[22rem]"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-[12%] right-[5%] w-20 rotate-[-9deg] object-contain opacity-[0.12] sm:w-24 md:w-32 lg:w-36"
        />
      </div>
      <div className="absolute inset-0 bg-[rgba(7,18,45,0.1)]" />

      <div className="relative flex min-h-screen flex-col lg:h-screen">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-3 sm:px-6 lg:px-8 lg:py-3">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(360px,0.98fr)_minmax(0,1.14fr)] lg:items-stretch xl:gap-5">
            <div className="order-2 lg:order-1">
              <div className="auth-panel-soft auth-reveal-up flex h-full min-h-[320px] flex-col justify-between rounded-[28px] p-4 sm:p-6 lg:min-h-[560px] lg:p-6 xl:min-h-[620px] xl:p-7">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-[20px] border border-slate-200 bg-white p-2.5 shadow-sm">
                      <img
                        src="/logo_sis_kgb2.png"
                        alt="Logo Sekolah"
                        className="h-12 w-12 object-contain"
                      />
                    </div>
                    <div>
                      <p className="auth-kicker text-xs font-semibold uppercase text-[#1b6d99]">
                        Portal Masuk
                      </p>
                      <h1 className="auth-font-display mt-1.5 text-xl font-semibold text-slate-900 sm:text-2xl">
                        Sistem Integrasi Sekolah
                      </h1>
                      <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm">
                        SMKS Karya Guna Bhakti 2
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
                    {['PPDB', 'Orang Tua', 'BKK'].map((chip) => (
                      <span
                        key={chip}
                        className="auth-utility-chip rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="auth-section-card mt-5 rounded-[24px] p-4 lg:p-5">
                    <p className="text-sm leading-6 text-slate-600">
                      Masuk ke dashboard sekolah sesuai peran Anda. Untuk pendaftaran publik, gunakan jalur register yang sudah dipisah agar proses calon siswa, orang tua, dan BKK tidak tercampur.
                    </p>
                    <div className="mt-3 grid auto-rows-fr gap-2.5 sm:grid-cols-3">
                      {publicRegisterOptions.map((option) => (
                        <Link
                          key={option.to}
                          to={option.to}
                          className="auth-option-card auth-frost-tile group flex h-full min-h-[112px] flex-col rounded-2xl px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-white/90 hover:shadow-sm"
                        >
                          <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${option.accent}`}>
                            {option.title}
                          </span>
                          <span className="mt-2.5 flex-1 text-[13px] leading-5 text-slate-600">
                            {option.description}
                          </span>
                          <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Buka jalur
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700">
                        Username
                      </label>
                      <div className="auth-field-shell relative rounded-xl">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                          <User size={18} />
                        </span>
                        <input
                          id="username"
                          type="text"
                          autoComplete="username"
                          className="auth-field-input rounded-xl py-2.5 pl-10 pr-3"
                          placeholder="Masukkan username"
                          {...register('username')}
                        />
                      </div>
                      {errors.username && (
                        <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={openRecoveryModal}
                          className="text-sm font-medium text-blue-700 transition hover:text-blue-800 hover:underline"
                        >
                          Lupa Password?
                        </button>
                      </div>
                      <div className="auth-field-shell relative rounded-xl">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                          <Lock size={18} />
                        </span>
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          className="auth-field-input rounded-xl py-2.5 pl-10 pr-10"
                          placeholder="Masukkan password"
                          {...register('password')}
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-800"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="auth-primary-button w-full rounded-xl bg-[#143a88] py-2.5 text-white shadow-[0_18px_36px_rgba(20,58,136,0.24)] hover:bg-[#0f2f6e] hover:shadow-[0_22px_42px_rgba(20,58,136,0.34)] disabled:opacity-60"
                    >
                      {isSubmitting ? 'Memproses...' : 'Masuk'}
                    </button>
                  </form>
                </div>

                <div className="auth-option-card auth-frost-tile mt-5 rounded-[22px] px-4 py-3">
                  <p className="text-center text-sm text-slate-600">
                    Belum punya akun?{' '}
                    <Link to="/register" className="font-semibold text-blue-700 hover:text-blue-800 hover:underline">
                      Daftar di sini
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            <div className="order-1 hidden lg:block">
              <div className="auth-panel-dark auth-reveal-up auth-reveal-up-delay-1 flex h-full min-h-[560px] flex-col rounded-[28px] p-5 xl:min-h-[620px] xl:p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="auth-kicker text-xs font-semibold uppercase text-slate-500">
                      Ruang Informasi
                    </p>
                    <h2 className="auth-font-display mt-2 text-[1.7rem] font-semibold leading-tight text-slate-900 xl:text-3xl">
                      Aktivitas sekolah, layanan publik, dan akses dashboard dalam satu pintu.
                    </h2>
                  </div>
                  <div className="auth-frost-tile rounded-2xl px-3 py-2.5 text-right">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Status</p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">Portal aktif</p>
                  </div>
                </div>

                <div className="relative flex-1 overflow-hidden rounded-[28px] border border-white/50 shadow-[0_24px_56px_rgba(15,23,42,0.16)]">
                  {activeDisplaySources.length > 0
                    ? activeDisplaySources.map((src, idx) => (
                        <img
                          key={`${src}-${idx}`}
                          src={src}
                          alt={activeDisplayItems[idx]?.description || 'Foto kegiatan'}
                          className="absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out"
                          style={{
                            opacity: idx === displayedIndex ? 1 : 0,
                            zIndex: idx === displayedIndex ? 10 : 0,
                            transitionDuration: '700ms',
                          }}
                          onError={() => {
                            setBrokenSources((prev) => {
                              if (prev.has(src)) return prev;
                              const next = new Set(prev);
                              next.add(src);
                              return next;
                            });
                          }}
                        />
                      ))
                    : slides.map((cls, idx) => (
                        <div
                          key={idx}
                          className="absolute inset-0 transition-opacity ease-in-out"
                          style={{
                            backgroundImage: cls,
                            opacity: idx === displayedIndex ? 1 : 0,
                            zIndex: idx === displayedIndex ? 10 : 0,
                            transitionDuration: '700ms',
                          }}
                        />
                      ))}

                  <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.06),rgba(15,23,42,0.2))]" />

                  <div className="absolute left-4 right-4 top-4 z-30 flex flex-wrap gap-2">
                    {['PPDB', 'Orang Tua', 'BKK'].map((label) => (
                      <span
                        key={label}
                        className="auth-option-card auth-frost-tile rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-30 p-4">
                    <div className="auth-option-card auth-frost-tile rounded-[24px] p-4">
                      <p className="auth-kicker text-xs font-semibold uppercase text-slate-500">
                        Sorotan
                      </p>
                      <p className="auth-font-display mt-2.5 text-base font-semibold text-slate-900 xl:text-lg">
                        {currentSlideDescription || 'Kegiatan SMKS Karya Guna Bhakti 2'}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2.5">
                        {[
                          { value: '3', label: 'Jalur registrasi' },
                          { value: '1', label: 'Portal terintegrasi' },
                          { value: '24/7', label: 'Akses layanan' },
                        ].map((item) => (
                          <div key={item.label} className="auth-option-card auth-frost-tile-muted rounded-2xl px-3 py-2.5 text-slate-900">
                            <p className="auth-font-display text-lg font-semibold xl:text-xl">{item.value}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {item.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 hidden w-full xl:block">
            <p className="auth-font-display mx-auto max-w-4xl text-center text-sm font-medium italic leading-relaxed text-white/90 drop-shadow-md xl:text-base">
              “Menjadi SMK yang Unggul dalam Membentuk Lulusan Berakhlak Mulia, 
              Kreatif, Kompeten, dan Berkarakter.”
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 pb-2 sm:px-6 lg:px-8 lg:pb-2">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-2.5 rounded-full border border-white/16 bg-white/10 px-3 py-1.5 backdrop-blur-md">
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70 sm:inline">
                Download Mobile Apps
              </span>
              <div className="flex items-center gap-2">
                {mobileDownloadItems.map((item) =>
                  item.disabled ? (
                    <span
                      key={item.key}
                      title={`${item.label} belum tersedia`}
                      aria-label={`${item.label} belum tersedia`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/45"
                    >
                      {item.icon}
                    </span>
                  ) : (
                    <a
                      key={item.key}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      title={item.label}
                      aria-label={item.label}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/16 bg-white/12 text-white shadow-[0_10px_20px_rgba(5,15,40,0.16)] transition hover:-translate-y-0.5 hover:bg-white/18 hover:text-white"
                    >
                      {item.icon}
                    </a>
                  ),
                )}
              </div>
            </div>

            <p className="text-center text-[11px] font-normal leading-6 text-white/92 drop-shadow-md sm:text-sm">
              © 2025 JHA Teknologi Solusi. All rights reserved. <span className="mx-2 text-white/70">|</span>{' '}
              Licensed to SMKS Karya Guna Bhakti 2 for use only.
            </p>
          </div>
        </div>
      </div>

      {isRecoveryOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="auth-panel-soft w-full max-w-xl rounded-[32px] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="auth-kicker text-xs font-semibold uppercase text-[#1b6d99]">
                  Pemulihan Akun
                </p>
                <h2 className="auth-font-display mt-2 text-2xl font-semibold text-slate-900">
                  {isRecoveryTokenValidating
                    ? 'Memeriksa link reset'
                    : recoveryToken
                      ? 'Buat password baru'
                      : recoveryRequestSubmitted
                        ? 'Cek email Anda'
                        : 'Lupa password'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {isRecoveryTokenValidating
                    ? 'Tunggu sebentar, kami sedang memastikan link reset password ini masih aktif.'
                    : recoveryToken
                      ? 'Password lama tidak diperlukan lagi. Buat password baru melalui link reset yang Anda buka dari email.'
                      : recoveryRequestSubmitted
                        ? 'Jika data akun cocok, link reset password sudah dikirim ke email terdaftar. Silakan buka inbox atau folder spam.'
                        : 'Masukkan username dan email yang tersimpan di akun. Sistem akan mengirim link reset password langsung ke email tersebut.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRecoveryModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-500 transition hover:bg-white hover:text-slate-700"
                aria-label="Tutup modal pemulihan akun"
              >
                <X size={18} />
              </button>
            </div>

            {isRecoveryTokenValidating ? (
              <div className="auth-section-card mt-5 rounded-[24px] p-5">
                <div className="flex items-start gap-3">
                  <div className="auth-frost-tile inline-flex rounded-2xl p-3 text-sky-700">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      Memvalidasi link reset password
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Link dari email sedang diperiksa. Setelah valid, form password baru akan muncul otomatis.
                    </p>
                  </div>
                </div>
              </div>
            ) : recoveryToken ? (
              <>
                <div className="auth-section-card mt-5 rounded-[24px] p-4">
                  <div className="flex items-start gap-3">
                    <div className="auth-frost-tile inline-flex rounded-2xl p-3 text-sky-700">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        Link reset password aktif
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {recoveryContactHint
                          ? `Email tujuan: ${recoveryContactHint}.`
                          : 'Link ini terkait dengan email pemulihan akun Anda.'}
                        {recoveryExpiryLabel ? ` Sesi ini aktif sampai ${recoveryExpiryLabel}.` : ''}
                      </p>
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        Kanal verifikasi: {recoveryChannel === 'EMAIL' ? 'Email' : 'Kontak akun'}
                      </p>
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={handleRecoveryResetSubmit(handleResetRecoveredPassword)}
                  className="mt-5 space-y-4"
                >
                  <div>
                    <label htmlFor="recovery-password" className="mb-1 block text-sm font-medium text-slate-700">
                      Password Baru
                    </label>
                    <div className="auth-field-shell relative rounded-xl">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        <KeyRound size={18} />
                      </span>
                      <input
                        id="recovery-password"
                        type="password"
                        autoComplete="new-password"
                        className="auth-field-input rounded-xl py-2.5 pl-10 pr-3"
                        placeholder="Minimal 6 karakter"
                        {...registerRecoveryReset('password')}
                      />
                    </div>
                    {recoveryResetErrors.password ? (
                      <p className="mt-1 text-sm text-red-600">{recoveryResetErrors.password.message}</p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="recovery-confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
                      Konfirmasi Password Baru
                    </label>
                    <div className="auth-field-shell relative rounded-xl">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        <KeyRound size={18} />
                      </span>
                      <input
                        id="recovery-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        className="auth-field-input rounded-xl py-2.5 pl-10 pr-3"
                        placeholder="Ulangi password baru"
                        {...registerRecoveryReset('confirmPassword')}
                      />
                    </div>
                    {recoveryResetErrors.confirmPassword ? (
                      <p className="mt-1 text-sm text-red-600">{recoveryResetErrors.confirmPassword.message}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        clearRecoverySearchParam();
                        setRecoveryRequestSubmitted(false);
                        setRecoveryToken('');
                        setRecoveryExpiresAt('');
                        setRecoveryContactHint('');
                        setRecoveryChannel('EMAIL');
                        resetRecoveryResetForm({
                          password: '',
                          confirmPassword: '',
                        });
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                    >
                      Minta link baru
                    </button>
                    <button
                      type="submit"
                      disabled={isRecoveryResetSubmitting}
                      className="auth-primary-button inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#143a88] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(20,58,136,0.24)] hover:bg-[#0f2f6e] disabled:opacity-60"
                    >
                      {isRecoveryResetSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {isRecoveryResetSubmitting ? 'Menyimpan...' : 'Simpan password baru'}
                    </button>
                  </div>
                </form>
              </>
            ) : recoveryRequestSubmitted ? (
              <>
                <div className="auth-section-card mt-5 rounded-[24px] p-4">
                  <div className="flex items-start gap-3">
                    <div className="auth-frost-tile inline-flex rounded-2xl p-3 text-sky-700">
                      <Mail size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        Permintaan reset sudah diterima
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {recoveryContactHint
                          ? `Jika data akun cocok, link reset dikirim ke ${recoveryContactHint}.`
                          : 'Jika data akun cocok, link reset sudah dikirim ke email terdaftar.'}{' '}
                        Buka inbox atau folder spam, lalu klik link yang diterima.
                      </p>
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        Tipe pemulihan: Email otomatis
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryRequestSubmitted(false);
                      setRecoveryContactHint('');
                      setRecoveryChannel('EMAIL');
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                  >
                    Ganti username/email
                  </button>
                  <button
                    type="button"
                    onClick={closeRecoveryModal}
                    className="auth-primary-button inline-flex flex-1 items-center justify-center rounded-xl bg-[#143a88] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(20,58,136,0.24)] hover:bg-[#0f2f6e]"
                  >
                    Tutup
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={handleRecoveryRequestSubmit(handleRequestRecoveryLink)}
                className="mt-5 space-y-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="recovery-username" className="mb-1 block text-sm font-medium text-slate-700">
                      Username
                    </label>
                    <div className="auth-field-shell relative rounded-xl">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        <User size={18} />
                      </span>
                      <input
                        id="recovery-username"
                        type="text"
                        autoComplete="username"
                        className="auth-field-input rounded-xl py-2.5 pl-10 pr-3"
                        placeholder="Masukkan username"
                        {...registerRecoveryRequest('username')}
                      />
                    </div>
                    {recoveryRequestErrors.username ? (
                      <p className="mt-1 text-sm text-red-600">{recoveryRequestErrors.username.message}</p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="recovery-email" className="mb-1 block text-sm font-medium text-slate-700">
                      Email Akun
                    </label>
                    <div className="auth-field-shell relative rounded-xl">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        <Mail size={18} />
                      </span>
                      <input
                        id="recovery-email"
                        type="email"
                        autoComplete="email"
                        className="auth-field-input rounded-xl py-2.5 pl-10 pr-3"
                        placeholder="Masukkan email yang tersimpan di akun"
                        {...registerRecoveryRequest('email')}
                      />
                    </div>
                    {recoveryRequestErrors.email ? (
                      <p className="mt-1 text-sm text-red-600">{recoveryRequestErrors.email.message}</p>
                    ) : null}
                  </div>
                </div>

                <div className="auth-section-card rounded-[24px] p-4">
                  <p className="text-sm leading-6 text-slate-600">
                    Link reset hanya dikirim ke email yang memang tersimpan di akun. Jika akun lama belum memiliki email aktif, pemulihan mandiri belum bisa digunakan dan perlu dibantu admin.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isRecoveryRequestSubmitting}
                  className="auth-primary-button inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#143a88] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(20,58,136,0.24)] hover:bg-[#0f2f6e] disabled:opacity-60"
                >
                  {isRecoveryRequestSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isRecoveryRequestSubmitting ? 'Mengirim link...' : 'Kirim link reset ke email'}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
