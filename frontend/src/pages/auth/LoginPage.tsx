import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Lightweight background dengan palet dari logo KGB2 */}
      <div className="absolute inset-0 bg-[#16306f]" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 14% 18%, rgba(116, 195, 192, 0.26) 0%, transparent 46%), radial-gradient(circle at 86% 16%, rgba(243, 191, 36, 0.2) 0%, transparent 42%), radial-gradient(circle at 50% 86%, rgba(255, 0, 119, 0.18) 0%, transparent 48%), linear-gradient(128deg, #17357c 0%, #2f4c9d 48%, #2a7f96 100%)',
        }}
      />
      <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-[#74c3c0]/20 blur-3xl" />
      <div className="absolute top-16 right-0 h-96 w-96 rounded-full bg-[#f3bf24]/20 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-[#ff0077]/15 blur-3xl" />
      <div className="pointer-events-none select-none absolute inset-0">
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute -left-8 top-[8%] w-24 sm:w-28 md:w-36 lg:w-40 object-contain opacity-20 rotate-[-10deg]"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute left-[5%] bottom-[9%] w-40 sm:w-48 md:w-64 lg:w-72 object-contain opacity-20 rotate-[8deg]"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 w-[min(48vw,620px)] -translate-x-1/2 -translate-y-1/2 object-contain opacity-20"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute -right-8 top-[10%] w-48 sm:w-56 md:w-72 lg:w-[22rem] object-contain opacity-20 rotate-[12deg]"
        />
        <img
          src="/logo_sis_kgb2.png"
          alt=""
          aria-hidden="true"
          className="absolute right-[5%] bottom-[12%] w-20 sm:w-24 md:w-32 lg:w-36 object-contain opacity-20 rotate-[-9deg]"
        />
      </div>
      {/* Overlay tipis agar kontras konten tetap stabil */}
      <div className="absolute inset-0 bg-[#102451]/20" />

      <div className="relative flex min-h-screen flex-col">
        <div className="flex-1 container mx-auto px-4 py-2 flex flex-col justify-center">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
            <div className="md:col-span-2 flex items-center justify-end">
              <div className="w-full max-w-md h-[520px] flex items-center">
                <div className="w-full h-full rounded-2xl bg-white/80 backdrop-blur-xl shadow-xl border border-white/40 p-8">
                  <div className="flex flex-col items-center mb-6">
                    <img
                      src="/logo_sis_kgb2.png"
                      alt="Logo Sekolah"
                      className="h-16 w-16 mb-3 object-contain"
                    />
                    <h1 className="text-2xl font-semibold text-blue-700 text-center">
                      Sistem Integrasi Sekolah
                    </h1>
                    <p className="mt-1 text-base font-medium text-black text-center">
                      SMKS Karya Guna Bhakti 2
                    </p>
                  </div>

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    {/* Username */}
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                        Username
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                          <User size={18} />
                        </span>
                        <input
                          id="username"
                          type="text"
                          autoComplete="username"
                          className="w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 bg-white/80 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                          placeholder="Masukkan username"
                          {...register('username')}
                        />
                      </div>
                      {errors.username && (
                        <p className="text-sm text-red-600 mt-1">{errors.username.message}</p>
                      )}
                    </div>

                    {/* Password */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                          Password
                        </label>
                        <a className="text-sm text-blue-700 hover:text-blue-800 hover:underline cursor-pointer">
                          Lupa Password?
                        </a>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                          <Lock size={18} />
                        </span>
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-white/80 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
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
                        <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
                      )}
                    </div>

                    {/* Tombol Login */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:bg-blue-700 transition disabled:opacity-60"
                    >
                      {isSubmitting ? 'Memproses...' : 'Masuk'}
                    </button>

                    {/* Daftar */}
                    <p className="text-center text-sm text-gray-700">
                      Belum punya akun?{' '}
                      <a href="/register" className="font-semibold text-blue-700 hover:text-blue-800 hover:underline">
                        Daftar di sini
                      </a>
                    </p>
                  </form>
                </div>
              </div>
            </div>

            <div className="hidden md:flex md:col-span-3 items-center justify-start">
              <div className="relative h-[520px] w-full max-w-3xl rounded-2xl overflow-hidden border border-white/40 shadow-xl">
                {activeDisplaySources.length > 0
                  ? activeDisplaySources.map((src, idx) => (
                      <img
                        key={`${src}-${idx}`}
                        src={src}
                        alt={activeDisplayItems[idx]?.description || 'Foto kegiatan'}
                        className="absolute inset-0 w-full h-full object-cover transition-opacity ease-in-out"
                        style={{ 
                          opacity: idx === displayedIndex ? 1 : 0,
                          zIndex: idx === displayedIndex ? 10 : 0,
                          transitionDuration: '700ms'
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
                          transitionDuration: '700ms'
                        }}
                      />
                    ))}
                <div className="absolute inset-0 z-20 bg-black/20" />
                {activeDisplaySources.length > 0 && (
                  <div className="absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-6 py-4">
                    <p className="text-sm text-white/90 text-center">
                      {currentSlideDescription || 'Kegiatan SMKS Karya Guna Bhakti 2'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full mt-6 mb-2">
            <p className="text-center text-white/90 text-base font-serif italic font-medium leading-relaxed drop-shadow-md max-w-4xl mx-auto">
              “Menjadi SMK yang Unggul dalam Membentuk Lulusan Berakhlak Mulia, 
              Kreatif, Kompeten, dan Berkarakter.”
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 pb-4">
          <p className="text-center text-white font-medium text-sm pt-2 pb-2 drop-shadow-md">
            © 2025 Sistem Integrasi Sekolah <span className="mx-2">|</span> SMKS Karya Guna Bhakti 2
          </p>
        </div>
      </div>
    </div>
  );
};
