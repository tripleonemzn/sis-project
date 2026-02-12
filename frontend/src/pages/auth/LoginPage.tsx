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

const formatPhotoDescription = (raw?: string) => {
  if (!raw) return '';
  const separator = '->';
  if (raw.includes(separator)) {
    const parts = raw.split(separator);
    return parts.slice(1).join(separator).trim();
  }
  return raw.trim();
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [gallery, setGallery] = useState<{ url: string; description: string }[]>([]);
  const assetBase = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const port = window.location.port;
    const host = window.location.hostname;
    if (port === '5173' || port === '4173') return `http://${host}:3000`;
    return '/api';
  }, []);
  const staticSources = useMemo(
    () => Array.from({ length: 20 }, (_, i) => `/foto_kegiatan/foto${i + 1}.jpeg`),
    [],
  );
  const gallerySources = useMemo(
    () =>
      gallery.map((item) => {
        if (item.url.startsWith('http')) return item.url;
        // Jika url mengarah ke foto_kegiatan (static asset frontend), jangan pakai assetBase (api)
        if (item.url.includes('foto_kegiatan')) {
          return item.url.startsWith('/') ? item.url : `/${item.url}`;
        }
        return `${assetBase}${item.url.startsWith('/') ? item.url : `/${item.url}`}`;
      }),
    [gallery, assetBase],
  );
  const activeSources = useMemo(
    () => (gallerySources.length > 0 ? gallerySources : staticSources),
    [gallerySources, staticSources],
  );

  // Gunakan slide berbasis gradien vektor elegan (bisa diganti gambar)
  const slides = useMemo(
    () => [
      'bg-gradient-to-br from-blue-400/70 via-sky-300/60 to-cyan-400/70',
      'bg-gradient-to-tr from-indigo-400/70 via-blue-300/60 to-sky-400/70',
      'bg-gradient-to-bl from-cyan-400/70 via-sky-300/60 to-blue-400/70',
    ],
    []
  );

  // Fetch gallery items from backend
  useEffect(() => {
    api
      .get<{ data: { url: string; description: string }[] }>('/public/foto-kegiatan')
      .then((res) => setGallery(res.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const length = activeSources.length > 0 ? activeSources.length : slides.length;
    let tid: number | undefined;
    let cancelled = false;
    
    const step = (current: number) => {
      const next = (current + 1) % length;
      // Gunakan delay tetap 3500ms untuk semua transisi
      const delay = 3500;
      
      tid = window.setTimeout(() => {
        if (cancelled) return;
        setActiveIndex(next);
        step(next);
      }, delay);
    };
    
    step(activeIndex);
    
    return () => {
      cancelled = true;
      if (tid) clearTimeout(tid);
    };
  }, [activeSources, slides]);
  
  // Preload images agar tidak delay saat transisi
  useEffect(() => {
    if (activeSources.length > 0) {
      activeSources.forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    }
  }, [activeSources]);

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
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/background_sis.png')" }}
      />
      {/* Overlay transparan agar konten tetap terbaca jelas */}
      <div className="absolute inset-0 bg-black/10" />

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
                {activeSources.length > 0
                  ? activeSources.map((src, idx) => (
                      <img
                        key={src}
                        src={src}
                        alt={gallery.length > 0 ? (gallery[idx]?.description || 'Foto kegiatan') : 'Foto kegiatan'}
                        className="absolute inset-0 w-full h-full object-cover transition-opacity ease-in-out"
                        style={{ 
                          opacity: idx === activeIndex ? 1 : 0,
                          zIndex: idx === activeIndex ? 10 : 0,
                          transitionDuration: '700ms'
                        }}
                        onError={(e) => {
                          const el = e.currentTarget;
                          el.style.display = 'none';
                        }}
                      />
                    ))
                  : slides.map((cls, idx) => (
                      <div
                        key={idx}
                        className={`absolute inset-0 transition-opacity ease-in-out ${cls}`}
                        style={{ 
                          opacity: idx === activeIndex ? 1 : 0,
                          zIndex: idx === activeIndex ? 10 : 0,
                          transitionDuration: '700ms'
                        }}
                      />
                    ))}
                <div className="absolute inset-0 bg-black/20" />
                {gallery.length > 0 && activeSources.length > 0 && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-6 py-4">
                    <p className="text-sm text-white/90 text-center">
                      {formatPhotoDescription(gallery[activeIndex]?.description)}
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
