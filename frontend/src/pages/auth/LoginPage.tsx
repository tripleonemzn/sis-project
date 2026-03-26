import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import api from '../../services/api';

const schema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

type FormValues = z.infer<typeof schema>;
type SisWindowWithSlideshow = Window & {
  __SIS_SLIDESHOW_SETTINGS__?: {
    slideIntervalMs?: number;
  };
};

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
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [brokenSources, setBrokenSources] = useState<Set<string>>(new Set());
  const [gallery, setGallery] = useState<{ url: string; description: string }[]>([]);
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

  useEffect(() => {
    if (activeDisplaySources.length === 0) return;
    setActiveIndex((prev) => (prev < activeDisplaySources.length ? prev : 0));
  }, [activeDisplaySources.length]);
  
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

  return (
    <div className="auth-font-ui relative min-h-screen w-full overflow-hidden lg:h-screen">
      {/* Lightweight background dengan palet dari logo KGB2 */}
      <div className="absolute inset-0 bg-[#16306f]" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 14% 18%, rgba(116, 195, 192, 0.26) 0%, transparent 46%), radial-gradient(circle at 86% 16%, rgba(243, 191, 36, 0.2) 0%, transparent 42%), radial-gradient(circle at 50% 86%, rgba(255, 0, 119, 0.18) 0%, transparent 48%), linear-gradient(128deg, #17357c 0%, #2f4c9d 48%, #2a7f96 100%)',
        }}
      />
      <div className="auth-grid-fade absolute inset-0 opacity-20" />
      <div className="auth-float-soft absolute -top-24 -left-16 h-80 w-80 rounded-full bg-[#74c3c0]/20 blur-3xl" />
      <div className="auth-float-soft-alt absolute top-16 right-0 h-96 w-96 rounded-full bg-[#f3bf24]/20 blur-3xl" />
      <div className="auth-float-soft absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[#ff0077]/15 blur-3xl [animation-delay:-4s]" />
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
      {/* Overlay tipis agar kontras konten tetap stabil */}
      <div className="absolute inset-0 bg-[#102451]/20" />

      <div className="relative flex min-h-screen flex-col lg:h-screen">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-4 sm:px-6 lg:px-8 lg:py-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(360px,0.98fr)_minmax(0,1.14fr)] lg:items-stretch xl:gap-6">
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
                          className="auth-option-card group flex h-full min-h-[112px] flex-col rounded-2xl border border-slate-200 bg-white px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
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
                        <span className="text-sm text-blue-700">
                          Lupa Password?
                        </span>
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

                <div className="auth-option-card mt-5 rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3">
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
                <div className="mb-4 flex items-start justify-between gap-4 text-white">
                  <div>
                    <p className="auth-kicker text-xs font-semibold uppercase text-white/65">
                      Ruang Informasi
                    </p>
                    <h2 className="auth-font-display mt-2 text-[1.7rem] font-semibold leading-tight xl:text-3xl">
                      Aktivitas sekolah, layanan publik, dan akses dashboard dalam satu pintu.
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-white/18 bg-white/[0.08] px-3 py-2.5 text-right">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/60">Status</p>
                    <p className="mt-1.5 text-sm font-semibold text-white">Portal aktif</p>
                  </div>
                </div>

                <div className="relative flex-1 overflow-hidden rounded-[28px] border border-white/15 shadow-xl">
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

                  <div className="absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(7,24,51,0.14),rgba(7,24,51,0.26),rgba(7,24,51,0.72))]" />

                  <div className="absolute left-4 right-4 top-4 z-30 flex flex-wrap gap-2">
                    {['PPDB', 'Orang Tua', 'BKK'].map((label) => (
                      <span
                        key={label}
                        className="auth-option-card rounded-full border border-white/18 bg-white/[0.12] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/88 backdrop-blur-md"
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-30 p-4">
                    <div className="rounded-[24px] border border-white/18 bg-black/20 p-4 backdrop-blur-md">
                      <p className="auth-kicker text-xs font-semibold uppercase text-white/60">
                        Sorotan
                      </p>
                      <p className="auth-font-display mt-2.5 text-base font-semibold text-white xl:text-lg">
                        {currentSlideDescription || 'Kegiatan SMKS Karya Guna Bhakti 2'}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2.5">
                        {[
                          { value: '3', label: 'Jalur registrasi' },
                          { value: '1', label: 'Portal terintegrasi' },
                          { value: '24/7', label: 'Akses layanan' },
                        ].map((item) => (
                          <div key={item.label} className="auth-option-card rounded-2xl border border-white/12 bg-white/[0.08] px-3 py-2.5 text-white">
                            <p className="auth-font-display text-lg font-semibold xl:text-xl">{item.value}</p>
                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/60">
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

          <div className="mt-4 hidden w-full xl:block">
            <p className="auth-font-display mx-auto max-w-4xl text-center text-sm font-medium italic leading-relaxed text-white/90 drop-shadow-md xl:text-base">
              “Menjadi SMK yang Unggul dalam Membentuk Lulusan Berakhlak Mulia, 
              Kreatif, Kompeten, dan Berkarakter.”
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 pb-2 sm:px-6 lg:px-8 lg:pb-3">
          <p className="text-center text-sm font-medium text-white drop-shadow-md">
            © 2025 Sistem Integrasi Sekolah <span className="mx-2">|</span> SMKS Karya Guna Bhakti 2
          </p>
        </div>
      </div>
    </div>
  );
};
